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
      prisma.monitor.findMany.mockResolvedValue([
        makeMonitor({ id: 'm-1' }),
        makeMonitor({ id: 'm-2' }),
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
        makeMonitor({ id: 'm-1' }),
        makeMonitor({ id: 'm-2' }),
        makeMonitor({ id: 'm-3' }),
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
      prisma.monitor.findMany.mockResolvedValue([makeMonitor({ id: 'm-1' })]);
      prisma.monitorRun.findMany.mockResolvedValue([]); // no runs

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.stats.green).toBe(1);
      expect(result.stats.uptimePct).toBe(100);
    });

    it('returns latest runs with correct shape', async () => {
      prisma.monitor.findMany.mockResolvedValue([makeMonitor()]);
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

    it('caps latestRuns at 12 entries', async () => {
      prisma.monitor.findMany.mockResolvedValue([makeMonitor()]);
      const runs = Array.from({ length: 20 }, (_, i) => makeRun({ id: `r-${i}`, monitorId: 'm-1' }));
      prisma.monitorRun.findMany.mockResolvedValue(runs);

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.latestRuns).toHaveLength(12);
    });

    it('uses only the latest run per monitor for status calculation', async () => {
      prisma.monitor.findMany.mockResolvedValue([makeMonitor({ id: 'm-1' })]);
      // Runs ordered newest-first; first run is green, second is red — green should win
      prisma.monitorRun.findMany.mockResolvedValue([
        makeRun({ id: 'r-latest', monitorId: 'm-1', level: 'green', checkedAt: new Date('2026-01-02') }),
        makeRun({ id: 'r-older', monitorId: 'm-1', level: 'red', checkedAt: new Date('2026-01-01') }),
      ]);

      const result = await controller.overview({ user: { id: 'user-1' } });

      expect(result.stats.green).toBe(1);
      expect(result.stats.red).toBe(0);
    });
  });
});

// ── PublicDashboardController ───────────────────────────────────────────────

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
