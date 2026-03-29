import { describe, it, expect, vi } from 'vitest';
import { MonitorsService } from './monitors.service';

type MockMonitor = { id: string; name: string; type: string; target: string; latencyAlertMs: number | null; latencyBudgetMs: number | null };
type MockRun = { monitorId: string; latencyMs: number | null; checkedAt: Date };

function makeDate(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
}

function buildService(monitors: MockMonitor[], runs: MockRun[]): MonitorsService {
  const prisma = {
    monitor: { findMany: vi.fn().mockResolvedValue(monitors) },
    monitorRun: { findMany: vi.fn().mockResolvedValue(runs) },
  };
  return new MonitorsService(prisma as never, {} as never, {} as never, {} as never, {} as never);
}

describe('MonitorsService.latencyBenchmark', () => {
  it('returns empty result for user with no HTTP/BROWSER monitors', async () => {
    const svc = buildService([], []);
    const result = await svc.latencyBenchmark('user-1');
    expect(result.monitors).toHaveLength(0);
    expect(result.summary.totalMonitors).toBe(0);
    expect(result.summary.fleetP50).toBeNull();
    expect(result.summary.fleetP95).toBeNull();
  });

  it('returns null percentiles for monitor with no run data', async () => {
    const monitors: MockMonitor[] = [
      { id: 'm1', name: 'API', type: 'HTTP', target: 'https://example.com', latencyAlertMs: null, latencyBudgetMs: null },
    ];
    const svc = buildService(monitors, []);
    const result = await svc.latencyBenchmark('user-1');
    expect(result.monitors).toHaveLength(1);
    expect(result.monitors[0].current.p50).toBeNull();
    expect(result.monitors[0].current.p95).toBeNull();
    expect(result.monitors[0].trend).toBe('new');
    expect(result.summary.monitorsWithData).toBe(0);
  });

  it('correctly computes P50/P95 percentiles from run data', async () => {
    const monitors: MockMonitor[] = [
      { id: 'm1', name: 'API', type: 'HTTP', target: 'https://api.example.com', latencyAlertMs: null, latencyBudgetMs: null },
    ];
    // 10 runs in last 7 days: values 100-1000ms step 100
    const runs: MockRun[] = Array.from({ length: 10 }, (_, i) => ({
      monitorId: 'm1',
      latencyMs: (i + 1) * 100,
      checkedAt: makeDate(i % 7),  // within 7 days
    }));
    const svc = buildService(monitors, runs);
    const result = await svc.latencyBenchmark('user-1');
    const m = result.monitors[0];
    // P50 of [100..1000] sorted → index floor(50/100 * 10) = 5 → 600ms
    expect(m.current.p50).toBeGreaterThanOrEqual(400);
    expect(m.current.p50).toBeLessThanOrEqual(700);
    // P95 should be near top
    expect(m.current.p95).toBeGreaterThanOrEqual(700);
    expect(m.current.samples).toBe(10);
  });

  it('detects degrading trend when current P95 > previous P95 by >10%', async () => {
    const monitors: MockMonitor[] = [
      { id: 'm1', name: 'API', type: 'HTTP', target: 'https://api.example.com', latencyAlertMs: null, latencyBudgetMs: null },
    ];
    // Previous period (8-13 days ago): all 200ms — strictly in [7d, 14d) ago window
    const prevRuns: MockRun[] = Array.from({ length: 6 }, (_, i) => ({
      monitorId: 'm1',
      latencyMs: 200,
      checkedAt: makeDate(8 + i),
    }));
    // Current period (0-6 days ago): all 800ms (much worse, avoids boundary at day 7)
    const currRuns: MockRun[] = Array.from({ length: 6 }, (_, i) => ({
      monitorId: 'm1',
      latencyMs: 800,
      checkedAt: makeDate(i),
    }));
    const svc = buildService(monitors, [...prevRuns, ...currRuns]);
    const result = await svc.latencyBenchmark('user-1');
    expect(result.monitors[0].trend).toBe('degrading');
    expect(result.summary.degradingCount).toBe(1);
    expect(result.summary.improvingCount).toBe(0);
  });

  it('flags p95ExceedsBudget when P95 > latencyBudgetMs', async () => {
    const monitors: MockMonitor[] = [
      { id: 'm1', name: 'API', type: 'HTTP', target: 'https://api.example.com', latencyAlertMs: null, latencyBudgetMs: 300 },
    ];
    // All runs at 500ms → P95 = 500 > 300 budget
    const runs: MockRun[] = Array.from({ length: 10 }, (_, i) => ({
      monitorId: 'm1',
      latencyMs: 500,
      checkedAt: makeDate(i % 7),
    }));
    const svc = buildService(monitors, runs);
    const result = await svc.latencyBenchmark('user-1');
    expect(result.monitors[0].p95ExceedsBudget).toBe(true);
    expect(result.summary.exceedingBudget).toBe(1);
  });

  it('assigns grade F for very high P95 latency and grade A for fast monitors', async () => {
    const monitors: MockMonitor[] = [
      { id: 'fast', name: 'Fast', type: 'HTTP', target: 'https://fast.example.com', latencyAlertMs: null, latencyBudgetMs: null },
      { id: 'slow', name: 'Slow', type: 'HTTP', target: 'https://slow.example.com', latencyAlertMs: null, latencyBudgetMs: null },
    ];
    const fastRuns: MockRun[] = Array.from({ length: 5 }, (_, i) => ({
      monitorId: 'fast',
      latencyMs: 50,  // Very fast → grade A
      checkedAt: makeDate(i),
    }));
    const slowRuns: MockRun[] = Array.from({ length: 5 }, (_, i) => ({
      monitorId: 'slow',
      latencyMs: 5000,  // Very slow → grade F
      checkedAt: makeDate(i),
    }));
    const svc = buildService(monitors, [...fastRuns, ...slowRuns]);
    const result = await svc.latencyBenchmark('user-1');
    const fast = result.monitors.find((m) => m.monitorId === 'fast');
    const slow = result.monitors.find((m) => m.monitorId === 'slow');
    expect(fast?.grade).toBe('A');
    expect(slow?.grade).toBe('F');
    expect(result.summary.gradeDistribution.A).toBe(1);
    expect(result.summary.gradeDistribution.F).toBe(1);
  });
});
