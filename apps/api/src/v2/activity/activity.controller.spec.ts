import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2ActivityController } from './activity.controller';
import { PrismaService } from '../../common/prisma.service';

function makeEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'audit-1',
    action: 'auth.login',
    actorUserId: 'user-1',
    targetUserId: null,
    metaJson: { ip: '127.0.0.1' },
    createdAt: new Date('2026-04-04T12:00:00Z'),
    ...overrides,
  };
}

function makePrisma(
  entries: ReturnType<typeof makeEntry>[] = [makeEntry()],
  total = 1,
) {
  return {
    auditLog: {
      findMany: vi.fn().mockResolvedValue(entries),
      count: vi.fn().mockResolvedValue(total),
    },
  } as unknown as PrismaService;
}

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

describe('V2ActivityController', () => {
  let controller: V2ActivityController;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new V2ActivityController(prisma);
  });

  describe('list()', () => {
    it('returns paginated envelope with data and meta', async () => {
      const result = await controller.list(makeReq(), {});
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toMatchObject({ page: 1, limit: 50, total: 1, pages: 1 });
    });

    it('maps audit log fields to response shape', async () => {
      const result = await controller.list(makeReq(), {});
      const item = result.data[0] as Record<string, unknown>;
      expect(item).toHaveProperty('id', 'audit-1');
      expect(item).toHaveProperty('action', 'auth.login');
      expect(item).toHaveProperty('meta');
      expect(item).toHaveProperty('createdAt');
    });

    it('meta object is parsed from metaJson (not raw JSON)', async () => {
      const result = await controller.list(makeReq(), {});
      const item = result.data[0] as Record<string, unknown>;
      expect(typeof item.meta).toBe('object');
      expect((item.meta as Record<string, unknown>).ip).toBe('127.0.0.1');
    });

    it('meta defaults to empty object when metaJson is null', async () => {
      prisma = makePrisma([makeEntry({ metaJson: null })]);
      controller = new V2ActivityController(prisma);
      const result = await controller.list(makeReq(), {});
      const item = result.data[0] as Record<string, unknown>;
      expect(item.meta).toEqual({});
    });

    it('createdAt is an ISO 8601 string', async () => {
      const result = await controller.list(makeReq(), {});
      const item = result.data[0] as Record<string, unknown>;
      expect(typeof item.createdAt).toBe('string');
      expect(() => new Date(item.createdAt as string)).not.toThrow();
    });

    it('passes actorUserId filter to prisma where clause', async () => {
      await controller.list(makeReq('user-42'), {});
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ actorUserId: 'user-42' }),
        }),
      );
    });

    it('applies action prefix filter when provided', async () => {
      await controller.list(makeReq(), { action: 'auth' });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: { startsWith: 'auth', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('does not add action filter when action not provided', async () => {
      await controller.list(makeReq(), {});
      const call = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.where.action).toBeUndefined();
    });

    it('applies since date filter when provided', async () => {
      await controller.list(makeReq(), { since: '2026-04-01T00:00:00Z' });
      const call = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.where.createdAt).toMatchObject({ gte: new Date('2026-04-01T00:00:00Z') });
    });

    it('applies until date filter when provided', async () => {
      await controller.list(makeReq(), { until: '2026-04-05T00:00:00Z' });
      const call = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.where.createdAt).toMatchObject({ lte: new Date('2026-04-05T00:00:00Z') });
    });

    it('applies both since and until when both provided', async () => {
      await controller.list(makeReq(), {
        since: '2026-04-01T00:00:00Z',
        until: '2026-04-05T00:00:00Z',
      });
      const call = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.where.createdAt).toMatchObject({
        gte: new Date('2026-04-01T00:00:00Z'),
        lte: new Date('2026-04-05T00:00:00Z'),
      });
    });

    it('does not add createdAt filter when neither since nor until provided', async () => {
      await controller.list(makeReq(), {});
      const call = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.where.createdAt).toBeUndefined();
    });

    it('defaults to desc sort direction', async () => {
      await controller.list(makeReq(), {});
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('applies asc sort direction when specified', async () => {
      await controller.list(makeReq(), { sortDir: 'asc' });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'asc' },
        }),
      );
    });

    it('applies pagination with skip and take', async () => {
      await controller.list(makeReq(), { page: 2, limit: 10 });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('returns correct meta.pages calculation', async () => {
      prisma = makePrisma([makeEntry()], 25);
      controller = new V2ActivityController(prisma);
      const result = await controller.list(makeReq(), { limit: 10 });
      expect(result.meta.pages).toBe(3);
    });

    it('returns empty data array when no entries', async () => {
      prisma = makePrisma([], 0);
      controller = new V2ActivityController(prisma);
      const result = await controller.list(makeReq(), {});
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('returns multiple entries in data array', async () => {
      prisma = makePrisma(
        [
          makeEntry({ id: 'a1', action: 'auth.login' }),
          makeEntry({ id: 'a2', action: 'monitor.create' }),
        ],
        2,
      );
      controller = new V2ActivityController(prisma);
      const result = await controller.list(makeReq(), {});
      expect(result.data).toHaveLength(2);
    });

    it('does not expose actorUserId or targetUserId in response items', async () => {
      const result = await controller.list(makeReq(), {});
      const item = result.data[0] as Record<string, unknown>;
      expect(item).not.toHaveProperty('actorUserId');
      expect(item).not.toHaveProperty('targetUserId');
    });

    it('uses default limit of 50', async () => {
      await controller.list(makeReq(), {});
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });
  });
});
