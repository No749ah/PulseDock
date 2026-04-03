import { describe, it, expect } from 'vitest';
import { apdexRatingColor, computeSharePct } from './performanceWidgetHelpers';

describe('apdexRatingColor', () => {
  it('"Excellent" → green', () => {
    expect(apdexRatingColor('Excellent')).toBe('text-green-400');
  });

  it('"Good" → blue', () => {
    expect(apdexRatingColor('Good')).toBe('text-blue-400');
  });

  it('"Fair" → yellow', () => {
    expect(apdexRatingColor('Fair')).toBe('text-yellow-400');
  });

  it('"Poor" → orange', () => {
    expect(apdexRatingColor('Poor')).toBe('text-orange-400');
  });

  it('"Unacceptable" (or unknown) → red', () => {
    expect(apdexRatingColor('Unacceptable')).toBe('text-red-400');
  });

  it('null → red (default)', () => {
    expect(apdexRatingColor(null)).toBe('text-red-400');
  });

  it('undefined → red (default)', () => {
    expect(apdexRatingColor(undefined)).toBe('text-red-400');
  });

  it('empty string → red (default)', () => {
    expect(apdexRatingColor('')).toBe('text-red-400');
  });
});

describe('computeSharePct', () => {
  it('returns 0 when total is 0', () => {
    expect(computeSharePct(0, 0)).toBe(0);
    expect(computeSharePct(50, 0)).toBe(0);
  });

  it('50/100 → 50%', () => {
    expect(computeSharePct(50, 100)).toBe(50);
  });

  it('100/100 → 100%', () => {
    expect(computeSharePct(100, 100)).toBe(100);
  });

  it('0/100 → 0%', () => {
    expect(computeSharePct(0, 100)).toBe(0);
  });

  it('1/3 → 33.33...%', () => {
    expect(computeSharePct(1, 3)).toBeCloseTo(33.33, 1);
  });

  it('parts summing to total all produce valid percentages', () => {
    const satisfied = 70;
    const tolerating = 20;
    const frustrated = 10;
    const total = 100;
    expect(computeSharePct(satisfied, total)).toBe(70);
    expect(computeSharePct(tolerating, total)).toBe(20);
    expect(computeSharePct(frustrated, total)).toBe(10);
  });
});
