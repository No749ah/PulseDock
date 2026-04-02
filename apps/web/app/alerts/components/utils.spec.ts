import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { relativeTime, TIMEZONES, DAY_LABELS } from './utils';

describe('relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for timestamps less than 1 minute ago', () => {
    const now = new Date('2026-04-02T03:00:00Z');
    vi.setSystemTime(now);
    const iso = new Date('2026-04-02T02:59:30Z').toISOString(); // 30 seconds ago
    expect(relativeTime(iso)).toBe('just now');
  });

  it('returns "just now" for timestamps at exactly 0 minutes difference', () => {
    const now = new Date('2026-04-02T03:00:00Z');
    vi.setSystemTime(now);
    const iso = now.toISOString();
    expect(relativeTime(iso)).toBe('just now');
  });

  it('returns minutes ago for timestamps 1–59 minutes ago', () => {
    const now = new Date('2026-04-02T03:00:00Z');
    vi.setSystemTime(now);

    const one = new Date('2026-04-02T02:59:00Z').toISOString(); // 1 min
    expect(relativeTime(one)).toBe('1m ago');

    const thirty = new Date('2026-04-02T02:30:00Z').toISOString(); // 30 min
    expect(relativeTime(thirty)).toBe('30m ago');

    const fiftyNine = new Date('2026-04-02T02:01:00Z').toISOString(); // 59 min
    expect(relativeTime(fiftyNine)).toBe('59m ago');
  });

  it('returns hours ago for timestamps 1–23 hours ago', () => {
    const now = new Date('2026-04-02T03:00:00Z');
    vi.setSystemTime(now);

    const oneHour = new Date('2026-04-02T02:00:00Z').toISOString(); // 1 hour
    expect(relativeTime(oneHour)).toBe('1h ago');

    const twoHours = new Date('2026-04-02T01:00:00Z').toISOString(); // 2 hours
    expect(relativeTime(twoHours)).toBe('2h ago');

    const twentyThreeHours = new Date('2026-04-01T04:00:00Z').toISOString();
    expect(relativeTime(twentyThreeHours)).toBe('23h ago');
  });

  it('returns days ago for timestamps 24+ hours ago', () => {
    const now = new Date('2026-04-02T03:00:00Z');
    vi.setSystemTime(now);

    const oneDay = new Date('2026-04-01T03:00:00Z').toISOString(); // exactly 24h
    expect(relativeTime(oneDay)).toBe('1d ago');

    const twoDays = new Date('2026-03-31T03:00:00Z').toISOString();
    expect(relativeTime(twoDays)).toBe('2d ago');

    const thirtyDays = new Date('2026-03-03T03:00:00Z').toISOString();
    expect(relativeTime(thirtyDays)).toBe('30d ago');
  });

  it('handles future timestamps gracefully (returns "just now")', () => {
    const now = new Date('2026-04-02T03:00:00Z');
    vi.setSystemTime(now);
    const future = new Date('2026-04-02T04:00:00Z').toISOString(); // 1 hour ahead
    // diff will be negative → mins will be negative → < 1 → "just now"
    expect(relativeTime(future)).toBe('just now');
  });
});

describe('TIMEZONES', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(TIMEZONES)).toBe(true);
    expect(TIMEZONES.length).toBeGreaterThan(0);
    for (const tz of TIMEZONES) {
      expect(typeof tz).toBe('string');
      expect(tz.length).toBeGreaterThan(0);
    }
  });

  it('includes UTC', () => {
    expect(TIMEZONES).toContain('UTC');
  });

  it('includes common US timezones', () => {
    expect(TIMEZONES).toContain('America/New_York');
    expect(TIMEZONES).toContain('America/Los_Angeles');
  });

  it('includes common European timezones', () => {
    expect(TIMEZONES).toContain('Europe/Berlin');
    expect(TIMEZONES).toContain('Europe/London');
  });

  it('includes Asian timezones', () => {
    expect(TIMEZONES).toContain('Asia/Tokyo');
    expect(TIMEZONES).toContain('Asia/Shanghai');
  });

  it('has no duplicates', () => {
    const unique = new Set(TIMEZONES);
    expect(unique.size).toBe(TIMEZONES.length);
  });
});

describe('DAY_LABELS', () => {
  it('has exactly 7 entries (one per day)', () => {
    expect(DAY_LABELS).toHaveLength(7);
  });

  it('starts with Sunday (Su) and ends with Saturday (Sa)', () => {
    expect(DAY_LABELS[0]).toBe('Su');
    expect(DAY_LABELS[6]).toBe('Sa');
  });

  it('contains all expected abbreviations in order', () => {
    expect(DAY_LABELS).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
  });

  it('all entries are 2-character strings', () => {
    for (const label of DAY_LABELS) {
      expect(typeof label).toBe('string');
      expect(label).toHaveLength(2);
    }
  });
});
