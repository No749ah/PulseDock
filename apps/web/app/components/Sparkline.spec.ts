/**
 * Unit tests for Sparkline data-logic helpers.
 * We extract and test pure computation functions from Sparkline.tsx.
 */
import { describe, it, expect } from 'vitest';

interface SparklineRun {
  ok: boolean;
  checkedAt: string;
  latencyMs?: number | null;
  level?: 'green' | 'yellow' | 'red' | null;
}

/** Mirrors the Sparkline component's aria-label computation logic */
function computeAriaLabel(runs: SparklineRun[]): string {
  if (runs.length === 0) return 'No check history';
  const last30 = runs.slice(0, 30).reverse();
  const N = last30.length;
  const passing = last30.filter((r) => r.ok).length;
  const degraded = last30.filter((r) => r.level === 'yellow').length;
  return `${passing}/${N} passing${degraded > 0 ? `, ${degraded} degraded` : ''}`;
}

/** Mirrors bar fill color logic */
function barFill(run: SparklineRun): string {
  const isYellow = run.level === 'yellow';
  return isYellow ? '#f59e0b' : run.ok ? '#22c55e' : '#ef4444';
}

/** Mirrors bar height ratio */
function barHeightRatio(run: SparklineRun): number {
  const isYellow = run.level === 'yellow';
  if (run.ok || isYellow) {
    return isYellow ? 0.65 : 1;
  }
  return 0.5;
}

const makeRun = (overrides: Partial<SparklineRun>): SparklineRun => ({
  ok: true,
  checkedAt: new Date().toISOString(),
  ...overrides,
});

describe('Sparkline — computeAriaLabel', () => {
  it('returns "No check history" for empty runs', () => {
    expect(computeAriaLabel([])).toBe('No check history');
  });

  it('shows all passing when all runs are ok', () => {
    const runs = Array.from({ length: 5 }, () => makeRun({ ok: true }));
    expect(computeAriaLabel(runs)).toBe('5/5 passing');
  });

  it('shows passing/total without degraded mention when no yellow runs', () => {
    const runs = [makeRun({ ok: true }), makeRun({ ok: false }), makeRun({ ok: true })];
    expect(computeAriaLabel(runs)).toBe('2/3 passing');
  });

  it('includes degraded count in label when yellow runs exist', () => {
    const runs = [
      makeRun({ ok: true, level: 'green' }),
      makeRun({ ok: true, level: 'yellow' }),
      makeRun({ ok: false, level: 'red' }),
    ];
    expect(computeAriaLabel(runs)).toBe('2/3 passing, 1 degraded');
  });

  it('limits to last 30 runs', () => {
    const runs = Array.from({ length: 40 }, (_, i) => makeRun({ ok: i % 2 === 0 }));
    const label = computeAriaLabel(runs);
    // Should only count 30 runs
    expect(label).toMatch(/\/30 passing/);
  });

  it('handles 1 run passing', () => {
    const runs = [makeRun({ ok: true })];
    expect(computeAriaLabel(runs)).toBe('1/1 passing');
  });

  it('handles 0 passing with degraded', () => {
    const runs = [makeRun({ ok: false, level: 'red' }), makeRun({ ok: true, level: 'yellow' })];
    expect(computeAriaLabel(runs)).toBe('1/2 passing, 1 degraded');
  });
});

describe('Sparkline — barFill', () => {
  it('returns green for passing run', () => {
    expect(barFill(makeRun({ ok: true, level: 'green' }))).toBe('#22c55e');
  });

  it('returns red for failing run', () => {
    expect(barFill(makeRun({ ok: false, level: 'red' }))).toBe('#ef4444');
  });

  it('returns amber/yellow for degraded run', () => {
    expect(barFill(makeRun({ ok: true, level: 'yellow' }))).toBe('#f59e0b');
  });

  it('yellow level takes precedence over ok status', () => {
    // If level is yellow, color is amber regardless of ok
    expect(barFill(makeRun({ ok: false, level: 'yellow' }))).toBe('#f59e0b');
  });
});

describe('Sparkline — barHeightRatio', () => {
  it('returns full height (1) for green passing runs', () => {
    expect(barHeightRatio(makeRun({ ok: true, level: 'green' }))).toBe(1);
  });

  it('returns half height (0.5) for failing runs', () => {
    expect(barHeightRatio(makeRun({ ok: false, level: 'red' }))).toBe(0.5);
  });

  it('returns 65% height for degraded (yellow) runs', () => {
    expect(barHeightRatio(makeRun({ ok: true, level: 'yellow' }))).toBe(0.65);
  });

  it('returns 65% for yellow level even if ok=false', () => {
    expect(barHeightRatio(makeRun({ ok: false, level: 'yellow' }))).toBe(0.65);
  });
});
