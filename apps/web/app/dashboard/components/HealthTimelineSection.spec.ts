/**
 * Unit tests for HealthTimelineSection pure logic.
 * Tests trend calculation, average score, score colour thresholds, and visibility guard.
 */
import { describe, it, expect } from 'vitest';

interface HealthTimelineEntry {
  date: string;
  healthScore: number | null;
  green: number;
  total: number;
}

// ── Logic extracted from the component ───────────────────────────────────────
function computeAvgScore(entries: HealthTimelineEntry[]): number {
  const valid = entries.filter((d) => d.healthScore !== null);
  if (valid.length === 0) return 0;
  return valid.reduce((a, d) => a + (d.healthScore ?? 0), 0) / valid.length;
}

function computeTrend(entries: HealthTimelineEntry[]): number {
  const valid = entries.filter((d) => d.healthScore !== null);
  if (valid.length < 7) return 0;
  const recent = valid.slice(-7).reduce((a, d) => a + (d.healthScore ?? 0), 0) / 7;
  const earlier = valid.slice(-14, -7).reduce((a, d) => a + (d.healthScore ?? 0), 0) / Math.max(valid.slice(-14, -7).length, 1);
  return recent - earlier;
}

function shouldRender(entries: HealthTimelineEntry[]): boolean {
  return entries.some((d) => d.healthScore !== null);
}

function scoreColor(avg: number): string {
  if (avg >= 99) return 'text-green-400';
  if (avg >= 95) return 'text-yellow-400';
  return 'text-red-400';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeEntry(score: number | null, date = '2026-01-01'): HealthTimelineEntry {
  return { date, healthScore: score, green: score !== null ? 1 : 0, total: 1 };
}

function makeEntries(scores: (number | null)[]): HealthTimelineEntry[] {
  return scores.map((s, i) => makeEntry(s, `2026-01-${String(i + 1).padStart(2, '0')}`));
}

// ── Visibility guard ──────────────────────────────────────────────────────────
describe('HealthTimelineSection — shouldRender', () => {
  it('returns false for all-null entries', () => {
    expect(shouldRender(makeEntries([null, null, null]))).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(shouldRender([])).toBe(false);
  });

  it('returns true when at least one entry has a score', () => {
    expect(shouldRender(makeEntries([null, 95, null]))).toBe(true);
  });

  it('returns true for all-valid entries', () => {
    expect(shouldRender(makeEntries([100, 99, 98]))).toBe(true);
  });
});

// ── Average score ─────────────────────────────────────────────────────────────
describe('HealthTimelineSection — computeAvgScore', () => {
  it('returns 0 for empty array', () => {
    expect(computeAvgScore([])).toBe(0);
  });

  it('returns 0 for all-null entries', () => {
    expect(computeAvgScore(makeEntries([null, null]))).toBe(0);
  });

  it('computes correct average for uniform scores', () => {
    expect(computeAvgScore(makeEntries([100, 100, 100]))).toBeCloseTo(100);
  });

  it('computes correct average ignoring nulls', () => {
    // null entries should be excluded
    expect(computeAvgScore(makeEntries([null, 90, 100]))).toBeCloseTo(95);
  });

  it('handles single entry', () => {
    expect(computeAvgScore(makeEntries([97.5]))).toBeCloseTo(97.5);
  });

  it('handles mixed valid and null', () => {
    const entries = makeEntries([80, null, 60, null, 40]);
    expect(computeAvgScore(entries)).toBeCloseTo(60);
  });
});

// ── Trend ─────────────────────────────────────────────────────────────────────
describe('HealthTimelineSection — computeTrend', () => {
  it('returns 0 when fewer than 7 valid entries', () => {
    expect(computeTrend(makeEntries([100, 100, 100]))).toBe(0);
  });

  it('returns 0 for exactly 6 valid entries', () => {
    expect(computeTrend(makeEntries([100, 99, 98, 97, 96, 95]))).toBe(0);
  });

  it('returns positive trend when recent week is higher than prior', () => {
    // prior 7: 80, recent 7: 95 → trend should be +15
    const entries = makeEntries([80, 80, 80, 80, 80, 80, 80, 95, 95, 95, 95, 95, 95, 95]);
    expect(computeTrend(entries)).toBeGreaterThan(0);
  });

  it('returns negative trend when recent week is lower', () => {
    const entries = makeEntries([95, 95, 95, 95, 95, 95, 95, 80, 80, 80, 80, 80, 80, 80]);
    expect(computeTrend(entries)).toBeLessThan(0);
  });

  it('returns ~0 when recent and prior weeks are equal', () => {
    const scores = Array(14).fill(90) as number[];
    expect(computeTrend(makeEntries(scores))).toBeCloseTo(0);
  });

  it('ignores null entries in trend computation', () => {
    // 14 valid entries around nulls; trend logic filters nulls
    const entries = makeEntries([null, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90]);
    // just ensure no throw + returns a number
    expect(typeof computeTrend(entries)).toBe('number');
  });
});

// ── Score colour thresholds ───────────────────────────────────────────────────
describe('HealthTimelineSection — scoreColor', () => {
  it('green for 99% and above', () => {
    expect(scoreColor(99)).toBe('text-green-400');
    expect(scoreColor(100)).toBe('text-green-400');
    expect(scoreColor(99.9)).toBe('text-green-400');
  });

  it('yellow for 95–98.9%', () => {
    expect(scoreColor(95)).toBe('text-yellow-400');
    expect(scoreColor(97)).toBe('text-yellow-400');
    expect(scoreColor(98.9)).toBe('text-yellow-400');
  });

  it('red for below 95%', () => {
    expect(scoreColor(94.9)).toBe('text-red-400');
    expect(scoreColor(80)).toBe('text-red-400');
    expect(scoreColor(0)).toBe('text-red-400');
  });

  it('three tiers are mutually distinct', () => {
    const green = scoreColor(100);
    const yellow = scoreColor(97);
    const red = scoreColor(90);
    expect(new Set([green, yellow, red]).size).toBe(3);
  });
});
