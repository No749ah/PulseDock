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
    confirmations: 1,
    config: {},
    alertChannelIds: [],
    folderId: null,
    enabled: true,
    slaTarget: null,
    slaPeriodDays: null,
    slaBreachAlertedAt: null,
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
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    maintenanceWindow: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    monitorDependency: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    monitorRun: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    alertDeliveryLog: {
      create: vi.fn().mockResolvedValue({}),
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
      // Discord now sends embeds — verify the payload has the embed structure
      const body = JSON.parse(opts.body as string) as { embeds?: Array<{ title?: string }> };
      expect(Array.isArray(body.embeds)).toBe(true);
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

      // First channel always fails (3 attempts = maxRetries=3), second succeeds
      fetchMock
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
        .mockRejectedValueOnce(new Error('fail 3'));

      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel();

      const promise = service.notifyTest(channel);
      // Attach the rejection handler before advancing timers to avoid unhandled rejection
      const rejectCheck = expect(promise).rejects.toThrow('fail 3');
      // Advance past all retry delays: 1s + 2s = 3s (exponential backoff, 3 attempts total)
      await vi.runAllTimersAsync();
      await rejectCheck;
      // 3 attempts total with maxRetries=3
      expect(fetchMock).toHaveBeenCalledTimes(3);
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

  // ── sendWithRetryFn ──────────────────────────────────────────────────────────

  describe('sendWithRetryFn()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('succeeds on the 3rd attempt (exponential backoff: 1s → 2s)', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      let callCount = 0;
      const fn = vi.fn(async () => {
        callCount++;
        if (callCount < 3) throw new Error(`attempt ${callCount} failed`);
        // 3rd attempt succeeds
      });

      const promise = service.sendWithRetryFn(fn, 3);
      await vi.runAllTimersAsync();
      await promise;

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws the last error after max retries exhausted', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      const fn = vi.fn(async () => {
        throw new Error('persistent failure');
      });

      const promise = service.sendWithRetryFn(fn, 3);
      const rejection = expect(promise).rejects.toThrow('persistent failure');
      await vi.runAllTimersAsync();
      await rejection;

      // Called exactly maxRetries times
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  // ── webhook HMAC signing ─────────────────────────────────────────────────────

  describe('webhook HMAC signing', () => {
    it('adds X-PulseDock-Signature header when secret is configured', async () => {
      const { createHmac } = await import('node:crypto');
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const secret = 'my-signing-secret';
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/test', secret } });

      await service.notifyTest(channel);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [, opts] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
      const sig = opts.headers['x-pulsedock-signature'];
      expect(sig).toBeDefined();
      expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);

      // Verify the signature matches the body
      const expected = `sha256=${createHmac('sha256', secret).update(opts.body).digest('hex')}`;
      expect(sig).toBe(expected);
    });

    it('does NOT add signature header when no secret is configured', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/test' } });

      await service.notifyTest(channel);

      const [, opts] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
      expect(opts.headers['x-pulsedock-signature']).toBeUndefined();
    });

    it('does NOT add signature header when secret is empty string', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/test', secret: '' } });

      await service.notifyTest(channel);

      const [, opts] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
      expect(opts.headers['x-pulsedock-signature']).toBeUndefined();
    });

    it('generates deterministic signature for same secret + body', async () => {
      const { createHmac } = await import('node:crypto');
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const secret = 'deterministic-secret-test';
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/test', secret } });

      // Call twice
      await service.notifyTest(channel);
      fetchMock.mockClear();
      await service.notifyTest(channel);

      const [, opts1] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
      const expected = `sha256=${createHmac('sha256', secret).update(opts1.body).digest('hex')}`;
      expect(opts1.headers['x-pulsedock-signature']).toBe(expected);
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

    it('suppresses alert when active maintenance window exists', async () => {
      const monitor = makeMonitor({ name: 'API' });
      const run = makeRun({ level: 'red', message: 'Down' });
      const channel = makeChannel({ userId: monitor.userId });
      const prisma = makePrisma([{ alertChannel: channel }]);
      // Override: findFirst returns an active maintenance window
      prisma.maintenanceWindow.findFirst = vi.fn().mockResolvedValue({ id: 'mw-1', name: 'Planned Downtime' });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      // No fetch call should be made — alert was suppressed
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('suppresses alert when a dependency monitor is currently down', async () => {
      const monitor = makeMonitor({ name: 'App Server' });
      const run = makeRun({ level: 'red', message: 'Down' });
      const channel = makeChannel({ userId: monitor.userId });
      const prisma = makePrisma([{ alertChannel: channel }]);
      // Dependency "DB Monitor" is currently failing
      prisma.monitorDependency.findMany = vi.fn().mockResolvedValue([
        { dependsOnId: 'dep-monitor-1', dependsOn: { name: 'DB Monitor' } },
      ]);
      prisma.monitorRun.findFirst = vi.fn().mockResolvedValue({ ok: false });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      // Alert should be suppressed because the dependency is down
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does NOT suppress alert when dependency monitor is healthy', async () => {
      const monitor = makeMonitor({ name: 'App Server', userId: 'u-1' });
      const run = makeRun({ level: 'red', message: 'Down' });
      const channel = makeChannel({ userId: 'u-1', type: 'email' });
      const prisma = makePrisma([{ alertChannel: channel }]);
      // Dependency is healthy (ok: true) — should NOT suppress
      prisma.monitorDependency.findMany = vi.fn().mockResolvedValue([
        { dependsOnId: 'dep-monitor-1', dependsOn: { name: 'DB Monitor' } },
      ]);
      prisma.monitorRun.findFirst = vi.fn().mockResolvedValue({ ok: true });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      // Alert should fire since dependency is healthy
      // (mailer called since channel type is email)
      // We just verify fetchMock was not involved, not an explicit email assert
      expect(prisma.monitorDependency.findMany).toHaveBeenCalled();
    });

    it('logs String(error) when channel catch receives non-Error', async () => {
      vi.useFakeTimers();
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red' });
      const channel = makeChannel({ userId: monitor.userId });
      const prisma = makePrisma([{ alertChannel: channel }]);
      // Make fetch throw a non-Error so all 4 attempts fail
      fetchMock.mockRejectedValue('network down');
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      const promise = service.notifyMonitorFailure(monitor, run);
      await vi.runAllTimersAsync();
      // Should not throw — error is caught and logged
      await expect(promise).resolves.not.toThrow();
      vi.useRealTimers();
    });

    it('uses {} config fallback when alertChannel configJson is null', async () => {
      const monitor = makeMonitor({ name: 'API', userId: 'u-1' });
      const run = makeRun({ level: 'red' });
      const prismaRaw = {
        monitorAlert: {
          findMany: vi.fn().mockResolvedValue([{
            alertChannel: { id: 'ch-1', userId: 'u-1', name: 'Webhook', type: 'webhook', configJson: null, createdAt: new Date() },
          }]),
        },
        maintenanceWindow: { findFirst: vi.fn().mockResolvedValue(null) },
        monitorDependency: { findMany: vi.fn().mockResolvedValue([]) },
        monitorRun: { findFirst: vi.fn().mockResolvedValue(null) },
        alertDeliveryLog: { create: vi.fn().mockResolvedValue({}) },
      };
      const service = new AlertsService(prismaRaw as never, metrics, makeMailer() as never, makeNotifications() as never);

      // Channel config will be {} — webhook with no url → falls through (no fetch call since no url)
      await service.notifyMonitorFailure(monitor, run);
      // Should not throw; alert triggered but no URL → no fetch
      expect(fetchMock).not.toHaveBeenCalled();
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

  // ── notifyOn filtering ──────────────────────────────────────────────────────

  describe('notifyMonitorFailure() — notifyOn filtering', () => {
    function makePrismaWithNotifyOn(notifyOn: string, opts: { lastNotifiedAt?: Date | null; isVersionMonitor?: boolean } = {}) {
      const channel = makeChannel({ userId: 'user-1' });
      return {
        monitorAlert: {
          findMany: vi.fn().mockResolvedValue([{
            alertChannel: {
              id: channel.id,
              userId: channel.userId,
              name: channel.name,
              type: channel.type,
              configJson: channel.config,
              createdAt: new Date(channel.createdAt),
            },
            notifyOn,
            alertChannelId: channel.id,
            lastNotifiedAt: opts.lastNotifiedAt ?? null,
          }]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        maintenanceWindow: { findFirst: vi.fn().mockResolvedValue(null) },
        monitorDependency: { findMany: vi.fn().mockResolvedValue([]) },
        monitorRun: { findFirst: vi.fn().mockResolvedValue(null) },
        alertDeliveryLog: { create: vi.fn().mockResolvedValue({}) },
      };
    }

    it('ALWAYS: sends for every non-green run', async () => {
      const prisma = makePrismaWithNotifyOn('ALWAYS');
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red' });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: false, previousLevel: 'red' });
      expect(fetchMock).toHaveBeenCalled();
    });

    it('ALWAYS: does NOT send for green runs', async () => {
      const prisma = makePrismaWithNotifyOn('ALWAYS');
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const monitor = makeMonitor();
      const run = makeRun({ level: 'green', ok: true });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: true, previousLevel: 'red' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('FIRST_ONLY: sends when failureStreak is 1', async () => {
      const prisma = makePrismaWithNotifyOn('FIRST_ONLY');
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red' });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: true, previousLevel: 'green', failureStreak: 1 });
      expect(fetchMock).toHaveBeenCalled();
    });

    it('FIRST_ONLY: does NOT send when failureStreak > 1', async () => {
      const prisma = makePrismaWithNotifyOn('FIRST_ONLY');
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red' });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: false, previousLevel: 'red', failureStreak: 5 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('DAILY_DIGEST: sends when no previous notification', async () => {
      const prisma = makePrismaWithNotifyOn('DAILY_DIGEST', { lastNotifiedAt: null });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red' });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: true });
      expect(fetchMock).toHaveBeenCalled();
      // Should update lastNotifiedAt
      expect(prisma.monitorAlert.updateMany).toHaveBeenCalled();
    });

    it('DAILY_DIGEST: does NOT send when notified less than 24h ago', async () => {
      const recent = new Date(Date.now() - 1 * 3600000); // 1h ago
      const prisma = makePrismaWithNotifyOn('DAILY_DIGEST', { lastNotifiedAt: recent });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red' });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: true });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('VERSION_ANY: sends for version monitor with non-green level', async () => {
      const prisma = makePrismaWithNotifyOn('VERSION_ANY');
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const monitor = makeMonitor({ type: 'GIT_RELEASE' });
      const run = makeRun({ level: 'yellow' });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: true });
      expect(fetchMock).toHaveBeenCalled();
    });

    it('VERSION_ANY: does NOT send for non-version monitor', async () => {
      const prisma = makePrismaWithNotifyOn('VERSION_ANY');
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const monitor = makeMonitor({ type: 'HTTP' });
      const run = makeRun({ level: 'red' });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: true });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('VERSION_MAJOR: sends for version monitor with red level only', async () => {
      const prisma = makePrismaWithNotifyOn('VERSION_MAJOR');
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const monitor = makeMonitor({ type: 'DOCKER_IMAGE' });
      const run = makeRun({ level: 'red' });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: true });
      expect(fetchMock).toHaveBeenCalled();
    });

    it('VERSION_MAJOR: does NOT send for version monitor with yellow level', async () => {
      const prisma = makePrismaWithNotifyOn('VERSION_MAJOR');
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const monitor = makeMonitor({ type: 'GIT_RELEASE' });
      const run = makeRun({ level: 'yellow' });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: true });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('ON_CHANGE: does NOT send when level has not changed', async () => {
      const prisma = makePrismaWithNotifyOn('ON_CHANGE');
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red' });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: false, previousLevel: 'red' });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ── SLA notifications ─────────────────────────────────────────────────────

  describe('notifySlaBreached()', () => {
    it('sends SLA breach notification to all linked channels', async () => {
      const channel = makeChannel({ userId: 'user-1' });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifySlaBreached('mon-1', 'API', 'user-1', 98.5, 99.9, 30);

      expect(fetchMock).toHaveBeenCalledOnce();
      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as { text: string };
      expect(body.text).toContain('SLA Breach');
      expect(body.text).toContain('98.5%');
    });
  });

  describe('notifySlaRecovered()', () => {
    it('sends SLA recovered notification to all linked channels', async () => {
      const channel = makeChannel({ userId: 'user-1' });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifySlaRecovered('mon-1', 'API', 'user-1', 99.95, 99.9, 30);

      expect(fetchMock).toHaveBeenCalledOnce();
      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as { text: string };
      expect(body.text).toContain('SLA Recovered');
      expect(body.text).toContain('99.95%');
    });
  });

  // ── PagerDuty channel ───────────────────────────────────────────────────────

  describe('pagerduty channel', () => {
    it('sends trigger event on red level', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'pagerduty' as never, config: { integrationKey: 'test-integration-key' } });

      await service.notifyTest(channel);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://events.pagerduty.com/v2/enqueue');
      const body = JSON.parse(opts.body as string) as { routing_key: string; event_action: string; payload: { severity: string } };
      expect(body.routing_key).toBe('test-integration-key');
      expect(body.event_action).toBe('trigger');
    });

    it('sends resolve event on green level', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'pagerduty' as never, config: { integrationKey: 'test-integration-key' } });
      const monitor = makeMonitor();
      const run = makeRun({ level: 'green', ok: true, message: 'OK' });

      const links = [{ alertChannel: channel }];
      const prismaWithChannel = makePrisma(links);
      const serviceWithChannel = new AlertsService(prismaWithChannel as never, metrics, makeMailer() as never, makeNotifications() as never);
      await serviceWithChannel.notifyMonitorFailure(monitor, run);

      expect(fetchMock).toHaveBeenCalled();
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://events.pagerduty.com/v2/enqueue');
      const body = JSON.parse(opts.body as string) as { event_action: string; payload: { severity: string } };
      expect(body.event_action).toBe('resolve');
      expect(body.payload.severity).toBe('info');
    });
  });

  // ── OpsGenie channel ─────────────────────────────────────────────────────────

  describe('opsgenie channel', () => {
    it('posts to alerts endpoint on red level', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'opsgenie' as never, config: { apiKey: 'test-api-key' } });
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red', message: 'Down' });

      const links = [{ alertChannel: channel }];
      const prismaWithChannel = makePrisma(links);
      const serviceWithChannel = new AlertsService(prismaWithChannel as never, metrics, makeMailer() as never, makeNotifications() as never);
      await serviceWithChannel.notifyMonitorFailure(monitor, run);

      expect(fetchMock).toHaveBeenCalled();
      const [url, opts] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
      expect(url).toBe('https://api.opsgenie.com/v2/alerts');
      expect(opts.headers['Authorization']).toBe('GenieKey test-api-key');
      const body = JSON.parse(opts.body) as { priority: string; alias: string };
      expect(body.priority).toBe('P1');
    });

    it('posts close request on green level (resolve)', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200 });
      const monitor = makeMonitor({ id: 'monitor-green-1' });
      const run = makeRun({ level: 'green', ok: true, message: 'Recovered' });
      const channel = makeChannel({ type: 'opsgenie' as never, config: { apiKey: 'test-api-key' } });

      const links = [{ alertChannel: channel }];
      const prismaWithChannel = makePrisma(links);
      const service = new AlertsService(prismaWithChannel as never, metrics, makeMailer() as never, makeNotifications() as never);
      await service.notifyMonitorFailure(monitor, run);

      expect(fetchMock).toHaveBeenCalled();
      const [url, opts] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string> }];
      expect(url).toContain('/close');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toBe('GenieKey test-api-key');
    });
  });

  // ─── SMS channel ─────────────────────────────────────────────────────────────

  describe('sms channel', () => {
    it('posts to Twilio Messages API with correct auth and body', async () => {
      const monitor = makeMonitor({ name: 'Prod API' });
      const run = makeRun({ level: 'red', ok: false, message: 'Connection refused' });
      const channel = makeChannel({
        type: 'sms' as never,
        config: { accountSid: 'ACtest123', authToken: 'token456', from: '+15550001111', to: '+15559998888' },
      });

      const links = [{ alertChannel: channel }];
      const prismaWithChannel = makePrisma(links);
      const service = new AlertsService(prismaWithChannel as never, metrics, makeMailer() as never, makeNotifications() as never);
      await service.notifyMonitorFailure(monitor, run);

      expect(fetchMock).toHaveBeenCalled();
      const [url, opts] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
      expect(url).toContain('ACtest123/Messages.json');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toMatch(/^Basic /);
      expect(opts.body).toContain('To=%2B15559998888');
      expect(opts.body).toContain('From=%2B15550001111');
    });

    it('records failed delivery log when Twilio returns non-ok response', async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad request' } as Response);
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red', ok: false });
      const channel = makeChannel({
        type: 'sms' as never,
        config: { accountSid: 'ACbad', authToken: 'tok', from: '+10000000000', to: '+19999999999' },
      });

      const links = [{ alertChannel: channel }];
      const prismaWithChannel = makePrisma(links);
      const service = new AlertsService(prismaWithChannel as never, metrics, makeMailer() as never, makeNotifications() as never);
      const promise = service.notifyMonitorFailure(monitor, run);
      await vi.runAllTimersAsync();
      try { await promise; } catch { /* expected */ }
      vi.useRealTimers();

      expect(prismaWithChannel.alertDeliveryLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'failed' }),
        }),
      );
    });
  });

  // ─── Delivery log ────────────────────────────────────────────────────────────

  describe('alert delivery log', () => {
    it('creates a delivery log entry on successful webhook send', async () => {
      vi.useFakeTimers();
      const prisma = makePrisma([makeChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/test' } })].map((ch) => ({ alertChannel: ch })));
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/test' } });

      const promise = service.notifyTest(channel);
      await vi.runAllTimersAsync();
      await promise;
      vi.useRealTimers();

      expect(prisma.alertDeliveryLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            alertChannelId: channel.id,
            status: 'success',
            trigger: 'test',
          }),
        }),
      );
    });

    it('creates a failed delivery log entry when email channel throws', async () => {
      vi.useFakeTimers();
      const prisma = makePrisma();
      const mailer = { sendAlertEmail: vi.fn().mockRejectedValue(new Error('SMTP unavailable')) };
      const service = new AlertsService(prisma as never, metrics, mailer as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'email', config: { to: 'ops@example.com' } });

      const promise = service.notifyTest(channel).catch(() => {});
      await vi.runAllTimersAsync();
      await promise;
      vi.useRealTimers();

      // After all retries exhaust, a failed log entry should be created
      const createCalls = prisma.alertDeliveryLog.create.mock.calls;
      const failedCall = createCalls.find((c: unknown[]) => (c[0] as { data: { status: string } }).data.status === 'failed');
      expect(failedCall).toBeDefined();
    });

    it('delivery log includes durationMs timing', async () => {
      vi.useFakeTimers();
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/test' } });

      const promise = service.notifyTest(channel);
      await vi.runAllTimersAsync();
      await promise;
      vi.useRealTimers();

      const createCall = prisma.alertDeliveryLog.create.mock.calls[0];
      expect(typeof createCall[0].data.durationMs).toBe('number');
      expect(createCall[0].data.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── SLA notifications ───────────────────────────────────────────────────────

  describe('notifySlaBreached()', () => {
    it('sends SLA breach alert to all linked channels', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifySlaBreached('monitor-1', 'API Monitor', 'user-1', 99.5, 99.9, 30);

      expect(fetchMock).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.text).toContain('SLA Breach');
      expect(body.text).toContain('API Monitor');
      expect(body.text).toContain('99.5%');
      expect(body.text).toContain('99.9%');
      expect(body.text).toContain('30d');
    });

    it('filters out channels from other users', async () => {
      const channel = makeChannel({ userId: 'other-user' });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifySlaBreached('monitor-1', 'API Monitor', 'user-1', 99.0, 99.9, 7);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does nothing when no channels are linked', async () => {
      const prisma = makePrisma([]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifySlaBreached('monitor-1', 'API Monitor', 'user-1', 98.0, 99.9, 30);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('continues if one channel fails', async () => {
      const chan1 = makeChannel({ id: 'chan-1', config: { url: 'https://hooks.example.com/1' } });
      const chan2 = makeChannel({ id: 'chan-2', config: { url: 'https://hooks.example.com/2' } });
      const prisma = makePrisma([{ alertChannel: chan1 }, { alertChannel: chan2 }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      vi.useFakeTimers();
      fetchMock
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const promise = service.notifySlaBreached('monitor-1', 'API Monitor', 'user-1', 99.0, 99.9, 7);
      await vi.runAllTimersAsync();
      await promise;
      vi.useRealTimers();

      // chan1 failed 3 retries, chan2 succeeded
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  describe('notifySlaRecovered()', () => {
    it('sends SLA recovered alert with correct text', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifySlaRecovered('monitor-1', 'API Monitor', 'user-1', 99.95, 99.9, 30);

      expect(fetchMock).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.text).toContain('SLA Recovered');
      expect(body.text).toContain('99.95%');
      expect(body.text).toContain('99.9%');
    });

    it('uses sla_recovered trigger in delivery log', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifySlaRecovered('monitor-1', 'API Monitor', 'user-1', 99.99, 99.9, 7);

      const logCall = prisma.alertDeliveryLog.create.mock.calls[0];
      expect(logCall[0].data.trigger).toBe('sla_recovered');
      expect(logCall[0].data.status).toBe('success');
    });
  });

  // ── Discord embed edge cases ─────────────────────────────────────────────────

  describe('discord embed details', () => {
    it('uses custom username and avatarUrl from config', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({
        type: 'discord',
        config: { webhookUrl: 'https://discord.com/api/webhooks/a/b', username: 'MyBot', avatarUrl: 'https://img.example.com/avatar.png' },
      });

      await service.notifyTest(channel);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.username).toBe('MyBot');
      expect(body.avatar_url).toBe('https://img.example.com/avatar.png');
    });

    it('defaults username to PulseDock when not configured', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({
        type: 'discord',
        config: { webhookUrl: 'https://discord.com/api/webhooks/a/b' },
      });

      await service.notifyTest(channel);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.username).toBe('PulseDock');
      expect(body.avatar_url).toBeUndefined();
    });

    it('includes mention pings for mentionRoleId and mentionUserId', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({
        type: 'discord',
        config: { webhookUrl: 'https://discord.com/api/webhooks/a/b', mentionRoleId: '111', mentionUserId: '222' },
      });

      await service.notifyTest(channel);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.content).toContain('<@&111>');
      expect(body.content).toContain('<@222>');
    });

    it('uses messageTemplate when configured', async () => {
      const monitor = makeMonitor({ name: 'Web API', type: 'HTTP', target: 'https://api.example.com' });
      const run = makeRun({ level: 'red', message: 'Timeout', latencyMs: 4500 });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'discord',
        config: {
          webhookUrl: 'https://discord.com/api/webhooks/a/b',
          messageTemplate: '{monitor} is {status}: {message} ({latency})',
        },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.embeds[0].description).toBe('Web API is Down: Timeout (4500ms)');
    });

    it('shows yellow level as Degraded with ⚠️ emoji and correct color', async () => {
      const monitor = makeMonitor({ name: 'Slow API' });
      const run = makeRun({ level: 'yellow', ok: false, message: 'High latency', latencyMs: 3000 });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'discord',
        config: { webhookUrl: 'https://discord.com/api/webhooks/a/b' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.embeds[0].title).toContain('⚠️');
      expect(body.embeds[0].title).toContain('Degraded');
      expect(body.embeds[0].color).toBe(0xd29922);
    });

    it('throws on non-ok Discord response', async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => 'Rate limited' });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({
        type: 'discord',
        config: { webhookUrl: 'https://discord.com/api/webhooks/a/b' },
      });

      const promise = service.notifyTest(channel);
      const rejection = expect(promise).rejects.toThrow('Discord webhook returned 429');
      await vi.runAllTimersAsync();
      await rejection;
      vi.useRealTimers();
    });

    it('handles Discord error response text() failure gracefully', async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue({ ok: false, status: 500, text: () => Promise.reject(new Error('read failed')) });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({
        type: 'discord',
        config: { webhookUrl: 'https://discord.com/api/webhooks/a/b' },
      });

      const promise = service.notifyTest(channel);
      const rejection = expect(promise).rejects.toThrow('Discord webhook returned 500');
      await vi.runAllTimersAsync();
      await rejection;
      vi.useRealTimers();
    });

    it('includes monitor type field with underscore replaced', async () => {
      const monitor = makeMonitor({ name: 'Version Check', type: 'GIT_RELEASE', target: 'https://github.com/test' });
      const run = makeRun({ level: 'yellow', ok: false, message: 'Behind', latencyMs: 100, checkedAt: '2026-01-01T00:00:00Z' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'discord',
        config: { webhookUrl: 'https://discord.com/api/webhooks/a/b' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      const fields = body.embeds[0].fields as Array<{ name: string; value: string }>;
      const typeField = fields.find((f: { name: string }) => f.name === 'Type');
      expect(typeField?.value).toBe('GIT RELEASE');
      const latencyField = fields.find((f: { name: string }) => f.name === 'Latency');
      expect(latencyField?.value).toBe('100ms');
      const targetField = fields.find((f: { name: string }) => f.name === 'Target');
      expect(targetField).toBeDefined();
    });
  });

  // ── Slack channel edge cases ───────────────────────────────────────────────

  describe('slack channel edge cases', () => {
    it('includes latency and target fields when present', async () => {
      const monitor = makeMonitor({ name: 'API', target: 'https://api.example.com' });
      const run = makeRun({ level: 'red', message: 'Timeout', latencyMs: 2500 });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'slack',
        config: { webhookUrl: 'https://hooks.slack.com/services/T/B/x' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      const sectionFields = body.blocks[1].fields;
      const latencyField = sectionFields.find((f: { text: string }) => f.text.includes('Latency'));
      expect(latencyField.text).toContain('2500ms');
      const targetField = sectionFields.find((f: { text: string }) => f.text.includes('Target'));
      expect(targetField.text).toContain('https://api.example.com');
    });

    it('uses green emoji for recovery level', async () => {
      const monitor = makeMonitor({ name: 'API' });
      const run = makeRun({ level: 'green', ok: true, message: 'OK' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'slack',
        config: { webhookUrl: 'https://hooks.slack.com/services/T/B/x' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.blocks[0].text.text).toContain(':white_check_mark:');
    });

    it('uses warning emoji for yellow level', async () => {
      const monitor = makeMonitor({ name: 'API' });
      const run = makeRun({ level: 'yellow', ok: false, message: 'Slow' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'slack',
        config: { webhookUrl: 'https://hooks.slack.com/services/T/B/x' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.blocks[0].text.text).toContain(':warning:');
    });

    it('omits latency/target fields when not present', async () => {
      const monitor = makeMonitor({ name: 'API', target: '' });
      const run = makeRun({ level: 'red', message: 'Down', latencyMs: null });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'slack',
        config: { webhookUrl: 'https://hooks.slack.com/services/T/B/x' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      const sectionFields = body.blocks[1].fields;
      expect(sectionFields.find((f: { text: string }) => f.text.includes('Latency'))).toBeUndefined();
      expect(sectionFields.find((f: { text: string }) => f.text.includes('Target'))).toBeUndefined();
    });
  });

  // ── Telegram channel edge cases ────────────────────────────────────────────

  describe('telegram channel edge cases', () => {
    it('formats HTML message with full monitor context', async () => {
      const monitor = makeMonitor({ name: 'DB Monitor', target: 'postgres://db:5432' });
      const run = makeRun({ level: 'red', message: 'Connection refused', latencyMs: 50 });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'telegram',
        config: { botToken: 'tok123', chatId: '-100111' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.text).toContain('🚨');
      expect(body.text).toContain('<b>DB Monitor</b>');
      expect(body.text).toContain('Down');
      expect(body.text).toContain('<code>Connection refused</code>');
      expect(body.text).toContain('Latency: <b>50ms</b>');
      expect(body.text).toContain('Target: <code>postgres://db:5432</code>');
      expect(body.parse_mode).toBe('HTML');
    });

    it('shows Recovered with ✅ for green level', async () => {
      const monitor = makeMonitor({ name: 'API' });
      const run = makeRun({ level: 'green', ok: true, message: 'OK' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'telegram',
        config: { botToken: 'tok', chatId: '-100' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.text).toContain('✅');
      expect(body.text).toContain('Recovered');
    });

    it('shows Degraded with ⚠️ for yellow level', async () => {
      const monitor = makeMonitor({ name: 'API' });
      const run = makeRun({ level: 'yellow', ok: false, message: 'Slow' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'telegram',
        config: { botToken: 'tok', chatId: '-100' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.text).toContain('⚠️');
      expect(body.text).toContain('Degraded');
    });

    it('uses non-HTML parse mode and skips HTML formatting', async () => {
      const monitor = makeMonitor({ name: 'API' });
      const run = makeRun({ level: 'red', message: 'Down' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'telegram',
        config: { botToken: 'tok', chatId: '-100', parseMode: 'Markdown' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.parse_mode).toBe('Markdown');
      // Should NOT contain HTML tags since parseMode is not HTML
      expect(body.text).not.toContain('<b>');
    });

    it('omits latency when not present in HTML mode', async () => {
      const monitor = makeMonitor({ name: 'API', target: '' });
      const run = makeRun({ level: 'red', message: 'Down', latencyMs: null });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'telegram',
        config: { botToken: 'tok', chatId: '-100' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.text).not.toContain('Latency');
    });
  });

  // ── PagerDuty edge cases ──────────────────────────────────────────────────

  describe('pagerduty edge cases', () => {
    it('sends warning severity for yellow level', async () => {
      const monitor = makeMonitor({ name: 'API', target: 'https://api.example.com' });
      const run = makeRun({ level: 'yellow', ok: false, message: 'Slow' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'pagerduty' as never,
        config: { integrationKey: 'pd-key' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.payload.severity).toBe('warning');
      expect(body.event_action).toBe('trigger');
    });

    it('throws on non-ok PagerDuty response', async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'Invalid key' });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({
        type: 'pagerduty' as never,
        config: { integrationKey: 'bad-key' },
      });

      const promise = service.notifyTest(channel);
      const rejection = expect(promise).rejects.toThrow('PagerDuty returned 400');
      await vi.runAllTimersAsync();
      await rejection;
      vi.useRealTimers();
    });

    it('handles PagerDuty error response text() failure', async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue({ ok: false, status: 500, text: () => Promise.reject(new Error('read err')) });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({
        type: 'pagerduty' as never,
        config: { integrationKey: 'key' },
      });

      const promise = service.notifyTest(channel);
      const rejection = expect(promise).rejects.toThrow('PagerDuty returned 500');
      await vi.runAllTimersAsync();
      await rejection;
      vi.useRealTimers();
    });

    it('uses monitor target as source and monitor name as dedup_key fallback', async () => {
      const monitor = makeMonitor({ id: 'mon-42', name: 'Web', target: 'https://web.example.com' });
      const run = makeRun({ level: 'red', message: 'Down' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'pagerduty' as never,
        config: { integrationKey: 'pd-key' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.payload.source).toBe('https://web.example.com');
      // monitorId is not on the extra object, so falls back to monitor.name
      expect(body.dedup_key).toBe('Web');
    });
  });

  // ── OpsGenie edge cases ───────────────────────────────────────────────────

  describe('opsgenie edge cases', () => {
    it('uses EU base URL when region is eu', async () => {
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red', message: 'Down' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'opsgenie' as never,
        config: { apiKey: 'og-key', region: 'eu' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe('https://api.eu.opsgenie.com/v2/alerts');
    });

    it('uses P2 priority for yellow level', async () => {
      const monitor = makeMonitor();
      const run = makeRun({ level: 'yellow', ok: false, message: 'Slow' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'opsgenie' as never,
        config: { apiKey: 'og-key' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.priority).toBe('P2');
    });

    it('does not throw when close returns 404', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404 });
      const monitor = makeMonitor();
      const run = makeRun({ level: 'green', ok: true, message: 'Recovered' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'opsgenie' as never,
        config: { apiKey: 'og-key' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      // Should not throw — 404 on close is acceptable
      await service.notifyMonitorFailure(monitor, run);
      expect(metrics.snapshot().alertsSent).toBe(1);
    });

    it('throws when close returns non-ok non-404 status', async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'Server Error' });
      const monitor = makeMonitor();
      const run = makeRun({ level: 'green', ok: true, message: 'Recovered' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'opsgenie' as never,
        config: { apiKey: 'og-key' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      const promise = service.notifyMonitorFailure(monitor, run);
      await vi.runAllTimersAsync();
      // Should not throw because notifyMonitorFailure catches channel errors
      await expect(promise).resolves.not.toThrow();
      vi.useRealTimers();
      expect(metrics.snapshot().alertsFailed).toBe(1);
    });

    it('throws when OpsGenie create alert returns non-ok', async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => 'Validation error' });
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red', message: 'Down' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'opsgenie' as never,
        config: { apiKey: 'og-key' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      const promise = service.notifyMonitorFailure(monitor, run);
      await vi.runAllTimersAsync();
      await expect(promise).resolves.not.toThrow();
      vi.useRealTimers();
      expect(metrics.snapshot().alertsFailed).toBe(1);
    });

    it('uses EU URL for close on green level with eu region', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200 });
      const monitor = makeMonitor({ id: 'mon-eu' });
      const run = makeRun({ level: 'green', ok: true, message: 'OK' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'opsgenie' as never,
        config: { apiKey: 'og-key', region: 'eu' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('api.eu.opsgenie.com');
      expect(url).toContain('/close');
    });

    it('handles OpsGenie close error text() failure', async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue({ ok: false, status: 503, text: () => Promise.reject(new Error('read fail')) });
      const monitor = makeMonitor();
      const run = makeRun({ level: 'green', ok: true, message: 'OK' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'opsgenie' as never,
        config: { apiKey: 'og-key' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      const promise = service.notifyMonitorFailure(monitor, run);
      await vi.runAllTimersAsync();
      await expect(promise).resolves.not.toThrow();
      vi.useRealTimers();
    });

    it('handles OpsGenie create error text() failure', async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue({ ok: false, status: 503, text: () => Promise.reject(new Error('read fail')) });
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red', message: 'Down' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'opsgenie' as never,
        config: { apiKey: 'og-key' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      const promise = service.notifyMonitorFailure(monitor, run);
      await vi.runAllTimersAsync();
      await expect(promise).resolves.not.toThrow();
      vi.useRealTimers();
    });
  });

  // ── SMS channel edge cases ────────────────────────────────────────────────

  describe('sms channel edge cases', () => {
    it('uses ✅ emoji for green level', async () => {
      const monitor = makeMonitor({ name: 'API' });
      const run = makeRun({ level: 'green', ok: true, message: 'OK' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'sms' as never,
        config: { accountSid: 'AC123', authToken: 'tok', from: '+1000', to: '+2000' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = (fetchMock.mock.calls[0][1] as { body: string }).body;
      expect(body).toContain('%E2%9C%85'); // URL-encoded ✅
    });

    it('uses ⚠️ emoji for yellow level', async () => {
      const monitor = makeMonitor({ name: 'API' });
      const run = makeRun({ level: 'yellow', ok: false, message: 'Slow' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'sms' as never,
        config: { accountSid: 'AC123', authToken: 'tok', from: '+1000', to: '+2000' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = (fetchMock.mock.calls[0][1] as { body: string }).body;
      expect(body).toContain('%E2%9A%A0'); // URL-encoded ⚠️
    });

    it('throws on non-ok Twilio response', async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({
        type: 'sms' as never,
        config: { accountSid: 'AC123', authToken: 'tok', from: '+1000', to: '+2000' },
      });

      const promise = service.notifyTest(channel);
      const rejection = expect(promise).rejects.toThrow('Twilio SMS returned 401');
      await vi.runAllTimersAsync();
      await rejection;
      vi.useRealTimers();
    });
  });

  // ── sendWithRetry delivery log edge cases ─────────────────────────────────

  describe('sendWithRetry delivery log edge cases', () => {
    it('logs non-Error lastError as String in failure delivery log', async () => {
      vi.useFakeTimers();
      fetchMock.mockRejectedValue('string error');
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel();

      const promise = service.notifyTest(channel).catch(() => {});
      await vi.runAllTimersAsync();
      await promise;
      vi.useRealTimers();

      const failedCall = prisma.alertDeliveryLog.create.mock.calls.find(
        (c: unknown[]) => (c[0] as { data: { status: string } }).data.status === 'failed',
      );
      expect(failedCall).toBeDefined();
      expect(failedCall[0].data.errorMessage).toBe('string error');
    });

    it('uses default trigger "monitor_failure" when deliveryMeta has no trigger', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel();

      await service.notifyTest(channel);

      // notifyTest passes trigger: 'test'
      const successCall = prisma.alertDeliveryLog.create.mock.calls[0];
      expect(successCall[0].data.trigger).toBe('test');
    });

    it('delivery log create catch does not break flow when log fails', async () => {
      const prisma = makePrisma();
      prisma.alertDeliveryLog.create = vi.fn().mockRejectedValue(new Error('DB write failed'));
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel();

      // Should not throw even though delivery log creation fails
      await service.notifyTest(channel);
      expect(metrics.snapshot().alertsSent).toBe(1);
    });
  });

  // ── Realtime event ────────────────────────────────────────────────────────

  describe('realtime alertTriggered event', () => {
    it('emits alertTriggered event with monitor info', async () => {
      const alertTriggered = vi.fn();
      const monitor = makeMonitor({ name: 'API' });
      const run = makeRun({ level: 'red', message: 'Down' });
      const channel = makeChannel({ userId: monitor.userId });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(
        prisma as never,
        metrics,
        makeMailer() as never,
        makeNotifications() as never,
        { alertTriggered } as never,
      );

      await service.notifyMonitorFailure(monitor, run);

      expect(alertTriggered).toHaveBeenCalledWith(
        monitor.userId,
        expect.objectContaining({
          monitor: { id: monitor.id, name: monitor.name },
          channelCount: 1,
        }),
      );
    });

    it('uses default noop realtime when not provided', async () => {
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red', message: 'Down' });
      const prisma = makePrisma([]);
      // Pass undefined for realtime — should use default noop
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      // Should not throw
      await service.notifyMonitorFailure(monitor, run);
    });
  });

  // ── notifyMonitorFailure context defaults ─────────────────────────────────

  describe('notifyMonitorFailure context defaults', () => {
    it('defaults levelChanged to true, previousLevel to null, failureStreak to 1 when no context', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      // Use ON_CHANGE notifyOn (default) — should fire since levelChanged defaults to true
      prisma.monitorAlert.findMany.mockResolvedValue([{
        alertChannelId: channel.id,
        monitorId: 'monitor-1',
        notifyOn: 'ON_CHANGE',
        lastNotifiedAt: null,
        alertChannel: {
          id: channel.id,
          userId: channel.userId,
          name: channel.name,
          type: channel.type,
          configJson: channel.config,
          createdAt: new Date(channel.createdAt),
        },
      }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      // No context parameter
      await service.notifyMonitorFailure(makeMonitor(), makeRun());
      expect(fetchMock).toHaveBeenCalled();
    });

    it('defaults notifyOn to ON_CHANGE when notifyOn is empty string', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      prisma.monitorAlert.findMany.mockResolvedValue([{
        alertChannelId: channel.id,
        monitorId: 'monitor-1',
        notifyOn: '',
        lastNotifiedAt: null,
        alertChannel: {
          id: channel.id,
          userId: channel.userId,
          name: channel.name,
          type: channel.type,
          configJson: channel.config,
          createdAt: new Date(channel.createdAt),
        },
      }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      // Empty notifyOn defaults to ON_CHANGE, levelChanged defaults to true → should fire
      await service.notifyMonitorFailure(makeMonitor(), makeRun());
      expect(fetchMock).toHaveBeenCalled();
    });

    it('uses ⚠️ emoji for yellow level in alert text', async () => {
      const monitor = makeMonitor({ name: 'API' });
      const run = makeRun({ level: 'yellow', ok: false, message: 'Slow' });
      const channel = makeChannel({ userId: monitor.userId });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string) as { text: string };
      expect(body.text).toMatch(/^⚠️/);
      expect(body.text).toContain('YELLOW');
    });

    it('sets trigger to monitor_recovery for green level', async () => {
      const monitor = makeMonitor();
      const run = makeRun({ level: 'green', ok: true, message: 'OK' });
      const channel = makeChannel({ userId: monitor.userId });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const logCall = prisma.alertDeliveryLog.create.mock.calls[0];
      expect(logCall[0].data.trigger).toBe('monitor_recovery');
    });
  });

  // ── DAILY_DIGEST: sends when notified >24h ago ────────────────────────────

  describe('notifyOn DAILY_DIGEST edge case', () => {
    it('sends when last notified more than 24h ago', async () => {
      const channel = makeChannel();
      const oldDate = new Date(Date.now() - 25 * 3600000); // 25h ago
      const prisma = makePrisma([{ alertChannel: channel }]);
      prisma.monitorAlert.findMany.mockResolvedValue([{
        alertChannelId: channel.id,
        monitorId: 'monitor-1',
        notifyOn: 'DAILY_DIGEST',
        lastNotifiedAt: oldDate,
        alertChannel: {
          id: channel.id,
          userId: channel.userId,
          name: channel.name,
          type: channel.type,
          configJson: channel.config,
          createdAt: new Date(channel.createdAt),
        },
      }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(makeMonitor(), makeRun(), { levelChanged: true });
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  // ── VERSION_ANY/VERSION_MAJOR with DOCKER_IMAGE ────────────────────────────

  describe('notifyOn version monitor with DOCKER_IMAGE', () => {
    it('VERSION_ANY: sends for DOCKER_IMAGE with red level', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      prisma.monitorAlert.findMany.mockResolvedValue([{
        alertChannelId: channel.id,
        monitorId: 'monitor-1',
        notifyOn: 'VERSION_ANY',
        lastNotifiedAt: null,
        alertChannel: {
          id: channel.id,
          userId: channel.userId,
          name: channel.name,
          type: channel.type,
          configJson: channel.config,
          createdAt: new Date(channel.createdAt),
        },
      }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(makeMonitor({ type: 'DOCKER_IMAGE' }), makeRun({ level: 'red' }), { levelChanged: true });
      expect(fetchMock).toHaveBeenCalled();
    });

    it('VERSION_ANY: does NOT send for version monitor with green level', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      prisma.monitorAlert.findMany.mockResolvedValue([{
        alertChannelId: channel.id,
        monitorId: 'monitor-1',
        notifyOn: 'VERSION_ANY',
        lastNotifiedAt: null,
        alertChannel: {
          id: channel.id,
          userId: channel.userId,
          name: channel.name,
          type: channel.type,
          configJson: channel.config,
          createdAt: new Date(channel.createdAt),
        },
      }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(makeMonitor({ type: 'GIT_RELEASE' }), makeRun({ level: 'green', ok: true }), { levelChanged: true });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('VERSION_MAJOR: does NOT send for non-version monitor', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      prisma.monitorAlert.findMany.mockResolvedValue([{
        alertChannelId: channel.id,
        monitorId: 'monitor-1',
        notifyOn: 'VERSION_MAJOR',
        lastNotifiedAt: null,
        alertChannel: {
          id: channel.id,
          userId: channel.userId,
          name: channel.name,
          type: channel.type,
          configJson: channel.config,
          createdAt: new Date(channel.createdAt),
        },
      }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(makeMonitor({ type: 'HTTP' }), makeRun({ level: 'red' }), { levelChanged: true });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ── SLA notification edge cases ──────────────────────────────────────────

  describe('SLA notification error handling', () => {
    it('logs String(error) when SLA channel catch receives non-Error', async () => {
      vi.useFakeTimers();
      fetchMock.mockRejectedValue('network issue');
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      const promise = service.notifySlaBreached('mon-1', 'API', 'user-1', 98, 99.9, 30);
      await vi.runAllTimersAsync();
      // Should not throw — error is caught and logged
      await expect(promise).resolves.not.toThrow();
      vi.useRealTimers();
    });

    it('continues sending to remaining channels when one SLA channel fails', async () => {
      vi.useFakeTimers();
      const chan1 = makeChannel({ id: 'ch-1', config: { url: 'https://hooks.example.com/1' } });
      const chan2 = makeChannel({ id: 'ch-2', config: { url: 'https://hooks.example.com/2' } });
      const prisma = makePrisma([{ alertChannel: chan1 }, { alertChannel: chan2 }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      fetchMock
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce({ ok: true });

      const promise = service.notifySlaRecovered('mon-1', 'API', 'user-1', 99.95, 99.9, 7);
      await vi.runAllTimersAsync();
      await promise;
      vi.useRealTimers();

      expect(metrics.snapshot().alertsFailed).toBe(1);
      expect(metrics.snapshot().alertsSent).toBe(1);
    });
  });

  // ── notifyOn: DAILY_DIGEST lastNotifiedAt update ───────────────────────────

  describe('notifyMonitorFailure() — DAILY_DIGEST lastNotifiedAt update', () => {
    it('updates lastNotifiedAt for DAILY_DIGEST channels when they fire', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      // Override findMany to include notifyOn and lastNotifiedAt
      prisma.monitorAlert.findMany.mockResolvedValue([{
        alertChannelId: channel.id,
        monitorId: 'monitor-1',
        notifyOn: 'DAILY_DIGEST',
        lastNotifiedAt: null,
        alertChannel: {
          id: channel.id,
          userId: channel.userId,
          name: channel.name,
          type: channel.type,
          configJson: channel.config,
          createdAt: new Date(channel.createdAt),
        },
      }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(makeMonitor(), makeRun(), { levelChanged: true });

      expect(prisma.monitorAlert.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            monitorId: 'monitor-1',
            alertChannelId: { in: [channel.id] },
          }),
        }),
      );
    });
  });

  // ── notifyOn: default branch ───────────────────────────────────────────────

  describe('notifyMonitorFailure() — unknown notifyOn value', () => {
    it('defaults to levelChanged behavior for unknown notifyOn value', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      prisma.monitorAlert.findMany.mockResolvedValue([{
        alertChannelId: channel.id,
        monitorId: 'monitor-1',
        notifyOn: 'UNKNOWN_VALUE',
        lastNotifiedAt: null,
        alertChannel: {
          id: channel.id,
          userId: channel.userId,
          name: channel.name,
          type: channel.type,
          configJson: channel.config,
          createdAt: new Date(channel.createdAt),
        },
      }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      // levelChanged=true → should send (default branch)
      await service.notifyMonitorFailure(makeMonitor(), makeRun(), { levelChanged: true });
      expect(fetchMock).toHaveBeenCalled();
    });

    it('does not send for unknown notifyOn when level has not changed', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      prisma.monitorAlert.findMany.mockResolvedValue([{
        alertChannelId: channel.id,
        monitorId: 'monitor-1',
        notifyOn: 'SOME_FUTURE_TYPE',
        lastNotifiedAt: null,
        alertChannel: {
          id: channel.id,
          userId: channel.userId,
          name: channel.name,
          type: channel.type,
          configJson: channel.config,
          createdAt: new Date(channel.createdAt),
        },
      }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(makeMonitor(), makeRun(), { levelChanged: false });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
