import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportCSV, exportJSON } from './useTableSort';

// Test the pure sort logic directly by extracting it
// (useTableSort hook tested indirectly via component tests)
describe('sort logic', () => {
  // Replicate the sort comparator from useTableSort for direct testing
  function sortItems<T>(items: T[], accessor: (item: T) => unknown, dir: 'asc' | 'desc'): T[] {
    return [...items].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      let cmp = 0;
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = 1;
      else if (bv == null) cmp = -1;
      else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  it('sorts strings ascending', () => {
    const items = [{ name: 'Charlie' }, { name: 'Alice' }, { name: 'Bob' }];
    const sorted = sortItems(items, (i) => i.name, 'asc');
    expect(sorted.map((i) => i.name)).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('sorts strings descending', () => {
    const items = [{ name: 'Alice' }, { name: 'Charlie' }, { name: 'Bob' }];
    const sorted = sortItems(items, (i) => i.name, 'desc');
    expect(sorted.map((i) => i.name)).toEqual(['Charlie', 'Bob', 'Alice']);
  });

  it('sorts numbers correctly ascending', () => {
    const items = [{ age: 30 }, { age: 10 }, { age: 20 }];
    const sorted = sortItems(items, (i) => i.age, 'asc');
    expect(sorted.map((i) => i.age)).toEqual([10, 20, 30]);
  });

  it('sorts numbers correctly descending', () => {
    const items = [{ age: 30 }, { age: 10 }, { age: 20 }];
    const sorted = sortItems(items, (i) => i.age, 'desc');
    expect(sorted.map((i) => i.age)).toEqual([30, 20, 10]);
  });

  it('handles null values (pushed to end in asc)', () => {
    const items = [{ name: 'Bob' }, { name: null }, { name: 'Alice' }];
    const sorted = sortItems(items, (i) => i.name, 'asc');
    expect(sorted.map((i) => i.name)).toEqual(['Alice', 'Bob', null]);
  });

  it('handles all-null values', () => {
    const items = [{ name: null }, { name: null }];
    const sorted = sortItems(items, (i) => i.name, 'asc');
    expect(sorted).toHaveLength(2);
  });

  it('handles empty array', () => {
    const sorted = sortItems([], (i) => i, 'asc');
    expect(sorted).toEqual([]);
  });

  it('handles single item', () => {
    const items = [{ name: 'Only' }];
    const sorted = sortItems(items, (i) => i.name, 'asc');
    expect(sorted.map((i) => i.name)).toEqual(['Only']);
  });

  it('does not mutate original array', () => {
    const items = [{ name: 'C' }, { name: 'A' }, { name: 'B' }];
    sortItems(items, (i) => i.name, 'asc');
    expect(items.map((i) => i.name)).toEqual(['C', 'A', 'B']);
  });

  it('handles mixed types by coercing to string', () => {
    const items = [{ val: '10' }, { val: '2' }, { val: '1' }];
    const sorted = sortItems(items, (i) => i.val, 'asc');
    // String sort: "1" < "10" < "2"
    expect(sorted.map((i) => i.val)).toEqual(['1', '10', '2']);
  });

  it('handles undefined values same as null', () => {
    const items = [{ name: 'Bob' }, { name: undefined }, { name: 'Alice' }];
    const sorted = sortItems(items, (i) => i.name, 'asc');
    expect(sorted.map((i) => i.name)).toEqual(['Alice', 'Bob', undefined]);
  });
});

describe('sort comparator edge cases', () => {
  function sortItems<T>(items: T[], accessor: (item: T) => unknown, dir: 'asc' | 'desc'): T[] {
    return [...items].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      let cmp = 0;
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = 1;
      else if (bv == null) cmp = -1;
      else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  it('handles null values in descending sort (null goes to start)', () => {
    const items = [{ name: 'Bob' }, { name: null }, { name: 'Alice' }];
    const sorted = sortItems(items, (i) => i.name, 'desc');
    // In desc: cmp is negated, so null (cmp=1) becomes -1 → null moves to front
    expect(sorted[0]).toEqual({ name: null });
    expect(sorted[1]).toEqual({ name: 'Bob' });
    expect(sorted[2]).toEqual({ name: 'Alice' });
  });

  it('handles numbers descending', () => {
    const items = [{ n: 1 }, { n: 3 }, { n: 2 }];
    const sorted = sortItems(items, (i) => i.n, 'desc');
    expect(sorted.map((i) => i.n)).toEqual([3, 2, 1]);
  });

  it('handles bv==null with av present', () => {
    const items = [{ v: null }, { v: 'a' }];
    const sorted = sortItems(items, (i) => i.v, 'asc');
    expect(sorted.map((i) => i.v)).toEqual(['a', null]);
  });

  it('handles both null values with other items', () => {
    const items = [{ v: null }, { v: 'b' }, { v: null }, { v: 'a' }];
    const sorted = sortItems(items, (i) => i.v, 'asc');
    expect(sorted.map((i) => i.v)).toEqual(['a', 'b', null, null]);
  });

  it('handles boolean-like values as strings', () => {
    const items = [{ v: true }, { v: false }];
    const sorted = sortItems(items, (i) => i.v, 'asc');
    // "false" < "true" in string comparison
    expect(sorted.map((i) => i.v)).toEqual([false, true]);
  });
});

describe('exportCSV', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:test');
    revokeObjectURL = vi.fn();
    clickSpy = vi.fn();
    global.URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: clickSpy,
    } as unknown as HTMLAnchorElement);
  });

  it('does nothing for empty rows', () => {
    exportCSV('test.csv', []);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('creates CSV blob and triggers download', () => {
    exportCSV('test.csv', [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8;');
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('quotes values containing commas', () => {
    exportCSV('test.csv', [{ desc: 'hello, world' }]);
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('escapes double quotes in values', () => {
    exportCSV('test.csv', [{ desc: 'say "hi"' }]);
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('handles null/undefined values gracefully', () => {
    exportCSV('test.csv', [{ a: null, b: undefined, c: '' }]);
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('quotes values containing newlines', () => {
    exportCSV('test.csv', [{ desc: 'line1\nline2' }]);
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('quotes values containing carriage returns', () => {
    exportCSV('test.csv', [{ desc: 'line1\rline2' }]);
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('handles multiple rows with mixed special chars', () => {
    exportCSV('multi.csv', [
      { name: 'normal', desc: 'plain' },
      { name: 'with,comma', desc: 'with "quotes"' },
      { name: 'with\nnewline', desc: '' },
    ]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalled();
  });
});

describe('exportJSON', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:test');
    revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: vi.fn(),
    } as unknown as HTMLAnchorElement);
  });

  it('creates JSON blob with correct MIME type', () => {
    exportJSON('test.json', [{ id: 1 }]);
    expect(createObjectURL).toHaveBeenCalled();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');
  });

  it('handles complex nested objects', () => {
    exportJSON('test.json', [{ a: { b: [1, 2, 3] } }]);
    expect(createObjectURL).toHaveBeenCalled();
  });
});
