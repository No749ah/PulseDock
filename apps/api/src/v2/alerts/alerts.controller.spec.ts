import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2AlertsController } from './alerts.controller';
import { PrismaService } from '../../common/prisma.service';

function makePrisma(overrides: Partial<{
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
}> = {}) {
  const defaultChannel = {
    id: 'ch-1',
    name: 'Test Webhook',
    type: 'webhook',
    configJson: { webhookUrl: 'https://hooks.example.com/token123' },
    createdAt: new Date('2026-01-01'),
    monitorAlerts: [{ monitorId: 'm-1' }, { monitorId: 'm-2' }],
  };
  return {
    alertChannel: {
      findMany: overrides.findMany ?? vi.fn().mockResolvedValue([defaultChannel]),
      count: overrides.count ?? vi.fn().mockResolvedValue(1),
    },
  } as unknown as PrismaService;
}

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

describe('V2AlertsController', () => {
  let controller: V2AlertsController;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new V2AlertsController(prisma);
  });

  describe('list()', () => {
    it('returns paginated envelope with data and meta', async () => {
      const result = await controller.list(makeReq(), {});
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toMatchObject({ page: 1, limit: 20, total: 1, pages: 1 });
    });

    it('includes usedByCount from monitorAlerts length', async () => {
      const result = await controller.list(makeReq(), {});
      expect(result.data[0]).toMatchObject({ usedByCount: 2 });
    });

    it('redacts webhookUrl keeping only domain', async () => {
      const result = await controller.list(makeReq(), {});
      const ch = result.data[0] as Record<string, unknown>;
      const config = ch.config as Record<string, string>;
      expect(config.webhookUrl).toBe('https://hooks.example.com/[redacted]');
    });

    it('redacts botToken to [redacted]', async () => {
      prisma = makePrisma({
        findMany: vi.fn().mockResolvedValue([{
          id: 'ch-2',
          name: 'Telegram',
          type: 'telegram',
          configJson: { botToken: 'secret-bot-token' },
          createdAt: new Date('2026-01-01'),
          monitorAlerts: [],
        }]),
        count: vi.fn().mockResolvedValue(1),
      });
      controller = new V2AlertsController(prisma);
      const result = await controller.list(makeReq(), {});
      const config = (result.data[0] as Record<string, unknown>).config as Record<string, string>;
      expect(config.botToken).toBe('[redacted]');
    });

    it('applies type filter to where clause', async () => {
      await controller.list(makeReq(), { type: 'slack' });
      expect(prisma.alertChannel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ type: 'slack' }) }),
      );
    });

    it('applies search filter on name', async () => {
      await controller.list(makeReq(), { search: 'prod' });
      expect(prisma.alertChannel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'prod', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('uses default page=1 and limit=20', async () => {
      await controller.list(makeReq(), {});
      expect(prisma.alertChannel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('calculates correct skip for page 2', async () => {
      prisma = makePrisma({ count: vi.fn().mockResolvedValue(50) });
      controller = new V2AlertsController(prisma);
      await controller.list(makeReq(), { page: 2, limit: 10 });
      expect(prisma.alertChannel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('caps limit at 100', async () => {
      await controller.list(makeReq(), { limit: 999 });
      expect(prisma.alertChannel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('clamps page to minimum 1', async () => {
      await controller.list(makeReq(), { page: -5 });
      expect(prisma.alertChannel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0 }),
      );
    });

    it('handles malformed webhookUrl gracefully', async () => {
      prisma = makePrisma({
        findMany: vi.fn().mockResolvedValue([{
          id: 'ch-3',
          name: 'Bad URL',
          type: 'webhook',
          configJson: { webhookUrl: 'not-a-url' },
          createdAt: new Date(),
          monitorAlerts: [],
        }]),
        count: vi.fn().mockResolvedValue(1),
      });
      controller = new V2AlertsController(prisma);
      const result = await controller.list(makeReq(), {});
      const config = (result.data[0] as Record<string, unknown>).config as Record<string, string>;
      expect(config.webhookUrl).toBe('[redacted]');
    });

    it('handles null configJson gracefully', async () => {
      prisma = makePrisma({
        findMany: vi.fn().mockResolvedValue([{
          id: 'ch-4',
          name: 'No Config',
          type: 'email',
          configJson: null,
          createdAt: new Date(),
          monitorAlerts: [],
        }]),
        count: vi.fn().mockResolvedValue(1),
      });
      controller = new V2AlertsController(prisma);
      await expect(controller.list(makeReq(), {})).resolves.not.toThrow();
    });

    it('returns correct pages count with multi-page result', async () => {
      prisma = makePrisma({ count: vi.fn().mockResolvedValue(55) });
      controller = new V2AlertsController(prisma);
      const result = await controller.list(makeReq(), { limit: 20 });
      expect(result.meta.pages).toBe(3);
    });
  });
});
