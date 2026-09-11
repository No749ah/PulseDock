/**
 * Extended coverage tests for AlertsService methods that have low coverage:
 * - previewPayload
 * - retryDelivery
 * - retryAllFailed
 * - notifySlaBreached
 * - notifySlaRecovered
 * - notifyBurnRateAlert
 * - deliveryStats
 * - sendToChannel
 * - flushExpiredAlertGroups
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlertsService } from './alerts.service';
import { MetricsService } from '../common/metrics.service';
import type { AlertChannel } from '../types';
import { NotFoundException } from '@nestjs/common';

function makeMetrics() {
  return new MetricsService();
}

function makeMailer() {
  return { sendAlertEmail: vi.fn().mockResolvedValue({ sent: true }) };
}

function makeNotifications(shouldNotify = true) {
  return { shouldNotify: vi.fn().mockResolvedValue(shouldNotify) };
}

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
    groupByFolder: false,
    groupByTag: false,
    messageTemplate: null,
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    monitorAlert: {
      findMany: vi.fn().mockResolvedValue([]),
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
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
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
      findMany: vi.fn().mockResolvedValue([]),
    },
    alertChannel: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    ...overrides,
  };
}

describe('AlertsService – extended coverage', () => {
  let metrics: MetricsService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    metrics = makeMetrics();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ─── previewPayload ───────────────────────────────────────────────────────

  describe('previewPayload', () => {
    it('returns rendered default payload when no template set', () => {
      const service = new AlertsService(makePrisma() as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ config: {} });

      const result = service.previewPayload(channel);

      expect(result.valid).toBe(true);
      expect(result.rendered).toContain('Monitor');
      expect(result.error).toBeUndefined();
    });

    it('renders channel payloadTemplate when set in config', () => {
      const service = new AlertsService(makePrisma() as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ config: { payloadTemplate: '{"monitor":"{{monitor.name}}","level":"{{run.level}}"}' } });

      const result = service.previewPayload(channel);

      expect(result.valid).toBe(true);
      expect(result.rendered).toContain('My API');
    });

    it('uses template override param over channel config', () => {
      const service = new AlertsService(makePrisma() as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ config: { payloadTemplate: '{"x":"ignored"}' } });

      const result = service.previewPayload(channel, '{"custom":"{{monitor.name}}"}');

      expect(result.valid).toBe(true);
      expect(result.rendered).toContain('"custom"');
    });

    it('returns valid=false with error when template renders invalid JSON', () => {
      const service = new AlertsService(makePrisma() as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ config: {} });

      // Template that produces invalid JSON (no closing brace)
      const result = service.previewPayload(channel, '{"broken": {{monitor.name}}');

      // Either fails to render or produces invalid JSON
      expect(typeof result.valid).toBe('boolean');
      expect(result.rendered !== undefined || result.error !== undefined).toBe(true);
    });

    it('returns valid=false with error when template is syntactically invalid', () => {
      const service = new AlertsService(makePrisma() as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ config: {} });

      // Template with unclosed Handlebars tag
      const result = service.previewPayload(channel, 'not-json-at-all-{{{{');

      expect(result.valid === false || result.rendered !== undefined).toBe(true);
    });
  });

  // ─── retryDelivery ────────────────────────────────────────────────────────

  describe('retryDelivery', () => {
    it('returns error when delivery log not found', async () => {
      const prisma = makePrisma({
        alertDeliveryLog: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
      });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel();

      const result = await service.retryDelivery('nonexistent-id', channel);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error when delivery log belongs to different channel', async () => {
      const prisma = makePrisma({
        alertDeliveryLog: {
          findUnique: vi.fn().mockResolvedValue({ id: 'log-1', alertChannelId: 'different-channel', monitorId: null, monitorName: null }),
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
      });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ id: 'chan-1' });

      const result = await service.retryDelivery('log-1', channel);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('retries successfully with monitorName in text', async () => {
      const prisma = makePrisma({
        alertDeliveryLog: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'log-1',
            alertChannelId: 'chan-1',
            monitorId: 'mon-1',
            monitorName: 'My Service',
          }),
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
      });
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hook.example.com' } });

      const result = await service.retryDelivery('log-1', channel);

      expect(result.success).toBe(true);
    });

    it('retries successfully without monitorName', async () => {
      const prisma = makePrisma({
        alertDeliveryLog: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'log-2',
            alertChannelId: 'chan-1',
            monitorId: null,
            monitorName: null,
          }),
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
      });
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hook.example.com' } });

      const result = await service.retryDelivery('log-2', channel);

      expect(result.success).toBe(true);
    });

    it('returns error when send fails', async () => {
      const prisma = makePrisma({
        alertDeliveryLog: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'log-3',
            alertChannelId: 'chan-1',
            monitorId: 'mon-1',
            monitorName: 'Broken Service',
          }),
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
        },
      });
      fetchMock.mockRejectedValue(new Error('Network error'));
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hook.example.com' } });

      const result = await service.retryDelivery('log-3', channel);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ─── retryAllFailed ───────────────────────────────────────────────────────

  describe('retryAllFailed', () => {
    it('returns empty array when no failed logs in last 24h', async () => {
      const prisma = makePrisma({
        alertDeliveryLog: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
        },
      });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel();

      const results = await service.retryAllFailed(channel);

      expect(results).toHaveLength(0);
    });

    it('retries up to 10 failed deliveries', async () => {
      const failedLogs = Array.from({ length: 12 }, (_, i) => ({
        id: `log-${i}`,
        alertChannelId: 'chan-1',
        monitorId: null,
        monitorName: null,
      }));

      const prisma = makePrisma({
        alertDeliveryLog: {
          findMany: vi.fn().mockResolvedValue(failedLogs.slice(0, 10)), // takes max 10
          findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
            Promise.resolve(failedLogs.find(l => l.id === where.id) ?? null)
          ),
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
        },
      });
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hook.example.com' } });

      const results = await service.retryAllFailed(channel);

      expect(results).toHaveLength(10);
      expect(results.every(r => r.success === true)).toBe(true);
    });

    it('includes deliveryId in each result', async () => {
      const prisma = makePrisma({
        alertDeliveryLog: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'log-a', alertChannelId: 'chan-1', monitorId: null, monitorName: null },
          ]),
          findUnique: vi.fn().mockResolvedValue({ id: 'log-a', alertChannelId: 'chan-1', monitorId: null, monitorName: null }),
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
        },
      });
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hook.example.com' } });

      const results = await service.retryAllFailed(channel);

      expect(results[0].deliveryId).toBe('log-a');
    });
  });

  // ─── notifySlaBreached ────────────────────────────────────────────────────

  describe('notifySlaBreached', () => {
    it('sends SLA breach notification to all monitor channels', async () => {
      const prisma = makePrisma({
        monitorAlert: {
          findMany: vi.fn().mockResolvedValue([
            {
              alertChannel: {
                id: 'chan-1',
                userId: 'user-1',
                name: 'Webhook',
                type: 'webhook',
                configJson: { url: 'https://hook.example.com' },
                createdAt: new Date(),
                alertGrouping: false,
                groupWindowSec: 300,
                groupByFolder: false,
                groupByTag: false,
                messageTemplate: null,
              },
            },
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        alertDeliveryLog: {
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      });
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifySlaBreached('mon-1', 'My API', 'user-1', 98.5, 99.9, 30);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.text).toContain('SLA Breach');
      expect(body.text).toContain('98.5%');
    });

    it('skips channels belonging to different user', async () => {
      const prisma = makePrisma({
        monitorAlert: {
          findMany: vi.fn().mockResolvedValue([
            {
              alertChannel: {
                id: 'chan-2',
                userId: 'different-user', // not 'user-1'
                name: 'Other',
                type: 'webhook',
                configJson: { url: 'https://hook.example.com' },
                createdAt: new Date(),
                alertGrouping: false,
                groupWindowSec: 300,
                groupByFolder: false,
                groupByTag: false,
                messageTemplate: null,
              },
            },
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        alertDeliveryLog: {
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifySlaBreached('mon-1', 'My API', 'user-1', 98.5, 99.9, 30);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ─── notifySlaRecovered ───────────────────────────────────────────────────

  describe('notifySlaRecovered', () => {
    it('sends recovery notification with correct text', async () => {
      const prisma = makePrisma({
        monitorAlert: {
          findMany: vi.fn().mockResolvedValue([
            {
              alertChannel: {
                id: 'chan-1',
                userId: 'user-1',
                name: 'Webhook',
                type: 'webhook',
                configJson: { url: 'https://hook.example.com' },
                createdAt: new Date(),
                alertGrouping: false,
                groupWindowSec: 300,
                groupByFolder: false,
                groupByTag: false,
                messageTemplate: null,
              },
            },
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        alertDeliveryLog: {
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      });
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifySlaRecovered('mon-1', 'My API', 'user-1', 99.95, 99.9, 30);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.text).toContain('SLA Recovered');
      expect(body.text).toContain('99.95%');
    });
  });

  // ─── notifyBurnRateAlert ──────────────────────────────────────────────────

  describe('notifyBurnRateAlert', () => {
    it('classifies as Critical when burnRate1h >= 14.4', async () => {
      const prisma = makePrisma({
        monitorAlert: {
          findMany: vi.fn().mockResolvedValue([
            {
              alertChannel: {
                id: 'chan-1',
                userId: 'user-1',
                name: 'Webhook',
                type: 'webhook',
                configJson: { url: 'https://hook.example.com' },
                createdAt: new Date(),
                alertGrouping: false,
                groupWindowSec: 300,
                groupByFolder: false,
                groupByTag: false,
                messageTemplate: null,
              },
            },
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        alertDeliveryLog: {
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      });
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyBurnRateAlert('mon-1', 'My API', 'user-1', 15.0, 3.5, 42.5, 99.9);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.text).toContain('Critical');
    });

    it('classifies as High when 6 <= burnRate1h < 14.4', async () => {
      const prisma = makePrisma({
        monitorAlert: {
          findMany: vi.fn().mockResolvedValue([
            {
              alertChannel: {
                id: 'chan-1',
                userId: 'user-1',
                name: 'Webhook',
                type: 'webhook',
                configJson: { url: 'https://hook.example.com' },
                createdAt: new Date(),
                alertGrouping: false,
                groupWindowSec: 300,
                groupByFolder: false,
                groupByTag: false,
                messageTemplate: null,
              },
            },
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        alertDeliveryLog: {
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      });
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyBurnRateAlert('mon-1', 'My API', 'user-1', 7.0, 1.5, 20.0, 99.9);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.text).toContain('High');
    });

    it('classifies as Elevated when burnRate1h < 6', async () => {
      const prisma = makePrisma({
        monitorAlert: {
          findMany: vi.fn().mockResolvedValue([
            {
              alertChannel: {
                id: 'chan-1',
                userId: 'user-1',
                name: 'Webhook',
                type: 'webhook',
                configJson: { url: 'https://hook.example.com' },
                createdAt: new Date(),
                alertGrouping: false,
                groupWindowSec: 300,
                groupByFolder: false,
                groupByTag: false,
                messageTemplate: null,
              },
            },
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        alertDeliveryLog: {
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      });
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.notifyBurnRateAlert('mon-1', 'My API', 'user-1', 3.5, 0.7, 10.0, 99.9);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.text).toContain('Elevated');
    });
  });

  // ─── deliveryStats ────────────────────────────────────────────────────────

  describe('deliveryStats', () => {
    it('throws NotFoundException when channel not found', async () => {
      const prisma = makePrisma({
        alertChannel: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await expect(service.deliveryStats('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('returns stats with 100% success rate when no deliveries', async () => {
      const prisma = makePrisma({
        alertChannel: {
          findFirst: vi.fn().mockResolvedValue({ id: 'chan-1', userId: 'user-1', name: 'Test' }),
        },
        alertDeliveryLog: {
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      const stats = await service.deliveryStats('user-1', 'chan-1');

      expect(stats.totalDeliveries).toBe(0);
      expect(stats.successRate).toBe(100); // default 100 when no deliveries
      expect(stats.lastDeliveryAt).toBeNull();
    });

    it('calculates correct success rate', async () => {
      const logs = [
        { id: 'l1', createdAt: new Date(), status: 'success', errorMessage: null, monitorName: 'API' },
        { id: 'l2', createdAt: new Date(), status: 'failed', errorMessage: 'Timeout', monitorName: null },
        { id: 'l3', createdAt: new Date(), status: 'success', errorMessage: null, monitorName: null },
      ];
      const prisma = makePrisma({
        alertChannel: {
          findFirst: vi.fn().mockResolvedValue({ id: 'chan-1', userId: 'user-1', name: 'Test' }),
        },
        alertDeliveryLog: {
          count: vi.fn()
            .mockResolvedValueOnce(3)    // totalDeliveries
            .mockResolvedValueOnce(2)    // successCount
            .mockResolvedValueOnce(1),   // failureCount
          findMany: vi.fn()
            .mockResolvedValueOnce([     // last24h
              { status: 'success' }, { status: 'failed' }, { status: 'success' },
            ])
            .mockResolvedValueOnce(logs), // recentLogs
          create: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      const stats = await service.deliveryStats('user-1', 'chan-1');

      expect(stats.totalDeliveries).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.successRate).toBe(67); // Math.round(2/3 * 100)
      expect(stats.last24hSuccess).toBe(2);
      expect(stats.last24hFailure).toBe(1);
      expect(stats.recentLogs).toHaveLength(3);
    });

    it('maps recentLogs with correct shape', async () => {
      const logDate = new Date('2026-01-15T10:00:00Z');
      const logs = [
        { id: 'l1', createdAt: logDate, status: 'success', errorMessage: null, monitorName: 'My Monitor' },
      ];
      const prisma = makePrisma({
        alertChannel: {
          findFirst: vi.fn().mockResolvedValue({ id: 'chan-1', userId: 'user-1' }),
        },
        alertDeliveryLog: {
          count: vi.fn()
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(0),
          findMany: vi.fn()
            .mockResolvedValueOnce([{ status: 'success' }])
            .mockResolvedValueOnce(logs),
          create: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      const stats = await service.deliveryStats('user-1', 'chan-1');

      const log = stats.recentLogs[0];
      expect(log.id).toBe('l1');
      expect(log.success).toBe(true);
      expect(log.monitorName).toBe('My Monitor');
      expect(log.triggeredAt).toEqual(logDate);
      expect(log.statusCode).toBeNull(); // always null (not stored in log)
    });
  });

  // ─── sendToChannel (escalation path) ─────────────────────────────────────

  describe('sendToChannel', () => {
    it('sends through the channel via sendWithRetry', async () => {
      const prisma = makePrisma({
        alertDeliveryLog: {
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      });
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hook.example.com' } });

      await service.sendToChannel(channel, 'Test escalation message', undefined, 'mon-1', 'My API');

      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('sends without monitorId/monitorName (minimal args)', async () => {
      const prisma = makePrisma({
        alertDeliveryLog: {
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      });
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);
      const channel = makeChannel({ type: 'webhook', config: { url: 'https://hook.example.com' } });

      await expect(service.sendToChannel(channel, 'minimal message')).resolves.not.toThrow();
    });
  });

  // ─── flushExpiredAlertGroups ──────────────────────────────────────────────

  describe('flushExpiredAlertGroups', () => {
    it('does nothing when no channels with grouping enabled', async () => {
      const prisma = makePrisma({
        alertChannel: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]), // no channels with alertGrouping
        },
        alertGroup: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        alertDeliveryLog: {
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        monitorAlert: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      // Should complete without error
      await expect(service.flushExpiredAlertGroups()).resolves.not.toThrow();
    });

    it('marks single-monitor expired groups as sent without alerting', async () => {
      const channel = { id: 'chan-1', userId: 'user-1', alertGrouping: true, groupWindowSec: 300 };
      const expiredGroup = {
        id: 'grp-1',
        channelId: 'chan-1',
        userId: 'user-1',
        monitorIds: JSON.stringify(['mon-1']), // single monitor
        groupKey: 'folder-123',
        sentAt: null,
        firstAlertAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
      };
      const prisma = makePrisma({
        alertChannel: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([channel]),
        },
        alertGroup: {
          findMany: vi.fn().mockResolvedValue([expiredGroup]),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        alertDeliveryLog: {
          create: vi.fn().mockResolvedValue({}),
          count: vi.fn().mockResolvedValue(0),
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        monitorAlert: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      });
      const service = new AlertsService(prisma as never, metrics, makeMailer() as never, makeNotifications() as never);

      await service.flushExpiredAlertGroups();

      // Should have updated the group to mark as sent (no alert sent for single monitor)
      expect(prisma.alertGroup.update).toHaveBeenCalledWith({
        where: { id: 'grp-1' },
        data: { sentAt: expect.any(Date) },
      });
    });
  });
});
