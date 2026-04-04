import { describe, it, expect } from 'vitest';

// ── Inline helpers (mirrored from certificateHelpers.ts) ───────────────────

type PeriodDays = 7 | 30 | 90 | 365;

const PERIOD_OPTIONS: { label: string; value: PeriodDays }[] = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '365d', value: 365 },
];

function formatPct(n: number): string {
  return `${n.toFixed(3)}%`;
}

function complianceColor(slaCompliant: boolean | null | undefined): string {
  if (slaCompliant === true) return 'text-green-400 bg-green-500/10 border-green-500/30';
  if (slaCompliant === false) return 'text-red-400 bg-red-500/10 border-red-500/30';
  return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30';
}

function complianceLabel(slaCompliant: boolean | null | undefined): string {
  if (slaCompliant === true) return 'SLA COMPLIANT ✓';
  if (slaCompliant === false) return 'SLA BREACH ✗';
  return 'NO SLA TARGET';
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PERIOD_OPTIONS', () => {
  it('has exactly 4 period options', () => {
    expect(PERIOD_OPTIONS).toHaveLength(4);
  });

  it('contains 7d, 30d, 90d, 365d labels', () => {
    const labels = PERIOD_OPTIONS.map((o) => o.label);
    expect(labels).toEqual(['7d', '30d', '90d', '365d']);
  });

  it('contains matching numeric values', () => {
    const values = PERIOD_OPTIONS.map((o) => o.value);
    expect(values).toEqual([7, 30, 90, 365]);
  });
});

describe('formatPct', () => {
  it('formats to 3 decimal places with % suffix', () => {
    expect(formatPct(99.123456)).toBe('99.123%');
  });

  it('pads to 3 decimal places when needed', () => {
    expect(formatPct(100)).toBe('100.000%');
  });

  it('formats zero', () => {
    expect(formatPct(0)).toBe('0.000%');
  });

  it('rounds correctly', () => {
    expect(formatPct(99.9999)).toBe('100.000%');
    expect(formatPct(99.9994)).toBe('99.999%');
  });

  it('handles small values', () => {
    expect(formatPct(0.001)).toBe('0.001%');
  });
});

describe('complianceColor', () => {
  it('returns green classes for true', () => {
    const result = complianceColor(true);
    expect(result).toContain('text-green-400');
    expect(result).toContain('bg-green-500/10');
    expect(result).toContain('border-green-500/30');
  });

  it('returns red classes for false', () => {
    const result = complianceColor(false);
    expect(result).toContain('text-red-400');
    expect(result).toContain('bg-red-500/10');
  });

  it('returns zinc classes for null', () => {
    const result = complianceColor(null);
    expect(result).toContain('text-zinc-400');
  });

  it('returns zinc classes for undefined', () => {
    const result = complianceColor(undefined);
    expect(result).toContain('text-zinc-400');
  });
});

describe('complianceLabel', () => {
  it('returns SLA COMPLIANT ✓ for true', () => {
    expect(complianceLabel(true)).toBe('SLA COMPLIANT ✓');
  });

  it('returns SLA BREACH ✗ for false', () => {
    expect(complianceLabel(false)).toBe('SLA BREACH ✗');
  });

  it('returns NO SLA TARGET for null', () => {
    expect(complianceLabel(null)).toBe('NO SLA TARGET');
  });

  it('returns NO SLA TARGET for undefined', () => {
    expect(complianceLabel(undefined)).toBe('NO SLA TARGET');
  });
});
