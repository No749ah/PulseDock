import { describe, it, expect } from 'vitest';
import { stripLeadingV, secondsToHuman, levelBadgeVariant } from './utils';

describe('stripLeadingV', () => {
  it('strips leading v from version string', () => {
    expect(stripLeadingV('v1.2.3')).toBe('1.2.3');
  });

  it('strips leading V (uppercase) from version string', () => {
    expect(stripLeadingV('V2.0.0')).toBe('2.0.0');
  });

  it('leaves version without leading v unchanged', () => {
    expect(stripLeadingV('1.2.3')).toBe('1.2.3');
  });

  it('leaves empty string unchanged', () => {
    expect(stripLeadingV('')).toBe('');
  });

  it('does not strip v from non-version strings (v not followed by digit)', () => {
    expect(stripLeadingV('version1')).toBe('version1');
  });

  it('handles v followed by 0', () => {
    expect(stripLeadingV('v0.1.0')).toBe('0.1.0');
  });

  it('strips only the leading v, not embedded ones', () => {
    expect(stripLeadingV('v1.v2.v3')).toBe('1.v2.v3');
  });

  it('handles single digit version', () => {
    expect(stripLeadingV('v3')).toBe('3');
  });

  it('handles pre-release version', () => {
    expect(stripLeadingV('v1.0.0-beta.1')).toBe('1.0.0-beta.1');
  });
});

describe('secondsToHuman', () => {
  it('formats seconds less than 60 as seconds', () => {
    expect(secondsToHuman(30)).toBe('30s');
  });

  it('formats exactly 60 as 1m', () => {
    expect(secondsToHuman(60)).toBe('1m');
  });

  it('formats multiples of 60 as minutes', () => {
    expect(secondsToHuman(300)).toBe('5m');
  });

  it('formats exactly 3600 as 1h', () => {
    expect(secondsToHuman(3600)).toBe('1h');
  });

  it('formats multiples of 3600 as hours', () => {
    expect(secondsToHuman(7200)).toBe('2h');
  });

  it('formats exactly 86400 as 1d', () => {
    expect(secondsToHuman(86400)).toBe('1d');
  });

  it('formats multiples of 86400 as days', () => {
    expect(secondsToHuman(172800)).toBe('2d');
  });

  it('formats 1 second', () => {
    expect(secondsToHuman(1)).toBe('1s');
  });

  it('formats non-round minutes as seconds', () => {
    expect(secondsToHuman(90)).toBe('90s');
  });

  it('formats non-round hours but round minutes as minutes', () => {
    expect(secondsToHuman(5400)).toBe('90m');
  });

  it('formats 0 as 0d (0 is divisible by 86400)', () => {
    expect(secondsToHuman(0)).toBe('0d');
  });
});

describe('levelBadgeVariant', () => {
  it('returns success for green', () => {
    expect(levelBadgeVariant('green')).toBe('success');
  });

  it('returns warning for yellow', () => {
    expect(levelBadgeVariant('yellow')).toBe('warning');
  });

  it('returns danger for red', () => {
    expect(levelBadgeVariant('red')).toBe('danger');
  });

  it('returns danger for unknown levels', () => {
    expect(levelBadgeVariant('unknown')).toBe('danger');
  });

  it('returns danger for empty string', () => {
    expect(levelBadgeVariant('')).toBe('danger');
  });

  it('is case-sensitive (capital Green → danger)', () => {
    expect(levelBadgeVariant('Green')).toBe('danger');
  });
});
