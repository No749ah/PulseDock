/**
 * Unit tests for DeliveryStatsPanel pure logic.
 * Tests success rate color thresholds, last delivery time, dot color, and error display logic.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component + utils ─────────────────────────────────────

function successRateColor(rate: number): string {
  if (rate >= 90) return 'text-green-400';
  if (rate >= 70) return 'text-yellow-400';
  return 'text-red-400';
}

function deliveryDotClass(success: boolean): string {
  return `w-3 h-3 rounded-full cursor-default transition-opacity hover:opacity-70 ${
    success ? 'bg-green-400' : 'bg-red-400'
  }`;
}

function hasRecentLogs(recentLogs: Array<unknown>): boolean {
  return recentLogs.length > 0;
}

function lastDeliveryLabel(lastDeliveryAt: string | null | undefined): string {
  return lastDeliveryAt ? 'relative-time' : 'Never';
}

function firstFailureError(
  recentLogs: Array<{ id: string; success: boolean; errorMessage?: string | null }>,
): string | null {
  const failed = recentLogs.find((l) => !l.success);
  return failed?.errorMessage ?? null;
}

function shouldShowLastFailure(
  lastFailureAt: string | null | undefined,
  recentLogs: Array<{ id: string; success: boolean; errorMessage?: string | null }>,
): boolean {
  if (!lastFailureAt) return false;
  const errorMsg = firstFailureError(recentLogs);
  return !!errorMsg;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeliveryStatsPanel — successRateColor', () => {
  it('≥ 90% → green (healthy)', () => {
    expect(successRateColor(100)).toBe('text-green-400');
    expect(successRateColor(90)).toBe('text-green-400');
  });

  it('70-89% → yellow (degraded)', () => {
    expect(successRateColor(89)).toBe('text-yellow-400');
    expect(successRateColor(70)).toBe('text-yellow-400');
  });

  it('< 70% → red (critical)', () => {
    expect(successRateColor(69)).toBe('text-red-400');
    expect(successRateColor(0)).toBe('text-red-400');
  });

  it('exact boundary at 90 is green', () => {
    expect(successRateColor(90)).toBe('text-green-400');
  });

  it('exact boundary at 70 is yellow', () => {
    expect(successRateColor(70)).toBe('text-yellow-400');
  });
});

describe('DeliveryStatsPanel — deliveryDotClass', () => {
  it('success dot is green', () => {
    expect(deliveryDotClass(true)).toContain('bg-green-400');
  });

  it('failed dot is red', () => {
    expect(deliveryDotClass(false)).toContain('bg-red-400');
  });

  it('both types share base classes', () => {
    const base = 'rounded-full cursor-default';
    expect(deliveryDotClass(true)).toContain(base);
    expect(deliveryDotClass(false)).toContain(base);
  });
});

describe('DeliveryStatsPanel — hasRecentLogs', () => {
  it('returns true for non-empty log array', () => {
    expect(hasRecentLogs([{ id: '1', success: true }])).toBe(true);
  });

  it('returns false for empty array', () => {
    expect(hasRecentLogs([])).toBe(false);
  });
});

describe('DeliveryStatsPanel — lastDeliveryLabel', () => {
  it('returns "Never" when no lastDeliveryAt', () => {
    expect(lastDeliveryLabel(null)).toBe('Never');
    expect(lastDeliveryLabel(undefined)).toBe('Never');
  });

  it('returns placeholder when lastDeliveryAt is provided', () => {
    expect(lastDeliveryLabel('2026-01-01T00:00:00Z')).toBe('relative-time');
  });
});

describe('DeliveryStatsPanel — firstFailureError', () => {
  it('returns null when all deliveries succeeded', () => {
    const logs = [
      { id: '1', success: true, errorMessage: null },
      { id: '2', success: true, errorMessage: null },
    ];
    expect(firstFailureError(logs)).toBeNull();
  });

  it('returns error message of first failed delivery', () => {
    const logs = [
      { id: '1', success: true, errorMessage: null },
      { id: '2', success: false, errorMessage: 'Connection refused' },
    ];
    expect(firstFailureError(logs)).toBe('Connection refused');
  });

  it('returns null when failed delivery has no error message', () => {
    const logs = [{ id: '1', success: false, errorMessage: null }];
    expect(firstFailureError(logs)).toBeNull();
  });

  it('returns null for empty log list', () => {
    expect(firstFailureError([])).toBeNull();
  });
});

describe('DeliveryStatsPanel — shouldShowLastFailure', () => {
  const withError = [{ id: '1', success: false, errorMessage: 'Timeout' }];
  const withoutError = [{ id: '1', success: false, errorMessage: null }];
  const allSuccess = [{ id: '1', success: true, errorMessage: null }];

  it('false when no lastFailureAt', () => {
    expect(shouldShowLastFailure(null, withError)).toBe(false);
  });

  it('false when failure has no error message', () => {
    expect(shouldShowLastFailure('2026-01-01T00:00:00Z', withoutError)).toBe(false);
  });

  it('false when no recent failures in logs', () => {
    expect(shouldShowLastFailure('2026-01-01T00:00:00Z', allSuccess)).toBe(false);
  });

  it('true when lastFailureAt + error message both exist', () => {
    expect(shouldShowLastFailure('2026-01-01T00:00:00Z', withError)).toBe(true);
  });
});

describe('DeliveryStatsPanel — real-world scenarios', () => {
  it('99% success rate → green (healthy channel)', () => {
    expect(successRateColor(99)).toBe('text-green-400');
  });

  it('50% success rate → red (failing channel)', () => {
    expect(successRateColor(50)).toBe('text-red-400');
  });

  it('mixed log produces dots for each entry', () => {
    const logs = [true, false, true, true, false];
    const classes = logs.map(deliveryDotClass);
    expect(classes.filter((c) => c.includes('green'))).toHaveLength(3);
    expect(classes.filter((c) => c.includes('red'))).toHaveLength(2);
  });
});
