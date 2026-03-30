import { describe, it, expect, vi } from 'vitest';
import { MonitorsAnalyticsService } from './monitors-analytics.service';

type MockMonitor = { id: string; name: string; type: string; pinned: boolean; createdAt: Date; folder: null };
type MockRun = { monitorId: string; timingsJson: Record<string, unknown> | null };

function buildService(monitors: MockMonitor[], runs: MockRun[]): MonitorsAnalyticsService {
  const prisma = {
    monitor: { findMany: vi.fn().mockResolvedValue(monitors) },
    monitorRun: { findMany: vi.fn().mockResolvedValue(runs) },
  };
  return new (MonitorsAnalyticsService as unknown as new (...args: unknown[]) => MonitorsAnalyticsService)(prisma as never);
}

describe('MonitorsService.timingBreakdown', () => {
  it('returns empty result for no monitors', async () => {
    const svc = buildService([], []);
    const r = await svc.timingBreakdown('user-1', 30);
    expect(r.monitors).toHaveLength(0);
    expect(r.fleet.totalSamples).toBe(0);
    expect(r.fleet.bottleneck).toBeNull();
  });

  it('returns no monitor entries when no timing data exists', async () => {
    const monitors: MockMonitor[] = [
      { id: 'm1', name: 'API', type: 'HTTP', pinned: false, createdAt: new Date(), folder: null },
    ];
    const svc = buildService(monitors, []);
    const r = await svc.timingBreakdown('user-1', 30);
    expect(r.monitors).toHaveLength(0); // filtered out — no samples
  });

  it('computes avg timings correctly', async () => {
    const monitors: MockMonitor[] = [
      { id: 'm1', name: 'API', type: 'HTTP', pinned: false, createdAt: new Date(), folder: null },
    ];
    const runs: MockRun[] = [
      { monitorId: 'm1', timingsJson: { dnsMs: 10, tcpMs: 20, tlsMs: 30, ttfbMs: 100, downloadMs: 5 } },
      { monitorId: 'm1', timingsJson: { dnsMs: 20, tcpMs: 40, tlsMs: 50, ttfbMs: 200, downloadMs: 15 } },
    ];
    const svc = buildService(monitors, runs);
    const r = await svc.timingBreakdown('user-1', 30);
    expect(r.monitors).toHaveLength(1);
    expect(r.monitors[0].avgDnsMs).toBe(15); // (10+20)/2
    expect(r.monitors[0].avgTcpMs).toBe(30); // (20+40)/2
    expect(r.monitors[0].avgTtfbMs).toBe(150); // (100+200)/2
  });

  it('identifies TTFB as bottleneck when it dominates', async () => {
    const monitors: MockMonitor[] = [
      { id: 'm1', name: 'Slow API', type: 'HTTP', pinned: false, createdAt: new Date(), folder: null },
    ];
    const runs: MockRun[] = [
      { monitorId: 'm1', timingsJson: { dnsMs: 5, tcpMs: 10, tlsMs: 20, ttfbMs: 800, downloadMs: 10 } },
    ];
    const svc = buildService(monitors, runs);
    const r = await svc.timingBreakdown('user-1', 30);
    expect(r.monitors[0].bottleneck).toBe('ttfb');
    expect(r.monitors[0].bottleneckPct).toBeGreaterThan(80);
  });

  it('computes fleet-level bottleneck', async () => {
    const monitors: MockMonitor[] = [
      { id: 'm1', name: 'A', type: 'HTTP', pinned: false, createdAt: new Date(), folder: null },
      { id: 'm2', name: 'B', type: 'HTTP', pinned: false, createdAt: new Date(), folder: null },
    ];
    const runs: MockRun[] = [
      { monitorId: 'm1', timingsJson: { dnsMs: 5, tcpMs: 10, tlsMs: 20, ttfbMs: 500, downloadMs: 5 } },
      { monitorId: 'm2', timingsJson: { dnsMs: 5, tcpMs: 10, tlsMs: 20, ttfbMs: 600, downloadMs: 5 } },
    ];
    const svc = buildService(monitors, runs);
    const r = await svc.timingBreakdown('user-1', 30);
    expect(r.fleet.bottleneck).toBe('ttfb');
    expect(r.fleet.totalSamples).toBe(2);
  });

  it('clamps days to 1-90 range', async () => {
    const svc = buildService([], []);
    const r1 = await svc.timingBreakdown('user-1', 200);
    expect(r1.period.days).toBe(90);
    const r2 = await svc.timingBreakdown('user-1', 0);
    expect(r2.period.days).toBe(1);
  });
});
