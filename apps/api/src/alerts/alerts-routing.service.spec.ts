import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlertsRoutingService } from './alerts-routing.service';
import type { AlertChannel, Monitor, MonitorRun } from '../types';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

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
    message: 'Connection refused',
    level: 'red',
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
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
    batchWindowSec: null,
    ...overrides,
  };
}

function makeAlertLink(channel: AlertChannel, notifyOn = 'ON_CHANGE') {
  return {
    alertChannelId: channel.id,
    notifyOn,
    lastNotifiedAt: null,
    repeatIntervalMin: null,
    alertChannel: {
      id: channel.id,
      userId: channel.userId,
      name: channel.name,
      type: channel.type,
      configJson: channel.config,
      createdAt: new Date(channel.createdAt),
      alertGrouping: channel.alertGrouping,
      groupWindowSec: channel.groupWindowSec,
      groupByFolder: channel.groupByFolder,
      groupByTag: channel.groupByTag,
      messageTemplate: channel.messageTemplate ?? null,
      scheduleJson: null,
      batchWindowSec: channel.batchWindowSec ?? null,
    },
  };
}

function makePrisma(overrides: Partial<ReturnType<typeof defaultPrisma>> = {}) {
  return { ...defaultPrisma(), ...overrides };
}

function defaultPrisma() {
  return {
    maintenanceWindow: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    alertAcknowledgement: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    monitorAlert: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    monitorDependency: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    notificationPreference: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    alertRoutingRule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    monitorTag: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    alertGroup: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'group-1', channelId: 'chan-1', userId: 'user-1', monitorIds: '["monitor-1"]', groupKey: 'global' }),
      update: vi.fn().mockResolvedValue({ id: 'group-1', channelId: 'chan-1', userId: 'user-1', monitorIds: '["monitor-1"]', groupKey: 'global' }),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    alertChannel: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    alertDeliveryLog: {
      create: vi.fn().mockResolvedValue({ id: 'log-1' }),
    },
    monitorAlert_: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    monitor: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    folder: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    tag: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };
}

function makeDelivery() {
  return {
    levelToEventType: vi.fn().mockReturnValue('down'),
    sendWithRetry: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    queueBatchAlert: vi.fn(),
  };
}

function makeNotifications(shouldNotify = true) {
  return {
    shouldNotify: vi.fn().mockResolvedValue(shouldNotify),
    enqueueForDigest: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMetrics() {
  return { inc: vi.fn() };
}

function makeRealtime() {
  return { alertTriggered: vi.fn() };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('AlertsRoutingService', () => {
  let service: AlertsRoutingService;
  let prisma: ReturnType<typeof defaultPrisma>;
  let delivery: ReturnType<typeof makeDelivery>;
  let notifications: ReturnType<typeof makeNotifications>;
  let metrics: ReturnType<typeof makeMetrics>;
  let realtime: ReturnType<typeof makeRealtime>;

  beforeEach(() => {
    prisma = defaultPrisma();
    delivery = makeDelivery();
    notifications = makeNotifications();
    metrics = makeMetrics();
    realtime = makeRealtime();
    service = new AlertsRoutingService(
      prisma as unknown as import('../common/prisma.service').PrismaService,
      metrics as unknown as import('../common/metrics.service').MetricsService,
      notifications as unknown as import('../notifications/notifications.service').NotificationsService,
      delivery as unknown as import('./alerts-delivery.service').AlertsDeliveryService,
      realtime as unknown as import('../realtime/realtime.events').RealtimeEvents,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── notifyMonitorFailure – suppression ─────────────────────────────────────

  describe('notifyMonitorFailure – suppression', () => {
    it('suppresses alert during active maintenance window', async () => {
      prisma.maintenanceWindow.findFirst = vi.fn().mockResolvedValue({
        id: 'mw-1',
        name: 'Scheduled Maintenance',
      });
      const monitor = makeMonitor();
      const run = makeRun();
      await service.notifyMonitorFailure(monitor, run);
      expect(delivery.sendWithRetry).not.toHaveBeenCalled();
    });

    it('suppresses alert when monitor is muted', async () => {
      const monitor = makeMonitor({ mutedUntil: new Date(Date.now() + 60_000).toISOString() });
      const run = makeRun();
      await service.notifyMonitorFailure(monitor, run);
      expect(delivery.sendWithRetry).not.toHaveBeenCalled();
    });

    it('does NOT suppress alert when mutedUntil is in the past', async () => {
      const channel = makeChannel();
      prisma.monitorAlert.findMany = vi.fn().mockResolvedValue([makeAlertLink(channel)]);
      delivery.levelToEventType = vi.fn().mockReturnValue('down');
      const monitor = makeMonitor({ mutedUntil: new Date(Date.now() - 60_000).toISOString() });
      const run = makeRun();
      await service.notifyMonitorFailure(monitor, run);
      expect(delivery.sendWithRetry).toHaveBeenCalled();
    });

    it('suppresses alert when monitor has active acknowledgement', async () => {
      prisma.alertAcknowledgement.findFirst = vi.fn().mockResolvedValue({ id: 'ack-1', monitorId: 'monitor-1', clearedAt: null });
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red' });
      await service.notifyMonitorFailure(monitor, run);
      expect(delivery.sendWithRetry).not.toHaveBeenCalled();
    });

    it('suppresses alert when notification preferences disallow it', async () => {
      notifications.shouldNotify = vi.fn().mockResolvedValue(false);
      const monitor = makeMonitor();
      const run = makeRun();
      await service.notifyMonitorFailure(monitor, run);
      expect(delivery.sendWithRetry).not.toHaveBeenCalled();
    });

    it('suppresses alert when dependency monitor is down', async () => {
      prisma.monitorDependency.findMany = vi.fn().mockResolvedValue([
        { dependsOnId: 'dep-monitor-1', dependsOn: { name: 'DB Monitor' } },
      ]);
      prisma.monitorRun.findMany = vi.fn().mockResolvedValue([
        { monitorId: 'dep-monitor-1', ok: false },
      ]);
      const monitor = makeMonitor();
      const run = makeRun();
      await service.notifyMonitorFailure(monitor, run);
      expect(delivery.sendWithRetry).not.toHaveBeenCalled();
    });
  });

  // ── notifyMonitorFailure – delivery ────────────────────────────────────────

  describe('notifyMonitorFailure – delivery', () => {
    it('sends alert to eligible channels', async () => {
      const channel = makeChannel();
      prisma.monitorAlert.findMany = vi.fn().mockResolvedValue([makeAlertLink(channel, 'ON_CHANGE')]);
      delivery.levelToEventType = vi.fn().mockReturnValue('down');
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red' });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: true });
      expect(delivery.sendWithRetry).toHaveBeenCalledOnce();
    });

    it('skips channel with ON_CHANGE when level has not changed', async () => {
      const channel = makeChannel();
      prisma.monitorAlert.findMany = vi.fn().mockResolvedValue([makeAlertLink(channel, 'ON_CHANGE')]);
      delivery.levelToEventType = vi.fn().mockReturnValue('down');
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red' });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: false });
      expect(delivery.sendWithRetry).not.toHaveBeenCalled();
    });

    it('clears active acknowledgements on recovery (green)', async () => {
      const channel = makeChannel();
      prisma.monitorAlert.findMany = vi.fn().mockResolvedValue([makeAlertLink(channel, 'ON_CHANGE')]);
      delivery.levelToEventType = vi.fn().mockReturnValue('recovery');
      const monitor = makeMonitor();
      const run = makeRun({ level: 'green', ok: true });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: true });
      expect(prisma.alertAcknowledgement.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ monitorId: 'monitor-1' }) }),
      );
    });

    it('emits realtime alertTriggered event', async () => {
      const channel = makeChannel();
      prisma.monitorAlert.findMany = vi.fn().mockResolvedValue([makeAlertLink(channel, 'ALWAYS')]);
      delivery.levelToEventType = vi.fn().mockReturnValue('down');
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red' });
      await service.notifyMonitorFailure(monitor, run);
      expect(realtime.alertTriggered).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ monitor: expect.objectContaining({ id: 'monitor-1' }) }),
      );
    });

    it('includes runbook URL in alert text when configured', async () => {
      const channel = makeChannel();
      prisma.monitorAlert.findMany = vi.fn().mockResolvedValue([makeAlertLink(channel, 'ON_CHANGE')]);
      delivery.levelToEventType = vi.fn().mockReturnValue('down');
      const monitor = makeMonitor({ runbookUrl: 'https://runbook.example.com' });
      const run = makeRun({ level: 'red' });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: true });
      const [, text] = delivery.sendWithRetry.mock.calls[0] as [AlertChannel, string];
      expect(text).toContain('https://runbook.example.com');
    });

    it('queues alert for batch when batchWindowSec is set', async () => {
      const channel = makeChannel({ batchWindowSec: 60 });
      prisma.monitorAlert.findMany = vi.fn().mockResolvedValue([makeAlertLink(channel, 'ON_CHANGE')]);
      delivery.levelToEventType = vi.fn().mockReturnValue('down');
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red' });
      await service.notifyMonitorFailure(monitor, run, { levelChanged: true });
      expect(delivery.queueBatchAlert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'chan-1' }),
        'API Monitor',
        'red',
        'Connection refused',
      );
    });

    it('enqueues for digest when frequency is daily_digest', async () => {
      notifications.shouldNotify = vi.fn().mockResolvedValue(false);
      prisma.notificationPreference.findUnique = vi.fn().mockResolvedValue({ frequency: 'daily_digest' });
      const monitor = makeMonitor();
      const run = makeRun({ level: 'red' });
      await service.notifyMonitorFailure(monitor, run);
      expect(notifications.enqueueForDigest).toHaveBeenCalledWith(
        'user-1',
        'down',
        'monitor-1',
        'API Monitor',
        expect.any(String),
      );
    });
  });

  // ── notifyWithGrouping ─────────────────────────────────────────────────────

  describe('notifyWithGrouping', () => {
    it('sends directly when alertGrouping is disabled', async () => {
      const channel = makeChannel({ alertGrouping: false });
      const monitor = makeMonitor();
      const run = makeRun();
      await service.notifyWithGrouping(channel, monitor, run, 'Monitor down');
      expect(delivery.sendWithRetry).toHaveBeenCalledWith(
        channel,
        'Monitor down',
        undefined,
        { monitorId: 'monitor-1', monitorName: 'API Monitor', trigger: 'monitor_failure' },
      );
    });

    it('sends directly when no groupKey can be determined', async () => {
      const channel = makeChannel({ alertGrouping: true, groupByFolder: false, groupByTag: false });
      const monitor = makeMonitor({ folderId: null });
      const run = makeRun();
      await service.notifyWithGrouping(channel, monitor, run, 'Monitor down');
      expect(delivery.sendWithRetry).toHaveBeenCalledWith(
        channel,
        'Monitor down',
        undefined,
        { monitorId: 'monitor-1', monitorName: 'API Monitor', trigger: 'monitor_failure' },
      );
    });

    it('creates new group when no existing group found', async () => {
      const channel = makeChannel({ alertGrouping: true, groupByFolder: true, groupWindowSec: 60 });
      const monitor = makeMonitor({ folderId: 'folder-1' });
      const run = makeRun();
      prisma.alertGroup.findFirst = vi.fn().mockResolvedValue(null);
      prisma.alertGroup.create = vi.fn().mockResolvedValue({
        id: 'group-new',
        channelId: 'chan-1',
        userId: 'user-1',
        monitorIds: '["monitor-1"]',
        groupKey: 'folder:folder-1',
      });
      await service.notifyWithGrouping(channel, monitor, run, 'Monitor down');
      expect(prisma.alertGroup.create).toHaveBeenCalled();
    });

    it('updates existing group when pending group found', async () => {
      const channel = makeChannel({ alertGrouping: true, groupByFolder: true, groupWindowSec: 60 });
      const monitor = makeMonitor({ folderId: 'folder-1' });
      const run = makeRun();
      prisma.alertGroup.findFirst = vi.fn().mockResolvedValue({
        id: 'group-1',
        channelId: 'chan-1',
        userId: 'user-1',
        monitorIds: '["other-monitor"]',
        groupKey: 'folder:folder-1',
        firstAlertAt: new Date(),
      });
      prisma.alertGroup.update = vi.fn().mockResolvedValue({
        id: 'group-1',
        channelId: 'chan-1',
        userId: 'user-1',
        monitorIds: '["other-monitor","monitor-1"]',
        groupKey: 'folder:folder-1',
      });
      await service.notifyWithGrouping(channel, monitor, run, 'Monitor down');
      expect(prisma.alertGroup.update).toHaveBeenCalled();
    });
  });

  // ── notifySlaBreached ──────────────────────────────────────────────────────

  describe('notifySlaBreached', () => {
    it('sends SLA breach notification to all channels', async () => {
      const channel = makeChannel();
      prisma.monitorAlert.findMany = vi.fn().mockResolvedValue([makeAlertLink(channel, 'ALWAYS')]);
      await service.notifySlaBreached('monitor-1', 'API Monitor', 'user-1', 98.5, 99.9, 30);
      expect(delivery.sendWithRetry).toHaveBeenCalledOnce();
      const [, text] = delivery.sendWithRetry.mock.calls[0] as [AlertChannel, string];
      expect(text).toContain('SLA Breach');
      expect(text).toContain('98.5%');
      expect(text).toContain('99.9%');
      expect(text).toContain('30');
    });

    it('includes trigger=sla_breach in delivery meta', async () => {
      const channel = makeChannel();
      prisma.monitorAlert.findMany = vi.fn().mockResolvedValue([makeAlertLink(channel, 'ALWAYS')]);
      await service.notifySlaBreached('monitor-1', 'API Monitor', 'user-1', 98.0, 99.9, 7);
      const [, , , meta] = delivery.sendWithRetry.mock.calls[0] as [AlertChannel, string, unknown, { trigger: string }];
      expect(meta.trigger).toBe('sla_breach');
    });

    it('sends to no channels when no alert links exist', async () => {
      prisma.monitorAlert.findMany = vi.fn().mockResolvedValue([]);
      await service.notifySlaBreached('monitor-1', 'API Monitor', 'user-1', 97.0, 99.9, 30);
      expect(delivery.sendWithRetry).not.toHaveBeenCalled();
    });
  });

  // ── notifyBurnRateAlert ────────────────────────────────────────────────────

  describe('notifyBurnRateAlert', () => {
    it('sends critical burn rate alert when burnRate1h >= 14.4', async () => {
      const channel = makeChannel();
      prisma.monitorAlert.findMany = vi.fn().mockResolvedValue([makeAlertLink(channel, 'ALWAYS')]);
      await service.notifyBurnRateAlert('monitor-1', 'API', 'user-1', 14.4, 8.0, 45, 99.9);
      const [, text] = delivery.sendWithRetry.mock.calls[0] as [AlertChannel, string];
      expect(text).toContain('Critical');
      expect(text).toContain('14.4×');
    });

    it('sends high severity burn rate alert when burnRate1h >= 6', async () => {
      const channel = makeChannel();
      prisma.monitorAlert.findMany = vi.fn().mockResolvedValue([makeAlertLink(channel, 'ALWAYS')]);
      await service.notifyBurnRateAlert('monitor-1', 'API', 'user-1', 7.0, 5.0, 20, 99.9);
      const [, text] = delivery.sendWithRetry.mock.calls[0] as [AlertChannel, string];
      expect(text).toContain('High');
    });

    it('sends elevated severity for lower burn rates', async () => {
      const channel = makeChannel();
      prisma.monitorAlert.findMany = vi.fn().mockResolvedValue([makeAlertLink(channel, 'ALWAYS')]);
      await service.notifyBurnRateAlert('monitor-1', 'API', 'user-1', 2.0, 1.5, 10, 99.5);
      const [, text] = delivery.sendWithRetry.mock.calls[0] as [AlertChannel, string];
      expect(text).toContain('Elevated');
    });

    it('includes budget consumed percentage in text', async () => {
      const channel = makeChannel();
      prisma.monitorAlert.findMany = vi.fn().mockResolvedValue([makeAlertLink(channel, 'ALWAYS')]);
      await service.notifyBurnRateAlert('monitor-1', 'My API', 'user-1', 14.4, 8.0, 73.5, 99.9);
      const [, text] = delivery.sendWithRetry.mock.calls[0] as [AlertChannel, string];
      expect(text).toContain('73.5%');
    });

    it('uses sla_burn_rate as trigger', async () => {
      const channel = makeChannel();
      prisma.monitorAlert.findMany = vi.fn().mockResolvedValue([makeAlertLink(channel, 'ALWAYS')]);
      await service.notifyBurnRateAlert('monitor-1', 'API', 'user-1', 14.4, 8.0, 45, 99.9);
      const [, , , meta] = delivery.sendWithRetry.mock.calls[0] as [AlertChannel, string, unknown, { trigger: string }];
      expect(meta.trigger).toBe('sla_burn_rate');
    });
  });

  // ── sendGroupedAlert ───────────────────────────────────────────────────────

  describe('sendGroupedAlert', () => {
    it('returns early when no monitors are in the group', async () => {
      await service.sendGroupedAlert({
        id: 'group-1',
        channelId: 'chan-1',
        userId: 'user-1',
        monitorIds: '[]',
        groupKey: 'global',
      });
      expect(delivery.send).not.toHaveBeenCalled();
    });

    it('returns early when channel is not found', async () => {
      prisma.alertChannel.findUnique = vi.fn().mockResolvedValue(null);
      await service.sendGroupedAlert({
        id: 'group-1',
        channelId: 'chan-1',
        userId: 'user-1',
        monitorIds: '["monitor-1"]',
        groupKey: 'global',
      });
      expect(delivery.send).not.toHaveBeenCalled();
    });

    it('sends grouped alert and marks group as sent', async () => {
      prisma.alertChannel.findUnique = vi.fn().mockResolvedValue({
        id: 'chan-1',
        userId: 'user-1',
        name: 'Test Channel',
        type: 'webhook',
        configJson: { url: 'https://hooks.example.com/test' },
        createdAt: new Date(),
        alertGrouping: false,
        groupWindowSec: 300,
        groupByFolder: false,
        groupByTag: false,
        messageTemplate: null,
      });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'monitor-1', name: 'API Monitor', folderId: null },
        { id: 'monitor-2', name: 'DB Monitor', folderId: null },
      ]);
      await service.sendGroupedAlert({
        id: 'group-1',
        channelId: 'chan-1',
        userId: 'user-1',
        monitorIds: '["monitor-1","monitor-2"]',
        groupKey: 'global',
      });
      expect(delivery.send).toHaveBeenCalledOnce();
      const [, text] = delivery.send.mock.calls[0] as [AlertChannel, string];
      expect(text).toContain('2 monitors');
      expect(prisma.alertGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'group-1' }, data: expect.objectContaining({ sentAt: expect.any(Date) }) }),
      );
    });

    it('includes folder name in grouped text when groupKey starts with folder:', async () => {
      prisma.alertChannel.findUnique = vi.fn().mockResolvedValue({
        id: 'chan-1',
        userId: 'user-1',
        name: 'Test',
        type: 'webhook',
        configJson: { url: 'https://hooks.example.com' },
        createdAt: new Date(),
        alertGrouping: true,
        groupWindowSec: 300,
        groupByFolder: true,
        groupByTag: false,
        messageTemplate: null,
      });
      prisma.monitor.findMany = vi.fn().mockResolvedValue([
        { id: 'monitor-1', name: 'API', folderId: 'folder-1' },
        { id: 'monitor-2', name: 'DB', folderId: 'folder-1' },
      ]);
      prisma.folder.findUnique = vi.fn().mockResolvedValue({ name: 'Production' });
      await service.sendGroupedAlert({
        id: 'group-1',
        channelId: 'chan-1',
        userId: 'user-1',
        monitorIds: '["monitor-1","monitor-2"]',
        groupKey: 'folder:folder-1',
      });
      const [, text] = delivery.send.mock.calls[0] as [AlertChannel, string];
      expect(text).toContain('Production');
    });
  });
});
