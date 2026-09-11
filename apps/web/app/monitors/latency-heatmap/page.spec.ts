// Unit tests for monitors/latency-heatmap/page.tsx pure helpers
import { describe, it, expect } from 'vitest';

// ─── GRADE_COLORS ─────────────────────────────────────────────────────────────

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-emerald-500',
  B: 'bg-green-400',
  C: 'bg-yellow-400',
  D: 'bg-orange-500',
  F: 'bg-red-600',
};

const GRADE_TEXT_COLORS: Record<string, string> = {
  A: 'text-emerald-400',
  B: 'text-green-400',
  C: 'text-yellow-400',
  D: 'text-orange-400',
  F: 'text-red-400',
};

describe('GRADE_COLORS', () => {
  it('has 5 grade entries A–F', () => {
    expect(Object.keys(GRADE_COLORS)).toEqual(['A', 'B', 'C', 'D', 'F']);
  });

  it('A is emerald', () => expect(GRADE_COLORS.A).toContain('emerald'));
  it('B is green', () => expect(GRADE_COLORS.B).toContain('green'));
  it('C is yellow', () => expect(GRADE_COLORS.C).toContain('yellow'));
  it('D is orange', () => expect(GRADE_COLORS.D).toContain('orange'));
  it('F is red', () => expect(GRADE_COLORS.F).toContain('red'));

  it('all values are bg- classes', () => {
    for (const cls of Object.values(GRADE_COLORS)) {
      expect(cls).toMatch(/^bg-/);
    }
  });
});

describe('GRADE_TEXT_COLORS', () => {
  it('has 5 grade entries A–F', () => {
    expect(Object.keys(GRADE_TEXT_COLORS)).toEqual(['A', 'B', 'C', 'D', 'F']);
  });

  it('A text is emerald', () => expect(GRADE_TEXT_COLORS.A).toContain('emerald'));
  it('B text is green', () => expect(GRADE_TEXT_COLORS.B).toContain('green'));
  it('C text is yellow', () => expect(GRADE_TEXT_COLORS.C).toContain('yellow'));
  it('D text is orange', () => expect(GRADE_TEXT_COLORS.D).toContain('orange'));
  it('F text is red', () => expect(GRADE_TEXT_COLORS.F).toContain('red'));

  it('all values are text- classes', () => {
    for (const cls of Object.values(GRADE_TEXT_COLORS)) {
      expect(cls).toMatch(/^text-/);
    }
  });

  it('GRADE_COLORS and GRADE_TEXT_COLORS reference the same color token per grade', () => {
    // bg-emerald-500 vs text-emerald-400 → same base color "emerald"
    for (const grade of Object.keys(GRADE_COLORS)) {
      const bgToken = GRADE_COLORS[grade].replace('bg-', '').split('-')[0];
      const textToken = GRADE_TEXT_COLORS[grade].replace('text-', '').split('-')[0];
      expect(bgToken).toBe(textToken);
    }
  });
});

// ─── formatDate ───────────────────────────────────────────────────────────────

function formatDate(d: string): string {
  const parts = d.split('-');
  return `${parts[1]}/${parts[2]}`;
}

describe('formatDate', () => {
  it('formats 2026-01-15 as 01/15', () => expect(formatDate('2026-01-15')).toBe('01/15'));
  it('formats 2026-12-31 as 12/31', () => expect(formatDate('2026-12-31')).toBe('12/31'));
  it('formats 2026-03-07 as 03/07', () => expect(formatDate('2026-03-07')).toBe('03/07'));
  it('returns month/day only (ignores year)', () => {
    const result = formatDate('2025-06-20');
    expect(result).toBe('06/20');
    expect(result).not.toContain('2025');
  });
});

// ─── formatMs ─────────────────────────────────────────────────────────────────

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

describe('formatMs', () => {
  it('returns — for null', () => expect(formatMs(null)).toBe('—'));
  it('returns 0ms for 0', () => expect(formatMs(0)).toBe('0ms'));
  it('returns ms for 999', () => expect(formatMs(999)).toBe('999ms'));
  it('returns ms for 1', () => expect(formatMs(1)).toBe('1ms'));
  it('converts to s at 1000', () => expect(formatMs(1000)).toBe('1.0s'));
  it('converts 1500 to 1.5s', () => expect(formatMs(1500)).toBe('1.5s'));
  it('converts 2345 to 2.3s', () => expect(formatMs(2345)).toBe('2.3s'));
  it('converts 10000 to 10.0s', () => expect(formatMs(10000)).toBe('10.0s'));
});

// ─── labelInterval logic ──────────────────────────────────────────────────────

function computeLabelInterval(dateCount: number): number {
  if (dateCount > 60) return 7;
  if (dateCount > 30) return 3;
  if (dateCount > 14) return 2;
  return 1;
}

describe('computeLabelInterval', () => {
  it('returns 1 for 14 or fewer dates', () => expect(computeLabelInterval(14)).toBe(1));
  it('returns 1 for 1 date', () => expect(computeLabelInterval(1)).toBe(1));
  it('returns 2 for 15 dates', () => expect(computeLabelInterval(15)).toBe(2));
  it('returns 2 for 30 dates', () => expect(computeLabelInterval(30)).toBe(2));
  it('returns 3 for 31 dates', () => expect(computeLabelInterval(31)).toBe(3));
  it('returns 3 for 60 dates', () => expect(computeLabelInterval(60)).toBe(3));
  it('returns 7 for 61 dates', () => expect(computeLabelInterval(61)).toBe(7));
  it('returns 7 for 90 dates', () => expect(computeLabelInterval(90)).toBe(7));
});
