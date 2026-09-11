/**
 * Unit tests for monitor priority / criticality field.
 *
 * Covers: create (default), update (clamping), bulk edit, list/get mapping.
 */
import { describe, it, expect, vi } from 'vitest';
import { MonitorsCrudService } from './monitors-crud.service';
import type { ChecksService } from '../checks/checks.service';
import type { AuditService } from '../common/audit.service';
import type { RealtimeEvents } from '../realtime/realtime.events';
import type { VersionDetectionService } from './version-detection.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mon-1',
    userId: 'user-1',
    name: 'Test',
    description: null,
    runbookUrl: null,
    target: 'https://example.com',
    type: 'HTTP',
    intervalSec: 60,
    timeoutMs: 5000,
    confirmations: 1,
    retryCount: 0,
    priority: 0,
    enabled: true,
    folderId: null,
    slaTarget: null,
    slaPeriodDays: 30,
    sliLatencyTarget: null,
    sliLatencyWindow: 7,
    autoIncident: false,
    autoIncidentSeverity: 'MAJOR',
    notifyOn: 'ON_FAILURE',
    repeatIntervalMin: null,
    cronExpression: null,
    throttleMs: null,
    maxChecksPerHour: null,
    flapDetection: false,
    flapDetectionEnabled: false,
    flapWindow: 10,
    flapThreshold: 50,
    anomalyDetection: false,
    anomalyMultiplier: 3,
    latencyAlertMs: null,
    geoRegions: [],
    metricPath: null,
    metricName: null,
    metricUnit: null,
    metricAlertMin: null,
    metricAlertMax: null,
    detectChanges: false,
    contentHash: null,
    contentHashSetAt: null,
    detectContentChanges: false,
    rtoMinutes: null,
    statusWebhookUrl: null,
    statusWebhookSecret: null,
    downtimeCostPerHour: null,
    adaptiveIntervalDegradedSec: null,
    shareToken: null,
    pinned: false,
    muted: false,
    mutedUntil: null,
    graphqlQuery: null,
    graphqlVariables: null,
    graphqlDataPath: null,
    graphqlExpectedValue: null,
    headerAssertions: null,
    playbookId: null,
    configJson: {},
    scheduleEnabled: false,
    scheduleDays: null,
    scheduleStartHour: null,
    scheduleEndHour: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    runs: [],
    monitorAlerts: [],
    monitorTags: [],
    acknowledgements: [],
    ...overrides,
  };
}

function buildPrisma(monitorOverrides: Record<string, unknown> = {}) {
  const mon = makeMonitor(monitorOverrides);
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue([mon]),
      findFirst: vi.fn().mockResolvedValue(mon),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(makeMonitor({ ...data, id: 'new-mon' }))
      ),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(makeMonitor({ ...(typeof data === 'object' ? data : {}), id: 'mon-1' }))
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    monitorAlert: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    monitorTag: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    monitorConfigChange: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    monitorDependency: { findMany: vi.fn().mockResolvedValue([]) },
    incident: { count: vi.fn().mockResolvedValue(0) },
    incidentMonitor: { groupBy: vi.fn().mockResolvedValue([]) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    tag: { upsert: vi.fn().mockResolvedValue({ id: 'tag-1' }) },
  };
}

function makeService(prisma: object) {
  return new (MonitorsCrudService as unknown as new (...args: unknown[]) => MonitorsCrudService)(
    prisma as never,
    { listPlugins: vi.fn().mockReturnValue([]), runMonitor: vi.fn() } as unknown as ChecksService,
    { log: vi.fn() } as unknown as AuditService,
    {
      monitorCreated: vi.fn(),
      monitorUpdated: vi.fn(),
      monitorDeleted: vi.fn(),
    } as unknown as RealtimeEvents,
    {} as unknown as VersionDetectionService,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Monitor priority field', () => {
  // ── 1. Defaults to 0 (unset) ────────────────────────────────────────────────
  it('defaults to 0 (unset) when not provided on create', async () => {
    const prisma = buildPrisma();
    const svc = makeService(prisma);

    await svc.create('user-1', {
      name: 'Test',
      target: 'https://example.com',
      type: 'HTTP',
    });

    const createCall = (prisma as ReturnType<typeof buildPrisma>).monitor.create.mock.calls[0][0];
    expect(createCall.data.priority).toBe(0);
  });

  // ── 2. Stores provided priority on create ───────────────────────────────────
  it('passes priority=2 (P2 high) through on create', async () => {
    const prisma = buildPrisma();
    const svc = makeService(prisma);

    await svc.create('user-1', {
      name: 'Critical',
      target: 'https://critical.example.com',
      type: 'HTTP',
      priority: 2,
    });

    const createCall = (prisma as ReturnType<typeof buildPrisma>).monitor.create.mock.calls[0][0];
    expect(createCall.data.priority).toBe(2);
  });

  // ── 3. Clamps priority to max 4 on create ───────────────────────────────────
  it('clamps priority to 4 when given 99 on create', async () => {
    const prisma = buildPrisma();
    const svc = makeService(prisma);

    await svc.create('user-1', {
      name: 'Test',
      target: 'https://example.com',
      type: 'HTTP',
      priority: 99,
    });

    const createCall = (prisma as ReturnType<typeof buildPrisma>).monitor.create.mock.calls[0][0];
    expect(createCall.data.priority).toBe(4);
  });

  // ── 4. Updates priority via update() ────────────────────────────────────────
  it('sets priority=1 (P1 critical) in monitor update call', async () => {
    const prisma = buildPrisma();
    const svc = makeService(prisma);

    await svc.update('mon-1', 'user-1', { priority: 1 });

    const updateCall = (prisma as ReturnType<typeof buildPrisma>).monitor.update.mock.calls[0][0];
    expect(updateCall.data.priority).toBe(1);
  });

  // ── 5. Clamps priority to min 0 on update ───────────────────────────────────
  it('clamps priority to 0 when given -5 on update', async () => {
    const prisma = buildPrisma();
    const svc = makeService(prisma);

    await svc.update('mon-1', 'user-1', { priority: -5 });

    const updateCall = (prisma as ReturnType<typeof buildPrisma>).monitor.update.mock.calls[0][0];
    expect(updateCall.data.priority).toBe(0);
  });

  // ── 6. BulkEdit applies priority to all owned monitors ──────────────────────
  it('bulk edit sets priority for all owned monitors', async () => {
    const prisma = buildPrisma();
    (prisma as ReturnType<typeof buildPrisma>).monitor.findMany = vi.fn().mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
    (prisma as ReturnType<typeof buildPrisma>).monitor.updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const svc = makeService(prisma);

    const result = await svc.bulkEdit('user-1', {
      ids: ['m1', 'm2'],
      priority: 1,
    });

    expect(result.affected).toBe(2);
    const updateManyCall = (prisma as ReturnType<typeof buildPrisma>).monitor.updateMany.mock.calls[0][0];
    expect((updateManyCall.data as Record<string, unknown>).priority).toBe(1);
  });

  // ── 7. list() maps priority field in output ─────────────────────────────────
  it('list() includes priority in mapped monitor output', async () => {
    const prisma = buildPrisma({ priority: 3 });
    const svc = makeService(prisma);

    const result = await svc.list('user-1');
    expect(result[0].priority).toBe(3);
  });

  // ── 8. getOne() maps priority field in output ───────────────────────────────
  it('getOne() includes priority in detail output', async () => {
    const prisma = buildPrisma({ priority: 2 });
    const svc = makeService(prisma);

    const result = await svc.getOne('user-1', 'mon-1');
    expect(result.priority).toBe(2);
  });

  // ── 9. bulkEdit clamps priority to max 4 ────────────────────────────────────
  it('bulk edit clamps priority to max 4', async () => {
    const prisma = buildPrisma();
    (prisma as ReturnType<typeof buildPrisma>).monitor.findMany = vi.fn().mockResolvedValue([{ id: 'm1' }]);
    const svc = makeService(prisma);

    await svc.bulkEdit('user-1', { ids: ['m1'], priority: 10 });

    const updateManyCall = (prisma as ReturnType<typeof buildPrisma>).monitor.updateMany.mock.calls[0][0];
    expect((updateManyCall.data as Record<string, unknown>).priority).toBe(4);
  });
});
