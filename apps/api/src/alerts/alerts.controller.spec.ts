import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanActivate, ExecutionContext, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '../common/auth.guard';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';

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
  });
});
