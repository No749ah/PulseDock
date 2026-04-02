/**
 * Unit tests for MonitorsAnalyticsService.
 *
 * All Prisma interactions are mocked — no database required.
 * Tests cover:
 *   - fleetHealthReport: scoring, tiers, at-risk, coverage gaps
 *   - monitorTrends: uptime/latency delta, trend direction
 *   - monitorCorrelation: Jaccard similarity, empty state
 *   - detectAnomalies: uptime drop, latency regression, flapping detection
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorsAnalyticsService } from './monitors-analytics.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mon-1',
    name: 'API Monitor',
    type: 'HTTP',
    enabled: true,
    slaTarget: null,
    description: null,
    monitorAlerts: [],
    folderId: null,
    folder: null,
    ...overrides,
  };
}

function makeRun(overrides: Partial<{ monitorId: string; ok: boolean; checkedAt: Date; latencyMs: number | null; level: string }> = {}) {
  return {
    monitorId: 'mon-1',
    ok: true,
    checkedAt: new Date(),
    latencyMs: 100,
    level: 'green',
    ...overrides,
  };
}

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86_400_000);
}

// ─── Mocked PrismaService ─────────────────────────────────────────────────────

const mockPrisma = {
  monitor: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  monitorRun: {
    findMany: vi.fn(),
  },
  incident: {
    findMany: vi.fn(),
  },
};

function makeSvc(): MonitorsAnalyticsService {
  return new MonitorsAnalyticsService(mockPrisma as never);
}

// ─── fleetHealthReport ────────────────────────────────────────────────────────

describe('MonitorsAnalyticsService.fleetHealthReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns fleet score 100 when no enabled monitors', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await makeSvc().fleetHealthReport('user-1');

    expect(result.fleetScore).toBe(100);
    expect(result.summary.total).toBe(0);
  });

  it('correctly separates enabled/disabled in summary', async () => {
    const monitors = [
      makeMonitor({ id: 'mon-1', enabled: true }),
      makeMonitor({ id: 'mon-2', enabled: false }),
    ];
    mockPrisma.monitor.findMany.mockResolvedValue(monitors);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await makeSvc().fleetHealthReport('user-1');

    expect(result.summary.total).toBe(2);
    expect(result.summary.enabled).toBe(1);
  });

  it('places monitor in elite tier when all runs pass', async () => {
    const monitor = makeMonitor();
    mockPrisma.monitor.findMany.mockResolvedValue([monitor]);
    const runs = Array.from({ length: 100 }, () => makeRun({ ok: true }));
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await makeSvc().fleetHealthReport('user-1');

    const elite = result.reliabilityTiers.find((t) => t.tier === 'elite');
    expect(elite?.count).toBeGreaterThanOrEqual(1);
  });

  it('places monitor in critical tier when uptime < 90%', async () => {
    const monitor = makeMonitor();
    mockPrisma.monitor.findMany.mockResolvedValue([monitor]);
    // 5 ok, 95 fail = 5% uptime
    const runs = [
      ...Array.from({ length: 5 }, () => makeRun({ ok: true })),
      ...Array.from({ length: 95 }, () => makeRun({ ok: false })),
    ];
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await makeSvc().fleetHealthReport('user-1');

    const critical = result.reliabilityTiers.find((t) => t.tier === 'critical');
    expect(critical?.count).toBeGreaterThanOrEqual(1);
  });

  it('identifies at-risk monitors with down status', async () => {
    const monitor = makeMonitor();
    mockPrisma.monitor.findMany.mockResolvedValue([monitor]);
    // All failures
    const runs = Array.from({ length: 10 }, () => makeRun({ ok: false }));
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await makeSvc().fleetHealthReport('user-1');

    expect(result.atRisk.some((r) => r.id === 'mon-1')).toBe(true);
    expect(result.atRisk[0].severity).toBe('critical');
  });

  it('computes coverage gaps correctly', async () => {
    const monitors = [
      makeMonitor({ id: 'mon-1', monitorAlerts: [], slaTarget: null, description: null }),
      makeMonitor({ id: 'mon-2', monitorAlerts: [{ monitorId: 'mon-2' }], slaTarget: 99.9, description: 'Has desc' }),
    ];
    mockPrisma.monitor.findMany.mockResolvedValue(monitors);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await makeSvc().fleetHealthReport('user-1');

    expect(result.coverageGaps.noAlertChannel).toBe(1);
    expect(result.coverageGaps.noSlaTarget).toBe(1);
    expect(result.coverageGaps.noDescription).toBe(1);
  });

  it('generates incident velocity breakdown', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([makeMonitor()]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([
      { createdAt: daysAgo(3) },
      { createdAt: daysAgo(10) },
    ]);

    const result = await makeSvc().fleetHealthReport('user-1');

    expect(result.incidentVelocity.last7d).toBe(1);
    expect(result.incidentVelocity.last30d).toBe(2);
  });

  it('computes type distribution', async () => {
    const monitors = [
      makeMonitor({ id: 'mon-1', type: 'HTTP' }),
      makeMonitor({ id: 'mon-2', type: 'HTTP' }),
      makeMonitor({ id: 'mon-3', type: 'TCP' }),
    ];
    mockPrisma.monitor.findMany.mockResolvedValue(monitors);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await makeSvc().fleetHealthReport('user-1');

    const http = result.typeDistribution.find((t) => t.type === 'HTTP');
    expect(http?.count).toBe(2);
  });
});

// ─── monitorTrends ────────────────────────────────────────────────────────────

describe('MonitorsAnalyticsService.monitorTrends', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty monitors list when user has no monitors', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);

    const result = await makeSvc().monitorTrends('user-1');

    expect(result.monitors).toHaveLength(0);
  });

  it('returns "new" trend when no previous data exists', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([makeMonitor()]);

    // Only current runs (last 7d), no previous
    const runs = Array.from({ length: 10 }, () =>
      makeRun({ checkedAt: new Date(Date.now() - 1 * 86_400_000) }),
    );
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await makeSvc().monitorTrends('user-1');

    expect(result.monitors[0].uptimeTrend).toBe('new');
  });

  it('detects improving trend when uptime increases by >2%', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([makeMonitor()]);

    // Current: 100% uptime (last 7d)
    const currentRuns = Array.from({ length: 10 }, () =>
      makeRun({ ok: true, checkedAt: new Date(Date.now() - 1 * 86_400_000) }),
    );
    // Previous: 50% uptime (8–14d ago)
    const previousRuns = [
      ...Array.from({ length: 5 }, () => makeRun({ ok: true, checkedAt: daysAgo(10) })),
      ...Array.from({ length: 5 }, () => makeRun({ ok: false, checkedAt: daysAgo(10) })),
    ];
    mockPrisma.monitorRun.findMany.mockResolvedValue([...currentRuns, ...previousRuns]);

    const result = await makeSvc().monitorTrends('user-1');

    expect(result.monitors[0].uptimeTrend).toBe('improving');
  });

  it('detects degrading trend when uptime drops by >2%', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([makeMonitor()]);

    // Current: 50% uptime (last 7d)
    const currentRuns = [
      ...Array.from({ length: 5 }, () => makeRun({ ok: true, checkedAt: daysAgo(1) })),
      ...Array.from({ length: 5 }, () => makeRun({ ok: false, checkedAt: daysAgo(1) })),
    ];
    // Previous: 100% uptime (8–14d ago)
    const previousRuns = Array.from({ length: 10 }, () =>
      makeRun({ ok: true, checkedAt: daysAgo(10) }),
    );
    mockPrisma.monitorRun.findMany.mockResolvedValue([...currentRuns, ...previousRuns]);

    const result = await makeSvc().monitorTrends('user-1');

    expect(result.monitors[0].uptimeTrend).toBe('degrading');
  });

  it('detects stable trend when uptime change is within ±2%', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([makeMonitor()]);

    // Current: 99% uptime (last 7d)
    const currentRuns = [
      ...Array.from({ length: 99 }, () => makeRun({ ok: true, checkedAt: daysAgo(1) })),
      makeRun({ ok: false, checkedAt: daysAgo(1) }),
    ];
    // Previous: 99% uptime (8–14d ago)
    const previousRuns = [
      ...Array.from({ length: 99 }, () => makeRun({ ok: true, checkedAt: daysAgo(10) })),
      makeRun({ ok: false, checkedAt: daysAgo(10) }),
    ];
    mockPrisma.monitorRun.findMany.mockResolvedValue([...currentRuns, ...previousRuns]);

    const result = await makeSvc().monitorTrends('user-1');

    expect(result.monitors[0].uptimeTrend).toBe('stable');
  });

  it('includes generatedAt timestamp', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([makeMonitor()]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await makeSvc().monitorTrends('user-1');

    expect(result.generatedAt).toBeTruthy();
    expect(new Date(result.generatedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });
});

// ─── monitorCorrelation ───────────────────────────────────────────────────────

describe('MonitorsAnalyticsService.monitorCorrelation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty pairs when fewer than 2 monitors', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([makeMonitor()]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await makeSvc().monitorCorrelation('user-1', 7);

    expect(result.pairs).toHaveLength(0);
    expect(result.groups).toHaveLength(0);
  });

  it('returns empty pairs when monitors have no failure windows', async () => {
    const monitors = [
      makeMonitor({ id: 'mon-1' }),
      makeMonitor({ id: 'mon-2' }),
    ];
    mockPrisma.monitor.findMany.mockResolvedValue(monitors);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]); // no failures

    const result = await makeSvc().monitorCorrelation('user-1', 7);

    expect(result.pairs).toHaveLength(0);
  });

  it('computes high similarity when monitors fail together', async () => {
    const monitors = [
      makeMonitor({ id: 'mon-1' }),
      makeMonitor({ id: 'mon-2' }),
    ];
    mockPrisma.monitor.findMany.mockResolvedValue(monitors);

    const now = Date.now();
    const BUCKET = 5 * 60 * 1000;
    // Both fail in the same 5-minute bucket
    const sharedTime = new Date(Math.floor(now / BUCKET) * BUCKET - BUCKET);
    const runs = [
      { monitorId: 'mon-1', checkedAt: sharedTime, level: 'red' },
      { monitorId: 'mon-2', checkedAt: sharedTime, level: 'red' },
    ];
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await makeSvc().monitorCorrelation('user-1', 7);

    expect(result.pairs[0].similarity).toBe(1);
  });

  it('clamps days to 1–90 range', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    // 0 days should not throw
    await expect(makeSvc().monitorCorrelation('user-1', 0)).resolves.toBeDefined();
    // 999 days should not throw
    await expect(makeSvc().monitorCorrelation('user-1', 999)).resolves.toBeDefined();
  });

  it('returns monitor list in result', async () => {
    const monitors = [
      makeMonitor({ id: 'mon-1', name: 'Alpha' }),
      makeMonitor({ id: 'mon-2', name: 'Beta' }),
    ];
    mockPrisma.monitor.findMany.mockResolvedValue(monitors);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await makeSvc().monitorCorrelation('user-1', 7);

    expect(result.monitors).toHaveLength(2);
    expect(result.monitors[0].name).toBe('Alpha');
  });
});

// ─── anomalyReport ────────────────────────────────────────────────────────────

describe('MonitorsAnalyticsService.anomalyReport', () => {
  beforeEach(() => vi.clearAllMocks());

  function hoursAgo(h: number): Date {
    return new Date(Date.now() - h * 3_600_000);
  }

  it('returns empty anomalies list when no monitors exist', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);

    const result = await makeSvc().anomalyReport('user-1', 24);

    expect(result.anomalies).toHaveLength(0);
    expect(result.totalMonitors).toBe(0);
  });

  it('detects uptime regression when uptime falls significantly', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([makeMonitor()]);

    // Previous period (24–48h ago): 100% uptime
    const previousRuns = Array.from({ length: 50 }, () =>
      makeRun({ ok: true, checkedAt: hoursAgo(36) }),
    );
    // Current period (0–24h ago): 60% uptime — large drop
    const currentRuns = [
      ...Array.from({ length: 30 }, () => makeRun({ ok: true, checkedAt: hoursAgo(12) })),
      ...Array.from({ length: 20 }, () => makeRun({ ok: false, checkedAt: hoursAgo(12) })),
    ];
    mockPrisma.monitorRun.findMany.mockResolvedValue([...previousRuns, ...currentRuns]);

    const result = await makeSvc().anomalyReport('user-1', 24);

    const hasUptimeRegression = result.anomalies.some((a) =>
      a.anomalyTypes.includes('uptime_regression'),
    );
    expect(hasUptimeRegression).toBe(true);
  });

  it('detects latency regression anomaly', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([makeMonitor()]);

    // Previous: low latency (24–48h ago)
    const previousRuns = Array.from({ length: 20 }, () =>
      makeRun({ ok: true, latencyMs: 100, checkedAt: hoursAgo(36) }),
    );
    // Current: high latency (0–24h ago, >25% increase)
    const currentRuns = Array.from({ length: 20 }, () =>
      makeRun({ ok: true, latencyMs: 500, checkedAt: hoursAgo(12) }),
    );
    mockPrisma.monitorRun.findMany.mockResolvedValue([...previousRuns, ...currentRuns]);

    const result = await makeSvc().anomalyReport('user-1', 24);

    const hasLatencyRegression = result.anomalies.some((a) =>
      a.anomalyTypes.includes('latency_regression'),
    );
    expect(hasLatencyRegression).toBe(true);
  });

  it('detects flapping anomaly with rapid status changes', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([makeMonitor()]);

    // Alternating ok/fail in current period (0–24h ago)
    const currentRuns = Array.from({ length: 30 }, (_, i) =>
      makeRun({ ok: i % 2 === 0, checkedAt: hoursAgo(12) }),
    );
    mockPrisma.monitorRun.findMany.mockResolvedValue(currentRuns);

    const result = await makeSvc().anomalyReport('user-1', 24);

    const hasFlapping = result.anomalies.some((a) => a.anomalyTypes.includes('flapping'));
    expect(hasFlapping).toBe(true);
  });

  it('returns empty anomalies list for stable monitors', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([makeMonitor()]);

    // Both periods: 100% uptime, stable latency
    const allRuns = [
      ...Array.from({ length: 30 }, () => makeRun({ ok: true, latencyMs: 100, checkedAt: hoursAgo(36) })),
      ...Array.from({ length: 30 }, () => makeRun({ ok: true, latencyMs: 105, checkedAt: hoursAgo(12) })),
    ];
    mockPrisma.monitorRun.findMany.mockResolvedValue(allRuns);

    const result = await makeSvc().anomalyReport('user-1', 24);

    expect(result.anomalies).toHaveLength(0);
  });
});
