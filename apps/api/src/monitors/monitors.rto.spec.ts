import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsService } from './monitors.service';

function makeMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'monitor-1',
    userId: 'user-1',
    name: 'Test Monitor',
    type: 'HTTP',
    target: 'https://example.com/health',
    intervalSec: 60,
    timeoutMs: 5000,
    confirmations: 1,
    configJson: null,
    enabled: true,
    slaTarget: 99.9,
    slaPeriodDays: 30,
    sliLatencyTarget: null,
    sliLatencyWindow: 7,
    rtoMinutes: null,
    slaBreachAlertedAt: null,
    slaBurnRateAlertedAt: null,
    folderId: null,
    description: null,
    runbookUrl: null,
    autoIncident: false,
    autoIncidentSeverity: 'MEDIUM',
    activeAutoIncidentId: null,
    isFlapping: false,
    flapDetectionEnabled: true,
    flapAlertedAt: null,
    mutedUntil: null,
    anomalyDetection: false,
    anomalyMultiplier: 2.0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    monitorAlerts: [],
    monitorTags: [],
    ...overrides,
  };
}

/**
 * Build a sequence of monitor runs that simulates incidents.
 * Each "incident" is a run of consecutive failures, separated by ok=true runs.
 *
 * @param incidents Array of { failCount, gapOkCount, intervalMs } for each outage
 * @param finalOk Whether to end with an ok run
 */
function buildRunsWithIncidents(
  incidents: Array<{ failCount: number; gapOkCount: number; intervalMs: number }>,
  finalOk = true,
): Array<{ ok: boolean; checkedAt: Date; latencyMs: number | null }> {
  const runs: Array<{ ok: boolean; checkedAt: Date; latencyMs: number | null }> = [];
  let t = Date.now() - 30 * 86400_000;

  for (const inc of incidents) {
    // Gap of ok runs before the incident
    for (let i = 0; i < inc.gapOkCount; i++) {
      runs.push({ ok: true, checkedAt: new Date(t), latencyMs: 100 });
      t += inc.intervalMs;
    }
    // The incident (consecutive failures)
    for (let i = 0; i < inc.failCount; i++) {
      runs.push({ ok: false, checkedAt: new Date(t), latencyMs: null });
      t += inc.intervalMs;
    }
  }

  if (finalOk) {
    runs.push({ ok: true, checkedAt: new Date(t), latencyMs: 100 });
  }

  return runs;
}

function makePrisma(monitor: ReturnType<typeof makeMonitor> | null = makeMonitor()) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitor ? [monitor] : []),
      findFirst: vi.fn().mockResolvedValue(monitor),
      create: vi.fn().mockResolvedValue(monitor),
      update: vi.fn().mockResolvedValue(monitor),
      delete: vi.fn().mockResolvedValue(monitor),
      count: vi.fn().mockResolvedValue(0),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    monitorAlert: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn(), update: vi.fn() },
    monitorTag: { deleteMany: vi.fn(), create: vi.fn() },
    tag: { upsert: vi.fn().mockResolvedValue({ id: 'tag-1', name: 'v8', color: '#6366f1' }) },
    alertChannel: { findFirst: vi.fn().mockResolvedValue(null) },
    maintenanceWindow: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), delete: vi.fn() },
    monitorEvent: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), delete: vi.fn() },
    monitorRunRollup: { findMany: vi.fn().mockResolvedValue([]) },
    alertAcknowledgement: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new MonitorsService(
    prisma as any,
    { run: vi.fn(), runMonitor: vi.fn(), listPlugins: vi.fn().mockReturnValue([]) } as any,
    { log: vi.fn() } as any,
    { monitorCreated: vi.fn(), monitorUpdated: vi.fn(), monitorDeleted: vi.fn() } as any,
    { testVersionConnection: vi.fn(), discoverCurrentVersion: vi.fn(), versionSummary: vi.fn() } as any,
  );
}

describe('MonitorsService - monitorUptime() RTO fields', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: MonitorsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('1. returns rtoMinutes: null when rtoMinutes not set on monitor', async () => {
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ rtoMinutes: null }));
    prisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await service.monitorUptime('user-1', 'monitor-1', '30d');

    expect(result.rtoMinutes).toBeNull();
    expect(result.rtoCompliancePct).toBeNull();
  });

  it('2. returns rtoBreaches: 0, rtoCompliant: 0 when rtoMinutes is set but no incidents', async () => {
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ rtoMinutes: 15 }));
    // All ok runs — no incidents
    const runs = Array.from({ length: 50 }, (_, i) => ({
      ok: true,
      checkedAt: new Date(Date.now() - i * 60_000),
      latencyMs: 100,
    }));
    prisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await service.monitorUptime('user-1', 'monitor-1', '30d');

    expect(result.rtoMinutes).toBe(15);
    expect(result.rtoBreaches).toBe(0);
    expect(result.rtoCompliant).toBe(0);
    expect(result.rtoCompliancePct).toBeNull(); // null because no incidents to measure
  });

  it('3. returns correct breach count when incident duration > rtoMinutes', async () => {
    // RTO = 10 min; create an incident that lasts 20 minutes (21 failed checks @ 1min interval)
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ rtoMinutes: 10 }));

    const runs = buildRunsWithIncidents([
      { failCount: 21, gapOkCount: 5, intervalMs: 60_000 }, // 20-min incident → breach
    ]);
    prisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await service.monitorUptime('user-1', 'monitor-1', '30d');

    expect(result.rtoMinutes).toBe(10);
    expect(result.rtoBreaches).toBe(1);
    expect(result.rtoCompliant).toBe(0);
    expect(result.rtoCompliancePct).toBe(0);
  });

  it('4. returns correct compliant count when incident duration < rtoMinutes', async () => {
    // RTO = 30 min; create an incident that lasts 5 minutes (6 failed checks @ 1min interval)
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ rtoMinutes: 30 }));

    const runs = buildRunsWithIncidents([
      { failCount: 6, gapOkCount: 5, intervalMs: 60_000 }, // 5-min incident → compliant
    ]);
    prisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await service.monitorUptime('user-1', 'monitor-1', '30d');

    expect(result.rtoMinutes).toBe(30);
    expect(result.rtoBreaches).toBe(0);
    expect(result.rtoCompliant).toBe(1);
    expect(result.rtoCompliancePct).toBe(100);
  });

  it('5. handles mix of breached + compliant incidents correctly', async () => {
    // RTO = 15 min
    // Incident A: 5 min (compliant), Incident B: 20 min (breach)
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ rtoMinutes: 15 }));

    const runs = buildRunsWithIncidents([
      { failCount: 6, gapOkCount: 10, intervalMs: 60_000 },  // ~5 min → compliant
      { failCount: 21, gapOkCount: 10, intervalMs: 60_000 }, // ~20 min → breach
    ]);
    prisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await service.monitorUptime('user-1', 'monitor-1', '30d');

    expect(result.rtoMinutes).toBe(15);
    expect(result.rtoBreaches).toBe(1);
    expect(result.rtoCompliant).toBe(1);
    expect(result.rtoCompliancePct).toBe(50); // 1/2 = 50%
  });

  it('6. rtoCompliancePct is null when rtoMinutes is null (no target configured)', async () => {
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ rtoMinutes: null }));

    const runs = buildRunsWithIncidents([
      { failCount: 10, gapOkCount: 5, intervalMs: 60_000 },
    ]);
    prisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await service.monitorUptime('user-1', 'monitor-1', '30d');

    expect(result.rtoMinutes).toBeNull();
    expect(result.rtoCompliancePct).toBeNull();
  });

  it('throws NotFoundException for unknown monitor', async () => {
    prisma.monitor.findFirst.mockResolvedValue(null);
    await expect(service.monitorUptime('user-1', 'no-such-id', '30d')).rejects.toThrow(NotFoundException);
  });
});
