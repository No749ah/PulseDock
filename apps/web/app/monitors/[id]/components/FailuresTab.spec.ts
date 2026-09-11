/**
 * Unit tests for FailuresTab pure logic.
 * Tests failure pattern sorting, period filtering, percentage calculation, and trend analysis.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

interface FailurePattern {
  pattern: string;
  count: number;
  percentage: number;
  firstSeen: string;
  lastSeen: string;
  exampleMessage: string;
  weeklyTrend: number[];
}

interface FailurePatternsData {
  totalFailures: number;
  uniquePatterns: number;
  patterns: FailurePattern[];
}

type Period = 7 | 30 | 90;
const VALID_PERIODS: Period[] = [7, 30, 90];

function isPeriodValid(period: number): period is Period {
  return (VALID_PERIODS as number[]).includes(period);
}

function topPatterns(data: FailurePatternsData, limit = 10): FailurePattern[] {
  return [...data.patterns]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function hasPatterns(data: FailurePatternsData | null): boolean {
  if (!data) return false;
  return data.patterns.length > 0;
}

function dominantPattern(data: FailurePatternsData): FailurePattern | null {
  if (!data.patterns.length) return null;
  return data.patterns.reduce((max, p) => p.count > max.count ? p : max);
}

function trendIsWorsening(trend: number[]): boolean {
  if (trend.length < 2) return false;
  const first = trend.slice(0, Math.ceil(trend.length / 2)).reduce((a, b) => a + b, 0);
  const last = trend.slice(Math.ceil(trend.length / 2)).reduce((a, b) => a + b, 0);
  return last > first;
}

function formatPercentage(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

function periodLabel(p: Period): string {
  return `${p}d`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePattern(pattern: string, count: number, pct: number, trend: number[] = [1,1,1,1,1,1,1]): FailurePattern {
  return {
    pattern,
    count,
    percentage: pct,
    firstSeen: '2026-01-01T00:00:00Z',
    lastSeen: '2026-01-07T00:00:00Z',
    exampleMessage: `Example: ${pattern}`,
    weeklyTrend: trend,
  };
}

function makeData(patterns: FailurePattern[]): FailurePatternsData {
  const total = patterns.reduce((a, p) => a + p.count, 0);
  return { totalFailures: total, uniquePatterns: patterns.length, patterns };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FailuresTab — isPeriodValid', () => {
  it('accepts valid periods', () => {
    expect(isPeriodValid(7)).toBe(true);
    expect(isPeriodValid(30)).toBe(true);
    expect(isPeriodValid(90)).toBe(true);
  });

  it('rejects invalid periods', () => {
    expect(isPeriodValid(1)).toBe(false);
    expect(isPeriodValid(14)).toBe(false);
    expect(isPeriodValid(365)).toBe(false);
  });
});

describe('FailuresTab — hasPatterns', () => {
  it('returns false for null data', () => {
    expect(hasPatterns(null)).toBe(false);
  });

  it('returns false for empty patterns array', () => {
    expect(hasPatterns(makeData([]))).toBe(false);
  });

  it('returns true when patterns exist', () => {
    expect(hasPatterns(makeData([makePattern('timeout', 10, 50)]))).toBe(true);
  });
});

describe('FailuresTab — topPatterns', () => {
  it('returns patterns sorted by count descending', () => {
    const data = makeData([
      makePattern('dns', 5, 10),
      makePattern('timeout', 20, 40),
      makePattern('tls', 1, 2),
      makePattern('http-500', 15, 30),
    ]);
    const top = topPatterns(data);
    expect(top[0].pattern).toBe('timeout');
    expect(top[1].pattern).toBe('http-500');
    expect(top[2].pattern).toBe('dns');
    expect(top[3].pattern).toBe('tls');
  });

  it('respects the limit parameter', () => {
    const patterns = Array.from({ length: 15 }, (_, i) =>
      makePattern(`pattern-${i}`, 15 - i, 5)
    );
    const data = makeData(patterns);
    expect(topPatterns(data, 5)).toHaveLength(5);
    expect(topPatterns(data, 10)).toHaveLength(10);
  });

  it('returns all patterns when fewer than limit', () => {
    const data = makeData([makePattern('a', 5, 50), makePattern('b', 3, 30)]);
    expect(topPatterns(data, 10)).toHaveLength(2);
  });

  it('does not mutate the original array', () => {
    const original = [makePattern('a', 5, 50), makePattern('b', 20, 100)];
    const data = makeData(original);
    topPatterns(data);
    expect(data.patterns[0].pattern).toBe('a'); // insertion order preserved
  });
});

describe('FailuresTab — dominantPattern', () => {
  it('returns null for empty data', () => {
    expect(dominantPattern(makeData([]))).toBeNull();
  });

  it('returns the pattern with highest count', () => {
    const data = makeData([
      makePattern('dns', 5, 10),
      makePattern('timeout', 20, 40),
    ]);
    expect(dominantPattern(data)?.pattern).toBe('timeout');
  });

  it('returns single pattern for single-element data', () => {
    const data = makeData([makePattern('only', 100, 100)]);
    expect(dominantPattern(data)?.count).toBe(100);
  });
});

describe('FailuresTab — trendIsWorsening', () => {
  it('returns false for single-element trend', () => {
    expect(trendIsWorsening([5])).toBe(false);
  });

  it('returns false for empty trend', () => {
    expect(trendIsWorsening([])).toBe(false);
  });

  it('detects worsening trend (increasing failures)', () => {
    expect(trendIsWorsening([1, 1, 1, 5, 5, 5, 10])).toBe(true);
  });

  it('detects improving trend (decreasing failures)', () => {
    expect(trendIsWorsening([10, 10, 10, 2, 1, 1, 0])).toBe(false);
  });

  it('detects flat trend as not worsening', () => {
    expect(trendIsWorsening([5, 5, 5, 5, 5, 5])).toBe(false);
  });
});

describe('FailuresTab — formatPercentage', () => {
  it('formats to 1 decimal place', () => {
    expect(formatPercentage(50)).toBe('50.0%');
    expect(formatPercentage(33.333)).toBe('33.3%');
  });

  it('handles 0%', () => {
    expect(formatPercentage(0)).toBe('0.0%');
  });

  it('handles 100%', () => {
    expect(formatPercentage(100)).toBe('100.0%');
  });
});

describe('FailuresTab — periodLabel', () => {
  it('7 → "7d"', () => expect(periodLabel(7)).toBe('7d'));
  it('30 → "30d"', () => expect(periodLabel(30)).toBe('30d'));
  it('90 → "90d"', () => expect(periodLabel(90)).toBe('90d'));
});
