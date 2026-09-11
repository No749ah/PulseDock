import { describe, it, expect } from 'vitest';

// ── Pure filter helpers mirrored inline ───────────────────────────────

function parseSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

function matchesSearch(name: string, query: string): boolean {
  return name.toLowerCase().includes(query.toLowerCase());
}

function matchesStatus(
  enabled: boolean,
  filter: 'all' | 'enabled' | 'disabled',
): boolean {
  if (filter === 'all') return true;
  if (filter === 'enabled') return enabled === true;
  return enabled === false;
}

function matchesFolder(folderId: string | null, filter: string | null): boolean {
  if (filter === null) return true;
  return folderId === filter;
}

function matchesTag(tags: string[], filter: string | null): boolean {
  if (filter === null) return true;
  return tags.includes(filter);
}

function countActiveFilters(params: {
  statusFilter: string;
  folderFilter: string | null;
  tagFilter: string | null;
}): number {
  let count = 0;
  if (params.statusFilter !== 'all') count++;
  if (params.folderFilter !== null) count++;
  if (params.tagFilter !== null) count++;
  return count;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('parseSearchQuery', () => {
  it('trims whitespace', () => {
    expect(parseSearchQuery('  hello  ')).toBe('hello');
  });

  it('lowercases the query', () => {
    expect(parseSearchQuery('HELLO')).toBe('hello');
  });

  it('trims and lowercases together', () => {
    expect(parseSearchQuery('  MyMonitor  ')).toBe('mymonitor');
  });

  it('returns empty string for empty input', () => {
    expect(parseSearchQuery('')).toBe('');
  });

  it('returns empty string for whitespace only', () => {
    expect(parseSearchQuery('   ')).toBe('');
  });
});

describe('matchesSearch', () => {
  it('matches exact name', () => {
    expect(matchesSearch('My Monitor', 'My Monitor')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(matchesSearch('My Monitor', 'my monitor')).toBe(true);
  });

  it('matches partial substring', () => {
    expect(matchesSearch('Production API', 'api')).toBe(true);
  });

  it('returns false when not a match', () => {
    expect(matchesSearch('Production API', 'staging')).toBe(false);
  });

  it('matches with empty query (everything matches)', () => {
    expect(matchesSearch('Anything', '')).toBe(true);
  });
});

describe('matchesStatus', () => {
  it('"all" filter always returns true for enabled', () => {
    expect(matchesStatus(true, 'all')).toBe(true);
  });

  it('"all" filter always returns true for disabled', () => {
    expect(matchesStatus(false, 'all')).toBe(true);
  });

  it('"enabled" filter returns true when enabled=true', () => {
    expect(matchesStatus(true, 'enabled')).toBe(true);
  });

  it('"enabled" filter returns false when enabled=false', () => {
    expect(matchesStatus(false, 'enabled')).toBe(false);
  });

  it('"disabled" filter returns true when enabled=false', () => {
    expect(matchesStatus(false, 'disabled')).toBe(true);
  });

  it('"disabled" filter returns false when enabled=true', () => {
    expect(matchesStatus(true, 'disabled')).toBe(false);
  });
});

describe('matchesFolder', () => {
  it('null filter always returns true', () => {
    expect(matchesFolder('folder-1', null)).toBe(true);
    expect(matchesFolder(null, null)).toBe(true);
  });

  it('exact match returns true', () => {
    expect(matchesFolder('folder-abc', 'folder-abc')).toBe(true);
  });

  it('different folder id returns false', () => {
    expect(matchesFolder('folder-1', 'folder-2')).toBe(false);
  });

  it('null folderId with non-null filter returns false', () => {
    expect(matchesFolder(null, 'folder-1')).toBe(false);
  });
});

describe('matchesTag', () => {
  it('null filter always returns true', () => {
    expect(matchesTag(['tag-a', 'tag-b'], null)).toBe(true);
    expect(matchesTag([], null)).toBe(true);
  });

  it('returns true when tag is in array', () => {
    expect(matchesTag(['tag-a', 'tag-b'], 'tag-a')).toBe(true);
  });

  it('returns false when tag is not in array', () => {
    expect(matchesTag(['tag-a', 'tag-b'], 'tag-c')).toBe(false);
  });

  it('returns false for empty tags array with filter', () => {
    expect(matchesTag([], 'tag-a')).toBe(false);
  });
});

describe('countActiveFilters', () => {
  it('returns 0 for defaults (all/null/null)', () => {
    expect(countActiveFilters({ statusFilter: 'all', folderFilter: null, tagFilter: null })).toBe(0);
  });

  it('increments by 1 for non-default statusFilter', () => {
    expect(countActiveFilters({ statusFilter: 'enabled', folderFilter: null, tagFilter: null })).toBe(1);
    expect(countActiveFilters({ statusFilter: 'disabled', folderFilter: null, tagFilter: null })).toBe(1);
  });

  it('increments by 1 for non-null folderFilter', () => {
    expect(countActiveFilters({ statusFilter: 'all', folderFilter: 'folder-1', tagFilter: null })).toBe(1);
  });

  it('increments by 1 for non-null tagFilter', () => {
    expect(countActiveFilters({ statusFilter: 'all', folderFilter: null, tagFilter: 'production' })).toBe(1);
  });

  it('increments independently — all three active → 3', () => {
    expect(countActiveFilters({ statusFilter: 'enabled', folderFilter: 'folder-1', tagFilter: 'prod' })).toBe(3);
  });

  it('two active filters → 2', () => {
    expect(countActiveFilters({ statusFilter: 'disabled', folderFilter: 'folder-x', tagFilter: null })).toBe(2);
  });
});
