import { describe, it, expect, vi } from 'vitest';
import { resolvePerformanceWidget } from './performance.resolver';
import type { Widget } from '../status-pages.types';

function makeWidget(type: string, config: Record<string, unknown> = {}): Widget {
  return { id: `w-${type}`, type: type as Widget['type'], x: 0, y: 0, w: 4, h: 2, config };
}

const noopCache = {} as never;
const userId = 'user-1';
const monitorId = 'mon-1';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    monitor: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as any;
}

function makeRun(latencyMs: number | null, level: 'green' | 'red' = 'green', offsetMs = 0) {
  return { checkedAt: new Date(Date.now() - offsetMs), latencyMs, level };
}

// ── response-time-chart ───────────────────────────────────────────────────────

describe('performance resolver — response-time-chart', () => {
  it('returns _noConfig when no monitorId', async () => {
    const prisma = makePrisma();
    const result = await resolvePerformanceWidget(prisma, noopCache, userId, makeWidget('response-time-chart'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns empty data when no runs', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('response-time-chart', { monitorId }), undefined,
    );
    expect(result.dataPoints).toHaveLength(0);
    expect(result.avgMs).toBeNull();
    expect(result.p95Ms).toBeNull();
    expect(result.maxMs).toBeNull();
    expect(result.fetchedAt).toBeDefined();
  });

  it('calculates avg, p95, max from run latencies', async () => {
    const runs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((ms, i) =>
      makeRun(ms, 'green', (10 - i) * 60_000),
    );
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([...runs].reverse()) } });
    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('response-time-chart', { monitorId }), undefined,
    );
    expect(result.avgMs).toBe(55); // (10+20+...+100)/10
    expect(result.maxMs).toBe(100);
    expect(result.p95Ms).toBeGreaterThan(0);
  });

  it('maps data points with ok flag for non-red runs', async () => {
    const runs = [
      makeRun(50, 'green', 120_000),
      makeRun(null, 'red', 60_000),
      makeRun(75, 'green', 0),
    ];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('response-time-chart', { monitorId }), undefined,
    );
    const pts = result.dataPoints as any[];
    expect(pts.some((p: any) => p.ok === false)).toBe(true);
    expect(pts.some((p: any) => p.ok === true)).toBe(true);
  });

  it('clamps points config between 10 and 200', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('response-time-chart', { monitorId, points: 500 }), undefined,
    );
    const findArgs = (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.take).toBe(200);
  });

  it('applies periodHours filter when provided', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('response-time-chart', { monitorId, periodHours: 24 }), undefined,
    );
    const findArgs = (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.where.checkedAt).toBeDefined();
  });

  it('ignores null latency runs in avg/p95/max calculation', async () => {
    const runs = [makeRun(100, 'green'), makeRun(null, 'red'), makeRun(50, 'green')];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('response-time-chart', { monitorId }), undefined,
    );
    expect(result.avgMs).toBe(75); // (100+50)/2
    expect(result.maxMs).toBe(100);
  });
});

// ── response-time-heatmap ─────────────────────────────────────────────────────

describe('performance resolver — response-time-heatmap', () => {
  it('returns _noConfig when no monitorId', async () => {
    const prisma = makePrisma();
    const result = await resolvePerformanceWidget(prisma, noopCache, userId, makeWidget('response-time-heatmap'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns 7×24 grid when no runs', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('response-time-heatmap', { monitorId }), undefined,
    );
    const grid = result.grid as (number | null)[][];
    expect(grid).toHaveLength(7);
    grid.forEach((row) => expect(row).toHaveLength(24));
    expect(result.minMs).toBe(0);
    expect(result.maxMs).toBe(0);
    expect(result.fetchedAt).toBeDefined();
  });

  it('aggregates latency into correct dow/hour cells', async () => {
    // Wednesday = dow 3, hour 14
    const wed14 = new Date('2026-03-25T14:30:00Z'); // Wed at 14:30 UTC
    const runs = [
      { checkedAt: wed14, latencyMs: 100 },
      { checkedAt: new Date(wed14.getTime() + 60_000), latencyMs: 200 },
    ];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('response-time-heatmap', { monitorId }), undefined,
    );
    const grid = result.grid as (number | null)[][];
    const dow = wed14.getUTCDay(); // 3 for Wednesday
    const hour = wed14.getUTCHours(); // 14
    expect(grid[dow][hour]).toBe(150); // avg of 100 and 200
  });

  it('clamps periodDays between 7 and 365', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const r1 = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('response-time-heatmap', { monitorId, periodDays: 1 }), undefined,
    );
    expect(r1.periodDays).toBe(7);

    const r2 = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('response-time-heatmap', { monitorId, periodDays: 999 }), undefined,
    );
    expect(r2.periodDays).toBe(365);
  });
});

// ── latency-percentiles-card ──────────────────────────────────────────────────

describe('performance resolver — latency-percentiles-card', () => {
  it('returns _noConfig when no monitorId', async () => {
    const prisma = makePrisma();
    const result = await resolvePerformanceWidget(prisma, noopCache, userId, makeWidget('latency-percentiles-card'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns null percentiles when no current runs', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('latency-percentiles-card', { monitorId }), undefined,
    );
    expect(result.p50).toBeNull();
    expect(result.p95).toBeNull();
    expect(result.p99).toBeNull();
    expect(result.sampleCount).toBe(0);
    expect(result.fetchedAt).toBeDefined();
  });

  it('calculates p50/p95/p99 from sorted latencies', async () => {
    const latencies = Array.from({ length: 100 }, (_, i) => ({ latencyMs: i + 1 }));
    const findMany = vi.fn()
      .mockResolvedValueOnce(latencies)  // current period
      .mockResolvedValueOnce([]);         // prev period

    const prisma = { monitorRun: { findMany } } as unknown as any;
    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('latency-percentiles-card', { monitorId }), undefined,
    );
    // Array 1..100, sorted. idx = floor(100 * pct), value = sorted[idx]
    // p50: idx=50, value=51 | p95: idx=95, value=96 | p99: idx=99, value=100
    expect(result.p50).toBe(51);
    expect(result.p95).toBe(96);
    expect(result.p99).toBe(100);
    expect(result.sampleCount).toBe(100);
  });

  it('fetches both current and previous period runs', async () => {
    const findMany = vi.fn()
      .mockResolvedValueOnce([{ latencyMs: 50 }])   // current
      .mockResolvedValueOnce([{ latencyMs: 80 }]);   // prev

    const prisma = { monitorRun: { findMany } } as unknown as any;
    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('latency-percentiles-card', { monitorId }), undefined,
    );
    expect(result.prevP50).toBe(80);
    expect(result.p50).toBe(50);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});

// ── performance-trend ─────────────────────────────────────────────────────────

describe('performance resolver — performance-trend', () => {
  it('returns _noConfig when no monitorId', async () => {
    const prisma = makePrisma();
    const result = await resolvePerformanceWidget(prisma, noopCache, userId, makeWidget('performance-trend'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns stable trend with no data', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('performance-trend', { monitorId }), undefined,
    );
    expect(result.trend).toBe('stable');
    expect(result.dataPoints).toHaveLength(14);
    expect(result.fetchedAt).toBeDefined();
  });

  it('returns up trend when this week is slower than last week', async () => {
    const runs: any[] = [];
    const now = new Date();
    // Last week (days 0-6 ago from 7-13 ago): 50ms avg
    for (let d = 13; d >= 7; d--) {
      runs.push({ latencyMs: 50, checkedAt: new Date(now.getTime() - d * 86_400_000) });
    }
    // This week (days 0-6): 150ms avg (3x slower)
    for (let d = 6; d >= 0; d--) {
      runs.push({ latencyMs: 150, checkedAt: new Date(now.getTime() - d * 86_400_000) });
    }
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('performance-trend', { monitorId }), undefined,
    );
    expect(result.trend).toBe('up'); // latency went up = worse
    expect(result.changePercent).toBeGreaterThan(0);
  });

  it('returns down trend when this week is faster than last week', async () => {
    const runs: any[] = [];
    const now = new Date();
    for (let d = 13; d >= 7; d--) {
      runs.push({ latencyMs: 200, checkedAt: new Date(now.getTime() - d * 86_400_000) });
    }
    for (let d = 6; d >= 0; d--) {
      runs.push({ latencyMs: 50, checkedAt: new Date(now.getTime() - d * 86_400_000) });
    }
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('performance-trend', { monitorId }), undefined,
    );
    expect(result.trend).toBe('down'); // latency went down = better
    expect(result.changePercent).toBeLessThan(0);
  });
});

// ── apdex-score ───────────────────────────────────────────────────────────────

describe('performance resolver — apdex-score', () => {
  it('returns _noConfig when no monitorId', async () => {
    const prisma = makePrisma();
    const result = await resolvePerformanceWidget(prisma, noopCache, userId, makeWidget('apdex-score'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns null score when no runs', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('apdex-score', { monitorId }), undefined,
    );
    expect(result.score).toBeNull();
    expect(result.rating).toBeNull();
    expect(result.total).toBe(0);
    expect(result.fetchedAt).toBeDefined();
  });

  it('calculates perfect apdex when all requests are satisfied', async () => {
    const runs = Array(100).fill({ latencyMs: 100 }); // all < 200ms threshold
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('apdex-score', { monitorId, satisfiedThresholdMs: 200, toleratingThresholdMs: 800 }), undefined,
    );
    expect(result.score).toBe(1);
    expect(result.rating).toBe('Excellent');
    expect(result.satisfied).toBe(100);
    expect(result.tolerating).toBe(0);
    expect(result.frustrated).toBe(0);
  });

  it('calculates mixed apdex correctly', async () => {
    const runs = [
      ...Array(60).fill({ latencyMs: 100 }),  // satisfied: < 200ms
      ...Array(30).fill({ latencyMs: 500 }),  // tolerating: 200-800ms
      ...Array(10).fill({ latencyMs: 1000 }), // frustrated: > 800ms
    ];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('apdex-score', { monitorId, satisfiedThresholdMs: 200, toleratingThresholdMs: 800 }), undefined,
    );
    // apdex = (60 + 30/2) / 100 = 0.75
    expect(result.score).toBe(0.75);
    expect(result.rating).toBe('Fair');
    expect(result.total).toBe(100);
  });

  it('rates scores correctly', async () => {
    const testCases = [
      { latencyMs: 100, threshold: 200, expected: 'Excellent' },  // score = 1.0
    ];

    for (const tc of testCases) {
      const runs = Array(100).fill({ latencyMs: tc.latencyMs });
      const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
      const result = await resolvePerformanceWidget(
        prisma, noopCache, userId,
        makeWidget('apdex-score', { monitorId, satisfiedThresholdMs: tc.threshold, toleratingThresholdMs: tc.threshold * 4 }), undefined,
      );
      expect(result.rating).toBe(tc.expected);
    }
  });
});

// ── throughput-counter ────────────────────────────────────────────────────────

describe('performance resolver — throughput-counter', () => {
  it('returns zero counters when no runs in last 24h', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolvePerformanceWidget(prisma, noopCache, userId, makeWidget('throughput-counter'), undefined);
    expect(result.peak).toBe(0);
    expect(result.dataPoints).toHaveLength(24);
    expect(result.fetchedAt).toBeDefined();
  });

  it('returns 24 hourly data points', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolvePerformanceWidget(prisma, noopCache, userId, makeWidget('throughput-counter'), undefined);
    expect((result.dataPoints as any[]).length).toBe(24);
  });

  it('queries last 24h of runs', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    await resolvePerformanceWidget(prisma, noopCache, userId, makeWidget('throughput-counter'), undefined);
    const findArgs = (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.where.checkedAt.gte).toBeDefined();
  });

  it('filters by monitorIds when provided', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('throughput-counter', { monitorIds: ['m1', 'm2'] }), undefined,
    );
    const findArgs = (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.where.monitorId).toEqual({ in: ['m1', 'm2'] });
  });
});

// ── response-time-comparison ──────────────────────────────────────────────────

describe('performance resolver — response-time-comparison', () => {
  it('returns _noConfig when no monitorIds and no monitorId', async () => {
    const prisma = makePrisma();
    const result = await resolvePerformanceWidget(prisma, noopCache, userId, makeWidget('response-time-comparison'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns comparison data for provided monitorIds', async () => {
    const monitors = [
      { id: 'm1', name: 'API' },
      { id: 'm2', name: 'DB' },
    ];
    const runs1 = [{ latencyMs: 50, checkedAt: new Date() }];
    const runs2 = [{ latencyMs: 100, checkedAt: new Date() }];

    const monitorFindMany = vi.fn().mockResolvedValue(monitors);
    const runFindMany = vi.fn()
      .mockResolvedValueOnce(runs1)
      .mockResolvedValueOnce(runs2);

    const prisma = {
      monitor: { findMany: monitorFindMany },
      monitorRun: { findMany: runFindMany },
    } as unknown as any;

    const result = await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('response-time-comparison', { monitorIds: ['m1', 'm2'] }), undefined,
    );

    const monitorList = result.monitors as any[];
    expect(monitorList).toHaveLength(2);
    expect(monitorList[0].name).toBe('API');
    expect(monitorList[0].dataPoints).toHaveLength(1);
    expect(monitorList[0].color).toBeDefined();
    expect(result.labels).toBeDefined();
  });

  it('limits resolved monitor list to 8 maximum in the query', async () => {
    // The resolver slices monitorIds to 8 before querying monitor table
    const ids = ['m1','m2','m3','m4','m5','m6','m7','m8','m9','m10'];
    const monitorFindMany = vi.fn().mockResolvedValue([{ id: 'm1', name: 'API' }]);
    const runFindMany = vi.fn().mockResolvedValue([]);
    const prisma = { monitor: { findMany: monitorFindMany }, monitorRun: { findMany: runFindMany } } as unknown as any;
    await resolvePerformanceWidget(
      prisma, noopCache, userId,
      makeWidget('response-time-comparison', { monitorIds: ids }), undefined,
    );
    const findArgs = monitorFindMany.mock.calls[0][0];
    // resolvedIds = monitorIds.slice(0,8) → 8 items max
    expect(findArgs.where.id.in.length).toBeLessThanOrEqual(8);
  });
});

// ── check-history-feed ────────────────────────────────────────────────────────

describe('performance resolver — check-history-feed', () => {
  it('returns empty feed when no runs', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolvePerformanceWidget(prisma, noopCache, userId, makeWidget('check-history-feed'), undefined);
    expect(result.checks).toHaveLength(0);
    expect(result.fetchedAt).toBeDefined();
  });

  it('returns mapped check entries', async () => {
    const runs = [
      {
        id: 'r1', monitorId: 'm1', checkedAt: new Date(),
        ok: true, level: 'green', latencyMs: 45, message: null,
        monitor: { name: 'API' },
      },
    ];
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue(runs) } });
    const result = await resolvePerformanceWidget(prisma, noopCache, userId, makeWidget('check-history-feed'), undefined);
    const checks = result.checks as any[];
    expect(checks).toHaveLength(1);
    expect(checks[0].monitorName).toBe('API');
    expect(checks[0].level).toBe('green');
    expect(checks[0].latencyMs).toBe(45);
    expect(checks[0].checkedAt).toBeDefined();
  });

  it('queries up to 50 most recent runs', async () => {
    const prisma = makePrisma({ monitorRun: { findMany: vi.fn().mockResolvedValue([]) } });
    await resolvePerformanceWidget(prisma, noopCache, userId, makeWidget('check-history-feed'), undefined);
    const findArgs = (prisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.take).toBe(50);
    expect(findArgs.orderBy).toEqual({ checkedAt: 'desc' });
  });
});

// ── default / unknown type ────────────────────────────────────────────────────

describe('performance resolver — unknown widget type', () => {
  it('returns fallback message for unrecognized type', async () => {
    const prisma = makePrisma();
    const result = await resolvePerformanceWidget(prisma, noopCache, userId, makeWidget('unknown-perf-widget'), undefined);
    expect(result.message).toContain('not yet implemented');
  });
});
