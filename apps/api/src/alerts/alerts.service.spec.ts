import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlertsService } from './alerts.service';
import { MetricsService } from '../common/metrics.service';
import type { AlertChannel, Monitor, MonitorRun } from '../types';

function makeMailer() {
  return { sendAlertEmail: vi.fn().mockResolvedValue({ sent: true }) };
}

function makeNotifications(shouldNotify = true) {
  return { shouldNotify: vi.fn().mockResolvedValue(shouldNotify) };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeChannel(overrides: Partial<AlertChannel> = {}): AlertChannel {
  return {
    id: 'chan-1',
    userId: 'user-1',
    name: 'Test Channel',
    type: 'webhook',
    config: { url: 'https://hooks.example.com/test' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: 'monitor-1',
    userId: 'user-1',
    name: 'API Monitor',
    type: 'HTTP',
    target: 'https://api.example.com',
    intervalSec: 60,
    timeoutMs: 5000,
    config: {},
    alertChannelIds: [],
    folderId: null,
    enabled: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRun(overrides: Partial<MonitorRun> = {}): MonitorRun {
  return {
    id: 'run-1',
    userId: 'user-1',
    monitorId: 'monitor-1',
    ok: false,
    statusCode: 500,
    latencyMs: null,
    message: 'Internal Server Error',
    level: 'red',
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePrisma(monitorAlerts: { alertChannel: AlertChannel }[] = []) {
  return {
    monitorAlert: {
      findMany: vi.fn().mockResolvedValue(
        monitorAlerts.map((ma) => ({
          alertChannel: {
            id: ma.alertChannel.id,
            userId: ma.alertChannel.userId,
            name: ma.alertChannel.name,
            type: ma.alertChannel.type,
            configJson: ma.alertChannel.config,
            createdAt: new Date(ma.alertChannel.createdAt),
          },
        })),
      ),
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('AlertsService', () => {
  let metrics: MetricsService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    metrics = new MetricsService();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ── notifyTest ──────────────────────────────────────────────────────────────

  describe('notifyTest()', () => {
    it('sends test message via webhook channel', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/test' } });

      await service.notifyTest(channel);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://hooks.example.com/test');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string) as { text: string; extra: { test: boolean } };
      expect(body.text).toContain('PulseDock test notification');
      expect(body.extra.test).toBe(true);
    });

    it('sends test message via discord webhook', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'discord', config: { webhookUrl: 'https://discord.com/api/webhooks/abc/xyz' } });

      await service.notifyTest(channel);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://discord.com/api/webhooks/abc/xyz');
      const body = JSON.parse(opts.body as string) as { content: string };
      expect(body.content).toContain('PulseDock test notification');
    });

    it('sends test message via slack webhook', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'slack', config: { webhookUrl: 'https://hooks.slack.com/services/T/B/x' } });

      await service.notifyTest(channel);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://hooks.slack.com/services/T/B/x');
      const body = JSON.parse(opts.body as string) as { text: string };
      expect(body.text).toContain('PulseDock test notification');
    });

    it('sends test message via telegram bot', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({
        type: 'telegram',
        config: { botToken: 'abc123', chatId: '-1001234567890' },
      });

      await service.notifyTest(channel);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('api.telegram.org');
      expect(url).toContain('abc123');
      const body = JSON.parse(opts.body as string) as { chat_id: string; text: string };
      expect(body.chat_id).toBe('-1001234567890');
      expect(body.text).toContain('PulseDock test notification');
    });

    it('increments alertsSent metric on success', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel();

      await service.notifyTest(channel);

      expect(metrics.snapshot().alertsSent).toBe(1);
    });

    it('increments alertsFailed metric on persistent failure', async () => {
      fetchMock.mockRejectedValue(new Error('Network failure'));
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel();

      vi.useFakeTimers();
      const promise = service.notifyTest(channel);
      const rejectCheck = expect(promise).rejects.toThrow('Network failure');
      await vi.runAllTimersAsync();
      await rejectCheck;
      vi.useRealTimers();

      expect(metrics.snapshot().alertsFailed).toBe(1);
      expect(metrics.snapshot().alertsSent).toBe(0);
    });
  });

  // ── notifyMonitorFailure ────────────────────────────────────────────────────

  describe('notifyMonitorFailure()', () => {
    it('sends alert to all linked channels', async () => {
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red', message: 'HTTP 500' });

      const channels = [
        makeChannel({ id: 'chan-1', userId: monitor.userId, type: 'webhook', config: { url: 'https://hooks.example.com/1' } }),
        makeChannel({ id: 'chan-2', userId: monitor.userId, type: 'discord', config: { webhookUrl: 'https://discord.com/api/webhooks/1/2' } }),
      ];
      const prisma = makePrisma(channels.map((c) => ({ alertChannel: c })));
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(metrics.snapshot().alertsSent).toBe(2);
    });

    it('alert text includes monitor name and level', async () => {
      const monitor = makeMonitor({ name: 'Production API' });
      const run = makeRun({ level: 'red', message: 'Timeout' });

      const channel = makeChannel({ userId: monitor.userId });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string) as { text: string };
      expect(body.text).toContain('Production API');
      expect(body.text).toContain('RED');
    });

    it('skips channels from other users', async () => {
      const monitor = makeMonitor({ userId: 'user-1' });
      const run = makeRun();

      // Channel belongs to a different user
      const foreignChannel = makeChannel({ id: 'chan-x', userId: 'user-2' });
      const prisma = makePrisma([{ alertChannel: foreignChannel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does nothing when no channels are linked', async () => {
      const monitor = makeMonitor();
      const run = makeRun();
      const prisma = makePrisma([]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(metrics.snapshot().alertsSent).toBe(0);
    });

    it('suppresses alerts when notification preferences say shouldNotify=false', async () => {
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red' });
      const channel = makeChannel({ userId: monitor.userId });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const notifications = makeNotifications(false); // suppress
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, notifications as never);

      await service.notifyMonitorFailure(monitor, run);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(notifications.shouldNotify).toHaveBeenCalledWith(monitor.userId, 'down');
    });

    it('calls shouldNotify with "recovery" for green level', async () => {
      const monitor = makeMonitor();
      const run = makeRun({ level: 'green', ok: true, message: 'OK' });
      const prisma = makePrisma([]);
      const notifications = makeNotifications(true);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, notifications as never);

      await service.notifyMonitorFailure(monitor, run);

      expect(notifications.shouldNotify).toHaveBeenCalledWith(monitor.userId, 'recovery');
    });

    it('calls shouldNotify with "degraded" for yellow level', async () => {
      const monitor = makeMonitor();
      const run = makeRun({ level: 'yellow', ok: false, message: 'Slow' });
      const prisma = makePrisma([]);
      const notifications = makeNotifications(true);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, notifications as never);

      await service.notifyMonitorFailure(monitor, run);

      expect(notifications.shouldNotify).toHaveBeenCalledWith(monitor.userId, 'degraded');
    });

    it('uses 🚨 emoji for red level alerts', async () => {
      const monitor = makeMonitor({ name: 'API' });
      const run = makeRun({ level: 'red', message: 'Timeout' });
      const channel = makeChannel({ userId: monitor.userId });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string) as { text: string };
      expect(body.text).toMatch(/^🚨/);
    });

    it('uses ✅ emoji for green level alerts', async () => {
      const monitor = makeMonitor({ name: 'API' });
      const run = makeRun({ level: 'green', ok: true, message: 'OK' });
      const channel = makeChannel({ userId: monitor.userId });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string) as { text: string };
      expect(body.text).toMatch(/^✅/);
    });

    it('continues sending to other channels if one fails', async () => {
      vi.useFakeTimers();
      const monitor = makeMonitor();
      const run = makeRun();

      const channels = [
        makeChannel({ id: 'chan-1', userId: monitor.userId, type: 'webhook', config: { url: 'https://fail.example.com' } }),
        makeChannel({ id: 'chan-2', userId: monitor.userId, type: 'webhook', config: { url: 'https://success.example.com' } }),
      ];

      // First channel always fails (4 attempts = initial + 3 retries), second succeeds
      fetchMock
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue({ ok: true });

      const prisma = makePrisma(channels.map((c) => ({ alertChannel: c })));
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      // Should not throw even if one channel fails
      const promise = service.notifyMonitorFailure(monitor, run);
      await vi.runAllTimersAsync();
      await promise;
      vi.useRealTimers();

      expect(metrics.snapshot().alertsFailed).toBe(1);
      expect(metrics.snapshot().alertsSent).toBe(1);
    });
  });

  // ── retry logic ─────────────────────────────────────────────────────────────

  describe('retry logic', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('retries up to 3 times on failure then throws', async () => {
      fetchMock
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockRejectedValueOnce(new Error('fail 3'))
        .mockRejectedValueOnce(new Error('fail 4'));

      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel();

      const promise = service.notifyTest(channel);
      // Attach the rejection handler before advancing timers to avoid unhandled rejection
      const rejectCheck = expect(promise).rejects.toThrow('fail 4');
      // Advance past all retry delays: 200 + 800 + 2000 = 3000ms
      await vi.runAllTimersAsync();
      await rejectCheck;
      // 4 attempts total: 1 initial + 3 retries
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('succeeds on second attempt', async () => {
      fetchMock
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce({ ok: true });

      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel();

      const promise = service.notifyTest(channel);
      await vi.runAllTimersAsync();
      await promise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(metrics.snapshot().alertsSent).toBe(1);
    });

    it('succeeds on third attempt', async () => {
      fetchMock
        .mockRejectedValueOnce(new Error('t1'))
        .mockRejectedValueOnce(new Error('t2'))
        .mockResolvedValueOnce({ ok: true });

      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel();

      const promise = service.notifyTest(channel);
      await vi.runAllTimersAsync();
      await promise;

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(metrics.snapshot().alertsSent).toBe(1);
    });
  });

  // ── email channel ───────────────────────────────────────────────────────────

  describe('email channel', () => {
    it('calls mailer.sendAlertEmail with correct arguments', async () => {
      const prisma = makePrisma();
      const mailer = makeMailer();
      const service = new AlertsService(prisma as never, metrics, mailer as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'email', config: { to: 'alert@example.com' } });

      await service.notifyTest(channel);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(mailer.sendAlertEmail).toHaveBeenCalledOnce();
      const [to, text] = mailer.sendAlertEmail.mock.calls[0] as [string, string];
      expect(to).toBe('alert@example.com');
      expect(text).toContain('PulseDock test notification');
    });

    it('increments alertsSent when email succeeds', async () => {
      const prisma = makePrisma();
      const mailer = makeMailer();
      const service = new AlertsService(prisma as never, metrics, mailer as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'email', config: { to: 'alert@example.com' } });

      await service.notifyTest(channel);

      expect(metrics.snapshot().alertsSent).toBe(1);
    });

    it('increments alertsFailed when mailer throws', async () => {
      vi.useFakeTimers();
      const prisma = makePrisma();
      const mailer = { sendAlertEmail: vi.fn().mockRejectedValue(new Error('SMTP error')) };
      const service = new AlertsService(prisma as never, metrics, mailer as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'email', config: { to: 'alert@example.com' } });

      const promise = service.notifyTest(channel);
      const rejectCheck = expect(promise).rejects.toThrow('SMTP error');
      await vi.runAllTimersAsync();
      await rejectCheck;
      vi.useRealTimers();

      expect(metrics.snapshot().alertsFailed).toBe(1);
    });
  });
});
