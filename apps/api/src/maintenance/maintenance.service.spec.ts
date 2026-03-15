import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-03-15T02:00:00Z');

function makeWindow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mw-1',
    userId: 'user-1',
    name: 'DB Upgrade',
    description: null,
    startsAt: new Date('2026-03-16T02:00:00Z'), // future → not active
    endsAt: new Date('2026-03-16T04:00:00Z'),
    monitors: [{ monitorId: 'mon-1' }],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeActiveWindow(overrides: Record<string, unknown> = {}) {
  return makeWindow({
    startsAt: new Date('2026-03-15T01:00:00Z'), // before NOW
    endsAt: new Date('2026-03-15T03:00:00Z'),   // after NOW
    ...overrides,
  });
}

function makePrisma(windowOverride?: ReturnType<typeof makeWindow> | null) {
  const win = windowOverride !== undefined ? windowOverride : makeWindow();
  const tx = {
    maintenanceWindowMonitor: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    maintenanceWindow: {
      update: vi.fn().mockResolvedValue(win ?? makeWindow()),
    },
  };
  return {
    maintenanceWindow: {
      findUnique: vi.fn().mockResolvedValue(win),
      findMany: vi.fn().mockResolvedValue(win ? [win] : []),
      create: vi.fn().mockResolvedValue(win ?? makeWindow()),
      delete: vi.fn().mockResolvedValue(win ?? makeWindow()),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn().mockImplementation(
      async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx),
    ),
    _tx: tx, // expose for assertions
  };
}

function makeService(prismaOverride?: ReturnType<typeof makePrisma>) {
  return new MaintenanceService((prismaOverride ?? makePrisma()) as never);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prisma = makePrisma();
    service = makeService(prisma);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── list() ──────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns windows for the given userId', async () => {
      const result = await service.list('user-1');
      expect(prisma.maintenanceWindow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(result).toHaveLength(1);
    });

    it('maps monitors to monitorIds and computes monitorCount', async () => {
      const result = await service.list('user-1');
      expect(result[0].monitorIds).toEqual(['mon-1']);
      expect(result[0].monitorCount).toBe(1);
      expect(result[0].monitors).toBeUndefined();
    });

    it('computes isActive=false for future window', async () => {
      const result = await service.list('user-1');
      expect(result[0].isActive).toBe(false);
    });

    it('computes isActive=true for currently active window', async () => {
      const p = makePrisma(makeActiveWindow());
      const svc = makeService(p);
      const result = await svc.list('user-1');
      expect(result[0].isActive).toBe(true);
    });

    it('returns empty array when user has no windows', async () => {
      const p = makePrisma(null);
      const svc = makeService(p);
      const result = await svc.list('user-1');
      expect(result).toEqual([]);
    });
  });

  // ─── listActive() ────────────────────────────────────────────────────────

  describe('listActive()', () => {
    it('queries with time-bounded filter', async () => {
      await service.listActive('user-1');
      expect(prisma.maintenanceWindow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            startsAt: { lte: NOW },
            endsAt: { gte: NOW },
          }),
        }),
      );
    });

    it('returns active windows with isActive=true always', async () => {
      const p = makePrisma(makeActiveWindow());
      const svc = makeService(p);
      const result = await svc.listActive('user-1');
      expect(result[0].isActive).toBe(true);
      expect(result[0].monitors).toBeUndefined();
    });

    it('returns empty array when no active windows', async () => {
      const p = makePrisma(null);
      const svc = makeService(p);
      const result = await svc.listActive('user-1');
      expect(result).toEqual([]);
    });
  });

  // ─── getOne() ────────────────────────────────────────────────────────────

  describe('getOne()', () => {
    it('returns a window with computed fields', async () => {
      const result = await service.getOne('mw-1', 'user-1');
      expect(prisma.maintenanceWindow.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'mw-1' } }),
      );
      expect(result.monitorIds).toEqual(['mon-1']);
      expect(result.monitorCount).toBe(1);
      expect(result.monitors).toBeUndefined();
    });

    it('throws NotFoundException when window not found', async () => {
      prisma.maintenanceWindow.findUnique.mockResolvedValue(null);
      await expect(service.getOne('missing', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when window belongs to different user', async () => {
      prisma.maintenanceWindow.findUnique.mockResolvedValue(makeWindow({ userId: 'other-user' }));
      await expect(service.getOne('mw-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('computes isActive=true for an active window', async () => {
      prisma.maintenanceWindow.findUnique.mockResolvedValue(makeActiveWindow());
      const result = await service.getOne('mw-1', 'user-1');
      expect(result.isActive).toBe(true);
    });
  });

  // ─── create() ────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates a window with monitorIds', async () => {
      const dto = {
        name: 'DB Upgrade',
        startsAt: '2026-03-16T02:00:00Z',
        endsAt: '2026-03-16T04:00:00Z',
        monitorIds: ['mon-1'],
      };
      const result = await service.create('user-1', dto as never);
      expect(prisma.maintenanceWindow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            name: 'DB Upgrade',
            startsAt: new Date('2026-03-16T02:00:00Z'),
            endsAt: new Date('2026-03-16T04:00:00Z'),
            monitors: { create: [{ monitorId: 'mon-1' }] },
          }),
        }),
      );
      expect(result.monitorIds).toEqual(['mon-1']);
      expect(result.monitors).toBeUndefined();
    });

    it('creates a window without monitorIds (empty array)', async () => {
      const dto = {
        name: 'No monitors',
        startsAt: '2026-03-16T02:00:00Z',
        endsAt: '2026-03-16T04:00:00Z',
        monitorIds: [],
      };
      const p = makePrisma(makeWindow({ monitors: [] }));
      const svc = makeService(p);
      await svc.create('user-1', dto as never);
      expect(p.maintenanceWindow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ monitors: undefined }),
        }),
      );
    });

    it('creates a window when monitorIds is omitted', async () => {
      const dto = {
        name: 'No monitors',
        startsAt: '2026-03-16T02:00:00Z',
        endsAt: '2026-03-16T04:00:00Z',
      };
      const p = makePrisma(makeWindow({ monitors: [] }));
      const svc = makeService(p);
      const result = await svc.create('user-1', dto as never);
      expect(result).toBeDefined();
    });

    it('computes isActive on created window', async () => {
      const activeDto = {
        name: 'Active window',
        startsAt: '2026-03-15T01:00:00Z',
        endsAt: '2026-03-15T03:00:00Z',
        monitorIds: [],
      };
      const p = makePrisma(makeActiveWindow({ monitors: [] }));
      const svc = makeService(p);
      const result = await svc.create('user-1', activeDto as never);
      expect(result.isActive).toBe(true);
    });
  });

  // ─── update() ────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('throws NotFoundException when window not found', async () => {
      prisma.maintenanceWindow.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', 'user-1', {})).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when window belongs to different user', async () => {
      prisma.maintenanceWindow.findUnique.mockResolvedValue(makeWindow({ userId: 'other-user' }));
      await expect(service.update('mw-1', 'user-1', {})).rejects.toThrow(ForbiddenException);
    });

    it('updates window fields via transaction', async () => {
      const dto = { name: 'Updated Name' };
      // findUnique called twice: once for findOwned, once for getOne at end
      prisma.maintenanceWindow.findUnique.mockResolvedValue(makeWindow());

      await service.update('mw-1', 'user-1', dto);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma._tx.maintenanceWindow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mw-1' },
          data: expect.objectContaining({ name: 'Updated Name' }),
        }),
      );
    });

    it('replaces monitor associations when monitorIds provided', async () => {
      const dto = { monitorIds: ['mon-2', 'mon-3'] };
      prisma.maintenanceWindow.findUnique.mockResolvedValue(makeWindow());

      await service.update('mw-1', 'user-1', dto);
      expect(prisma._tx.maintenanceWindowMonitor.deleteMany).toHaveBeenCalledWith({
        where: { windowId: 'mw-1' },
      });
      expect(prisma._tx.maintenanceWindowMonitor.createMany).toHaveBeenCalledWith({
        data: [{ windowId: 'mw-1', monitorId: 'mon-2' }, { windowId: 'mw-1', monitorId: 'mon-3' }],
      });
    });

    it('clears all monitors when monitorIds is empty array', async () => {
      const dto = { monitorIds: [] };
      prisma.maintenanceWindow.findUnique.mockResolvedValue(makeWindow());

      await service.update('mw-1', 'user-1', dto);
      expect(prisma._tx.maintenanceWindowMonitor.deleteMany).toHaveBeenCalled();
      expect(prisma._tx.maintenanceWindowMonitor.createMany).not.toHaveBeenCalled();
    });

    it('skips monitor update when monitorIds is undefined', async () => {
      const dto = { name: 'No monitor change' };
      prisma.maintenanceWindow.findUnique.mockResolvedValue(makeWindow());

      await service.update('mw-1', 'user-1', dto);
      expect(prisma._tx.maintenanceWindowMonitor.deleteMany).not.toHaveBeenCalled();
    });

    it('converts startsAt and endsAt strings to Date objects', async () => {
      const dto = { startsAt: '2026-04-01T00:00:00Z', endsAt: '2026-04-01T02:00:00Z' };
      prisma.maintenanceWindow.findUnique.mockResolvedValue(makeWindow());

      await service.update('mw-1', 'user-1', dto);
      expect(prisma._tx.maintenanceWindow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startsAt: new Date('2026-04-01T00:00:00Z'),
            endsAt: new Date('2026-04-01T02:00:00Z'),
          }),
        }),
      );
    });
  });

  // ─── remove() ────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('deletes the window and returns { ok: true }', async () => {
      const result = await service.remove('mw-1', 'user-1');
      expect(prisma.maintenanceWindow.delete).toHaveBeenCalledWith({ where: { id: 'mw-1' } });
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when window not found', async () => {
      prisma.maintenanceWindow.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when not owner', async () => {
      prisma.maintenanceWindow.findUnique.mockResolvedValue(makeWindow({ userId: 'other-user' }));
      await expect(service.remove('mw-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── isMonitorInMaintenance() ─────────────────────────────────────────────

  describe('isMonitorInMaintenance()', () => {
    it('returns false when monitor is not in any active window', async () => {
      prisma.maintenanceWindow.count.mockResolvedValue(0);
      const result = await service.isMonitorInMaintenance('mon-1', 'user-1');
      expect(result).toBe(false);
    });

    it('returns true when monitor is in an active window', async () => {
      prisma.maintenanceWindow.count.mockResolvedValue(1);
      const result = await service.isMonitorInMaintenance('mon-1', 'user-1');
      expect(result).toBe(true);
    });

    it('queries with correct userId, monitorId, and time bounds', async () => {
      prisma.maintenanceWindow.count.mockResolvedValue(0);
      await service.isMonitorInMaintenance('mon-42', 'user-7');
      expect(prisma.maintenanceWindow.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-7',
          startsAt: { lte: NOW },
          endsAt: { gte: NOW },
          monitors: { some: { monitorId: 'mon-42' } },
        },
      });
    });
  });
});
