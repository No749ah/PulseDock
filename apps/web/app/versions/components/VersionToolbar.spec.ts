/**
 * Unit tests for VersionToolbar pure logic.
 * Tests COL_DEFS, sort option parsing, stats computation display helpers.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

const COL_DEFS: [string, string][] = [
  ['name', 'Name'], ['type', 'Type'], ['target', 'Target'], ['current', 'Current'],
  ['latest', 'Latest'], ['status', 'Status'], ['lastChecked', 'Last Checked'],
  ['interval', 'Interval'], ['action', 'Action'],
];

function parseSortOption(value: string): { sortBy: string; sortDir: string } {
  const [col, dir] = value.split('-') as [string, string];
  return { sortBy: col, sortDir: dir };
}

type Stats = { total: number; green: number; yellow: number; red: number };

function computeUpdatesAvailable(stats: Stats): number {
  return (stats.yellow ?? 0) + (stats.red ?? 0);
}

function updatesAvailableClass(stats: Stats): string {
  return computeUpdatesAvailable(stats) > 0 ? 'text-warning' : 'text-text-primary';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('VersionToolbar — COL_DEFS', () => {
  it('has 9 column definitions', () => {
    expect(COL_DEFS).toHaveLength(9);
  });

  it('each column has a non-empty key and label', () => {
    COL_DEFS.forEach(([key, label]) => {
      expect(key.length).toBeGreaterThan(0);
      expect(label.length).toBeGreaterThan(0);
    });
  });

  it('contains required columns', () => {
    const keys = COL_DEFS.map(([k]) => k);
    expect(keys).toContain('name');
    expect(keys).toContain('status');
    expect(keys).toContain('action');
    expect(keys).toContain('lastChecked');
  });

  it('column keys are unique', () => {
    const keys = COL_DEFS.map(([k]) => k);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('name is first column', () => {
    expect(COL_DEFS[0][0]).toBe('name');
  });

  it('action is last column', () => {
    expect(COL_DEFS[COL_DEFS.length - 1][0]).toBe('action');
  });
});

describe('VersionToolbar — parseSortOption', () => {
  it('parses name-asc correctly', () => {
    expect(parseSortOption('name-asc')).toEqual({ sortBy: 'name', sortDir: 'asc' });
  });

  it('parses name-desc correctly', () => {
    expect(parseSortOption('name-desc')).toEqual({ sortBy: 'name', sortDir: 'desc' });
  });

  it('parses status-asc correctly', () => {
    expect(parseSortOption('status-asc')).toEqual({ sortBy: 'status', sortDir: 'asc' });
  });

  it('parses lastChecked-desc correctly', () => {
    expect(parseSortOption('lastChecked-desc')).toEqual({ sortBy: 'lastChecked', sortDir: 'desc' });
  });

  it('parses lastChecked-asc correctly', () => {
    expect(parseSortOption('lastChecked-asc')).toEqual({ sortBy: 'lastChecked', sortDir: 'asc' });
  });
});

describe('VersionToolbar — computeUpdatesAvailable', () => {
  it('sums yellow + red', () => {
    expect(computeUpdatesAvailable({ total: 10, green: 5, yellow: 3, red: 2 })).toBe(5);
  });

  it('returns 0 when all green', () => {
    expect(computeUpdatesAvailable({ total: 5, green: 5, yellow: 0, red: 0 })).toBe(0);
  });

  it('counts only yellow', () => {
    expect(computeUpdatesAvailable({ total: 4, green: 2, yellow: 2, red: 0 })).toBe(2);
  });

  it('counts only red', () => {
    expect(computeUpdatesAvailable({ total: 3, green: 2, yellow: 0, red: 1 })).toBe(1);
  });
});

describe('VersionToolbar — updatesAvailableClass', () => {
  it('returns warning class when updates exist', () => {
    expect(updatesAvailableClass({ total: 5, green: 3, yellow: 1, red: 1 })).toBe('text-warning');
  });

  it('returns primary class when no updates', () => {
    expect(updatesAvailableClass({ total: 5, green: 5, yellow: 0, red: 0 })).toBe('text-text-primary');
  });

  it('returns warning for red-only updates', () => {
    expect(updatesAvailableClass({ total: 2, green: 1, yellow: 0, red: 1 })).toBe('text-warning');
  });

  it('returns warning for yellow-only updates', () => {
    expect(updatesAvailableClass({ total: 2, green: 1, yellow: 1, red: 0 })).toBe('text-warning');
  });
});
