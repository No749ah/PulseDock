import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2IncidentsController } from './incidents.controller';
import { PrismaService } from '../../common/prisma.service';

function makeIncident(overrides: Partial<{
  id: string;
  title: string;
  status: string;
  severity: string;
  autoCreated: boolean;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  updates: { status: string; createdAt: Date }[];
  monitors: { monitorId: string }[];
  _count: { updates: number };
}> = {}) {
  return {
    id: 'inc-1',
    title: 'API Latency Spike',
    status: 'INVESTIGATING',
    severity: 'HIGH',
    autoCreated: false,
    resolvedAt: null,
    createdAt: new Date('2026-01-01T10:00:00Z'),
    updatedAt: new Date('2026-01-01T11:00:00Z'),
    updates: [{ status: 'INVESTIGATING', createdAt: new Date('2026-01-01T10:30:00Z') }],
    monitors: [{ monitorId: 'm-1' }, { monitorId: 'm-2' }],
    _count: { updates: 3 },
    ...overrides,
  };
}

function makePrisma(overrides: Partial<{
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    incident: {
      findMany: overrides.findMany ?? vi.fn().mockResolvedValue([makeIncident()]),
      count: overrides.count ?? vi.fn().mockResolvedValue(1),
    },
  } as unknown as PrismaService;
}

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

describe('V2IncidentsController', () => {
  let controller: V2IncidentsController;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new V2IncidentsController(prisma);
  });

  describe('list()', () => {
    it('returns paginated envelope with data and meta', async () => {
      const result = await controller.list(makeReq(), {});
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toMatchObject({ page: 1, limit: 20, total: 1, pages: 1 });
    });

    it('returns correct incident shape', async () => {
      const result = await controller.list(makeReq(), {});
      expect(result.data[0]).toMatchObject({
        id: 'inc-1',
        title: 'API Latency Spike',
        status: 'INVESTIGATING',
        severity: 'HIGH',
        autoCreated: false,
        resolvedAt: null,
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T11:00:00.000Z',
        updateCount: 3,
        latestUpdateStatus: 'INVESTIGATING',
        monitorCount: 2,
      });
    });

    it('derives updateCount from _count.updates', async () => {
      prisma = makePrisma({
        findMany: vi.fn().mockResolvedValue([makeIncident({ _count: { updates: 7 } })]),
        count: vi.fn().mockResolvedValue(1),
      });
      controller = new V2IncidentsController(prisma);
      const result = await controller.list(makeReq(), {});
      expect((result.data[0] as Record<string, unknown>).updateCount).toBe(7);
    });

    it('derives monitorCount from monitors array length', async () => {
      prisma = makePrisma({
        findMany: vi.fn().mockResolvedValue([makeIncident({
          monitors: [{ monitorId: 'm-1' }, { monitorId: 'm-2' }, { monitorId: 'm-3' }],
        })]),
        count: vi.fn().mockResolvedValue(1),
      });
      controller = new V2IncidentsController(prisma);
      const result = await controller.list(makeReq(), {});
      expect((result.data[0] as Record<string, unknown>).monitorCount).toBe(3);
    });

    it('returns monitorCount=0 when no monitors linked', async () => {
      prisma = makePrisma({
        findMany: vi.fn().mockResolvedValue([makeIncident({ monitors: [] })]),
        count: vi.fn().mockResolvedValue(1),
      });
      controller = new V2IncidentsController(prisma);
      const result = await controller.list(makeReq(), {});
      expect((result.data[0] as Record<string, unknown>).monitorCount).toBe(0);
    });

    it('returns latestUpdateStatus=null when no updates exist', async () => {
      prisma = makePrisma({
        findMany: vi.fn().mockResolvedValue([makeIncident({ updates: [] })]),
        count: vi.fn().mockResolvedValue(1),
      });
      controller = new V2IncidentsController(prisma);
      const result = await controller.list(makeReq(), {});
      expect((result.data[0] as Record<string, unknown>).latestUpdateStatus).toBeNull();
    });

    it('returns latestUpdateAt=null when no updates exist', async () => {
      prisma = makePrisma({
        findMany: vi.fn().mockResolvedValue([makeIncident({ updates: [] })]),
        count: vi.fn().mockResolvedValue(1),
      });
      controller = new V2IncidentsController(prisma);
      const result = await controller.list(makeReq(), {});
      expect((result.data[0] as Record<string, unknown>).latestUpdateAt).toBeNull();
    });

    it('populates latestUpdateAt from most recent update', async () => {
      const updateDate = new Date('2026-01-01T10:30:00Z');
      prisma = makePrisma({
        findMany: vi.fn().mockResolvedValue([makeIncident({
          updates: [{ status: 'MONITORING', createdAt: updateDate }],
        })]),
        count: vi.fn().mockResolvedValue(1),
      });
      controller = new V2IncidentsController(prisma);
      const result = await controller.list(makeReq(), {});
      expect((result.data[0] as Record<string, unknown>).latestUpdateAt).toBe(updateDate.toISOString());
    });

    it('serializes resolvedAt when incident is resolved', async () => {
      const resolvedDate = new Date('2026-01-02T08:00:00Z');
      prisma = makePrisma({
        findMany: vi.fn().mockResolvedValue([makeIncident({
          status: 'RESOLVED',
          resolvedAt: resolvedDate,
        })]),
        count: vi.fn().mockResolvedValue(1),
      });
      controller = new V2IncidentsController(prisma);
      const result = await controller.list(makeReq(), {});
      expect((result.data[0] as Record<string, unknown>).resolvedAt).toBe(resolvedDate.toISOString());
    });

    it('applies status filter to where clause', async () => {
      await controller.list(makeReq(), { status: 'RESOLVED' });
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'RESOLVED' }) }),
      );
    });

    it('applies severity filter to where clause', async () => {
      await controller.list(makeReq(), { severity: 'CRITICAL' });
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ severity: 'CRITICAL' }) }),
      );
    });

    it('applies search filter on title with case-insensitive contains', async () => {
      await controller.list(makeReq(), { search: 'outage' });
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            title: { contains: 'outage', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('does not apply search filter when search is omitted', async () => {
      await controller.list(makeReq(), {});
      const call = (prisma.incident.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      const where = call.where as Record<string, unknown>;
      expect(where.title).toBeUndefined();
    });

    it('uses default sortBy=createdAt and sortDir=desc', async () => {
      await controller.list(makeReq(), {});
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('respects custom sortBy=severity and sortDir=asc', async () => {
      await controller.list(makeReq(), { sortBy: 'severity', sortDir: 'asc' });
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { severity: 'asc' } }),
      );
    });

    it('uses default page=1 and limit=20', async () => {
      await controller.list(makeReq(), {});
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('calculates correct skip for page 3 with limit 15', async () => {
      prisma = makePrisma({ count: vi.fn().mockResolvedValue(100) });
      controller = new V2IncidentsController(prisma);
      await controller.list(makeReq(), { page: 3, limit: 15 });
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 30, take: 15 }),
      );
    });

    it('caps limit at 200', async () => {
      await controller.list(makeReq(), { limit: 999 });
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });

    it('clamps page to minimum 1', async () => {
      await controller.list(makeReq(), { page: 0 });
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0 }),
      );
    });

    it('calculates correct pages count for multi-page result', async () => {
      prisma = makePrisma({ count: vi.fn().mockResolvedValue(47) });
      controller = new V2IncidentsController(prisma);
      const result = await controller.list(makeReq(), { limit: 20 });
      expect(result.meta.pages).toBe(3);
    });

    it('returns pages=0 when total is 0', async () => {
      prisma = makePrisma({
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      });
      controller = new V2IncidentsController(prisma);
      const result = await controller.list(makeReq(), {});
      expect(result.meta).toMatchObject({ total: 0, pages: 0 });
      expect(result.data).toHaveLength(0);
    });

    it('scopes findMany query to authenticated user id', async () => {
      await controller.list(makeReq('user-abc'), {});
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-abc' }) }),
      );
    });

    it('scopes count query to authenticated user id', async () => {
      await controller.list(makeReq('user-xyz'), {});
      expect(prisma.incident.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-xyz' }) }),
      );
    });

    it('runs findMany and count in parallel (single call each)', async () => {
      await controller.list(makeReq(), {});
      expect(prisma.incident.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.incident.count).toHaveBeenCalledTimes(1);
    });

    it('includes updates and monitors select in findMany', async () => {
      await controller.list(makeReq(), {});
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            updates: expect.objectContaining({ take: 1 }),
            monitors: expect.objectContaining({ select: { monitorId: true } }),
          }),
        }),
      );
    });
  });
});
