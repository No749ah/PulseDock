/**
 * Unit tests for RecentActivitySection pure logic.
 * Tests activity feed slicing, ok/error state rendering logic, and empty state.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from the component ────────────────────────────────────────

interface MonitorRun {
  id: string;
  message: string;
  ok: boolean;
  statusCode: number;
  checkedAt: string;
}

function getDisplayRuns(runs: MonitorRun[]): MonitorRun[] {
  return runs.slice(0, 5);
}

function isEmpty(runs: MonitorRun[]): boolean {
  return runs.length === 0;
}

function runBadgeVariant(run: MonitorRun): 'success' | 'danger' {
  return run.ok ? 'success' : 'danger';
}

function runIconType(run: MonitorRun): 'check' | 'alert' {
  return run.ok ? 'check' : 'alert';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRun(id: string, ok: boolean, statusCode = 200): MonitorRun {
  return { id, message: `Monitor ${id}`, ok, statusCode, checkedAt: new Date().toISOString() };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RecentActivitySection — isEmpty', () => {
  it('returns true for empty array', () => {
    expect(isEmpty([])).toBe(true);
  });

  it('returns false when there are runs', () => {
    expect(isEmpty([makeRun('a', true)])).toBe(false);
  });
});

describe('RecentActivitySection — getDisplayRuns', () => {
  it('returns empty array for empty input', () => {
    expect(getDisplayRuns([])).toHaveLength(0);
  });

  it('returns all runs when count ≤ 5', () => {
    const runs = [1, 2, 3].map((i) => makeRun(String(i), true));
    expect(getDisplayRuns(runs)).toHaveLength(3);
  });

  it('caps at 5 even if more runs are available', () => {
    const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => makeRun(String(i), true));
    expect(getDisplayRuns(runs)).toHaveLength(5);
  });

  it('preserves insertion order (most recent first)', () => {
    const runs = [1, 2, 3, 4, 5, 6].map((i) => makeRun(String(i), true));
    const display = getDisplayRuns(runs);
    expect(display[0].id).toBe('1');
    expect(display[4].id).toBe('5');
  });
});

describe('RecentActivitySection — runBadgeVariant', () => {
  it('returns "success" for ok run', () => {
    expect(runBadgeVariant(makeRun('1', true))).toBe('success');
  });

  it('returns "danger" for failed run', () => {
    expect(runBadgeVariant(makeRun('1', false))).toBe('danger');
  });
});

describe('RecentActivitySection — runIconType', () => {
  it('returns "check" icon for ok run', () => {
    expect(runIconType(makeRun('1', true))).toBe('check');
  });

  it('returns "alert" icon for failed run', () => {
    expect(runIconType(makeRun('1', false))).toBe('alert');
  });
});

describe('RecentActivitySection — status code display', () => {
  it('coerces numeric statusCode to string for badge', () => {
    const run = makeRun('1', true, 200);
    expect(String(run.statusCode)).toBe('200');
  });

  it('handles non-2xx codes for failed runs', () => {
    const run = makeRun('1', false, 503);
    expect(String(run.statusCode)).toBe('503');
    expect(runBadgeVariant(run)).toBe('danger');
  });

  it('handles 0 status code (connection error)', () => {
    const run = makeRun('1', false, 0);
    expect(String(run.statusCode)).toBe('0');
  });
});

describe('RecentActivitySection — mixed run list', () => {
  it('correctly classifies mixed ok/error runs', () => {
    const runs = [
      makeRun('1', true, 200),
      makeRun('2', false, 500),
      makeRun('3', true, 200),
      makeRun('4', false, 503),
      makeRun('5', true, 200),
    ];
    const display = getDisplayRuns(runs);
    expect(display.filter((r) => r.ok)).toHaveLength(3);
    expect(display.filter((r) => !r.ok)).toHaveLength(2);
    expect(display.map(runBadgeVariant)).toEqual(['success', 'danger', 'success', 'danger', 'success']);
  });
});
