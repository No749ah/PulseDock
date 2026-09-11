import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { PublicDashboardController } from './public.controller';

function makeMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    userId: 'user-1',
    name: 'Test Monitor',
    type: 'HTTP',
    target: 'https://example.com',
    intervalSec: 60,
    enabled: true,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    userId: 'user-1',
    monitorId: 'm-1',
    checkedAt: new Date('2026-01-01T12:00:00Z'),
    ok: true,
    status: 200,
    latencyMs: 42,
    message: 'OK',
    level: 'green',
    ...overrides,
  };
}

function makePrisma() {
  return {
    monitor: {
      findMany: vi.fn(),
    },
    monitorRun: {
      findMany: vi.fn(),
    },
    monitorEvent: {
      findMany: vi.fn(),
    },
    incident: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };
}

// ── DashboardController ─────────────────────────────────────────────────────

describe('DashboardController', () => {
  let controller: DashboardController;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new DashboardController(prisma as never);
    // Provide sensible defaults so tests only need to mock what they care about
    prisma.incident.findMany.mockResolvedValue([]);
    prisma.monitorEvent.findMany.mockResolvedValue([]);
  });

  describe('overview()', () => {
    it('returns correct stats with no monitors', async () => {
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.monitorRun.findMany.mockResolvedValue([]);

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.stats.totalMonitors).toBe(0);
      expect(result.stats.green).toBe(0);
      expect(result.stats.yellow).toBe(0);
      expect(result.stats.red).toBe(0);
      expect(result.stats.uptimePct).toBe(100);
      expect(result.latestRuns).toHaveLength(0);
    });

    it('counts green monitors correctly', async () => {
      // monitors now include embedded runs via include: { runs: { take: 1 } }
      prisma.monitor.findMany.mockResolvedValue([
        makeMonitor({ id: 'm-1', runs: [makeRun({ id: 'r-1', monitorId: 'm-1', level: 'green' })] }),
        makeMonitor({ id: 'm-2', runs: [makeRun({ id: 'r-2', monitorId: 'm-2', level: 'green' })] }),
      ]);
      prisma.monitorRun.findMany.mockResolvedValue([
        makeRun({ id: 'r-1', monitorId: 'm-1', level: 'green' }),
        makeRun({ id: 'r-2', monitorId: 'm-2', level: 'green' }),
      ]);

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.stats.totalMonitors).toBe(2);
      expect(result.stats.green).toBe(2);
      expect(result.stats.yellow).toBe(0);
      expect(result.stats.red).toBe(0);
      expect(result.stats.uptimePct).toBe(100);
    });

    it('counts yellow and red monitors correctly', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        makeMonitor({ id: 'm-1', runs: [makeRun({ monitorId: 'm-1', level: 'green' })] }),
        makeMonitor({ id: 'm-2', runs: [makeRun({ monitorId: 'm-2', level: 'yellow' })] }),
        makeMonitor({ id: 'm-3', runs: [makeRun({ monitorId: 'm-3', level: 'red' })] }),
      ]);
      prisma.monitorRun.findMany.mockResolvedValue([
        makeRun({ monitorId: 'm-1', level: 'green' }),
        makeRun({ monitorId: 'm-2', level: 'yellow' }),
        makeRun({ monitorId: 'm-3', level: 'red' }),
      ]);

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.stats.green).toBe(1);
      expect(result.stats.yellow).toBe(1);
      expect(result.stats.red).toBe(1);
      expect(result.stats.uptimePct).toBeCloseTo(33.33, 1);
    });

    it('treats monitors with no runs as green', async () => {
      // Monitor with empty runs array (no prior checks)
      prisma.monitor.findMany.mockResolvedValue([makeMonitor({ id: 'm-1', runs: [] })]);
      prisma.monitorRun.findMany.mockResolvedValue([]);

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.stats.green).toBe(1);
      expect(result.stats.uptimePct).toBe(100);
    });

    it('returns latest runs with correct shape', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        makeMonitor({ runs: [makeRun({ id: 'r-1', checkedAt: new Date('2026-01-01T12:00:00Z'), level: 'green' })] }),
      ]);
      prisma.monitorRun.findMany.mockResolvedValue([
        makeRun({ id: 'r-1', checkedAt: new Date('2026-01-01T12:00:00Z'), status: 200 }),
      ]);

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.latestRuns).toHaveLength(1);
      expect(result.latestRuns[0]).toMatchObject({
        id: 'r-1',
        monitorId: 'm-1',
        ok: true,
        statusCode: 200,
        latencyMs: 42,
        message: 'OK',
        level: 'green',
      });
      expect(typeof result.latestRuns[0]?.checkedAt).toBe('string');
    });

    it('latestRuns reflects the take:20 from monitorRun.findMany', async () => {
      prisma.monitor.findMany.mockResolvedValue([makeMonitor({ runs: [] })]);
      const runs = Array.from({ length: 20 }, (_, i) => makeRun({ id: `r-${i}`, monitorId: 'm-1' }));
      prisma.monitorRun.findMany.mockResolvedValue(runs);

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.latestRuns).toHaveLength(20);
    });

    it('uses only the latest run per monitor for status calculation', async () => {
      // Monitor has only the latest run embedded (take:1)
      prisma.monitor.findMany.mockResolvedValue([
        makeMonitor({ id: 'm-1', runs: [makeRun({ id: 'r-latest', monitorId: 'm-1', level: 'green' })] }),
      ]);
      prisma.monitorRun.findMany.mockResolvedValue([
        makeRun({ id: 'r-latest', monitorId: 'm-1', level: 'green' }),
        makeRun({ id: 'r-older', monitorId: 'm-1', level: 'red' }),
      ]);

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.stats.green).toBe(1);
      expect(result.stats.red).toBe(0);
    });

    it('separates uptime monitors from version monitors', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        makeMonitor({ id: 'm-http', type: 'HTTP', runs: [makeRun({ level: 'green' })] }),
        makeMonitor({ id: 'm-tcp', type: 'TCP', runs: [makeRun({ level: 'yellow' })] }),
        makeMonitor({ id: 'm-git', type: 'GIT_RELEASE', runs: [makeRun({ level: 'green' })] }),
        makeMonitor({ id: 'm-docker', type: 'DOCKER_IMAGE', runs: [makeRun({ level: 'yellow' })] }),
      ]);
      prisma.monitorRun.findMany.mockResolvedValue([]);

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.stats.uptimeMonitors).toBe(2);
      expect(result.stats.uptimeGreen).toBe(1);
      expect(result.stats.uptimeYellow).toBe(1);
      expect(result.stats.uptimeRed).toBe(0);
      expect(result.stats.versionMonitors).toBe(2);
      expect(result.stats.versionUpToDate).toBe(1);
      expect(result.stats.versionUpdateAvailable).toBe(1);
      expect(result.stats.versionMajorBehind).toBe(0);
    });

    it('counts version red (major behind) monitors', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        makeMonitor({ id: 'm-git', type: 'GIT_RELEASE', runs: [makeRun({ level: 'red' })] }),
      ]);
      prisma.monitorRun.findMany.mockResolvedValue([]);

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.stats.versionMajorBehind).toBe(1);
      expect(result.stats.versionUpToDate).toBe(0);
    });

    it('counts SSL_CERT and HEARTBEAT as uptime monitors', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        makeMonitor({ id: 'm-ssl', type: 'SSL_CERT', runs: [makeRun({ level: 'green' })] }),
        makeMonitor({ id: 'm-hb', type: 'HEARTBEAT', runs: [makeRun({ level: 'red' })] }),
      ]);
      prisma.monitorRun.findMany.mockResolvedValue([]);

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.stats.uptimeMonitors).toBe(2);
      expect(result.stats.uptimeGreen).toBe(1);
      expect(result.stats.uptimeRed).toBe(1);
      expect(result.stats.uptimePct).toBe(50);
    });

    it('version monitors with no runs are counted as up-to-date', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        makeMonitor({ id: 'm-git', type: 'GIT_RELEASE', runs: [] }),
      ]);
      prisma.monitorRun.findMany.mockResolvedValue([]);

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.stats.versionUpToDate).toBe(1);
    });

    it('includes monitorType from run.monitor in latestRuns', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        makeMonitor({ id: 'm-1', type: 'HTTP', runs: [makeRun({ level: 'green' })] }),
      ]);
      prisma.monitorRun.findMany.mockResolvedValue([
        { ...makeRun({ id: 'r-1' }), monitor: { type: 'HTTP' } },
      ]);

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.latestRuns[0].monitorType).toBe('HTTP');
    });

    it('handles null monitor in latestRuns gracefully', async () => {
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.monitorRun.findMany.mockResolvedValue([
        { ...makeRun({ id: 'r-1' }), monitor: null },
      ]);

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.latestRuns[0].monitorType).toBeNull();
    });
  });
});

// ── PublicDashboardController ───────────────────────────────────────────────

describe('DashboardController.healthTimeline()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let controller: DashboardController;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new DashboardController(prisma as never);
  });

  it('returns empty timeline (null scores) when user has no uptime monitors', async () => {
    prisma.monitor.findMany.mockResolvedValue([]);
    const result = await controller.healthTimeline({ user: { id: 'user-1' } });
    expect(result.timeline).toHaveLength(30);
    expect(result.timeline[0].healthScore).toBeNull();
    expect(result.timeline[0].green).toBe(0);
    expect(result.timeline[0].total).toBe(0);
  });

  it('returns null for days with no check runs', async () => {
    prisma.monitor.findMany.mockResolvedValue([makeMonitor({ type: 'HTTP' })]);
    prisma.monitorRun.findMany.mockResolvedValue([]);
    const result = await controller.healthTimeline({ user: { id: 'user-1' } });
    expect(result.timeline).toHaveLength(30);
    result.timeline.forEach((d) => {
      expect(d.healthScore).toBeNull();
    });
  });

  it('returns 100 healthScore when all monitors green on a day', async () => {
    prisma.monitor.findMany.mockResolvedValue([makeMonitor({ type: 'HTTP', id: 'm-1' })]);
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    prisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ monitorId: 'm-1', level: 'green', checkedAt: today }),
    ]);
    const result = await controller.healthTimeline({ user: { id: 'user-1' } });
    const todayStr = today.toISOString().slice(0, 10);
    const day = result.timeline.find((d) => d.date === todayStr);
    expect(day).toBeDefined();
    expect(day!.healthScore).toBe(100);
    expect(day!.green).toBe(1);
    expect(day!.total).toBe(1);
  });

  it('returns 0 healthScore when all monitors red on a day', async () => {
    prisma.monitor.findMany.mockResolvedValue([makeMonitor({ type: 'HTTP', id: 'm-1' })]);
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    prisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ monitorId: 'm-1', level: 'red', checkedAt: today }),
    ]);
    const result = await controller.healthTimeline({ user: { id: 'user-1' } });
    const todayStr = today.toISOString().slice(0, 10);
    const day = result.timeline.find((d) => d.date === todayStr);
    expect(day!.healthScore).toBe(0);
    expect(day!.green).toBe(0);
    expect(day!.total).toBe(1);
  });

  it('marks a monitor red if ANY run on that day is red', async () => {
    prisma.monitor.findMany.mockResolvedValue([makeMonitor({ type: 'HTTP', id: 'm-1' })]);
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const today2 = new Date(today);
    today2.setUTCHours(14, 0, 0, 0);
    prisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ monitorId: 'm-1', level: 'green', checkedAt: today }),
      makeRun({ monitorId: 'm-1', level: 'red', id: 'r2', checkedAt: today2 }),
    ]);
    const result = await controller.healthTimeline({ user: { id: 'user-1' } });
    const todayStr = today.toISOString().slice(0, 10);
    const day = result.timeline.find((d) => d.date === todayStr);
    expect(day!.healthScore).toBe(0); // monitor had a red run → not green for the day
    expect(day!.green).toBe(0);
  });

  it('computes partial health score when some monitors green, some red', async () => {
    prisma.monitor.findMany.mockResolvedValue([
      makeMonitor({ type: 'HTTP', id: 'm-1' }),
      makeMonitor({ type: 'HTTP', id: 'm-2' }),
    ]);
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    prisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ monitorId: 'm-1', level: 'green', checkedAt: today }),
      makeRun({ monitorId: 'm-2', level: 'red', id: 'r2', checkedAt: today }),
    ]);
    const result = await controller.healthTimeline({ user: { id: 'user-1' } });
    const todayStr = today.toISOString().slice(0, 10);
    const day = result.timeline.find((d) => d.date === todayStr);
    expect(day!.healthScore).toBe(50);
    expect(day!.green).toBe(1);
    expect(day!.total).toBe(2);
  });

  it('respects the ?days query parameter', async () => {
    prisma.monitor.findMany.mockResolvedValue([]);
    const result7 = await controller.healthTimeline({ user: { id: 'user-1' } }, '7');
    expect(result7.timeline).toHaveLength(7);
    const result90 = await controller.healthTimeline({ user: { id: 'user-1' } }, '90');
    expect(result90.timeline).toHaveLength(90);
  });

  it('caps days at 90', async () => {
    prisma.monitor.findMany.mockResolvedValue([]);
    const result = await controller.healthTimeline({ user: { id: 'user-1' } }, '200');
    expect(result.timeline).toHaveLength(90);
  });

  it('defaults to 30 days with invalid/missing param', async () => {
    prisma.monitor.findMany.mockResolvedValue([]);
    const result = await controller.healthTimeline({ user: { id: 'user-1' } }, 'abc');
    expect(result.timeline).toHaveLength(30);
  });

  it('returns dates in ascending order (oldest first)', async () => {
    prisma.monitor.findMany.mockResolvedValue([]);
    const result = await controller.healthTimeline({ user: { id: 'user-1' } });
    const dates = result.timeline.map((d) => d.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});

describe('PublicDashboardController', () => {
  let controller: PublicDashboardController;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new PublicDashboardController(prisma as never);
  });

  describe('overview()', () => {
    it('throws NotFoundException if user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(controller.overview('unknown-user')).rejects.toThrow(NotFoundException);
    });

    it('returns public overview with monitor statuses', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
      prisma.monitor.findMany.mockResolvedValue([makeMonitor({ id: 'm-1', name: 'API' })]);
      prisma.monitorRun.findMany.mockResolvedValue([
        makeRun({ id: 'r-1', monitorId: 'm-1', level: 'green', latencyMs: 120 }),
      ]);

      const result = await controller.overview('user-1') as Record<string, unknown>;

      expect(result['totalMonitors']).toBe(1);
      expect(result['green']).toBe(1);
      expect(result['yellow']).toBe(0);
      expect(result['red']).toBe(0);
      expect(Array.isArray(result['monitors'])).toBe(true);
      const monitors = result['monitors'] as Array<Record<string, unknown>>;
      expect(monitors[0]).toMatchObject({ name: 'API', level: 'green' });
    });

    it('returns 100% uptime when no monitors exist', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
      prisma.monitor.findMany.mockResolvedValue([]);
      prisma.monitorRun.findMany.mockResolvedValue([]);

      const result = await controller.overview('user-1') as Record<string, unknown>;

      expect(result['uptimePct']).toBe(100);
      expect(result['totalMonitors']).toBe(0);
    });

    it('calculates per-monitor uptime percentage from run history', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
      prisma.monitor.findMany.mockResolvedValue([makeMonitor({ id: 'm-1' })]);
      // 3 green, 1 red = 75% uptime
      prisma.monitorRun.findMany.mockResolvedValue([
        makeRun({ monitorId: 'm-1', level: 'green', id: 'r1', checkedAt: new Date('2026-01-04') }),
        makeRun({ monitorId: 'm-1', level: 'green', id: 'r2', checkedAt: new Date('2026-01-03') }),
        makeRun({ monitorId: 'm-1', level: 'green', id: 'r3', checkedAt: new Date('2026-01-02') }),
        makeRun({ monitorId: 'm-1', level: 'red', id: 'r4', checkedAt: new Date('2026-01-01') }),
      ]);

      const result = await controller.overview('user-1') as Record<string, unknown>;
      const monitors = result['monitors'] as Array<Record<string, unknown>>;

      expect(monitors[0]?.['uptimePct']).toBe(75);
    });

    it('includes incident history in response', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
      prisma.monitor.findMany.mockResolvedValue([makeMonitor({ id: 'm-1' })]);
      prisma.monitorRun.findMany.mockResolvedValue([
        makeRun({ monitorId: 'm-1', level: 'red', ok: false, id: 'r1', checkedAt: new Date('2026-01-02') }),
        makeRun({ monitorId: 'm-1', level: 'green', ok: true, id: 'r2', checkedAt: new Date('2026-01-01') }),
      ]);

      const result = await controller.overview('user-1') as Record<string, unknown>;

      expect('incidents' in result).toBe(true);
    });
  });
});

// ── DashboardController.activityFeed() ─────────────────────────────────────

describe('DashboardController.activityFeed()', () => {
  let controller: DashboardController;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new DashboardController(prisma as never);
  });

  it('returns empty feed when no data', async () => {
    prisma.monitorRun.findMany.mockResolvedValue([]);
    prisma.monitorEvent.findMany.mockResolvedValue([]);
    prisma.incident.findMany.mockResolvedValue([]);

    const result = await controller.activityFeed({ user: { id: 'user-1' } }, 50);

    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
    expect(result.total).toBe(0);
  });

  it('merges check runs and events sorted by time desc', async () => {
    const t1 = new Date('2026-03-27T07:00:00Z');
    const t2 = new Date('2026-03-27T06:00:00Z');
    const t3 = new Date('2026-03-27T05:00:00Z');

    prisma.monitorRun.findMany.mockResolvedValue([
      { id: 'r1', level: 'red', ok: false, status: 503, latencyMs: null, message: 'Down', checkedAt: t1, monitor: { id: 'm1', name: 'API', type: 'HTTP' } },
      { id: 'r2', level: 'green', ok: true, status: 200, latencyMs: 50, message: 'OK', checkedAt: t3, monitor: { id: 'm1', name: 'API', type: 'HTTP' } },
    ]);
    prisma.monitorEvent.findMany.mockResolvedValue([
      { id: 'e1', message: 'Deployed v2', eventType: 'deploy', createdAt: t2, monitor: { id: 'm1', name: 'API', type: 'HTTP' } },
    ]);
    prisma.incident.findMany.mockResolvedValue([]);

    const result = await controller.activityFeed({ user: { id: 'user-1' } }, 50);

    expect(result.items).toHaveLength(3);
    expect(result.items[0]!.kind).toBe('check');
    expect((result.items[0] as { ts: Date }).ts.getTime()).toBe(t1.getTime());
    expect(result.items[1]!.kind).toBe('event');
    expect(result.items[2]!.kind).toBe('check');
  });

  it('respects limit and sets nextCursor', async () => {
    const runs = Array.from({ length: 3 }, (_, i) => ({
      id: `r${i}`,
      level: 'red',
      ok: false,
      status: 503,
      latencyMs: null,
      message: 'Down',
      checkedAt: new Date(Date.now() - i * 1000),
      monitor: { id: 'm1', name: 'API', type: 'HTTP' },
    }));
    prisma.monitorRun.findMany.mockResolvedValue(runs);
    prisma.monitorEvent.findMany.mockResolvedValue([]);
    prisma.incident.findMany.mockResolvedValue([]);

    const result = await controller.activityFeed({ user: { id: 'user-1' } }, 2);

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
  });

  it('includes incident items in feed', async () => {
    prisma.monitorRun.findMany.mockResolvedValue([]);
    prisma.monitorEvent.findMany.mockResolvedValue([]);
    prisma.incident.findMany.mockResolvedValue([
      {
        id: 'inc1',
        title: 'API Outage',
        status: 'INVESTIGATING',
        severity: 'HIGH',
        createdAt: new Date('2026-03-27T08:00:00Z'),
        resolvedAt: null,
        monitors: [{ monitor: { id: 'm1', name: 'API' } }],
      },
    ]);

    const result = await controller.activityFeed({ user: { id: 'user-1' } }, 50);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.kind).toBe('incident');
    expect((result.items[0] as { title: string }).title).toBe('API Outage');
  });

  it('filters by kinds parameter (check only)', async () => {
    prisma.monitorRun.findMany.mockResolvedValue([
      { id: 'r1', level: 'red', ok: false, status: 503, latencyMs: null, message: 'Down', checkedAt: new Date(), monitor: { id: 'm1', name: 'API', type: 'HTTP' } },
    ]);
    prisma.monitorEvent.findMany.mockResolvedValue([]);
    prisma.incident.findMany.mockResolvedValue([]);

    const result = await controller.activityFeed({ user: { id: 'user-1' } }, 50, undefined, undefined, 'check');

    expect(result.items.every(i => i.kind === 'check')).toBe(true);
  });
});
