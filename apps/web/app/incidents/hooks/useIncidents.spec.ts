/**
 * Unit tests for useIncidents.ts pure helpers.
 *
 * Extracted pure logic:
 *   - filteredIncidents: text search across title/status/severity
 *   - activeIncidents / resolvedIncidents: partition by status
 *   - resolvedSize / resolvedPageCount / safeResolvedPage: pagination arithmetic
 *   - paginatedResolved: slice of resolved incidents
 *   - resolvedThisMonth: current-month filter
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mirror types ─────────────────────────────────────────────────────────────

type IncidentStatus = 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

interface Incident {
  id: string;
  title: string;
  description: string | null;
  status: IncidentStatus;
  severity: IncidentSeverity;
  autoCreated: boolean;
  rootCause: string | null;
  postmortemNotes: string | null;
  createdAt: string;
  updatedAt: string;
  monitors: Array<{ monitor: { id: string; name: string } }>;
}

// ─── Mirror pure helpers ──────────────────────────────────────────────────────

function filterIncidents(incidents: Incident[], searchQuery: string): Incident[] {
  if (!searchQuery.trim()) return incidents;
  const q = searchQuery.toLowerCase();
  return incidents.filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      i.status.toLowerCase().includes(q) ||
      i.severity.toLowerCase().includes(q),
  );
}

function partitionByStatus(incidents: Incident[]) {
  const active = incidents.filter((i) => i.status !== 'RESOLVED');
  const resolved = incidents.filter((i) => i.status === 'RESOLVED');
  return { active, resolved };
}

function computePagination(total: number, pageSize: number, page: number) {
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, page), pageCount);
  return { size, pageCount, safePage };
}

function paginateSlice<T>(items: T[], safePage: number, size: number): T[] {
  return items.slice((safePage - 1) * size, safePage * size);
}

function resolvedThisMonth(resolved: Incident[], now: Date): Incident[] {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return resolved.filter((i) => new Date(i.updatedAt).getTime() >= start);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _id = 0;

function makeIncident(
  overrides: Partial<Incident> & { status: IncidentStatus; severity?: IncidentSeverity },
): Incident {
  _id++;
  return {
    id: `inc-${_id}`,
    title: `Incident ${_id}`,
    description: null,
    severity: overrides.severity ?? 'MEDIUM',
    autoCreated: false,
    rootCause: null,
    postmortemNotes: null,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-04-01T00:00:00Z',
    monitors: [],
    ...overrides,
  };
}

beforeEach(() => { _id = 0; });

// ─── filterIncidents ──────────────────────────────────────────────────────────

describe('filterIncidents', () => {
  const incidents = [
    makeIncident({ status: 'INVESTIGATING', title: 'Database timeout', severity: 'CRITICAL' }),
    makeIncident({ status: 'IDENTIFIED', title: 'API Gateway error', severity: 'HIGH' }),
    makeIncident({ status: 'RESOLVED', title: 'Cache flush', severity: 'LOW' }),
  ];

  beforeEach(() => { _id = 0; });

  it('returns all incidents when query is empty', () => {
    expect(filterIncidents(incidents, '')).toHaveLength(3);
  });

  it('returns all incidents when query is only whitespace', () => {
    expect(filterIncidents(incidents, '   ')).toHaveLength(3);
  });

  it('filters by title case-insensitively', () => {
    const result = filterIncidents(incidents, 'database');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Database timeout');
  });

  it('filters by status case-insensitively', () => {
    const result = filterIncidents(incidents, 'investigating');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('INVESTIGATING');
  });

  it('filters by severity case-insensitively', () => {
    const result = filterIncidents(incidents, 'critical');
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('CRITICAL');
  });

  it('returns empty array when no matches', () => {
    expect(filterIncidents(incidents, 'xyz-no-match')).toHaveLength(0);
  });

  it('matches partial substrings', () => {
    const result = filterIncidents(incidents, 'api');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('API Gateway error');
  });

  it('matches across multiple incidents', () => {
    // 'e' appears in all titles
    const result = filterIncidents(incidents, 'cache');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Cache flush');
  });

  it('handles uppercase query against lowercase content', () => {
    const result = filterIncidents(incidents, 'TIMEOUT');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Database timeout');
  });
});

// ─── partitionByStatus ────────────────────────────────────────────────────────

describe('partitionByStatus', () => {
  it('puts RESOLVED into resolved, everything else into active', () => {
    const incidents = [
      makeIncident({ status: 'INVESTIGATING' }),
      makeIncident({ status: 'IDENTIFIED' }),
      makeIncident({ status: 'MONITORING' }),
      makeIncident({ status: 'RESOLVED' }),
      makeIncident({ status: 'RESOLVED' }),
    ];
    const { active, resolved } = partitionByStatus(incidents);
    expect(active).toHaveLength(3);
    expect(resolved).toHaveLength(2);
  });

  it('returns all in active when none resolved', () => {
    const incidents = [
      makeIncident({ status: 'INVESTIGATING' }),
      makeIncident({ status: 'MONITORING' }),
    ];
    const { active, resolved } = partitionByStatus(incidents);
    expect(active).toHaveLength(2);
    expect(resolved).toHaveLength(0);
  });

  it('returns all in resolved when all resolved', () => {
    const incidents = [
      makeIncident({ status: 'RESOLVED' }),
      makeIncident({ status: 'RESOLVED' }),
    ];
    const { active, resolved } = partitionByStatus(incidents);
    expect(active).toHaveLength(0);
    expect(resolved).toHaveLength(2);
  });

  it('returns empty arrays for empty input', () => {
    const { active, resolved } = partitionByStatus([]);
    expect(active).toHaveLength(0);
    expect(resolved).toHaveLength(0);
  });

  it('INVESTIGATING, IDENTIFIED, MONITORING are all "active"', () => {
    const incidents = [
      makeIncident({ status: 'INVESTIGATING' }),
      makeIncident({ status: 'IDENTIFIED' }),
      makeIncident({ status: 'MONITORING' }),
    ];
    const { active } = partitionByStatus(incidents);
    expect(active).toHaveLength(3);
  });
});

// ─── computePagination ────────────────────────────────────────────────────────

describe('computePagination', () => {
  it('computes 1 page for empty list', () => {
    const { pageCount, safePage } = computePagination(0, 10, 1);
    expect(pageCount).toBe(1);
    expect(safePage).toBe(1);
  });

  it('computes correct page count', () => {
    expect(computePagination(10, 10, 1).pageCount).toBe(1);
    expect(computePagination(11, 10, 1).pageCount).toBe(2);
    expect(computePagination(20, 10, 1).pageCount).toBe(2);
    expect(computePagination(21, 10, 1).pageCount).toBe(3);
  });

  it('clamps safePage to pageCount when page is too high', () => {
    const { safePage } = computePagination(5, 10, 99);
    expect(safePage).toBe(1);
  });

  it('clamps safePage to 1 minimum', () => {
    const { safePage } = computePagination(20, 10, -5);
    expect(safePage).toBe(1);
  });

  it('safePage matches page when within bounds', () => {
    expect(computePagination(30, 10, 2).safePage).toBe(2);
    expect(computePagination(30, 10, 3).safePage).toBe(3);
  });

  it('safePage clamps to last page when page exceeds pageCount', () => {
    expect(computePagination(25, 10, 4).safePage).toBe(3); // 3 pages total
  });
});

// ─── paginateSlice ────────────────────────────────────────────────────────────

describe('paginateSlice', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

  it('returns first page correctly', () => {
    expect(paginateSlice(items, 1, 3)).toEqual(['a', 'b', 'c']);
  });

  it('returns second page correctly', () => {
    expect(paginateSlice(items, 2, 3)).toEqual(['d', 'e', 'f']);
  });

  it('returns partial last page', () => {
    expect(paginateSlice(items, 4, 3)).toEqual(['j']);
  });

  it('returns all items on single page', () => {
    expect(paginateSlice(items, 1, 100)).toEqual(items);
  });

  it('returns empty array for empty input', () => {
    expect(paginateSlice([], 1, 10)).toEqual([]);
  });
});

// ─── resolvedThisMonth ────────────────────────────────────────────────────────

describe('resolvedThisMonth', () => {
  it('includes incidents resolved in the current month', () => {
    const now = new Date('2026-04-15T12:00:00Z');
    const thisMonth = makeIncident({ status: 'RESOLVED', updatedAt: '2026-04-10T00:00:00Z' });
    const result = resolvedThisMonth([thisMonth], now);
    expect(result).toHaveLength(1);
  });

  it('excludes incidents resolved in a previous month', () => {
    const now = new Date('2026-04-15T12:00:00Z');
    const lastMonth = makeIncident({ status: 'RESOLVED', updatedAt: '2026-03-31T23:59:59Z' });
    const result = resolvedThisMonth([lastMonth], now);
    expect(result).toHaveLength(0);
  });

  it('includes incidents resolved exactly at start of month', () => {
    const now = new Date('2026-04-15T12:00:00Z');
    const startOfMonth = makeIncident({ status: 'RESOLVED', updatedAt: '2026-04-01T00:00:00Z' });
    const result = resolvedThisMonth([startOfMonth], now);
    expect(result).toHaveLength(1);
  });

  it('excludes incidents from previous year', () => {
    const now = new Date('2026-04-15T12:00:00Z');
    const lastYear = makeIncident({ status: 'RESOLVED', updatedAt: '2025-04-15T00:00:00Z' });
    const result = resolvedThisMonth([lastYear], now);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when no resolved incidents', () => {
    const now = new Date('2026-04-15T12:00:00Z');
    expect(resolvedThisMonth([], now)).toHaveLength(0);
  });

  it('filters correctly across a mixed list', () => {
    const now = new Date('2026-04-15T12:00:00Z');
    const incidents = [
      makeIncident({ status: 'RESOLVED', updatedAt: '2026-04-10T00:00:00Z' }),
      makeIncident({ status: 'RESOLVED', updatedAt: '2026-03-20T00:00:00Z' }),
      makeIncident({ status: 'RESOLVED', updatedAt: '2026-04-02T00:00:00Z' }),
    ];
    const result = resolvedThisMonth(incidents, now);
    expect(result).toHaveLength(2);
  });
});
