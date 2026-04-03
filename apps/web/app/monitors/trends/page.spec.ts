import { describe, it, expect } from 'vitest';

// ─── Extracted pure logic from monitors/trends/page.tsx ──────────────────────
// (Testing the pure color/value logic, not the JSX rendering)

type UptimeTrend = 'improving' | 'degrading' | 'stable' | 'new';
type LatencyTrend = 'improving' | 'degrading' | 'stable' | 'new';

function deltaColorClass(value: number, invertColors: boolean): string {
  const positive = value > 0;
  return positive
    ? (invertColors ? 'text-red-400' : 'text-green-400')
    : (invertColors ? 'text-green-400' : 'text-red-400');
}

function uptimePctColorClass(pct: number): string {
  return pct >= 99 ? 'text-green-400' : pct >= 95 ? 'text-yellow-400' : 'text-red-400';
}

function latencyColorClass(ms: number): string {
  return ms < 500 ? 'text-green-400' : ms < 1500 ? 'text-yellow-400' : 'text-red-400';
}

function formatDelta(value: number, unit: string): string {
  return `${Math.abs(value).toFixed(1)}${unit}`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('monitors/trends/page — deltaColorClass', () => {
  it('positive value without invertColors → green', () => {
    expect(deltaColorClass(5, false)).toBe('text-green-400');
  });

  it('positive value with invertColors → red', () => {
    expect(deltaColorClass(5, true)).toBe('text-red-400');
  });

  it('negative value without invertColors → red', () => {
    expect(deltaColorClass(-3, false)).toBe('text-red-400');
  });

  it('negative value with invertColors → green', () => {
    expect(deltaColorClass(-3, true)).toBe('text-green-400');
  });

  it('positive 0.1 without invertColors → green', () => {
    expect(deltaColorClass(0.1, false)).toBe('text-green-400');
  });

  it('negative 0.1 without invertColors → red', () => {
    expect(deltaColorClass(-0.1, false)).toBe('text-red-400');
  });
});

describe('monitors/trends/page — uptimePctColorClass', () => {
  it('returns text-green-400 at exactly 99', () => {
    expect(uptimePctColorClass(99)).toBe('text-green-400');
  });

  it('returns text-green-400 at 100', () => {
    expect(uptimePctColorClass(100)).toBe('text-green-400');
  });

  it('returns text-green-400 at 99.5', () => {
    expect(uptimePctColorClass(99.5)).toBe('text-green-400');
  });

  it('returns text-yellow-400 at 95', () => {
    expect(uptimePctColorClass(95)).toBe('text-yellow-400');
  });

  it('returns text-yellow-400 at 98.9', () => {
    expect(uptimePctColorClass(98.9)).toBe('text-yellow-400');
  });

  it('returns text-yellow-400 at 95.0', () => {
    expect(uptimePctColorClass(95.0)).toBe('text-yellow-400');
  });

  it('returns text-red-400 below 95 (94.9)', () => {
    expect(uptimePctColorClass(94.9)).toBe('text-red-400');
  });

  it('returns text-red-400 at 0', () => {
    expect(uptimePctColorClass(0)).toBe('text-red-400');
  });
});

describe('monitors/trends/page — latencyColorClass', () => {
  it('returns text-green-400 at 0ms', () => {
    expect(latencyColorClass(0)).toBe('text-green-400');
  });

  it('returns text-green-400 at 499ms (< 500)', () => {
    expect(latencyColorClass(499)).toBe('text-green-400');
  });

  it('returns text-yellow-400 at exactly 500ms', () => {
    expect(latencyColorClass(500)).toBe('text-yellow-400');
  });

  it('returns text-yellow-400 at 1000ms', () => {
    expect(latencyColorClass(1000)).toBe('text-yellow-400');
  });

  it('returns text-yellow-400 at 1499ms (< 1500)', () => {
    expect(latencyColorClass(1499)).toBe('text-yellow-400');
  });

  it('returns text-red-400 at exactly 1500ms', () => {
    expect(latencyColorClass(1500)).toBe('text-red-400');
  });

  it('returns text-red-400 at 5000ms', () => {
    expect(latencyColorClass(5000)).toBe('text-red-400');
  });
});

describe('monitors/trends/page — formatDelta', () => {
  it('formats positive value with unit correctly', () => {
    expect(formatDelta(5.7, '%')).toBe('5.7%');
  });

  it('strips sign from negative values', () => {
    expect(formatDelta(-3.2, '%')).toBe('3.2%');
  });

  it('formats ms unit', () => {
    expect(formatDelta(120.5, 'ms')).toBe('120.5ms');
  });

  it('shows 1 decimal place', () => {
    expect(formatDelta(1, '%')).toBe('1.0%');
  });

  it('works with no unit (empty string)', () => {
    expect(formatDelta(7.3, '')).toBe('7.3');
  });

  it('handles 0 correctly', () => {
    expect(formatDelta(0, '%')).toBe('0.0%');
  });
});
