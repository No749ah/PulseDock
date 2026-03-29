import { describe, it, expect, vi } from 'vitest';
import { MonitorsService } from './monitors.service';

type MockMonitor = { id: string; name: string; type: string; pinned: boolean; createdAt: Date; folder: { name: string } | null };
type MockRun = { monitorId: string; ok: boolean; latencyMs: number | null; checkedAt: Date };

function buildService(monitors: MockMonitor[], runs: MockRun[], incidents: unknown[] = []): MonitorsService {
  const prisma = {
    monitor: { findMany: vi.fn().mockResolvedValue(monitors) },
    monitorRun: { findMany: vi.fn().mockResolvedValue(runs) },
    incident: { findMany: vi.fn().mockResolvedValue(incidents) },
  };
  return new MonitorsService(prisma as never, {} as never, {} as never, {} as never, {} as never);
}

function makeDate(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
}

describe('MonitorsService.reliabilityTrend', () => {
  it('returns empty result with correct week count for empty fleet', async () => {
    const svc = buildService([], []);
    const result = await svc.reliabilityTrend('user-1', 4);
    expect(result.monitors).toHaveLength(0);
    expect(result.weekStarts).toHaveLength(4);
    expect(result.summary.avgCurrentScore).toBeNull();
  });

  it('clamps weeks to 2-26 range', async () => {
    const svc = buildService([], []);
    const r1 = await svc.reliabilityTrend('user-1', 100);
    expect(r1.weekStarts).toHaveLength(26);
    const r2 = await svc.reliabilityTrend('user-1', 0);
    expect(r2.weekStarts).toHaveLength(2);
  });

  it('returns null score for monitor with no runs', async () => {
    const monitors: MockMonitor[] = [
      { id: 'm1', name: 'API', type: 'HTTP', pinned: false, createdAt: new Date(), folder: null },
    ];
    const svc = buildService(monitors, []);
    const result = await svc.reliabilityTrend('user-1', 4);
    result.monitors[0].weeks.forEach(w => {
      expect(w.score).toBeNull();
      expect(w.checksTotal).toBe(0);
    });
    expect(result.monitors[0].trend).toBe('new');
  });

  it('computes score correctly for 100% uptime with fast latency', async () => {
    const monitors: MockMonitor[] = [
      { id: 'm1', name: 'Fast API', type: 'HTTP', pinned: false, createdAt: new Date(), folder: null },
    ];
    const runs: MockRun[] = [
      { monitorId: 'm1', ok: true, latencyMs: 100, checkedAt: makeDate(1) },
      { monitorId: 'm1', ok: true, latencyMs: 150, checkedAt: makeDate(2) },
    ];
    const svc = buildService(monitors, runs);
    const result = await svc.reliabilityTrend('user-1', 4);
    const weekWithData = result.monitors[0].weeks.find(w => w.checksTotal > 0);
    expect(weekWithData).toBeDefined();
    expect(weekWithData!.uptimePct).toBe(100);
    expect(weekWithData!.score).toBeGreaterThan(90);
  });

  it('detects degrading trend when score drops', async () => {
    const monitors: MockMonitor[] = [
      { id: 'm1', name: 'Flaky', type: 'HTTP', pinned: false, createdAt: new Date(), folder: null },
    ];
    const runs: MockRun[] = [
      { monitorId: 'm1', ok: true, latencyMs: 100, checkedAt: makeDate(10) },
      { monitorId: 'm1', ok: true, latencyMs: 100, checkedAt: makeDate(11) },
      { monitorId: 'm1', ok: true, latencyMs: 100, checkedAt: makeDate(12) },
      { monitorId: 'm1', ok: true, latencyMs: 100, checkedAt: makeDate(13) },
      { monitorId: 'm1', ok: false, latencyMs: null, checkedAt: makeDate(3) },
      { monitorId: 'm1', ok: false, latencyMs: null, checkedAt: makeDate(4) },
      { monitorId: 'm1', ok: false, latencyMs: null, checkedAt: makeDate(5) },
      { monitorId: 'm1', ok: true, latencyMs: 4000, checkedAt: makeDate(2) },
    ];
    const svc = buildService(monitors, runs);
    const result = await svc.reliabilityTrend('user-1', 4);
    expect(result.monitors[0].trend).toBe('degrading');
  });

  it('computes summary counts for mixed fleet', async () => {
    const monitors: MockMonitor[] = [
      { id: 'good', name: 'Good', type: 'HTTP', pinned: false, createdAt: new Date(), folder: null },
      { id: 'bad', name: 'Bad', type: 'HTTP', pinned: false, createdAt: new Date(), folder: null },
    ];
    const runs: MockRun[] = [
      { monitorId: 'good', ok: false, latencyMs: null, checkedAt: makeDate(10) },
      { monitorId: 'good', ok: true, latencyMs: 100, checkedAt: makeDate(2) },
      { monitorId: 'good', ok: true, latencyMs: 100, checkedAt: makeDate(3) },
      { monitorId: 'bad', ok: true, latencyMs: 100, checkedAt: makeDate(10) },
      { monitorId: 'bad', ok: false, latencyMs: null, checkedAt: makeDate(2) },
      { monitorId: 'bad', ok: false, latencyMs: null, checkedAt: makeDate(3) },
    ];
    const svc = buildService(monitors, runs);
    const result = await svc.reliabilityTrend('user-1', 4);
    expect(result.summary.improving + result.summary.degrading).toBeGreaterThan(0);
    expect(result.summary.avgCurrentScore).not.toBeNull();
  });
});
