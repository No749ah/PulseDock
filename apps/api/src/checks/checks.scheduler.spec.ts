import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    slaTarget: null as number | null,
    slaPeriodDays: 30 as number | null,
    slaBreachAlertedAt: null as Date | null,
    createdAt: new Date('2026-01-01'),
    runs: [] as Array<{ checkedAt: Date }>,
    ...overrides,
  };
}

function makePrisma(monitors?: ReturnType<typeof makeMonitor>[]) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitors ?? []),
      update: vi.fn().mockResolvedValue({}),
    },
    monitorRun: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function makeChecksService() {
  return {
    runMonitor: vi.fn().mockResolvedValue({ ok: true, message: 'up to date', level: 'green' }),
  };
}

function makeAlertsService() {
  return {
    notifySlaBreached: vi.fn().mockResolvedValue(undefined),
    notifySlaRecovered: vi.fn().mockResolvedValue(undefined),
    notifyBurnRateAlert: vi.fn().mockResolvedValue(undefined),
  };
}

function makeScheduler(
  prismaOverride?: ReturnType<typeof makePrisma>,
  checksOverride?: ReturnType<typeof makeChecksService>,
  alertsOverride?: ReturnType<typeof makeAlertsService>,
) {
  return new ChecksScheduler(
    (prismaOverride ?? makePrisma()) as never,
    (checksOverride ?? makeChecksService()) as never,
    (alertsOverride ?? makeAlertsService()) as never,
  );
}

describe('ChecksScheduler', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let checks: ReturnType<typeof makeChecksService>;
  let alerts: ReturnType<typeof makeAlertsService>;
  let scheduler: ChecksScheduler;

  beforeEach(() => {
    // Use fake timers to avoid real delays from jitter
    vi.useFakeTimers();
    // Stub Math.random to return 0 so jitter is 0ms (no delay) by default
    vi.spyOn(Math, 'random').mockReturnValue(0);
    prisma = makePrisma([]);
    checks = makeChecksService();
    alerts = makeAlertsService();
    scheduler = makeScheduler(prisma, checks, alerts);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── tick() ─────────────────────────────────────────────────────────────────

  describe('tick()', () => {
    it('does nothing when there are no enabled monitors', async () => {
      prisma.monitor.findMany.mockResolvedValue([]);
      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;
      expect(checks.runMonitor).not.toHaveBeenCalled();
    });

    it('does nothing when all monitors ran recently (not due)', async () => {
      const recentRun = { checkedAt: new Date(Date.now() - 5_000) }; // 5s ago, interval is 60s
      const monitor = makeMonitor({ intervalSec: 60, runs: [recentRun] });
      prisma.monitor.findMany.mockResolvedValue([monitor]);

      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;
      expect(checks.runMonitor).not.toHaveBeenCalled();
    });

    it('runs monitors that are due (no previous run)', async () => {
      const monitor = makeMonitor({ runs: [] }); // never ran → always due
      prisma.monitor.findMany.mockResolvedValue([monitor]);

      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;
      expect(checks.runMonitor).toHaveBeenCalledOnce();
      expect(checks.runMonitor).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'monitor-1', userId: 'user-1' }),
      );
    });

    it('runs monitors whose last run is older than intervalSec', async () => {
      const oldRun = { checkedAt: new Date(Date.now() - 120_000) }; // 2 min ago, interval 60s → due
      const monitor = makeMonitor({ intervalSec: 60, runs: [oldRun] });
      prisma.monitor.findMany.mockResolvedValue([monitor]);

      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;
      expect(checks.runMonitor).toHaveBeenCalledOnce();
    });

    it('runs multiple due monitors concurrently', async () => {
      const due = [
        makeMonitor({ id: 'monitor-1', runs: [] }),
        makeMonitor({ id: 'monitor-2', runs: [] }),
        makeMonitor({ id: 'monitor-3', runs: [] }),
      ];
      prisma.monitor.findMany.mockResolvedValue(due);

      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;
      expect(checks.runMonitor).toHaveBeenCalledTimes(3);
    });

    it('logs a warning when some monitors fail but does not throw', async () => {
      const monitor = makeMonitor({ runs: [] });
      prisma.monitor.findMany.mockResolvedValue([monitor]);
      checks.runMonitor.mockRejectedValue(new Error('check failed'));

      // Should not throw — just log warning
      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await expect(promise).resolves.not.toThrow();
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

      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await expect(promise).resolves.not.toThrow();
      // All 3 were attempted even though one failed
      expect(checks.runMonitor).toHaveBeenCalledTimes(3);
    });

    it('queries only enabled monitors', async () => {
      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;
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

      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;

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
      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;
      expect(checks.runMonitor).toHaveBeenCalledWith(
        expect.objectContaining({ config: {} }),
      );
    });

    it('exposes queueDepth via getQueueDepth()', () => {
      expect(scheduler.getQueueDepth()).toBe(0);
    });

    it('logs structured check.cycle event', async () => {
      const logSpy = vi.spyOn(scheduler['logger'], 'log');
      const monitor = makeMonitor({ runs: [] });
      prisma.monitor.findMany.mockResolvedValue([monitor]);

      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;

      const cycleLogs = logSpy.mock.calls
        .map((c) => { try { return JSON.parse(c[0] as string) as { event?: string }; } catch { return null; } })
        .filter((obj) => obj?.event === 'check.cycle');
      expect(cycleLogs.length).toBeGreaterThanOrEqual(1);
      const log = cycleLogs[0] as { event: string; total: number; due: number; skipped: number; durationMs: number };
      expect(log.total).toBe(1);
      expect(log.due).toBe(1);
      expect(log.skipped).toBe(0);
      expect(typeof log.durationMs).toBe('number');
    });
  });

  describe('pruneOldRuns()', () => {
    it('deletes MonitorRun records older than retention cutoff', async () => {
      prisma.monitorRun.deleteMany.mockResolvedValue({ count: 42 });
      vi.useRealTimers(); // real timers for date-based checks
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

  describe('checkSlaBreach()', () => {
    it('does nothing when there are no SLA monitors', async () => {
      prisma.monitor.findMany.mockResolvedValue([]);
      await scheduler.checkSlaBreach();
      expect(alerts.notifySlaBreached).not.toHaveBeenCalled();
      expect(alerts.notifySlaRecovered).not.toHaveBeenCalled();
    });

    it('fires notifySlaBreached and updates slaBreachAlertedAt when uptime is below target and never alerted', async () => {
      const monitor = makeMonitor({
        slaTarget: 99.9,
        slaPeriodDays: 30,
        slaBreachAlertedAt: null,
      });
      // findMany for monitors (first call) returns the SLA monitor
      prisma.monitor.findMany.mockResolvedValueOnce([monitor]);
      // findMany for monitorRun: 10 runs, 1 failed → 90% uptime (below 99.9%)
      prisma.monitorRun.findMany.mockResolvedValueOnce([
        { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: true },
        { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: false },
      ]);

      await scheduler.checkSlaBreach();

      expect(alerts.notifySlaBreached).toHaveBeenCalledOnce();
      expect(alerts.notifySlaBreached).toHaveBeenCalledWith(
        'monitor-1', 'Test Monitor', 'user-1', 90, 99.9, 30,
      );
      expect(prisma.monitor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'monitor-1' },
          data: { slaBreachAlertedAt: expect.any(Date) },
        }),
      );
    });

    it('skips breach alert when already alerted within the last hour (deduplication)', async () => {
      const recentAlert = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
      const monitor = makeMonitor({
        slaTarget: 99.9,
        slaPeriodDays: 30,
        slaBreachAlertedAt: recentAlert,
      });
      prisma.monitor.findMany.mockResolvedValueOnce([monitor]);
      // 90% uptime — still below 99.9%
      prisma.monitorRun.findMany.mockResolvedValueOnce([
        { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: true },
        { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: false },
      ]);

      await scheduler.checkSlaBreach();

      expect(alerts.notifySlaBreached).not.toHaveBeenCalled();
      expect(prisma.monitor.update).not.toHaveBeenCalled();
    });

    it('fires notifySlaRecovered and clears slaBreachAlertedAt when uptime recovers above target', async () => {
      const previousBreachTime = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h ago
      const monitor = makeMonitor({
        slaTarget: 99.0,
        slaPeriodDays: 30,
        slaBreachAlertedAt: previousBreachTime,
      });
      prisma.monitor.findMany.mockResolvedValueOnce([monitor]);
      // 100% uptime — above 99%
      prisma.monitorRun.findMany.mockResolvedValueOnce([
        { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: true },
      ]);

      await scheduler.checkSlaBreach();

      expect(alerts.notifySlaRecovered).toHaveBeenCalledOnce();
      expect(alerts.notifySlaRecovered).toHaveBeenCalledWith(
        'monitor-1', 'Test Monitor', 'user-1', 100, 99, 30,
      );
      expect(prisma.monitor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'monitor-1' },
          data: { slaBreachAlertedAt: null },
        }),
      );
    });
  });

  describe('checkSlaBreach() — edge cases', () => {
    it('skips monitor when slaTarget is null', async () => {
      const monitor = makeMonitor({ slaTarget: null });
      prisma.monitor.findMany.mockResolvedValueOnce([monitor]);

      await scheduler.checkSlaBreach();

      expect(prisma.monitorRun.findMany).not.toHaveBeenCalled();
      expect(alerts.notifySlaBreached).not.toHaveBeenCalled();
    });

    it('skips monitor when there are no runs in the period', async () => {
      const monitor = makeMonitor({ slaTarget: 99.9, slaPeriodDays: 30 });
      prisma.monitor.findMany.mockResolvedValueOnce([monitor]);
      prisma.monitorRun.findMany.mockResolvedValueOnce([]); // no runs

      await scheduler.checkSlaBreach();

      expect(alerts.notifySlaBreached).not.toHaveBeenCalled();
      expect(alerts.notifySlaRecovered).not.toHaveBeenCalled();
    });

    it('re-fires breach alert when last alert was >24h ago', async () => {
      const oldAlert = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago
      const monitor = makeMonitor({
        slaTarget: 99.9,
        slaPeriodDays: 30,
        slaBreachAlertedAt: oldAlert,
      });
      prisma.monitor.findMany.mockResolvedValueOnce([monitor]);
      prisma.monitorRun.findMany.mockResolvedValueOnce([
        { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: false },
      ]); // 80% — below 99.9%

      await scheduler.checkSlaBreach();

      expect(alerts.notifySlaBreached).toHaveBeenCalledOnce();
      expect(prisma.monitor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { slaBreachAlertedAt: expect.any(Date) },
        }),
      );
    });

    it('uses default slaPeriodDays of 30 when slaPeriodDays is null', async () => {
      const monitor = makeMonitor({
        slaTarget: 99.9,
        slaPeriodDays: null,
        slaBreachAlertedAt: null,
      });
      prisma.monitor.findMany.mockResolvedValueOnce([monitor]);
      prisma.monitorRun.findMany.mockResolvedValueOnce([{ ok: false }]); // 0% uptime

      await scheduler.checkSlaBreach();

      // Should have used 30-day window
      expect(alerts.notifySlaBreached).toHaveBeenCalledWith(
        'monitor-1', 'Test Monitor', 'user-1', 0, 99.9, 30,
      );
    });

    it('does not throw when notifySlaBreached rejects (logs error instead)', async () => {
      const monitor = makeMonitor({ slaTarget: 99.9, slaBreachAlertedAt: null });
      prisma.monitor.findMany.mockResolvedValueOnce([monitor]);
      prisma.monitorRun.findMany.mockResolvedValueOnce([{ ok: false }]);
      alerts.notifySlaBreached.mockRejectedValue(new Error('notification failed'));

      await expect(scheduler.checkSlaBreach()).resolves.not.toThrow();
      // update should still be called (continues after catch)
      expect(prisma.monitor.update).toHaveBeenCalled();
    });

    it('does not throw when notifySlaRecovered rejects (logs error instead)', async () => {
      const monitor = makeMonitor({
        slaTarget: 50,
        slaBreachAlertedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      });
      prisma.monitor.findMany.mockResolvedValueOnce([monitor]);
      prisma.monitorRun.findMany.mockResolvedValueOnce([{ ok: true }]); // 100% — above 50%
      alerts.notifySlaRecovered.mockRejectedValue(new Error('notification failed'));

      await expect(scheduler.checkSlaBreach()).resolves.not.toThrow();
      // update should still be called
      expect(prisma.monitor.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { slaBreachAlertedAt: null } }),
      );
    });

    it('handles non-Error rejection in notifySlaBreached (String path)', async () => {
      const monitor = makeMonitor({ slaTarget: 99.9, slaBreachAlertedAt: null });
      prisma.monitor.findMany.mockResolvedValueOnce([monitor]);
      prisma.monitorRun.findMany.mockResolvedValueOnce([{ ok: false }]);
      alerts.notifySlaBreached.mockRejectedValue('string error');

      await expect(scheduler.checkSlaBreach()).resolves.not.toThrow();
    });

    it('handles non-Error rejection in notifySlaRecovered (String path)', async () => {
      const monitor = makeMonitor({
        slaTarget: 50,
        slaBreachAlertedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      });
      prisma.monitor.findMany.mockResolvedValueOnce([monitor]);
      prisma.monitorRun.findMany.mockResolvedValueOnce([{ ok: true }]);
      alerts.notifySlaRecovered.mockRejectedValue('string error');

      await expect(scheduler.checkSlaBreach()).resolves.not.toThrow();
    });

    it('does not fire recovery when slaBreachAlertedAt is null and uptime is above target', async () => {
      const monitor = makeMonitor({
        slaTarget: 99,
        slaBreachAlertedAt: null,
      });
      prisma.monitor.findMany.mockResolvedValueOnce([monitor]);
      prisma.monitorRun.findMany.mockResolvedValueOnce([{ ok: true }, { ok: true }]); // 100%

      await scheduler.checkSlaBreach();

      expect(alerts.notifySlaRecovered).not.toHaveBeenCalled();
      expect(prisma.monitor.update).not.toHaveBeenCalled();
    });
  });

  describe('tick() — additional edge cases', () => {
    it('tracks lastCycleMs via getLastCycleMs()', async () => {
      expect(scheduler.getLastCycleMs()).toBe(0);
      prisma.monitor.findMany.mockResolvedValue([]);

      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;

      // After a tick, lastCycleMs should be set (even if 0ms with fake timers)
      expect(typeof scheduler.getLastCycleMs()).toBe('number');
    });

    it('logs early cycle event when no monitors are due', async () => {
      const recentRun = { checkedAt: new Date(Date.now() - 1_000) };
      const monitor = makeMonitor({ intervalSec: 60, runs: [recentRun] });
      prisma.monitor.findMany.mockResolvedValue([monitor]);
      const logSpy = vi.spyOn(scheduler['logger'], 'log');

      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;

      const cycleLogs = logSpy.mock.calls
        .map((c) => { try { return JSON.parse(c[0] as string) as { event?: string; due?: number }; } catch { return null; } })
        .filter((obj) => obj?.event === 'check.cycle');
      expect(cycleLogs.length).toBeGreaterThanOrEqual(1);
      expect(cycleLogs[0]!.due).toBe(0);
    });

    it('defaults config to {} when monitor configJson is undefined', async () => {
      const monitor = makeMonitor({ configJson: undefined, runs: [] });
      prisma.monitor.findMany.mockResolvedValue([monitor]);
      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;
      expect(checks.runMonitor).toHaveBeenCalledWith(
        expect.objectContaining({ config: {} }),
      );
    });

    it('passes sla fields correctly to runMonitor', async () => {
      const breachDate = new Date('2026-01-15T12:00:00Z');
      const monitor = makeMonitor({
        slaTarget: 99.9,
        slaPeriodDays: 7,
        slaBreachAlertedAt: breachDate,
        runs: [],
      });
      prisma.monitor.findMany.mockResolvedValue([monitor]);

      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;

      expect(checks.runMonitor).toHaveBeenCalledWith(
        expect.objectContaining({
          slaTarget: 99.9,
          slaPeriodDays: 7,
          slaBreachAlertedAt: '2026-01-15T12:00:00.000Z',
        }),
      );
    });

    it('passes null slaBreachAlertedAt when field is null', async () => {
      const monitor = makeMonitor({
        slaTarget: null,
        slaPeriodDays: null,
        slaBreachAlertedAt: null,
        runs: [],
      });
      prisma.monitor.findMany.mockResolvedValue([monitor]);

      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;

      expect(checks.runMonitor).toHaveBeenCalledWith(
        expect.objectContaining({
          slaTarget: null,
          slaPeriodDays: null,
          slaBreachAlertedAt: null,
        }),
      );
    });
  });

  describe('checkBurnRateAlerts()', () => {
    /** Helper: build N runs where `failCount` are failures */
    function makeRuns(total: number, failCount: number): { ok: boolean }[] {
      return Array.from({ length: total }, (_, i) => ({ ok: i >= failCount }));
    }

    it('does nothing when there are no SLA monitors', async () => {
      prisma.monitor.findMany.mockResolvedValue([]);
      await scheduler.checkBurnRateAlerts();
      expect(alerts.notifyBurnRateAlert).not.toHaveBeenCalled();
    });

    it('does nothing when slaTarget is null', async () => {
      prisma.monitor.findMany.mockResolvedValue([{
        id: 'm1', name: 'M', userId: 'u1',
        slaTarget: null, slaPeriodDays: 30, slaBurnRateAlertedAt: null,
      }]);
      await scheduler.checkBurnRateAlerts();
      expect(alerts.notifyBurnRateAlert).not.toHaveBeenCalled();
    });

    it('skips when throttle window has not expired (< 6h since last alert)', async () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 3_600_000);
      prisma.monitor.findMany.mockResolvedValue([{
        id: 'm1', name: 'M', userId: 'u1',
        slaTarget: 99.9, slaPeriodDays: 30, slaBurnRateAlertedAt: fiveHoursAgo,
      }]);
      await scheduler.checkBurnRateAlerts();
      expect(alerts.notifyBurnRateAlert).not.toHaveBeenCalled();
    });

    it('skips when there are fewer than 2 runs in the 1h window', async () => {
      prisma.monitor.findMany.mockResolvedValue([{
        id: 'm1', name: 'M', userId: 'u1',
        slaTarget: 99.9, slaPeriodDays: 30, slaBurnRateAlertedAt: null,
      }]);
      // 1h = 1 run, 6h = 5 runs, full = 10 runs — 1h window below threshold
      prisma.monitorRun.findMany
        .mockResolvedValueOnce(makeRuns(1, 1))   // 1h
        .mockResolvedValueOnce(makeRuns(5, 4))   // 6h
        .mockResolvedValueOnce(makeRuns(10, 8)); // full
      await scheduler.checkBurnRateAlerts();
      expect(alerts.notifyBurnRateAlert).not.toHaveBeenCalled();
    });

    it('skips when there are fewer than 10 runs in the full period', async () => {
      prisma.monitor.findMany.mockResolvedValue([{
        id: 'm1', name: 'M', userId: 'u1',
        slaTarget: 99.9, slaPeriodDays: 30, slaBurnRateAlertedAt: null,
      }]);
      prisma.monitorRun.findMany
        .mockResolvedValueOnce(makeRuns(5, 4))   // 1h
        .mockResolvedValueOnce(makeRuns(8, 6))   // 6h
        .mockResolvedValueOnce(makeRuns(9, 7));  // full — below 10 threshold
      await scheduler.checkBurnRateAlerts();
      expect(alerts.notifyBurnRateAlert).not.toHaveBeenCalled();
    });

    it('fires Critical burn-rate alert (>=14.4× 1h, >=2.88× 6h) and updates slaBurnRateAlertedAt', async () => {
      prisma.monitor.findMany.mockResolvedValue([{
        id: 'm1', name: 'API', userId: 'u1',
        slaTarget: 99.9, slaPeriodDays: 30, slaBurnRateAlertedAt: null,
      }]);
      // 100% error rate for 1h and 6h → extreme burn rate
      prisma.monitorRun.findMany
        .mockResolvedValueOnce(makeRuns(60, 60))   // 1h: all fail
        .mockResolvedValueOnce(makeRuns(360, 360)) // 6h: all fail
        .mockResolvedValueOnce(makeRuns(200, 10)); // full period: mostly ok

      await scheduler.checkBurnRateAlerts();

      expect(alerts.notifyBurnRateAlert).toHaveBeenCalledOnce();
      expect(prisma.monitor.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { slaBurnRateAlertedAt: expect.any(Date) },
      });
    });

    it('does not fire when burn rates are below all thresholds (normal traffic)', async () => {
      prisma.monitor.findMany.mockResolvedValue([{
        id: 'm1', name: 'M', userId: 'u1',
        slaTarget: 99.9, slaPeriodDays: 30, slaBurnRateAlertedAt: null,
      }]);
      // 0% error rate → burn rate = 0
      prisma.monitorRun.findMany
        .mockResolvedValueOnce(makeRuns(60, 0))   // 1h
        .mockResolvedValueOnce(makeRuns(360, 0))  // 6h
        .mockResolvedValueOnce(makeRuns(200, 0)); // full

      await scheduler.checkBurnRateAlerts();
      expect(alerts.notifyBurnRateAlert).not.toHaveBeenCalled();
    });

    it('does not throw when notifyBurnRateAlert rejects', async () => {
      prisma.monitor.findMany.mockResolvedValue([{
        id: 'm1', name: 'M', userId: 'u1',
        slaTarget: 99.9, slaPeriodDays: 30, slaBurnRateAlertedAt: null,
      }]);
      prisma.monitorRun.findMany
        .mockResolvedValueOnce(makeRuns(60, 60))
        .mockResolvedValueOnce(makeRuns(360, 360))
        .mockResolvedValueOnce(makeRuns(200, 10));
      alerts.notifyBurnRateAlert.mockRejectedValueOnce(new Error('channel down'));

      await expect(scheduler.checkBurnRateAlerts()).resolves.not.toThrow();
    });

    it('suppresses checkBurnRateAlerts after shutdown signal', async () => {
      prisma.monitor.findMany.mockResolvedValue([]);
      await scheduler.beforeApplicationShutdown();
      await scheduler.checkBurnRateAlerts();
      expect(prisma.monitor.findMany).not.toHaveBeenCalled();
    });
  });

  describe('graceful shutdown', () => {
    it('suppresses new tick cycles after beforeApplicationShutdown is called', async () => {
      prisma.monitor.findMany.mockResolvedValue([]);
      // Start shutdown (draining = true, but queueDepth = 0 so it resolves immediately)
      await scheduler.beforeApplicationShutdown();

      // tick() should now be a no-op (draining flag set)
      await scheduler.tick();
      // findMany should NOT have been called again after shutdown
      expect(prisma.monitor.findMany).not.toHaveBeenCalled();
    });

    it('suppresses checkSlaBreach after shutdown signal', async () => {
      prisma.monitor.findMany.mockResolvedValue([]);
      await scheduler.beforeApplicationShutdown();

      await scheduler.checkSlaBreach();
      expect(prisma.monitor.findMany).not.toHaveBeenCalled();
    });

    it('reports clean shutdown when queueDepth reaches zero', async () => {
      // queueDepth is already 0 → should resolve immediately
      await scheduler.beforeApplicationShutdown();
      expect(scheduler.getQueueDepth()).toBe(0);
    });
  });

  describe('tick() — cron expression scheduling', () => {
    it('runs a cron-scheduled monitor that has never been checked', async () => {
      // */1 * * * * = every minute → prev() will be within the last minute → never checked → due
      const monitor = makeMonitor({ cronExpression: '* * * * *', runs: [], intervalSec: 3600 });
      prisma.monitor.findMany.mockResolvedValue([monitor]);

      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;

      // Should have triggered a check
      expect(checks.runMonitor).toHaveBeenCalledTimes(1);
    });

    it('does NOT re-run a cron-scheduled monitor when already checked after last cron fire', async () => {
      // 0 0 1 1 * = once a year on Jan 1 → prev() was far in the past
      // Last checked at "just now" → not due
      const now = new Date();
      const monitor = makeMonitor({
        cronExpression: '0 0 1 1 *',
        intervalSec: 3600,
        runs: [{ checkedAt: new Date(now.getTime() - 1000) }], // checked 1 second ago
      });
      prisma.monitor.findMany.mockResolvedValue([monitor]);

      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;

      // Should NOT have triggered a check because last checked is after prev cron fire
      expect(checks.runMonitor).not.toHaveBeenCalled();
    });

    it('falls back to intervalSec when cronExpression is null', async () => {
      // No cron expression, interval 60s, last checked 61s ago → due
      const monitor = makeMonitor({
        cronExpression: null,
        intervalSec: 60,
        runs: [{ checkedAt: new Date(Date.now() - 61_000) }],
      });
      prisma.monitor.findMany.mockResolvedValue([monitor]);

      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;

      expect(checks.runMonitor).toHaveBeenCalledTimes(1);
    });

    it('skips a monitor with an invalid cron expression gracefully', async () => {
      // Invalid cron → isCronDue returns false → monitor not run
      const monitor = makeMonitor({
        cronExpression: 'not-a-valid-cron',
        intervalSec: 60,
        runs: [],
      });
      prisma.monitor.findMany.mockResolvedValue([monitor]);

      const promise = scheduler.tick();
      await vi.runAllTimersAsync();
      await promise;

      // Invalid cron → not due → no check fired
      expect(checks.runMonitor).not.toHaveBeenCalled();
    });
  });
});
