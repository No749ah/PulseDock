import { describe, it, expect, vi } from 'vitest';
import { resolveMaintenanceWidget } from './maintenance.resolver';
import type { Widget } from '../status-pages.types';

function makeWidget(type: string, config: Record<string, unknown> = {}): Widget {
  return { id: `w-${type}`, type: type as Widget['type'], x: 0, y: 0, w: 4, h: 2, config };
}

const noopCache = {} as never;
const userId = 'user-1';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    maintenanceWindow: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    ...overrides,
  } as unknown as any;
}

const futureStart = new Date(Date.now() + 2 * 60 * 60 * 1000);  // 2h from now
const futureEnd   = new Date(Date.now() + 4 * 60 * 60 * 1000);  // 4h from now
const pastStart   = new Date(Date.now() - 4 * 60 * 60 * 1000);
const pastEnd     = new Date(Date.now() - 2 * 60 * 60 * 1000);
const activeStart = new Date(Date.now() - 1 * 60 * 60 * 1000);  // started 1h ago
const activeEnd   = new Date(Date.now() + 1 * 60 * 60 * 1000);  // ends in 1h

// ── scheduled-maintenance ─────────────────────────────────────────────────────

describe('maintenance resolver — scheduled-maintenance', () => {
  it('returns empty windows when none exist', async () => {
    const prisma = makePrisma({ maintenanceWindow: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveMaintenanceWidget(prisma, noopCache, userId, makeWidget('scheduled-maintenance'), undefined);
    expect(result.windows).toHaveLength(0);
    expect(result.fetchedAt).toBeDefined();
  });

  it('returns future maintenance windows with mapped monitors', async () => {
    const window = {
      id: 'mw1', name: 'DB Upgrade', description: 'Upgrading PostgreSQL',
      startsAt: futureStart, endsAt: futureEnd,
      monitors: [{ monitor: { id: 'm1', name: 'DB Monitor' } }],
    };
    const prisma = makePrisma({ maintenanceWindow: { findMany: vi.fn().mockResolvedValue([window]) } });
    const result = await resolveMaintenanceWidget(prisma, noopCache, userId, makeWidget('scheduled-maintenance'), undefined);
    expect(result.windows).toHaveLength(1);
    const w = (result.windows as any[])[0];
    expect(w.name).toBe('DB Upgrade');
    expect(w.description).toBe('Upgrading PostgreSQL');
    expect(w.startsAt).toBe(futureStart.toISOString());
    expect(w.endsAt).toBe(futureEnd.toISOString());
    expect(w.monitors).toHaveLength(1);
    expect(w.monitors[0].name).toBe('DB Monitor');
  });

  it('returns multiple windows sorted by startsAt', async () => {
    const windows = [
      { id: 'mw2', name: 'Second', description: null, startsAt: futureEnd, endsAt: new Date(futureEnd.getTime() + 3600_000), monitors: [] },
      { id: 'mw1', name: 'First', description: null, startsAt: futureStart, endsAt: futureEnd, monitors: [] },
    ];
    const prisma = makePrisma({ maintenanceWindow: { findMany: vi.fn().mockResolvedValue(windows) } });
    const result = await resolveMaintenanceWidget(prisma, noopCache, userId, makeWidget('scheduled-maintenance'), undefined);
    expect(result.windows).toHaveLength(2);
  });

  it('queries only future windows (endsAt >= now)', async () => {
    const prisma = makePrisma({ maintenanceWindow: { findMany: vi.fn().mockResolvedValue([]) } });
    await resolveMaintenanceWidget(prisma, noopCache, userId, makeWidget('scheduled-maintenance'), undefined);
    const findArgs = (prisma.maintenanceWindow.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.where.endsAt).toBeDefined();
    expect(findArgs.where.userId).toBe(userId);
  });
});

// ── maintenance-calendar ──────────────────────────────────────────────────────

describe('maintenance resolver — maintenance-calendar', () => {
  it('returns empty calendar when no windows', async () => {
    const prisma = makePrisma({ maintenanceWindow: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveMaintenanceWidget(prisma, noopCache, userId, makeWidget('maintenance-calendar'), undefined);
    expect(result.windows).toHaveLength(0);
    expect(result.fetchedAt).toBeDefined();
  });

  it('marks currently active maintenance window correctly', async () => {
    const window = {
      id: 'mw1', name: 'Active Maint', description: 'Ongoing',
      startsAt: activeStart, endsAt: activeEnd,
      monitors: [],
    };
    const prisma = makePrisma({ maintenanceWindow: { findMany: vi.fn().mockResolvedValue([window]) } });
    const result = await resolveMaintenanceWidget(prisma, noopCache, userId, makeWidget('maintenance-calendar'), undefined);
    const w = (result.windows as any[])[0];
    expect(w.isActive).toBe(true);
  });

  it('marks future maintenance window as not active', async () => {
    const window = {
      id: 'mw1', name: 'Future', description: null,
      startsAt: futureStart, endsAt: futureEnd,
      monitors: [],
    };
    const prisma = makePrisma({ maintenanceWindow: { findMany: vi.fn().mockResolvedValue([window]) } });
    const result = await resolveMaintenanceWidget(prisma, noopCache, userId, makeWidget('maintenance-calendar'), undefined);
    const w = (result.windows as any[])[0];
    expect(w.isActive).toBe(false);
  });

  it('maps affectedMonitors from nested monitor relations', async () => {
    const window = {
      id: 'mw1', name: 'With Monitors', description: null,
      startsAt: futureStart, endsAt: futureEnd,
      monitors: [
        { monitor: { id: 'm1', name: 'Service A' } },
        { monitor: { id: 'm2', name: 'Service B' } },
      ],
    };
    const prisma = makePrisma({ maintenanceWindow: { findMany: vi.fn().mockResolvedValue([window]) } });
    const result = await resolveMaintenanceWidget(prisma, noopCache, userId, makeWidget('maintenance-calendar'), undefined);
    const w = (result.windows as any[])[0];
    expect(w.affectedMonitors).toHaveLength(2);
    expect(w.affectedMonitors[0].name).toBe('Service A');
  });
});

// ── next-maintenance-countdown ────────────────────────────────────────────────

describe('maintenance resolver — next-maintenance-countdown', () => {
  it('returns none=true when no upcoming maintenance', async () => {
    const prisma = makePrisma({ maintenanceWindow: { findFirst: vi.fn().mockResolvedValue(null) } });
    const result = await resolveMaintenanceWidget(prisma, noopCache, userId, makeWidget('next-maintenance-countdown'), undefined);
    expect(result.none).toBe(true);
  });

  it('returns countdown details for next maintenance window', async () => {
    const window = {
      name: 'Next Upgrade', description: 'Scheduled upgrade',
      startsAt: futureStart, endsAt: futureEnd,
      monitors: [{ monitor: { name: 'API' } }],
    };
    const prisma = makePrisma({ maintenanceWindow: { findFirst: vi.fn().mockResolvedValue(window) } });
    const result = await resolveMaintenanceWidget(prisma, noopCache, userId, makeWidget('next-maintenance-countdown'), undefined);
    expect(result.name).toBe('Next Upgrade');
    expect(result.secondsUntil).toBeGreaterThan(0);
    expect(result.secondsUntil).toBeLessThan(3 * 3600); // should be < 3 hours
    expect(result.affectedMonitors).toHaveLength(1);
    expect((result.affectedMonitors as any[])[0].name).toBe('API');
    expect(result.fetchedAt).toBeDefined();
  });

  it('filters by monitorIds when provided', async () => {
    const prisma = makePrisma({ maintenanceWindow: { findFirst: vi.fn().mockResolvedValue(null) } });
    await resolveMaintenanceWidget(
      prisma, noopCache, userId,
      makeWidget('next-maintenance-countdown', { monitorIds: ['m1', 'm2'] }), undefined,
    );
    const findArgs = (prisma.maintenanceWindow.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.where.monitors).toBeDefined();
  });

  it('returns secondsUntil=0 for windows that just started', async () => {
    const veryRecent = new Date(Date.now() + 100); // starts in 100ms — nearly now
    const window = {
      name: 'Imminent', description: null,
      startsAt: veryRecent, endsAt: futureEnd,
      monitors: [],
    };
    const prisma = makePrisma({ maintenanceWindow: { findFirst: vi.fn().mockResolvedValue(window) } });
    const result = await resolveMaintenanceWidget(prisma, noopCache, userId, makeWidget('next-maintenance-countdown'), undefined);
    expect(result.secondsUntil).toBeGreaterThanOrEqual(0);
  });
});

// ── maintenance-impact-list ───────────────────────────────────────────────────

describe('maintenance resolver — maintenance-impact-list', () => {
  it('returns empty windows when no impact in next 7 days', async () => {
    const prisma = makePrisma({ maintenanceWindow: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveMaintenanceWidget(prisma, noopCache, userId, makeWidget('maintenance-impact-list'), undefined);
    expect(result.windows).toHaveLength(0);
    expect(result.fetchedAt).toBeDefined();
  });

  it('returns affected monitors with their current status', async () => {
    const window = {
      name: 'DB Migration', startsAt: futureStart, endsAt: futureEnd, description: 'Schema change',
      monitors: [
        { monitor: { id: 'm1', name: 'DB', runs: [{ level: 'green' }] } },
        { monitor: { id: 'm2', name: 'API', runs: [{ level: 'red' }] } },
        { monitor: { id: 'm3', name: 'Cache', runs: [] } }, // no runs - defaults to 'green'
      ],
    };
    const prisma = makePrisma({ maintenanceWindow: { findMany: vi.fn().mockResolvedValue([window]) } });
    const result = await resolveMaintenanceWidget(prisma, noopCache, userId, makeWidget('maintenance-impact-list'), undefined);
    const w = (result.windows as any[])[0];
    expect(w.affectedMonitors).toHaveLength(3);
    expect(w.affectedMonitors[0].status).toBe('green');
    expect(w.affectedMonitors[1].status).toBe('red');
    expect(w.affectedMonitors[2].status).toBe('green'); // default
  });

  it('filters by monitorIds when provided', async () => {
    const prisma = makePrisma({ maintenanceWindow: { findMany: vi.fn().mockResolvedValue([]) } });
    await resolveMaintenanceWidget(
      prisma, noopCache, userId,
      makeWidget('maintenance-impact-list', { monitorIds: ['m1'] }), undefined,
    );
    const findArgs = (prisma.maintenanceWindow.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.where.monitors).toBeDefined();
  });

  it('queries windows starting within next 7 days', async () => {
    const prisma = makePrisma({ maintenanceWindow: { findMany: vi.fn().mockResolvedValue([]) } });
    await resolveMaintenanceWidget(prisma, noopCache, userId, makeWidget('maintenance-impact-list'), undefined);
    const findArgs = (prisma.maintenanceWindow.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.where.startsAt.gte).toBeDefined();
    expect(findArgs.where.startsAt.lte).toBeDefined();
  });
});

// ── default / unknown type ────────────────────────────────────────────────────

describe('maintenance resolver — unknown widget type', () => {
  it('returns fallback message for unrecognized type', async () => {
    const prisma = makePrisma();
    const result = await resolveMaintenanceWidget(prisma, noopCache, userId, makeWidget('unknown-maintenance-widget'), undefined);
    expect(result.message).toContain('not yet implemented');
  });
});
