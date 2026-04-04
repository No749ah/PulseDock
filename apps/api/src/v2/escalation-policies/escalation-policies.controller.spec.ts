import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2EscalationPoliciesController } from './escalation-policies.controller';

const step1 = { delayMinutes: 5, channelId: 'c1' };
const step2 = { delayMinutes: 10, channelId: 'c2' };
const step3 = { delayMinutes: 15, channelId: 'c3' };

const mockPolicies = [
  { id: 'ep1', name: 'Critical', steps: [step1, step2, step3], createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-02') },
  { id: 'ep2', name: 'Moderate', steps: [step1], createdAt: new Date('2024-01-02'), updatedAt: new Date('2024-01-03') },
  { id: 'ep3', name: 'Low', steps: [], createdAt: new Date('2024-01-03'), updatedAt: new Date('2024-01-04') },
];

function makePrisma(policies = mockPolicies, total = mockPolicies.length) {
  return {
    escalationPolicy: {
      findMany: vi.fn().mockResolvedValue(policies),
      count: vi.fn().mockResolvedValue(total),
    },
  };
}

function makeReq(userId = 'user1') {
  return { user: { id: userId } } as never;
}

describe('V2EscalationPoliciesController', () => {
  let controller: V2EscalationPoliciesController;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new V2EscalationPoliciesController(prisma as never);
  });

  describe('list()', () => {
    it('returns paginated envelope with data and meta', async () => {
      const result = await controller.list(makeReq(), {});
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toMatchObject({ total: 3, page: 1, limit: 20 });
    });

    it('maps stepCount as steps.length', async () => {
      const result = await controller.list(makeReq(), {});
      const items = result.data as Array<{ id: string; stepCount: number }>;
      expect(items.find((i) => i.id === 'ep1')?.stepCount).toBe(3);
      expect(items.find((i) => i.id === 'ep2')?.stepCount).toBe(1);
      expect(items.find((i) => i.id === 'ep3')?.stepCount).toBe(0);
    });

    it('includes all expected fields', async () => {
      const result = await controller.list(makeReq(), {});
      const item = (result.data as Array<Record<string, unknown>>)[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('steps');
      expect(item).toHaveProperty('stepCount');
      expect(item).toHaveProperty('createdAt');
      expect(item).toHaveProperty('updatedAt');
    });

    it('passes search to name filter', async () => {
      await controller.list(makeReq(), { search: 'crit' });
      const call = prisma.escalationPolicy.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where).toHaveProperty('name');
      expect(call.where.name).toMatchObject({ contains: 'crit', mode: 'insensitive' });
    });

    it('default sortBy is createdAt desc', async () => {
      await controller.list(makeReq(), {});
      const call = prisma.escalationPolicy.findMany.mock.calls[0][0] as { orderBy: Record<string, unknown> };
      expect(call.orderBy).toMatchObject({ createdAt: 'desc' });
    });

    it('sortBy name asc passes to db orderBy', async () => {
      await controller.list(makeReq(), { sortBy: 'name', sortDir: 'asc' });
      const call = prisma.escalationPolicy.findMany.mock.calls[0][0] as { orderBy: Record<string, unknown> };
      expect(call.orderBy).toMatchObject({ name: 'asc' });
    });

    it('sortBy stepCount asc — in-memory sorts ascending', async () => {
      prisma.escalationPolicy.findMany.mockResolvedValue(mockPolicies);
      const result = await controller.list(makeReq(), { sortBy: 'stepCount', sortDir: 'asc' });
      const counts = (result.data as Array<{ stepCount: number }>).map((i) => i.stepCount);
      expect(counts).toEqual([...counts].sort((a, b) => a - b));
    });

    it('sortBy stepCount desc — in-memory sorts descending', async () => {
      prisma.escalationPolicy.findMany.mockResolvedValue(mockPolicies);
      const result = await controller.list(makeReq(), { sortBy: 'stepCount', sortDir: 'desc' });
      const counts = (result.data as Array<{ stepCount: number }>).map((i) => i.stepCount);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
    });

    it('stepCount is 0 when steps is empty array', async () => {
      const result = await controller.list(makeReq(), {});
      const item = (result.data as Array<{ id: string; stepCount: number }>).find((i) => i.id === 'ep3');
      expect(item?.stepCount).toBe(0);
    });

    it('pagination meta.pages is ceiling(total/limit)', async () => {
      prisma.escalationPolicy.count.mockResolvedValue(10);
      const result = await controller.list(makeReq(), { limit: 3 });
      expect(result.meta.pages).toBe(4);
    });

    it('passes userId to where filter', async () => {
      await controller.list(makeReq('userZ'), {});
      const call = prisma.escalationPolicy.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where.userId).toBe('userZ');
    });

    it('passes skip and take for non-stepCount sort', async () => {
      await controller.list(makeReq(), { page: 3, limit: 10 });
      const call = prisma.escalationPolicy.findMany.mock.calls[0][0] as { skip: number; take: number };
      expect(call.skip).toBe(20);
      expect(call.take).toBe(10);
    });

    it('createdAt and updatedAt are ISO strings', async () => {
      const result = await controller.list(makeReq(), {});
      const item = (result.data as Array<{ createdAt: string; updatedAt: string }>)[0];
      expect(() => new Date(item.createdAt)).not.toThrow();
      expect(() => new Date(item.updatedAt)).not.toThrow();
    });
  });
});
