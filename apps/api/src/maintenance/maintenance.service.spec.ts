import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MaintenanceService, isWindowActive } from './maintenance.service';

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
    recurrence: 'NONE',
    recurrenceDays: null,
    durationMinutes: 120,
    recurrenceEndsAt: null,
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
      async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    ),
    _tx: tx,
  };
}

function makeService(prismaOverride?: ReturnType<typeof makePrisma>) {
  return new MaintenanceService((prismaOverride ?? makePrisma()) as never);
}

// ─── isWindowActive() unit tests ─────────────────────────────────────────────

describe('isWindowActive()', () => {
  const base = {
    recurrence: 'NONE',
    recurrenceDays: null,
    durationMinutes: 120,
    recurrenceEndsAt: null,
  };

  it('NONE: returns true when now is within startsAt..endsAt', () => {
    const w = { ...base, startsAt: new Date('2026-03-15T01:00Z'), endsAt: new Date('2026-03-15T03:00Z') };
    expect(isWindowActive(w, NOW)).toBe(true);
  });

  it('NONE: returns false when now is before startsAt', () => {
    const w = { ...base, startsAt: new Date('2026-03-16T01:00Z'), endsAt: new Date('2026-03-16T03:00Z') };
    expect(isWindowActive(w, NOW)).toBe(false);
  });

  it('NONE: returns false when now is after endsAt', () => {
    const w = { ...base, startsAt: new Date('2026-03-14T01:00Z'), endsAt: new Date('2026-03-14T03:00Z') };
    expect(isWindowActive(w, NOW)).toBe(false);
  });

  it('DAILY: returns true when now is within daily time window', () => {
    // daily window starting 2026-03-14T01:30Z, duration 120 min → 01:30–03:30 UTC daily
    // NOW = 2026-03-15T02:00Z → within window
    const w = {
      ...base,
      recurrence: 'DAILY',
      startsAt: new Date('2026-03-14T01:30Z'),
      endsAt: new Date('2026-03-14T03:30Z'),
      durationMinutes: 120,
    };
    expect(isWindowActive(w, NOW)).toBe(true);
  });

  it('DAILY: returns false when now is outside daily time window', () => {
    // window is 03:00–05:00 UTC daily
    const w = {
      ...base,
      recurrence: 'DAILY',
      startsAt: new Date('2026-03-14T03:00Z'),
      endsAt: new Date('2026-03-14T05:00Z'),
      durationMinutes: 120,
    };
    // NOW = 02:00Z → before today's occurrence start (03:00Z)
    expect(isWindowActive(w, NOW)).toBe(false);
  });

  it('DAILY: returns false before the first occurrence date', () => {
    const w = {
      ...base,
      recurrence: 'DAILY',
      startsAt: new Date('2026-03-20T01:00Z'), // future
      endsAt: new Date('2026-03-20T03:00Z'),
      durationMinutes: 120,
    };
    expect(isWindowActive(w, NOW)).toBe(false);
  });

  it('DAILY: respects recurrenceEndsAt', () => {
    const w = {
      ...base,
      recurrence: 'DAILY',
      startsAt: new Date('2026-03-01T01:00Z'),
      endsAt: new Date('2026-03-01T03:00Z'),
      durationMinutes: 120,
      recurrenceEndsAt: new Date('2026-03-14T23:59Z'), // ended yesterday
    };
    // NOW = 2026-03-15 → past recurrenceEndsAt
    expect(isWindowActive(w, NOW)).toBe(false);
  });

  it('WEEKLY: returns true when now falls on an allowed day within the time window', () => {
    // NOW = 2026-03-15T02:00Z → Sunday (day 0)
    const dow = NOW.getUTCDay(); // should be 0
    expect(dow).toBe(0); // verify assumption
    const w = {
      ...base,
      recurrence: 'WEEKLY',
      recurrenceDays: '0,6', // Sun + Sat
      startsAt: new Date('2026-03-08T01:00Z'), // a past Sunday
      endsAt: new Date('2026-03-08T03:00Z'),
      durationMinutes: 120,
    };
    expect(isWindowActive(w, NOW)).toBe(true);
  });

  it('WEEKLY: returns false when today is not in recurrenceDays', () => {
    // NOW is Sunday (0) but allowed days are Mon–Fri (1–5)
    const w = {
      ...base,
      recurrence: 'WEEKLY',
      recurrenceDays: '1,2,3,4,5',
      startsAt: new Date('2026-03-09T01:00Z'), // past Monday
      endsAt: new Date('2026-03-09T03:00Z'),
      durationMinutes: 120,
    };
    expect(isWindowActive(w, NOW)).toBe(false);
  });

  it('WEEKLY: returns false when time is outside window on an allowed day', () => {
    // NOW = 02:00Z, window is 04:00–06:00 on Sundays
    const w = {
      ...base,
      recurrence: 'WEEKLY',
      recurrenceDays: '0',
      startsAt: new Date('2026-03-08T04:00Z'),
      endsAt: new Date('2026-03-08T06:00Z'),
      durationMinutes: 120,
    };
    expect(isWindowActive(w, NOW)).toBe(false);
  });

  it('WEEKLY: returns false when recurrenceDays is empty string', () => {
    const w = {
      ...base,
      recurrence: 'WEEKLY',
      recurrenceDays: '',
      startsAt: new Date('2026-03-14T01:00Z'),
      endsAt: new Date('2026-03-14T03:00Z'),
      durationMinutes: 120,
    };
    expect(isWindowActive(w, NOW)).toBe(false);
  });

  it('MONTHLY: returns true when today is the same day-of-month as startsAt and time matches', () => {
    // NOW = 2026-03-15T02:00Z, startsAt on 15th at 01:00, duration 120min → 01:00–03:00
    const w = {
      ...base,
      recurrence: 'MONTHLY',
      startsAt: new Date('2026-02-15T01:00Z'), // a past 15th
      endsAt: new Date('2026-02-15T03:00Z'),
      durationMinutes: 120,
    };
    expect(isWindowActive(w, NOW)).toBe(true);
  });

  it('MONTHLY: returns false when today is not the right day-of-month', () => {
    // NOW = March 15th, but window is on the 14th of each month
    const w = {
      ...base,
      recurrence: 'MONTHLY',
      startsAt: new Date('2026-02-14T01:00Z'),
      endsAt: new Date('2026-02-14T03:00Z'),
      durationMinutes: 120,
    };
    expect(isWindowActive(w, NOW)).toBe(false);
  });

  it('uses durationMinutes derived from endsAt-startsAt when null', () => {
    // If durationMinutes is null, derive from endsAt-startsAt (120 min)
    const w = {
      ...base,
      recurrence: 'DAILY',
      durationMinutes: null,
      startsAt: new Date('2026-03-14T01:00Z'),
      endsAt: new Date('2026-03-14T03:00Z'), // 2h duration
    };
    // NOW = 02:00Z → within 01:00–03:00
    expect(isWindowActive(w, NOW)).toBe(true);
  });
});

// ─── MaintenanceService tests ─────────────────────────────────────────────────

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
    it('returns active windows with isActive=true', async () => {
      const p = makePrisma(makeActiveWindow());
      const svc = makeService(p);
      const result = await svc.listActive('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].isActive).toBe(true);
      expect(result[0].monitors).toBeUndefined();
    });

    it('filters out non-active windows', async () => {
      // Future window — not active
      const p = makePrisma(makeWindow());
      const svc = makeService(p);
      const result = await svc.listActive('user-1');
      expect(result).toHaveLength(0);
    });

    it('returns empty array when no windows', async () => {
      const p = makePrisma(null);
      const svc = makeService(p);
      const result = await svc.listActive('user-1');
      expect(result).toEqual([]);
    });

    it('includes recurring daily window when currently in its time slot', async () => {
      // DAILY 01:00–03:00, NOW = 02:00 → active
      const recurringActive = makeWindow({
        startsAt: new Date('2026-03-01T01:00Z'),
        endsAt: new Date('2026-03-01T03:00Z'),
        recurrence: 'DAILY',
        durationMinutes: 120,
        recurrenceEndsAt: null,
      });
      const p = makePrisma(recurringActive);
      const svc = makeService(p);
      const result = await svc.listActive('user-1');
      expect(result).toHaveLength(1);
    });
  });

  // ─── getOne() ────────────────────────────────────────────────────────────

  describe('getOne()', () => {
    it('returns a window with computed fields', async () => {
      const result = await service.getOne('mw-1', 'user-1');
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
      expect(prisma.maintenanceWindow.create).toHaveBeenCalled();
      expect(result.monitorIds).toEqual(['mon-1']);
      expect(result.monitors).toBeUndefined();
    });

    it('creates a window without monitorIds', async () => {
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

    it('creates a recurring weekly window with recurrenceDays', async () => {
      const dto = {
        name: 'Weekly maintenance',
        startsAt: '2026-03-15T01:00:00Z',
        endsAt: '2026-03-15T03:00:00Z',
        recurrence: 'WEEKLY',
        recurrenceDays: '0,6',
      };
      const win = makeWindow({ recurrence: 'WEEKLY', recurrenceDays: '0,6', monitors: [] });
      const p = makePrisma(win);
      const svc = makeService(p);
      await svc.create('user-1', dto as never);
      expect(p.maintenanceWindow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recurrence: 'WEEKLY',
            recurrenceDays: '0,6',
          }),
        }),
      );
    });

    it('derives durationMinutes from endsAt-startsAt when not provided', async () => {
      const dto = {
        name: 'Auto duration',
        startsAt: '2026-03-16T02:00:00Z',
        endsAt: '2026-03-16T04:30:00Z', // 150 min
      };
      const p = makePrisma(makeWindow({ monitors: [] }));
      const svc = makeService(p);
      await svc.create('user-1', dto as never);
      expect(p.maintenanceWindow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ durationMinutes: 150 }),
        }),
      );
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

    it('updates window name via transaction', async () => {
      prisma.maintenanceWindow.findUnique.mockResolvedValue(makeWindow());
      await service.update('mw-1', 'user-1', { name: 'Updated Name' });
      expect(prisma._tx.maintenanceWindow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Updated Name' }),
        }),
      );
    });

    it('replaces monitor associations when monitorIds provided', async () => {
      prisma.maintenanceWindow.findUnique.mockResolvedValue(makeWindow());
      await service.update('mw-1', 'user-1', { monitorIds: ['mon-2', 'mon-3'] });
      expect(prisma._tx.maintenanceWindowMonitor.deleteMany).toHaveBeenCalledWith(
        { where: { windowId: 'mw-1' } },
      );
      expect(prisma._tx.maintenanceWindowMonitor.createMany).toHaveBeenCalled();
    });

    it('clears all monitors when monitorIds is empty array', async () => {
      prisma.maintenanceWindow.findUnique.mockResolvedValue(makeWindow());
      await service.update('mw-1', 'user-1', { monitorIds: [] });
      expect(prisma._tx.maintenanceWindowMonitor.deleteMany).toHaveBeenCalled();
      expect(prisma._tx.maintenanceWindowMonitor.createMany).not.toHaveBeenCalled();
    });

    it('skips monitor update when monitorIds is undefined', async () => {
      prisma.maintenanceWindow.findUnique.mockResolvedValue(makeWindow());
      await service.update('mw-1', 'user-1', { name: 'No monitor change' });
      expect(prisma._tx.maintenanceWindowMonitor.deleteMany).not.toHaveBeenCalled();
    });

    it('converts date strings to Date objects', async () => {
      prisma.maintenanceWindow.findUnique.mockResolvedValue(makeWindow());
      await service.update('mw-1', 'user-1', {
        startsAt: '2026-04-01T00:00:00Z',
        endsAt: '2026-04-01T02:00:00Z',
      });
      expect(prisma._tx.maintenanceWindow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startsAt: new Date('2026-04-01T00:00:00Z'),
            endsAt: new Date('2026-04-01T02:00:00Z'),
          }),
        }),
      );
    });

    it('updates recurrence fields', async () => {
      prisma.maintenanceWindow.findUnique.mockResolvedValue(makeWindow());
      await service.update('mw-1', 'user-1', { recurrence: 'WEEKLY', recurrenceDays: '1,3,5' });
      expect(prisma._tx.maintenanceWindow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recurrence: 'WEEKLY', recurrenceDays: '1,3,5' }),
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
    it('returns false when no windows are active', async () => {
      // default makeWindow has future startsAt → not active
      const result = await service.isMonitorInMaintenance('mon-1', 'user-1');
      expect(result).toBe(false);
    });

    it('returns true when monitor is in an active window', async () => {
      prisma.maintenanceWindow.findMany.mockResolvedValue([makeActiveWindow()]);
      const result = await service.isMonitorInMaintenance('mon-1', 'user-1');
      expect(result).toBe(true);
    });

    it('returns true when active window has no monitor filter (all monitors)', async () => {
      prisma.maintenanceWindow.findMany.mockResolvedValue([makeActiveWindow({ monitors: [] })]);
      const result = await service.isMonitorInMaintenance('mon-999', 'user-1');
      expect(result).toBe(true);
    });

    it('returns false when monitor id is not in active window monitors list', async () => {
      prisma.maintenanceWindow.findMany.mockResolvedValue([makeActiveWindow()]);
      // active window only has mon-1
      const result = await service.isMonitorInMaintenance('mon-99', 'user-1');
      expect(result).toBe(false);
    });

    it('returns true for active recurring daily window', async () => {
      const dailyWindow = makeWindow({
        startsAt: new Date('2026-03-01T01:00Z'),
        endsAt: new Date('2026-03-01T03:00Z'),
        recurrence: 'DAILY',
        durationMinutes: 120,
        monitors: [{ monitorId: 'mon-1' }],
      });
      prisma.maintenanceWindow.findMany.mockResolvedValue([dailyWindow]);
      // NOW = 02:00Z → within 01:00–03:00 daily window
      const result = await service.isMonitorInMaintenance('mon-1', 'user-1');
      expect(result).toBe(true);
    });
  });
});
