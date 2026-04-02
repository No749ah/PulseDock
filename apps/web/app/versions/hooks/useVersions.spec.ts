/**
 * Unit tests for useVersions.ts pure logic.
 *
 * Tests the sorting, pagination, and computed values that are
 * derived from the hook's state — without React rendering.
 */
import { describe, it, expect } from 'vitest';

// ─── Types (minimal) ─────────────────────────────────────────────────────────

type VersionLevel = 'green' | 'yellow' | 'red';

interface VersionItem {
  id: string;
  name: string;
  type: string;
  target: string;
  currentVersion?: string | null;
  latestMessage?: string | null;
  level: VersionLevel;
  checkedAt?: string | null;
  intervalSec?: number;
}

// ─── Pure helpers (mirrors useVersions computed logic) ────────────────────────

function statusSortKey(level: VersionLevel): number {
  if (level === 'green') return 1;
  if (level === 'yellow') return 2;
  return 0; // red sorts first
}

function sortVersionItems(
  items: VersionItem[],
  sortBy: 'name' | 'status' | 'lastChecked',
  sortDir: 'asc' | 'desc',
): VersionItem[] {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (sortBy === 'name') return dir * a.name.localeCompare(b.name);
    if (sortBy === 'status') return dir * (statusSortKey(a.level) - statusSortKey(b.level));
    if (sortBy === 'lastChecked') {
      const ta = a.checkedAt ? new Date(a.checkedAt).getTime() : 0;
      const tb = b.checkedAt ? new Date(b.checkedAt).getTime() : 0;
      return dir * (ta - tb);
    }
    return 0;
  });
}

function paginate(items: VersionItem[], page: number, pageSize: number) {
  const total = items.length;
  const size = pageSize;
  const pages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, pages);
  const visible = items.slice((safePage - 1) * size, safePage * size);
  return { total, size, pages, safePage, visible };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<VersionItem> = {}): VersionItem {
  return {
    id: 'v-1',
    name: 'test-tool',
    type: 'GIT_RELEASE',
    target: 'org/repo',
    currentVersion: '1.0.0',
    latestMessage: 'Up to date',
    level: 'green',
    checkedAt: '2026-04-01T10:00:00Z',
    intervalSec: 3600,
    ...overrides,
  };
}

const sampleItems: VersionItem[] = [
  makeItem({ id: '1', name: 'Bravo', level: 'yellow', checkedAt: '2026-04-01T12:00:00Z' }),
  makeItem({ id: '2', name: 'Alpha', level: 'red', checkedAt: '2026-04-02T08:00:00Z' }),
  makeItem({ id: '3', name: 'Charlie', level: 'green', checkedAt: '2026-03-30T06:00:00Z' }),
  makeItem({ id: '4', name: 'Delta', level: 'green', checkedAt: null }),
];

// ─── statusSortKey ────────────────────────────────────────────────────────────

describe('useVersions — statusSortKey', () => {
  it('red → 0 (sorts first ascending)', () => {
    expect(statusSortKey('red')).toBe(0);
  });
  it('green → 1', () => {
    expect(statusSortKey('green')).toBe(1);
  });
  it('yellow → 2 (sorts last ascending)', () => {
    expect(statusSortKey('yellow')).toBe(2);
  });
});

// ─── sortVersionItems — by name ────────────────────────────────────────────────

describe('useVersions — sortVersionItems by name', () => {
  it('sorts names ascending', () => {
    const sorted = sortVersionItems(sampleItems, 'name', 'asc');
    expect(sorted.map((i) => i.name)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });

  it('sorts names descending', () => {
    const sorted = sortVersionItems(sampleItems, 'name', 'desc');
    expect(sorted.map((i) => i.name)).toEqual(['Delta', 'Charlie', 'Bravo', 'Alpha']);
  });

  it('does not mutate original array', () => {
    const original = sampleItems.map((i) => i.id);
    sortVersionItems(sampleItems, 'name', 'asc');
    expect(sampleItems.map((i) => i.id)).toEqual(original);
  });
});

// ─── sortVersionItems — by status ─────────────────────────────────────────────

describe('useVersions — sortVersionItems by status', () => {
  it('ascending: red (0) < green (1) < yellow (2)', () => {
    const sorted = sortVersionItems(sampleItems, 'status', 'asc');
    expect(sorted[0].level).toBe('red');
    // green and yellow follow; both greens share key 1 so order is stable within key
    const levels = sorted.map((i) => i.level);
    expect(levels.indexOf('red')).toBe(0);
    expect(levels.indexOf('yellow')).toBeGreaterThan(levels.indexOf('green'));
  });

  it('descending: yellow (2) > green (1) > red (0)', () => {
    const sorted = sortVersionItems(sampleItems, 'status', 'desc');
    expect(sorted[0].level).toBe('yellow');
    expect(sorted[sorted.length - 1].level).toBe('red');
  });

  it('all same level — order matches position', () => {
    const items = [
      makeItem({ id: '1', name: 'A', level: 'green' }),
      makeItem({ id: '2', name: 'B', level: 'green' }),
    ];
    const sorted = sortVersionItems(items, 'status', 'asc');
    // statusSortKey equal → diff = 0, stable order preserved
    expect(sorted.map((i) => i.id)).toEqual(['1', '2']);
  });
});

// ─── sortVersionItems — by lastChecked ────────────────────────────────────────

describe('useVersions — sortVersionItems by lastChecked', () => {
  it('ascending: earliest checkedAt first', () => {
    const sorted = sortVersionItems(sampleItems, 'lastChecked', 'asc');
    // null checkedAt → 0 (oldest)
    expect(sorted[0].id).toBe('4'); // null → 0
    expect(sorted[1].checkedAt).toBe('2026-03-30T06:00:00Z');
    expect(sorted[3].checkedAt).toBe('2026-04-02T08:00:00Z');
  });

  it('descending: most recent checkedAt first', () => {
    const sorted = sortVersionItems(sampleItems, 'lastChecked', 'desc');
    expect(sorted[0].checkedAt).toBe('2026-04-02T08:00:00Z');
    expect(sorted[sorted.length - 1].id).toBe('4'); // null → 0 → last when desc
  });

  it('null checkedAt is treated as timestamp 0', () => {
    const items = [
      makeItem({ id: '1', checkedAt: '2026-01-01T00:00:00Z' }),
      makeItem({ id: '2', checkedAt: null }),
    ];
    const sorted = sortVersionItems(items, 'lastChecked', 'asc');
    expect(sorted[0].id).toBe('2'); // 0 < timestamp
  });
});

// ─── paginate ─────────────────────────────────────────────────────────────────

describe('useVersions — paginate', () => {
  const items = Array.from({ length: 15 }, (_, i) =>
    makeItem({ id: `v-${i}`, name: `tool-${i}` }),
  );

  it('pageCount is 1 for empty list', () => {
    const { pages } = paginate([], 1, 10);
    expect(pages).toBe(1);
  });

  it('calculates pages correctly for exact multiple', () => {
    const { pages } = paginate(items.slice(0, 10), 1, 5);
    expect(pages).toBe(2);
  });

  it('rounds up pages for partial last page', () => {
    const { pages } = paginate(items, 1, 10); // 15 items / 10 per page = 2 pages
    expect(pages).toBe(2);
  });

  it('first page returns first N items', () => {
    const { visible } = paginate(items, 1, 5);
    expect(visible).toHaveLength(5);
    expect(visible[0].id).toBe('v-0');
  });

  it('second page returns next N items', () => {
    const { visible } = paginate(items, 2, 5);
    expect(visible[0].id).toBe('v-5');
    expect(visible).toHaveLength(5);
  });

  it('last page returns remaining items', () => {
    const { visible } = paginate(items, 2, 10); // 15 items: page 2 has 5
    expect(visible).toHaveLength(5);
    expect(visible[0].id).toBe('v-10');
  });

  it('clamps safePage to pages when page exceeds total', () => {
    const { safePage, visible } = paginate(items, 99, 10);
    expect(safePage).toBe(2);
    expect(visible[0].id).toBe('v-10');
  });

  it('total reflects full item count', () => {
    const { total } = paginate(items, 1, 5);
    expect(total).toBe(15);
  });

  it('visible is empty for empty list', () => {
    const { visible } = paginate([], 1, 10);
    expect(visible).toHaveLength(0);
  });

  it('size matches requested pageSize', () => {
    const { size } = paginate(items, 1, 7);
    expect(size).toBe(7);
  });
});

// ─── combined pipeline ────────────────────────────────────────────────────────

describe('useVersions — combined sort + paginate', () => {
  it('sort by name asc then paginate', () => {
    const sorted = sortVersionItems(sampleItems, 'name', 'asc');
    const { visible, pages } = paginate(sorted, 1, 2);
    expect(pages).toBe(2);
    expect(visible.map((i) => i.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('sort by name asc page 2', () => {
    const sorted = sortVersionItems(sampleItems, 'name', 'asc');
    const { visible } = paginate(sorted, 2, 2);
    expect(visible.map((i) => i.name)).toEqual(['Charlie', 'Delta']);
  });

  it('sort by status desc then paginate preserves sort', () => {
    const sorted = sortVersionItems(sampleItems, 'status', 'desc');
    const { visible } = paginate(sorted, 1, 4);
    // desc: yellow=2 > green=1 > red=0
    expect(visible[0].level).toBe('yellow');
    expect(visible[visible.length - 1].level).toBe('red');
  });

  it('single item list paginates to 1 page', () => {
    const { pages, visible } = paginate([sampleItems[0]], 1, 10);
    expect(pages).toBe(1);
    expect(visible).toHaveLength(1);
  });
});

// ─── edge cases ───────────────────────────────────────────────────────────────

describe('useVersions — edge cases', () => {
  it('sortVersionItems returns empty array for empty input', () => {
    expect(sortVersionItems([], 'name', 'asc')).toHaveLength(0);
  });

  it('single item sort returns same item', () => {
    const item = makeItem({ id: 'solo', name: 'Solo Tool' });
    expect(sortVersionItems([item], 'name', 'asc')[0].id).toBe('solo');
  });

  it('items with same name maintain stable relative order (by array position)', () => {
    const items = [
      makeItem({ id: 'a', name: 'same' }),
      makeItem({ id: 'b', name: 'same' }),
    ];
    const sorted = sortVersionItems(items, 'name', 'asc');
    // localeCompare returns 0 → no swap
    expect(sorted[0].id).toBe('a');
    expect(sorted[1].id).toBe('b');
  });
});
