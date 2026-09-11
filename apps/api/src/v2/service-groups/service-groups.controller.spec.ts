import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2ServiceGroupsController } from './service-groups.controller';

const mockGroups = [
  { id: 'sg1', name: 'Frontend', description: 'Frontend services', monitorIds: ['m1', 'm2', 'm3'], createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-02') },
  { id: 'sg2', name: 'Backend', description: 'Backend services', monitorIds: ['m4'], createdAt: new Date('2024-01-02'), updatedAt: new Date('2024-01-03') },
  { id: 'sg3', name: 'Database', description: null, monitorIds: [], createdAt: new Date('2024-01-03'), updatedAt: new Date('2024-01-04') },
];

function makePrisma(groups = mockGroups, total = mockGroups.length) {
  return {
    monitorServiceGroup: {
      findMany: vi.fn().mockResolvedValue(groups),
      count: vi.fn().mockResolvedValue(total),
    },
  };
}

function makeReq(userId = 'user1') {
  return { user: { id: userId } } as never;
}

describe('V2ServiceGroupsController', () => {
  let controller: V2ServiceGroupsController;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new V2ServiceGroupsController(prisma as never);
  });

  describe('list()', () => {
    it('returns paginated envelope with data and meta', async () => {
      const result = await controller.list(makeReq(), {});
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toMatchObject({ total: 3, page: 1, limit: 20 });
    });

    it('maps monitorCount as monitorIds.length', async () => {
      const result = await controller.list(makeReq(), {});
      const items = result.data as Array<{ id: string; monitorCount: number }>;
      expect(items.find((i) => i.id === 'sg1')?.monitorCount).toBe(3);
      expect(items.find((i) => i.id === 'sg2')?.monitorCount).toBe(1);
      expect(items.find((i) => i.id === 'sg3')?.monitorCount).toBe(0);
    });

    it('includes all expected fields', async () => {
      const result = await controller.list(makeReq(), {});
      const item = (result.data as Array<Record<string, unknown>>)[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('monitorIds');
      expect(item).toHaveProperty('monitorCount');
      expect(item).toHaveProperty('createdAt');
      expect(item).toHaveProperty('updatedAt');
    });

    it('description is null when not set', async () => {
      const result = await controller.list(makeReq(), {});
      const item = (result.data as Array<{ id: string; description: null }>).find((i) => i.id === 'sg3');
      expect(item?.description).toBeNull();
    });

    it('passes search to OR query filter', async () => {
      await controller.list(makeReq(), { search: 'front' });
      const call = prisma.monitorServiceGroup.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where).toHaveProperty('OR');
      const or = call.where.OR as Array<Record<string, unknown>>;
      expect(or.some((c) => 'name' in c)).toBe(true);
      expect(or.some((c) => 'description' in c)).toBe(true);
    });

    it('default sortBy is createdAt desc', async () => {
      await controller.list(makeReq(), {});
      const call = prisma.monitorServiceGroup.findMany.mock.calls[0][0] as { orderBy: Record<string, unknown> };
      expect(call.orderBy).toMatchObject({ createdAt: 'desc' });
    });

    it('sortBy name asc passes to db orderBy', async () => {
      await controller.list(makeReq(), { sortBy: 'name', sortDir: 'asc' });
      const call = prisma.monitorServiceGroup.findMany.mock.calls[0][0] as { orderBy: Record<string, unknown> };
      expect(call.orderBy).toMatchObject({ name: 'asc' });
    });

    it('sortBy monitorCount asc — in-memory sorts ascending by monitorCount', async () => {
      prisma.monitorServiceGroup.findMany.mockResolvedValue(mockGroups);
      const result = await controller.list(makeReq(), { sortBy: 'monitorCount', sortDir: 'asc' });
      const counts = (result.data as Array<{ monitorCount: number }>).map((i) => i.monitorCount);
      expect(counts).toEqual([...counts].sort((a, b) => a - b));
    });

    it('sortBy monitorCount desc — in-memory sorts descending by monitorCount', async () => {
      prisma.monitorServiceGroup.findMany.mockResolvedValue(mockGroups);
      const result = await controller.list(makeReq(), { sortBy: 'monitorCount', sortDir: 'desc' });
      const counts = (result.data as Array<{ monitorCount: number }>).map((i) => i.monitorCount);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
    });

    it('pagination meta.pages is ceiling(total/limit)', async () => {
      prisma.monitorServiceGroup.count.mockResolvedValue(7);
      const result = await controller.list(makeReq(), { limit: 3 });
      expect(result.meta.pages).toBe(3);
    });

    it('passes userId to where filter', async () => {
      await controller.list(makeReq('userX'), {});
      const call = prisma.monitorServiceGroup.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where.userId).toBe('userX');
    });

    it('passes skip and take for non-monitorCount sort', async () => {
      await controller.list(makeReq(), { page: 2, limit: 5 });
      const call = prisma.monitorServiceGroup.findMany.mock.calls[0][0] as { skip: number; take: number };
      expect(call.skip).toBe(5);
      expect(call.take).toBe(5);
    });

    it('createdAt and updatedAt are ISO strings', async () => {
      const result = await controller.list(makeReq(), {});
      const item = (result.data as Array<{ createdAt: string; updatedAt: string }>)[0];
      expect(() => new Date(item.createdAt)).not.toThrow();
      expect(() => new Date(item.updatedAt)).not.toThrow();
    });
  });
});
