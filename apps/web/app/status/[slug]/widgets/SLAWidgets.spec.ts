import { describe, it, expect } from 'vitest';
import { formatMinutes, computeBudgetUsed } from './slaWidgetHelpers';

describe('formatMinutes', () => {
  it('formats sub-minute as seconds', () => {
    expect(formatMinutes(0.5)).toBe('30s');
  });

  it('0.25 min → 15s', () => {
    expect(formatMinutes(0.25)).toBe('15s');
  });

  it('formats whole minutes under 60', () => {
    expect(formatMinutes(1)).toBe('1m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(59)).toBe('59m');
  });

  it('formats exactly 60 minutes as 1h (no minutes)', () => {
    expect(formatMinutes(60)).toBe('1h');
  });

  it('formats hours + minutes', () => {
    expect(formatMinutes(90)).toBe('1h 30m');
    expect(formatMinutes(125)).toBe('2h 5m');
  });

  it('formats whole hours without minute suffix', () => {
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(180)).toBe('3h');
  });

  it('0 minutes → 0s', () => {
    expect(formatMinutes(0)).toBe('0s');
  });
});

describe('computeBudgetUsed', () => {
  it('returns null when allowedDownMin is null', () => {
    expect(computeBudgetUsed(null, 30)).toBeNull();
  });

  it('returns null when remainingDownMin is null', () => {
    expect(computeBudgetUsed(60, null)).toBeNull();
  });

  it('returns null when both are null', () => {
    expect(computeBudgetUsed(null, null)).toBeNull();
  });

  it('returns null when allowedDownMin is 0 (division guard)', () => {
    expect(computeBudgetUsed(0, 0)).toBeNull();
  });

  it('50% used when remaining = half of allowed', () => {
    expect(computeBudgetUsed(60, 30)).toBe(50);
  });

  it('0% used when remaining equals allowed (no downtime)', () => {
    expect(computeBudgetUsed(60, 60)).toBe(0);
  });

  it('100% used when remaining is 0', () => {
    expect(computeBudgetUsed(60, 0)).toBe(100);
  });

  it('clamps to 100 when remaining is negative (overrun)', () => {
    expect(computeBudgetUsed(60, -10)).toBe(100);
  });

  it('rounds to nearest integer', () => {
    // (60 - 40) / 60 * 100 = 33.33... → 33
    expect(computeBudgetUsed(60, 40)).toBe(33);
  });
});
