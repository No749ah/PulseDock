import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanActivate, ExecutionContext, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '../common/auth.guard';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { PlanService } from '../settings/plan.service';

const mockPlanService = { checkLimit: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: -1, plan: 'COMMUNITY' }) };

// ─── Helpers ─────────────────────────────────────────────────────────────────

class MockAuthGuard implements CanActivate {
  canActivate(_ctx: ExecutionContext): boolean {
    return true;
  }
}

const req = { user: { id: 'user-1' } };

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch-1',
    userId: 'user-1',
    name: 'My Discord',
    type: 'discord',
    configJson: { url: 'https://discord.com/api/webhooks/test' },
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makePrisma(channelOverride?: ReturnType<typeof makeChannel> | null) {
  const ch = channelOverride !== undefined ? channelOverride : makeChannel();
  return {
    alertChannel: {
      findMany: vi.fn().mockResolvedValue(ch ? [ch] : []),
      findFirst: vi.fn().mockResolvedValue(ch),
      create: vi.fn().mockResolvedValue(ch ?? makeChannel()),
      update: vi.fn().mockResolvedValue(ch ?? makeChannel()),
      delete: vi.fn().mockResolvedValue(ch ?? makeChannel()),
    },
    monitorAlert: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function makeAuditService() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function makeAlertsService() {
  return { notifyTest: vi.fn().mockResolvedValue(undefined) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AlertsController', () => {
  let controller: AlertsController;
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAuditService>;
  let alertsService: ReturnType<typeof makeAlertsService>;

  async function buildModule(channelOverride?: ReturnType<typeof makeChannel> | null) {
    prisma = makePrisma(channelOverride);
    audit = makeAuditService();
    alertsService = makeAlertsService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertsController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: AlertsService, useValue: alertsService },
        { provide: AuditService, useValue: audit },
        { provide: PlanService, useValue: mockPlanService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useClass(MockAuthGuard)
      .compile();

    controller = module.get<AlertsController>(AlertsController);
  }

  beforeEach(async () => {
    await buildModule();
  });

  // ─── list() ────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns alert channels for the user', async () => {
      const result = await controller.list(req as never);
      expect(prisma.alertChannel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(result).toHaveLength(1);
    });

    it('maps channel shape with config and ISO createdAt', async () => {
      const result = await controller.list(req as never);
      expect(result[0]).toMatchObject({
        id: 'ch-1',
        userId: 'user-1',
        name: 'My Discord',
        type: 'discord',
        config: { url: 'https://discord.com/api/webhooks/test' },
      });
      expect(typeof result[0].createdAt).toBe('string');
    });

    it('returns empty array when user has no channels', async () => {
      await buildModule(null);
      const result = await controller.list(req as never);
      expect(result).toHaveLength(0);
    });

    it('falls back to {} config when channel configJson is null', async () => {
      await buildModule(makeChannel({ configJson: null }));
      const result = await controller.list(req as never);
      expect(result[0].config).toEqual({});
    });
  });

  // ─── create() ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates and returns a channel', async () => {
      const dto = { name: 'My Discord', type: 'discord', config: { url: 'https://discord.com/api/webhooks/test' } };
      const result = await controller.create(req as never, dto as never);
      expect(prisma.alertChannel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1', name: 'My Discord', type: 'discord' }),
        }),
      );
      expect(result.id).toBe('ch-1');
    });

    it('logs audit event on create', async () => {
      const dto = { name: 'My Discord', type: 'discord' };
      await controller.create(req as never, dto as never);
      expect(audit.log).toHaveBeenCalledWith('alert_channel.create', 'user-1', 'user-1', expect.any(Object));
    });

    it('defaults config to {} when not provided', async () => {
      const dto = { name: 'Slack', type: 'slack' };
      await controller.create(req as never, dto as never);
      expect(prisma.alertChannel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ configJson: {} }),
        }),
      );
    });

    it('returns {} config when created channel has null configJson', async () => {
      await buildModule(makeChannel({ configJson: null }));
      const dto = { name: 'Webhook', type: 'webhook' };
      const result = await controller.create(req as never, dto as never);
      expect(result.config).toEqual({});
    });
  });

  // ─── update() ──────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('updates and returns the channel', async () => {
      const dto = { name: 'Updated Name' };
      const result = await controller.update(req as never, 'ch-1', dto as never);
      expect(prisma.alertChannel.update).toHaveBeenCalled();
      expect(result.id).toBe('ch-1');
    });

    it('throws NotFoundException when channel not found', async () => {
      await buildModule(null);
      await expect(controller.update(req as never, 'missing', {})).rejects.toThrow(NotFoundException);
    });

    it('logs audit event on update', async () => {
      await controller.update(req as never, 'ch-1', {});
      expect(audit.log).toHaveBeenCalledWith('alert_channel.update', 'user-1', 'user-1', expect.any(Object));
    });

    it('returns {} config when updated channel has null configJson', async () => {
      await buildModule(makeChannel({ configJson: null }));
      const result = await controller.update(req as never, 'ch-1', {});
      expect(result.config).toEqual({});
    });

    it('falls back to existing values when fields are omitted', async () => {
      const dto = {}; // no name/type/config
      await controller.update(req as never, 'ch-1', dto);
      const ch = makeChannel();
      expect(prisma.alertChannel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: ch.name, type: ch.type }),
        }),
      );
    });
  });

  // ─── remove() ──────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('deletes monitor alerts and channel, returns ok', async () => {
      const result = await controller.remove(req as never, 'ch-1');
      expect(prisma.monitorAlert.deleteMany).toHaveBeenCalledWith({ where: { alertChannelId: 'ch-1' } });
      expect(prisma.alertChannel.delete).toHaveBeenCalledWith({ where: { id: 'ch-1' } });
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when channel not found', async () => {
      await buildModule(null);
      await expect(controller.remove(req as never, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('logs audit event on delete', async () => {
      await controller.remove(req as never, 'ch-1');
      expect(audit.log).toHaveBeenCalledWith('alert_channel.delete', 'user-1', 'user-1', expect.any(Object));
    });
  });

  // ─── test() ────────────────────────────────────────────────────────────────

  describe('test()', () => {
    it('sends test notification and returns ok', async () => {
      const result = await controller.test(req as never, { channelId: 'ch-1' });
      expect(alertsService.notifyTest).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ch-1', type: 'discord' }),
      );
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when channel not found', async () => {
      await buildModule(null);
      await expect(controller.test(req as never, { channelId: 'missing' })).rejects.toThrow(NotFoundException);
    });

    it('logs audit event before sending test', async () => {
      await controller.test(req as never, { channelId: 'ch-1' });
      expect(audit.log).toHaveBeenCalledWith('alert_channel.test', 'user-1', 'user-1', expect.any(Object));
    });

    it('passes channel config to notifyTest', async () => {
      await controller.test(req as never, { channelId: 'ch-1' });
      expect(alertsService.notifyTest).toHaveBeenCalledWith(
        expect.objectContaining({ config: { url: 'https://discord.com/api/webhooks/test' } }),
      );
    });

    it('falls back to {} config when channel configJson is null', async () => {
      await buildModule(makeChannel({ configJson: null }));
      const result = await controller.test(req as never, { channelId: 'ch-1' });
      expect(alertsService.notifyTest).toHaveBeenCalledWith(
        expect.objectContaining({ config: {} }),
      );
      expect(result).toEqual({ ok: true });
    });
  });

  // ─── globalDeliveries() ────────────────────────────────────────────────────

  describe('globalDeliveries()', () => {
    const makeLog = (overrides: Record<string, unknown> = {}) => ({
      id: 'log-1',
      alertChannelId: 'ch-1',
      monitorId: 'mon-1',
      monitorName: 'API Monitor',
      status: 'success',
      trigger: 'monitor_failure',
      errorMessage: null,
      durationMs: 80,
      createdAt: new Date('2026-03-20T12:00:00Z'),
      ...overrides,
    });

    it('returns empty result when user has no channels', async () => {
      await buildModule(null);
      const result = await controller.globalDeliveries(req as never);
      expect(result).toEqual({ total: 0, successCount: 0, failedCount: 0, deliveries: [] });
    });

    it('returns aggregated deliveries across multiple channels', async () => {
      const ch2 = makeChannel({ id: 'ch-2', name: 'Slack Channel', type: 'slack' });
      const customPrisma = {
        ...makePrisma(),
        alertChannel: {
          ...makePrisma().alertChannel,
          findMany: vi.fn().mockResolvedValue([makeChannel(), ch2]),
        },
        alertDeliveryLog: {
          findMany: vi.fn().mockResolvedValue([
            makeLog({ alertChannelId: 'ch-1' }),
            makeLog({ id: 'log-2', alertChannelId: 'ch-2', status: 'failed' }),
          ]),
          count: vi.fn()
            .mockResolvedValueOnce(10) // total
            .mockResolvedValueOnce(7)  // successCount
            .mockResolvedValueOnce(3), // failedCount
        },
      };
      const module: TestingModule = await Test.createTestingModule({
        controllers: [AlertsController],
        providers: [
          { provide: PrismaService, useValue: customPrisma },
          { provide: AlertsService, useValue: makeAlertsService() },
          { provide: AuditService, useValue: makeAuditService() },
          { provide: PlanService, useValue: mockPlanService },
        ],
      })
        .overrideGuard(AuthGuard)
        .useClass(MockAuthGuard)
        .compile();
      const ctrl = module.get<AlertsController>(AlertsController);

      const result = await ctrl.globalDeliveries(req as never);
      expect(result.total).toBe(10);
      expect(result.successCount).toBe(7);
      expect(result.failedCount).toBe(3);
      expect(result.deliveries).toHaveLength(2);
    });

    it('maps channel name and type from channelMap', async () => {
      const customPrisma = {
        ...makePrisma(),
        alertDeliveryLog: {
          findMany: vi.fn().mockResolvedValue([makeLog({ alertChannelId: 'ch-1' })]),
          count: vi.fn().mockResolvedValue(1),
        },
      };
      const module: TestingModule = await Test.createTestingModule({
        controllers: [AlertsController],
        providers: [
          { provide: PrismaService, useValue: customPrisma },
          { provide: AlertsService, useValue: makeAlertsService() },
          { provide: AuditService, useValue: makeAuditService() },
          { provide: PlanService, useValue: mockPlanService },
        ],
      })
        .overrideGuard(AuthGuard)
        .useClass(MockAuthGuard)
        .compile();
      const ctrl = module.get<AlertsController>(AlertsController);

      const result = await ctrl.globalDeliveries(req as never);
      expect(result.deliveries[0].channelName).toBe('My Discord');
      expect(result.deliveries[0].channelType).toBe('discord');
      expect(result.deliveries[0].channelId).toBe('ch-1');
    });

    it('falls back to Unknown/unknown for unrecognized channelId', async () => {
      const customPrisma = {
        ...makePrisma(),
        alertDeliveryLog: {
          findMany: vi.fn().mockResolvedValue([makeLog({ alertChannelId: 'ch-unknown' })]),
          count: vi.fn().mockResolvedValue(1),
        },
      };
      const module: TestingModule = await Test.createTestingModule({
        controllers: [AlertsController],
        providers: [
          { provide: PrismaService, useValue: customPrisma },
          { provide: AlertsService, useValue: makeAlertsService() },
          { provide: AuditService, useValue: makeAuditService() },
          { provide: PlanService, useValue: mockPlanService },
        ],
      })
        .overrideGuard(AuthGuard)
        .useClass(MockAuthGuard)
        .compile();
      const ctrl = module.get<AlertsController>(AlertsController);

      const result = await ctrl.globalDeliveries(req as never);
      expect(result.deliveries[0].channelName).toBe('Unknown');
      expect(result.deliveries[0].channelType).toBe('unknown');
    });
  });

  // ─── deliveries() ──────────────────────────────────────────────────────────

  describe('deliveries()', () => {
    const makeLog = (overrides: Record<string, unknown> = {}) => ({
      id: 'log-1',
      alertChannelId: 'ch-1',
      monitorId: 'mon-1',
      monitorName: 'My Monitor',
      status: 'success',
      trigger: 'monitor_failure',
      errorMessage: null,
      durationMs: 120,
      createdAt: new Date('2026-03-19T10:00:00Z'),
      ...overrides,
    });

    it('returns delivery history with stats and log entries', async () => {
      const customPrisma = {
        ...makePrisma(),
        alertDeliveryLog: {
          findMany: vi.fn().mockResolvedValue([makeLog()]),
          count: vi.fn()
            .mockResolvedValueOnce(5)  // successCount
            .mockResolvedValueOnce(2), // failedCount
        },
      };
      const module: TestingModule = await Test.createTestingModule({
        controllers: [AlertsController],
        providers: [
          { provide: PrismaService, useValue: customPrisma },
          { provide: AlertsService, useValue: makeAlertsService() },
          { provide: AuditService, useValue: makeAuditService() },
          { provide: PlanService, useValue: mockPlanService },
        ],
      })
        .overrideGuard(AuthGuard)
        .useClass(MockAuthGuard)
        .compile();
      const ctrl = module.get<AlertsController>(AlertsController);

      const result = await ctrl.deliveries(req as never, 'ch-1');
      expect(result.successCount).toBe(5);
      expect(result.failedCount).toBe(2);
      expect(result.deliveries).toHaveLength(1);
      expect(result.deliveries[0].status).toBe('success');
      expect(result.deliveries[0].durationMs).toBe(120);
    });

    it('throws NotFoundException when channel not found', async () => {
      await buildModule(null);
      await expect(controller.deliveries(req as never, 'no-ch')).rejects.toThrow(NotFoundException);
    });

    it('returns empty deliveries array when no logs exist', async () => {
      const customPrisma = {
        ...makePrisma(),
        alertDeliveryLog: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      };
      const module: TestingModule = await Test.createTestingModule({
        controllers: [AlertsController],
        providers: [
          { provide: PrismaService, useValue: customPrisma },
          { provide: AlertsService, useValue: makeAlertsService() },
          { provide: AuditService, useValue: makeAuditService() },
          { provide: PlanService, useValue: mockPlanService },
        ],
      })
        .overrideGuard(AuthGuard)
        .useClass(MockAuthGuard)
        .compile();
      const ctrl = module.get<AlertsController>(AlertsController);

      const result = await ctrl.deliveries(req as never, 'ch-1');
      expect(result.deliveries).toHaveLength(0);
      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(0);
    });

    it('maps createdAt to ISO string in delivery entries', async () => {
      const logDate = new Date('2026-03-19T10:00:00Z');
      const customPrisma = {
        ...makePrisma(),
        alertDeliveryLog: {
          findMany: vi.fn().mockResolvedValue([makeLog({ createdAt: logDate })]),
          count: vi.fn().mockResolvedValue(0),
        },
      };
      const module: TestingModule = await Test.createTestingModule({
        controllers: [AlertsController],
        providers: [
          { provide: PrismaService, useValue: customPrisma },
          { provide: AlertsService, useValue: makeAlertsService() },
          { provide: AuditService, useValue: makeAuditService() },
          { provide: PlanService, useValue: mockPlanService },
        ],
      })
        .overrideGuard(AuthGuard)
        .useClass(MockAuthGuard)
        .compile();
      const ctrl = module.get<AlertsController>(AlertsController);

      const result = await ctrl.deliveries(req as never, 'ch-1');
      expect(result.deliveries[0].createdAt).toBe(logDate.toISOString());
    });
  });
});

// ─── testAll() ───────────────────────────────────────────────────────────────

describe('testAll()', () => {
  async function makeCtrl(prismaOverride?: object, alertsServiceOverride?: object) {
    const p = prismaOverride ?? makePrisma();
    const a = alertsServiceOverride ?? makeAlertsService();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertsController],
      providers: [
        { provide: PrismaService, useValue: p },
        { provide: AlertsService, useValue: a },
        { provide: AuditService, useValue: makeAuditService() },
        { provide: PlanService, useValue: mockPlanService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useClass(MockAuthGuard)
      .compile();
    return module.get<AlertsController>(AlertsController);
  }

  it('returns tested count and results for owned channels', async () => {
    const ctrl = await makeCtrl();
    const result = await ctrl.testAll(req as never);
    expect(result.tested).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ channelId: 'ch-1', ok: true, error: null });
  });

  it('returns tested=0 when user has no channels', async () => {
    const p = {
      alertChannel: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const ctrl = await makeCtrl(p);
    const result = await ctrl.testAll(req as never);
    expect(result.tested).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it('marks a channel as ok=false with error message when notifyTest throws', async () => {
    const failingAlerts = { notifyTest: vi.fn().mockRejectedValue(new Error('Webhook timeout')) };
    const ctrl = await makeCtrl(undefined, failingAlerts);
    const result = await ctrl.testAll(req as never);
    expect(result.results[0].ok).toBe(false);
    expect(result.results[0].error).toBe('Webhook timeout');
  });

  it('handles mixed success/failure across multiple channels', async () => {
    const channels = [
      makeChannel({ id: 'ch-1', name: 'Discord' }),
      makeChannel({ id: 'ch-2', name: 'Slack', type: 'slack' }),
    ];
    const p = {
      alertChannel: { findMany: vi.fn().mockResolvedValue(channels) },
    };
    let callCount = 0;
    const mixedAlerts = {
      notifyTest: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve();
        return Promise.reject(new Error('Slack error'));
      }),
    };
    const ctrl = await makeCtrl(p, mixedAlerts);
    const result = await ctrl.testAll(req as never);
    expect(result.tested).toBe(2);
    const results = result.results as Array<{ channelId?: string; ok: boolean; error: string | null }>;
    const discordResult = results.find((r) => r.channelId === 'ch-1');
    const slackResult = results.find((r) => r.channelId === 'ch-2');
    expect(discordResult?.ok).toBe(true);
    expect(slackResult?.ok).toBe(false);
    expect(slackResult?.error).toBe('Slack error');
  });
});

// ─── analytics() ─────────────────────────────────────────────────────────────

describe('AlertsController analytics()', () => {
  class MockAuthGuard implements CanActivate {
    canActivate(_ctx: ExecutionContext): boolean { return true; }
  }

  const req = { user: { id: 'user-1' } };

  function makeLog(overrides: Record<string, unknown> = {}) {
    return {
      alertChannelId: 'ch-1',
      status: 'success',
      monitorId: 'mon-1',
      monitorName: 'API Monitor',
      durationMs: 50,
      createdAt: new Date(),
      ...overrides,
    };
  }

  async function buildAnalyticsCtrl(logs: ReturnType<typeof makeLog>[] = [], channels = [makeChannel()]) {
    const prisma = {
      alertChannel: {
        findMany: vi.fn().mockResolvedValue(channels),
      },
      alertDeliveryLog: {
        findMany: vi.fn().mockResolvedValue(logs),
      },
      monitorAlert: { deleteMany: vi.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertsController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: AlertsService, useValue: { notifyTest: vi.fn() } },
        { provide: AuditService, useValue: { log: vi.fn() } },
        { provide: PlanService, useValue: mockPlanService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useClass(MockAuthGuard)
      .compile();
    return module.get<AlertsController>(AlertsController);
  }

  it('returns empty analytics when user has no channels', async () => {
    const ctrl = await buildAnalyticsCtrl([], []);
    const result = await ctrl.analytics(req as never);
    expect(result.totals).toEqual({ success: 0, failed: 0, total: 0 });
    expect(result.dailyCounts).toHaveLength(0);
    expect(result.topMonitors).toHaveLength(0);
    expect(result.channelStats).toHaveLength(0);
  });

  it('returns 30-day daily count buckets', async () => {
    const logs = [makeLog({ status: 'success' }), makeLog({ status: 'failed' })];
    const ctrl = await buildAnalyticsCtrl(logs);
    const result = await ctrl.analytics(req as never);
    expect(result.dailyCounts).toHaveLength(30);
    const today = new Date().toISOString().slice(0, 10);
    const todayBucket = result.dailyCounts.find((d: { date: string }) => d.date === today);
    expect(todayBucket).toBeDefined();
    expect(todayBucket!.total).toBe(2);
    expect(todayBucket!.success).toBe(1);
    expect(todayBucket!.failed).toBe(1);
  });

  it('computes correct totals', async () => {
    const logs = [
      makeLog({ status: 'success' }),
      makeLog({ status: 'success' }),
      makeLog({ status: 'failed' }),
    ];
    const ctrl = await buildAnalyticsCtrl(logs);
    const result = await ctrl.analytics(req as never);
    expect(result.totals.total).toBe(3);
    expect(result.totals.success).toBe(2);
    expect(result.totals.failed).toBe(1);
  });

  it('aggregates top monitors sorted by count desc', async () => {
    const logs = [
      makeLog({ monitorId: 'mon-a', monitorName: 'Alpha', status: 'success' }),
      makeLog({ monitorId: 'mon-a', monitorName: 'Alpha', status: 'success' }),
      makeLog({ monitorId: 'mon-b', monitorName: 'Beta', status: 'failed' }),
    ];
    const ctrl = await buildAnalyticsCtrl(logs);
    const result = await ctrl.analytics(req as never);
    expect(result.topMonitors[0].monitorId).toBe('mon-a');
    expect(result.topMonitors[0].count).toBe(2);
    expect(result.topMonitors[1].monitorId).toBe('mon-b');
    expect(result.topMonitors[1].failed).toBe(1);
  });

  it('computes channel success rate correctly', async () => {
    const logs = [
      makeLog({ status: 'success', durationMs: 40 }),
      makeLog({ status: 'success', durationMs: 60 }),
      makeLog({ status: 'failed', durationMs: 0 }),
    ];
    const ctrl = await buildAnalyticsCtrl(logs);
    const result = await ctrl.analytics(req as never);
    const stat = result.channelStats[0];
    expect(stat.successRate).toBeCloseTo(66.7, 0);
    expect(stat.totalDeliveries).toBe(3);
    expect(stat.avgDurationMs).toBe(50); // avg of 40 and 60 (failed durationMs=0 still counted)
  });
});
