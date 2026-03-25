import { describe, it, expect, vi } from 'vitest';
import { resolveUptimeWidget } from './uptime.resolver';
import type { Widget } from '../status-pages.types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeWidget(type: string, config: Record<string, unknown> = {}): Widget {
  return { id: `w-${type}`, type: type as Widget['type'], x: 0, y: 0, w: 4, h: 2, config };
}

const noopCache = {} as never;
const userId = 'user-1';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    monitor: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    monitorRun: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    ...overrides,
  } as unknown as any;
}

// ── uptime-bar ───────────────────────────────────────────────────────────────

describe('uptime resolver — uptime-bar', () => {
  it('returns _noConfig when no monitorId', async () => {
    const result = await resolveUptimeWidget(makePrisma(), noopCache, userId, makeWidget('uptime-bar'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('computes uptime percentage from runs', async () => {
    const prisma = makePrisma({
      monitorRun: {
        findMany: vi.fn().mockResolvedValue([
          { level: 'green' }, { level: 'green' }, { level: 'green' },
          { level: 'green' }, { level: 'red' },
        ]),
        findFirst: vi.fn().mockResolvedValue({ checkedAt: new Date() }),
      },
    });
    const result = await resolveUptimeWidget(
      prisma, noopCache, userId,
      makeWidget('uptime-bar', { monitorId: 'mon1', periodDays: 7 }), undefined,
    );
    expect(result.uptimePct).toBe(80);
    expect(result.periodDays).toBe(7);
    expect(result.total).toBe(5);
    expect(result.fetchedAt).toBeDefined();
  });

  it('returns 100% when no runs exist', async () => {
    const prisma = makePrisma({
      monitorRun: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await resolveUptimeWidget(
      prisma, noopCache, userId,
      makeWidget('uptime-bar', { monitorId: 'mon1' }), undefined,
    );
    expect(result.uptimePct).toBe(100);
    expect(result.total).toBe(0);
  });

  it('respects overrideDays parameter', async () => {
    const prisma = makePrisma({
      monitorRun: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await resolveUptimeWidget(
      prisma, noopCache, userId,
      makeWidget('uptime-bar', { monitorId: 'mon1', periodDays: 30 }), 7,
    );
    expect(result.periodDays).toBe(7); // overrideDays takes precedence
  });
});

// ── uptime-timeline ──────────────────────────────────────────────────────────

describe('uptime resolver — uptime-timeline', () => {
  it('returns _noConfig when no monitorId', async () => {
    const result = await resolveUptimeWidget(makePrisma(), noopCache, userId, makeWidget('uptime-timeline'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('generates day buckets with no-data when no runs', async () => {
    const result = await resolveUptimeWidget(
      makePrisma(), noopCache, userId,
      makeWidget('uptime-timeline', { monitorId: 'mon1', days: 7 }), undefined,
    );
    expect(result.days).toBe(7);
    const timeline = result.timeline as Array<{ date: string; level: string }>;
    expect(timeline).toHaveLength(7);
    expect(timeline.every((t) => t.level === 'no-data')).toBe(true);
  });

  it('clamps days to min 7', async () => {
    const result = await resolveUptimeWidget(
      makePrisma(), noopCache, userId,
      makeWidget('uptime-timeline', { monitorId: 'mon1', days: 1 }), undefined,
    );
    expect(result.days).toBe(7);
  });

  it('clamps days to max 365', async () => {
    const result = await resolveUptimeWidget(
      makePrisma(), noopCache, userId,
      makeWidget('uptime-timeline', { monitorId: 'mon1', days: 999 }), undefined,
    );
    expect(result.days).toBe(365);
  });

  it('categorizes days by fail rate', async () => {
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    const prisma = makePrisma({
      monitorRun: {
        findMany: vi.fn().mockResolvedValue([
          { level: 'green', checkedAt: today },
          { level: 'green', checkedAt: today },
          { level: 'red', checkedAt: today },
        ]),
      },
    });
    const result = await resolveUptimeWidget(
      prisma, noopCache, userId,
      makeWidget('uptime-timeline', { monitorId: 'mon1', days: 7 }), undefined,
    );
    const timeline = result.timeline as Array<{ date: string; level: string }>;
    const todayBucket = timeline.find((t) => t.date === todayStr);
    // 1/3 fail rate < 0.5 → yellow
    expect(todayBucket?.level).toBe('yellow');
  });
});

// ── rolling-uptime-cards ─────────────────────────────────────────────────────

describe('uptime resolver — rolling-uptime-cards', () => {
  it('returns _noConfig when no monitorId', async () => {
    const result = await resolveUptimeWidget(makePrisma(), noopCache, userId, makeWidget('rolling-uptime-cards'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns 4 period cards', async () => {
    const prisma = makePrisma({
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const result = await resolveUptimeWidget(
      prisma, noopCache, userId,
      makeWidget('rolling-uptime-cards', { monitorId: 'mon1' }), undefined,
    );
    const cards = result.cards as Array<{ label: string; uptimePct: number }>;
    expect(cards).toHaveLength(4);
    expect(cards.map((c) => c.label)).toEqual(['24h', '7d', '30d', '90d']);
    // All 100% when no runs
    expect(cards.every((c) => c.uptimePct === 100)).toBe(true);
  });
});

// ── status-history-ribbon ────────────────────────────────────────────────────

describe('uptime resolver — status-history-ribbon', () => {
  it('returns _noConfig when no monitorIds', async () => {
    const result = await resolveUptimeWidget(makePrisma(), noopCache, userId, makeWidget('status-history-ribbon'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('generates ribbon rows for each monitor', async () => {
    const prisma = makePrisma({
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', name: 'API' },
          { id: 'm2', name: 'DB' },
        ]),
      },
    });
    const result = await resolveUptimeWidget(
      prisma, noopCache, userId,
      makeWidget('status-history-ribbon', { monitorIds: ['m1', 'm2'], days: 7 }), undefined,
    );
    const rows = result.rows as Array<{ id: string; name: string; ribbon: unknown[] }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].ribbon).toHaveLength(7);
  });

  it('uses monitorId as fallback when monitorIds not provided', async () => {
    const prisma = makePrisma({
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
      monitor: { findMany: vi.fn().mockResolvedValue([{ id: 'm1', name: 'API' }]) },
    });
    const result = await resolveUptimeWidget(
      prisma, noopCache, userId,
      makeWidget('status-history-ribbon', { monitorId: 'm1' }), undefined,
    );
    expect((result.rows as unknown[]).length).toBe(1);
  });
});

// ── uptime-percentage-card ───────────────────────────────────────────────────

describe('uptime resolver — uptime-percentage-card', () => {
  it('returns _noConfig when no monitorId', async () => {
    const result = await resolveUptimeWidget(makePrisma(), noopCache, userId, makeWidget('uptime-percentage-card'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('computes trend by comparing to previous period', async () => {
    const prisma = makePrisma({
      monitorRun: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{ level: 'green' }, { level: 'green' }]) // current
          .mockResolvedValueOnce([{ level: 'green' }, { level: 'red' }]),   // previous
      },
    });
    const result = await resolveUptimeWidget(
      prisma, noopCache, userId,
      makeWidget('uptime-percentage-card', { monitorId: 'mon1', periodDays: 7 }), undefined,
    );
    expect(result.uptimePct).toBe(100);
    expect(result.previousPct).toBe(50);
    expect(result.trend).toBe('up');
    expect(result.delta).toBe(50);
  });

  it('returns flat trend when both periods equal', async () => {
    const prisma = makePrisma({
      monitorRun: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{ level: 'green' }])
          .mockResolvedValueOnce([{ level: 'green' }]),
      },
    });
    const result = await resolveUptimeWidget(
      prisma, noopCache, userId,
      makeWidget('uptime-percentage-card', { monitorId: 'mon1' }), undefined,
    );
    expect(result.trend).toBe('flat');
    expect(result.delta).toBe(0);
  });

  it('clamps periodDays between 1 and 365', async () => {
    const prisma = makePrisma({
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const result = await resolveUptimeWidget(
      prisma, noopCache, userId,
      makeWidget('uptime-percentage-card', { monitorId: 'mon1', periodDays: 999 }), undefined,
    );
    expect(result.periodDays).toBe(365);
  });
});

// ── uptime-heatmap ───────────────────────────────────────────────────────────

describe('uptime resolver — uptime-heatmap', () => {
  it('returns _noConfig when no monitorId', async () => {
    const result = await resolveUptimeWidget(makePrisma(), noopCache, userId, makeWidget('uptime-heatmap'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns 7x24 grid', async () => {
    const result = await resolveUptimeWidget(
      makePrisma(), noopCache, userId,
      makeWidget('uptime-heatmap', { monitorId: 'mon1' }), undefined,
    );
    const grid = result.grid as string[][];
    expect(grid).toHaveLength(7);
    expect(grid[0]).toHaveLength(24);
    expect(result.days).toBe(7);
    expect(result.hours).toBe(24);
  });

  it('all cells are no-data when no runs', async () => {
    const result = await resolveUptimeWidget(
      makePrisma(), noopCache, userId,
      makeWidget('uptime-heatmap', { monitorId: 'mon1' }), undefined,
    );
    const grid = result.grid as string[][];
    for (const row of grid) {
      for (const cell of row) {
        expect(cell).toBe('no-data');
      }
    }
  });
});

// ── uptime-comparison-chart ──────────────────────────────────────────────────

describe('uptime resolver — uptime-comparison-chart', () => {
  it('returns _noConfig when no monitorIds', async () => {
    const result = await resolveUptimeWidget(makePrisma(), noopCache, userId, makeWidget('uptime-comparison-chart'), undefined);
    expect(result._noConfig).toBe(true);
  });

  it('returns sorted monitors by uptime descending', async () => {
    const prisma = makePrisma({
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm1', name: 'API' },
          { id: 'm2', name: 'DB' },
        ]),
      },
      monitorRun: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{ level: 'green' }, { level: 'red' }]) // m1: 50%
          .mockResolvedValueOnce([{ level: 'green' }, { level: 'green' }]), // m2: 100%
      },
    });
    const result = await resolveUptimeWidget(
      prisma, noopCache, userId,
      makeWidget('uptime-comparison-chart', { monitorIds: ['m1', 'm2'] }), undefined,
    );
    const monitors = result.monitors as Array<{ name: string; uptimePct: number }>;
    expect(monitors).toHaveLength(2);
    expect(monitors[0].name).toBe('DB'); // 100% first
    expect(monitors[1].name).toBe('API'); // 50% second
  });

  it('uses single monitorId as fallback', async () => {
    const prisma = makePrisma({
      monitor: { findMany: vi.fn().mockResolvedValue([{ id: 'm1', name: 'API' }]) },
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const result = await resolveUptimeWidget(
      prisma, noopCache, userId,
      makeWidget('uptime-comparison-chart', { monitorId: 'm1' }), undefined,
    );
    expect((result.monitors as unknown[]).length).toBe(1);
  });
});

// ── default / unknown widget type ────────────────────────────────────────────

describe('uptime resolver — unknown type', () => {
  it('returns fallback message', async () => {
    const result = await resolveUptimeWidget(makePrisma(), noopCache, userId, makeWidget('unknown-widget'), undefined);
    expect(result.widgetType).toBe('unknown-widget');
    expect(result.message).toContain('not yet implemented');
  });
});
