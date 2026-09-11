import { describe, it, expect } from 'vitest';

// ─── Extracted pure helpers from monitors/predictions/page.tsx ───────────────

function riskColor(score: number): string {
  if (score < 15) return 'bg-green-500';
  if (score <= 35) return 'bg-yellow-500';
  if (score <= 60) return 'bg-orange-500';
  return 'bg-red-500';
}

function riskTextColor(score: number): string {
  if (score < 15) return 'text-green-400';
  if (score <= 35) return 'text-yellow-400';
  if (score <= 60) return 'text-orange-400';
  return 'text-red-400';
}

function fleetRiskColor(score: number): string {
  if (score < 15) return 'text-green-400';
  if (score <= 35) return 'text-yellow-400';
  if (score <= 60) return 'text-orange-400';
  return 'text-red-400';
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('monitors/predictions/page — riskColor', () => {
  it('returns bg-green-500 at 0 (< 15)', () => {
    expect(riskColor(0)).toBe('bg-green-500');
  });

  it('returns bg-green-500 at 14 (< 15)', () => {
    expect(riskColor(14)).toBe('bg-green-500');
  });

  it('returns bg-yellow-500 at exactly 15 (boundary)', () => {
    expect(riskColor(15)).toBe('bg-yellow-500');
  });

  it('returns bg-yellow-500 at 35 (upper boundary)', () => {
    expect(riskColor(35)).toBe('bg-yellow-500');
  });

  it('returns bg-yellow-500 at 25 (middle range)', () => {
    expect(riskColor(25)).toBe('bg-yellow-500');
  });

  it('returns bg-orange-500 at 36', () => {
    expect(riskColor(36)).toBe('bg-orange-500');
  });

  it('returns bg-orange-500 at 60 (upper boundary)', () => {
    expect(riskColor(60)).toBe('bg-orange-500');
  });

  it('returns bg-orange-500 at 50 (middle range)', () => {
    expect(riskColor(50)).toBe('bg-orange-500');
  });

  it('returns bg-red-500 at 61', () => {
    expect(riskColor(61)).toBe('bg-red-500');
  });

  it('returns bg-red-500 at 100', () => {
    expect(riskColor(100)).toBe('bg-red-500');
  });
});

describe('monitors/predictions/page — riskTextColor', () => {
  it('returns text-green-400 at 0 (< 15)', () => {
    expect(riskTextColor(0)).toBe('text-green-400');
  });

  it('returns text-green-400 at 14', () => {
    expect(riskTextColor(14)).toBe('text-green-400');
  });

  it('returns text-yellow-400 at 15', () => {
    expect(riskTextColor(15)).toBe('text-yellow-400');
  });

  it('returns text-yellow-400 at 35', () => {
    expect(riskTextColor(35)).toBe('text-yellow-400');
  });

  it('returns text-orange-400 at 36', () => {
    expect(riskTextColor(36)).toBe('text-orange-400');
  });

  it('returns text-orange-400 at 60', () => {
    expect(riskTextColor(60)).toBe('text-orange-400');
  });

  it('returns text-red-400 at 61', () => {
    expect(riskTextColor(61)).toBe('text-red-400');
  });

  it('returns text-red-400 at 100', () => {
    expect(riskTextColor(100)).toBe('text-red-400');
  });
});

describe('monitors/predictions/page — fleetRiskColor', () => {
  it('returns text-green-400 at 0', () => {
    expect(fleetRiskColor(0)).toBe('text-green-400');
  });

  it('returns text-green-400 at 14', () => {
    expect(fleetRiskColor(14)).toBe('text-green-400');
  });

  it('returns text-yellow-400 at 15', () => {
    expect(fleetRiskColor(15)).toBe('text-yellow-400');
  });

  it('returns text-yellow-400 at 35', () => {
    expect(fleetRiskColor(35)).toBe('text-yellow-400');
  });

  it('returns text-orange-400 at 36', () => {
    expect(fleetRiskColor(36)).toBe('text-orange-400');
  });

  it('returns text-orange-400 at 60', () => {
    expect(fleetRiskColor(60)).toBe('text-orange-400');
  });

  it('returns text-red-400 at 61', () => {
    expect(fleetRiskColor(61)).toBe('text-red-400');
  });

  it('returns text-red-400 at 100', () => {
    expect(fleetRiskColor(100)).toBe('text-red-400');
  });

  it('matches riskTextColor for the same inputs', () => {
    for (const score of [0, 14, 15, 25, 35, 36, 50, 60, 61, 100]) {
      expect(fleetRiskColor(score)).toBe(riskTextColor(score));
    }
  });
});
