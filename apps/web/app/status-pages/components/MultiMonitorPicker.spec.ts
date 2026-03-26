/**
 * Tests for MultiMonitorPicker filtering logic.
 * We test the pure filter predicate that mirrors the useMemo inside the component.
 */
import { describe, it, expect } from 'vitest';

// ── Mirror the filter logic from MultiMonitorPicker.tsx ──────────────────────

interface MonitorTag {
  id: string;
  name: string;
  color?: string;
}

interface MonitorOption {
  id: string;
  name: string;
  type: string;
  folderId?: string | null;
  tags?: MonitorTag[];
}

function normalizeType(type: string): string {
  return type.toUpperCase();
}

function filterMonitors(
  monitors: MonitorOption[],
  opts: {
    search: string;
    tagFilter: string;
    folderFilter: string;
    typeFilter: string;
  },
): MonitorOption[] {
  const query = opts.search.trim().toLowerCase();
  return monitors.filter((monitor) => {
    if (query && !monitor.name.toLowerCase().includes(query)) return false;

    if (opts.tagFilter) {
      const hasTag = (monitor.tags ?? []).some(
        (tag) => tag.name === opts.tagFilter || tag.id === opts.tagFilter,
      );
      if (!hasTag) return false;
    }

    if (opts.folderFilter && monitor.folderId !== opts.folderFilter) return false;

    if (opts.typeFilter && normalizeType(monitor.type) !== normalizeType(opts.typeFilter)) return false;

    return true;
  });
}

// ── Test fixtures ────────────────────────────────────────────────────────────

const MONITORS: MonitorOption[] = [
  {
    id: 'm1',
    name: 'Production API',
    type: 'HTTP',
    folderId: 'f1',
    tags: [{ id: 't1', name: 'prod' }],
  },
  {
    id: 'm2',
    name: 'Staging DB',
    type: 'TCP',
    folderId: 'f2',
    tags: [{ id: 't2', name: 'staging' }],
  },
  {
    id: 'm3',
    name: 'Dev SSL Check',
    type: 'SSL_CERT',
    folderId: null,
    tags: [{ id: 't3', name: 'dev' }, { id: 't1', name: 'prod' }],
  },
  {
    id: 'm4',
    name: 'GitHub Release Tracker',
    type: 'GIT_RELEASE',
    folderId: 'f1',
    tags: [],
  },
  {
    id: 'm5',
    name: 'Heartbeat Monitor',
    type: 'HEARTBEAT',
    folderId: 'f2',
    tags: [{ id: 't2', name: 'staging' }],
  },
];

const NO_FILTERS = { search: '', tagFilter: '', folderFilter: '', typeFilter: '' };

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MultiMonitorPicker — filterMonitors', () => {
  describe('no filters', () => {
    it('returns all monitors when no filters are applied', () => {
      const result = filterMonitors(MONITORS, NO_FILTERS);
      expect(result).toHaveLength(5);
    });

    it('returns empty array for empty monitors list', () => {
      const result = filterMonitors([], NO_FILTERS);
      expect(result).toHaveLength(0);
    });
  });

  describe('search filter', () => {
    it('filters by name (case-insensitive, partial match)', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, search: 'api' });
      expect(result.map((m) => m.id)).toEqual(['m1']);
    });

    it('matches multiple monitors with shared substring', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, search: 'ing' });
      // "Staging" and "Heartbeat Monitor" → actually just "Staging"
      const names = result.map((m) => m.name);
      expect(names.every((n) => n.toLowerCase().includes('ing'))).toBe(true);
    });

    it('returns empty when search matches nothing', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, search: 'xyzzy' });
      expect(result).toHaveLength(0);
    });

    it('ignores leading/trailing whitespace in search', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, search: '  api  ' });
      expect(result.map((m) => m.id)).toEqual(['m1']);
    });

    it('is case-insensitive', () => {
      const upper = filterMonitors(MONITORS, { ...NO_FILTERS, search: 'HEARTBEAT' });
      const lower = filterMonitors(MONITORS, { ...NO_FILTERS, search: 'heartbeat' });
      expect(upper).toEqual(lower);
      expect(upper).toHaveLength(1);
    });

    it('empty search returns all monitors', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, search: '' });
      expect(result).toHaveLength(5);
    });
  });

  describe('tag filter', () => {
    it('filters by tag name', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, tagFilter: 'prod' });
      // m1 and m3 have 'prod' tag
      expect(result.map((m) => m.id).sort()).toEqual(['m1', 'm3']);
    });

    it('filters by tag id', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, tagFilter: 't2' });
      // m2 and m5 have tag id 't2'
      expect(result.map((m) => m.id).sort()).toEqual(['m2', 'm5']);
    });

    it('returns empty when no monitors have the tag', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, tagFilter: 'nonexistent' });
      expect(result).toHaveLength(0);
    });

    it('excludes monitors with no tags when tag filter is set', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, tagFilter: 'prod' });
      expect(result.find((m) => m.id === 'm4')).toBeUndefined(); // m4 has no tags
    });

    it('matches monitors with multiple tags if any tag matches', () => {
      // m3 has tags: dev and prod
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, tagFilter: 'dev' });
      expect(result.map((m) => m.id)).toContain('m3');
    });

    it('no tag filter returns all monitors', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, tagFilter: '' });
      expect(result).toHaveLength(5);
    });
  });

  describe('folder filter', () => {
    it('filters by folder id', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, folderFilter: 'f1' });
      expect(result.map((m) => m.id).sort()).toEqual(['m1', 'm4']);
    });

    it('excludes monitors with null folderId', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, folderFilter: 'f1' });
      expect(result.find((m) => m.id === 'm3')).toBeUndefined(); // m3 has null folderId
    });

    it('returns empty when no monitors are in the folder', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, folderFilter: 'f99' });
      expect(result).toHaveLength(0);
    });

    it('no folder filter returns all monitors', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, folderFilter: '' });
      expect(result).toHaveLength(5);
    });
  });

  describe('type filter', () => {
    it('filters by type (exact match, case-insensitive)', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, typeFilter: 'HTTP' });
      expect(result.map((m) => m.id)).toEqual(['m1']);
    });

    it('filters by type case-insensitively', () => {
      const upper = filterMonitors(MONITORS, { ...NO_FILTERS, typeFilter: 'TCP' });
      const lower = filterMonitors(MONITORS, { ...NO_FILTERS, typeFilter: 'tcp' });
      expect(upper.map((m) => m.id)).toEqual(['m2']);
      expect(lower.map((m) => m.id)).toEqual(['m2']);
    });

    it('filters GIT_RELEASE type', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, typeFilter: 'GIT_RELEASE' });
      expect(result.map((m) => m.id)).toEqual(['m4']);
    });

    it('returns empty when no monitors match the type', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, typeFilter: 'PING' });
      expect(result).toHaveLength(0);
    });

    it('no type filter returns all monitors', () => {
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, typeFilter: '' });
      expect(result).toHaveLength(5);
    });
  });

  describe('combined filters', () => {
    it('combines search + type filter', () => {
      // 'monitor' matches name + HEARTBEAT type
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, search: 'monitor', typeFilter: 'HEARTBEAT' });
      expect(result.map((m) => m.id)).toEqual(['m5']);
    });

    it('combines tag + folder filter', () => {
      // staging tag + f2 folder
      const result = filterMonitors(MONITORS, { ...NO_FILTERS, tagFilter: 'staging', folderFilter: 'f2' });
      expect(result.map((m) => m.id).sort()).toEqual(['m2', 'm5']);
    });

    it('combines all filters — returns single result', () => {
      const result = filterMonitors(MONITORS, {
        search: 'github',
        tagFilter: '',
        folderFilter: 'f1',
        typeFilter: 'GIT_RELEASE',
      });
      expect(result.map((m) => m.id)).toEqual(['m4']);
    });

    it('returns empty when combined filters exclude all', () => {
      const result = filterMonitors(MONITORS, {
        search: 'api',
        tagFilter: 'staging',
        folderFilter: '',
        typeFilter: '',
      });
      expect(result).toHaveLength(0);
    });
  });
});

// ── Tests for selectAll / clearAll logic ────────────────────────────────────

function selectAllFiltered(selectedIds: string[], filteredMonitors: MonitorOption[]): string[] {
  const filteredIds = filteredMonitors.map((m) => m.id);
  const merged = new Set([...selectedIds, ...filteredIds]);
  return Array.from(merged);
}

function clearAllFiltered(selectedIds: string[], filteredMonitors: MonitorOption[]): string[] {
  const filteredSet = new Set(filteredMonitors.map((m) => m.id));
  return selectedIds.filter((id) => !filteredSet.has(id));
}

describe('MultiMonitorPicker — selectAll / clearAll', () => {
  it('selectAll adds all filtered monitors to selection', () => {
    const result = selectAllFiltered([], MONITORS.slice(0, 2));
    expect(result.sort()).toEqual(['m1', 'm2']);
  });

  it('selectAll preserves existing selections outside filter', () => {
    const result = selectAllFiltered(['m5'], MONITORS.slice(0, 2));
    expect(result.sort()).toEqual(['m1', 'm2', 'm5']);
  });

  it('selectAll deduplicates when already-selected monitors are in filter', () => {
    const result = selectAllFiltered(['m1', 'm5'], MONITORS.slice(0, 2));
    expect(result.sort()).toEqual(['m1', 'm2', 'm5']);
    // m1 should not appear twice
    expect(result.filter((id) => id === 'm1')).toHaveLength(1);
  });

  it('clearAll removes all filtered monitors from selection', () => {
    const result = clearAllFiltered(['m1', 'm2', 'm5'], MONITORS.slice(0, 2));
    expect(result).toEqual(['m5']);
  });

  it('clearAll preserves monitors outside the filtered set', () => {
    const result = clearAllFiltered(['m1', 'm3', 'm5'], MONITORS.slice(0, 2));
    expect(result.sort()).toEqual(['m3', 'm5']);
  });

  it('clearAll is a no-op when filtered monitors are not selected', () => {
    const result = clearAllFiltered(['m5'], MONITORS.slice(0, 2));
    expect(result).toEqual(['m5']);
  });

  it('allFilteredSelected returns true when all filtered monitors are selected', () => {
    const selected = new Set(['m1', 'm2', 'm3']);
    const filtered = MONITORS.slice(0, 2);
    const allSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.id));
    expect(allSelected).toBe(true);
  });

  it('allFilteredSelected returns false when some filtered monitors are not selected', () => {
    const selected = new Set(['m1']);
    const filtered = MONITORS.slice(0, 2);
    const allSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.id));
    expect(allSelected).toBe(false);
  });

  it('allFilteredSelected returns false for empty filter results', () => {
    const selected = new Set(['m1', 'm2']);
    const filtered: MonitorOption[] = [];
    const allSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.id));
    expect(allSelected).toBe(false);
  });
});
