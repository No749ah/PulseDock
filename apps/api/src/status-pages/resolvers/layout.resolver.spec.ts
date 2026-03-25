import { describe, it, expect, vi } from 'vitest';
import { resolveLayoutWidget } from './layout.resolver';
import type { Widget } from '../status-pages.types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeWidget(type: string, config: Record<string, unknown> = {}): Widget {
  return {
    id: `w-${type}`,
    type: type as Widget['type'],
    x: 0, y: 0, w: 3, h: 2,
    config,
  };
}

const noop = {} as never;

// ── last-updated-footer ──────────────────────────────────────────────────────

describe('layout resolver — last-updated-footer', () => {
  it('returns a lastUpdated ISO timestamp', async () => {
    const widget = makeWidget('last-updated-footer', {});
    const before = new Date();
    const result = await resolveLayoutWidget(noop, noop, 'user1', widget, undefined);
    const after = new Date();
    const ts = new Date(result.lastUpdated as string);
    expect(ts >= before).toBe(true);
    expect(ts <= after).toBe(true);
  });

  it('returns default autoRefreshSec of 60', async () => {
    const widget = makeWidget('last-updated-footer', {});
    const result = await resolveLayoutWidget(noop, noop, 'user1', widget, undefined);
    expect(result.autoRefreshSec).toBe(60);
  });

  it('uses configured autoRefreshSec', async () => {
    const widget = makeWidget('last-updated-footer', { autoRefreshSec: 30 });
    const result = await resolveLayoutWidget(noop, noop, 'user1', widget, undefined);
    expect(result.autoRefreshSec).toBe(30);
  });

  it('clamps autoRefreshSec to max 3600', async () => {
    const widget = makeWidget('last-updated-footer', { autoRefreshSec: 99999 });
    const result = await resolveLayoutWidget(noop, noop, 'user1', widget, undefined);
    expect(result.autoRefreshSec).toBe(3600);
  });

  it('clamps autoRefreshSec to min 0', async () => {
    const widget = makeWidget('last-updated-footer', { autoRefreshSec: -10 });
    const result = await resolveLayoutWidget(noop, noop, 'user1', widget, undefined);
    expect(result.autoRefreshSec).toBe(0);
  });
});

// ── collapsible-section / divider / tab-container ────────────────────────────

describe('layout resolver — pass-through widgets', () => {
  const passThroughTypes = ['collapsible-section', 'divider', 'tab-container'];

  for (const type of passThroughTypes) {
    it(`${type}: returns { widgetType, config, fetchedAt }`, async () => {
      const config = { label: 'Section A', defaultOpen: true };
      const widget = makeWidget(type, config);
      const result = await resolveLayoutWidget(noop, noop, 'user1', widget, undefined);
      expect(result.widgetType).toBe(type);
      expect(result.config).toEqual(config);
      expect(typeof result.fetchedAt).toBe('string');
    });
  }
});

// ── table-of-contents ────────────────────────────────────────────────────────

describe('layout resolver — table-of-contents', () => {
  it('returns items array from config', async () => {
    const items = [
      { label: 'Services', anchor: '#services' },
      { label: 'Incidents', anchor: '#incidents' },
    ];
    const widget = makeWidget('table-of-contents', { items });
    const result = await resolveLayoutWidget(noop, noop, 'user1', widget, undefined);
    expect(result.items).toEqual(items);
    expect(typeof result.fetchedAt).toBe('string');
  });

  it('returns empty array when items not configured', async () => {
    const widget = makeWidget('table-of-contents', {});
    const result = await resolveLayoutWidget(noop, noop, 'user1', widget, undefined);
    expect(result.items).toEqual([]);
  });
});

// ── column-layout ────────────────────────────────────────────────────────────

describe('layout resolver — column-layout', () => {
  it('defaults to 2 columns', async () => {
    const widget = makeWidget('column-layout', {});
    const result = await resolveLayoutWidget(noop, noop, 'user1', widget, undefined);
    expect(result.columns).toBe(2);
  });

  it('uses configured column count', async () => {
    const widget = makeWidget('column-layout', { columns: 3 });
    const result = await resolveLayoutWidget(noop, noop, 'user1', widget, undefined);
    expect(result.columns).toBe(3);
  });
});

// ── page-navigation (with prisma mock) ──────────────────────────────────────

describe('layout resolver — page-navigation', () => {
  it('returns published pages from db', async () => {
    const prisma = {
      publicStatusPage: {
        findMany: vi.fn().mockResolvedValue([
          { slug: 'main', title: 'Main Status', description: null },
          { slug: 'internal', title: 'Internal Status', description: 'For staff' },
        ]),
      },
    } as unknown as never;

    const widget = makeWidget('page-navigation', {});
    const result = await resolveLayoutWidget(prisma, noop, 'user1', widget, undefined);
    expect((result.pages as unknown[]).length).toBe(2);
    expect(result.fetchedAt).toBeDefined();
  });

  it('returns empty pages array when none published', async () => {
    const prisma = {
      publicStatusPage: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as never;

    const widget = makeWidget('page-navigation', {});
    const result = await resolveLayoutWidget(prisma, noop, 'user1', widget, undefined);
    expect(result.pages).toEqual([]);
  });
});

// ── dependency-map (with prisma mock) ────────────────────────────────────────

describe('layout resolver — dependency-map', () => {
  it('returns nodes from db with live status and edges from config', async () => {
    const prisma = {
      monitor: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'mon1', name: 'API', type: 'HTTP',
            runs: [{ level: 'green', checkedAt: new Date(), latencyMs: 45 }],
          },
          {
            id: 'mon2', name: 'Database', type: 'TCP',
            runs: [],
          },
        ]),
      },
    } as unknown as never;

    const widget = makeWidget('dependency-map', {
      monitorIds: ['mon1', 'mon2'],
      edges: [{ source: 'mon1', target: 'mon2', label: 'queries' }],
    });
    const result = await resolveLayoutWidget(prisma, noop, 'user1', widget, undefined);
    const nodes = result.nodes as Array<{ id: string; level: string; latencyMs: number | null }>;
    expect(nodes).toHaveLength(2);
    expect(nodes.find((n) => n.id === 'mon1')?.level).toBe('green');
    expect(nodes.find((n) => n.id === 'mon1')?.latencyMs).toBe(45);
    expect(nodes.find((n) => n.id === 'mon2')?.level).toBe('green'); // default when no runs
    const edges = result.edges as Array<{ source: string; target: string }>;
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('mon1');
  });

  it('returns empty edges when not configured', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as never;

    const widget = makeWidget('dependency-map', {});
    const result = await resolveLayoutWidget(prisma, noop, 'user1', widget, undefined);
    expect(result.edges).toEqual([]);
    expect(result.nodes).toEqual([]);
  });
});

// ── offline-banner ───────────────────────────────────────────────────────────

describe('layout resolver — offline-banner', () => {
  it('returns offline-banner type and config', async () => {
    const config = { message: 'Connection lost', retrySeconds: 30 };
    const widget = makeWidget('offline-banner', config);
    const result = await resolveLayoutWidget(noop, noop, 'user1', widget, undefined);
    expect(result.type).toBe('offline-banner');
    expect(result.config).toEqual(config);
    expect(typeof result.fetchedAt).toBe('string');
  });
});

// ── sticky-header (with prisma mock) ────────────────────────────────────────

describe('layout resolver — sticky-header', () => {
  it('returns operational when all monitors are green', async () => {
    const prisma = {
      monitor: {
        findMany: vi.fn().mockResolvedValue([{ id: 'mon1' }, { id: 'mon2' }]),
      },
      monitorRun: {
        findMany: vi.fn().mockResolvedValue([
          { monitorId: 'mon1', level: 'green' },
          { monitorId: 'mon2', level: 'green' },
        ]),
      },
    } as unknown as never;

    const widget = makeWidget('sticky-header', {});
    const result = await resolveLayoutWidget(prisma, noop, 'user1', widget, undefined);
    expect(result.status).toBe('operational');
    expect(result.monitorCount).toBe(2);
  });

  it('returns degraded when at least one monitor is yellow', async () => {
    const prisma = {
      monitor: {
        findMany: vi.fn().mockResolvedValue([{ id: 'mon1' }, { id: 'mon2' }]),
      },
      monitorRun: {
        findMany: vi.fn().mockResolvedValue([
          { monitorId: 'mon1', level: 'green' },
          { monitorId: 'mon2', level: 'yellow' },
        ]),
      },
    } as unknown as never;

    const widget = makeWidget('sticky-header', {});
    const result = await resolveLayoutWidget(prisma, noop, 'user1', widget, undefined);
    expect(result.status).toBe('degraded');
  });

  it('returns outage when at least one monitor is red', async () => {
    const prisma = {
      monitor: {
        findMany: vi.fn().mockResolvedValue([{ id: 'mon1' }]),
      },
      monitorRun: {
        findMany: vi.fn().mockResolvedValue([
          { monitorId: 'mon1', level: 'red' },
        ]),
      },
    } as unknown as never;

    const widget = makeWidget('sticky-header', {});
    const result = await resolveLayoutWidget(prisma, noop, 'user1', widget, undefined);
    expect(result.status).toBe('outage');
  });

  it('returns operational when no monitors exist', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([]) },
      monitorRun: { findMany: vi.fn() },
    } as unknown as never;

    const widget = makeWidget('sticky-header', {});
    const result = await resolveLayoutWidget(prisma, noop, 'user1', widget, undefined);
    expect(result.status).toBe('operational');
    expect(result.monitorCount).toBe(0);
  });
});
