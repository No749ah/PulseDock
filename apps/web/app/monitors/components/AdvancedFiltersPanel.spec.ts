/**
 * Unit tests for AdvancedFiltersPanel pure logic.
 * Tests status/type filter options, toggle set logic, and active filter counting.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

const STATUS_OPTIONS = [
  { key: 'up', label: 'Up', color: 'text-success' },
  { key: 'down', label: 'Down', color: 'text-danger' },
  { key: 'degraded', label: 'Degraded', color: 'text-warning' },
  { key: 'paused', label: 'Paused', color: 'text-text-secondary' },
] as const;

const TYPE_OPTIONS = [
  { key: 'HTTP' }, { key: 'TCP' }, { key: 'SSL_CERT' }, { key: 'HEARTBEAT' },
  { key: 'DNS' }, { key: 'PING' }, { key: 'SMTP' }, { key: 'BROWSER' },
  { key: 'GIT_RELEASE' }, { key: 'DOCKER_IMAGE' }, { key: 'WHOIS' },
  { key: 'FTP' }, { key: 'IMAP' }, { key: 'POP3' }, { key: 'CT_LOG' },
  { key: 'GRAPHQL' }, { key: 'TRANSACTION' },
] as const;

function toggleSet<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) {
    next.delete(item);
  } else {
    next.add(item);
  }
  return next;
}

function countActiveFilters(
  filterStatuses: Set<string>,
  filterTypes: Set<string>,
  filterTags: Set<string>,
): number {
  return filterStatuses.size + filterTypes.size + filterTags.size;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AdvancedFiltersPanel — STATUS_OPTIONS', () => {
  it('has 4 status options', () => {
    expect(STATUS_OPTIONS).toHaveLength(4);
  });

  it('contains expected status keys', () => {
    const keys = STATUS_OPTIONS.map((s) => s.key);
    expect(keys).toContain('up');
    expect(keys).toContain('down');
    expect(keys).toContain('degraded');
    expect(keys).toContain('paused');
  });

  it('each option has a non-empty label and color', () => {
    STATUS_OPTIONS.forEach(({ label, color }) => {
      expect(label.length).toBeGreaterThan(0);
      expect(color.length).toBeGreaterThan(0);
    });
  });

  it('color classes start with "text-"', () => {
    STATUS_OPTIONS.forEach(({ color }) => {
      expect(color.startsWith('text-')).toBe(true);
    });
  });
});

describe('AdvancedFiltersPanel — TYPE_OPTIONS', () => {
  it('has 17 monitor type options', () => {
    expect(TYPE_OPTIONS).toHaveLength(17);
  });

  it('contains core type keys', () => {
    const keys = TYPE_OPTIONS.map((t) => t.key);
    expect(keys).toContain('HTTP');
    expect(keys).toContain('TCP');
    expect(keys).toContain('SSL_CERT');
    expect(keys).toContain('HEARTBEAT');
    expect(keys).toContain('DNS');
    expect(keys).toContain('GRAPHQL');
    expect(keys).toContain('BROWSER');
  });

  it('contains version-related types', () => {
    const keys = TYPE_OPTIONS.map((t) => t.key);
    expect(keys).toContain('GIT_RELEASE');
    expect(keys).toContain('DOCKER_IMAGE');
  });

  it('has unique keys', () => {
    const keys = TYPE_OPTIONS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('AdvancedFiltersPanel — toggleSet', () => {
  it('adds item when not present', () => {
    const set = new Set(['up']);
    const result = toggleSet(set, 'down');
    expect(result.has('down')).toBe(true);
    expect(result.has('up')).toBe(true);
  });

  it('removes item when already present', () => {
    const set = new Set(['up', 'down']);
    const result = toggleSet(set, 'up');
    expect(result.has('up')).toBe(false);
    expect(result.has('down')).toBe(true);
  });

  it('does not mutate original set', () => {
    const set = new Set(['up']);
    toggleSet(set, 'down');
    expect(set.has('down')).toBe(false);
  });

  it('handles empty set add', () => {
    const result = toggleSet(new Set<string>(), 'paused');
    expect(result.has('paused')).toBe(true);
    expect(result.size).toBe(1);
  });

  it('handles removing from single-element set', () => {
    const result = toggleSet(new Set(['only']), 'only');
    expect(result.size).toBe(0);
  });
});

describe('AdvancedFiltersPanel — countActiveFilters', () => {
  it('returns 0 with all empty sets', () => {
    expect(countActiveFilters(new Set(), new Set(), new Set())).toBe(0);
  });

  it('sums all filter sets', () => {
    expect(countActiveFilters(
      new Set(['up', 'down']),
      new Set(['HTTP']),
      new Set(['tag1', 'tag2', 'tag3']),
    )).toBe(6);
  });

  it('counts only status filters', () => {
    expect(countActiveFilters(new Set(['up', 'degraded']), new Set(), new Set())).toBe(2);
  });

  it('counts only type filters', () => {
    expect(countActiveFilters(new Set(), new Set(['HTTP', 'TCP', 'DNS']), new Set())).toBe(3);
  });

  it('counts only tag filters', () => {
    expect(countActiveFilters(new Set(), new Set(), new Set(['prod', 'critical']))).toBe(2);
  });
});
