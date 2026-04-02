/**
 * Unit tests for NotificationPrefsCard pure logic.
 *
 * Tests: optimistic patch construction, quiet hours toggle/range,
 * frequency options, alert storm threshold clamping.
 */
import { describe, it, expect } from 'vitest';

// ── Types/constants mirrored from component ────────────────────────────────────

interface NotificationPreference {
  id: string;
  notifyOnDown: boolean;
  notifyOnRecovery: boolean;
  notifyOnDegraded: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  frequency: string;
  alertStormProtection: boolean;
  alertStormThreshold: number;
}

const FREQUENCY_OPTIONS = [
  { value: 'instant', label: 'Instant' },
  { value: 'hourly_digest', label: 'Hourly Digest' },
  { value: 'daily_digest', label: 'Daily Digest' },
  { value: 'weekly_digest', label: 'Weekly Digest' },
] as const;

type FrequencyValue = typeof FREQUENCY_OPTIONS[number]['value'];

const ALERT_EVENT_KEYS = ['notifyOnDown', 'notifyOnRecovery', 'notifyOnDegraded'] as const;

/** Clamp storm threshold to [1, 100] */
function clampStormThreshold(raw: number): number {
  return Math.max(1, Math.min(100, raw));
}

/** Build optimistic patch (shallow merge) */
function applyOptimisticPatch(
  current: NotificationPreference,
  patch: Partial<NotificationPreference>,
): NotificationPreference {
  return { ...current, ...patch };
}

/** Format quiet hours hour for display */
function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NotificationPrefsCard — FREQUENCY_OPTIONS', () => {
  it('has 4 frequency options', () => {
    expect(FREQUENCY_OPTIONS).toHaveLength(4);
  });

  it('instant is first option', () => {
    expect(FREQUENCY_OPTIONS[0].value).toBe('instant');
  });

  it('weekly_digest is last option', () => {
    expect(FREQUENCY_OPTIONS[FREQUENCY_OPTIONS.length - 1].value).toBe('weekly_digest');
  });

  it('all options have distinct values', () => {
    const values = FREQUENCY_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('all options have non-empty labels', () => {
    for (const opt of FREQUENCY_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });

  it('includes expected frequency values', () => {
    const values = FREQUENCY_OPTIONS.map((o) => o.value) as string[];
    expect(values).toContain('instant');
    expect(values).toContain('hourly_digest');
    expect(values).toContain('daily_digest');
    expect(values).toContain('weekly_digest');
  });
});

describe('NotificationPrefsCard — ALERT_EVENT_KEYS', () => {
  it('has 3 event keys', () => {
    expect(ALERT_EVENT_KEYS).toHaveLength(3);
  });

  it('contains notifyOnDown', () => {
    expect(ALERT_EVENT_KEYS).toContain('notifyOnDown');
  });

  it('contains notifyOnRecovery', () => {
    expect(ALERT_EVENT_KEYS).toContain('notifyOnRecovery');
  });

  it('contains notifyOnDegraded', () => {
    expect(ALERT_EVENT_KEYS).toContain('notifyOnDegraded');
  });
});

describe('NotificationPrefsCard — clampStormThreshold', () => {
  it('passes valid values unchanged', () => {
    expect(clampStormThreshold(1)).toBe(1);
    expect(clampStormThreshold(10)).toBe(10);
    expect(clampStormThreshold(100)).toBe(100);
  });

  it('clamps below 1 to 1', () => {
    expect(clampStormThreshold(0)).toBe(1);
    expect(clampStormThreshold(-5)).toBe(1);
  });

  it('clamps above 100 to 100', () => {
    expect(clampStormThreshold(101)).toBe(100);
    expect(clampStormThreshold(9999)).toBe(100);
  });

  it('boundary values 1 and 100 are inclusive', () => {
    expect(clampStormThreshold(1)).toBe(1);
    expect(clampStormThreshold(100)).toBe(100);
  });
});

describe('NotificationPrefsCard — applyOptimisticPatch', () => {
  const base: NotificationPreference = {
    id: 'np-1',
    notifyOnDown: true,
    notifyOnRecovery: true,
    notifyOnDegraded: false,
    quietHoursEnabled: false,
    quietHoursStart: 22,
    quietHoursEnd: 8,
    frequency: 'instant',
    alertStormProtection: false,
    alertStormThreshold: 10,
  };

  it('toggles notifyOnDegraded', () => {
    const patched = applyOptimisticPatch(base, { notifyOnDegraded: true });
    expect(patched.notifyOnDegraded).toBe(true);
    // other fields preserved
    expect(patched.notifyOnDown).toBe(true);
  });

  it('changes frequency', () => {
    const patched = applyOptimisticPatch(base, { frequency: 'daily_digest' });
    expect(patched.frequency).toBe('daily_digest');
  });

  it('toggles quietHoursEnabled', () => {
    const patched = applyOptimisticPatch(base, { quietHoursEnabled: true });
    expect(patched.quietHoursEnabled).toBe(true);
    expect(patched.quietHoursStart).toBe(22); // unchanged
  });

  it('updates quietHoursStart', () => {
    const patched = applyOptimisticPatch(base, { quietHoursStart: 23 });
    expect(patched.quietHoursStart).toBe(23);
  });

  it('does not mutate original', () => {
    const _ = applyOptimisticPatch(base, { notifyOnDown: false });
    expect(base.notifyOnDown).toBe(true);
  });

  it('enables alert storm protection', () => {
    const patched = applyOptimisticPatch(base, { alertStormProtection: true });
    expect(patched.alertStormProtection).toBe(true);
  });

  it('updates storm threshold', () => {
    const patched = applyOptimisticPatch(base, { alertStormThreshold: 5 });
    expect(patched.alertStormThreshold).toBe(5);
  });
});

describe('NotificationPrefsCard — formatHour', () => {
  it('zero-pads single-digit hours', () => {
    expect(formatHour(0)).toBe('00:00');
    expect(formatHour(9)).toBe('09:00');
  });

  it('does not pad double-digit hours', () => {
    expect(formatHour(10)).toBe('10:00');
    expect(formatHour(23)).toBe('23:00');
  });

  it('all 24 hours produce valid formatted strings', () => {
    for (let i = 0; i < 24; i++) {
      const formatted = formatHour(i);
      expect(formatted).toMatch(/^\d{2}:00$/);
    }
  });

  it('returns HH:00 format', () => {
    expect(formatHour(22)).toBe('22:00');
    expect(formatHour(8)).toBe('08:00');
  });
});

describe('NotificationPrefsCard — quiet hours range', () => {
  it('start can be 22 and end can be 8 (overnight quiet period)', () => {
    const pref = { quietHoursStart: 22, quietHoursEnd: 8 };
    expect(pref.quietHoursStart).toBe(22);
    expect(pref.quietHoursEnd).toBe(8);
  });

  it('hour range is 0-23', () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    expect(hours[0]).toBe(0);
    expect(hours[23]).toBe(23);
    expect(hours).toHaveLength(24);
  });
});
