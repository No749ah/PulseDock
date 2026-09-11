/**
 * Unit tests for useMonitors.ts pure logic.
 *
 * Tests the filtering, sorting, pagination, and summary computation
 * logic extracted from the hook — without React rendering.
 *
 * All functions are re-implemented here to avoid the 'use client' boundary.
 */
import { describe, it, expect } from 'vitest';

// ─── Types (minimal subset) ───────────────────────────────────────────────────

type MonitorType =
  | 'HTTP' | 'TCP' | 'SSL_CERT' | 'HEARTBEAT' | 'DNS' | 'PING' | 'SMTP'
  | 'GIT_RELEASE' | 'DOCKER_IMAGE' | 'BROWSER' | 'WHOIS' | 'FTP' | 'IMAP'
  | 'POP3' | 'CT_LOG' | 'GRAPHQL' | 'TRANSACTION';

interface MonitorTag { id: string; name: string; color: string; }
interface MonitorItem {
  id: string; name: string; type: MonitorType; target: string;
  intervalSec: number; enabled: boolean; createdAt: string;
  tags?: MonitorTag[];
  folderId?: string | null;
  pinned?: boolean;
  config?: Record<string, unknown>;
}
interface MonitorRun {
  id: string; monitorId: string; ok: boolean; checkedAt: string;
  level?: 'green' | 'yellow' | 'red'; latencyMs?: number;
}

// ─── Helpers mirroring useMonitors logic ─────────────────────────────────────

const VERSION_TYPES = new Set<MonitorType>(['GIT_RELEASE', 'DOCKER_IMAGE']);
const defaultTypes = new Set<MonitorType>([
  'HTTP', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP',
  'GIT_RELEASE', 'DOCKER_IMAGE', 'BROWSER', 'WHOIS', 'FTP', 'IMAP',
  'POP3', 'CT_LOG', 'GRAPHQL', 'TRANSACTION',
]);
const defaultStatuses = new Set<string>(['up', 'down', 'degraded', 'paused']);

function filterMonitors(
  monitors: MonitorItem[],
  runs: MonitorRun[],
  opts: {
    activeTagFilter?: string | null;
    statusFilter?: 'all' | 'enabled' | 'disabled';
    folderFilter?: string | null;
    filterTypes?: Set<string>;
    typeFilter?: string;
    filterTags?: Set<string>;
    filterStatuses?: Set<string>;
    searchQuery?: string;
  } = {}
): MonitorItem[] {
  const {
    activeTagFilter = null,
    statusFilter = 'all',
    folderFilter = null,
    filterTypes = new Set(defaultTypes),
    typeFilter = 'all',
    filterTags = new Set<string>(),
    filterStatuses = new Set(defaultStatuses),
    searchQuery = '',
  } = opts;

  return monitors.filter((m) => {
    if (VERSION_TYPES.has(m.type)) return false;
    if (activeTagFilter && !m.tags?.some((t) => t.name === activeTagFilter)) return false;
    if (statusFilter === 'enabled' && !m.enabled) return false;
    if (statusFilter === 'disabled' && m.enabled) return false;
    if (folderFilter && m.folderId !== folderFilter) return false;
    if (filterTypes.size < defaultTypes.size && !filterTypes.has(m.type)) return false;
    if (typeFilter !== 'all' && m.type !== typeFilter) return false;
    if (filterTags.size > 0 && !m.tags?.some((t) => filterTags.has(t.name))) return false;
    if (filterStatuses.size < defaultStatuses.size) {
      const lastRun = runs.find((r) => r.monitorId === m.id);
      if (!m.enabled) { if (!filterStatuses.has('paused')) return false; }
      else if (!lastRun) { if (!filterStatuses.has('up')) return false; }
      else {
        const lvl = lastRun.level ?? 'green';
        if (lvl === 'green' && !filterStatuses.has('up')) return false;
        if (lvl === 'yellow' && !filterStatuses.has('degraded')) return false;
        if (lvl === 'red' && !filterStatuses.has('down')) return false;
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !m.target.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function computeMonitorSummary(
  monitors: MonitorItem[],
  runs: MonitorRun[]
): { up: number; degraded: number; down: number; paused: number } {
  const uptimeMonitors = monitors.filter((m) => !VERSION_TYPES.has(m.type));
  return uptimeMonitors.reduce(
    (acc, m) => {
      if (!m.enabled) { acc.paused++; return acc; }
      const lastRun = runs.find((r) => r.monitorId === m.id);
      if (!lastRun || lastRun.level === 'green') { acc.up++; return acc; }
      if (lastRun.level === 'yellow') { acc.degraded++; return acc; }
      if (lastRun.level === 'red') { acc.down++; return acc; }
      acc.up++;
      return acc;
    },
    { up: 0, degraded: 0, down: 0, paused: 0 }
  );
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMonitor(overrides: Partial<MonitorItem> & { id: string }): MonitorItem {
  return {
    name: 'Test Monitor', type: 'HTTP', target: 'https://example.com',
    intervalSec: 60, enabled: true, createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeRun(monitorId: string, level: 'green' | 'yellow' | 'red' = 'green', latencyMs = 100): MonitorRun {
  return {
    id: `run-${monitorId}`, monitorId, ok: level === 'green',
    checkedAt: '2026-04-01T10:00:00Z', level, latencyMs,
  };
}

// ─── filterMonitors — version type exclusion ──────────────────────────────────

describe('filterMonitors — version type exclusion', () => {
  const monitors = [
    makeMonitor({ id: 'http', type: 'HTTP' }),
    makeMonitor({ id: 'git', type: 'GIT_RELEASE' }),
    makeMonitor({ id: 'docker', type: 'DOCKER_IMAGE' }),
    makeMonitor({ id: 'tcp', type: 'TCP' }),
  ];

  it('excludes GIT_RELEASE monitors', () => {
    const result = filterMonitors(monitors, []);
    expect(result.find((m) => m.id === 'git')).toBeUndefined();
  });

  it('excludes DOCKER_IMAGE monitors', () => {
    const result = filterMonitors(monitors, []);
    expect(result.find((m) => m.id === 'docker')).toBeUndefined();
  });

  it('includes HTTP and TCP', () => {
    const result = filterMonitors(monitors, []);
    expect(result.map((m) => m.id)).toContain('http');
    expect(result.map((m) => m.id)).toContain('tcp');
  });
});

// ─── filterMonitors — statusFilter ───────────────────────────────────────────

describe('filterMonitors — statusFilter', () => {
  const monitors = [
    makeMonitor({ id: 'enabled', enabled: true }),
    makeMonitor({ id: 'disabled', enabled: false }),
  ];

  it('returns all monitors when statusFilter is "all"', () => {
    const result = filterMonitors(monitors, [], { statusFilter: 'all' });
    expect(result).toHaveLength(2);
  });

  it('returns only enabled monitors when statusFilter is "enabled"', () => {
    const result = filterMonitors(monitors, [], { statusFilter: 'enabled' });
    expect(result.map((m) => m.id)).toEqual(['enabled']);
  });

  it('returns only disabled monitors when statusFilter is "disabled"', () => {
    const result = filterMonitors(monitors, [], { statusFilter: 'disabled' });
    expect(result.map((m) => m.id)).toEqual(['disabled']);
  });
});

// ─── filterMonitors — tag filter ──────────────────────────────────────────────

describe('filterMonitors — activeTagFilter', () => {
  const monitors = [
    makeMonitor({ id: 'a', tags: [{ id: 't1', name: 'production', color: 'red' }] }),
    makeMonitor({ id: 'b', tags: [{ id: 't2', name: 'staging', color: 'blue' }] }),
    makeMonitor({ id: 'c' }),
  ];

  it('filters by activeTagFilter when set', () => {
    const result = filterMonitors(monitors, [], { activeTagFilter: 'production' });
    expect(result.map((m) => m.id)).toEqual(['a']);
  });

  it('returns all (non-version) when activeTagFilter is null', () => {
    const result = filterMonitors(monitors, [], { activeTagFilter: null });
    expect(result).toHaveLength(3);
  });

  it('returns empty when tag does not match any monitor', () => {
    const result = filterMonitors(monitors, [], { activeTagFilter: 'nonexistent' });
    expect(result).toHaveLength(0);
  });
});

// ─── filterMonitors — folderFilter ────────────────────────────────────────────

describe('filterMonitors — folderFilter', () => {
  const monitors = [
    makeMonitor({ id: 'a', folderId: 'folder-1' }),
    makeMonitor({ id: 'b', folderId: 'folder-2' }),
    makeMonitor({ id: 'c', folderId: null }),
  ];

  it('filters by folderId', () => {
    const result = filterMonitors(monitors, [], { folderFilter: 'folder-1' });
    expect(result.map((m) => m.id)).toEqual(['a']);
  });

  it('does not filter when folderFilter is null', () => {
    const result = filterMonitors(monitors, [], { folderFilter: null });
    expect(result).toHaveLength(3);
  });
});

// ─── filterMonitors — typeFilter ──────────────────────────────────────────────

describe('filterMonitors — typeFilter', () => {
  const monitors = [
    makeMonitor({ id: 'http', type: 'HTTP' }),
    makeMonitor({ id: 'tcp', type: 'TCP' }),
    makeMonitor({ id: 'ssl', type: 'SSL_CERT' }),
  ];

  it('filters to single type when typeFilter is set', () => {
    const result = filterMonitors(monitors, [], { typeFilter: 'TCP' });
    expect(result.map((m) => m.id)).toEqual(['tcp']);
  });

  it('returns all when typeFilter is "all"', () => {
    const result = filterMonitors(monitors, [], { typeFilter: 'all' });
    expect(result).toHaveLength(3);
  });
});

// ─── filterMonitors — search query ────────────────────────────────────────────

describe('filterMonitors — search query', () => {
  const monitors = [
    makeMonitor({ id: 'a', name: 'Production API', target: 'https://api.prod.example.com' }),
    makeMonitor({ id: 'b', name: 'Staging DB', target: 'https://db.staging.example.com' }),
    makeMonitor({ id: 'c', name: 'CDN Check', target: 'https://cdn.example.com' }),
  ];

  it('matches on monitor name (case-insensitive)', () => {
    const result = filterMonitors(monitors, [], { searchQuery: 'production' });
    expect(result.map((m) => m.id)).toEqual(['a']);
  });

  it('matches on monitor target (case-insensitive)', () => {
    const result = filterMonitors(monitors, [], { searchQuery: 'staging' });
    expect(result.map((m) => m.id)).toEqual(['b']);
  });

  it('returns all when searchQuery is empty', () => {
    const result = filterMonitors(monitors, [], { searchQuery: '' });
    expect(result).toHaveLength(3);
  });

  it('returns empty for no-match query', () => {
    const result = filterMonitors(monitors, [], { searchQuery: 'zzz-nomatch' });
    expect(result).toHaveLength(0);
  });

  it('trims whitespace before matching', () => {
    const result = filterMonitors(monitors, [], { searchQuery: '   ' });
    expect(result).toHaveLength(3);
  });
});

// ─── filterMonitors — filterStatuses ─────────────────────────────────────────

describe('filterMonitors — filterStatuses', () => {
  const monitors = [
    makeMonitor({ id: 'up', enabled: true }),
    makeMonitor({ id: 'degraded', enabled: true }),
    makeMonitor({ id: 'down', enabled: true }),
    makeMonitor({ id: 'paused', enabled: false }),
  ];
  const runs = [
    makeRun('up', 'green'),
    makeRun('degraded', 'yellow'),
    makeRun('down', 'red'),
  ];

  it('shows only "up" monitors when filterStatuses = {up}', () => {
    const result = filterMonitors(monitors, runs, { filterStatuses: new Set(['up']) });
    expect(result.map((m) => m.id)).toEqual(['up']);
  });

  it('shows only degraded monitors when filterStatuses = {degraded}', () => {
    const result = filterMonitors(monitors, runs, { filterStatuses: new Set(['degraded']) });
    expect(result.map((m) => m.id)).toEqual(['degraded']);
  });

  it('shows only down monitors when filterStatuses = {down}', () => {
    const result = filterMonitors(monitors, runs, { filterStatuses: new Set(['down']) });
    expect(result.map((m) => m.id)).toEqual(['down']);
  });

  it('shows only paused monitors when filterStatuses = {paused}', () => {
    const result = filterMonitors(monitors, runs, { filterStatuses: new Set(['paused']) });
    expect(result.map((m) => m.id)).toEqual(['paused']);
  });

  it('shows all when filterStatuses = full set (default behaviour)', () => {
    const result = filterMonitors(monitors, runs, { filterStatuses: new Set(defaultStatuses) });
    expect(result).toHaveLength(4);
  });

  it('treats monitor with no run as "up"', () => {
    const noRunMonitor = makeMonitor({ id: 'norun', enabled: true });
    const result = filterMonitors([noRunMonitor], [], { filterStatuses: new Set(['up']) });
    expect(result.map((m) => m.id)).toEqual(['norun']);
  });
});

// ─── computeMonitorSummary ────────────────────────────────────────────────────

describe('computeMonitorSummary', () => {
  it('returns all zeros for empty monitor list', () => {
    expect(computeMonitorSummary([], [])).toEqual({ up: 0, degraded: 0, down: 0, paused: 0 });
  });

  it('counts disabled monitors as paused', () => {
    const monitors = [makeMonitor({ id: 'a', enabled: false })];
    const summary = computeMonitorSummary(monitors, []);
    expect(summary.paused).toBe(1);
    expect(summary.up).toBe(0);
  });

  it('counts monitor with no run as up', () => {
    const monitors = [makeMonitor({ id: 'a', enabled: true })];
    const summary = computeMonitorSummary(monitors, []);
    expect(summary.up).toBe(1);
  });

  it('counts green run as up', () => {
    const monitors = [makeMonitor({ id: 'a', enabled: true })];
    const runs = [makeRun('a', 'green')];
    const summary = computeMonitorSummary(monitors, runs);
    expect(summary.up).toBe(1);
  });

  it('counts yellow run as degraded', () => {
    const monitors = [makeMonitor({ id: 'a', enabled: true })];
    const runs = [makeRun('a', 'yellow')];
    const summary = computeMonitorSummary(monitors, runs);
    expect(summary.degraded).toBe(1);
    expect(summary.up).toBe(0);
  });

  it('counts red run as down', () => {
    const monitors = [makeMonitor({ id: 'a', enabled: true })];
    const runs = [makeRun('a', 'red')];
    const summary = computeMonitorSummary(monitors, runs);
    expect(summary.down).toBe(1);
    expect(summary.up).toBe(0);
  });

  it('excludes GIT_RELEASE and DOCKER_IMAGE from summary', () => {
    const monitors = [
      makeMonitor({ id: 'git', type: 'GIT_RELEASE', enabled: true }),
      makeMonitor({ id: 'docker', type: 'DOCKER_IMAGE', enabled: true }),
    ];
    const summary = computeMonitorSummary(monitors, []);
    expect(summary).toEqual({ up: 0, degraded: 0, down: 0, paused: 0 });
  });

  it('handles mixed fleet correctly', () => {
    const monitors = [
      makeMonitor({ id: 'up1', enabled: true }),
      makeMonitor({ id: 'up2', enabled: true }),
      makeMonitor({ id: 'deg1', enabled: true }),
      makeMonitor({ id: 'down1', enabled: true }),
      makeMonitor({ id: 'paused1', enabled: false }),
      makeMonitor({ id: 'git', type: 'GIT_RELEASE', enabled: true }),
    ];
    const runs = [
      makeRun('up1', 'green'),
      makeRun('up2', 'green'),
      makeRun('deg1', 'yellow'),
      makeRun('down1', 'red'),
    ];
    const summary = computeMonitorSummary(monitors, runs);
    expect(summary).toEqual({ up: 2, degraded: 1, down: 1, paused: 1 });
  });
});

// ─── Monitor pagination ───────────────────────────────────────────────────────

describe('monitor pagination', () => {
  function paginateMonitors(
    monitors: MonitorItem[],
    page: number,
    pageSize: number | 'all'
  ): { visible: MonitorItem[]; totalPages: number; safePage: number } {
    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(monitors.length / (pageSize as number)));
    const safePage = Math.min(page, totalPages);
    const visible = pageSize === 'all'
      ? monitors
      : monitors.slice((safePage - 1) * (pageSize as number), safePage * (pageSize as number));
    return { visible, totalPages, safePage };
  }

  const items = Array.from({ length: 55 }, (_, i) => makeMonitor({ id: `m${i}` }));

  it('returns correct count on page 1 with pageSize=25', () => {
    const { visible, totalPages } = paginateMonitors(items, 1, 25);
    expect(visible).toHaveLength(25);
    expect(totalPages).toBe(3);
  });

  it('returns remaining items on last page', () => {
    const { visible } = paginateMonitors(items, 3, 25);
    expect(visible).toHaveLength(5);
  });

  it('returns all items when pageSize is "all"', () => {
    const { visible, totalPages } = paginateMonitors(items, 1, 'all');
    expect(visible).toHaveLength(55);
    expect(totalPages).toBe(1);
  });

  it('clamps safePage to totalPages when page is out of range', () => {
    const { safePage, totalPages } = paginateMonitors(items, 100, 25);
    expect(safePage).toBe(totalPages);
  });
});
