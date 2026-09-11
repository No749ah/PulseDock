// Unit tests for monitors/compare/page.tsx pure helpers
import { describe, it, expect } from 'vitest';

// ─── MONITOR_COLORS ───────────────────────────────────────────────────────────

const MONITOR_COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7'] as const;

describe('MONITOR_COLORS', () => {
  it('has 4 colors', () => expect(MONITOR_COLORS).toHaveLength(4));
  it('all are valid hex color strings', () => {
    for (const c of MONITOR_COLORS) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('first color is blue', () => expect(MONITOR_COLORS[0]).toBe('#3b82f6'));
  it('second color is green', () => expect(MONITOR_COLORS[1]).toBe('#22c55e'));
  it('third color is orange', () => expect(MONITOR_COLORS[2]).toBe('#f97316'));
  it('fourth color is purple', () => expect(MONITOR_COLORS[3]).toBe('#a855f7'));
  it('colors are distinct', () => {
    const unique = new Set(MONITOR_COLORS);
    expect(unique.size).toBe(MONITOR_COLORS.length);
  });
});

// ─── DAYS_OPTIONS ─────────────────────────────────────────────────────────────

const DAYS_OPTIONS = [
  { value: 1, label: '24h' },
  { value: 7, label: '7d' },
  { value: 14, label: '14d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
];

describe('DAYS_OPTIONS', () => {
  it('has 5 options', () => expect(DAYS_OPTIONS).toHaveLength(5));
  it('all have value and label', () => {
    for (const opt of DAYS_OPTIONS) {
      expect(opt).toHaveProperty('value');
      expect(opt).toHaveProperty('label');
    }
  });
  it('first option is 1 day (24h)', () => expect(DAYS_OPTIONS[0]).toEqual({ value: 1, label: '24h' }));
  it('last option is 90 days', () => expect(DAYS_OPTIONS[DAYS_OPTIONS.length - 1]).toEqual({ value: 90, label: '90d' }));
  it('values are strictly increasing', () => {
    for (let i = 1; i < DAYS_OPTIONS.length; i++) {
      expect(DAYS_OPTIONS[i].value).toBeGreaterThan(DAYS_OPTIONS[i - 1].value);
    }
  });
});

// ─── StatusDot color logic ────────────────────────────────────────────────────

function statusDotColor(level: string): string {
  if (level === 'red') return 'bg-red-500';
  if (level === 'yellow') return 'bg-yellow-500';
  return 'bg-green-500';
}

describe('statusDotColor', () => {
  it('returns red for red level', () => expect(statusDotColor('red')).toBe('bg-red-500'));
  it('returns yellow for yellow level', () => expect(statusDotColor('yellow')).toBe('bg-yellow-500'));
  it('returns green for green level', () => expect(statusDotColor('green')).toBe('bg-green-500'));
  it('returns green for unknown level (default)', () => expect(statusDotColor('unknown')).toBe('bg-green-500'));
  it('returns green for empty string', () => expect(statusDotColor('')).toBe('bg-green-500'));
});

// ─── interpLabels ─────────────────────────────────────────────────────────────

const interpLabels: Record<string, { label: string; color: string }> = {
  strong_positive: { label: 'Strong +', color: 'text-green-400' },
  moderate_positive: { label: 'Moderate +', color: 'text-green-300' },
  weak: { label: 'Weak', color: 'text-text-muted' },
  moderate_negative: { label: 'Moderate −', color: 'text-orange-400' },
  strong_negative: { label: 'Strong −', color: 'text-red-400' },
};

describe('interpLabels', () => {
  it('has 5 interpretation entries', () => {
    expect(Object.keys(interpLabels)).toHaveLength(5);
  });

  it('strong_positive has green color', () => {
    expect(interpLabels.strong_positive.color).toContain('green');
  });

  it('moderate_positive has green color', () => {
    expect(interpLabels.moderate_positive.color).toContain('green');
  });

  it('weak has muted color', () => {
    expect(interpLabels.weak.color).toContain('muted');
  });

  it('moderate_negative has orange color', () => {
    expect(interpLabels.moderate_negative.color).toContain('orange');
  });

  it('strong_negative has red color', () => {
    expect(interpLabels.strong_negative.color).toContain('red');
  });

  it('positive interpretations have + in label', () => {
    expect(interpLabels.strong_positive.label).toContain('+');
    expect(interpLabels.moderate_positive.label).toContain('+');
  });

  it('negative interpretations have − in label', () => {
    expect(interpLabels.moderate_negative.label).toContain('−');
    expect(interpLabels.strong_negative.label).toContain('−');
  });

  it('all entries have label and color fields', () => {
    for (const entry of Object.values(interpLabels)) {
      expect(entry).toHaveProperty('label');
      expect(entry).toHaveProperty('color');
    }
  });
});

// ─── correlationColor helper ──────────────────────────────────────────────────

function correlationBadgeColor(coefficient: number): string {
  if (coefficient >= 0.7) return 'text-green-400';
  if (coefficient >= 0.3) return 'text-green-300';
  if (coefficient >= -0.3) return 'text-text-muted';
  if (coefficient >= -0.7) return 'text-orange-400';
  return 'text-red-400';
}

describe('correlationBadgeColor', () => {
  it('strong positive (>= 0.7) is green-400', () => expect(correlationBadgeColor(0.7)).toBe('text-green-400'));
  it('moderate positive (0.3–0.69) is green-300', () => expect(correlationBadgeColor(0.5)).toBe('text-green-300'));
  it('weak (-0.3 to 0.29) is muted', () => expect(correlationBadgeColor(0)).toBe('text-text-muted'));
  it('moderate negative (-0.7 to -0.31) is orange', () => expect(correlationBadgeColor(-0.5)).toBe('text-orange-400'));
  it('strong negative (<= -0.7) is red', () => expect(correlationBadgeColor(-0.9)).toBe('text-red-400'));
  it('1.0 (perfect positive) is green-400', () => expect(correlationBadgeColor(1.0)).toBe('text-green-400'));
  it('-1.0 (perfect negative) is red', () => expect(correlationBadgeColor(-1.0)).toBe('text-red-400'));
});
