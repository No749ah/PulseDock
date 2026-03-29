import { describe, it, expect } from 'vitest';
import { computeMonitorDiff, buildSummary } from './monitors.config-history';

describe('computeMonitorDiff', () => {
  it('returns empty array when nothing changed', () => {
    const state = { name: 'Test', intervalSec: 60, enabled: true };
    expect(computeMonitorDiff(state, state)).toEqual([]);
  });

  it('detects a single field change', () => {
    const before = { name: 'Test', intervalSec: 60 };
    const after = { name: 'Test', intervalSec: 120 };
    const result = computeMonitorDiff(before, after);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ field: 'intervalSec', from: 60, to: 120 });
  });

  it('detects multiple field changes', () => {
    const before = { name: 'Old', target: 'http://old.com', enabled: true };
    const after = { name: 'New', target: 'http://new.com', enabled: false };
    const result = computeMonitorDiff(before, after);
    expect(result).toHaveLength(3);
    const fields = result.map((c) => c.field);
    expect(fields).toContain('name');
    expect(fields).toContain('target');
    expect(fields).toContain('enabled');
  });

  it('normalizes undefined and null as equal (no change)', () => {
    const before = { slaTarget: null };
    const after = { slaTarget: undefined };
    expect(computeMonitorDiff(before, after)).toEqual([]);
  });

  it('detects change from null to value', () => {
    const before = { cronExpression: null };
    const after = { cronExpression: '*/5 * * * *' };
    const result = computeMonitorDiff(before, after);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ field: 'cronExpression', from: null, to: '*/5 * * * *' });
  });

  it('detects boolean toggle', () => {
    const before = { anomalyDetection: false };
    const after = { anomalyDetection: true };
    const result = computeMonitorDiff(before, after);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ field: 'anomalyDetection', from: false, to: true });
  });

  it('ignores fields not in TRACKED_FIELDS', () => {
    const before = { name: 'Test', unknownField: 'a' };
    const after = { name: 'Test', unknownField: 'b' };
    // unknownField is not tracked, so no changes should be detected
    expect(computeMonitorDiff(before, after)).toEqual([]);
  });

  it('detects change from value to null', () => {
    const before = { latencyAlertMs: 500 };
    const after = { latencyAlertMs: null };
    const result = computeMonitorDiff(before, after);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ field: 'latencyAlertMs', from: 500, to: null });
  });
});

describe('buildSummary', () => {
  it('returns fallback for empty changes', () => {
    expect(buildSummary([])).toBe('No tracked fields changed');
  });

  it('formats a single change', () => {
    const changes = [{ field: 'intervalSec', from: 60, to: 120 }];
    expect(buildSummary(changes)).toBe('intervalSec: 60 → 120');
  });

  it('formats up to 3 changes inline without +N more', () => {
    const changes = [
      { field: 'name', from: 'A', to: 'B' },
      { field: 'target', from: 'http://a.com', to: 'http://b.com' },
      { field: 'enabled', from: true, to: false },
    ];
    const result = buildSummary(changes);
    expect(result).toContain('name: A → B');
    expect(result).toContain('target:');
    expect(result).toContain('enabled:');
    expect(result).not.toContain('+');
  });

  it('shows "+N more" when more than 3 changes', () => {
    const changes = Array.from({ length: 5 }, (_, i) => ({
      field: `field${i}`,
      from: i,
      to: i + 1,
    }));
    // Note: field0/field1/etc are not in TRACKED_FIELDS but buildSummary just formats what it's given
    const result = buildSummary(changes);
    expect(result).toContain('+2 more');
  });

  it('truncates long from-values to 30 chars with ellipsis', () => {
    const longVal = 'a'.repeat(40);
    const changes = [{ field: 'target', from: longVal, to: 'http://new.com' }];
    const result = buildSummary(changes);
    expect(result).toContain('...');
    expect(result).not.toContain(longVal);
    // Should contain the truncated version (27 chars + ...)
    expect(result).toContain('a'.repeat(27) + '...');
  });

  it('truncates long to-values to 30 chars with ellipsis', () => {
    const longVal = 'b'.repeat(40);
    const changes = [{ field: 'target', from: 'http://old.com', to: longVal }];
    const result = buildSummary(changes);
    expect(result).toContain('b'.repeat(27) + '...');
  });

  it('handles null values as "null" string', () => {
    const changes = [{ field: 'cronExpression', from: null, to: '*/5 * * * *' }];
    const result = buildSummary(changes);
    expect(result).toContain('null');
    expect(result).toContain('*/5 * * * *');
  });
});
