/**
 * Unit tests for AlertChannelRow pure logic.
 * Tests schedule display, last triggered label, stats expand state, and column visibility.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

interface ScheduleJson {
  enabled: boolean;
  days: number[]; // 0=Sun, 1=Mon, ... 6=Sat
  startHour: number;
  endHour: number;
  timezone: string;
}

function buildScheduleLabel(schedule: ScheduleJson): string {
  const DAY_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const days = DAY_ABBR.filter((_, i) => schedule.days.includes(i)).join('');
  const startStr = String(schedule.startHour).padStart(2, '0');
  const endStr = String(schedule.endHour).padStart(2, '0');
  return `${days} ${startStr}:00–${endStr}:00 ${schedule.timezone}`;
}

function hasSchedule(schedule: ScheduleJson | null | undefined): boolean {
  return !!schedule?.enabled;
}

function isStatsExpanded(expandedStatsId: string | null, channelId: string): boolean {
  return expandedStatsId === channelId;
}

function lastTriggeredLabel(lastTriggeredAt: string | null | undefined): string {
  return lastTriggeredAt ? 'relative-time' : 'Never';
}

function colClass(visible: boolean): string {
  return visible ? '' : 'hidden';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AlertChannelRow — buildScheduleLabel', () => {
  it('builds weekday schedule label', () => {
    const schedule: ScheduleJson = {
      enabled: true,
      days: [1, 2, 3, 4, 5], // Mon-Fri
      startHour: 9,
      endHour: 17,
      timezone: 'Europe/Berlin',
    };
    const label = buildScheduleLabel(schedule);
    expect(label).toBe('MoTuWeThFr 09:00–17:00 Europe/Berlin');
  });

  it('zero-pads single-digit hours', () => {
    const schedule: ScheduleJson = {
      enabled: true,
      days: [1],
      startHour: 8,
      endHour: 9,
      timezone: 'UTC',
    };
    const label = buildScheduleLabel(schedule);
    expect(label).toContain('08:00');
    expect(label).toContain('09:00');
  });

  it('handles weekend-only schedule', () => {
    const schedule: ScheduleJson = {
      enabled: true,
      days: [0, 6], // Sun, Sat
      startHour: 10,
      endHour: 18,
      timezone: 'UTC',
    };
    expect(buildScheduleLabel(schedule)).toContain('SuSa');
  });

  it('handles all-day (0-24) schedule', () => {
    const schedule: ScheduleJson = {
      enabled: true,
      days: [1, 2, 3, 4, 5],
      startHour: 0,
      endHour: 24,
      timezone: 'America/New_York',
    };
    const label = buildScheduleLabel(schedule);
    expect(label).toContain('00:00');
    expect(label).toContain('24:00');
  });
});

describe('AlertChannelRow — hasSchedule', () => {
  it('returns false for null schedule', () => {
    expect(hasSchedule(null)).toBe(false);
  });

  it('returns false for undefined schedule', () => {
    expect(hasSchedule(undefined)).toBe(false);
  });

  it('returns false when schedule.enabled is false', () => {
    const s: ScheduleJson = { enabled: false, days: [1], startHour: 9, endHour: 17, timezone: 'UTC' };
    expect(hasSchedule(s)).toBe(false);
  });

  it('returns true when schedule.enabled is true', () => {
    const s: ScheduleJson = { enabled: true, days: [1], startHour: 9, endHour: 17, timezone: 'UTC' };
    expect(hasSchedule(s)).toBe(true);
  });
});

describe('AlertChannelRow — isStatsExpanded', () => {
  it('returns true when expandedStatsId matches channelId', () => {
    expect(isStatsExpanded('ch-1', 'ch-1')).toBe(true);
  });

  it('returns false when expandedStatsId differs', () => {
    expect(isStatsExpanded('ch-2', 'ch-1')).toBe(false);
  });

  it('returns false when expandedStatsId is null', () => {
    expect(isStatsExpanded(null, 'ch-1')).toBe(false);
  });
});

describe('AlertChannelRow — lastTriggeredLabel', () => {
  it('returns "Never" for null', () => {
    expect(lastTriggeredLabel(null)).toBe('Never');
    expect(lastTriggeredLabel(undefined)).toBe('Never');
  });

  it('returns non-"Never" value when date is provided', () => {
    const result = lastTriggeredLabel('2026-01-01T00:00:00Z');
    expect(result).not.toBe('Never');
  });
});

describe('AlertChannelRow — colClass', () => {
  it('visible col → empty string (not hidden)', () => {
    expect(colClass(true)).toBe('');
  });

  it('hidden col → "hidden" class', () => {
    expect(colClass(false)).toBe('hidden');
  });
});

describe('AlertChannelRow — day abbreviations', () => {
  const DAY_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  it('Mon-Fri produces 5 day abbreviations', () => {
    const days = [1, 2, 3, 4, 5];
    const result = DAY_ABBR.filter((_, i) => days.includes(i)).join('');
    expect(result).toBe('MoTuWeThFr');
  });

  it('weekend produces 2 day abbreviations', () => {
    const days = [0, 6];
    const result = DAY_ABBR.filter((_, i) => days.includes(i)).join('');
    expect(result).toBe('SuSa');
  });

  it('all days produces 7 abbreviations', () => {
    const days = [0, 1, 2, 3, 4, 5, 6];
    const result = DAY_ABBR.filter((_, i) => days.includes(i)).join('');
    expect(result).toBe('SuMoTuWeThFrSa');
  });
});
