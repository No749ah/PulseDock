import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorsService } from './monitors.service';

function makeRun(ok: boolean, latencyMs: number | null, offsetMs: number, fromNow = true) {
  const now = Date.now();
  return {
    monitorId: 'mon-1',
    ok,
    latencyMs,
    checkedAt: new Date(now - (fromNow ? offsetMs : offsetMs)),
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    monitor: {
      findMany: vi.fn(),
      ...((prismaOverrides.monitor as object | undefined) ?? {}),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue([]),
      ...((prismaOverrides.monitorRun as object | undefined) ?? {}),
    },
    ...prismaOverrides,
  };
  const service = new MonitorsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma };
}

const BASE_MONITOR = {
  id: 'mon-1',
  name: 'My API',
  type: 'HTTP',
  enabled: true,
  folderId: null,
  folder: null,
};

describe('MonitorsService.monitorTrends', () => {
  it('returns empty monitors array when user has no monitors', async () => {
    const { service, prisma } = makeService();
    prisma.monitor.findMany = vi.fn().mockResolvedValue([]);

    const result = await service.monitorTrends('user-1');

    expect(result.monitors).toHaveLength(0);
    expect(result.generatedAt).toBeTruthy();
  });

  it('marks monitor as "new" when no previous 7d runs exist', async () => {
    const { service, prisma } = makeService();
    prisma.monitor.findMany = vi.fn().mockResolvedValue([BASE_MONITOR]);

    // Only current-period runs (< 7 days ago)
    const currentRuns = [
      { ...makeRun(true, 100, 1 * 24 * 60 * 60 * 1000), monitorId: 'mon-1' },
      { ...makeRun(true, 120, 2 * 24 * 60 * 60 * 1000), monitorId: 'mon-1' },
    ];
    prisma.monitorRun.findMany = vi.fn().mockResolvedValue(currentRuns);

    const result = await service.monitorTrends('user-1');
    const mon = result.monitors[0];

    expect(mon.uptimeTrend).toBe('new');
    expect(mon.latencyTrend).toBe('new');
    expect(mon.previousChecks).toBe(0);
    expect(mon.currentChecks).toBe(2);
  });

  it('detects degrading trend when uptime drops >2pp', async () => {
    const { service, prisma } = makeService();
    prisma.monitor.findMany = vi.fn().mockResolvedValue([BASE_MONITOR]);

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    // Current: 7/10 ok = 70%
    const currentRuns = Array.from({ length: 10 }, (_, i) => ({
      monitorId: 'mon-1',
      ok: i < 7,
      latencyMs: 100,
      checkedAt: new Date(now - (i + 1) * DAY * 0.5), // within last 7 days
    }));

    // Previous: 10/10 ok = 100%
    const previousRuns = Array.from({ length: 10 }, (_, i) => ({
      monitorId: 'mon-1',
      ok: true,
      latencyMs: 100,
      checkedAt: new Date(now - 7 * DAY - (i + 1) * DAY * 0.5), // 7-14 days ago
    }));

    prisma.monitorRun.findMany = vi.fn().mockResolvedValue([...currentRuns, ...previousRuns]);

    const result = await service.monitorTrends('user-1');
    const mon = result.monitors[0];

    expect(mon.uptimeTrend).toBe('degrading');
    expect(mon.uptimeDelta).toBeLessThan(-2);
  });

  it('detects improving trend when uptime rises >2pp', async () => {
    const { service, prisma } = makeService();
    prisma.monitor.findMany = vi.fn().mockResolvedValue([BASE_MONITOR]);

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    // Current: 10/10 ok = 100%
    const currentRuns = Array.from({ length: 10 }, (_, i) => ({
      monitorId: 'mon-1',
      ok: true,
      latencyMs: 100,
      checkedAt: new Date(now - (i + 1) * DAY * 0.5),
    }));

    // Previous: 7/10 ok = 70%
    const previousRuns = Array.from({ length: 10 }, (_, i) => ({
      monitorId: 'mon-1',
      ok: i < 7,
      latencyMs: 100,
      checkedAt: new Date(now - 7 * DAY - (i + 1) * DAY * 0.5),
    }));

    prisma.monitorRun.findMany = vi.fn().mockResolvedValue([...currentRuns, ...previousRuns]);

    const result = await service.monitorTrends('user-1');
    const mon = result.monitors[0];

    expect(mon.uptimeTrend).toBe('improving');
    expect(mon.uptimeDelta).toBeGreaterThan(2);
  });

  it('marks latency as degrading when avg latency increases >10%', async () => {
    const { service, prisma } = makeService();
    prisma.monitor.findMany = vi.fn().mockResolvedValue([BASE_MONITOR]);

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    // Current: avg 200ms (was 100ms → +100%)
    const currentRuns = Array.from({ length: 5 }, (_, i) => ({
      monitorId: 'mon-1',
      ok: true,
      latencyMs: 200,
      checkedAt: new Date(now - (i + 1) * DAY * 0.5),
    }));

    // Previous: avg 100ms
    const previousRuns = Array.from({ length: 5 }, (_, i) => ({
      monitorId: 'mon-1',
      ok: true,
      latencyMs: 100,
      checkedAt: new Date(now - 7 * DAY - (i + 1) * DAY * 0.5),
    }));

    prisma.monitorRun.findMany = vi.fn().mockResolvedValue([...currentRuns, ...previousRuns]);

    const result = await service.monitorTrends('user-1');
    const mon = result.monitors[0];

    expect(mon.latencyTrend).toBe('degrading');
    expect(mon.latencyDeltaPct).toBeGreaterThan(10);
    expect(mon.currentAvgLatencyMs).toBe(200);
    expect(mon.previousAvgLatencyMs).toBe(100);
  });
});
