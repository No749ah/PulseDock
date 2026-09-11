/**
 * Dependency Suppression unit tests.
 * Tests that alerts are suppressed when a parent monitor is down,
 * preventing alert storms when infrastructure dependencies fail.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChecksService } from './checks.service';
import type { Monitor } from '../types';

// ── Mock http runner to use globalThis.fetch ──────────────────────────────────
vi.mock('./runners/http.runner', async (importOriginal) => {
  const original = await importOriginal<typeof import('./runners/http.runner')>();
  return {
    ...original,
    runHttpCheck: async (_url: string, _timeoutMs = 5000) => {
      try {
        const response = await globalThis.fetch(_url);
        const latencyMs = 50;
        if (!response.ok) {
          return { ok: false, statusCode: response.status, latencyMs, message: `HTTP ${response.status}`, level: 'red' as const };
        }
        return { ok: true, statusCode: response.status, latencyMs, message: 'OK', level: 'green' as const };
      } catch (error) {
        return { ok: false, statusCode: 0, latencyMs: 0, message: error instanceof Error ? error.message : 'Request failed', level: 'red' as const };
      }
    },
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: 'mon-child',
    userId: 'user-1',
    name: 'Child Monitor',
    type: 'HTTP',
    target: 'https://example.com',
    enabled: true,
    intervalSec: 60,
    alertChannelIds: [],
    folderId: null,
    createdAt: new Date().toISOString(),
    timeoutMs: 5000,
    confirmations: 1,
    retryCount: 0,
    config: {},
    description: null,
    runbookUrl: null,
    slaTarget: null,
    slaPeriodDays: null,
    slaBreachAlertedAt: null,
    autoIncident: false,
    autoIncidentSeverity: 'MEDIUM',
    activeAutoIncidentId: null,
    isFlapping: false,
    flapDetectionEnabled: true,
    flapWindow: 10,
    flapThreshold: 0.5,
    flapAlertedAt: null,
    pausedUntil: null,
    mutedUntil: null,
    latencyAlertMs: null,
    anomalyDetection: false,
    anomalyMultiplier: 2.0,
    sliLatencyTarget: null,
    sliLatencyWindow: 7,
    scheduleEnabled: false,
    scheduleDays: '1,2,3,4,5',
    scheduleStartHour: 8,
    scheduleEndHour: 18,
    ...overrides,
  };
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-prev',
    userId: 'user-1',
    monitorId: 'mon-child',
    checkedAt: new Date('2026-01-01'),
    ok: true,
    status: 200,
    latencyMs: 100,
    message: 'OK',
    level: 'green',
    ...overrides,
  };
}

/**
 * Build a minimal Prisma mock with dependency-awareness.
 * - dependencies: what monitorDependency.findMany returns
 * - depLatestRuns: what monitorRun.findMany returns for the parent monitors (level check)
 * - previousRun: the last run of the child monitor (null = first run)
 */
function makePrisma(opts: {
  previousRun?: ReturnType<typeof makeRun> | null;
  dependencies?: Array<{ dependsOnId: string }>;
  depLatestRuns?: Array<{ monitorId: string; level: string }>;
} = {}) {
  const previousRun = opts.previousRun !== undefined ? opts.previousRun : null;
  const dependencies = opts.dependencies ?? [];
  const depLatestRuns = opts.depLatestRuns ?? [];

  return {
    monitorRun: {
      findFirst: vi.fn().mockResolvedValue(previousRun),
      findMany: vi.fn().mockImplementation((args: { where?: { monitorId?: unknown }; distinct?: string[] } = {}) => {
        // When querying for dependency monitor runs (array of IDs), return depLatestRuns
        if (args.where?.monitorId && typeof args.where.monitorId === 'object' && 'in' in (args.where.monitorId as object)) {
          return Promise.resolve(depLatestRuns);
        }
        // Otherwise return recent runs for flap detection (empty = no flap history)
        return Promise.resolve(previousRun ? [{ level: String(previousRun.level) }] : []);
      }),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'run-new',
          userId: data.userId,
          monitorId: data.monitorId,
          checkedAt: new Date(),
          ok: data.ok,
          status: data.status,
          latencyMs: data.latencyMs,
          message: data.message,
          level: data.level,
        }),
      ),
    },
    monitorDependency: {
      findMany: vi.fn().mockResolvedValue(dependencies),
    },
    incident: {
      create: vi.fn().mockResolvedValue({ id: 'inc-1', status: 'OPEN', title: '', severity: 'MEDIUM', userId: 'user-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    monitor: {
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function makeAlerts() {
  return { notifyMonitorFailure: vi.fn().mockResolvedValue(undefined) };
}

function makeRealtime() {
  return { monitorChecked: vi.fn(), statusPageUpdated: vi.fn() };
}

function makeService(opts: {
  prisma?: ReturnType<typeof makePrisma>;
  alerts?: ReturnType<typeof makeAlerts>;
} = {}) {
  const prisma = opts.prisma ?? makePrisma();
  const alerts = opts.alerts ?? makeAlerts();
  const realtime = makeRealtime();
  return { service: new ChecksService(prisma as never, alerts as never, undefined, undefined, realtime as never), prisma, alerts };
}

function mockFetch(ok: boolean, status = ok ? 200 : 500) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    headers: { get: () => 'text/plain' },
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({}),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Dependency Suppression — alert suppression when parent monitor is down', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('1. No suppression when monitor has no dependencies — alert fires normally', async () => {
    // No dependencies configured → alert should fire when monitor fails
    const prisma = makePrisma({
      previousRun: makeRun({ level: 'green' }),
      dependencies: [], // empty — no parents
      depLatestRuns: [],
    });
    const alerts = makeAlerts();
    const { service } = makeService({ prisma, alerts });

    globalThis.fetch = mockFetch(false, 500); // child is failing

    await service.runMonitor(makeMonitor());

    expect(alerts.notifyMonitorFailure).toHaveBeenCalledTimes(1);
  });

  it('2. Alert suppressed when parent dependency run level is outage (red)', async () => {
    // Parent dep is down (red) → child alert should be suppressed
    const prisma = makePrisma({
      previousRun: makeRun({ level: 'green' }),
      dependencies: [{ dependsOnId: 'mon-parent' }],
      depLatestRuns: [{ monitorId: 'mon-parent', level: 'red' }], // parent is down
    });
    const alerts = makeAlerts();
    const { service } = makeService({ prisma, alerts });

    globalThis.fetch = mockFetch(false, 500); // child is also failing

    await service.runMonitor(makeMonitor());

    // Alert should be suppressed because parent is in outage
    expect(alerts.notifyMonitorFailure).not.toHaveBeenCalled();
  });

  it('3. No suppression when parent dependency run level is ok (green)', async () => {
    // Parent dep is healthy → child alert should fire normally
    const prisma = makePrisma({
      previousRun: makeRun({ level: 'green' }),
      dependencies: [{ dependsOnId: 'mon-parent' }],
      depLatestRuns: [{ monitorId: 'mon-parent', level: 'green' }], // parent is healthy
    });
    const alerts = makeAlerts();
    const { service } = makeService({ prisma, alerts });

    globalThis.fetch = mockFetch(false, 500); // child is failing

    await service.runMonitor(makeMonitor());

    expect(alerts.notifyMonitorFailure).toHaveBeenCalledTimes(1);
  });

  it('4. No suppression when check level is ok (not a failure) — recovery alert fires', async () => {
    // Child was failing, now recovering — alerts should fire regardless of parent state
    const prisma = makePrisma({
      previousRun: makeRun({ level: 'red' }), // was failing
      dependencies: [{ dependsOnId: 'mon-parent' }],
      depLatestRuns: [{ monitorId: 'mon-parent', level: 'red' }], // parent is also down
    });
    const alerts = makeAlerts();
    const { service } = makeService({ prisma, alerts });

    globalThis.fetch = mockFetch(true, 200); // child is now healthy (recovery)

    await service.runMonitor(makeMonitor());

    // Recovery alert should fire — dependency suppression only applies to failure alerts
    expect(alerts.notifyMonitorFailure).toHaveBeenCalledTimes(1);
  });

  it('5. Multiple parents — alert suppressed if ANY parent is in outage', async () => {
    // Two parents: one is healthy, one is in outage → suppression should trigger
    const prisma = makePrisma({
      previousRun: makeRun({ level: 'green' }),
      dependencies: [
        { dependsOnId: 'mon-parent-a' },
        { dependsOnId: 'mon-parent-b' },
      ],
      depLatestRuns: [
        { monitorId: 'mon-parent-a', level: 'green' }, // healthy
        { monitorId: 'mon-parent-b', level: 'red' },   // in outage
      ],
    });
    const alerts = makeAlerts();
    const { service } = makeService({ prisma, alerts });

    globalThis.fetch = mockFetch(false, 500); // child is failing

    await service.runMonitor(makeMonitor());

    // Any parent down → suppress child alert
    expect(alerts.notifyMonitorFailure).not.toHaveBeenCalled();
  });

  it('6. No suppression when parent has no runs yet (null latest run — new monitor)', async () => {
    // Parent monitor has never run → no run data means we cannot confirm it is down → no suppression
    const prisma = makePrisma({
      previousRun: makeRun({ level: 'green' }),
      dependencies: [{ dependsOnId: 'mon-parent-new' }],
      depLatestRuns: [], // parent has no runs (findMany returns empty array)
    });
    const alerts = makeAlerts();
    const { service } = makeService({ prisma, alerts });

    globalThis.fetch = mockFetch(false, 500); // child is failing

    await service.runMonitor(makeMonitor());

    // No parent run data → cannot confirm parent is down → do not suppress
    expect(alerts.notifyMonitorFailure).toHaveBeenCalledTimes(1);
  });
});
