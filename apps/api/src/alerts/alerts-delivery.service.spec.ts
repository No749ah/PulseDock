import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlertsDeliveryService } from './alerts-delivery.service';
import type { AlertChannel } from '../types';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeChannel(overrides: Partial<AlertChannel> = {}): AlertChannel {
  return {
    id: 'chan-1',
    userId: 'user-1',
    name: 'Test Webhook',
    type: 'webhook',
    config: { url: 'https://hooks.example.com/test' },
    createdAt: new Date().toISOString(),
    alertGrouping: false,
    groupWindowSec: 300,
    groupByFolder: false,
    groupByTag: false,
    messageTemplate: null,
    batchWindowSec: null,
    ...overrides,
  };
}

function makeMailer() {
  return { sendAlertEmail: vi.fn().mockResolvedValue(undefined) };
}

function makeMetrics() {
  return { inc: vi.fn() };
}

function makePrisma() {
  return {
    alertDeliveryLog: {
      create: vi.fn().mockResolvedValue({ id: 'log-1' }),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function mockFetchOk(body = '{}') {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(body),
    json: vi.fn().mockResolvedValue({}),
  });
}

function mockFetchFail(status = 400, body = 'Bad Request') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: vi.fn().mockResolvedValue(body),
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('AlertsDeliveryService', () => {
  let service: AlertsDeliveryService;
  let mailer: ReturnType<typeof makeMailer>;
  let metrics: ReturnType<typeof makeMetrics>;
  let prisma: ReturnType<typeof makePrisma>;
  let globalFetch: typeof fetch;

  beforeEach(() => {
    mailer = makeMailer();
    metrics = makeMetrics();
    prisma = makePrisma();
    service = new AlertsDeliveryService(
      prisma as unknown as import('../common/prisma.service').PrismaService,
      metrics as unknown as import('../common/metrics.service').MetricsService,
      mailer as unknown as import('../common/mailer.service').MailerService,
    );
    globalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = globalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── levelToEventType ────────────────────────────────────────────────────────

  describe('levelToEventType', () => {
    it('maps green to recovery', () => {
      expect(service.levelToEventType('green')).toBe('recovery');
    });

    it('maps yellow to degraded', () => {
      expect(service.levelToEventType('yellow')).toBe('degraded');
    });

    it('maps red to down', () => {
      expect(service.levelToEventType('red')).toBe('down');
    });

    it('maps unknown level to down', () => {
      expect(service.levelToEventType('unknown')).toBe('down');
    });
  });

  // ── webhookSignature ────────────────────────────────────────────────────────

  describe('webhookSignature', () => {
    it('returns a sha256= prefixed HMAC', () => {
      const sig = service.webhookSignature('secret', 'body');
      expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('produces consistent output for same inputs', () => {
      const sig1 = service.webhookSignature('my-secret', '{"text":"hello"}');
      const sig2 = service.webhookSignature('my-secret', '{"text":"hello"}');
      expect(sig1).toBe(sig2);
    });

    it('produces different outputs for different secrets', () => {
      const sig1 = service.webhookSignature('secret-a', 'body');
      const sig2 = service.webhookSignature('secret-b', 'body');
      expect(sig1).not.toBe(sig2);
    });
  });

  // ── renderPayloadTemplate ──────────────────────────────────────────────────

  describe('renderPayloadTemplate', () => {
    it('replaces known tokens with context values', () => {
      const channel = makeChannel({ name: 'My Channel' });
      const result = service.renderPayloadTemplate('{{text}} from {{channelName}}', {
        text: 'hello',
        channel,
      });
      expect(result).toBe('hello from My Channel');
    });

    it('replaces monitor and run tokens from extra', () => {
      const channel = makeChannel();
      const result = service.renderPayloadTemplate('{{monitor.name}} level={{run.level}}', {
        text: 'alert',
        channel,
        extra: {
          monitor: { name: 'My API', type: 'HTTP', target: 'https://api.example.com' },
          run: { level: 'red', message: 'Connection refused', latencyMs: 500 },
        },
      });
      expect(result).toBe('My API level=red');
    });

    it('replaces unknown tokens with empty string', () => {
      const channel = makeChannel();
      const result = service.renderPayloadTemplate('{{unknown.token}}', { text: 'x', channel });
      expect(result).toBe('');
    });
  });

  // ── send() – webhook ────────────────────────────────────────────────────────

  describe('send() – webhook', () => {
    it('sends a POST to the webhook URL', async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/w' } });
      await service.send(channel, 'test alert');
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://hooks.example.com/w');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body.text).toBe('test alert');
    });

    it('attaches HMAC signature header when secret is configured', async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const channel = makeChannel({
        type: 'webhook',
        config: { url: 'https://hooks.example.com/w', secret: 'my-secret' },
      });
      await service.send(channel, 'signed alert');
      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['x-pulsedock-signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('merges custom headers, excluding reserved ones', async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const channel = makeChannel({
        type: 'webhook',
        config: {
          url: 'https://hooks.example.com/w',
          customHeaders: {
            'X-API-Key': 'abc123',
            'content-type': 'text/plain', // reserved — should be ignored
          },
        },
      });
      await service.send(channel, 'custom header test');
      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['X-API-Key']).toBe('abc123');
      expect(headers['content-type']).toBe('application/json'); // reserved header not overwritten
    });

    it('renders a payload template when configured', async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const channel = makeChannel({
        type: 'webhook',
        config: { url: 'https://hooks.example.com/w', payloadTemplate: '{"msg":"{{text}}"}' },
      });
      await service.send(channel, 'hello world');
      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(opts.body).toBe('{"msg":"hello world"}');
    });
  });

  // ── send() – discord ───────────────────────────────────────────────────────

  describe('send() – discord', () => {
    it('sends embed payload to discord webhook URL', async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const channel = makeChannel({
        type: 'discord',
        config: { webhookUrl: 'https://discord.com/api/webhooks/123/abc' },
      });
      await service.send(channel, 'Monitor is down');
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://discord.com/api/webhooks/123/abc');
    });

    it('throws when discord returns non-2xx', async () => {
      globalThis.fetch = mockFetchFail(400, 'Missing webhook token') as unknown as typeof fetch;
      const channel = makeChannel({
        type: 'discord',
        config: { webhookUrl: 'https://discord.com/api/webhooks/123/bad' },
      });
      await expect(service.send(channel, 'alert')).rejects.toThrow('Discord webhook returned 400');
    });
  });

  // ── send() – slack ─────────────────────────────────────────────────────────

  describe('send() – slack', () => {
    it('sends block kit payload to slack webhook', async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const channel = makeChannel({
        type: 'slack',
        config: { webhookUrl: 'https://hooks.slack.com/services/T/B/xxx' },
      });
      await service.send(channel, 'Down!', { run: { level: 'red', message: 'timeout' }, monitor: { name: 'API' } });
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('hooks.slack.com');
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body.blocks).toBeDefined();
    });
  });

  // ── send() – email ─────────────────────────────────────────────────────────

  describe('send() – email', () => {
    it('delegates to mailer.sendAlertEmail', async () => {
      const channel = makeChannel({ type: 'email', config: { to: 'user@example.com' } });
      await service.send(channel, 'down alert');
      expect(mailer.sendAlertEmail).toHaveBeenCalledWith('user@example.com', 'down alert', undefined);
    });
  });

  // ── sendWithRetry ──────────────────────────────────────────────────────────

  describe('sendWithRetry', () => {
    it('sends successfully on first attempt and increments alertsSent', async () => {
      globalThis.fetch = mockFetchOk() as unknown as typeof fetch;
      const channel = makeChannel();
      await service.sendWithRetry(channel, 'ok', undefined, { monitorId: 'm1', monitorName: 'API', trigger: 'test' });
      expect(metrics.inc).toHaveBeenCalledWith('alertsSent');
    });

    it('retries on failure and eventually throws after exhausting retries', async () => {
      vi.useRealTimers(); // need real async timing for this test
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const channel = makeChannel();
      await expect(
        service.sendWithRetry(channel, 'fail', undefined, undefined, 2),
      ).rejects.toThrow('Network error');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(metrics.inc).toHaveBeenCalledWith('alertsFailed');
    });

    it('succeeds on second attempt (transient error)', async () => {
      vi.useRealTimers();
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('Transient'))
        .mockResolvedValueOnce({ ok: true, status: 200, text: vi.fn().mockResolvedValue('') });
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const channel = makeChannel();
      await service.sendWithRetry(channel, 'retry test', undefined, undefined, 2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(metrics.inc).toHaveBeenCalledWith('alertsSent');
    });

    it('logs success delivery to prisma', async () => {
      globalThis.fetch = mockFetchOk() as unknown as typeof fetch;
      const channel = makeChannel();
      await service.sendWithRetry(channel, 'test', undefined, { monitorId: 'm1', monitorName: 'API', trigger: 'test' });
      // prisma create is fire-and-forget; just check it was called
      expect(prisma.alertDeliveryLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'success', alertChannelId: 'chan-1' }),
        }),
      );
    });
  });

  // ── notifyTest ─────────────────────────────────────────────────────────────

  describe('notifyTest', () => {
    it('sends a test notification successfully', async () => {
      globalThis.fetch = mockFetchOk() as unknown as typeof fetch;
      const channel = makeChannel();
      await expect(service.notifyTest(channel)).resolves.toBeUndefined();
      expect(metrics.inc).toHaveBeenCalledWith('alertsSent');
    });

    it('throws when delivery fails', async () => {
      vi.useRealTimers();
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Timeout')) as unknown as typeof fetch;
      const channel = makeChannel();
      await expect(service.notifyTest(channel)).rejects.toThrow('Timeout');
    });
  });

  // ── sendToChannel ──────────────────────────────────────────────────────────

  describe('sendToChannel', () => {
    it('calls sendWithRetry with escalation trigger', async () => {
      globalThis.fetch = mockFetchOk() as unknown as typeof fetch;
      const channel = makeChannel();
      const spy = vi.spyOn(service, 'sendWithRetry');
      await service.sendToChannel(channel, 'escalated alert', undefined, 'm1', 'My Monitor');
      expect(spy).toHaveBeenCalledWith(
        channel,
        'escalated alert',
        undefined,
        { monitorId: 'm1', monitorName: 'My Monitor', trigger: 'escalation' },
      );
    });
  });

  // ── queueBatchAlert / flushBatch ───────────────────────────────────────────

  describe('queueBatchAlert + flushBatch', () => {
    it('does nothing when batchWindowSec is 0', () => {
      const channel = makeChannel({ batchWindowSec: 0 });
      service.queueBatchAlert(channel, 'API', 'red', 'down');
      expect(service.alertBatchQueue.size).toBe(0);
    });

    it('queues an alert when batchWindowSec > 0', () => {
      const channel = makeChannel({ batchWindowSec: 60 });
      service.queueBatchAlert(channel, 'API', 'red', 'down');
      expect(service.alertBatchQueue.has('chan-1')).toBe(true);
      const entry = service.alertBatchQueue.get('chan-1')!;
      expect(entry.alerts).toHaveLength(1);
      expect(entry.alerts[0].monitorName).toBe('API');
    });

    it('accumulates multiple alerts in the same batch window', () => {
      const channel = makeChannel({ batchWindowSec: 60 });
      service.queueBatchAlert(channel, 'API-1', 'red', 'down');
      service.queueBatchAlert(channel, 'API-2', 'red', 'timeout');
      const entry = service.alertBatchQueue.get('chan-1')!;
      expect(entry.alerts).toHaveLength(2);
    });

    it('flushBatch sends a grouped notification and clears the queue', async () => {
      globalThis.fetch = mockFetchOk() as unknown as typeof fetch;
      const channel = makeChannel({ batchWindowSec: 60 });
      service.queueBatchAlert(channel, 'API-1', 'red', 'down');
      service.queueBatchAlert(channel, 'API-2', 'red', 'timeout');
      await service.flushBatch('chan-1');
      expect(service.alertBatchQueue.has('chan-1')).toBe(false);
    });

    it('flushBatch is a no-op for unknown channelId', async () => {
      await expect(service.flushBatch('non-existent')).resolves.toBeUndefined();
    });

    it('flushBatch uses email delivery for email channels', async () => {
      const channel = makeChannel({ type: 'email', config: { to: 'test@example.com' }, batchWindowSec: 30 });
      service.queueBatchAlert(channel, 'DB Monitor', 'red', 'connection refused');
      await service.flushBatch('chan-1');
      expect(mailer.sendAlertEmail).toHaveBeenCalledOnce();
      expect(service.alertBatchQueue.has('chan-1')).toBe(false);
    });
  });

  // ── previewPayload ─────────────────────────────────────────────────────────

  describe('previewPayload', () => {
    it('returns valid=true for default JSON payload', () => {
      const channel = makeChannel();
      const result = service.previewPayload(channel);
      expect(result.valid).toBe(true);
      expect(result.rendered).toBeTruthy();
    });

    it('renders provided template with sample data', () => {
      const channel = makeChannel();
      // Use a template that doesn't break when monitor name includes quotes
      const result = service.previewPayload(channel, '{"status": "{{run.level}}"}');
      expect(result.valid).toBe(true);
      expect(result.rendered).toContain('"status"');
    });

    it('returns valid=false for non-JSON output', () => {
      const channel = makeChannel();
      const result = service.previewPayload(channel, 'plain text, not JSON');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ── retryDelivery ──────────────────────────────────────────────────────────

  describe('retryDelivery', () => {
    it('returns error when delivery log not found', async () => {
      prisma.alertDeliveryLog.findUnique = vi.fn().mockResolvedValue(null);
      const channel = makeChannel();
      const result = await service.retryDelivery('log-999', channel);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });

    it('returns error when log belongs to different channel', async () => {
      prisma.alertDeliveryLog.findUnique = vi.fn().mockResolvedValue({
        id: 'log-1',
        alertChannelId: 'other-channel',
        monitorId: 'm1',
        monitorName: 'API',
      });
      const channel = makeChannel({ id: 'chan-1' });
      const result = await service.retryDelivery('log-1', channel);
      expect(result.success).toBe(false);
    });

    it('retries successfully when log is valid', async () => {
      globalThis.fetch = mockFetchOk() as unknown as typeof fetch;
      prisma.alertDeliveryLog.findUnique = vi.fn().mockResolvedValue({
        id: 'log-1',
        alertChannelId: 'chan-1',
        monitorId: 'm1',
        monitorName: 'My API',
      });
      const channel = makeChannel({ id: 'chan-1' });
      const result = await service.retryDelivery('log-1', channel);
      expect(result.success).toBe(true);
    });
  });

  // ── buildDiscordEmbed ──────────────────────────────────────────────────────

  describe('buildDiscordEmbed', () => {
    it('builds correct red embed for down monitor', () => {
      const channel = makeChannel({ type: 'discord', config: { webhookUrl: 'https://discord.com/...' } });
      const payload = service.buildDiscordEmbed(channel, 'Monitor is down', {
        monitor: { name: 'API', type: 'HTTP', target: 'https://api.example.com' },
        run: { level: 'red', message: 'timeout', latencyMs: 3000, checkedAt: new Date().toISOString() },
      });
      const embed = (payload.embeds as Record<string, unknown>[])[0];
      expect(embed.color).toBe(0xf85149);
      expect(embed.title).toContain('Down');
    });

    it('builds green embed for recovery', () => {
      const channel = makeChannel({ type: 'discord', config: { webhookUrl: 'https://discord.com/...' } });
      const payload = service.buildDiscordEmbed(channel, 'Recovered', {
        monitor: { name: 'API' },
        run: { level: 'green' },
      });
      const embed = (payload.embeds as Record<string, unknown>[])[0];
      expect(embed.color).toBe(0x3fb950);
    });

    it('includes mention content when mentionRoleId is set', () => {
      const channel = makeChannel({
        type: 'discord',
        config: { webhookUrl: 'https://discord.com/...', mentionRoleId: '123456789' },
      });
      const payload = service.buildDiscordEmbed(channel, 'alert');
      expect(payload.content).toContain('<@&123456789>');
    });
  });
});
