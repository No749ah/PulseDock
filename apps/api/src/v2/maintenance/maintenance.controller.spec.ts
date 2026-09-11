/**
 * Unit tests for V2MaintenanceController
 *
 * Tests pagination meta computation and filter logic using a mock PrismaService.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2MaintenanceController } from './maintenance.controller';

// Minimal window factory
function makeWindow(overrides: Partial<{
  id: string;
  name: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  recurrence: string;
  recurrenceDays: string | null;
  durationMinutes: number | null;
  recurrenceEndsAt: Date | null;
  createdAt: Date;
  monitors: { monitorId: string }[];
}> = {}) {
  const now = new Date();
  return {
    id: 'win-1',
    name: 'Nightly deploy',
    description: null,
    startsAt: new Date(now.getTime() - 60_000), // 1 min ago
    endsAt: new Date(now.getTime() + 60_000),   // 1 min from now
    recurrence: 'NONE',
    recurrenceDays: null,
    durationMinutes: null,
    recurrenceEndsAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    monitors: [],
    ...overrides,
  };
}

function makePrisma(windows: ReturnType<typeof makeWindow>[], count?: number) {
  return {
    maintenanceWindow: {
      findMany: vi.fn().mockResolvedValue(windows),
      count: vi.fn().mockResolvedValue(count ?? windows.length),
    },
  };
}

function makeReq(userId = 'user-1') {
  return { user: { id: userId } } as any;
}

describe('V2MaintenanceController', () => {
  describe('list', () => {
    it('returns paginated envelope with correct meta for empty list', async () => {
      const prisma = makePrisma([]);
      const ctrl = new V2MaintenanceController(prisma as any);
      const result = await ctrl.list(makeReq(), {});
      expect(result).toMatchObject({ data: [], meta: { total: 0, page: 1, limit: 20, pages: 0 } });
    });

    it('returns data array with expected fields', async () => {
      const win = makeWindow({ monitors: [{ monitorId: 'm-1' }, { monitorId: 'm-2' }] });
      const prisma = makePrisma([win]);
      const ctrl = new V2MaintenanceController(prisma as any);
      const result = await ctrl.list(makeReq(), {});
      expect(result.data).toHaveLength(1);
      const d = result.data[0] as any;
      expect(d).toHaveProperty('id', 'win-1');
      expect(d).toHaveProperty('name', 'Nightly deploy');
      expect(d).toHaveProperty('recurrence', 'NONE');
      expect(d).toHaveProperty('monitorIds', ['m-1', 'm-2']);
      expect(d).toHaveProperty('monitorCount', 2);
      expect(d).toHaveProperty('isActive');
      expect(typeof d.startsAt).toBe('string');
      expect(typeof d.endsAt).toBe('string');
      expect(typeof d.createdAt).toBe('string');
    });

    it('isActive = true for currently active NONE window', async () => {
      const now = new Date();
      const win = makeWindow({
        startsAt: new Date(now.getTime() - 1000),
        endsAt: new Date(now.getTime() + 1000),
        recurrence: 'NONE',
      });
      const prisma = makePrisma([win]);
      const ctrl = new V2MaintenanceController(prisma as any);
      const result = await ctrl.list(makeReq(), {});
      expect((result.data[0] as any).isActive).toBe(true);
    });

    it('isActive = false for past NONE window', async () => {
      const now = new Date();
      const win = makeWindow({
        startsAt: new Date(now.getTime() - 120_000),
        endsAt: new Date(now.getTime() - 60_000),
        recurrence: 'NONE',
      });
      const prisma = makePrisma([win]);
      const ctrl = new V2MaintenanceController(prisma as any);
      const result = await ctrl.list(makeReq(), {});
      expect((result.data[0] as any).isActive).toBe(false);
    });

    it('activeOnly=true filters out inactive windows', async () => {
      const now = new Date();
      const active = makeWindow({ id: 'w-active', startsAt: new Date(now.getTime() - 1000), endsAt: new Date(now.getTime() + 1000), recurrence: 'NONE' });
      const inactive = makeWindow({ id: 'w-past', startsAt: new Date(now.getTime() - 120_000), endsAt: new Date(now.getTime() - 60_000), recurrence: 'NONE' });
      const prisma = makePrisma([active, inactive]);
      const ctrl = new V2MaintenanceController(prisma as any);
      const result = await ctrl.list(makeReq(), { activeOnly: 'true' as any });
      expect(result.data).toHaveLength(1);
      expect((result.data[0] as any).id).toBe('w-active');
    });

    it('activeOnly=false returns all windows', async () => {
      const now = new Date();
      const active = makeWindow({ id: 'w1', startsAt: new Date(now.getTime() - 1000), endsAt: new Date(now.getTime() + 1000), recurrence: 'NONE' });
      const inactive = makeWindow({ id: 'w2', startsAt: new Date(now.getTime() - 120_000), endsAt: new Date(now.getTime() - 60_000), recurrence: 'NONE' });
      const prisma = makePrisma([active, inactive]);
      const ctrl = new V2MaintenanceController(prisma as any);
      const result = await ctrl.list(makeReq(), { activeOnly: 'false' as any });
      expect(result.data).toHaveLength(2);
    });

    it('sortBy=monitorCount sorts ascending', async () => {
      const w1 = makeWindow({ id: 'w1', monitors: [{ monitorId: 'a' }] });
      const w2 = makeWindow({ id: 'w2', monitors: [] });
      const w3 = makeWindow({ id: 'w3', monitors: [{ monitorId: 'b' }, { monitorId: 'c' }] });
      const prisma = makePrisma([w1, w2, w3]);
      const ctrl = new V2MaintenanceController(prisma as any);
      const result = await ctrl.list(makeReq(), { sortBy: 'monitorCount', sortDir: 'asc' });
      const counts = (result.data as any[]).map((d) => d.monitorCount);
      expect(counts).toEqual([0, 1, 2]);
    });

    it('sortBy=monitorCount sorts descending', async () => {
      const w1 = makeWindow({ id: 'w1', monitors: [{ monitorId: 'a' }] });
      const w2 = makeWindow({ id: 'w2', monitors: [] });
      const prisma = makePrisma([w1, w2]);
      const ctrl = new V2MaintenanceController(prisma as any);
      const result = await ctrl.list(makeReq(), { sortBy: 'monitorCount', sortDir: 'desc' });
      const counts = (result.data as any[]).map((d) => d.monitorCount);
      expect(counts).toEqual([1, 0]);
    });

    it('recurrenceEndsAt=null is preserved as null in response', async () => {
      const win = makeWindow({ recurrenceEndsAt: null });
      const prisma = makePrisma([win]);
      const ctrl = new V2MaintenanceController(prisma as any);
      const result = await ctrl.list(makeReq(), {});
      expect((result.data[0] as any).recurrenceEndsAt).toBeNull();
    });

    it('recurrenceEndsAt is ISO string when set', async () => {
      const endsAt = new Date('2026-12-31T23:59:59Z');
      const win = makeWindow({ recurrenceEndsAt: endsAt });
      const prisma = makePrisma([win]);
      const ctrl = new V2MaintenanceController(prisma as any);
      const result = await ctrl.list(makeReq(), {});
      expect((result.data[0] as any).recurrenceEndsAt).toBe(endsAt.toISOString());
    });

    it('uses correct userId in prisma where clause', async () => {
      const prisma = makePrisma([]);
      const ctrl = new V2MaintenanceController(prisma as any);
      await ctrl.list(makeReq('user-99'), {});
      expect(prisma.maintenanceWindow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-99' }) }),
      );
    });

    it('meta.pages = ceil(total / limit)', async () => {
      const windows = Array.from({ length: 5 }, (_, i) => makeWindow({ id: `w${i}` }));
      const prisma = makePrisma(windows, 5);
      const ctrl = new V2MaintenanceController(prisma as any);
      const result = await ctrl.list(makeReq(), { limit: 2, page: 1 });
      expect(result.meta.total).toBe(5);
      expect(result.meta.limit).toBe(2);
      expect(result.meta.pages).toBe(3);
    });
  });
});
