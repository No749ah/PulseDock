/**
 * Unit tests for ChannelScheduleSection pure logic.
 * Tests day toggle logic, timezone options, and time window validation.
 */
import { describe, it, expect } from 'vitest';

// ── Constants mirrored from component / utils ─────────────────────────────────

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
] as const;

// ── Logic mirrored from component ────────────────────────────────────────────

function toggleDay(days: number[], d: number): number[] {
  return days.includes(d)
    ? days.filter((x) => x !== d)
    : [...days, d].sort((a, b) => a - b);
}

function buildHourOptions(): Array<{ value: number; label: string }> {
  return Array.from({ length: 24 }, (_, h) => ({
    value: h,
    label: `${String(h).padStart(2, '0')}:00`,
  }));
}

function buildEndHourOptions(): Array<{ value: number; label: string }> {
  return Array.from({ length: 24 }, (_, h) => ({
    value: h + 1,
    label: `${String(h + 1).padStart(2, '0')}:00`,
  }));
}

function isValidTimeWindow(startHour: number, endHour: number): boolean {
  return startHour < endHour && startHour >= 0 && endHour <= 24;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChannelScheduleSection — DAY_LABELS', () => {
  it('has 7 days', () => {
    expect(DAY_LABELS).toHaveLength(7);
  });

  it('starts with Sunday', () => {
    expect(DAY_LABELS[0]).toBe('Su');
  });

  it('ends with Saturday', () => {
    expect(DAY_LABELS[6]).toBe('Sa');
  });

  it('contains Mo through Fr for weekdays', () => {
    expect([...DAY_LABELS]).toContain('Mo');
    expect([...DAY_LABELS]).toContain('Tu');
    expect([...DAY_LABELS]).toContain('We');
    expect([...DAY_LABELS]).toContain('Th');
    expect([...DAY_LABELS]).toContain('Fr');
  });
});

describe('ChannelScheduleSection — TIMEZONES', () => {
  it('has 17 timezone options', () => {
    expect(TIMEZONES).toHaveLength(17);
  });

  it('includes UTC as first option', () => {
    expect(TIMEZONES[0]).toBe('UTC');
  });

  it('includes major regions', () => {
    const tzList = [...TIMEZONES];
    expect(tzList).toContain('America/New_York');
    expect(tzList).toContain('Europe/Berlin');
    expect(tzList).toContain('Asia/Tokyo');
    expect(tzList).toContain('Australia/Sydney');
  });

  it('all timezone strings are non-empty', () => {
    TIMEZONES.forEach((tz) => expect(tz.length).toBeGreaterThan(0));
  });
});

describe('ChannelScheduleSection — toggleDay', () => {
  it('adds a day when not present', () => {
    const result = toggleDay([], 1);
    expect(result).toEqual([1]);
  });

  it('removes a day when present', () => {
    const result = toggleDay([1, 2, 3], 2);
    expect(result).toEqual([1, 3]);
  });

  it('keeps result sorted numerically', () => {
    const result = toggleDay([1, 3, 5], 2);
    expect(result).toEqual([1, 2, 3, 5]);
  });

  it('removes Sunday (0)', () => {
    const result = toggleDay([0, 1, 2], 0);
    expect(result).toEqual([1, 2]);
  });

  it('adds Saturday (6)', () => {
    const result = toggleDay([1, 2, 3, 4, 5], 6);
    expect(result).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('returns new array reference', () => {
    const original = [1, 2];
    const result = toggleDay(original, 3);
    expect(result).not.toBe(original);
  });

  it('does not duplicate days', () => {
    const result = toggleDay([1], 1);
    expect(result).not.toContain(1);
    expect(result).toHaveLength(0);
  });
});

describe('ChannelScheduleSection — buildHourOptions', () => {
  it('builds 24 start hour options', () => {
    const options = buildHourOptions();
    expect(options).toHaveLength(24);
  });

  it('first option is 00:00 with value 0', () => {
    const options = buildHourOptions();
    expect(options[0]).toEqual({ value: 0, label: '00:00' });
  });

  it('last option is 23:00 with value 23', () => {
    const options = buildHourOptions();
    expect(options[23]).toEqual({ value: 23, label: '23:00' });
  });

  it('hours are zero-padded in label', () => {
    const options = buildHourOptions();
    expect(options[9].label).toBe('09:00');
  });
});

describe('ChannelScheduleSection — buildEndHourOptions', () => {
  it('builds 24 end hour options', () => {
    const options = buildEndHourOptions();
    expect(options).toHaveLength(24);
  });

  it('first option is 01:00 with value 1', () => {
    const options = buildEndHourOptions();
    expect(options[0]).toEqual({ value: 1, label: '01:00' });
  });

  it('last option is 24:00 with value 24', () => {
    const options = buildEndHourOptions();
    expect(options[23]).toEqual({ value: 24, label: '24:00' });
  });
});

describe('ChannelScheduleSection — isValidTimeWindow', () => {
  it('valid when start < end', () => {
    expect(isValidTimeWindow(8, 18)).toBe(true);
  });

  it('invalid when start >= end', () => {
    expect(isValidTimeWindow(18, 8)).toBe(false);
    expect(isValidTimeWindow(8, 8)).toBe(false);
  });

  it('valid for overnight window edge cases', () => {
    expect(isValidTimeWindow(0, 24)).toBe(true);
  });

  it('invalid if start is negative', () => {
    expect(isValidTimeWindow(-1, 10)).toBe(false);
  });

  it('invalid if end exceeds 24', () => {
    expect(isValidTimeWindow(10, 25)).toBe(false);
  });
});
