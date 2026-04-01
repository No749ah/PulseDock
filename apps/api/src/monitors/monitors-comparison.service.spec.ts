/**
 * Unit tests for MonitorsComparisonService + pearsonCorrelation helper.
 *
 * All Prisma interactions are mocked — no database required.
 * Tests cover:
 *   - compareMonitors: input validation, ownership checks, stats calculation,
 *     daily breakdowns, correlation computation
 *   - getLatencyDistribution: buckets, percentiles, hourly averages
 *   - getPeriodComparison: period stats, delta computations
 *   - getStatusTransitions: transition detection, summary stats
 *   - pearsonCorrelation: edge cases and correctness
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  MonitorsComparisonService,
  pearsonCorrelation,
} from './monitors-comparison.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMonitor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'mon-1',
    name: 'Test Monitor',
    type: 'HTTP',
    target: 'https://example.com',
    ...overrides,
  };
}

type MockRun = {
  monitorId?: string;
  ok: boolean;
  latencyMs: number | null;
  checkedAt: Date;
  level?: string;
  message?: string | null;
};

function makeRun(overrides: Partial<MockRun>): MockRun {
  return {
    monitorId: 'mon-1',
    ok: true,
    latencyMs: 100,
    checkedAt: new Date(),
    level: 'green',
    message: null,
    ...overrides,
  };
}

/** Offset in milliseconds from now. Positive = future, negative = past. */
function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600_000);
}

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86_400_000);
}

// ─── Mocked PrismaService ─────────────────────────────────────────────────────

const mockPrisma = {
  monitor: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  monitorRun: {
    findMany: vi.fn(),
  },
};

function makeSvc(): MonitorsComparisonService {
  return new MonitorsComparisonService(mockPrisma as never);
}

// ─── pearsonCorrelation ───────────────────────────────────────────────────────

describe('pearsonCorrelation (pure helper)', () => {
  it('returns 1 for identical arrays', () => {
    const xs = [99, 100, 98, 100, 97];
    expect(pearsonCorrelation(xs, xs)).toBeCloseTo(1, 5);
  });

  it('returns -1 for perfectly negatively correlated arrays', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [5, 4, 3, 2, 1];
    expect(pearsonCorrelation(xs, ys)).toBeCloseTo(-1, 5);
  });

  it('returns 0 for zero-variance arrays (all same value)', () => {
    const xs = [100, 100, 100];
    const ys = [99, 98, 100];
    expect(pearsonCorrelation(xs, ys)).toBe(0);
  });

  it('returns 0 for empty arrays', () => {
    expect(pearsonCorrelation([], [])).toBe(0);
  });

  it('returns 0 for single-element arrays', () => {
    expect(pearsonCorrelation([1], [2])).toBe(0);
  });

  it('handles mismatched lengths by using min length', () => {
    // xs has 3 elements, ys has 5; should use first 3 of each
    const xs = [1, 2, 3];
    const ys = [1, 2, 3, 4, 5];
    expect(pearsonCorrelation(xs, ys)).toBeCloseTo(1, 5);
  });

  it('returns a value between -1 and 1 for random-ish data', () => {
    const xs = [99.9, 100, 99.5, 98, 99.8];
    const ys = [98, 99.9, 100, 99.2, 97.5];
    const r = pearsonCorrelation(xs, ys);
    expect(r).toBeGreaterThanOrEqual(-1);
    expect(r).toBeLessThanOrEqual(1);
  });
});

// ─── MonitorsComparisonService.compareMonitors ────────────────────────────────

describe('compareMonitors', () => {
  let svc: MonitorsComparisonService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = makeSvc();
  });

  it('throws BadRequestException when fewer than 2 monitor IDs provided', async () => {
    await expect(svc.compareMonitors('user-1', ['mon-1'], 7)).rejects.toThrow(BadRequestException);
    await expect(svc.compareMonitors('user-1', ['mon-1'], 7)).rejects.toThrow(/At least 2/);
  });

  it('throws BadRequestException when more than 4 monitor IDs provided', async () => {
    await expect(svc.compareMonitors('user-1', ['a', 'b', 'c', 'd', 'e'], 7)).rejects.toThrow(BadRequestException);
    await expect(svc.compareMonitors('user-1', ['a', 'b', 'c', 'd', 'e'], 7)).rejects.toThrow(/At most 4/);
  });

  it('throws BadRequestException when a monitor is not owned by user', async () => {
    // Only mon-1 returned, but mon-2 also requested
    mockPrisma.monitor.findMany.mockResolvedValue([makeMonitor({ id: 'mon-1' })]);
    await expect(svc.compareMonitors('user-1', ['mon-1', 'mon-2'], 7)).rejects.toThrow(BadRequestException);
    await expect(svc.compareMonitors('user-1', ['mon-1', 'mon-2'], 7)).rejects.toThrow(/mon-2/);
  });

  it('clamps days to 1 when below minimum', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      makeMonitor({ id: 'mon-1' }),
      makeMonitor({ id: 'mon-2', name: 'Monitor 2' }),
    ]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc.compareMonitors('user-1', ['mon-1', 'mon-2'], 0);
    expect(result.period.days).toBe(1);
  });

  it('clamps days to 90 when above maximum', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      makeMonitor({ id: 'mon-1' }),
      makeMonitor({ id: 'mon-2', name: 'Monitor 2' }),
    ]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc.compareMonitors('user-1', ['mon-1', 'mon-2'], 200);
    expect(result.period.days).toBe(90);
  });

  it('returns 100% uptime when no runs exist for a monitor', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      makeMonitor({ id: 'mon-1' }),
      makeMonitor({ id: 'mon-2', name: 'Monitor 2' }),
    ]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc.compareMonitors('user-1', ['mon-1', 'mon-2'], 7);
    expect(result.monitors[0].uptimePct).toBe(100);
    expect(result.monitors[1].uptimePct).toBe(100);
  });

  it('computes correct uptime percentage from runs', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      makeMonitor({ id: 'mon-1' }),
      makeMonitor({ id: 'mon-2', name: 'Monitor 2' }),
    ]);

    // mon-1: 8 out of 10 OK = 80%
    const mon1Runs: MockRun[] = [
      ...Array.from({ length: 8 }, () => makeRun({ monitorId: 'mon-1', ok: true })),
      ...Array.from({ length: 2 }, () => makeRun({ monitorId: 'mon-1', ok: false, latencyMs: null })),
    ];
    // mon-2: all OK
    const mon2Runs: MockRun[] = Array.from({ length: 10 }, () =>
      makeRun({ monitorId: 'mon-2', ok: true }),
    );
    mockPrisma.monitorRun.findMany.mockResolvedValue([...mon1Runs, ...mon2Runs]);

    const result = await svc.compareMonitors('user-1', ['mon-1', 'mon-2'], 7);
    const m1 = result.monitors.find((m) => m.id === 'mon-1')!;
    const m2 = result.monitors.find((m) => m.id === 'mon-2')!;
    expect(m1.uptimePct).toBe(80);
    expect(m2.uptimePct).toBe(100);
  });

  it('computes correct average latency for HTTP monitors', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      makeMonitor({ id: 'mon-1', type: 'HTTP' }),
      makeMonitor({ id: 'mon-2', name: 'Monitor 2', type: 'HTTP' }),
    ]);

    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ monitorId: 'mon-1', latencyMs: 100 }),
      makeRun({ monitorId: 'mon-1', latencyMs: 200 }),
      makeRun({ monitorId: 'mon-2', latencyMs: 50 }),
    ]);

    const result = await svc.compareMonitors('user-1', ['mon-1', 'mon-2'], 7);
    const m1 = result.monitors.find((m) => m.id === 'mon-1')!;
    const m2 = result.monitors.find((m) => m.id === 'mon-2')!;
    expect(m1.avgLatencyMs).toBe(150);
    expect(m2.avgLatencyMs).toBe(50);
  });

  it('sets avgLatencyMs and p95LatencyMs to null for non-HTTP monitors', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      makeMonitor({ id: 'mon-1', type: 'GIT_RELEASE' }),
      makeMonitor({ id: 'mon-2', name: 'Monitor 2', type: 'GIT_RELEASE' }),
    ]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ monitorId: 'mon-1', latencyMs: 0 }),
      makeRun({ monitorId: 'mon-2', latencyMs: 0 }),
    ]);

    const result = await svc.compareMonitors('user-1', ['mon-1', 'mon-2'], 7);
    expect(result.monitors[0].avgLatencyMs).toBeNull();
    expect(result.monitors[0].p95LatencyMs).toBeNull();
  });

  it('computes longest outage in minutes', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      makeMonitor({ id: 'mon-1' }),
      makeMonitor({ id: 'mon-2', name: 'Monitor 2' }),
    ]);

    const now = Date.now();
    // Failure streak of ~60 minutes for mon-1
    const failStart = new Date(now - 90 * 60_000);
    const failEnd = new Date(now - 30 * 60_000);

    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ monitorId: 'mon-1', ok: true, checkedAt: new Date(now - 120 * 60_000) }),
      makeRun({ monitorId: 'mon-1', ok: false, latencyMs: null, checkedAt: failStart }),
      makeRun({ monitorId: 'mon-1', ok: false, latencyMs: null, checkedAt: new Date(now - 60 * 60_000) }),
      makeRun({ monitorId: 'mon-1', ok: false, latencyMs: null, checkedAt: failEnd }),
      makeRun({ monitorId: 'mon-1', ok: true, checkedAt: new Date(now - 15 * 60_000) }),
      makeRun({ monitorId: 'mon-2', ok: true }),
    ]);

    const result = await svc.compareMonitors('user-1', ['mon-1', 'mon-2'], 7);
    const m1 = result.monitors.find((m) => m.id === 'mon-1')!;
    // failStart to failEnd ≈ 60 minutes
    expect(m1.longestOutageMin).toBe(60);
  });

  it('sets bestLatency to null when no HTTP monitors', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      makeMonitor({ id: 'mon-1', type: 'TCP' }),
      makeMonitor({ id: 'mon-2', name: 'Monitor 2', type: 'TCP' }),
    ]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc.compareMonitors('user-1', ['mon-1', 'mon-2'], 7);
    expect(result.comparison.bestLatency).toBeNull();
  });

  it('includes correlation coefficients for all monitor pairs', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      makeMonitor({ id: 'mon-1' }),
      makeMonitor({ id: 'mon-2', name: 'M2' }),
      makeMonitor({ id: 'mon-3', name: 'M3' }),
    ]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc.compareMonitors('user-1', ['mon-1', 'mon-2', 'mon-3'], 7);
    // 3 monitors → 3 pairs: (1,2), (1,3), (2,3)
    expect(result.comparison.correlations).toHaveLength(3);
  });

  it('assigns "weak" interpretation when both monitors have constant 100% uptime', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      makeMonitor({ id: 'mon-1' }),
      makeMonitor({ id: 'mon-2', name: 'M2' }),
    ]);
    // All OK runs → uptime = 100% every day → zero variance → Pearson returns 0 → 'weak'
    const runs: MockRun[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeRun({ monitorId: 'mon-1', ok: true, checkedAt: daysAgo(i) }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeRun({ monitorId: 'mon-2', ok: true, checkedAt: daysAgo(i) }),
      ),
    ];
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await svc.compareMonitors('user-1', ['mon-1', 'mon-2'], 7);
    const corr = result.comparison.correlations[0];
    // Zero variance → Pearson = 0 → 'weak' is the correct interpretation
    expect(corr.interpretation).toBe('weak');
    expect(corr.coefficient).toBe(0);
  });

  it('assigns "strong_positive" interpretation for highly correlated uptime series', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      makeMonitor({ id: 'mon-1' }),
      makeMonitor({ id: 'mon-2', name: 'M2' }),
    ]);
    // Both monitors drop on the same day → correlated uptime series
    const runs: MockRun[] = [
      // Day 7 ago: both ok
      makeRun({ monitorId: 'mon-1', ok: true, checkedAt: daysAgo(7) }),
      makeRun({ monitorId: 'mon-2', ok: true, checkedAt: daysAgo(7) }),
      // Day 6 ago: both fail
      makeRun({ monitorId: 'mon-1', ok: false, latencyMs: null, checkedAt: daysAgo(6) }),
      makeRun({ monitorId: 'mon-1', ok: false, latencyMs: null, checkedAt: new Date(daysAgo(6).getTime() + 30_000) }),
      makeRun({ monitorId: 'mon-2', ok: false, latencyMs: null, checkedAt: daysAgo(6) }),
      makeRun({ monitorId: 'mon-2', ok: false, latencyMs: null, checkedAt: new Date(daysAgo(6).getTime() + 30_000) }),
      // Day 5-1 ago: both ok
      ...Array.from({ length: 5 }, (_, i) => makeRun({ monitorId: 'mon-1', ok: true, checkedAt: daysAgo(5 - i) })),
      ...Array.from({ length: 5 }, (_, i) => makeRun({ monitorId: 'mon-2', ok: true, checkedAt: daysAgo(5 - i) })),
    ];
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await svc.compareMonitors('user-1', ['mon-1', 'mon-2'], 7);
    const corr = result.comparison.correlations[0];
    // Both fail the same day → coefficient should be ≥ 0.7
    expect(corr.coefficient).toBeGreaterThanOrEqual(0.7);
    expect(corr.interpretation).toBe('strong_positive');
  });

  it('includes period from/to and clamped days in result', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      makeMonitor({ id: 'mon-1' }),
      makeMonitor({ id: 'mon-2', name: 'M2' }),
    ]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc.compareMonitors('user-1', ['mon-1', 'mon-2'], 30);
    expect(result.period.days).toBe(30);
    expect(result.period.from).toBeTruthy();
    expect(result.period.to).toBeTruthy();
  });

  it('identifies bestUptime monitor correctly', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      makeMonitor({ id: 'mon-1' }),
      makeMonitor({ id: 'mon-2', name: 'M2' }),
    ]);
    // mon-1: 80% uptime, mon-2: 100% uptime
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ monitorId: 'mon-1', ok: false, latencyMs: null }),
      makeRun({ monitorId: 'mon-1', ok: false, latencyMs: null }),
      makeRun({ monitorId: 'mon-1', ok: false, latencyMs: null }),
      makeRun({ monitorId: 'mon-1', ok: false, latencyMs: null }),
      makeRun({ monitorId: 'mon-1', ok: true }),
      makeRun({ monitorId: 'mon-2', ok: true }),
    ]);

    const result = await svc.compareMonitors('user-1', ['mon-1', 'mon-2'], 7);
    expect(result.comparison.bestUptime.monitorId).toBe('mon-2');
  });
});

// ─── MonitorsComparisonService.getLatencyDistribution ────────────────────────

describe('getLatencyDistribution', () => {
  let svc: MonitorsComparisonService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = makeSvc();
  });

  it('throws NotFoundException when monitor not owned by user', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(null);
    await expect(svc.getLatencyDistribution('user-1', 'mon-1', '7d')).rejects.toThrow(NotFoundException);
  });

  it('returns empty bucket counts when no runs exist', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1' });
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc.getLatencyDistribution('user-1', 'mon-1', '7d');
    expect(result.totalChecks).toBe(0);
    expect(result.successChecks).toBe(0);
    expect(result.buckets.every((b) => b.count === 0)).toBe(true);
  });

  it('correctly bins latencies into buckets', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1' });
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: true, latencyMs: 20 }),   // 0-50ms
      makeRun({ ok: true, latencyMs: 75 }),   // 50-100ms
      makeRun({ ok: true, latencyMs: 150 }),  // 100-200ms
      makeRun({ ok: true, latencyMs: 300 }),  // 200-500ms
      makeRun({ ok: true, latencyMs: 750 }),  // 500-1s
    ]);

    const result = await svc.getLatencyDistribution('user-1', 'mon-1', '7d');
    const b0 = result.buckets.find((b) => b.rangeLabel === '0-50ms')!;
    const b50 = result.buckets.find((b) => b.rangeLabel === '50-100ms')!;
    const b100 = result.buckets.find((b) => b.rangeLabel === '100-200ms')!;
    const b200 = result.buckets.find((b) => b.rangeLabel === '200-500ms')!;
    const b500 = result.buckets.find((b) => b.rangeLabel === '500-1s')!;

    expect(b0.count).toBe(1);
    expect(b50.count).toBe(1);
    expect(b100.count).toBe(1);
    expect(b200.count).toBe(1);
    expect(b500.count).toBe(1);
  });

  it('computes correct percentiles', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1' });
    // 10 runs with sorted latencies 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
    mockPrisma.monitorRun.findMany.mockResolvedValue(
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((ms) =>
        makeRun({ ok: true, latencyMs: ms }),
      ),
    );

    const result = await svc.getLatencyDistribution('user-1', 'mon-1', '7d');
    // p50 = index 4 (0-indexed) in sorted = 50
    expect(result.percentiles.p50).toBe(50);
    // p99 ≈ index 9 = 100
    expect(result.percentiles.p99).toBe(100);
    // p50 ≤ p95 ≤ p99
    expect(result.percentiles.p50!).toBeLessThanOrEqual(result.percentiles.p95!);
    expect(result.percentiles.p95!).toBeLessThanOrEqual(result.percentiles.p99!);
  });

  it('excludes failed runs from latency calculations', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1' });
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: false, latencyMs: null }),
      makeRun({ ok: false, latencyMs: null }),
      makeRun({ ok: true, latencyMs: 100 }),
    ]);

    const result = await svc.getLatencyDistribution('user-1', 'mon-1', '7d');
    expect(result.totalChecks).toBe(3);
    expect(result.successChecks).toBe(1);
    // Only successful run counts in buckets
    const b100 = result.buckets.find((b) => b.rangeLabel === '100-200ms')!;
    expect(b100.count).toBe(1);
  });

  it('returns null percentiles when no successful runs', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1' });
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: false, latencyMs: null }),
    ]);

    const result = await svc.getLatencyDistribution('user-1', 'mon-1', '7d');
    expect(result.percentiles.p50).toBeNull();
    expect(result.percentiles.p95).toBeNull();
    expect(result.percentiles.p99).toBeNull();
  });

  it('builds hourlyAvg with 24 entries (one per UTC hour)', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1' });
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: true, latencyMs: 100, checkedAt: new Date('2026-01-01T10:00:00Z') }),
      makeRun({ ok: true, latencyMs: 200, checkedAt: new Date('2026-01-01T10:30:00Z') }),
    ]);

    const result = await svc.getLatencyDistribution('user-1', 'mon-1', '7d');
    expect(result.hourlyAvg).toHaveLength(24);
    const hour10 = result.hourlyAvg.find((h) => h.hour === 10)!;
    expect(hour10.avgMs).toBe(150);
    expect(hour10.count).toBe(2);
  });

  it('sets hourly avgMs and p95Ms to null for hours with no data', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1' });
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: true, latencyMs: 100, checkedAt: new Date('2026-01-01T00:00:00Z') }),
    ]);

    const result = await svc.getLatencyDistribution('user-1', 'mon-1', '7d');
    const hour23 = result.hourlyAvg.find((h) => h.hour === 23)!;
    expect(hour23.avgMs).toBeNull();
    expect(hour23.p95Ms).toBeNull();
    expect(hour23.count).toBe(0);
  });

  it('includes checkedRange label for each period', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1' });
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const r24 = await svc.getLatencyDistribution('user-1', 'mon-1', '24h');
    const r7d = await svc.getLatencyDistribution('user-1', 'mon-1', '7d');
    const r30d = await svc.getLatencyDistribution('user-1', 'mon-1', '30d');

    expect(r24.checkedRange).toBe('Last 24 hours');
    expect(r7d.checkedRange).toBe('Last 7 days');
    expect(r30d.checkedRange).toBe('Last 30 days');
  });
});

// ─── MonitorsComparisonService.getPeriodComparison ───────────────────────────

describe('getPeriodComparison', () => {
  let svc: MonitorsComparisonService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = makeSvc();
  });

  it('throws NotFoundException when monitor not found', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(null);
    await expect(svc.getPeriodComparison('user-1', 'mon-1', '7d')).rejects.toThrow(NotFoundException);
  });

  it('returns correct period label in result', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1' });
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc.getPeriodComparison('user-1', 'mon-1', '30d');
    expect(result.period).toBe('30d');
  });

  it('computes uptime for current period from run data', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1' });
    // First call = current period (8 ok / 10 total = 80%)
    // Second call = prior period (10 ok / 10 = 100%)
    mockPrisma.monitorRun.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => makeRun({ ok: i < 8 })),
      )
      .mockResolvedValueOnce(
        Array.from({ length: 10 }, () => makeRun({ ok: true })),
      );

    const result = await svc.getPeriodComparison('user-1', 'mon-1', '7d');
    expect(result.current.uptime).toBe(80);
    expect(result.prior.uptime).toBe(100);
  });

  it('returns null uptime when no runs for a period', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1' });
    mockPrisma.monitorRun.findMany
      .mockResolvedValueOnce([])  // current
      .mockResolvedValueOnce([]); // prior

    const result = await svc.getPeriodComparison('user-1', 'mon-1', '7d');
    expect(result.current.uptime).toBeNull();
    expect(result.prior.uptime).toBeNull();
    expect(result.delta.uptimePct).toBeNull();
  });

  it('computes correct percentage delta (positive = improvement)', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1' });
    // current: 10/10 ok (100%), prior: 9/10 ok (90%)
    mockPrisma.monitorRun.findMany
      .mockResolvedValueOnce(Array.from({ length: 10 }, () => makeRun({ ok: true, latencyMs: 100 })))
      .mockResolvedValueOnce([
        ...Array.from({ length: 9 }, () => makeRun({ ok: true, latencyMs: 100 })),
        makeRun({ ok: false, latencyMs: null }),
      ]);

    const result = await svc.getPeriodComparison('user-1', 'mon-1', '7d');
    expect(result.current.uptime).toBe(100);
    expect(result.prior.uptime).toBe(90);
    // delta = (100-90)/90 * 100 ≈ 11.1
    expect(result.delta.uptimePct).toBeCloseTo(11.1, 0);
  });

  it('returns null delta when prior value is 0 (avoids division by zero)', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1' });
    // current: 100ms avg, prior: 0ms (no latency data but has runs)
    mockPrisma.monitorRun.findMany
      .mockResolvedValueOnce([makeRun({ ok: true, latencyMs: 100 })])
      .mockResolvedValueOnce([makeRun({ ok: true, latencyMs: null })]);

    const result = await svc.getPeriodComparison('user-1', 'mon-1', '7d');
    // prior.avgMs is null when no latency data
    expect(result.delta.avgMsPct).toBeNull();
  });

  it('returns current and prior run counts', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1' });
    mockPrisma.monitorRun.findMany
      .mockResolvedValueOnce(Array.from({ length: 5 }, () => makeRun({ ok: true })))
      .mockResolvedValueOnce(Array.from({ length: 3 }, () => makeRun({ ok: true })));

    const result = await svc.getPeriodComparison('user-1', 'mon-1', '7d');
    expect(result.current.total).toBe(5);
    expect(result.prior.total).toBe(3);
  });
});

// ─── MonitorsComparisonService.getStatusTransitions ──────────────────────────

describe('getStatusTransitions', () => {
  let svc: MonitorsComparisonService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = makeSvc();
  });

  it('throws NotFoundException when monitor not owned by user', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(null);
    await expect(svc.getStatusTransitions('user-1', 'mon-1', '7d')).rejects.toThrow(NotFoundException);
  });

  it('returns empty transitions when no runs exist', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', name: 'Test' });
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc.getStatusTransitions('user-1', 'mon-1', '7d');
    expect(result.transitions).toHaveLength(0);
    expect(result.summary.totalOutages).toBe(0);
    expect(result.summary.totalDowntimeSec).toBe(0);
    expect(result.summary.avgRecoveryTimeSec).toBeNull();
    expect(result.summary.mtbfSec).toBeNull();
    expect(result.totalRuns).toBe(0);
  });

  it('detects a green→red→green transition', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', name: 'Test' });

    const now = Date.now();
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: true, level: 'green', checkedAt: new Date(now - 3 * 60_000) }),
      makeRun({ ok: false, level: 'red', checkedAt: new Date(now - 2 * 60_000), message: 'Timeout' }),
      makeRun({ ok: true, level: 'green', checkedAt: new Date(now - 1 * 60_000) }),
    ]);

    const result = await svc.getStatusTransitions('user-1', 'mon-1', '7d');
    expect(result.transitions).toHaveLength(2);
    expect(result.transitions[0].from).toBe('green');
    expect(result.transitions[0].to).toBe('red');
    expect(result.transitions[1].from).toBe('red');
    expect(result.transitions[1].to).toBe('green');
  });

  it('counts total outages (green→non-green transitions)', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', name: 'Test' });

    const now = Date.now();
    // Two separate outages
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: true, level: 'green', checkedAt: new Date(now - 10 * 60_000) }),
      makeRun({ ok: false, level: 'red', checkedAt: new Date(now - 8 * 60_000) }),
      makeRun({ ok: true, level: 'green', checkedAt: new Date(now - 6 * 60_000) }),
      makeRun({ ok: false, level: 'red', checkedAt: new Date(now - 4 * 60_000) }),
      makeRun({ ok: true, level: 'green', checkedAt: new Date(now - 2 * 60_000) }),
    ]);

    const result = await svc.getStatusTransitions('user-1', 'mon-1', '7d');
    expect(result.summary.totalOutages).toBe(2);
  });

  it('computes totalDowntimeSec from recovery transition durations', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', name: 'Test' });

    const now = Date.now();
    // 60-second outage
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: true, level: 'green', checkedAt: new Date(now - 90_000) }),
      makeRun({ ok: false, level: 'red', checkedAt: new Date(now - 60_000) }),
      makeRun({ ok: true, level: 'green', checkedAt: new Date(now) }),
    ]);

    const result = await svc.getStatusTransitions('user-1', 'mon-1', '7d');
    // Recovery transition duration ≈ 60s
    expect(result.summary.totalDowntimeSec).toBeCloseTo(60, 0);
  });

  it('computes avgRecoveryTimeSec when there are recoveries', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', name: 'Test' });

    const now = Date.now();
    // Two outages: 60s and 120s → avg 90s
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: true, level: 'green', checkedAt: new Date(now - 400_000) }),
      makeRun({ ok: false, level: 'red', checkedAt: new Date(now - 300_000) }),
      makeRun({ ok: true, level: 'green', checkedAt: new Date(now - 240_000) }),  // 60s outage
      makeRun({ ok: false, level: 'red', checkedAt: new Date(now - 180_000) }),
      makeRun({ ok: true, level: 'green', checkedAt: new Date(now - 60_000) }),   // 120s outage
    ]);

    const result = await svc.getStatusTransitions('user-1', 'mon-1', '7d');
    expect(result.summary.avgRecoveryTimeSec).toBeCloseTo(90, 0);
  });

  it('computes mtbfSec with 2+ outages', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', name: 'Test' });

    const t1 = new Date(Date.now() - 300_000);
    const t2 = new Date(Date.now() - 200_000);  // 100s after t1

    // Outage at t1, recovery, outage at t2
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: true, level: 'green', checkedAt: new Date(Date.now() - 400_000) }),
      makeRun({ ok: false, level: 'red', checkedAt: t1 }),
      makeRun({ ok: true, level: 'green', checkedAt: new Date(Date.now() - 250_000) }),
      makeRun({ ok: false, level: 'red', checkedAt: t2 }),
      makeRun({ ok: true, level: 'green', checkedAt: new Date(Date.now() - 150_000) }),
    ]);

    const result = await svc.getStatusTransitions('user-1', 'mon-1', '7d');
    expect(result.summary.mtbfSec).toBeCloseTo(100, 0);
  });

  it('returns null mtbfSec when fewer than 2 outages', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', name: 'Test' });
    const now = Date.now();

    // Single outage
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: true, level: 'green', checkedAt: new Date(now - 120_000) }),
      makeRun({ ok: false, level: 'red', checkedAt: new Date(now - 60_000) }),
      makeRun({ ok: true, level: 'green', checkedAt: new Date(now) }),
    ]);

    const result = await svc.getStatusTransitions('user-1', 'mon-1', '7d');
    expect(result.summary.mtbfSec).toBeNull();
  });

  it('does not emit transitions for consecutive same-level runs', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', name: 'Test' });

    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: true, level: 'green', checkedAt: hoursAgo(3) }),
      makeRun({ ok: true, level: 'green', checkedAt: hoursAgo(2) }),
      makeRun({ ok: true, level: 'green', checkedAt: hoursAgo(1) }),
    ]);

    const result = await svc.getStatusTransitions('user-1', 'mon-1', '7d');
    expect(result.transitions).toHaveLength(0);
  });

  it('falls back to ok flag for level when level is null/undefined', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', name: 'Test' });

    const now = Date.now();
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      { ok: true, level: null, message: null, latencyMs: null, checkedAt: new Date(now - 60_000) },
      { ok: false, level: null, message: null, latencyMs: null, checkedAt: new Date(now) },
    ]);

    const result = await svc.getStatusTransitions('user-1', 'mon-1', '7d');
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].from).toBe('green');
    expect(result.transitions[0].to).toBe('red');
  });

  it('includes correct checkedRange labels for all periods', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', name: 'Test' });
    mockPrisma.monitorRun.findMany.mockResolvedValue([makeRun({ ok: true })]);

    const r24 = await svc.getStatusTransitions('user-1', 'mon-1', '24h');
    const r7d = await svc.getStatusTransitions('user-1', 'mon-1', '7d');
    const r30d = await svc.getStatusTransitions('user-1', 'mon-1', '30d');

    expect(r24.checkedRange).toBe('Last 24 hours');
    expect(r7d.checkedRange).toBe('Last 7 days');
    expect(r30d.checkedRange).toBe('Last 30 days');
  });

  it('includes totalRuns count in result', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', name: 'Test' });
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: true, checkedAt: hoursAgo(2) }),
      makeRun({ ok: true, checkedAt: hoursAgo(1) }),
      makeRun({ ok: false, latencyMs: null, checkedAt: hoursAgo(0) }),
    ]);

    const result = await svc.getStatusTransitions('user-1', 'mon-1', '7d');
    expect(result.totalRuns).toBe(3);
  });
});
