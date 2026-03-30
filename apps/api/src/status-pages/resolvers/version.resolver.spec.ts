import { describe, it, expect, vi } from 'vitest';
import { resolveVersionWidget } from './version.resolver';
import type { Widget } from '../status-pages.types';

function makeWidget(type: string, config: Record<string, unknown> = {}): Widget {
  return { id: `w-${type}`, type: type as Widget['type'], x: 0, y: 0, w: 4, h: 2, config };
}

const noopCache = {} as never;
const userId = 'user-1';
const monitorId = 'mon-1';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    ...overrides,
  } as unknown as any;
}

// ── version-status-grid ───────────────────────────────────────────────────────

describe('version resolver — version-status-grid', () => {
  it('returns empty monitors list when no monitors exist', async () => {
    const prisma = makePrisma({ monitor: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveVersionWidget(prisma, noopCache, userId, makeWidget('version-status-grid'), undefined);
    expect(result.monitors).toHaveLength(0);
    expect(result.fetchedAt).toBeDefined();
  });

  it('filters monitors that have current version in message', async () => {
    const now = new Date();
    const monitors = [
      { id: 'm1', name: 'Docker', type: 'DOCKER_IMAGE' },
      { id: 'm2', name: 'HTTP Check', type: 'HTTP' },
    ];

    const monitorFindMany = vi.fn().mockResolvedValue(monitors);

    // Batched findMany returns all runs for all monitors in one call
    const runFindMany = vi.fn().mockResolvedValue([
      { monitorId: 'm1', level: 'green', message: 'current v1.0.0, latest v1.1.0', checkedAt: now, latencyMs: null },
      { monitorId: 'm2', level: 'green', message: 'OK', checkedAt: now, latencyMs: 50 },
    ]);

    const prisma = {
      monitor: { findMany: monitorFindMany },
      monitorRun: { findMany: runFindMany },
    } as unknown as any;

    const result = await resolveVersionWidget(prisma, noopCache, userId, makeWidget('version-status-grid'), undefined);
    // Only m1 has 'current' in message
    expect((result.monitors as any[]).length).toBe(1);
    expect((result.monitors as any[])[0].name).toBe('Docker');
  });

  it('returns monitor with null run as level=green', async () => {
    const monitorFindMany = vi.fn().mockResolvedValue([{ id: 'm1', name: 'No Run', type: 'GIT_RELEASE' }]);
    const runFindMany = vi.fn().mockResolvedValue([]); // no runs at all
    const prisma = { monitor: { findMany: monitorFindMany }, monitorRun: { findMany: runFindMany } } as unknown as any;

    const result = await resolveVersionWidget(prisma, noopCache, userId, makeWidget('version-status-grid'), undefined);
    // No run → message is null → doesn't match 'current' regex → filtered
    expect(result.monitors).toHaveLength(0);
  });
});

// ── version-check-badge ───────────────────────────────────────────────────────

describe('version resolver — version-check-badge', () => {
  it('returns _noConfig when no monitorId', async () => {
    const prisma = makePrisma();
    const result = await resolveVersionWidget(prisma, noopCache, userId, makeWidget('version-check-badge'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns _noConfig when monitor not found', async () => {
    const prisma = makePrisma({ monitor: { findFirst: vi.fn().mockResolvedValue(null) } });
    const result = await resolveVersionWidget(
      prisma, noopCache, userId,
      makeWidget('version-check-badge', { monitorId }), undefined,
    );
    expect(result._noConfig).toBe(true);
  });

  it('parses current/latest versions from run message', async () => {
    const monitor = {
      id: monitorId, name: 'Nginx',
      runs: [{ level: 'yellow', message: 'current 1.24.0, latest 1.25.0', checkedAt: new Date() }],
    };
    const prisma = makePrisma({ monitor: { findFirst: vi.fn().mockResolvedValue(monitor) } });
    const result = await resolveVersionWidget(
      prisma, noopCache, userId,
      makeWidget('version-check-badge', { monitorId }), undefined,
    );
    expect(result.current).toBe('1.24.0');
    expect(result.latest).toBe('1.25.0');
    expect(result.diff).toBe('minor'); // 1.24 vs 1.25
    expect(result.fetchedAt).toBeDefined();
  });

  it('detects major version diff', async () => {
    const monitor = {
      id: monitorId, name: 'PostgreSQL',
      runs: [{ level: 'red', message: 'current 14.0.0, latest 16.0.0', checkedAt: new Date() }],
    };
    const prisma = makePrisma({ monitor: { findFirst: vi.fn().mockResolvedValue(monitor) } });
    const result = await resolveVersionWidget(
      prisma, noopCache, userId,
      makeWidget('version-check-badge', { monitorId }), undefined,
    );
    expect(result.diff).toBe('major');
  });

  it('detects patch version diff', async () => {
    const monitor = {
      id: monitorId, name: 'Redis',
      runs: [{ level: 'yellow', message: 'current v7.0.10, latest v7.0.11', checkedAt: new Date() }],
    };
    const prisma = makePrisma({ monitor: { findFirst: vi.fn().mockResolvedValue(monitor) } });
    const result = await resolveVersionWidget(
      prisma, noopCache, userId,
      makeWidget('version-check-badge', { monitorId }), undefined,
    );
    expect(result.diff).toBe('patch');
  });

  it('shows up-to-date when versions match', async () => {
    const monitor = {
      id: monitorId, name: 'Grafana',
      runs: [{ level: 'green', message: 'current v10.0.0, latest v10.0.0', checkedAt: new Date() }],
    };
    const prisma = makePrisma({ monitor: { findFirst: vi.fn().mockResolvedValue(monitor) } });
    const result = await resolveVersionWidget(
      prisma, noopCache, userId,
      makeWidget('version-check-badge', { monitorId }), undefined,
    );
    expect(result.diff).toBe('up-to-date');
  });

  it('handles missing run gracefully', async () => {
    const monitor = { id: monitorId, name: 'No runs', runs: [] };
    const prisma = makePrisma({ monitor: { findFirst: vi.fn().mockResolvedValue(monitor) } });
    const result = await resolveVersionWidget(
      prisma, noopCache, userId,
      makeWidget('version-check-badge', { monitorId }), undefined,
    );
    expect(result.current).toBeNull();
    expect(result.latest).toBeNull();
    expect(result.diff).toBe('up-to-date');
    expect(result.level).toBe('green');
  });
});

// ── update-summary ────────────────────────────────────────────────────────────

describe('version resolver — update-summary', () => {
  it('returns all zeros when no version monitors', async () => {
    const prisma = makePrisma({ monitor: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveVersionWidget(prisma, noopCache, userId, makeWidget('update-summary'), undefined);
    expect(result.total).toBe(0);
    expect(result.upToDate).toBe(0);
    expect(result.major).toBe(0);
    expect(result.updates).toHaveLength(0);
    expect(result.fetchedAt).toBeDefined();
  });

  it('counts up-to-date monitors when versions match', async () => {
    const monitors = [
      { id: 'm1', name: 'Nginx', runs: [{ message: 'current 1.24.0, latest 1.24.0' }] },
      { id: 'm2', name: 'Redis', runs: [{ message: 'current 7.0.0, latest 7.0.0' }] },
    ];
    const prisma = makePrisma({ monitor: { findMany: vi.fn().mockResolvedValue(monitors) } });
    const result = await resolveVersionWidget(prisma, noopCache, userId, makeWidget('update-summary'), undefined);
    expect(result.upToDate).toBe(2);
    expect(result.major).toBe(0);
    expect(result.minor).toBe(0);
    expect(result.patch).toBe(0);
    expect(result.updates).toHaveLength(0);
  });

  it('counts major/minor/patch updates correctly', async () => {
    const monitors = [
      { id: 'm1', name: 'Major', runs: [{ message: 'current 1.0.0, latest 2.0.0' }] },
      { id: 'm2', name: 'Minor', runs: [{ message: 'current 1.0.0, latest 1.1.0' }] },
      { id: 'm3', name: 'Patch', runs: [{ message: 'current 1.0.0, latest 1.0.1' }] },
      { id: 'm4', name: 'Latest', runs: [{ message: 'current 1.0.0, latest 1.0.0' }] },
    ];
    const prisma = makePrisma({ monitor: { findMany: vi.fn().mockResolvedValue(monitors) } });
    const result = await resolveVersionWidget(prisma, noopCache, userId, makeWidget('update-summary'), undefined);
    expect(result.major).toBe(1);
    expect(result.minor).toBe(1);
    expect(result.patch).toBe(1);
    expect(result.upToDate).toBe(1);
    expect((result.updates as any[]).length).toBe(3);
  });

  it('handles monitors with unparseable message gracefully', async () => {
    const monitors = [
      { id: 'm1', name: 'Broken', runs: [{ message: null }] },
      { id: 'm2', name: 'Empty', runs: [] },
    ];
    const prisma = makePrisma({ monitor: { findMany: vi.fn().mockResolvedValue(monitors) } });
    const result = await resolveVersionWidget(prisma, noopCache, userId, makeWidget('update-summary'), undefined);
    expect(result.total).toBe(2);
    expect(result.upToDate).toBe(2); // unparseable → counted as up-to-date
  });
});

// ── version-timeline ──────────────────────────────────────────────────────────

describe('version resolver — version-timeline', () => {
  it('returns empty events when no version monitors', async () => {
    const prisma = makePrisma({ monitor: { findMany: vi.fn().mockResolvedValue([]) } });
    const result = await resolveVersionWidget(prisma, noopCache, userId, makeWidget('version-timeline'), undefined);
    expect(result.events).toHaveLength(0);
    expect(result.count).toBe(0);
  });

  it('detects version changes between consecutive runs', async () => {
    const monitorData = [{ id: 'm1', name: 'Nginx' }];
    const runs = [
      { monitorId: 'm1', message: 'v1.25.0', checkedAt: new Date('2026-03-25T12:00:00Z'), ok: true },
      { monitorId: 'm1', message: 'v1.24.0', checkedAt: new Date('2026-03-24T12:00:00Z'), ok: true },
    ];

    const monitorFindMany = vi.fn().mockResolvedValue(monitorData);
    const runFindMany = vi.fn().mockResolvedValue(runs);

    const prisma = { monitor: { findMany: monitorFindMany }, monitorRun: { findMany: runFindMany } } as unknown as any;
    const result = await resolveVersionWidget(prisma, noopCache, userId, makeWidget('version-timeline'), undefined);
    expect(result.count).toBe(1);
    const event = (result.events as any[])[0];
    expect(event.fromVersion).toBe('v1.24.0');
    expect(event.toVersion).toBe('v1.25.0');
    expect(event.name).toBe('Nginx');
  });

  it('returns no events when all runs have same version', async () => {
    const monitorData = [{ id: 'm1', name: 'Redis' }];
    const runs = [
      { monitorId: 'm1', message: 'v7.0.11', checkedAt: new Date('2026-03-25T12:00:00Z'), ok: true },
      { monitorId: 'm1', message: 'v7.0.11', checkedAt: new Date('2026-03-24T12:00:00Z'), ok: true },
      { monitorId: 'm1', message: 'v7.0.11', checkedAt: new Date('2026-03-23T12:00:00Z'), ok: true },
    ];

    const monitorFindMany = vi.fn().mockResolvedValue(monitorData);
    const runFindMany = vi.fn().mockResolvedValue(runs);

    const prisma = { monitor: { findMany: monitorFindMany }, monitorRun: { findMany: runFindMany } } as unknown as any;
    const result = await resolveVersionWidget(prisma, noopCache, userId, makeWidget('version-timeline'), undefined);
    expect(result.count).toBe(0);
    expect(result.events).toHaveLength(0);
  });

  it('sorts events by detectedAt descending', async () => {
    const monitorData = [{ id: 'm1', name: 'Docker' }];
    const runs = [
      { monitorId: 'm1', message: 'v3.0.0', checkedAt: new Date('2026-03-25T12:00:00Z'), ok: true },
      { monitorId: 'm1', message: 'v2.0.0', checkedAt: new Date('2026-03-20T12:00:00Z'), ok: true },
      { monitorId: 'm1', message: 'v1.0.0', checkedAt: new Date('2026-03-15T12:00:00Z'), ok: true },
    ];

    const monitorFindMany = vi.fn().mockResolvedValue(monitorData);
    const runFindMany = vi.fn().mockResolvedValue(runs);

    const prisma = { monitor: { findMany: monitorFindMany }, monitorRun: { findMany: runFindMany } } as unknown as any;
    const result = await resolveVersionWidget(prisma, noopCache, userId, makeWidget('version-timeline'), undefined);
    const events = result.events as any[];
    expect(events[0].detectedAt.getTime()).toBeGreaterThan(events[1].detectedAt.getTime());
  });
});

// ── outdated-components-alert ─────────────────────────────────────────────────

describe('version resolver — outdated-components-alert', () => {
  it('returns empty list when all monitors are up-to-date', async () => {
    const monitors = [
      { id: 'm1', name: 'Nginx', configJson: { latestVersion: '1.24.0' },
        runs: [{ message: '1.24.0' }] }, // same version → up-to-date
    ];
    const prisma = makePrisma({ monitor: { findMany: vi.fn().mockResolvedValue(monitors) } });
    const result = await resolveVersionWidget(prisma, noopCache, userId, makeWidget('outdated-components-alert'), undefined);
    expect(result.outdated).toHaveLength(0);
    expect(result.total).toBe(1);
    expect(result.fetchedAt).toBeDefined();
  });

  it('includes outdated monitors in the list', async () => {
    // outdated-components-alert uses configJson.latestVersion vs run.message for current
    const monitors = [
      { id: 'm1', name: 'Nginx', configJson: { latestVersion: '1.25.0' },
        runs: [{ message: '1.24.0' }] }, // current 1.24.0, latest 1.25.0 → outdated
      { id: 'm2', name: 'Redis', configJson: { latestVersion: '7.0.11' },
        runs: [{ message: '7.0.11' }] }, // same → up-to-date
    ];
    const prisma = makePrisma({ monitor: { findMany: vi.fn().mockResolvedValue(monitors) } });
    const result = await resolveVersionWidget(prisma, noopCache, userId, makeWidget('outdated-components-alert'), undefined);
    expect(result.outdated).toHaveLength(1);
    expect((result.outdated as any[])[0].name).toBe('Nginx');
  });
});

// ── default / unknown type ────────────────────────────────────────────────────

describe('version resolver — unknown widget type', () => {
  it('returns fallback message for unrecognized type', async () => {
    const prisma = makePrisma();
    const result = await resolveVersionWidget(prisma, noopCache, userId, makeWidget('unknown-version-widget'), undefined);
    expect(result.message).toContain('not yet implemented');
  });
});
