/**
 * Unit tests for AlertFiltersPanel pure logic.
 * Tests channel count pluralisation, column visibility toggle, and state derivations.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from the component ────────────────────────────────────────

function channelsLabel(count: number): string {
  return `${count} ${count === 1 ? 'channel' : 'channels'} configured`;
}

function toggleColVisibility(
  visibleCols: Record<string, boolean>,
  col: string,
): Record<string, boolean> {
  return { ...visibleCols, [col]: !visibleCols[col] };
}

function isColVisible(visibleCols: Record<string, boolean>, col: string): boolean {
  // Default to true if not specified
  return visibleCols[col] !== false;
}

// Whether the "Test All" button should be shown (only when channels exist)
function showTestAll(channelsCount: number): boolean {
  return channelsCount > 0;
}

// Whether column picker button should show active styling
function colPickerActive(showColPicker: boolean): boolean {
  return showColPicker;
}

const ALL_COLUMNS = ['name', 'type', 'lastTriggered', 'created', 'actions'] as const;
type ColumnKey = typeof ALL_COLUMNS[number];

function buildDefaultVisibility(): Record<ColumnKey, boolean> {
  return Object.fromEntries(ALL_COLUMNS.map((c) => [c, true])) as Record<ColumnKey, boolean>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AlertFiltersPanel — channelsLabel', () => {
  it('uses singular "channel" for count of 1', () => {
    expect(channelsLabel(1)).toBe('1 channel configured');
  });

  it('uses plural "channels" for count of 0', () => {
    expect(channelsLabel(0)).toBe('0 channels configured');
  });

  it('uses plural "channels" for count of 2+', () => {
    expect(channelsLabel(2)).toBe('2 channels configured');
    expect(channelsLabel(10)).toBe('10 channels configured');
    expect(channelsLabel(100)).toBe('100 channels configured');
  });
});

describe('AlertFiltersPanel — showTestAll', () => {
  it('shows Test All button when channels > 0', () => {
    expect(showTestAll(1)).toBe(true);
    expect(showTestAll(5)).toBe(true);
  });

  it('hides Test All button when no channels', () => {
    expect(showTestAll(0)).toBe(false);
  });
});

describe('AlertFiltersPanel — colPickerActive', () => {
  it('returns true when col picker is open', () => {
    expect(colPickerActive(true)).toBe(true);
  });

  it('returns false when col picker is closed', () => {
    expect(colPickerActive(false)).toBe(false);
  });
});

describe('AlertFiltersPanel — toggleColVisibility', () => {
  it('hides a visible column', () => {
    const cols = buildDefaultVisibility();
    const next = toggleColVisibility(cols, 'type');
    expect(next['type']).toBe(false);
  });

  it('shows a hidden column', () => {
    const cols = { ...buildDefaultVisibility(), type: false };
    const next = toggleColVisibility(cols, 'type');
    expect(next['type']).toBe(true);
  });

  it('does not mutate the original object', () => {
    const cols = buildDefaultVisibility();
    toggleColVisibility(cols, 'name');
    expect(cols['name']).toBe(true); // unchanged
  });

  it('toggles only the specified column', () => {
    const cols = buildDefaultVisibility();
    const next = toggleColVisibility(cols, 'lastTriggered');
    expect(next['lastTriggered']).toBe(false);
    expect(next['name']).toBe(true);
    expect(next['type']).toBe(true);
  });
});

describe('AlertFiltersPanel — isColVisible', () => {
  it('returns true for explicitly visible column', () => {
    expect(isColVisible({ name: true }, 'name')).toBe(true);
  });

  it('returns false for explicitly hidden column', () => {
    expect(isColVisible({ name: false }, 'name')).toBe(false);
  });

  it('defaults to true for unknown column (not yet set)', () => {
    expect(isColVisible({}, 'newCol')).toBe(true);
  });
});

describe('AlertFiltersPanel — buildDefaultVisibility', () => {
  it('returns all 5 columns as visible', () => {
    const defaults = buildDefaultVisibility();
    expect(Object.keys(defaults)).toHaveLength(5);
    expect(Object.values(defaults).every(Boolean)).toBe(true);
  });

  it('includes all expected column keys', () => {
    const defaults = buildDefaultVisibility();
    ALL_COLUMNS.forEach((col) => {
      expect(defaults).toHaveProperty(col, true);
    });
  });
});

describe('AlertFiltersPanel — multi-toggle sequence', () => {
  it('toggle twice restores original state', () => {
    const cols = buildDefaultVisibility();
    const after1 = toggleColVisibility(cols, 'actions');
    const after2 = toggleColVisibility(after1, 'actions');
    expect(after2['actions']).toBe(true);
  });

  it('can hide multiple columns independently', () => {
    let cols = buildDefaultVisibility();
    cols = toggleColVisibility(cols, 'type');
    cols = toggleColVisibility(cols, 'created');
    expect(cols['type']).toBe(false);
    expect(cols['created']).toBe(false);
    expect(cols['name']).toBe(true); // untouched
  });
});
