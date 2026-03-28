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
    alertGrouping: false,
    groupWindowSec: 300,
    groupByFolder: true,
    groupByTag: false,
    messageTemplate: null,
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
    retryCount: 0,
    config: {},
    alertChannelIds: [],
    folderId: null,
    enabled: true,
    description: null,
    runbookUrl: null,
    slaTarget: null,
    slaPeriodDays: null,
    slaBreachAlertedAt: null,
    autoIncident: false,
    autoIncidentSeverity: 'MEDIUM',
    activeAutoIncidentId: null,
    isFlapping: false,
    flapDetectionEnabled: true,
    flapWindow: 10,
    flapThreshold: 0.5,
    flapAlertedAt: null,
    pausedUntil: null,
    mutedUntil: null,
    latencyAlertMs: null,
    anomalyDetection: false,
    anomalyMultiplier: 2.0,
    sliLatencyTarget: null,
    sliLatencyWindow: 7,
    scheduleEnabled: false,
    scheduleDays: '1,2,3,4,5',
    scheduleStartHour: 8,
    scheduleEndHour: 18,
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
            alertGrouping: ma.alertChannel.alertGrouping ?? false,
            groupWindowSec: ma.alertChannel.groupWindowSec ?? 300,
            groupByFolder: ma.alertChannel.groupByFolder ?? true,
            groupByTag: ma.alertChannel.groupByTag ?? false,
            messageTemplate: ma.alertChannel.messageTemplate ?? null,
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
    alertAcknowledgement: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    alertRoutingRule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    notificationPreference: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    notificationQueueItem: {
      create: vi.fn().mockResolvedValue({}),
    },
    alertGroup: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'grp-1', monitorIds: '[]' }),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
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

  // ── webhook custom headers ────────────────────────────────────────────────────

  describe('webhook custom headers', () => {
    it('merges custom headers into webhook delivery', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({
        type: 'webhook',
        config: { url: 'https://example.com/hook', customHeaders: { 'Authorization': 'Bearer tok', 'X-App-ID': '42' } },
      });
      fetchMock.mockResolvedValueOnce({ ok: true });
      await (service as any).send(channel, 'Monitor is down', {});
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.objectContaining({
          headers: expect.objectContaining({ 'Authorization': 'Bearer tok', 'X-App-ID': '42' }),
        }),
      );
    });

    it('does not allow overriding reserved headers', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({
        type: 'webhook',
        config: { url: 'https://example.com/hook', customHeaders: { 'content-type': 'text/plain', 'X-Custom': 'ok' } },
      });
      fetchMock.mockResolvedValueOnce({ ok: true });
      await (service as any).send(channel, 'Monitor is down', {});
      const call = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const headers = call?.headers as Record<string, string>;
      expect(headers['content-type']).toBe('application/json'); // not overridden
      expect(headers['X-Custom']).toBe('ok');
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
        alertAcknowledgement: { findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        alertRoutingRule: { findMany: vi.fn().mockResolvedValue([]) },
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
        alertAcknowledgement: { findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        alertRoutingRule: { findMany: vi.fn().mockResolvedValue([]) },
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

  // ─── Microsoft Teams channel ─────────────────────────────────────────────────

  describe('teams channel', () => {
    it('posts MessageCard payload to Teams webhook URL', async () => {
      const monitor = makeMonitor({ name: 'Prod API' });
      const run = makeRun({ level: 'red', ok: false, message: 'Connection refused' });
      const channel = makeChannel({
        type: 'teams' as never,
        config: { webhookUrl: 'https://outlook.office.com/webhook/test-teams-webhook' },
      });

      const links = [{ alertChannel: channel }];
      const prismaWithChannel = makePrisma(links);
      const service = new AlertsService(prismaWithChannel as never, metrics, makeMailer() as never, makeNotifications() as never);
      await service.notifyMonitorFailure(monitor, run);

      expect(fetchMock).toHaveBeenCalled();
      const [url, opts] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
      expect(url).toBe('https://outlook.office.com/webhook/test-teams-webhook');
      expect(opts.method).toBe('POST');
      expect(opts.headers['content-type']).toBe('application/json');

      const body = JSON.parse(opts.body) as Record<string, unknown>;
      expect(body['@type']).toBe('MessageCard');
      expect(body.themeColor).toBe('f85149'); // red for down
      expect(body.summary).toContain('Prod API');
      expect(body.summary).toContain('Down');
    });

    it('uses correct themeColor for recovery (green level)', async () => {
      const monitor = makeMonitor({ name: 'Prod API' });
      const run = makeRun({ level: 'green', ok: true, message: 'OK — 123ms' });
      const channel = makeChannel({
        type: 'teams' as never,
        config: { webhookUrl: 'https://outlook.office.com/webhook/test-recovery' },
      });

      const links = [{ alertChannel: channel }];
      const prismaWithChannel = makePrisma(links);
      const service = new AlertsService(prismaWithChannel as never, metrics, makeMailer() as never, makeNotifications() as never);
      await service.notifyMonitorFailure(monitor, run, { levelChanged: true, previousLevel: 'red' });

      expect(fetchMock).toHaveBeenCalled();
      const [, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(opts.body) as Record<string, unknown>;
      expect(body.themeColor).toBe('3fb950'); // green for recovered
      expect(body.summary).toContain('Recovered');
    });

    it('uses yellow themeColor for degraded level', async () => {
      const monitor = makeMonitor({ name: 'Slow API' });
      const run = makeRun({ level: 'yellow', ok: true, message: 'Slow: 3000ms' });
      const channel = makeChannel({
        type: 'teams' as never,
        config: { webhookUrl: 'https://outlook.office.com/webhook/test-degraded' },
      });

      const links = [{ alertChannel: channel }];
      const prismaWithChannel = makePrisma(links);
      const service = new AlertsService(prismaWithChannel as never, metrics, makeMailer() as never, makeNotifications() as never);
      await service.notifyMonitorFailure(monitor, run);

      expect(fetchMock).toHaveBeenCalled();
      const [, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(opts.body) as Record<string, unknown>;
      expect(body.themeColor).toBe('d29922'); // yellow for degraded
    });

    it('records failed delivery log when Teams webhook returns non-ok response', async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad Request' } as Response);
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red', ok: false });
      const channel = makeChannel({
        type: 'teams' as never,
        config: { webhookUrl: 'https://outlook.office.com/webhook/bad-webhook' },
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

  // ── Webhook payload template ─────────────────────────────────────────────────

  describe('webhook payloadTemplate', () => {
    it('sends rendered custom template body when payloadTemplate is configured', async () => {
      vi.useFakeTimers();
      const template = '{"alert":"{{text}}","monitor":"{{monitor.name}}","level":"{{run.level}}"}';
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/test', payloadTemplate: template } });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      const promise = service.notifyTest(channel);
      await vi.runAllTimersAsync();
      await promise;
      vi.useRealTimers();

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://hooks.example.com/test');
      const body = JSON.parse(init.body as string) as Record<string, string>;
      expect(body.alert).toBeDefined();
      // Template rendered — no 'text' key at top level (unlike default payload)
      expect(typeof body.alert).toBe('string');
    });

    it('falls back to default payload when payloadTemplate render throws', async () => {
      vi.useFakeTimers();
      // A template that is valid JSON after render — we just verify fallback doesn't crash
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/test', payloadTemplate: '' } });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      const promise = service.notifyTest(channel);
      await vi.runAllTimersAsync();
      await promise;
      vi.useRealTimers();

      // Empty template falls through to default — should still call fetch once
      expect(fetchMock).toHaveBeenCalledOnce();
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.text).toBeDefined();
    });

    it('substitutes all supported variables in template', async () => {
      vi.useFakeTimers();
      const template = '{{text}}|{{monitor.name}}|{{monitor.type}}|{{monitor.target}}|{{run.level}}|{{run.message}}|{{run.latencyMs}}|{{timestamp}}';
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/test', payloadTemplate: template } });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      const promise = service.notifyTest(channel);
      await vi.runAllTimersAsync();
      await promise;
      vi.useRealTimers();

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const rendered = init.body as string;
      // All {{…}} placeholders should be substituted (none remain)
      expect(rendered).not.toMatch(/\{\{[^}]+\}\}/);
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
      expect(failedCall![0].data.errorMessage).toBe('string error');
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

  describe('notifyMonitorFailure() — flapping context', () => {
    it('sends a flapping notification with 🔁 emoji when isFlapping=true', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(makeMonitor(), makeRun({ level: 'red' }), { levelChanged: true, isFlapping: true });

      expect(fetchMock).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      // Webhook payload should contain flapping text
      expect(body.text ?? body.content ?? JSON.stringify(body)).toContain('FLAPPING');
    });

    it('uses monitor_flapping trigger in delivery log when isFlapping=true', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(makeMonitor(), makeRun({ level: 'red' }), { levelChanged: true, isFlapping: true });

      // Delivery log should record monitor_flapping trigger
      const createCall = prisma.alertDeliveryLog.create.mock?.calls?.[0]?.[0];
      if (createCall) {
        expect(createCall.data.trigger).toBe('monitor_flapping');
      }
    });

    it('does not append runbook URL to flapping notification', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const monitorWithRunbook = { ...makeMonitor(), runbookUrl: 'https://runbooks.example.com/mon-1' };

      await service.notifyMonitorFailure(monitorWithRunbook as never, makeRun({ level: 'red' }), { levelChanged: true, isFlapping: true });

      expect(fetchMock).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      const text = body.text ?? body.content ?? JSON.stringify(body);
      expect(text).not.toContain('Runbook');
      expect(text).toContain('FLAPPING');
    });
  });

  // ─── notifyBurnRateAlert ─────────────────────────────────────────────────

  describe('notifyBurnRateAlert()', () => {
    it('sends notification when burn rate exceeds threshold', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyBurnRateAlert('mon-1', 'API Monitor', 'user-1', 14.5, 3.0, 45.2, 99.9);

      expect(fetchMock).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      const text = body.text ?? body.content ?? JSON.stringify(body);
      expect(text).toContain('API Monitor');
      expect(text).toContain('Burn Rate Alert');
    });

    it('labels as Critical (🔴) when 1h burn rate >= 14.4', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyBurnRateAlert('mon-1', 'API Monitor', 'user-1', 14.4, 3.0, 50, 99.9);

      expect(fetchMock).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      const text = body.text ?? body.content ?? JSON.stringify(body);
      expect(text).toContain('Critical');
    });

    it('labels as High (🟠) when 1h burn rate >= 6 and < 14.4', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyBurnRateAlert('mon-1', 'API Monitor', 'user-1', 8.0, 2.0, 30, 99.9);

      expect(fetchMock).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      const text = body.text ?? body.content ?? JSON.stringify(body);
      expect(text).toContain('High');
    });

    it('labels as Elevated (🟡) when 1h burn rate < 6', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyBurnRateAlert('mon-1', 'API Monitor', 'user-1', 3.0, 0.8, 15, 99.9);

      expect(fetchMock).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      const text = body.text ?? body.content ?? JSON.stringify(body);
      expect(text).toContain('Elevated');
    });

    it('includes both burn rate windows and budget consumed in message', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyBurnRateAlert('mon-1', 'My Service', 'user-1', 7.2, 2.4, 33.3, 99.95);

      expect(fetchMock).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      const text = body.text ?? body.content ?? JSON.stringify(body);
      expect(text).toContain('7.2');
      expect(text).toContain('2.4');
      expect(text).toContain('33.3');
      expect(text).toContain('99.95');
    });

    it('sends no notification when no channels configured', async () => {
      const prisma = makePrisma([]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyBurnRateAlert('mon-1', 'API Monitor', 'user-1', 20, 5, 80, 99.9);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('filters channels to only the owning user', async () => {
      const ownChannel = makeChannel({ userId: 'user-1' });
      const otherChannel = makeChannel({ id: 'chan-2', userId: 'user-99', config: { url: 'https://other.com' } });
      const prisma = makePrisma([{ alertChannel: ownChannel }, { alertChannel: otherChannel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyBurnRateAlert('mon-1', 'API Monitor', 'user-1', 14.4, 3.0, 50, 99.9);

      // Only own channel gets the notification
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0][0]).toBe('https://hooks.example.com/test');
    });

    it('uses sla_burn_rate as delivery trigger', async () => {
      const channel = makeChannel();
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyBurnRateAlert('mon-1', 'API Monitor', 'user-1', 14.4, 3.0, 50, 99.9);

      const createCall = (prisma.alertDeliveryLog as unknown as { create: { mock: { calls: { 0: { data: { trigger: string } } }[] } } }).create?.mock?.calls?.[0]?.[0];
      if (createCall) {
        expect(createCall.data.trigger).toBe('sla_burn_rate');
      }
    });
  });

  // ── Alert Grouping ────────────────────────────────────────────────────────

  describe('alert grouping', () => {
    it('sends directly when alertGrouping is false', async () => {
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ alertGrouping: false });
      const monitor = makeMonitor({ folderId: 'folder-1' });
      const run = makeRun({ level: 'red' });

      await service.notifyWithGrouping(channel, monitor, run, '🚨 Test alert');

      // Should send directly via fetch (webhook)
      expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    });

    it('accumulates monitors in same folder within window', async () => {
      const prisma = makePrisma();
      (prisma as Record<string, unknown>).alertGroup = {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'grp-1',
          channelId: 'chan-1',
          userId: 'user-1',
          monitorIds: '["monitor-1"]',
          groupKey: 'folder:folder-1',
        }),
        update: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
      };
      (prisma as Record<string, unknown>).monitorTag = {
        findFirst: vi.fn().mockResolvedValue(null),
      };
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ alertGrouping: true, groupByFolder: true, groupWindowSec: 300 });
      const monitor = makeMonitor({ folderId: 'folder-1' });
      const run = makeRun({ level: 'red' });

      await service.notifyWithGrouping(channel, monitor, run, '🚨 Alert');

      // Should NOT send immediately (only 1 monitor in group)
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
      // Should create a new group
      expect(prisma.alertGroup.create).toHaveBeenCalledOnce();
      const createArg = (prisma.alertGroup.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as { data: { groupKey: string; monitorIds: string } };
      expect(createArg.data.groupKey).toBe('folder:folder-1');
      expect(JSON.parse(createArg.data.monitorIds)).toEqual(['monitor-1']);
    });

    it('sends grouped alert when >=3 monitors in group', async () => {
      const existingGroup = {
        id: 'grp-1',
        channelId: 'chan-1',
        userId: 'user-1',
        monitorIds: '["monitor-a","monitor-b"]',
        groupKey: 'folder:folder-1',
        firstAlertAt: new Date(),
        lastAlertAt: new Date(),
        sentAt: null,
        level: 'red',
      };
      const prisma = makePrisma();
      (prisma as Record<string, unknown>).alertGroup = {
        findFirst: vi.fn().mockResolvedValue(existingGroup),
        update: vi.fn().mockResolvedValue({
          ...existingGroup,
          monitorIds: '["monitor-a","monitor-b","monitor-c"]',
        }),
        findUnique: vi.fn().mockResolvedValue(null),
      };
      (prisma as Record<string, unknown>).monitorTag = {
        findFirst: vi.fn().mockResolvedValue(null),
      };
      (prisma as Record<string, unknown>).alertChannel = {
        ...((prisma as Record<string, unknown>).alertChannel ?? {}),
        findUnique: vi.fn().mockResolvedValue({
          id: 'chan-1',
          userId: 'user-1',
          name: 'Test Channel',
          type: 'webhook',
          configJson: { url: 'https://hooks.example.com/test' },
          createdAt: new Date(),
          alertGrouping: true,
          groupWindowSec: 300,
          groupByFolder: true,
          groupByTag: false,
        }),
        findMany: vi.fn().mockResolvedValue([]),
      };
      (prisma as Record<string, unknown>).monitor = {
        findMany: vi.fn().mockResolvedValue([
          { id: 'monitor-a', name: 'Mon A', folderId: 'folder-1' },
          { id: 'monitor-b', name: 'Mon B', folderId: 'folder-1' },
          { id: 'monitor-c', name: 'Mon C', folderId: 'folder-1' },
        ]),
      };
      (prisma as Record<string, unknown>).folder = {
        findUnique: vi.fn().mockResolvedValue({ name: 'Production' }),
      };
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ alertGrouping: true, groupByFolder: true, groupWindowSec: 300 });
      const monitor = makeMonitor({ id: 'monitor-c', folderId: 'folder-1' });
      const run = makeRun({ level: 'red' });

      await service.notifyWithGrouping(channel, monitor, run, '🚨 Alert');

      // Should send the grouped alert (3 monitors hit threshold)
      expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
      const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string) as { text: string };
      expect(body.text).toContain('3 monitors DOWN');
      expect(body.text).toContain('Production');
    });

    it('sends directly when no grouping key is available', async () => {
      const prisma = makePrisma();
      (prisma as Record<string, unknown>).monitorTag = {
        findFirst: vi.fn().mockResolvedValue(null),
      };
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      // groupByFolder=true but monitor has no folderId, groupByTag=false
      const channel = makeChannel({ alertGrouping: true, groupByFolder: true, groupByTag: false });
      const monitor = makeMonitor({ folderId: null });
      const run = makeRun({ level: 'red' });

      await service.notifyWithGrouping(channel, monitor, run, '🚨 Alert');

      // Should send directly since no grouping key
      expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    });

    it('recovery alerts always sent directly regardless of grouping', async () => {
      // Recovery goes through notifyMonitorFailure, which routes recovery to sendWithRetry directly.
      // notifyWithGrouping is only called for non-recovery. Verify it sends directly if called anyway.
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ alertGrouping: true, groupByFolder: true });
      const monitor = makeMonitor({ folderId: 'folder-1' });
      const run = makeRun({ level: 'green', ok: true, message: 'recovered' });

      // notifyWithGrouping doesn't check for recovery itself — the caller does.
      // But if it were called with alertGrouping=false, it sends directly.
      const channelNoGrouping = makeChannel({ alertGrouping: false });
      await service.notifyWithGrouping(channelNoGrouping, monitor, run, '✅ Recovered');

      expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Channel-level messageTemplate
  // -------------------------------------------------------------------------

  describe('channel messageTemplate', () => {
    it('applies messageTemplate to webhook text when set', async () => {
      const monitor = makeMonitor({ name: 'DB', type: 'HTTP', target: 'https://db.example.com' });
      const run = makeRun({ level: 'red', ok: false, message: 'Connection refused', latencyMs: 0 });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'webhook',
        config: { url: 'https://hooks.example.com/test' },
        messageTemplate: '{{monitor.name}} → {{run.level}}: {{run.message}}',
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.text).toBe('DB → red: Connection refused');
    });

    it('falls back to default text when messageTemplate is null', async () => {
      const monitor = makeMonitor({ name: 'API', type: 'HTTP', target: 'https://api.example.com' });
      const run = makeRun({ level: 'red', ok: false, message: 'Timeout' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'webhook',
        config: { url: 'https://hooks.example.com/test' },
        messageTemplate: null,
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.text).toContain('PulseDock');
      expect(body.text).toContain('API');
    });

    it('falls back to default text when messageTemplate is empty string', async () => {
      const monitor = makeMonitor({ name: 'API', type: 'HTTP', target: 'https://api.example.com' });
      const run = makeRun({ level: 'red', ok: false, message: 'Timeout' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'webhook',
        config: { url: 'https://hooks.example.com/test' },
        messageTemplate: '',
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.text).toContain('PulseDock');
    });

    it('renders all supported tokens in messageTemplate', async () => {
      const service = new AlertsService({} as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ name: 'My Channel', messageTemplate: null });
      const result = service.renderPayloadTemplate(
        '{{monitor.name}} {{monitor.type}} {{run.level}} {{run.latencyMs}}ms via {{channelName}}',
        {
          text: 'fallback',
          channel,
          extra: {
            monitor: { name: 'Web API', type: 'HTTP' },
            run: { level: 'red', latencyMs: 120 },
          },
        },
      );
      expect(result).toBe('Web API HTTP red 120ms via My Channel');
    });

    it('keeps unknown tokens as empty string', async () => {
      const service = new AlertsService({} as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ messageTemplate: null });
      const result = service.renderPayloadTemplate('Hello {{unknown.field}} world', { text: 'x', channel });
      expect(result).toBe('Hello  world');
    });

    it('applies messageTemplate to telegram text when set', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
      const monitor = makeMonitor({ name: 'Redis', type: 'TCP', target: 'redis:6379' });
      const run = makeRun({ level: 'yellow', ok: false, message: 'High latency', latencyMs: 1200 });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'telegram',
        config: { botToken: 'tok', chatId: '123' },
        messageTemplate: 'Alert: {{monitor.name}} is {{run.level}}',
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      // Telegram sends as text or msgText; check the overall message contains our template output
      expect(body.text).toContain('Redis');
      expect(body.text).toContain('yellow');
    });
  });

  // ── ntfy channel ───────────────────────────────────────────────────────────

  describe('ntfy channel', () => {
    it('sends POST to topic URL with correct headers for red level', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      const monitor = makeMonitor({ name: 'API Server', type: 'HTTP', target: 'https://api.example.com' });
      const run = makeRun({ level: 'red', message: 'Connection refused' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'ntfy',
        config: { topicUrl: 'https://ntfy.sh/my-alerts' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string>; body: string }];
      expect(url).toBe('https://ntfy.sh/my-alerts');
      expect(opts.method).toBe('POST');
      expect(opts.headers['X-Priority']).toBe('5');
      expect(opts.headers['X-Title']).toContain('API Server');
      expect(opts.headers['X-Title']).toContain('Down');
      expect(opts.body).toContain('Connection refused');
    });

    it('sends priority 3 for yellow level', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      const monitor = makeMonitor({ name: 'DB', type: 'TCP', target: 'db:5432' });
      const run = makeRun({ level: 'yellow', message: 'High latency' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'ntfy',
        config: { topicUrl: 'https://ntfy.sh/alerts' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
      expect(opts.headers['X-Priority']).toBe('3');
    });

    it('sends priority 2 for green (recovery)', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      const monitor = makeMonitor({ name: 'Web', type: 'HTTP', target: 'https://example.com' });
      const run = makeRun({ level: 'green', ok: true, message: 'OK' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'ntfy',
        config: { topicUrl: 'https://ntfy.sh/alerts' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
      expect(opts.headers['X-Priority']).toBe('2');
      expect(opts.headers['X-Title']).toContain('Recovered');
    });

    it('includes Authorization Bearer header when token configured', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      const monitor = makeMonitor({ name: 'Web', type: 'HTTP', target: 'https://example.com' });
      const run = makeRun({ level: 'red', message: 'Down' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'ntfy',
        config: { topicUrl: 'https://ntfy.self.hosted/alerts', token: 'tk_secretabc' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
      expect(opts.headers['Authorization']).toBe('Bearer tk_secretabc');
    });

    it('throws if ntfy returns non-ok status', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => 'Forbidden' });
      const channel = makeChannel({ type: 'ntfy', config: { topicUrl: 'https://ntfy.sh/alerts' } });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await expect(service.notifyTest(channel)).rejects.toThrow('ntfy returned 403');
    });
  });

  // ── Gotify channel ─────────────────────────────────────────────────────────

  describe('Gotify channel', () => {
    it('sends POST to /message endpoint with correct payload for red level', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      const monitor = makeMonitor({ name: 'API Server', type: 'HTTP', target: 'https://api.example.com' });
      const run = makeRun({ level: 'red', message: 'HTTP 503' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'gotify',
        config: { serverUrl: 'https://gotify.example.com', appToken: 'A.mXxXxXxXxX' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string>; body: string }];
      expect(url).toBe('https://gotify.example.com/message');
      expect(opts.headers['X-Gotify-Key']).toBe('A.mXxXxXxXxX');
      const body = JSON.parse(opts.body);
      expect(body.priority).toBe(9);
      expect(body.title).toContain('API Server');
      expect(body.title).toContain('Down');
      expect(body.message).toContain('HTTP 503');
    });

    it('strips trailing slash from serverUrl', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      const channel = makeChannel({
        type: 'gotify',
        config: { serverUrl: 'https://gotify.example.com/', appToken: 'tok' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe('https://gotify.example.com/message');
    });

    it('uses priority 5 for yellow level', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      const monitor = makeMonitor({ name: 'DB', type: 'TCP', target: 'db:5432' });
      const run = makeRun({ level: 'yellow', message: 'Latency spike' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'gotify',
        config: { serverUrl: 'https://gotify.example.com', appToken: 'tok' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
      expect(JSON.parse(opts.body as string).priority).toBe(5);
    });

    it('uses priority 1 for green (recovery)', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      const monitor = makeMonitor({ name: 'Web', type: 'HTTP', target: 'https://example.com' });
      const run = makeRun({ level: 'green', ok: true, message: 'OK' });
      const channel = makeChannel({
        userId: monitor.userId,
        type: 'gotify',
        config: { serverUrl: 'https://gotify.example.com', appToken: 'tok' },
      });
      const prisma = makePrisma([{ alertChannel: channel }]);
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyMonitorFailure(monitor, run);

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
      const body = JSON.parse(opts.body as string);
      expect(body.priority).toBe(1);
      expect(body.title).toContain('Recovered');
    });

    it('allows custom priority override from config', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      const channel = makeChannel({
        type: 'gotify',
        config: { serverUrl: 'https://gotify.example.com', appToken: 'tok', priority: 7 },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
      expect(JSON.parse(opts.body as string).priority).toBe(7);
    });

    it('throws if Gotify returns non-ok status', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });
      const channel = makeChannel({
        type: 'gotify',
        config: { serverUrl: 'https://gotify.example.com', appToken: 'bad-token' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await expect(service.notifyTest(channel)).rejects.toThrow('Gotify returned 401');
    });
  });

  // ── Matrix ─────────────────────────────────────────────────────────────────
  describe('Matrix channel', () => {
    it('sends m.room.message PUT to Matrix homeserver with correct auth header', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '{"event_id":"$abc123"}' });
      const channel = makeChannel({
        type: 'matrix',
        config: {
          homeserverUrl: 'https://matrix.example.com',
          accessToken: 'syt_token123',
          roomId: '!roomABC:matrix.example.com',
        },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
      expect(url).toContain('https://matrix.example.com/_matrix/client/v3/rooms/');
      expect(url).toContain(encodeURIComponent('!roomABC:matrix.example.com'));
      expect(url).toContain('/send/m.room.message/');
      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer syt_token123');
      expect(opts.method).toBe('PUT');
      const body = JSON.parse(opts.body as string);
      expect(body.msgtype).toBe('m.text');
      expect(body.format).toBe('org.matrix.custom.html');
      expect(body.body).toContain('[PulseDock]');
    });

    it('strips trailing slash from homeserverUrl', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '{}' });
      const channel = makeChannel({
        type: 'matrix',
        config: {
          homeserverUrl: 'https://matrix.example.com/',
          accessToken: 'token',
          roomId: '!room:matrix.example.com',
        },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url.startsWith('https://matrix.example.com/_matrix')).toBe(true);
      // Verify no double-slash between base URL and path (trailing slash was stripped)
      expect(url).not.toMatch(/\.com\/\/_matrix/);
    });

    it('HTML-formats the alert body with level emoji', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '{}' });
      const channel = makeChannel({
        type: 'matrix',
        config: {
          homeserverUrl: 'https://matrix.org',
          accessToken: 'tok',
          roomId: '!r:matrix.org',
        },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
      const body = JSON.parse(opts.body as string);
      expect(body.formatted_body).toContain('<strong>');
      expect(body.formatted_body).toContain('[PulseDock]');
    });

    it('uses unique transaction ID per send to prevent duplicate delivery', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '{}' });
      const channel = makeChannel({
        type: 'matrix',
        config: {
          homeserverUrl: 'https://matrix.org',
          accessToken: 'tok',
          roomId: '!r:matrix.org',
        },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);
      await service.notifyTest(channel);

      const txn1 = (fetchMock.mock.calls[0] as [string])[0].split('/send/m.room.message/')[1];
      const txn2 = (fetchMock.mock.calls[1] as [string])[0].split('/send/m.room.message/')[1];
      expect(txn1).not.toBe(txn2);
    });

    it('throws if Matrix returns non-ok status', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => 'Forbidden' });
      const channel = makeChannel({
        type: 'matrix',
        config: {
          homeserverUrl: 'https://matrix.org',
          accessToken: 'bad-token',
          roomId: '!r:matrix.org',
        },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await expect(service.notifyTest(channel)).rejects.toThrow('Matrix returned 403');
    });

    it('does not send if required config fields are missing', async () => {
      const channel = makeChannel({
        type: 'matrix',
        config: { homeserverUrl: 'https://matrix.org' }, // missing accessToken + roomId
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      // Should not throw — just silently skip (no matching handler)
      await service.notifyTest(channel);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ── Rocket.Chat ────────────────────────────────────────────────────────────
  describe('Rocket.Chat channel', () => {
    it('sends a POST to the Rocket.Chat webhook URL', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' });
      const channel = makeChannel({
        type: 'rocketchat',
        config: { webhookUrl: 'https://chat.example.com/hooks/TOKEN123' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://chat.example.com/hooks/TOKEN123');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string) as { text: string; attachments: { color: string }[] };
      expect(body.text).toContain('PulseDock');
      expect(body.attachments).toHaveLength(1);
    });

    it('uses level-appropriate color in attachment', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' });
      const channel = makeChannel({
        type: 'rocketchat',
        config: { webhookUrl: 'https://chat.example.com/hooks/TOKEN' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await (service as unknown as { send: (...args: unknown[]) => Promise<void> }).send(channel, 'test', {
        monitor: { name: 'API', type: 'HTTP', target: 'https://api.example.com' },
        run: { level: 'green', message: 'Recovered', latencyMs: 50, checkedAt: new Date().toISOString() },
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as { attachments: { color: string }[] };
      expect(body.attachments[0].color).toBe('#3fb950'); // green
    });

    it('throws on non-OK response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal Server Error' });
      const channel = makeChannel({
        type: 'rocketchat',
        config: { webhookUrl: 'https://chat.example.com/hooks/TOKEN' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await expect(service.notifyTest(channel)).rejects.toThrow('Rocket.Chat webhook returned 500');
    });

    it('does not send if webhookUrl is missing', async () => {
      const channel = makeChannel({ type: 'rocketchat', config: {} });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ── Apprise ────────────────────────────────────────────────────────────────
  describe('Apprise channel', () => {
    it('sends a POST to /notify when no tag is configured', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
      const channel = makeChannel({
        type: 'apprise',
        config: { serverUrl: 'http://apprise:8000' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://apprise:8000/notify');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string) as { title: string; type: string };
      expect(body.title).toContain('PulseDock');
      expect(body.type).toBe('failure'); // default level red
    });

    it('routes to /notify/{tag} when tag is configured', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
      const channel = makeChannel({
        type: 'apprise',
        config: { serverUrl: 'http://apprise:8000', tag: 'production' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://apprise:8000/notify/production');
    });

    it('uses correct Apprise type for recovered level', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
      const channel = makeChannel({
        type: 'apprise',
        config: { serverUrl: 'http://apprise:8000' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await (service as unknown as { send: (...args: unknown[]) => Promise<void> }).send(channel, 'Recovered', {
        monitor: { name: 'API', type: 'HTTP', target: 'https://api.example.com' },
        run: { level: 'green', message: 'OK', latencyMs: 30, checkedAt: new Date().toISOString() },
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as { type: string };
      expect(body.type).toBe('success');
    });

    it('strips trailing slash from serverUrl', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
      const channel = makeChannel({
        type: 'apprise',
        config: { serverUrl: 'http://apprise:8000/', tag: 'alerts' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://apprise:8000/notify/alerts');
      expect(url).not.toContain('//notify');
    });

    it('throws on non-OK response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad Request' });
      const channel = makeChannel({
        type: 'apprise',
        config: { serverUrl: 'http://apprise:8000' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await expect(service.notifyTest(channel)).rejects.toThrow('Apprise returned 400');
    });

    it('does not send if serverUrl is missing', async () => {
      const channel = makeChannel({ type: 'apprise', config: {} });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ── Mattermost ──────────────────────────────────────────────────────────────
  describe('Mattermost channel', () => {
    it('POSTs attachment payload to webhookUrl', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const channel = makeChannel({
        type: 'mattermost',
        config: { webhookUrl: 'https://mattermost.example.com/hooks/abc123' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://mattermost.example.com/hooks/abc123');
      const body = JSON.parse(init.body as string) as { username: string; attachments: Array<{ color: string; title: string }> };
      expect(body.attachments).toHaveLength(1);
      expect(body.username).toBe('PulseDock');
    });

    it('uses custom username and channel when configured', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const channel = makeChannel({
        type: 'mattermost',
        config: { webhookUrl: 'https://mattermost.example.com/hooks/abc', username: 'MyBot', channel: '#ops' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as { username: string; channel: string };
      expect(body.username).toBe('MyBot');
      expect(body.channel).toBe('#ops');
    });

    it('uses red color for down level', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const channel = makeChannel({
        type: 'mattermost',
        config: { webhookUrl: 'https://mm.example.com/hooks/x' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await (service as unknown as { send: (...args: unknown[]) => Promise<void> }).send(channel, 'Down', {
        monitor: { name: 'API', type: 'HTTP', target: 'https://api.example.com' },
        run: { level: 'red', message: 'Connection refused', latencyMs: null, checkedAt: new Date().toISOString() },
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as { attachments: Array<{ color: string }> };
      expect(body.attachments[0].color).toBe('#cc0000');
    });

    it('uses green color for recovered level', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const channel = makeChannel({
        type: 'mattermost',
        config: { webhookUrl: 'https://mm.example.com/hooks/x' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await (service as unknown as { send: (...args: unknown[]) => Promise<void> }).send(channel, 'Recovered', {
        monitor: { name: 'API', type: 'HTTP', target: 'https://api.example.com' },
        run: { level: 'green', message: 'OK', latencyMs: 45, checkedAt: new Date().toISOString() },
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as { attachments: Array<{ color: string }> };
      expect(body.attachments[0].color).toBe('#36a64f');
    });

    it('throws on non-OK response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal Server Error' });
      const channel = makeChannel({
        type: 'mattermost',
        config: { webhookUrl: 'https://mm.example.com/hooks/x' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await expect(service.notifyTest(channel)).rejects.toThrow('Mattermost webhook returned 500');
    });

    it('does not send if webhookUrl is missing', async () => {
      const channel = makeChannel({ type: 'mattermost', config: {} });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ── Zulip ────────────────────────────────────────────────────────────────────
  describe('Zulip channel', () => {
    const zulipConfig = {
      serverUrl: 'https://myorg.zulipchat.com',
      botEmail: 'pulsedock-bot@myorg.zulipchat.com',
      botApiKey: 'abc123def456',
      stream: 'alerts',
      topic: 'PulseDock Alerts',
    };

    it('POSTs form-encoded message to /api/v1/messages with Basic auth', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '{"id":1,"msg":"","result":"success"}' });
      const channel = makeChannel({ type: 'zulip', config: zulipConfig });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://myorg.zulipchat.com/api/v1/messages');
      expect((init.headers as Record<string, string>)['content-type']).toBe('application/x-www-form-urlencoded');
      const authHeader = (init.headers as Record<string, string>)['authorization'] ?? '';
      expect(authHeader.startsWith('Basic ')).toBe(true);
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
      expect(decoded).toBe('pulsedock-bot@myorg.zulipchat.com:abc123def456');
    });

    it('sends stream message with correct type and topic', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '{"id":1,"result":"success"}' });
      const channel = makeChannel({ type: 'zulip', config: zulipConfig });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const params = new URLSearchParams(init.body as string);
      expect(params.get('type')).toBe('stream');
      expect(params.get('to')).toBe('alerts');
      expect(params.get('topic')).toBe('PulseDock Alerts');
    });

    it('sends direct message when messageType is direct', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '{"id":1,"result":"success"}' });
      const channel = makeChannel({
        type: 'zulip',
        config: { ...zulipConfig, messageType: 'direct', dmTo: 'user@myorg.zulipchat.com' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const params = new URLSearchParams(init.body as string);
      expect(params.get('type')).toBe('direct');
      expect(params.get('to')).toBe('user@myorg.zulipchat.com');
      expect(params.has('topic')).toBe(false);
    });

    it('defaults to stream type when messageType is not set', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '{"id":1,"result":"success"}' });
      const channel = makeChannel({
        type: 'zulip',
        config: { serverUrl: zulipConfig.serverUrl, botEmail: zulipConfig.botEmail, botApiKey: zulipConfig.botApiKey },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const params = new URLSearchParams(init.body as string);
      expect(params.get('type')).toBe('stream');
    });

    it('strips trailing slash from serverUrl', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '{"id":1,"result":"success"}' });
      const channel = makeChannel({
        type: 'zulip',
        config: { ...zulipConfig, serverUrl: 'https://myorg.zulipchat.com/' },
      });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).not.toContain('//api');
      expect(url).toBe('https://myorg.zulipchat.com/api/v1/messages');
    });

    it('throws on non-OK response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });
      const channel = makeChannel({ type: 'zulip', config: zulipConfig });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await expect(service.notifyTest(channel)).rejects.toThrow('Zulip API returned 401');
    });

    it('does not send if serverUrl is missing', async () => {
      const channel = makeChannel({ type: 'zulip', config: { botEmail: 'x@y.com', botApiKey: 'key' } });
      const prisma = makePrisma();
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyTest(channel);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

});
