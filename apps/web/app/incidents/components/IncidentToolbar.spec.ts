/**
 * Unit tests for IncidentToolbar pure logic.
 * Tests sort icon logic, sort column labels, and active sort styling.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

type SortCol = 'title' | 'status' | 'severity' | 'updatedAt';

function sortColLabel(col: SortCol): string {
  return col === 'updatedAt' ? 'Date' : col.charAt(0).toUpperCase() + col.slice(1);
}

function isSortActive(col: SortCol, sortKey: SortCol): boolean {
  return col === sortKey;
}

function sortIconType(col: SortCol, sortKey: SortCol, sortDir: 'asc' | 'desc'): 'up' | 'down' | 'neutral' {
  if (sortKey !== col) return 'neutral';
  return sortDir === 'asc' ? 'up' : 'down';
}

function sortButtonClass(col: SortCol, sortKey: SortCol): string {
  const base = 'flex items-center gap-1 px-2.5 py-2 rounded-lg border text-xs font-medium transition-colors';
  const active = 'border-accent/40 bg-accent/10 text-accent';
  const inactive = 'border-border text-text-secondary hover:text-text-primary hover:border-border-hover';
  return `${base} ${isSortActive(col, sortKey) ? active : inactive}`;
}

function toggleSort(
  col: SortCol,
  currentKey: SortCol,
  currentDir: 'asc' | 'desc',
): { key: SortCol; dir: 'asc' | 'desc' } {
  if (currentKey === col) {
    return { key: col, dir: currentDir === 'asc' ? 'desc' : 'asc' };
  }
  return { key: col, dir: 'asc' }; // new column defaults to asc
}

const ALL_SORT_COLS: SortCol[] = ['title', 'status', 'severity', 'updatedAt'];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IncidentToolbar — sortColLabel', () => {
  it('title → "Title"', () => expect(sortColLabel('title')).toBe('Title'));
  it('status → "Status"', () => expect(sortColLabel('status')).toBe('Status'));
  it('severity → "Severity"', () => expect(sortColLabel('severity')).toBe('Severity'));
  it('updatedAt → "Date" (human-readable override)', () => expect(sortColLabel('updatedAt')).toBe('Date'));
});

describe('IncidentToolbar — isSortActive', () => {
  it('returns true when col matches sortKey', () => {
    expect(isSortActive('title', 'title')).toBe(true);
    expect(isSortActive('status', 'status')).toBe(true);
  });

  it('returns false when col differs from sortKey', () => {
    expect(isSortActive('title', 'status')).toBe(false);
    expect(isSortActive('severity', 'updatedAt')).toBe(false);
  });
});

describe('IncidentToolbar — sortIconType', () => {
  it('inactive column → neutral icon', () => {
    expect(sortIconType('title', 'status', 'asc')).toBe('neutral');
    expect(sortIconType('title', 'status', 'desc')).toBe('neutral');
  });

  it('active column, asc → up icon', () => {
    expect(sortIconType('title', 'title', 'asc')).toBe('up');
  });

  it('active column, desc → down icon', () => {
    expect(sortIconType('title', 'title', 'desc')).toBe('down');
  });

  it('all columns produce correct icon when active asc', () => {
    ALL_SORT_COLS.forEach((col) => {
      expect(sortIconType(col, col, 'asc')).toBe('up');
    });
  });

  it('all columns produce correct icon when active desc', () => {
    ALL_SORT_COLS.forEach((col) => {
      expect(sortIconType(col, col, 'desc')).toBe('down');
    });
  });
});

describe('IncidentToolbar — sortButtonClass', () => {
  it('active sort column gets accent styling', () => {
    const cls = sortButtonClass('title', 'title');
    expect(cls).toContain('accent');
  });

  it('inactive column gets secondary styling', () => {
    const cls = sortButtonClass('title', 'status');
    expect(cls).toContain('text-text-secondary');
    expect(cls).not.toContain('accent');
  });
});

describe('IncidentToolbar — toggleSort', () => {
  it('clicking same column flips direction asc → desc', () => {
    const result = toggleSort('title', 'title', 'asc');
    expect(result).toEqual({ key: 'title', dir: 'desc' });
  });

  it('clicking same column flips direction desc → asc', () => {
    const result = toggleSort('title', 'title', 'desc');
    expect(result).toEqual({ key: 'title', dir: 'asc' });
  });

  it('clicking new column starts at asc', () => {
    const result = toggleSort('severity', 'title', 'asc');
    expect(result).toEqual({ key: 'severity', dir: 'asc' });
  });

  it('clicking new column ignores current direction', () => {
    const result = toggleSort('status', 'title', 'desc');
    expect(result).toEqual({ key: 'status', dir: 'asc' });
  });
});

describe('IncidentToolbar — ALL_SORT_COLS coverage', () => {
  it('all 4 sort columns have labels', () => {
    ALL_SORT_COLS.forEach((col) => {
      expect(sortColLabel(col).length).toBeGreaterThan(0);
    });
  });

  it('all 4 columns produce correct active class', () => {
    ALL_SORT_COLS.forEach((col) => {
      expect(sortButtonClass(col, col)).toContain('accent');
    });
  });

  it('all 4 columns produce inactive class when another is active', () => {
    ALL_SORT_COLS.forEach((col) => {
      const other = ALL_SORT_COLS.find((c) => c !== col) ?? 'title';
      expect(sortButtonClass(col, other as SortCol)).toContain('text-text-secondary');
    });
  });
});
