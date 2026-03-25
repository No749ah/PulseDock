/**
 * Unit tests for CountUp parseValue helper.
 * Extracted from CountUp.tsx for isolated testing.
 */
import { describe, it, expect } from 'vitest';

function parseValue(raw: string): { prefix: string; num: number; suffix: string } {
  const match = raw.match(/^([^0-9]*)([0-9]+)([^0-9]*)$/);
  if (!match) return { prefix: '', num: 0, suffix: raw };
  return { prefix: match[1], num: parseInt(match[2], 10), suffix: match[3] };
}

describe('CountUp — parseValue', () => {
  it('parses plain integer', () => {
    expect(parseValue('42')).toEqual({ prefix: '', num: 42, suffix: '' });
  });

  it('parses integer with plus suffix', () => {
    expect(parseValue('1300+')).toEqual({ prefix: '', num: 1300, suffix: '+' });
  });

  it('parses integer with percent suffix', () => {
    expect(parseValue('100%')).toEqual({ prefix: '', num: 100, suffix: '%' });
  });

  it('parses integer with multi-char suffix', () => {
    expect(parseValue('5ms')).toEqual({ prefix: '', num: 5, suffix: 'ms' });
  });

  it('parses integer with prefix', () => {
    expect(parseValue('$99')).toEqual({ prefix: '$', num: 99, suffix: '' });
  });

  it('parses integer with prefix and suffix', () => {
    expect(parseValue('~50%')).toEqual({ prefix: '~', num: 50, suffix: '%' });
  });

  it('handles single digit', () => {
    expect(parseValue('6')).toEqual({ prefix: '', num: 6, suffix: '' });
  });

  it('handles large numbers', () => {
    expect(parseValue('5009+')).toEqual({ prefix: '', num: 5009, suffix: '+' });
  });

  it('returns num:0 for non-numeric string', () => {
    const result = parseValue('N/A');
    expect(result.num).toBe(0);
    expect(result.suffix).toBe('N/A');
  });

  it('handles zero', () => {
    expect(parseValue('0')).toEqual({ prefix: '', num: 0, suffix: '' });
  });

  it('handles "99.9%" — no pure integer, falls back to num:0', () => {
    // The regex requires the integer to go all the way to end w/ only non-digits after.
    // "99.9%" fails because "9" is a digit in the suffix position — no match.
    const result = parseValue('99.9%');
    expect(result.num).toBe(0);
    expect(result.suffix).toBe('99.9%');
  });
});
