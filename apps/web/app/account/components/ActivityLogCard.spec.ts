/**
 * Unit tests for ActivityLogCard pure logic.
 * Tests audit log slicing, expand toggle visibility, empty state, and export filename generation.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  action: string;
  createdAt: string;
  metaJson: unknown;
}

const INITIAL_DISPLAY_COUNT = 8;

function getDisplayedEntries(entries: AuditLogEntry[], expanded: boolean): AuditLogEntry[] {
  return expanded ? entries : entries.slice(0, INITIAL_DISPLAY_COUNT);
}

function showExpandButton(entries: AuditLogEntry[]): boolean {
  return entries.length > INITIAL_DISPLAY_COUNT;
}

function expandButtonLabel(entries: AuditLogEntry[], expanded: boolean): string {
  return expanded ? 'Show less' : `Show all ${entries.length} entries`;
}

function isEmpty(entries: AuditLogEntry[]): boolean {
  return entries.length === 0;
}

function exportFilename(format: 'csv' | 'json', date: string): string {
  return `audit-log-${date}.${format}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(id: string, action = 'LOGIN'): AuditLogEntry {
  return { id, action, createdAt: new Date().toISOString(), metaJson: null };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ActivityLogCard — isEmpty', () => {
  it('returns true for empty array', () => expect(isEmpty([])).toBe(true));
  it('returns false for non-empty array', () => {
    expect(isEmpty([makeEntry('1')])).toBe(false);
  });
});

describe('ActivityLogCard — getDisplayedEntries (collapsed)', () => {
  it('returns all entries when count ≤ 8 (no need to collapse)', () => {
    const entries = Array.from({ length: 5 }, (_, i) => makeEntry(String(i)));
    expect(getDisplayedEntries(entries, false)).toHaveLength(5);
  });

  it('returns only first 8 entries when collapsed and more exist', () => {
    const entries = Array.from({ length: 15 }, (_, i) => makeEntry(String(i)));
    expect(getDisplayedEntries(entries, false)).toHaveLength(8);
  });

  it('preserves order (newest entries first if passed in that order)', () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry(String(i)));
    const displayed = getDisplayedEntries(entries, false);
    expect(displayed[0].id).toBe('0');
    expect(displayed[7].id).toBe('7');
  });
});

describe('ActivityLogCard — getDisplayedEntries (expanded)', () => {
  it('returns all entries when expanded', () => {
    const entries = Array.from({ length: 20 }, (_, i) => makeEntry(String(i)));
    expect(getDisplayedEntries(entries, true)).toHaveLength(20);
  });

  it('returns all entries when expanded and count ≤ 8', () => {
    const entries = Array.from({ length: 3 }, (_, i) => makeEntry(String(i)));
    expect(getDisplayedEntries(entries, true)).toHaveLength(3);
  });
});

describe('ActivityLogCard — showExpandButton', () => {
  it('returns false when ≤ 8 entries', () => {
    expect(showExpandButton(Array.from({ length: 8 }, (_, i) => makeEntry(String(i))))).toBe(false);
    expect(showExpandButton([])).toBe(false);
  });

  it('returns true when > 8 entries', () => {
    expect(showExpandButton(Array.from({ length: 9 }, (_, i) => makeEntry(String(i))))).toBe(true);
    expect(showExpandButton(Array.from({ length: 100 }, (_, i) => makeEntry(String(i))))).toBe(true);
  });
});

describe('ActivityLogCard — expandButtonLabel', () => {
  it('shows "Show less" when expanded', () => {
    const entries = Array.from({ length: 20 }, (_, i) => makeEntry(String(i)));
    expect(expandButtonLabel(entries, true)).toBe('Show less');
  });

  it('shows "Show all N entries" when collapsed', () => {
    const entries = Array.from({ length: 20 }, (_, i) => makeEntry(String(i)));
    expect(expandButtonLabel(entries, false)).toBe('Show all 20 entries');
  });

  it('count reflects actual entry count', () => {
    const entries = Array.from({ length: 42 }, (_, i) => makeEntry(String(i)));
    expect(expandButtonLabel(entries, false)).toBe('Show all 42 entries');
  });
});

describe('ActivityLogCard — exportFilename', () => {
  it('generates correct CSV filename', () => {
    expect(exportFilename('csv', '2026-04-02')).toBe('audit-log-2026-04-02.csv');
  });

  it('generates correct JSON filename', () => {
    expect(exportFilename('json', '2026-04-02')).toBe('audit-log-2026-04-02.json');
  });

  it('filename includes date prefix', () => {
    expect(exportFilename('csv', '2026-01-15')).toContain('2026-01-15');
  });
});
