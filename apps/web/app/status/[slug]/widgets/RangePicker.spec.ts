import { describe, it, expect } from 'vitest';
import { RANGES, isValidRange, getDefaultRange } from './rangePickerHelpers';

describe('RANGES', () => {
  it('has exactly 4 entries', () => {
    expect(RANGES).toHaveLength(4);
  });

  it('contains 24h, 7d, 30d, 90d values', () => {
    const values = RANGES.map((r) => r.value);
    expect(values).toContain('24h');
    expect(values).toContain('7d');
    expect(values).toContain('30d');
    expect(values).toContain('90d');
  });

  it('each entry has matching label and value', () => {
    for (const range of RANGES) {
      expect(range.label).toBe(range.value);
    }
  });

  it('entries are in ascending order: 24h < 7d < 30d < 90d', () => {
    expect(RANGES[0].value).toBe('24h');
    expect(RANGES[1].value).toBe('7d');
    expect(RANGES[2].value).toBe('30d');
    expect(RANGES[3].value).toBe('90d');
  });
});

describe('isValidRange', () => {
  it('returns true for all valid range values', () => {
    expect(isValidRange('24h')).toBe(true);
    expect(isValidRange('7d')).toBe(true);
    expect(isValidRange('30d')).toBe(true);
    expect(isValidRange('90d')).toBe(true);
  });

  it('returns false for invalid values', () => {
    expect(isValidRange('1h')).toBe(false);
    expect(isValidRange('365d')).toBe(false);
    expect(isValidRange('')).toBe(false);
    expect(isValidRange('all')).toBe(false);
  });
});

describe('getDefaultRange', () => {
  it('returns "24h" as default', () => {
    expect(getDefaultRange()).toBe('24h');
  });

  it('is a valid range', () => {
    expect(isValidRange(getDefaultRange())).toBe(true);
  });
});
