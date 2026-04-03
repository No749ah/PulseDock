/**
 * Unit tests for useVersions.ts pure helpers.
 *
 * Extracted pure logic:
 *   - statusSortKey: priority ordering for sort (green=1, yellow=2, red=0)
 *   - pagination: total/size/pages/safePage arithmetic
 *   - sortedItems: sort by name, status, lastChecked in both directions
 *   - visible: pagination slice of sortedItems
 *   - handleVersionSort logic: toggle direction / reset sort
 */
import { describe, it, expect } from 'vitest';

// ─── Mirror types ─────────────────────────────────────────────────────────────

interface VersionItem {
  id: string;
  name: string;
  level: 'green' | 'yellow' | 'red';
  checkedAt: string | null;
  status?: string;
}

// ─── Mirror pure helpers ──────────────────────────────────────────────────────

function statusSortKey(level: 'green' | 'yellow' | 'red'): number {
  if (level === 'green') return 1;
  if (level === 'yellow') return 2;
  return 0; // red
}

function computeVersionPagination(total: number, pageSize: number, page: number) {
  const size = Math.max(1, pageSize);
  const pages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, page), pages);
  return { size, pages, safePage };
}

type SortBy = 'name' | 'status' | 'lastChecked';
type SortDir = 'asc' | 'desc';

function sortItems(items: VersionItem[], sortBy: SortBy, sortDir: SortDir): VersionItem[] {
  return [...items].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
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

function sliceVisible(sortedItems: VersionItem[], safePage: number, size: number): VersionItem[] {
  return sortedItems.slice((safePage - 1) * size, safePage * size);
}

function handleVersionSortLogic(
  currentSortBy: SortBy,
  currentSortDir: SortDir,
  clickedCol: SortBy,
): { sortBy: SortBy; sortDir: SortDir } {
  if (currentSortBy === clickedCol) {
    return { sortBy: currentSortBy, sortDir: currentSortDir === 'asc' ? 'desc' : 'asc' };
  }
  return { sortBy: clickedCol, sortDir: 'asc' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _id = 0;

function makeItem(name: string, level: VersionItem['level'], checkedAt: string | null = null): VersionItem {
  return { id: `v-${++_id}`, name, level, checkedAt };
}

// ─── statusSortKey ────────────────────────────────────────────────────────────

describe('statusSortKey', () => {
  it('green → 1', () => expect(statusSortKey('green')).toBe(1));
  it('yellow → 2', () => expect(statusSortKey('yellow')).toBe(2));
  it('red → 0', () => expect(statusSortKey('red')).toBe(0));

  it('yellow > green (sort value)', () => {
    expect(statusSortKey('yellow')).toBeGreaterThan(statusSortKey('green'));
  });

  it('green > red (sort value)', () => {
    expect(statusSortKey('green')).toBeGreaterThan(statusSortKey('red'));
  });

  it('yellow > red (sort value)', () => {
    expect(statusSortKey('yellow')).toBeGreaterThan(statusSortKey('red'));
  });
});

// ─── computeVersionPagination ─────────────────────────────────────────────────

describe('computeVersionPagination', () => {
  it('returns 1 page minimum for empty list', () => {
    const { pages, safePage } = computeVersionPagination(0, 10, 1);
    expect(pages).toBe(1);
    expect(safePage).toBe(1);
  });

  it('computes exact pages', () => {
    expect(computeVersionPagination(10, 10, 1).pages).toBe(1);
    expect(computeVersionPagination(11, 10, 1).pages).toBe(2);
    expect(computeVersionPagination(20, 10, 1).pages).toBe(2);
    expect(computeVersionPagination(21, 10, 1).pages).toBe(3);
    expect(computeVersionPagination(100, 25, 1).pages).toBe(4);
  });

  it('clamps safePage to last page when page is too high', () => {
    expect(computeVersionPagination(5, 10, 99).safePage).toBe(1);
    expect(computeVersionPagination(25, 10, 5).safePage).toBe(3);
  });

  it('safePage matches page when within bounds', () => {
    expect(computeVersionPagination(30, 10, 2).safePage).toBe(2);
    expect(computeVersionPagination(30, 10, 3).safePage).toBe(3);
  });

  it('returns correct size', () => {
    expect(computeVersionPagination(100, 25, 1).size).toBe(25);
    expect(computeVersionPagination(100, 50, 1).size).toBe(50);
  });
});

// ─── sortItems — by name ──────────────────────────────────────────────────────

describe('sortItems by name', () => {
  const items = [
    makeItem('Zebra', 'green'),
    makeItem('Apple', 'red'),
    makeItem('Mango', 'yellow'),
  ];

  it('sorts ascending alphabetically', () => {
    _id = 0;
    const result = sortItems(items, 'name', 'asc');
    expect(result.map((i) => i.name)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('sorts descending alphabetically', () => {
    const result = sortItems(items, 'name', 'desc');
    expect(result.map((i) => i.name)).toEqual(['Zebra', 'Mango', 'Apple']);
  });

  it('does not mutate original array', () => {
    const original = [...items];
    sortItems(items, 'name', 'desc');
    expect(items).toEqual(original);
  });
});

// ─── sortItems — by status ────────────────────────────────────────────────────

describe('sortItems by status', () => {
  // statusSortKey: red=0, green=1, yellow=2
  const items = [
    makeItem('GreenItem', 'green'),   // key=1
    makeItem('YellowItem', 'yellow'), // key=2
    makeItem('RedItem', 'red'),       // key=0
  ];

  it('sorts ascending: red(0) < green(1) < yellow(2)', () => {
    const result = sortItems(items, 'status', 'asc');
    expect(result.map((i) => i.level)).toEqual(['red', 'green', 'yellow']);
  });

  it('sorts descending: yellow(2) > green(1) > red(0)', () => {
    const result = sortItems(items, 'status', 'desc');
    expect(result.map((i) => i.level)).toEqual(['yellow', 'green', 'red']);
  });
});

// ─── sortItems — by lastChecked ───────────────────────────────────────────────

describe('sortItems by lastChecked', () => {
  const items = [
    makeItem('C', 'green', '2026-04-03T00:00:00Z'),
    makeItem('A', 'green', '2026-04-01T00:00:00Z'),
    makeItem('B', 'green', null),                    // null → 0 (epoch)
    makeItem('D', 'green', '2026-04-02T00:00:00Z'),
  ];

  it('sorts ascending: null first, then oldest→newest', () => {
    const result = sortItems(items, 'lastChecked', 'asc');
    expect(result.map((i) => i.name)).toEqual(['B', 'A', 'D', 'C']);
  });

  it('sorts descending: newest first, null last', () => {
    const result = sortItems(items, 'lastChecked', 'desc');
    expect(result.map((i) => i.name)).toEqual(['C', 'D', 'A', 'B']);
  });

  it('handles all null checkedAt — order stable (all equal at 0)', () => {
    const nullItems = [
      makeItem('X', 'green', null),
      makeItem('Y', 'green', null),
    ];
    const result = sortItems(nullItems, 'lastChecked', 'asc');
    expect(result).toHaveLength(2);
    // all equal timestamps — no assertion on order, just no crash
  });
});

// ─── sliceVisible ─────────────────────────────────────────────────────────────

describe('sliceVisible', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map((name) => makeItem(name, 'green'));

  it('returns first page', () => {
    const result = sliceVisible(items, 1, 2);
    expect(result.map((i) => i.name)).toEqual(['a', 'b']);
  });

  it('returns second page', () => {
    const result = sliceVisible(items, 2, 2);
    expect(result.map((i) => i.name)).toEqual(['c', 'd']);
  });

  it('returns partial last page', () => {
    const result = sliceVisible(items, 3, 2);
    expect(result.map((i) => i.name)).toEqual(['e']);
  });

  it('returns all items when pageSize >= total', () => {
    const result = sliceVisible(items, 1, 100);
    expect(result).toHaveLength(5);
  });

  it('returns empty for empty input', () => {
    expect(sliceVisible([], 1, 10)).toEqual([]);
  });
});

// ─── handleVersionSortLogic ───────────────────────────────────────────────────

describe('handleVersionSortLogic', () => {
  describe('clicking the same column', () => {
    it('toggles asc → desc', () => {
      const result = handleVersionSortLogic('name', 'asc', 'name');
      expect(result).toEqual({ sortBy: 'name', sortDir: 'desc' });
    });

    it('toggles desc → asc', () => {
      const result = handleVersionSortLogic('name', 'desc', 'name');
      expect(result).toEqual({ sortBy: 'name', sortDir: 'asc' });
    });

    it('toggles status column direction', () => {
      expect(handleVersionSortLogic('status', 'asc', 'status')).toEqual({ sortBy: 'status', sortDir: 'desc' });
    });

    it('toggles lastChecked column direction', () => {
      expect(handleVersionSortLogic('lastChecked', 'desc', 'lastChecked')).toEqual({ sortBy: 'lastChecked', sortDir: 'asc' });
    });
  });

  describe('clicking a different column', () => {
    it('switches sortBy and resets direction to asc', () => {
      const result = handleVersionSortLogic('name', 'desc', 'status');
      expect(result).toEqual({ sortBy: 'status', sortDir: 'asc' });
    });

    it('switches from status to lastChecked with asc reset', () => {
      const result = handleVersionSortLogic('status', 'asc', 'lastChecked');
      expect(result).toEqual({ sortBy: 'lastChecked', sortDir: 'asc' });
    });

    it('switches from lastChecked to name with asc reset', () => {
      const result = handleVersionSortLogic('lastChecked', 'desc', 'name');
      expect(result).toEqual({ sortBy: 'name', sortDir: 'asc' });
    });
  });
});
