import { describe, expect, it } from 'vitest';
import { PERIOD_OPTIONS, complianceColor, complianceLabel, formatPct } from './certificateHelpers';

describe('certificate helpers', () => {
  it('formatPct uses 3 decimal places', () => {
    expect(formatPct(99.9)).toBe('99.900%');
    expect(formatPct(100)).toBe('100.000%');
    expect(formatPct(0)).toBe('0.000%');
  });

  it('complianceColor returns green for true, red for false, zinc for nullish', () => {
    expect(complianceColor(true)).toBe('text-green-400 bg-green-500/10 border-green-500/30');
    expect(complianceColor(false)).toBe('text-red-400 bg-red-500/10 border-red-500/30');
    expect(complianceColor(null)).toBe('text-zinc-400 bg-zinc-500/10 border-zinc-500/30');
    expect(complianceColor(undefined)).toBe('text-zinc-400 bg-zinc-500/10 border-zinc-500/30');
  });

  it('complianceLabel returns expected labels', () => {
    expect(complianceLabel(true)).toBe('SLA COMPLIANT ✓');
    expect(complianceLabel(false)).toBe('SLA BREACH ✗');
    expect(complianceLabel(null)).toBe('NO SLA TARGET');
  });

  it('PERIOD_OPTIONS has the 4 expected entries', () => {
    expect(PERIOD_OPTIONS).toHaveLength(4);
    expect(PERIOD_OPTIONS.map((o) => o.value)).toEqual([7, 30, 90, 365]);
    expect(PERIOD_OPTIONS.map((o) => o.label)).toEqual(['7d', '30d', '90d', '365d']);
  });
});
