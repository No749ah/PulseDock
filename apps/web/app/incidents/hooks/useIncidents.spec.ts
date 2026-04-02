/**
 * Unit tests for useIncidents.ts pure logic.
 *
 * Re-implements the derived-state helpers from the hook without
 * React rendering, to test filtering, sorting, pagination, and
 * the "resolved this month" counter in isolation.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// ─── Types ────────────────────────────────────────────────────────────────────

type IncidentStatus = 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface Incident {
  id: string;
  title: string;
  description: string | null;
  status: IncidentStatus;
  severity: IncidentSeverity;
  autoCreated: boolean;
  resolvedAt: string | null;
  rootCause: string | null;
  postmortemNotes: string | null;
  createdAt: string;
  updatedAt: string;
  updates: Array<{ id: string; body: string; status: IncidentStatus; createdAt: string }>;
  monitors: Array<{ monitor: { id: string; name: string; type: string } }>;
}

// ─── Pure helpers (mirrors useIncidents derived-state logic) ──────────────────

type SortDir = 'asc' | 'desc';
interface SortState { key: 'title' | 'status' | 'severity' | 'updatedAt' | null; dir: SortDir }

/** Sort incidents — mirrors the hook's incidentSorted() behaviour */
function sortIncidents(
  incidents: Incident[],
  sort: SortState,
): Incident[] {
  if (!sort.key) return incidents;
  return [...incidents].sort((a, b) => {
    const av = sort.key === 'title' ? a.title
      : sort.key === 'status' ? a.status
      : sort.key === 'severity' ? a.severity
      : a.updatedAt;
    const bv = sort.key === 'title' ? b.title
      : sort.key === 'status' ? b.status
      : sort.key === 'severity' ? b.severity
      : b.updatedAt;
    const cmp = String(av).localeCompare(String(bv));
    return sort.dir === 'asc' ? cmp : -cmp;
  });
}

/** Filter incidents by search query (mirrors hook logic) */
function filterByQuery(incidents: Incident[], query: string): Incident[] {
  if (!query.trim()) return incidents;
  const q = query.toLowerCase();
  return incidents.filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      i.status.toLowerCase().includes(q) ||
      i.severity.toLowerCase().includes(q),
  );
}

/** Split into active vs resolved (mirrors hook) */
function splitIncidents(incidents: Incident[]) {
  return {
    active: incidents.filter((i) => i.status !== 'RESOLVED'),
    resolved: incidents.filter((i) => i.status === 'RESOLVED'),
  };
}

/** Paginate resolved incidents (mirrors hook) */
function paginateResolved(resolved: Incident[], page: number, pageSize: number) {
  const count = Math.max(1, Math.ceil(resolved.length / pageSize));
  const safe = Math.min(page, count);
  const slice = resolved.slice((safe - 1) * pageSize, safe * pageSize);
  return { pageCount: count, safePage: safe, slice };
}

/** Count incidents resolved this calendar month (mirrors hook) */
function resolvedThisMonth(resolved: Incident[], now: Date): Incident[] {
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return resolved.filter(
    (i) => new Date(i.updatedAt).getTime() >= startOfMonth.getTime(),
  );
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'inc-1',
    title: 'Test Incident',
    description: null,
    status: 'INVESTIGATING',
    severity: 'MEDIUM',
    autoCreated: false,
    resolvedAt: null,
    rootCause: null,
    postmortemNotes: null,
    createdAt: '2026-04-01T10:00:00Z',
    updatedAt: '2026-04-01T10:00:00Z',
    updates: [],
    monitors: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useIncidents — filterByQuery', () => {
  const incidents = [
    makeIncident({ id: '1', title: 'API down', status: 'INVESTIGATING', severity: 'HIGH' }),
    makeIncident({ id: '2', title: 'Slow DB', status: 'RESOLVED', severity: 'LOW' }),
    makeIncident({ id: '3', title: 'Network issue', status: 'MONITORING', severity: 'CRITICAL' }),
  ];

  it('returns all incidents when query is empty', () => {
    expect(filterByQuery(incidents, '')).toHaveLength(3);
  });

  it('returns all incidents when query is whitespace only', () => {
    expect(filterByQuery(incidents, '   ')).toHaveLength(3);
  });

  it('filters by title (case-insensitive)', () => {
    const result = filterByQuery(incidents, 'api');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by status (case-insensitive)', () => {
    const result = filterByQuery(incidents, 'resolved');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('filters by severity (case-insensitive)', () => {
    const result = filterByQuery(incidents, 'critical');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('returns multiple matches when query matches several incidents', () => {
    // 'low' matches severity LOW (id 2); 'network' matches title (id 3)
    const result = filterByQuery(incidents, 'o'); // 'o' appears in resolved, monitoring, low, network
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty array when no match', () => {
    expect(filterByQuery(incidents, 'xyzzy')).toHaveLength(0);
  });
});

describe('useIncidents — sortIncidents', () => {
  const incidents = [
    makeIncident({ id: '1', title: 'Bravo', status: 'RESOLVED', severity: 'HIGH', updatedAt: '2026-04-01T12:00:00Z' }),
    makeIncident({ id: '2', title: 'Alpha', status: 'INVESTIGATING', severity: 'LOW', updatedAt: '2026-04-02T08:00:00Z' }),
    makeIncident({ id: '3', title: 'Charlie', status: 'MONITORING', severity: 'CRITICAL', updatedAt: '2026-03-30T06:00:00Z' }),
  ];

  it('sorts by title ascending', () => {
    const sorted = sortIncidents(incidents, { key: 'title', dir: 'asc' });
    expect(sorted.map((i) => i.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('sorts by title descending', () => {
    const sorted = sortIncidents(incidents, { key: 'title', dir: 'desc' });
    expect(sorted.map((i) => i.title)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('sorts by status ascending (alphabetical)', () => {
    const sorted = sortIncidents(incidents, { key: 'status', dir: 'asc' });
    // INVESTIGATING < MONITORING < RESOLVED
    expect(sorted[0].status).toBe('INVESTIGATING');
    expect(sorted[2].status).toBe('RESOLVED');
  });

  it('sorts by severity ascending (alphabetical)', () => {
    const sorted = sortIncidents(incidents, { key: 'severity', dir: 'asc' });
    // CRITICAL < HIGH < LOW
    expect(sorted[0].severity).toBe('CRITICAL');
    expect(sorted[2].severity).toBe('LOW');
  });

  it('sorts by updatedAt ascending (ISO string compare)', () => {
    const sorted = sortIncidents(incidents, { key: 'updatedAt', dir: 'asc' });
    expect(sorted[0].updatedAt).toBe('2026-03-30T06:00:00Z');
    expect(sorted[2].updatedAt).toBe('2026-04-02T08:00:00Z');
  });

  it('sorts by updatedAt descending', () => {
    const sorted = sortIncidents(incidents, { key: 'updatedAt', dir: 'desc' });
    expect(sorted[0].updatedAt).toBe('2026-04-02T08:00:00Z');
  });

  it('returns original order when sort.key is null', () => {
    const sorted = sortIncidents(incidents, { key: null, dir: 'asc' });
    expect(sorted.map((i) => i.id)).toEqual(['1', '2', '3']);
  });

  it('does not mutate original array', () => {
    const original = [...incidents];
    sortIncidents(incidents, { key: 'title', dir: 'asc' });
    expect(incidents.map((i) => i.id)).toEqual(original.map((i) => i.id));
  });
});

describe('useIncidents — splitIncidents', () => {
  it('puts INVESTIGATING into active', () => {
    const { active, resolved } = splitIncidents([
      makeIncident({ status: 'INVESTIGATING' }),
    ]);
    expect(active).toHaveLength(1);
    expect(resolved).toHaveLength(0);
  });

  it('puts IDENTIFIED into active', () => {
    const { active } = splitIncidents([makeIncident({ status: 'IDENTIFIED' })]);
    expect(active).toHaveLength(1);
  });

  it('puts MONITORING into active', () => {
    const { active } = splitIncidents([makeIncident({ status: 'MONITORING' })]);
    expect(active).toHaveLength(1);
  });

  it('puts RESOLVED into resolved', () => {
    const { active, resolved } = splitIncidents([
      makeIncident({ status: 'RESOLVED' }),
    ]);
    expect(active).toHaveLength(0);
    expect(resolved).toHaveLength(1);
  });

  it('correctly splits a mixed list', () => {
    const list = [
      makeIncident({ id: '1', status: 'INVESTIGATING' }),
      makeIncident({ id: '2', status: 'RESOLVED' }),
      makeIncident({ id: '3', status: 'MONITORING' }),
      makeIncident({ id: '4', status: 'RESOLVED' }),
    ];
    const { active, resolved } = splitIncidents(list);
    expect(active).toHaveLength(2);
    expect(resolved).toHaveLength(2);
  });

  it('handles empty list', () => {
    const { active, resolved } = splitIncidents([]);
    expect(active).toHaveLength(0);
    expect(resolved).toHaveLength(0);
  });
});

describe('useIncidents — paginateResolved', () => {
  const ten = Array.from({ length: 10 }, (_, i) =>
    makeIncident({ id: `inc-${i}`, status: 'RESOLVED' }),
  );

  it('returns pageCount=1 for empty list', () => {
    const { pageCount } = paginateResolved([], 1, 10);
    expect(pageCount).toBe(1);
  });

  it('returns correct pageCount for exact multiple', () => {
    const { pageCount } = paginateResolved(ten, 1, 5);
    expect(pageCount).toBe(2);
  });

  it('rounds up pageCount for partial last page', () => {
    const { pageCount } = paginateResolved(ten, 1, 3);
    expect(pageCount).toBe(4); // 10 / 3 = 3.33 → 4
  });

  it('returns correct slice for page 1', () => {
    const { slice } = paginateResolved(ten, 1, 5);
    expect(slice).toHaveLength(5);
    expect(slice[0].id).toBe('inc-0');
  });

  it('returns correct slice for page 2', () => {
    const { slice } = paginateResolved(ten, 2, 5);
    expect(slice[0].id).toBe('inc-5');
    expect(slice).toHaveLength(5);
  });

  it('clamps safePage to pageCount when page exceeds total', () => {
    const { safePage, slice } = paginateResolved(ten, 99, 5);
    expect(safePage).toBe(2);
    expect(slice[0].id).toBe('inc-5');
  });

  it('safePage for empty list is 1', () => {
    const { safePage } = paginateResolved([], 3, 10);
    expect(safePage).toBe(1);
  });

  it('returns partial slice for last page', () => {
    const { slice } = paginateResolved(ten, 4, 3); // pages: [0-2][3-5][6-8][9]
    expect(slice).toHaveLength(1);
    expect(slice[0].id).toBe('inc-9');
  });
});

describe('useIncidents — resolvedThisMonth', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts incidents updated in current month', () => {
    const now = new Date('2026-04-15T12:00:00Z');
    const incidents = [
      makeIncident({ id: '1', status: 'RESOLVED', updatedAt: '2026-04-01T00:00:00Z' }),
      makeIncident({ id: '2', status: 'RESOLVED', updatedAt: '2026-04-10T00:00:00Z' }),
      makeIncident({ id: '3', status: 'RESOLVED', updatedAt: '2026-03-31T23:59:59Z' }), // previous month
    ];
    const result = resolvedThisMonth(incidents, now);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toContain('1');
    expect(result.map((i) => i.id)).toContain('2');
  });

  it('excludes incidents from previous months', () => {
    const now = new Date('2026-04-01T00:00:00Z');
    const incidents = [
      makeIncident({ id: '1', status: 'RESOLVED', updatedAt: '2026-03-31T23:59:59Z' }),
    ];
    expect(resolvedThisMonth(incidents, now)).toHaveLength(0);
  });

  it('includes incidents from the very start of the month', () => {
    const now = new Date('2026-04-15T00:00:00Z');
    const incidents = [
      makeIncident({ id: '1', status: 'RESOLVED', updatedAt: '2026-04-01T00:00:00Z' }),
    ];
    expect(resolvedThisMonth(incidents, now)).toHaveLength(1);
  });

  it('returns empty for empty input', () => {
    expect(resolvedThisMonth([], new Date())).toHaveLength(0);
  });

  it('returns all when all are resolved in current month', () => {
    const now = new Date('2026-04-15T00:00:00Z');
    const incidents = [
      makeIncident({ id: '1', status: 'RESOLVED', updatedAt: '2026-04-02T00:00:00Z' }),
      makeIncident({ id: '2', status: 'RESOLVED', updatedAt: '2026-04-14T00:00:00Z' }),
    ];
    expect(resolvedThisMonth(incidents, now)).toHaveLength(2);
  });
});

describe('useIncidents — combined pipeline', () => {
  const incidents = [
    makeIncident({ id: '1', title: 'API down', status: 'INVESTIGATING', severity: 'HIGH', updatedAt: '2026-04-01T08:00:00Z' }),
    makeIncident({ id: '2', title: 'DB issue', status: 'RESOLVED', severity: 'CRITICAL', updatedAt: '2026-04-02T09:00:00Z' }),
    makeIncident({ id: '3', title: 'API timeout', status: 'RESOLVED', severity: 'MEDIUM', updatedAt: '2026-04-03T10:00:00Z' }),
    makeIncident({ id: '4', title: 'Cert expired', status: 'MONITORING', severity: 'LOW', updatedAt: '2026-04-04T11:00:00Z' }),
  ];

  it('full pipeline: filter → sort → split → paginate', () => {
    const filtered = filterByQuery(incidents, 'api');         // ids 1, 3
    const sorted = sortIncidents(filtered, { key: 'title', dir: 'asc' }); // [3, 1]
    const { active, resolved } = splitIncidents(sorted);
    // 'API down' is INVESTIGATING (active), 'API timeout' is RESOLVED
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('1');
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe('3');
    const { pageCount, slice } = paginateResolved(resolved, 1, 10);
    expect(pageCount).toBe(1);
    expect(slice).toHaveLength(1);
  });

  it('empty query returns all, split gives correct counts', () => {
    const filtered = filterByQuery(incidents, '');
    const { active, resolved } = splitIncidents(filtered);
    expect(active).toHaveLength(2); // INVESTIGATING + MONITORING
    expect(resolved).toHaveLength(2);
  });
});
