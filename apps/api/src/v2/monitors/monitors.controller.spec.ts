import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { V2MonitorsController } from './monitors.controller';
import { PrismaService } from '../../common/prisma.service';

function makeMonitor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'mon-1',
    name: 'Test Monitor',
    type: 'http',
    target: 'https://example.com',
    enabled: true,
    intervalSec: 60,
    timeoutMs: 5000,
    folderId: null,
    configJson: { method: 'GET' },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    monitorAlerts: [{ alertChannelId: 'ch-1' }],
    ...overrides,
  };
}

function makePrisma(
  monitors: ReturnType<typeof makeMonitor>[] = [makeMonitor()],
  total = 1,
  findFirstResult: ReturnType<typeof makeMonitor> | null = null,
  groupByRows: Array<{ type: string; _count: { type: number } }> = [],
) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitors),
      count: vi.fn().mockResolvedValue(total),
      findFirst: vi.fn().mockResolvedValue(findFirstResult ?? monitors[0] ?? null),
      groupBy: vi.fn().mockResolvedValue(groupByRows),
    },
  } as unknown as PrismaService;
}

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

describe('V2MonitorsController', () => {
  let controller: V2MonitorsController;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new V2MonitorsController(prisma);
  });

  describe('list()', () => {
    it('returns paginated envelope', async () => {
      const result = await controller.list(makeReq(), {});
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toMatchObject({ page: 1, limit: 20, total: 1, pages: 1 });
    });

    it('maps monitor fields to response shape', async () => {
      const result = await controller.list(makeReq(), {});
      expect(result.data[0]).toMatchObject({
        id: 'mon-1',
        name: 'Test Monitor',
        type: 'http',
        target: 'https://example.com',
        enabled: true,
        intervalSec: 60,
      });
    });

    it('serializes createdAt to ISO string', async () => {
      const result = await controller.list(makeReq(), {});
      expect((result.data[0] as Record<string, unknown>).createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('maps monitorAlerts to alertChannelIds', async () => {
      const result = await controller.list(makeReq(), {});
      const item = result.data[0] as Record<string, unknown>;
      expect(item.alertChannelIds).toEqual(['ch-1']);
    });

    it('redacts token from configJson', async () => {
      prisma = makePrisma([makeMonitor({ configJson: { token: 'secret-token', method: 'GET' } })]);
      controller = new V2MonitorsController(prisma);
      const result = await controller.list(makeReq(), {});
      const config = (result.data[0] as Record<string, unknown>).config as Record<string, unknown>;
      expect(config.token).toBeUndefined();
      expect(config.hasRepoToken).toBe(true);
    });

    it('redacts appToken from configJson', async () => {
      prisma = makePrisma([makeMonitor({ configJson: { appToken: 'app-secret', method: 'GET' } })]);
      controller = new V2MonitorsController(prisma);
      const result = await controller.list(makeReq(), {});
      const config = (result.data[0] as Record<string, unknown>).config as Record<string, unknown>;
      expect(config.appToken).toBeUndefined();
      expect(config.hasAppToken).toBe(true);
    });

    it('sets hasRepoToken=false when no token', async () => {
      const result = await controller.list(makeReq(), {});
      const config = (result.data[0] as Record<string, unknown>).config as Record<string, unknown>;
      expect(config.hasRepoToken).toBe(false);
    });

    it('applies type filter', async () => {
      await controller.list(makeReq(), { type: 'GIT_RELEASE' });
      expect(prisma.monitor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ type: 'GIT_RELEASE' }) }),
      );
    });

    it('applies enabled=true filter', async () => {
      await controller.list(makeReq(), { enabled: 'true' });
      expect(prisma.monitor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ enabled: true }) }),
      );
    });

    it('applies enabled=false filter', async () => {
      await controller.list(makeReq(), { enabled: 'false' });
      expect(prisma.monitor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ enabled: false }) }),
      );
    });

    it('applies search filter on name and target', async () => {
      await controller.list(makeReq(), { search: 'example' });
      expect(prisma.monitor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.objectContaining({ contains: 'example' }) }),
              expect.objectContaining({ target: expect.objectContaining({ contains: 'example' }) }),
            ]),
          }),
        }),
      );
    });

    it('caps limit at 100', async () => {
      await controller.list(makeReq(), { limit: 500 });
      expect(prisma.monitor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('calculates correct skip for page 2', async () => {
      await controller.list(makeReq(), { page: 2, limit: 10 });
      expect(prisma.monitor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('handles null configJson gracefully', async () => {
      prisma = makePrisma([makeMonitor({ configJson: null })]);
      controller = new V2MonitorsController(prisma);
      await expect(controller.list(makeReq(), {})).resolves.not.toThrow();
    });

    it('returns correct pages count for multi-page result', async () => {
      prisma = makePrisma([makeMonitor()], 45);
      controller = new V2MonitorsController(prisma);
      const result = await controller.list(makeReq(), { limit: 20 });
      expect(result.meta.pages).toBe(3);
    });
  });

  describe('getOne()', () => {
    it('returns monitor by id', async () => {
      const result = await controller.getOne(makeReq(), 'mon-1');
      expect(result).toMatchObject({
        id: 'mon-1',
        name: 'Test Monitor',
        type: 'http',
        target: 'https://example.com',
        enabled: true,
        intervalSec: 60,
        timeoutMs: 5000,
        folderId: null,
      });
    });

    it('throws NotFoundException when monitor not found', async () => {
      prisma = makePrisma([], 0, null);
      controller = new V2MonitorsController(prisma);
      await expect(controller.getOne(makeReq(), 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('passes userId filter to findFirst', async () => {
      await controller.getOne(makeReq('u-1'), 'mon-1');
      expect(prisma.monitor.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'mon-1', userId: 'u-1' }) }),
      );
    });

    it('serializes createdAt to ISO string', async () => {
      const result = await controller.getOne(makeReq(), 'mon-1') as Record<string, unknown>;
      expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('maps monitorAlerts to alertChannelIds', async () => {
      const result = await controller.getOne(makeReq(), 'mon-1') as Record<string, unknown>;
      expect(result.alertChannelIds).toEqual(['ch-1']);
    });

    it('redacts token from configJson', async () => {
      prisma = makePrisma([], 0, makeMonitor({ configJson: { token: 'secret', method: 'GET' } }));
      controller = new V2MonitorsController(prisma);
      const result = await controller.getOne(makeReq(), 'mon-1') as Record<string, unknown>;
      const config = result.config as Record<string, unknown>;
      expect(config.token).toBeUndefined();
      expect(config.hasRepoToken).toBe(true);
    });

    it('redacts appToken from configJson', async () => {
      prisma = makePrisma([], 0, makeMonitor({ configJson: { appToken: 'app-secret' } }));
      controller = new V2MonitorsController(prisma);
      const result = await controller.getOne(makeReq(), 'mon-1') as Record<string, unknown>;
      const config = result.config as Record<string, unknown>;
      expect(config.appToken).toBeUndefined();
      expect(config.hasAppToken).toBe(true);
    });

    it('handles null configJson gracefully', async () => {
      prisma = makePrisma([], 0, makeMonitor({ configJson: null }));
      controller = new V2MonitorsController(prisma);
      await expect(controller.getOne(makeReq(), 'mon-1')).resolves.not.toThrow();
    });
  });

  describe('summary()', () => {
    it('returns total, enabled, disabled, byType', async () => {
      // count() is called twice: total and enabled
      prisma.monitor.count = vi
        .fn()
        .mockResolvedValueOnce(10)   // total
        .mockResolvedValueOnce(7);   // enabled
      (prisma.monitor.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
        { type: 'HTTP', _count: { type: 6 } },
        { type: 'DNS', _count: { type: 4 } },
      ]);

      const result = await controller.summary(makeReq());
      expect(result).toEqual({
        total: 10,
        enabled: 7,
        disabled: 3,
        byType: { HTTP: 6, DNS: 4 },
      });
    });

    it('returns zeros for user with no monitors', async () => {
      prisma.monitor.count = vi.fn().mockResolvedValue(0);
      (prisma.monitor.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const result = await controller.summary(makeReq());
      expect(result).toEqual({ total: 0, enabled: 0, disabled: 0, byType: {} });
    });

    it('passes userId to all queries', async () => {
      prisma.monitor.count = vi.fn().mockResolvedValue(0);
      (prisma.monitor.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await controller.summary(makeReq('u-99'));
      expect(prisma.monitor.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'u-99' }) }),
      );
    });

    it('correctly computes disabled as total - enabled', async () => {
      prisma.monitor.count = vi
        .fn()
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(5);
      (prisma.monitor.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const result = await controller.summary(makeReq());
      expect(result.disabled).toBe(15);
    });

    it('handles single monitor type', async () => {
      prisma.monitor.count = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      (prisma.monitor.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
        { type: 'TCP', _count: { type: 1 } },
      ]);
      const result = await controller.summary(makeReq());
      expect(result.byType).toEqual({ TCP: 1 });
    });
  });
});
