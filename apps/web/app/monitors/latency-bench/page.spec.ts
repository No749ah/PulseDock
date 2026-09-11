/**
 * @vitest-environment node
 * Unit tests for pure helpers in monitors/latency-bench/page.tsx
 */

import { describe, it, expect } from 'vitest';

// ── Inline helpers from page.tsx ─────────────────────────────────────────────

type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

const GRADE_COLORS: Record<Grade, string> = {
  A: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  B: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  C: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  D: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  F: 'text-red-400 bg-red-500/10 border-red-500/30',
};

const GRADE_BAR_COLORS: Record<Grade, string> = {
  A: 'bg-emerald-500',
  B: 'bg-blue-500',
  C: 'bg-yellow-500',
  D: 'bg-orange-500',
  F: 'bg-red-500',
};

const GRADE_LABELS: Record<Grade, string> = {
  A: '< 200ms',
  B: '200–500ms',
  C: '500–1000ms',
  D: '1–2s',
  F: '> 2s',
};

function fmtMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('monitors/latency-bench/page — GRADE_COLORS', () => {
  it('has all 5 grades', () => {
    const grades: Grade[] = ['A', 'B', 'C', 'D', 'F'];
    for (const g of grades) {
      expect(GRADE_COLORS[g]).toBeDefined();
    }
  });

  it('A uses emerald (distinct from health-scores which uses green)', () => {
    expect(GRADE_COLORS.A).toContain('text-emerald-400');
    expect(GRADE_COLORS.A).toContain('bg-emerald-500/10');
  });

  it('B uses blue palette', () => {
    expect(GRADE_COLORS.B).toContain('text-blue-400');
    expect(GRADE_COLORS.B).toContain('bg-blue-500/10');
  });

  it('C uses yellow palette', () => {
    expect(GRADE_COLORS.C).toContain('text-yellow-400');
  });

  it('D uses orange palette', () => {
    expect(GRADE_COLORS.D).toContain('text-orange-400');
  });

  it('F uses red palette', () => {
    expect(GRADE_COLORS.F).toContain('text-red-400');
  });

  it('all grade colors are unique', () => {
    const values = Object.values(GRADE_COLORS);
    expect(new Set(values).size).toBe(5);
  });

  it('all grades include border class', () => {
    for (const cls of Object.values(GRADE_COLORS)) {
      expect(cls).toContain('border-');
    }
  });
});

describe('monitors/latency-bench/page — GRADE_BAR_COLORS', () => {
  it('A bar is emerald', () => {
    expect(GRADE_BAR_COLORS.A).toBe('bg-emerald-500');
  });

  it('B bar is blue', () => {
    expect(GRADE_BAR_COLORS.B).toBe('bg-blue-500');
  });

  it('C bar is yellow', () => {
    expect(GRADE_BAR_COLORS.C).toBe('bg-yellow-500');
  });

  it('D bar is orange', () => {
    expect(GRADE_BAR_COLORS.D).toBe('bg-orange-500');
  });

  it('F bar is red', () => {
    expect(GRADE_BAR_COLORS.F).toBe('bg-red-500');
  });

  it('all bar colors are unique', () => {
    const values = Object.values(GRADE_BAR_COLORS);
    expect(new Set(values).size).toBe(5);
  });
});

describe('monitors/latency-bench/page — GRADE_LABELS', () => {
  it('A label describes sub-200ms range', () => {
    expect(GRADE_LABELS.A).toBe('< 200ms');
  });

  it('B label describes 200–500ms range', () => {
    expect(GRADE_LABELS.B).toBe('200–500ms');
  });

  it('C label describes 500ms–1s range', () => {
    expect(GRADE_LABELS.C).toBe('500–1000ms');
  });

  it('D label describes 1–2s range', () => {
    expect(GRADE_LABELS.D).toBe('1–2s');
  });

  it('F label describes > 2s range', () => {
    expect(GRADE_LABELS.F).toBe('> 2s');
  });

  it('all grade labels are unique', () => {
    const values = Object.values(GRADE_LABELS);
    expect(new Set(values).size).toBe(5);
  });

  it('labels cover all 5 grades', () => {
    expect(Object.keys(GRADE_LABELS)).toHaveLength(5);
  });
});

describe('monitors/latency-bench/page — fmtMs', () => {
  it('returns em dash for null', () => {
    expect(fmtMs(null)).toBe('—');
  });

  it('formats sub-1000ms values with ms suffix', () => {
    expect(fmtMs(0)).toBe('0ms');
    expect(fmtMs(100)).toBe('100ms');
    expect(fmtMs(999)).toBe('999ms');
  });

  it('formats exactly 1000ms as 1.00s', () => {
    expect(fmtMs(1000)).toBe('1.00s');
  });

  it('formats values >= 1000ms in seconds with 2 decimal places', () => {
    expect(fmtMs(1500)).toBe('1.50s');
    expect(fmtMs(2000)).toBe('2.00s');
    expect(fmtMs(5000)).toBe('5.00s');
  });

  it('formats non-round second values correctly', () => {
    expect(fmtMs(1234)).toBe('1.23s');
    expect(fmtMs(9999)).toBe('10.00s');
  });

  it('boundary: 999ms is still ms format', () => {
    expect(fmtMs(999)).toBe('999ms');
    // '999ms' contains 'ms' suffix, not seconds notation
    expect(fmtMs(999)).not.toMatch(/\d+\.\d{2}s$/);
  });

  it('boundary: 1000ms switches to s format', () => {
    expect(fmtMs(1000)).toContain('s');
    expect(fmtMs(1000)).not.toContain('ms');
  });

  it('null produces em dash not string null', () => {
    expect(fmtMs(null)).not.toBe('null');
    expect(fmtMs(null)).not.toBe('');
  });
});
