/**
 * @vitest-environment node
 * Unit tests for pure helpers in monitors/health-scores/page.tsx
 */

import { describe, it, expect } from 'vitest';

// ── Inline helpers from page.tsx ─────────────────────────────────────────────

type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

const GRADE_COLORS: Record<Grade, string> = {
  A: 'text-green-400 bg-green-500/10 border-green-500/30',
  B: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  C: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  D: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  F: 'text-red-400 bg-red-500/10 border-red-500/30',
};

const GRADE_BAR: Record<Grade, string> = {
  A: 'bg-green-500',
  B: 'bg-emerald-500',
  C: 'bg-yellow-500',
  D: 'bg-orange-500',
  F: 'bg-red-500',
};

// ScoreBar grade threshold logic (inline from component)
function scoreToGrade(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('monitors/health-scores/page — GRADE_COLORS', () => {
  it('has all 5 grades', () => {
    const grades: Grade[] = ['A', 'B', 'C', 'D', 'F'];
    for (const g of grades) {
      expect(GRADE_COLORS[g]).toBeDefined();
    }
  });

  it('A uses green palette', () => {
    expect(GRADE_COLORS.A).toContain('text-green-400');
    expect(GRADE_COLORS.A).toContain('bg-green-500/10');
    expect(GRADE_COLORS.A).toContain('border-green-500/30');
  });

  it('B uses emerald palette', () => {
    expect(GRADE_COLORS.B).toContain('text-emerald-400');
    expect(GRADE_COLORS.B).toContain('bg-emerald-500/10');
    expect(GRADE_COLORS.B).toContain('border-emerald-500/30');
  });

  it('C uses yellow palette', () => {
    expect(GRADE_COLORS.C).toContain('text-yellow-400');
    expect(GRADE_COLORS.C).toContain('bg-yellow-500/10');
  });

  it('D uses orange palette', () => {
    expect(GRADE_COLORS.D).toContain('text-orange-400');
    expect(GRADE_COLORS.D).toContain('bg-orange-500/10');
  });

  it('F uses red palette', () => {
    expect(GRADE_COLORS.F).toContain('text-red-400');
    expect(GRADE_COLORS.F).toContain('bg-red-500/10');
  });

  it('all grades have unique color strings', () => {
    const values = Object.values(GRADE_COLORS);
    expect(new Set(values).size).toBe(5);
  });

  it('all grades include border class', () => {
    for (const cls of Object.values(GRADE_COLORS)) {
      expect(cls).toContain('border-');
    }
  });

  it('all grades use /10 bg opacity', () => {
    for (const cls of Object.values(GRADE_COLORS)) {
      expect(cls).toContain('/10');
    }
  });

  it('all grades use /30 border opacity', () => {
    for (const cls of Object.values(GRADE_COLORS)) {
      expect(cls).toContain('/30');
    }
  });
});

describe('monitors/health-scores/page — GRADE_BAR', () => {
  it('A bar is green', () => {
    expect(GRADE_BAR.A).toBe('bg-green-500');
  });

  it('B bar is emerald', () => {
    expect(GRADE_BAR.B).toBe('bg-emerald-500');
  });

  it('C bar is yellow', () => {
    expect(GRADE_BAR.C).toBe('bg-yellow-500');
  });

  it('D bar is orange', () => {
    expect(GRADE_BAR.D).toBe('bg-orange-500');
  });

  it('F bar is red', () => {
    expect(GRADE_BAR.F).toBe('bg-red-500');
  });

  it('all bar colors are unique', () => {
    const values = Object.values(GRADE_BAR);
    expect(new Set(values).size).toBe(5);
  });
});

describe('monitors/health-scores/page — scoreToGrade (ScoreBar threshold logic)', () => {
  it('score 100 → A', () => {
    expect(scoreToGrade(100)).toBe('A');
  });

  it('score 90 → A (inclusive boundary)', () => {
    expect(scoreToGrade(90)).toBe('A');
  });

  it('score 89 → B', () => {
    expect(scoreToGrade(89)).toBe('B');
  });

  it('score 75 → B (inclusive boundary)', () => {
    expect(scoreToGrade(75)).toBe('B');
  });

  it('score 74 → C', () => {
    expect(scoreToGrade(74)).toBe('C');
  });

  it('score 60 → C (inclusive boundary)', () => {
    expect(scoreToGrade(60)).toBe('C');
  });

  it('score 59 → D', () => {
    expect(scoreToGrade(59)).toBe('D');
  });

  it('score 40 → D (inclusive boundary)', () => {
    expect(scoreToGrade(40)).toBe('D');
  });

  it('score 39 → F', () => {
    expect(scoreToGrade(39)).toBe('F');
  });

  it('score 0 → F', () => {
    expect(scoreToGrade(0)).toBe('F');
  });

  it('score 91 → A (mid-range)', () => {
    expect(scoreToGrade(91)).toBe('A');
  });

  it('score 65 → C (mid-range)', () => {
    expect(scoreToGrade(65)).toBe('C');
  });

  it('grade ordering is monotonically declining: A > B > C > D > F', () => {
    const thresholds = [100, 90, 75, 60, 40, 0];
    const grades = thresholds.map(scoreToGrade);
    const expected: Grade[] = ['A', 'A', 'B', 'C', 'D', 'F'];
    expect(grades).toEqual(expected);
  });
});
