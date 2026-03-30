import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorsSlaService } from './monitors-sla.service';

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

function makeRuns(total: number, failedCount: number, baseDate = new Date(Date.now() - 60_000), monitorId = 'monitor-1') {
  return Array.from({ length: total }, (_, i) => ({
    monitorId,
    ok: i >= failedCount,
    checkedAt: new Date(baseDate.getTime() - i * 60_000),
    latencyMs: null,
  }));
}

function makePrisma(monitors: ReturnType<typeof makeMonitor>[] = [makeMonitor()]) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitors),
      findFirst: vi.fn().mockResolvedValue(monitors[0] ?? null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    monitorAlert: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    monitorTag: { deleteMany: vi.fn(), create: vi.fn() },
    tag: { upsert: vi.fn().mockResolvedValue({ id: 'tag-1', name: 'v8', color: '#6366f1' }) },
    alertChannel: { findFirst: vi.fn().mockResolvedValue(null) },
    maintenanceWindow: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      delete: vi.fn(),
    },
    monitorEvent: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      delete: vi.fn(),
    },
    monitorRunRollup: { findMany: vi.fn().mockResolvedValue([]) },
    alertAcknowledgement: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new (MonitorsSlaService as unknown as new (...args: unknown[]) => MonitorsSlaService)(prisma as any);
}

describe('MonitorsService - slaDashboard', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: MonitorsSlaService;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('returns compliant=true for monitor with uptimePct > slaTarget', async () => {
    const monitor = makeMonitor({ id: 'mon-1', slaTarget: 99.9 });
    prisma.monitor.findMany.mockResolvedValue([monitor]);
    // 1000 runs, 0 failed → 100% uptime (batch query returns all runs with monitorId)
    const base = new Date(Date.now() - 3_600_000); // 1h ago to avoid race with `now`
    prisma.monitorRun.findMany.mockResolvedValue(makeRuns(1000, 0, base, 'mon-1'));

    const result = await service.slaDashboard('user-1');
    expect(result.monitors).toHaveLength(1);
    expect(result.monitors[0].compliant).toBe(true);
    expect(result.monitors[0].uptimePct).toBeGreaterThanOrEqual(99.9);
  });

  it('returns compliant=false for monitor with uptimePct < slaTarget', async () => {
    const monitor = makeMonitor({ id: 'mon-1', slaTarget: 99.9 });
    prisma.monitor.findMany.mockResolvedValue([monitor]);
    // 1000 runs, 5 failed → 99.5% uptime < 99.9% target
    const base = new Date(Date.now() - 3_600_000);
    prisma.monitorRun.findMany.mockResolvedValue(makeRuns(1000, 5, base, 'mon-1'));

    const result = await service.slaDashboard('user-1');
    expect(result.monitors[0].compliant).toBe(false);
    expect(result.monitors[0].uptimePct).toBeLessThan(99.9);
  });

  it('returns null compliant and null budgets for monitor with no slaTarget', async () => {
    const monitor = makeMonitor({ id: 'mon-1', slaTarget: null });
    prisma.monitor.findMany.mockResolvedValue([monitor]);
    const base = new Date(Date.now() - 3_600_000);
    prisma.monitorRun.findMany.mockResolvedValue(makeRuns(100, 5, base, 'mon-1'));

    const result = await service.slaDashboard('user-1');
    expect(result.monitors[0].slaTarget).toBeNull();
    expect(result.monitors[0].compliant).toBeNull();
    expect(result.monitors[0].errorBudgetUsedPct).toBeNull();
    expect(result.monitors[0].budgetRemainingPct).toBeNull();
  });

  it('computes errorBudgetUsedPct correctly (99.0% uptime vs 99.9% target → ~90% budget used)', async () => {
    const monitor = makeMonitor({ id: 'mon-1', slaTarget: 99.9 });
    prisma.monitor.findMany.mockResolvedValue([monitor]);
    // 1000 runs, 10 failed → exactly 99.0% uptime
    const base = new Date(Date.now() - 3_600_000);
    prisma.monitorRun.findMany.mockResolvedValue(makeRuns(1000, 10, base, 'mon-1'));

    const result = await service.slaDashboard('user-1');
    const m = result.monitors[0];

    // uptimePct = (990/1000)*100 = 99.0%
    expect(m.uptimePct).toBeCloseTo(99.0, 1);

    // errorBudgetUsedPct = (100 - 99.0) / (100 - 99.9) * 100 = 1.0 / 0.1 * 100 = 1000 → clamped to 100
    // Actually 1.0/0.1 = 10 → 1000% clamped to 100%
    expect(m.errorBudgetUsedPct).toBe(100);
    expect(m.budgetRemainingPct).toBe(0);
  });

  it('summary counts (compliant/atRisk/breached/noTarget) are correct', async () => {
    // 4 monitors: one compliant (> target + 0.1%), one at risk (within 0.05%), one breached, one no target
    const monitors = [
      makeMonitor({ id: 'm1', slaTarget: 99.0, name: 'Compliant' }),
      makeMonitor({ id: 'm2', slaTarget: 99.9, name: 'AtRisk' }),
      makeMonitor({ id: 'm3', slaTarget: 99.9, name: 'Breached' }),
      makeMonitor({ id: 'm4', slaTarget: null, name: 'NoTarget' }),
    ];
    prisma.monitor.findMany.mockResolvedValue(monitors);

    // Batch query returns all runs for all monitors combined
    const base = new Date(Date.now() - 3_600_000);
    prisma.monitorRun.findMany.mockResolvedValue([
      ...makeRuns(1000, 0, base, 'm1'),   // 100% → compliant (100 - 99.0 = 1.0 >= 0.1)
      ...makeRuns(2000, 1, base, 'm2'),   // 99.95% → at risk (99.95 - 99.9 = 0.05 < 0.1)
      ...makeRuns(1000, 5, base, 'm3'),   // 99.5% → breached
      ...makeRuns(100, 3, base, 'm4'),    // no target
    ]);

    const result = await service.slaDashboard('user-1');
    expect(result.summary.totalMonitors).toBe(4);
    expect(result.summary.compliant).toBe(1);
    expect(result.summary.atRisk).toBe(1);
    expect(result.summary.breached).toBe(1);
    expect(result.summary.noTarget).toBe(1);
  });
});
