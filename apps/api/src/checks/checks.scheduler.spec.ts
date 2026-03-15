import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChecksScheduler } from './checks.scheduler';

function makeMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'monitor-1',
    userId: 'user-1',
    name: 'Test Monitor',
    type: 'GIT_RELEASE',
    target: 'nestjs/nest',
    intervalSec: 60,
    timeoutMs: 5000,
    configJson: {},
    folderId: null,
    enabled: true,
    createdAt: new Date('2026-01-01'),
    runs: [] as Array<{ checkedAt: Date }>,
    ...overrides,
  };
}

function makePrisma(monitors?: ReturnType<typeof makeMonitor>[]) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitors ?? []),
    },
    monitorRun: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function makeChecksService() {
  return {
    runMonitor: vi.fn().mockResolvedValue({ ok: true, message: 'up to date', level: 'green' }),
  };
}

function makeScheduler(
  prismaOverride?: ReturnType<typeof makePrisma>,
  checksOverride?: ReturnType<typeof makeChecksService>,
) {
  return new ChecksScheduler(
    (prismaOverride ?? makePrisma()) as never,
    (checksOverride ?? makeChecksService()) as never,
  );
}

describe('ChecksScheduler', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let checks: ReturnType<typeof makeChecksService>;
  let scheduler: ChecksScheduler;

  beforeEach(() => {
    prisma = makePrisma([]);
    checks = makeChecksService();
    scheduler = makeScheduler(prisma, checks);
  });

  // ─── tick() ─────────────────────────────────────────────────────────────────

  describe('tick()', () => {
    it('does nothing when there are no enabled monitors', async () => {
      prisma.monitor.findMany.mockResolvedValue([]);
      await scheduler.tick();
      expect(checks.runMonitor).not.toHaveBeenCalled();
    });

    it('does nothing when all monitors ran recently (not due)', async () => {
      const recentRun = { checkedAt: new Date(Date.now() - 5_000) }; // 5s ago, interval is 60s
      const monitor = makeMonitor({ intervalSec: 60, runs: [recentRun] });
      prisma.monitor.findMany.mockResolvedValue([monitor]);

      await scheduler.tick();
      expect(checks.runMonitor).not.toHaveBeenCalled();
    });

    it('runs monitors that are due (no previous run)', async () => {
      const monitor = makeMonitor({ runs: [] }); // never ran → always due
      prisma.monitor.findMany.mockResolvedValue([monitor]);

      await scheduler.tick();
      expect(checks.runMonitor).toHaveBeenCalledOnce();
      expect(checks.runMonitor).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'monitor-1', userId: 'user-1' }),
      );
    });

    it('runs monitors whose last run is older than intervalSec', async () => {
      const oldRun = { checkedAt: new Date(Date.now() - 120_000) }; // 2 min ago, interval 60s → due
      const monitor = makeMonitor({ intervalSec: 60, runs: [oldRun] });
      prisma.monitor.findMany.mockResolvedValue([monitor]);

      await scheduler.tick();
      expect(checks.runMonitor).toHaveBeenCalledOnce();
    });

    it('runs multiple due monitors concurrently', async () => {
      const due = [
        makeMonitor({ id: 'monitor-1', runs: [] }),
        makeMonitor({ id: 'monitor-2', runs: [] }),
        makeMonitor({ id: 'monitor-3', runs: [] }),
      ];
      prisma.monitor.findMany.mockResolvedValue(due);

      await scheduler.tick();
      expect(checks.runMonitor).toHaveBeenCalledTimes(3);
    });

    it('logs a warning when some monitors fail but does not throw', async () => {
      const monitor = makeMonitor({ runs: [] });
      prisma.monitor.findMany.mockResolvedValue([monitor]);
      checks.runMonitor.mockRejectedValue(new Error('check failed'));

      // Should not throw — just log warning
      await expect(scheduler.tick()).resolves.not.toThrow();
    });

    it('continues running other monitors when one fails', async () => {
      const monitors = [
        makeMonitor({ id: 'monitor-1', runs: [] }),
        makeMonitor({ id: 'monitor-2', runs: [] }),
        makeMonitor({ id: 'monitor-3', runs: [] }),
      ];
      prisma.monitor.findMany.mockResolvedValue(monitors);

      let callCount = 0;
      checks.runMonitor.mockImplementation(() => {
        callCount++;
        if (callCount === 2) return Promise.reject(new Error('monitor 2 failed'));
        return Promise.resolve({ ok: true });
      });

      await expect(scheduler.tick()).resolves.not.toThrow();
      // All 3 were attempted even though one failed
      expect(checks.runMonitor).toHaveBeenCalledTimes(3);
    });

    it('queries only enabled monitors', async () => {
      await scheduler.tick();
      expect(prisma.monitor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { enabled: true } }),
      );
    });

    it('passes correct shape to runMonitor', async () => {
      const monitor = makeMonitor({
        id: 'monitor-42',
        type: 'HTTP',
        target: 'https://example.com',
        configJson: { method: 'GET' },
        runs: [],
      });
      prisma.monitor.findMany.mockResolvedValue([monitor]);

      await scheduler.tick();

      expect(checks.runMonitor).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'monitor-42',
          type: 'HTTP',
          target: 'https://example.com',
          config: { method: 'GET' },
          alertChannelIds: [],
        }),
      );
    });

    it('defaults config to {} when monitor configJson is null', async () => {
      const monitor = makeMonitor({ configJson: null, runs: [] });
      prisma.monitor.findMany.mockResolvedValue([monitor]);
      await scheduler.tick();
      expect(checks.runMonitor).toHaveBeenCalledWith(
        expect.objectContaining({ config: {} }),
      );
    });
  });

  describe('pruneOldRuns()', () => {
    it('deletes MonitorRun records older than retention cutoff', async () => {
      prisma.monitorRun.deleteMany.mockResolvedValue({ count: 42 });
      await scheduler.pruneOldRuns();
      expect(prisma.monitorRun.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            checkedAt: expect.objectContaining({ lt: expect.any(Date) }),
          }),
        }),
      );
    });

    it('does not throw if deleteMany returns 0 deleted rows', async () => {
      prisma.monitorRun.deleteMany.mockResolvedValue({ count: 0 });
      await expect(scheduler.pruneOldRuns()).resolves.not.toThrow();
    });

    it('does not throw if deleteMany rejects (logs error instead)', async () => {
      prisma.monitorRun.deleteMany.mockRejectedValue(new Error('DB error'));
      await expect(scheduler.pruneOldRuns()).resolves.not.toThrow();
    });

    it('handles non-Error rejection gracefully (String(err) path)', async () => {
      prisma.monitorRun.deleteMany.mockRejectedValue('string error');
      await expect(scheduler.pruneOldRuns()).resolves.not.toThrow();
    });

    it('cutoff date is approximately RUN_RETENTION_DAYS ago', async () => {
      prisma.monitorRun.deleteMany.mockResolvedValue({ count: 0 });
      const before = new Date();
      await scheduler.pruneOldRuns();
      const call = prisma.monitorRun.deleteMany.mock.calls[0]?.[0];
      const cutoff: Date = call?.where?.checkedAt?.lt;
      expect(cutoff).toBeInstanceOf(Date);
      // Cutoff should be between (now - 91 days) and (now - 89 days) for default 90-day retention
      const ninetyOneDaysAgo = new Date(before.getTime() - 91 * 24 * 60 * 60 * 1000);
      const eightyNineDaysAgo = new Date(before.getTime() - 89 * 24 * 60 * 60 * 1000);
      expect(cutoff.getTime()).toBeGreaterThan(ninetyOneDaysAgo.getTime());
      expect(cutoff.getTime()).toBeLessThan(eightyNineDaysAgo.getTime());
    });
  });
});
