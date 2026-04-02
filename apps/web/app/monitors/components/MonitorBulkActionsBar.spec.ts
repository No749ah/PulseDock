/**
 * Unit tests for MonitorBulkActionsBar pure logic.
 * Tests visibility condition and valid bulk action types.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

type BulkAction =
  | 'enable' | 'disable' | 'delete' | 'run'
  | 'add-tag' | 'remove-tag'
  | 'update-interval' | 'update-timeout' | 'update-confirmations'
  | 'pause';

const ALL_BULK_ACTIONS: BulkAction[] = [
  'enable', 'disable', 'delete', 'run',
  'add-tag', 'remove-tag',
  'update-interval', 'update-timeout', 'update-confirmations',
  'pause',
];

function shouldRender(selectedCount: number): boolean {
  return selectedCount > 0;
}

function tagActionEnabled(action: 'add-tag' | 'remove-tag', bulkTagId: string): boolean {
  return bulkTagId.length > 0;
}

function valueActionEnabled(action: 'update-interval' | 'update-timeout' | 'update-confirmations', bulkValue: string): boolean {
  return bulkValue.length > 0;
}

function pauseTitle(bulkValue: string): string {
  return `Pause for ${bulkValue || 60} minutes`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MonitorBulkActionsBar — shouldRender', () => {
  it('hides when nothing is selected', () => {
    expect(shouldRender(0)).toBe(false);
  });

  it('shows when one item is selected', () => {
    expect(shouldRender(1)).toBe(true);
  });

  it('shows when many items are selected', () => {
    expect(shouldRender(50)).toBe(true);
  });
});

describe('MonitorBulkActionsBar — ALL_BULK_ACTIONS', () => {
  it('has 10 distinct bulk action types', () => {
    expect(ALL_BULK_ACTIONS).toHaveLength(10);
    expect(new Set(ALL_BULK_ACTIONS).size).toBe(10);
  });

  it('includes core CRUD actions', () => {
    expect(ALL_BULK_ACTIONS).toContain('enable');
    expect(ALL_BULK_ACTIONS).toContain('disable');
    expect(ALL_BULK_ACTIONS).toContain('delete');
    expect(ALL_BULK_ACTIONS).toContain('run');
  });

  it('includes tag actions', () => {
    expect(ALL_BULK_ACTIONS).toContain('add-tag');
    expect(ALL_BULK_ACTIONS).toContain('remove-tag');
  });

  it('includes update value actions', () => {
    expect(ALL_BULK_ACTIONS).toContain('update-interval');
    expect(ALL_BULK_ACTIONS).toContain('update-timeout');
    expect(ALL_BULK_ACTIONS).toContain('update-confirmations');
  });

  it('includes pause action', () => {
    expect(ALL_BULK_ACTIONS).toContain('pause');
  });
});

describe('MonitorBulkActionsBar — tagActionEnabled', () => {
  it('disabled when bulkTagId is empty', () => {
    expect(tagActionEnabled('add-tag', '')).toBe(false);
    expect(tagActionEnabled('remove-tag', '')).toBe(false);
  });

  it('enabled when bulkTagId is set', () => {
    expect(tagActionEnabled('add-tag', 'tag-uuid-123')).toBe(true);
    expect(tagActionEnabled('remove-tag', 'tag-uuid-456')).toBe(true);
  });
});

describe('MonitorBulkActionsBar — valueActionEnabled', () => {
  it('disabled when bulkValue is empty', () => {
    expect(valueActionEnabled('update-interval', '')).toBe(false);
    expect(valueActionEnabled('update-confirmations', '')).toBe(false);
  });

  it('enabled when bulkValue is set', () => {
    expect(valueActionEnabled('update-interval', '60')).toBe(true);
    expect(valueActionEnabled('update-timeout', '5000')).toBe(true);
    expect(valueActionEnabled('update-confirmations', '3')).toBe(true);
  });
});

describe('MonitorBulkActionsBar — pauseTitle', () => {
  it('uses provided bulk value', () => {
    expect(pauseTitle('30')).toBe('Pause for 30 minutes');
    expect(pauseTitle('120')).toBe('Pause for 120 minutes');
  });

  it('defaults to 60 when bulk value is empty', () => {
    expect(pauseTitle('')).toBe('Pause for 60 minutes');
  });
});
