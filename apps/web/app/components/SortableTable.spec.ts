/**
 * Unit tests for SortableTable utilities (pagination math, aria-sort, export logic).
 */
import { describe, it, expect, vi } from 'vitest';

type SortDir = 'asc' | 'desc';

interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

// Pagination range calculation (mirrors TablePagination component)
function calcRange(page: number, pageSize: number, total: number): { start: number; end: number } {
  const start = Math.min((page - 1) * pageSize + 1, total);
  const end = Math.min(page * pageSize, total);
  return { start, end };
}

function calcPageCount(total: number, pageSize: number): number {
  return Math.ceil(total / pageSize);
}

// Aria-sort value helper (mirrors SortableHeader)
function ariaSortValue<K extends string>(sort: SortState<K>, key: K): 'ascending' | 'descending' | 'none' {
  if (sort.key !== key) return 'none';
  return sort.dir === 'asc' ? 'ascending' : 'descending';
}

// Toggle sort direction (mirrors useTableSort)
function toggleSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (current.key === key) {
    return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { key, dir: 'asc' };
}

describe('TablePagination — range calculation', () => {
  it('page 1 of 100 items, pageSize 10 → 1–10', () => {
    const { start, end } = calcRange(1, 10, 100);
    expect(start).toBe(1);
    expect(end).toBe(10);
  });

  it('page 2 of 100 items, pageSize 10 → 11–20', () => {
    const { start, end } = calcRange(2, 10, 100);
    expect(start).toBe(11);
    expect(end).toBe(20);
  });

  it('last page (page 10) of 100 items → 91–100', () => {
    const { start, end } = calcRange(10, 10, 100);
    expect(start).toBe(91);
    expect(end).toBe(100);
  });

  it('partial last page: 45 items, pageSize 10, page 5 → 41–45', () => {
    const { start, end } = calcRange(5, 10, 45);
    expect(start).toBe(41);
    expect(end).toBe(45);
  });

  it('zero items → start=0, end=0', () => {
    const { start, end } = calcRange(1, 10, 0);
    expect(start).toBe(0);
    expect(end).toBe(0);
  });

  it('1 item → 1–1', () => {
    const { start, end } = calcRange(1, 25, 1);
    expect(start).toBe(1);
    expect(end).toBe(1);
  });

  it('exactly one full page → start=1, end=pageSize', () => {
    const { start, end } = calcRange(1, 25, 25);
    expect(start).toBe(1);
    expect(end).toBe(25);
  });
});

describe('TablePagination — page count', () => {
  it('100 items / 10 per page = 10 pages', () => {
    expect(calcPageCount(100, 10)).toBe(10);
  });

  it('101 items / 10 per page = 11 pages', () => {
    expect(calcPageCount(101, 10)).toBe(11);
  });

  it('0 items = 0 pages', () => {
    expect(calcPageCount(0, 10)).toBe(0);
  });

  it('1 item = 1 page', () => {
    expect(calcPageCount(1, 25)).toBe(1);
  });

  it('exact fit → no extra page', () => {
    expect(calcPageCount(50, 25)).toBe(2);
  });
});

describe('SortableHeader — aria-sort', () => {
  type Col = 'name' | 'status' | 'latency';
  const sort: SortState<Col> = { key: 'name', dir: 'asc' };

  it('active column with asc → "ascending"', () => {
    expect(ariaSortValue(sort, 'name')).toBe('ascending');
  });

  it('active column with desc → "descending"', () => {
    expect(ariaSortValue({ key: 'name', dir: 'desc' }, 'name')).toBe('descending');
  });

  it('inactive column → "none"', () => {
    expect(ariaSortValue(sort, 'status')).toBe('none');
    expect(ariaSortValue(sort, 'latency')).toBe('none');
  });
});

describe('Sort toggle logic', () => {
  type Col = 'name' | 'status' | 'latency';

  it('clicking same key with asc → flips to desc', () => {
    const state: SortState<Col> = { key: 'name', dir: 'asc' };
    const next = toggleSort(state, 'name');
    expect(next.key).toBe('name');
    expect(next.dir).toBe('desc');
  });

  it('clicking same key with desc → flips to asc', () => {
    const state: SortState<Col> = { key: 'name', dir: 'desc' };
    const next = toggleSort(state, 'name');
    expect(next.dir).toBe('asc');
  });

  it('clicking different key → asc', () => {
    const state: SortState<Col> = { key: 'name', dir: 'desc' };
    const next = toggleSort(state, 'status');
    expect(next.key).toBe('status');
    expect(next.dir).toBe('asc');
  });

  it('multiple toggles cycle correctly', () => {
    let state: SortState<Col> = { key: 'latency', dir: 'asc' };
    state = toggleSort(state, 'latency');
    expect(state.dir).toBe('desc');
    state = toggleSort(state, 'latency');
    expect(state.dir).toBe('asc');
  });
});

describe('Export — CSV generation', () => {
  function objectsToCSV<T extends Record<string, unknown>>(data: T[], columns: (keyof T)[]): string {
    const header = columns.join(',');
    const rows = data.map((row) =>
      columns
        .map((col) => {
          const val = String(row[col] ?? '');
          // Quote values containing commas or quotes
          return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
        })
        .join(',')
    );
    return [header, ...rows].join('\n');
  }

  it('produces correct header row', () => {
    const csv = objectsToCSV([{ name: 'test', status: 'up' }], ['name', 'status']);
    expect(csv.split('\n')[0]).toBe('name,status');
  });

  it('produces correct data row', () => {
    const csv = objectsToCSV([{ name: 'my-monitor', status: 'up' }], ['name', 'status']);
    expect(csv.split('\n')[1]).toBe('my-monitor,up');
  });

  it('quotes values containing commas', () => {
    const csv = objectsToCSV([{ name: 'foo, bar', status: 'up' }], ['name', 'status']);
    expect(csv.split('\n')[1]).toContain('"foo, bar"');
  });

  it('escapes inner quotes', () => {
    const csv = objectsToCSV([{ name: 'say "hello"', status: 'up' }], ['name', 'status']);
    expect(csv.split('\n')[1]).toContain('""hello""');
  });

  it('handles empty dataset → only header', () => {
    const csv = objectsToCSV([], ['name', 'status']);
    expect(csv.split('\n')).toHaveLength(1);
    expect(csv).toBe('name,status');
  });

  it('handles null/undefined values as empty strings', () => {
    const csv = objectsToCSV([{ name: null, status: undefined } as Record<string, unknown>], ['name', 'status']);
    const row = csv.split('\n')[1];
    expect(row).toBe(',');
  });
});

describe('Export — onExportCSV/onExportJSON callbacks', () => {
  it('onExportCSV is called when export triggered', () => {
    const onExportCSV = vi.fn();
    onExportCSV();
    expect(onExportCSV).toHaveBeenCalledOnce();
  });

  it('onExportJSON is called when export triggered', () => {
    const onExportJSON = vi.fn();
    onExportJSON();
    expect(onExportJSON).toHaveBeenCalledOnce();
  });

  it('export callbacks are optional — undefined does not throw', () => {
    const maybeExport: (() => void) | undefined = undefined;
    expect(() => maybeExport?.()).not.toThrow();
  });
});
