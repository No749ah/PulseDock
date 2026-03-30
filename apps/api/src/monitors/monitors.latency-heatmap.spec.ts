import { describe, it, expect, vi } from 'vitest';
import { MonitorsAnalyticsService } from './monitors-analytics.service';

type MockMonitor = { id: string; name: string; type: string; pinned: boolean; createdAt: Date; folder: { name: string } | null };
type MockRun = { monitorId: string; latencyMs: number | null; checkedAt: Date; ok: boolean };

function makeDate(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
}

function buildService(monitors: MockMonitor[], runs: MockRun[]): MonitorsAnalyticsService {
  const prisma = {
    monitor: { findMany: vi.fn().mockResolvedValue(monitors) },
    monitorRun: { findMany: vi.fn().mockResolvedValue(runs) },
  };
  return new (MonitorsAnalyticsService as unknown as new (...args: unknown[]) => MonitorsAnalyticsService)(prisma as never);
}

describe('MonitorsService.latencyHeatmap', () => {
  it('returns empty result with correct date count for empty fleet', async () => {
    const svc = buildService([], []);
    const result = await svc.latencyHeatmap('user-1', 7);
    expect(result.monitors).toHaveLength(0);
    expect(result.dates).toHaveLength(7);
    expect(result.summary.avgFleetLatency).toBeNull();
    expect(result.summary.bestDay).toBeNull();
    expect(result.summary.worstDay).toBeNull();
  });

  it('returns null grade for all cells when monitor has no runs', async () => {
    const monitors: MockMonitor[] = [
      { id: 'm1', name: 'API', type: 'HTTP', pinned: false, createdAt: new Date(), folder: null },
    ];
    const svc = buildService(monitors, []);
    const result = await svc.latencyHeatmap('user-1', 7);
    expect(result.monitors).toHaveLength(1);
    result.monitors[0].days.forEach(cell => {
      expect(cell.grade).toBeNull();
      expect(cell.avgLatencyMs).toBeNull();
      expect(cell.samples).toBe(0);
    });
  });

  it('assigns grade A for fast monitors and grade F for slow monitors', async () => {
    const monitors: MockMonitor[] = [
      { id: 'fast', name: 'Fast', type: 'HTTP', pinned: false, createdAt: new Date(), folder: null },
      { id: 'slow', name: 'Slow', type: 'HTTP', pinned: false, createdAt: new Date(), folder: null },
    ];
    const today = new Date().toISOString().slice(0, 10);
    const runs: MockRun[] = [
      { monitorId: 'fast', latencyMs: 50, checkedAt: makeDate(0), ok: true },
      { monitorId: 'fast', latencyMs: 80, checkedAt: makeDate(0), ok: true },
      { monitorId: 'slow', latencyMs: 3000, checkedAt: makeDate(0), ok: true },
      { monitorId: 'slow', latencyMs: 4000, checkedAt: makeDate(0), ok: true },
    ];
    const svc = buildService(monitors, runs);
    const result = await svc.latencyHeatmap('user-1', 7);
    const fast = result.monitors.find(m => m.id === 'fast')!;
    const slow = result.monitors.find(m => m.id === 'slow')!;
    const fastToday = fast.days.find(d => d.date === today);
    const slowToday = slow.days.find(d => d.date === today);
    expect(fastToday?.grade).toBe('A');
    expect(slowToday?.grade).toBe('F');
  });

  it('computes bestDay and worstDay from fleet averages', async () => {
    const monitors: MockMonitor[] = [
      { id: 'm1', name: 'API', type: 'HTTP', pinned: false, createdAt: new Date(), folder: null },
    ];
    // Day 0 (today): fast 100ms
    // Day 1 (yesterday): slow 1500ms
    const day0 = makeDate(0).toISOString().slice(0, 10);
    const day1 = makeDate(1).toISOString().slice(0, 10);
    const runs: MockRun[] = [
      { monitorId: 'm1', latencyMs: 100, checkedAt: makeDate(0), ok: true },
      { monitorId: 'm1', latencyMs: 1500, checkedAt: makeDate(1), ok: true },
    ];
    const svc = buildService(monitors, runs);
    const result = await svc.latencyHeatmap('user-1', 7);
    expect(result.summary.bestDay).toBe(day0);
    expect(result.summary.worstDay).toBe(day1);
  });

  it('clamps days to 1-90 range', async () => {
    const svc = buildService([], []);
    const r1 = await svc.latencyHeatmap('user-1', 200);
    expect(r1.dates).toHaveLength(90);
    const r2 = await svc.latencyHeatmap('user-1', 0);
    expect(r2.dates).toHaveLength(1);
  });
});
