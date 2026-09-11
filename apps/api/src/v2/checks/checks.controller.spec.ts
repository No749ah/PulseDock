import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2ChecksController } from './checks.controller';
import { PrismaService } from '../../common/prisma.service';

function makeRun(overrides: Partial<{
  id: string; monitorId: string; checkedAt: Date; ok: boolean;
  status: number | null; latencyMs: number | null; message: string | null; level: string;
}> = {}) {
  return {
    id: 'run-1',
    monitorId: 'monitor-1',
    checkedAt: new Date('2026-01-01T00:00:00Z'),
    ok: true,
    status: 200,
    latencyMs: 42,
    message: null,
    level: 'green',
    ...overrides,
  };
}

function makePrisma(runs: ReturnType<typeof makeRun>[] = [makeRun()], total = 1) {
  return {
    monitorRun: {
      findMany: vi.fn().mockResolvedValue(runs),
      count: vi.fn().mockResolvedValue(total),
    },
  } as unknown as PrismaService;
}

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

describe('V2ChecksController', () => {
  let controller: V2ChecksController;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new V2ChecksController(prisma);
  });

  describe('list()', () => {
    it('returns paginated envelope with data and meta', async () => {
      const result = await controller.list(makeReq(), {});
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toMatchObject({ page: 1, limit: 50, total: 1, pages: 1 });
    });

    it('maps run fields to response shape', async () => {
      const result = await controller.list(makeReq(), {});
      expect(result.data[0]).toMatchObject({
        id: 'run-1',
        monitorId: 'monitor-1',
        ok: true,
        statusCode: 200,
        latencyMs: 42,
        level: 'green',
      });
    });

    it('serializes checkedAt to ISO string', async () => {
      const result = await controller.list(makeReq(), {});
      expect((result.data[0] as Record<string, unknown>).checkedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('applies monitorId filter', async () => {
      await controller.list(makeReq(), { monitorId: 'mon-abc' });
      expect(prisma.monitorRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ monitorId: 'mon-abc' }),
        }),
      );
    });

    it('applies level filter', async () => {
      await controller.list(makeReq(), { level: 'red' });
      expect(prisma.monitorRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ level: 'red' }),
        }),
      );
    });

    it('applies since date filter', async () => {
      await controller.list(makeReq(), { since: '2026-01-01T00:00:00Z' });
      expect(prisma.monitorRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            checkedAt: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('applies until date filter', async () => {
      await controller.list(makeReq(), { until: '2026-12-31T23:59:59Z' });
      expect(prisma.monitorRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            checkedAt: expect.objectContaining({ lt: expect.any(Date) }),
          }),
        }),
      );
    });

    it('applies both since and until as date range', async () => {
      await controller.list(makeReq(), { since: '2026-01-01T00:00:00Z', until: '2026-02-01T00:00:00Z' });
      expect(prisma.monitorRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            checkedAt: { gte: expect.any(Date), lt: expect.any(Date) },
          }),
        }),
      );
    });

    it('uses default limit=50', async () => {
      await controller.list(makeReq(), {});
      expect(prisma.monitorRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, skip: 0 }),
      );
    });

    it('caps limit at 200', async () => {
      await controller.list(makeReq(), { limit: 9999 });
      expect(prisma.monitorRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });

    it('calculates skip correctly for page 3 with limit 10', async () => {
      await controller.list(makeReq(), { page: 3, limit: 10 });
      expect(prisma.monitorRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('clamps page to minimum 1', async () => {
      await controller.list(makeReq(), { page: 0 });
      expect(prisma.monitorRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0 }),
      );
    });

    it('calculates pages ceiling correctly', async () => {
      prisma = makePrisma([makeRun()], 101);
      controller = new V2ChecksController(prisma);
      const result = await controller.list(makeReq(), { limit: 50 });
      expect(result.meta.pages).toBe(3);
    });

    it('filters by userId from request', async () => {
      await controller.list(makeReq('user-99'), {});
      expect(prisma.monitorRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-99' }) }),
      );
    });
  });
});
