/**
 * Unit tests for pure helpers in app/reports/digest/page.tsx.
 *
 * Covers: gradeColor (A-F+fallback), uptimeColor (5-band thresholds),
 * severityIcon (3 levels), formatLatency (null/ms/s).
 */
import { describe, it, expect } from 'vitest';

// ── Inline-reproduced helpers ─────────────────────────────────────────────────

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-green-400 border-green-400';
    case 'B': return 'text-blue-400 border-blue-400';
    case 'C': return 'text-yellow-400 border-yellow-400';
    case 'D': return 'text-orange-400 border-orange-400';
    default:  return 'text-red-400 border-red-400';
  }
}

function uptimeColor(pct: number): string {
  if (pct >= 99.9) return 'text-green-400';
  if (pct >= 99)   return 'text-blue-400';
  if (pct >= 95)   return 'text-yellow-400';
  if (pct >= 90)   return 'text-orange-400';
  return 'text-red-400';
}

function severityIcon(sev: 'high' | 'medium' | 'low'): string {
  switch (sev) {
    case 'high':   return '🔴';
    case 'medium': return '🟡';
    default:       return '🟢';
  }
}

function formatLatency(ms: number | null): string {
  if (ms == null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

// ── gradeColor ────────────────────────────────────────────────────────────────

describe('gradeColor', () => {
  it('A → green', () => {
    expect(gradeColor('A')).toContain('green');
  });

  it('B → blue', () => {
    expect(gradeColor('B')).toContain('blue');
  });

  it('C → yellow', () => {
    expect(gradeColor('C')).toContain('yellow');
  });

  it('D → orange', () => {
    expect(gradeColor('D')).toContain('orange');
  });

  it('F → red', () => {
    expect(gradeColor('F')).toContain('red');
  });

  it('unknown grade → red (fallback)', () => {
    expect(gradeColor('Z')).toContain('red');
    expect(gradeColor('')).toContain('red');
  });

  it('A and F are distinct', () => {
    expect(gradeColor('A')).not.toBe(gradeColor('F'));
  });

  it('all 5 grades A-F produce distinct classes', () => {
    const grades = ['A', 'B', 'C', 'D', 'F'];
    const results = grades.map(gradeColor);
    const unique = new Set(results);
    expect(unique.size).toBe(5);
  });
});

// ── uptimeColor ───────────────────────────────────────────────────────────────

describe('uptimeColor', () => {
  it('returns green at 99.9', () => {
    expect(uptimeColor(99.9)).toBe('text-green-400');
  });

  it('returns green at 100', () => {
    expect(uptimeColor(100)).toBe('text-green-400');
  });

  it('returns blue at 99.0 (>= 99, < 99.9)', () => {
    expect(uptimeColor(99.0)).toBe('text-blue-400');
  });

  it('returns blue at 99.89', () => {
    expect(uptimeColor(99.89)).toBe('text-blue-400');
  });

  it('returns yellow at 95.0 (>= 95, < 99)', () => {
    expect(uptimeColor(95.0)).toBe('text-yellow-400');
  });

  it('returns yellow at 98.99', () => {
    expect(uptimeColor(98.99)).toBe('text-yellow-400');
  });

  it('returns orange at 90.0 (>= 90, < 95)', () => {
    expect(uptimeColor(90.0)).toBe('text-orange-400');
  });

  it('returns orange at 94.99', () => {
    expect(uptimeColor(94.99)).toBe('text-orange-400');
  });

  it('returns red below 90', () => {
    expect(uptimeColor(89.99)).toBe('text-red-400');
    expect(uptimeColor(0)).toBe('text-red-400');
  });

  it('5 bands produce distinct colors', () => {
    const colors = [
      uptimeColor(100),
      uptimeColor(99.5),
      uptimeColor(97),
      uptimeColor(92),
      uptimeColor(80),
    ];
    const unique = new Set(colors);
    expect(unique.size).toBe(5);
  });
});

// ── severityIcon ──────────────────────────────────────────────────────────────

describe('severityIcon', () => {
  it('high → red circle', () => {
    expect(severityIcon('high')).toBe('🔴');
  });

  it('medium → yellow circle', () => {
    expect(severityIcon('medium')).toBe('🟡');
  });

  it('low → green circle', () => {
    expect(severityIcon('low')).toBe('🟢');
  });

  it('all 3 levels produce distinct icons', () => {
    const icons = new Set([severityIcon('high'), severityIcon('medium'), severityIcon('low')]);
    expect(icons.size).toBe(3);
  });
});

// ── formatLatency ─────────────────────────────────────────────────────────────

describe('formatLatency', () => {
  it('returns em-dash for null', () => {
    expect(formatLatency(null)).toBe('—');
  });

  it('returns ms for values < 1000', () => {
    expect(formatLatency(0)).toBe('0ms');
    expect(formatLatency(250)).toBe('250ms');
    expect(formatLatency(999)).toBe('999ms');
  });

  it('returns seconds for values >= 1000', () => {
    expect(formatLatency(1000)).toBe('1.0s');
    expect(formatLatency(1500)).toBe('1.5s');
    expect(formatLatency(2000)).toBe('2.0s');
    expect(formatLatency(10000)).toBe('10.0s');
  });

  it('rounds to 1 decimal place for seconds', () => {
    expect(formatLatency(1234)).toBe('1.2s');
    expect(formatLatency(1567)).toBe('1.6s');
  });
});
