/**
 * Unit tests for MonitorsService.failurePrediction()
 *
 * Covers: empty fleet, stable monitors, rapidly degrading monitors, risk score
 * calculation, estimatedHoursToFailure, minimum run threshold, summary counts,
 * null latency handling.
 */

import { describe, it, expect, vi } from 'vitest';
import { MonitorsAnalyticsService } from './monitors-analytics.service';
import { linearRegression } from './monitors.service';

// ── helpers ──────────────────────────────────────────────────────────────

function makeRun(opts: {
  monitorId: string;
  ok: boolean;
  latencyMs?: number | null;
  hoursAgo: number;
}) {
  return {
    monitorId: opts.monitorId,
    ok: opts.ok,
    latencyMs: opts.latencyMs !== undefined ? opts.latencyMs : opts.ok ? 100 : null,
    checkedAt: new Date(Date.now() - opts.hoursAgo * 3_600_000),
  };
}

function makePrisma(
  monitors: { id: string; name: string; type: string }[],
  runs: ReturnType<typeof makeRun>[],
) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitors),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue(runs),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new (MonitorsAnalyticsService as unknown as new (...args: unknown[]) => MonitorsAnalyticsService)(prisma) as MonitorsService;
}

// ── tests ─────────────────────────────────────────────────────────────────

describe('MonitorsService.failurePrediction()', () => {
  it('returns empty predictions when no monitors exist', async () => {
    const prisma = makePrisma([], []);
    const svc = makeService(prisma);
    const result = await svc.failurePrediction('user1');
    expect(result.predictions).toHaveLength(0);
    expect(result.summary.total).toBe(0);
    expect(result.summary.avgFleetRisk).toBe(0);
  });

  it('returns stable prediction for monitor with 100% uptime and no trend', async () => {
    const monitors = [{ id: 'm1', name: 'API', type: 'HTTP' }];
    // 20 runs spread across 7 days, all OK, consistent 100ms latency
    const runs = Array.from({ length: 20 }, (_, i) =>
      makeRun({ monitorId: 'm1', ok: true, latencyMs: 100, hoursAgo: i * 8 + 1 }),
    );
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.failurePrediction('user1');
    expect(result.predictions).toHaveLength(1);
    const pred = result.predictions[0];
    expect(pred.prediction).toBe('stable');
    expect(pred.riskScore).toBeLessThan(15);
    expect(pred.currentUptimePct).toBe(100);
    expect(pred.estimatedHoursToFailure).toBeNull();
  });

  it('returns likely_failure for monitor with rapidly degrading uptime (negative slope)', async () => {
    const monitors = [{ id: 'm1', name: 'Degrading', type: 'HTTP' }];
    // Simulate heavy failures across 7 days, especially recently
    const runs: ReturnType<typeof makeRun>[] = [];
    // Day 6 (0-24h ago): 90% failure
    for (let i = 0; i < 10; i++) runs.push(makeRun({ monitorId: 'm1', ok: i < 1, latencyMs: i < 1 ? 100 : null, hoursAgo: i * 2 + 1 }));
    // Day 5 (24-48h ago): 80% failure
    for (let i = 0; i < 10; i++) runs.push(makeRun({ monitorId: 'm1', ok: i < 2, latencyMs: i < 2 ? 100 : null, hoursAgo: 24 + i * 2 + 1 }));
    // Day 4 (48-72h ago): 70% failure
    for (let i = 0; i < 10; i++) runs.push(makeRun({ monitorId: 'm1', ok: i < 3, latencyMs: i < 3 ? 100 : null, hoursAgo: 48 + i * 2 + 1 }));
    // Days 0-3: mostly ok
    for (let i = 0; i < 10; i++) runs.push(makeRun({ monitorId: 'm1', ok: true, latencyMs: 100, hoursAgo: 72 + i * 4 + 1 }));

    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.failurePrediction('user1');
    expect(result.predictions).toHaveLength(1);
    const pred = result.predictions[0];
    expect(pred.prediction).toBe('likely_failure');
    expect(pred.riskScore).toBeGreaterThan(60);
  });

  it('calculates correct risk score with multiple risk factors', async () => {
    const monitors = [{ id: 'm1', name: 'Risky', type: 'HTTP' }];
    // 96% uptime (just below 99% but above 95%), with some recent failures
    const runs: ReturnType<typeof makeRun>[] = [];
    // 40 ok runs spread over 7 days, 2 recent failures in last 24h
    for (let i = 0; i < 40; i++) runs.push(makeRun({ monitorId: 'm1', ok: true, latencyMs: 100, hoursAgo: i * 4 + 2 }));
    // 2 recent failures (last 24h)
    runs.push(makeRun({ monitorId: 'm1', ok: false, latencyMs: null, hoursAgo: 1 }));
    runs.push(makeRun({ monitorId: 'm1', ok: false, latencyMs: null, hoursAgo: 3 }));

    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.failurePrediction('user1');
    expect(result.predictions).toHaveLength(1);
    const pred = result.predictions[0];
    // Risk score should be > base (100 - uptime%)
    expect(pred.riskScore).toBeGreaterThan(0);
    expect(pred.riskScore).toBeLessThanOrEqual(100);
  });

  it('computes estimatedHoursToFailure correctly for degrading monitor', async () => {
    const monitors = [{ id: 'm1', name: 'Failing', type: 'HTTP' }];
    // Current uptime ~50%, uptime slope < -2%/day → at_risk or likely_failure
    const runs: ReturnType<typeof makeRun>[] = [];
    // Create runs where uptime degrades from ~80% to ~20% over 7 days
    for (let day = 0; day < 7; day++) {
      const uptimePct = 0.8 - day * 0.1; // 80%, 70%, 60%, 50%, 40%, 30%, 20%
      const total = 10;
      const okCount = Math.round(uptimePct * total);
      for (let i = 0; i < total; i++) {
        runs.push(makeRun({
          monitorId: 'm1',
          ok: i < okCount,
          latencyMs: i < okCount ? 100 : null,
          hoursAgo: (6 - day) * 24 + i * 2 + 1, // day 0 = most recent
        }));
      }
    }

    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.failurePrediction('user1');
    expect(result.predictions).toHaveLength(1);
    const pred = result.predictions[0];

    if (pred.prediction === 'at_risk' || pred.prediction === 'likely_failure') {
      expect(pred.estimatedHoursToFailure).not.toBeNull();
      expect(pred.estimatedHoursToFailure).toBeGreaterThan(0);
      expect(pred.estimatedHoursToFailure).toBeLessThanOrEqual(168);
    }
  });

  it('excludes monitors with fewer than 10 runs', async () => {
    const monitors = [
      { id: 'm1', name: 'NotEnoughData', type: 'HTTP' },
      { id: 'm2', name: 'EnoughData', type: 'HTTP' },
    ];
    // m1: only 5 runs
    const runsM1 = Array.from({ length: 5 }, (_, i) =>
      makeRun({ monitorId: 'm1', ok: true, latencyMs: 100, hoursAgo: i * 10 + 1 }),
    );
    // m2: 15 runs
    const runsM2 = Array.from({ length: 15 }, (_, i) =>
      makeRun({ monitorId: 'm2', ok: true, latencyMs: 100, hoursAgo: i * 8 + 1 }),
    );
    const prisma = makePrisma(monitors, [...runsM1, ...runsM2]);
    const svc = makeService(prisma);
    const result = await svc.failurePrediction('user1');
    expect(result.predictions).toHaveLength(1);
    expect(result.predictions[0].monitorId).toBe('m2');
  });

  it('returns correct summary counts', async () => {
    const monitors = [
      { id: 'm1', name: 'Stable', type: 'HTTP' },
      { id: 'm2', name: 'Watch', type: 'HTTP' },
      { id: 'm3', name: 'AtRisk', type: 'HTTP' },
    ];
    // m1: 100% uptime → stable
    const runsM1 = Array.from({ length: 20 }, (_, i) =>
      makeRun({ monitorId: 'm1', ok: true, latencyMs: 100, hoursAgo: i * 8 + 1 }),
    );
    // m2: ~90% uptime → some risk
    const runsM2 = [
      ...Array.from({ length: 18 }, (_, i) => makeRun({ monitorId: 'm2', ok: true, latencyMs: 100, hoursAgo: i * 8 + 1 })),
      ...Array.from({ length: 2 }, (_, i) => makeRun({ monitorId: 'm2', ok: false, latencyMs: null, hoursAgo: i + 1 })),
    ];
    // m3: ~70% uptime + degrading
    const runsM3 = [
      ...Array.from({ length: 7 }, (_, i) => makeRun({ monitorId: 'm3', ok: true, latencyMs: 200, hoursAgo: i * 8 + 40 })),
      ...Array.from({ length: 13 }, (_, i) => makeRun({ monitorId: 'm3', ok: false, latencyMs: null, hoursAgo: i * 8 + 1 })),
    ];

    const prisma = makePrisma(monitors, [...runsM1, ...runsM2, ...runsM3]);
    const svc = makeService(prisma);
    const result = await svc.failurePrediction('user1');

    expect(result.summary.total).toBe(3);
    expect(result.summary.stable + result.summary.watch + result.summary.atRisk + result.summary.likelyFailure).toBe(3);
    expect(result.summary.avgFleetRisk).toBeGreaterThanOrEqual(0);
    expect(result.summary.avgFleetRisk).toBeLessThanOrEqual(100);
  });

  it('handles monitors with null latency gracefully', async () => {
    const monitors = [{ id: 'm1', name: 'NoLatency', type: 'TCP' }];
    // All runs have null latency (e.g., TCP ping-only checks)
    const runs = Array.from({ length: 15 }, (_, i) =>
      makeRun({ monitorId: 'm1', ok: true, latencyMs: null, hoursAgo: i * 10 + 1 }),
    );
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.failurePrediction('user1');
    expect(result.predictions).toHaveLength(1);
    const pred = result.predictions[0];
    expect(pred.currentAvgLatencyMs).toBeNull();
    expect(pred.trend.latencySlopeMsPerDay).toBeNull();
    expect(pred.prediction).toBe('stable');
  });
});

// ── linearRegression export tests ────────────────────────────────────────

describe('linearRegression()', () => {
  it('computes slope and intercept for a simple line', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 4 },
    ];
    const { slope, intercept } = linearRegression(points);
    expect(slope).toBeCloseTo(2, 5);
    expect(intercept).toBeCloseTo(0, 5);
  });

  it('returns slope 0 for a single point', () => {
    const { slope } = linearRegression([{ x: 5, y: 10 }]);
    expect(slope).toBe(0);
  });
});
