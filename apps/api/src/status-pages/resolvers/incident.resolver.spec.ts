import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveIncidentWidget } from './incident.resolver';
import type { Widget } from '../status-pages.types';

function makeWidget(type: string, config: Record<string, unknown> = {}): Widget {
  return { id: `w-${type}`, type: type as Widget['type'], x: 0, y: 0, w: 4, h: 2, config };
}

const noopCache = {} as never;
const userId = 'user-1';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    incident: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    monitor: { findMany: vi.fn().mockResolvedValue([]) },
    monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as any;
}

const now = new Date('2026-03-25T12:00:00Z');

// ── active-incident-banner ────────────────────────────────────────────────────

describe('incident resolver — active-incident-banner', () => {
  it('returns isAllClear=true when no incidents and no down monitors', async () => {
    const prisma = makePrisma({
      incident: { findMany: vi.fn().mockResolvedValue([]) },
      monitor: { findMany: vi.fn().mockResolvedValue([{ id: 'm1', runs: [{ ok: true, level: 'green', message: null }] }]) },
    });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('active-incident-banner'), undefined);
    expect(result.isAllClear).toBe(true);
    expect(result.downMonitors).toHaveLength(0);
    expect(result.activeIncidents).toHaveLength(0);
    expect(result.fetchedAt).toBeDefined();
  });

  it('returns isAllClear=false when there are active incidents', async () => {
    const incident = {
      id: 'inc1',
      title: 'DB Outage',
      severity: 'CRITICAL',
      status: 'INVESTIGATING',
      createdAt: now,
      updates: [{ body: 'Working on it' }],
      monitors: [{ monitor: { id: 'm1', name: 'DB' } }],
    };
    const prisma = makePrisma({
      incident: { findMany: vi.fn().mockResolvedValue([incident]) },
      monitor: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('active-incident-banner'), undefined);
    expect(result.isAllClear).toBe(false);
    expect(result.activeIncidents).toHaveLength(1);
    expect((result.activeIncidents as any[])[0].title).toBe('DB Outage');
    expect((result.activeIncidents as any[])[0].latestUpdate).toBe('Working on it');
  });

  it('returns isAllClear=false when monitor is down', async () => {
    const prisma = makePrisma({
      incident: { findMany: vi.fn().mockResolvedValue([]) },
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', name: 'API', runs: [{ ok: false, level: 'red', message: 'timeout' }] },
        ]),
      },
    });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('active-incident-banner'), undefined);
    expect(result.isAllClear).toBe(false);
    expect(result.downMonitors).toHaveLength(1);
    expect((result.downMonitors as any[])[0].name).toBe('API');
  });

  it('filters monitors by watchedIds when provided', async () => {
    const prisma = makePrisma({
      incident: { findMany: vi.fn().mockResolvedValue([]) },
      monitor: { findMany: vi.fn().mockResolvedValue([]) },
    });
    await resolveIncidentWidget(
      prisma, noopCache, userId,
      makeWidget('active-incident-banner', { monitorIds: ['m1', 'm2'] }),
      undefined,
    );
    const monitorFindArgs = (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(monitorFindArgs.where.id).toEqual({ in: ['m1', 'm2'] });
  });

  it('handles incident with no updates gracefully', async () => {
    const incident = {
      id: 'inc1', title: 'Test', severity: 'MINOR', status: 'INVESTIGATING',
      createdAt: now, updates: [], monitors: [],
    };
    const prisma = makePrisma({
      incident: { findMany: vi.fn().mockResolvedValue([incident]) },
      monitor: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('active-incident-banner'), undefined);
    expect((result.activeIncidents as any[])[0].latestUpdate).toBeNull();
  });
});

// ── active-incident-count ─────────────────────────────────────────────────────

describe('incident resolver — active-incident-count', () => {
  it('returns count=0 when no active incidents', async () => {
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('active-incident-count'), undefined);
    expect(result.count).toBe(0);
    expect(result.incidents).toHaveLength(0);
    expect(result.fetchedAt).toBeDefined();
  });

  it('returns correct count with active incidents', async () => {
    const incidents = [
      { id: 'i1', title: 'DB', severity: 'HIGH', status: 'INVESTIGATING', createdAt: now },
      { id: 'i2', title: 'API', severity: 'MINOR', status: 'IDENTIFIED', createdAt: now },
    ];
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue(incidents) } });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('active-incident-count'), undefined);
    expect(result.count).toBe(2);
    expect(result.incidents).toHaveLength(2);
  });
});

// ── incident-history ──────────────────────────────────────────────────────────

describe('incident resolver — incident-history', () => {
  it('returns empty incidents list when no history', async () => {
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('incident-history'), undefined);
    expect(result.incidents).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.periodDays).toBe(30);
  });

  it('returns incident list with updates and monitors', async () => {
    const incident = {
      id: 'i1',
      title: 'Network issue',
      status: 'RESOLVED',
      severity: 'HIGH',
      createdAt: new Date('2026-03-20T10:00:00Z'),
      resolvedAt: new Date('2026-03-20T11:00:00Z'),
      updates: [{ id: 'u1', body: 'Investigating', status: 'INVESTIGATING', createdAt: new Date('2026-03-20T10:05:00Z') }],
      monitors: [{ monitor: { id: 'm1', name: 'Network Monitor' } }],
    };
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue([incident]) } });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('incident-history'), undefined);
    const inc = (result.incidents as any[])[0];
    expect(inc.title).toBe('Network issue');
    expect(inc.status).toBe('RESOLVED');
    expect(inc.resolvedAt).toBe('2026-03-20T11:00:00.000Z');
    expect(inc.updates).toHaveLength(1);
    expect(inc.monitors).toHaveLength(1);
  });

  it('uses custom periodDays from widget config', async () => {
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveIncidentWidget(
      prisma, noopCache, userId,
      makeWidget('incident-history', { periodDays: 90 }), undefined,
    );
    expect(result.periodDays).toBe(90);
    const findArgs = (prisma.incident.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.where.createdAt.gte).toBeDefined();
  });

  it('maps resolvedAt to null when not resolved', async () => {
    const incident = {
      id: 'i1', title: 'Ongoing', status: 'INVESTIGATING', severity: 'HIGH',
      createdAt: new Date(), resolvedAt: null, updates: [], monitors: [],
    };
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue([incident]) } });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('incident-history'), undefined);
    expect((result.incidents as any[])[0].resolvedAt).toBeNull();
  });
});

// ── incident-timeline ─────────────────────────────────────────────────────────

describe('incident resolver — incident-timeline', () => {
  it('returns empty timeline', async () => {
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('incident-timeline'), undefined);
    expect(result.incidents).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('calculates durationMs for resolved incidents', async () => {
    const createdAt = new Date('2026-03-25T10:00:00Z');
    const resolvedAt = new Date('2026-03-25T11:30:00Z');
    const incident = {
      id: 'i1', title: 'Outage', status: 'RESOLVED', severity: 'CRITICAL',
      createdAt, resolvedAt,
      updates: [{ id: 'u1', body: 'Fixed', status: 'RESOLVED', createdAt: resolvedAt }],
      monitors: [{ monitor: { id: 'm1', name: 'API' } }],
    };
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue([incident]) } });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('incident-timeline'), undefined);
    const inc = (result.incidents as any[])[0];
    expect(inc.durationMs).toBe(90 * 60 * 1000); // 90 minutes
  });

  it('returns durationMs=null for unresolved incidents', async () => {
    const incident = {
      id: 'i1', title: 'Active', status: 'INVESTIGATING', severity: 'HIGH',
      createdAt: now, resolvedAt: null, updates: [], monitors: [],
    };
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue([incident]) } });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('incident-timeline'), undefined);
    expect((result.incidents as any[])[0].durationMs).toBeNull();
  });

  it('applies limit from config (clamped 1-20)', async () => {
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue([]) } });
    await resolveIncidentWidget(
      prisma, noopCache, userId,
      makeWidget('incident-timeline', { limit: 50 }), undefined,
    );
    const findArgs = (prisma.incident.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.take).toBe(20);
  });

  it('filters by monitorIds when provided', async () => {
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue([]) } });
    await resolveIncidentWidget(
      prisma, noopCache, userId,
      makeWidget('incident-timeline', { monitorIds: ['m1'] }), undefined,
    );
    const findArgs = (prisma.incident.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.where.monitors).toBeDefined();
  });
});

// ── incident-severity-distribution ───────────────────────────────────────────

describe('incident resolver — incident-severity-distribution', () => {
  it('returns zeroes when no incidents', async () => {
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('incident-severity-distribution'), undefined);
    expect(result.critical).toBe(0);
    expect(result.major).toBe(0);
    expect(result.minor).toBe(0);
    expect(result.total).toBe(0);
  });

  it('counts severity buckets correctly', async () => {
    const incidents = [
      { id: 'i1', severity: 'CRITICAL' },
      { id: 'i2', severity: 'CRITICAL' },
      { id: 'i3', severity: 'HIGH' },
      { id: 'i4', severity: 'LOW' },
      { id: 'i5', severity: 'MINOR' },
    ];
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue(incidents) } });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('incident-severity-distribution'), undefined);
    expect(result.critical).toBe(2);
    expect(result.major).toBe(1);
    expect(result.minor).toBe(2);
    expect(result.total).toBe(5);
  });

  it('clamps periodDays between 1 and 365', async () => {
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue([]) } });
    const r1 = await resolveIncidentWidget(
      prisma, noopCache, userId,
      makeWidget('incident-severity-distribution', { periodDays: 0 }), undefined,
    );
    expect(r1.periodDays).toBe(1);

    const r2 = await resolveIncidentWidget(
      prisma, noopCache, userId,
      makeWidget('incident-severity-distribution', { periodDays: 9999 }), undefined,
    );
    expect(r2.periodDays).toBe(365);
  });
});

// ── incident-duration-stats ───────────────────────────────────────────────────

describe('incident resolver — incident-duration-stats', () => {
  it('returns null stats when no resolved incidents', async () => {
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('incident-duration-stats'), undefined);
    expect(result.avg).toBeNull();
    expect(result.longest).toBeNull();
    expect(result.shortest).toBeNull();
    expect(result.count).toBe(0);
  });

  it('calculates avg, longest, shortest durations', async () => {
    const incidents = [
      { createdAt: new Date('2026-03-25T10:00:00Z'), resolvedAt: new Date('2026-03-25T10:30:00Z') }, // 30 min
      { createdAt: new Date('2026-03-25T11:00:00Z'), resolvedAt: new Date('2026-03-25T12:00:00Z') }, // 60 min
      { createdAt: new Date('2026-03-25T13:00:00Z'), resolvedAt: new Date('2026-03-25T13:15:00Z') }, // 15 min
    ];
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue(incidents) } });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('incident-duration-stats'), undefined);
    const toMs = (min: number) => min * 60 * 1000;
    expect(result.count).toBe(3);
    expect(result.avg).toBe(toMs(35)); // (30+60+15)/3
    expect(result.longest).toBe(toMs(60));
    expect(result.shortest).toBe(toMs(15));
  });

  it('filters by monitorIds when provided', async () => {
    const prisma = makePrisma({ incident: { findMany: vi.fn().mockResolvedValue([]) } });
    await resolveIncidentWidget(
      prisma, noopCache, userId,
      makeWidget('incident-duration-stats', { monitorIds: ['m1'] }), undefined,
    );
    const findArgs = (prisma.incident.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findArgs.where.monitors).toBeDefined();
  });
});

// ── post-mortem-card ──────────────────────────────────────────────────────────

describe('incident resolver — post-mortem-card', () => {
  it('returns incident=null when no resolved incidents exist', async () => {
    const prisma = makePrisma({ incident: { findFirst: vi.fn().mockResolvedValue(null) } });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('post-mortem-card'), undefined);
    expect(result.incident).toBeNull();
    expect(result.fetchedAt).toBeDefined();
  });

  it('returns latest resolved incident with duration', async () => {
    const createdAt = new Date('2026-03-24T08:00:00Z');
    const resolvedAt = new Date('2026-03-24T10:00:00Z');
    const incident = {
      id: 'i1', title: 'Major outage', severity: 'CRITICAL',
      createdAt, resolvedAt, description: 'Database failure',
      updates: [
        { id: 'u1', body: 'Investigating', status: 'INVESTIGATING', createdAt },
        { id: 'u2', body: 'Resolved', status: 'RESOLVED', createdAt: resolvedAt },
      ],
      monitors: [{ monitor: { id: 'm1', name: 'DB' } }],
    };
    const prisma = makePrisma({ incident: { findFirst: vi.fn().mockResolvedValue(incident) } });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('post-mortem-card'), undefined);
    const inc = result.incident as any;
    expect(inc.title).toBe('Major outage');
    expect(inc.severity).toBe('CRITICAL');
    expect(inc.durationMs).toBe(2 * 60 * 60 * 1000); // 2 hours
    expect(inc.affectedMonitors).toHaveLength(1);
    expect(inc.updates).toHaveLength(2);
  });

  it('returns durationMs=null for unresolved incident', async () => {
    const incident = {
      id: 'i1', title: 'Ongoing', severity: 'HIGH',
      createdAt: now, resolvedAt: null, description: null,
      updates: [], monitors: [],
    };
    const prisma = makePrisma({ incident: { findFirst: vi.fn().mockResolvedValue(incident) } });
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('post-mortem-card'), undefined);
    expect((result.incident as any).durationMs).toBeNull();
  });
});

// ── default / unknown type ────────────────────────────────────────────────────

describe('incident resolver — unknown widget type', () => {
  it('returns fallback message for unrecognized type', async () => {
    const prisma = makePrisma();
    const result = await resolveIncidentWidget(prisma, noopCache, userId, makeWidget('unknown-incident-widget'), undefined);
    expect(result.message).toContain('not yet implemented');
  });
});
