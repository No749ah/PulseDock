/**
 * Unit tests for alerts/components/utils.ts
 *
 * Covers: relativeTime(), inputClass, TIMEZONES array, DAY_LABELS array.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { relativeTime, inputClass, TIMEZONES, DAY_LABELS } from './utils';

// ─── relativeTime ─────────────────────────────────────────────────────────────

describe('alerts/utils — relativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function msAgo(ms: number): string {
    return new Date(Date.now() - ms).toISOString();
  }

  it('returns "just now" for < 1 minute ago', () => {
    expect(relativeTime(msAgo(30_000))).toBe('just now');
    expect(relativeTime(msAgo(0))).toBe('just now');
    expect(relativeTime(msAgo(59_999))).toBe('just now');
  });

  it('returns minutes for < 1 hour', () => {
    expect(relativeTime(msAgo(60_000))).toBe('1m ago');
    expect(relativeTime(msAgo(5 * 60_000))).toBe('5m ago');
    expect(relativeTime(msAgo(59 * 60_000))).toBe('59m ago');
  });

  it('returns hours for < 24 hours', () => {
    expect(relativeTime(msAgo(60 * 60_000))).toBe('1h ago');
    expect(relativeTime(msAgo(6 * 60 * 60_000))).toBe('6h ago');
    expect(relativeTime(msAgo(23 * 60 * 60_000))).toBe('23h ago');
  });

  it('returns days for >= 24 hours', () => {
    expect(relativeTime(msAgo(24 * 60 * 60_000))).toBe('1d ago');
    expect(relativeTime(msAgo(48 * 60 * 60_000))).toBe('2d ago');
    expect(relativeTime(msAgo(7 * 24 * 60 * 60_000))).toBe('7d ago');
  });

  it('floors minutes (does not round up to next minute)', () => {
    // 89.9 seconds = 1 minute + 29.9 seconds → 1m ago
    expect(relativeTime(msAgo(89_900))).toBe('1m ago');
  });

  it('floors hours (does not round up)', () => {
    // 1h 59m → 1h ago
    expect(relativeTime(msAgo(119 * 60_000))).toBe('1h ago');
  });

  it('floors days (does not round up)', () => {
    // 1d 23h → 1d ago
    expect(relativeTime(msAgo(47 * 60 * 60_000))).toBe('1d ago');
  });
});

// ─── inputClass ───────────────────────────────────────────────────────────────

describe('alerts/utils — inputClass', () => {
  it('is a non-empty string', () => {
    expect(typeof inputClass).toBe('string');
    expect(inputClass.length).toBeGreaterThan(0);
  });

  it('contains bg-surface', () => {
    expect(inputClass).toContain('bg-surface');
  });

  it('contains border class', () => {
    expect(inputClass).toContain('border');
  });

  it('contains rounded class', () => {
    expect(inputClass).toContain('rounded');
  });

  it('contains focus ring', () => {
    expect(inputClass).toContain('focus:ring-');
  });

  it('contains placeholder styling', () => {
    expect(inputClass).toContain('placeholder-');
  });

  it('contains text-text-primary', () => {
    expect(inputClass).toContain('text-text-primary');
  });

  it('contains w-full for full width', () => {
    expect(inputClass).toContain('w-full');
  });
});

// ─── TIMEZONES ────────────────────────────────────────────────────────────────

describe('alerts/utils — TIMEZONES', () => {
  it('is an array', () => {
    expect(Array.isArray(TIMEZONES)).toBe(true);
  });

  it('is non-empty', () => {
    expect(TIMEZONES.length).toBeGreaterThan(0);
  });

  it('contains UTC', () => {
    expect(TIMEZONES).toContain('UTC');
  });

  it('contains major North American timezones', () => {
    expect(TIMEZONES).toContain('America/New_York');
    expect(TIMEZONES).toContain('America/Los_Angeles');
  });

  it('contains major European timezones', () => {
    expect(TIMEZONES).toContain('Europe/London');
    expect(TIMEZONES).toContain('Europe/Berlin');
  });

  it('contains Asian timezones', () => {
    expect(TIMEZONES).toContain('Asia/Tokyo');
    expect(TIMEZONES).toContain('Asia/Kolkata');
  });

  it('all entries are non-empty strings', () => {
    for (const tz of TIMEZONES) {
      expect(typeof tz).toBe('string');
      expect(tz.length).toBeGreaterThan(0);
    }
  });

  it('all entries are unique', () => {
    expect(new Set(TIMEZONES).size).toBe(TIMEZONES.length);
  });

  it('UTC is first', () => {
    expect(TIMEZONES[0]).toBe('UTC');
  });

  it('has at least 10 timezones for global coverage', () => {
    expect(TIMEZONES.length).toBeGreaterThanOrEqual(10);
  });
});

// ─── DAY_LABELS ───────────────────────────────────────────────────────────────

describe('alerts/utils — DAY_LABELS', () => {
  it('is an array', () => {
    expect(Array.isArray(DAY_LABELS)).toBe(true);
  });

  it('has exactly 7 entries (one per day of week)', () => {
    expect(DAY_LABELS).toHaveLength(7);
  });

  it('starts with Sunday (Su)', () => {
    expect(DAY_LABELS[0]).toBe('Su');
  });

  it('ends with Saturday (Sa)', () => {
    expect(DAY_LABELS[6]).toBe('Sa');
  });

  it('Monday is at index 1 (Mo)', () => {
    expect(DAY_LABELS[1]).toBe('Mo');
  });

  it('all entries are 2-character abbreviations', () => {
    for (const label of DAY_LABELS) {
      expect(label).toHaveLength(2);
    }
  });

  it('all entries are unique', () => {
    expect(new Set(DAY_LABELS).size).toBe(7);
  });

  it('expected day order: Su Mo Tu We Th Fr Sa', () => {
    expect(DAY_LABELS).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
  });
});
