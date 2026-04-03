/**
 * Unit tests for pure helpers in app/maintenance/page.tsx.
 *
 * Covers: DAYS_OF_WEEK structure, getStatus (4 branches), formatWindowDuration
 * (minutes/hours/hours+mins), formatEndsIn (branches), recurrenceLabel
 * (NONE/DAILY/WEEKLY/MONTHLY), toDatetimeLocal.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// ── Types ─────────────────────────────────────────────────────────────────────

type Recurrence = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

interface MaintenanceWindow {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  recurrence: Recurrence;
  recurrenceDays: string | null;
  durationMinutes: number | null;
  recurrenceEndsAt: string | null;
  monitorIds: string[];
  monitorCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Inline-reproduced helpers ─────────────────────────────────────────────────

const DAYS_OF_WEEK = [
  { label: 'Sun', value: '0' },
  { label: 'Mon', value: '1' },
  { label: 'Tue', value: '2' },
  { label: 'Wed', value: '3' },
  { label: 'Thu', value: '4' },
  { label: 'Fri', value: '5' },
  { label: 'Sat', value: '6' },
];

function getStatus(w: MaintenanceWindow): 'active' | 'upcoming' | 'past' | 'recurring' {
  if (w.isActive) return 'active';
  if (w.recurrence !== 'NONE') return 'recurring';
  const now = Date.now();
  if (new Date(w.startsAt).getTime() > now) return 'upcoming';
  return 'past';
}

function formatWindowDuration(w: MaintenanceWindow): string {
  const mins = w.durationMinutes ??
    Math.round((new Date(w.endsAt).getTime() - new Date(w.startsAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m window`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m window` : `${hrs}h window`;
}

function formatEndsIn(w: MaintenanceWindow): string {
  const remaining = new Date(w.endsAt).getTime() - Date.now();
  if (remaining <= 0) return 'ending now';
  const totalMins = Math.floor(remaining / 60000);
  if (totalMins < 60) return `Ends in ${totalMins}m`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `Ends in ${hrs}h ${mins}m` : `Ends in ${hrs}h`;
}

function recurrenceLabel(w: MaintenanceWindow): string {
  if (w.recurrence === 'NONE') return '';
  if (w.recurrence === 'DAILY') return 'Daily';
  if (w.recurrence === 'MONTHLY') return 'Monthly';
  if (w.recurrence === 'WEEKLY') {
    const days = (w.recurrenceDays ?? '')
      .split(',')
      .map((d) => DAYS_OF_WEEK.find((x) => x.value === d.trim())?.label ?? '')
      .filter(Boolean);
    return days.length > 0 ? `Weekly (${days.join(', ')})` : 'Weekly';
  }
  return w.recurrence;
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Fixture factory ───────────────────────────────────────────────────────────

const NOW = new Date('2026-04-03T08:00:00Z');

function makeWindow(overrides: Partial<MaintenanceWindow> = {}): MaintenanceWindow {
  return {
    id: 'w1',
    name: 'Test Window',
    description: null,
    startsAt: new Date(NOW.getTime() - 30 * 60 * 1000).toISOString(), // 30m ago
    endsAt: new Date(NOW.getTime() + 30 * 60 * 1000).toISOString(),   // 30m from now
    recurrence: 'NONE',
    recurrenceDays: null,
    durationMinutes: null,
    recurrenceEndsAt: null,
    monitorIds: [],
    monitorCount: 0,
    isActive: false,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

// ── DAYS_OF_WEEK ──────────────────────────────────────────────────────────────

describe('DAYS_OF_WEEK', () => {
  it('has 7 entries', () => {
    expect(DAYS_OF_WEEK).toHaveLength(7);
  });

  it('starts with Sunday (value=0)', () => {
    expect(DAYS_OF_WEEK[0]).toEqual({ label: 'Sun', value: '0' });
  });

  it('ends with Saturday (value=6)', () => {
    expect(DAYS_OF_WEEK[6]).toEqual({ label: 'Sat', value: '6' });
  });

  it('values are string representations of 0-6', () => {
    DAYS_OF_WEEK.forEach((d, i) => {
      expect(d.value).toBe(String(i));
    });
  });
});

// ── getStatus ─────────────────────────────────────────────────────────────────

describe('getStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns active when isActive=true', () => {
    const w = makeWindow({ isActive: true });
    expect(getStatus(w)).toBe('active');
  });

  it('isActive takes priority over recurrence', () => {
    const w = makeWindow({ isActive: true, recurrence: 'WEEKLY' });
    expect(getStatus(w)).toBe('active');
  });

  it('returns recurring when recurrence !== NONE and not active', () => {
    expect(getStatus(makeWindow({ recurrence: 'DAILY' }))).toBe('recurring');
    expect(getStatus(makeWindow({ recurrence: 'WEEKLY' }))).toBe('recurring');
    expect(getStatus(makeWindow({ recurrence: 'MONTHLY' }))).toBe('recurring');
  });

  it('returns upcoming when startsAt is in the future', () => {
    const w = makeWindow({
      startsAt: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(), // 1h from now
    });
    expect(getStatus(w)).toBe('upcoming');
  });

  it('returns past when startsAt is in the past and non-recurring', () => {
    const w = makeWindow({
      startsAt: new Date(NOW.getTime() - 120 * 60 * 1000).toISOString(), // 2h ago
      endsAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),    // 1h ago (ended)
    });
    expect(getStatus(w)).toBe('past');
  });
});

// ── formatWindowDuration ──────────────────────────────────────────────────────

describe('formatWindowDuration', () => {
  it('uses durationMinutes when provided', () => {
    const w = makeWindow({ durationMinutes: 45 });
    expect(formatWindowDuration(w)).toBe('45m window');
  });

  it('calculates from startsAt/endsAt when durationMinutes is null', () => {
    const startsAt = new Date('2026-04-03T08:00:00Z').toISOString();
    const endsAt = new Date('2026-04-03T08:30:00Z').toISOString(); // 30m
    const w = makeWindow({ durationMinutes: null, startsAt, endsAt });
    expect(formatWindowDuration(w)).toBe('30m window');
  });

  it('returns Xm window for < 60 minutes', () => {
    const w = makeWindow({ durationMinutes: 59 });
    expect(formatWindowDuration(w)).toBe('59m window');
  });

  it('returns Xh window for exact hours', () => {
    const w = makeWindow({ durationMinutes: 60 });
    expect(formatWindowDuration(w)).toBe('1h window');
    const w2 = makeWindow({ durationMinutes: 120 });
    expect(formatWindowDuration(w2)).toBe('2h window');
  });

  it('returns Xh Ym window for hours + remaining minutes', () => {
    const w = makeWindow({ durationMinutes: 90 }); // 1h 30m
    expect(formatWindowDuration(w)).toBe('1h 30m window');
    const w2 = makeWindow({ durationMinutes: 125 }); // 2h 5m
    expect(formatWindowDuration(w2)).toBe('2h 5m window');
  });
});

// ── formatEndsIn ──────────────────────────────────────────────────────────────

describe('formatEndsIn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns ending now when already ended', () => {
    const w = makeWindow({ endsAt: new Date(NOW.getTime() - 1000).toISOString() });
    expect(formatEndsIn(w)).toBe('ending now');
  });

  it('returns Ends in Xm for < 60 min remaining', () => {
    const w = makeWindow({ endsAt: new Date(NOW.getTime() + 30 * 60 * 1000).toISOString() });
    expect(formatEndsIn(w)).toBe('Ends in 30m');
  });

  it('returns Ends in Xh for exact hours remaining', () => {
    const w = makeWindow({ endsAt: new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString() });
    expect(formatEndsIn(w)).toBe('Ends in 2h');
  });

  it('returns Ends in Xh Ym for hours+minutes', () => {
    const w = makeWindow({ endsAt: new Date(NOW.getTime() + (1 * 60 + 45) * 60 * 1000).toISOString() });
    expect(formatEndsIn(w)).toBe('Ends in 1h 45m');
  });
});

// ── recurrenceLabel ───────────────────────────────────────────────────────────

describe('recurrenceLabel', () => {
  it('returns empty string for NONE', () => {
    expect(recurrenceLabel(makeWindow({ recurrence: 'NONE' }))).toBe('');
  });

  it('returns Daily for DAILY', () => {
    expect(recurrenceLabel(makeWindow({ recurrence: 'DAILY' }))).toBe('Daily');
  });

  it('returns Monthly for MONTHLY', () => {
    expect(recurrenceLabel(makeWindow({ recurrence: 'MONTHLY' }))).toBe('Monthly');
  });

  it('returns Weekly for WEEKLY with no days specified', () => {
    const w = makeWindow({ recurrence: 'WEEKLY', recurrenceDays: null });
    expect(recurrenceLabel(w)).toBe('Weekly');
  });

  it('returns Weekly with day labels for WEEKLY with days', () => {
    const w = makeWindow({ recurrence: 'WEEKLY', recurrenceDays: '1,3,5' });
    expect(recurrenceLabel(w)).toBe('Weekly (Mon, Wed, Fri)');
  });

  it('handles single day for WEEKLY', () => {
    const w = makeWindow({ recurrence: 'WEEKLY', recurrenceDays: '0' });
    expect(recurrenceLabel(w)).toBe('Weekly (Sun)');
  });

  it('handles all 7 days for WEEKLY', () => {
    const w = makeWindow({ recurrence: 'WEEKLY', recurrenceDays: '0,1,2,3,4,5,6' });
    expect(recurrenceLabel(w)).toBe('Weekly (Sun, Mon, Tue, Wed, Thu, Fri, Sat)');
  });
});

// ── toDatetimeLocal ───────────────────────────────────────────────────────────

describe('toDatetimeLocal', () => {
  it('formats ISO string to datetime-local format', () => {
    // Test with a known UTC time - output depends on local timezone
    const iso = new Date('2026-04-03T14:30:00').toISOString();
    const result = toDatetimeLocal(iso);
    // Format should be YYYY-MM-DDTHH:MM
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('pads month/day/hour/minute with leading zeros', () => {
    // Create a date in local time to avoid timezone issues
    const d = new Date(2026, 0, 5, 9, 5); // Jan 5, 09:05 local
    const result = toDatetimeLocal(d.toISOString());
    // Should be padded: month 01, day 05, hour 09, minute 05
    expect(result).toMatch(/-01-05T09:05$/);
  });
});
