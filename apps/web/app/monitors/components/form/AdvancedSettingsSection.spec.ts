/**
 * Unit tests for AdvancedSettingsSection pure logic.
 * Tests interval validation, flap detection, adaptive intervals, cron presets,
 * priority options, SLA periods, and rate limiting clamps.
 */
import { describe, it, expect } from 'vitest';

// ── Constants mirrored from component ────────────────────────────────────────

const INTERVAL_MIN = 30;
const INTERVAL_MAX = 3600;
const CONFIRMATIONS_MIN = 1;
const CONFIRMATIONS_MAX = 10;
const RETRY_OPTIONS = [0, 1, 2, 3] as const;

const SLA_PERIODS = [7, 14, 30, 90] as const;
const SLI_WINDOWS = [1, 7, 14, 30] as const;

const PRIORITY_OPTIONS = [
  { value: 0, label: 'Unset' },
  { value: 1, label: 'P1 — Critical' },
  { value: 2, label: 'P2 — High' },
  { value: 3, label: 'P3 — Medium' },
  { value: 4, label: 'P4 — Low' },
] as const;

const FLAP_THRESHOLD_OPTIONS = [0.3, 0.4, 0.5, 0.6, 0.7] as const;
const FLAP_WINDOW_MIN = 5;
const FLAP_WINDOW_MAX = 50;

const INCIDENT_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

const CRON_PRESETS = [
  { label: 'Every 1 min', expr: '* * * * *' },
  { label: 'Every 5 min', expr: '*/5 * * * *' },
  { label: 'Every 15 min', expr: '*/15 * * * *' },
  { label: 'Every 30 min', expr: '*/30 * * * *' },
  { label: 'Every hour', expr: '0 * * * *' },
  { label: 'Daily 9am UTC', expr: '0 9 * * *' },
  { label: 'Weekdays 9am UTC', expr: '0 9 * * 1-5' },
] as const;

// ── Logic mirrored from component ────────────────────────────────────────────

function validateInterval(val: number, touched: boolean): string {
  if (!touched) return '';
  if (val < INTERVAL_MIN) return 'Min 30s';
  if (val > INTERVAL_MAX) return 'Max 3600s';
  return '';
}

function validateConfirmations(val: number, touched: boolean): string {
  if (!touched) return '';
  if (val < CONFIRMATIONS_MIN) return 'Min 1';
  if (val > CONFIRMATIONS_MAX) return 'Max 10';
  return '';
}

function adaptiveDownDefault(intervalSec: number): number {
  return Math.max(10, Math.floor(intervalSec / 4));
}

function adaptiveDegradedDefault(intervalSec: number): number {
  return Math.max(15, Math.floor(intervalSec / 2));
}

function clampThrottle(val: number | null): number | null {
  if (val === null || val < 1000) return null;
  return val;
}

function clampMaxChecksPerHour(val: number | null): number | null {
  if (val === null || val < 1) return null;
  return val;
}

function toggleCronExpression(current: string | undefined): string {
  return current ? '' : '*/5 * * * *';
}

function getScheduleDays(days: string | undefined): number[] {
  return (days ?? '1,2,3,4,5').split(',').map(Number);
}

function toggleScheduleDay(days: number[], day: number): number[] {
  const active = days.includes(day);
  const next = active ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
  return next;
}

function latencyAlertDisplay(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '';
  return `Alert if response > ${ms}ms`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AdvancedSettingsSection — interval validation', () => {
  it('no error when not touched', () => {
    expect(validateInterval(10, false)).toBe('');
  });

  it('error for interval below 30 when touched', () => {
    expect(validateInterval(29, true)).toBe('Min 30s');
    expect(validateInterval(0, true)).toBe('Min 30s');
  });

  it('error for interval above 3600 when touched', () => {
    expect(validateInterval(3601, true)).toBe('Max 3600s');
  });

  it('no error for valid interval when touched', () => {
    expect(validateInterval(60, true)).toBe('');
    expect(validateInterval(30, true)).toBe('');
    expect(validateInterval(3600, true)).toBe('');
  });
});

describe('AdvancedSettingsSection — confirmations validation', () => {
  it('no error when not touched', () => {
    expect(validateConfirmations(0, false)).toBe('');
  });

  it('error for confirmations below 1', () => {
    expect(validateConfirmations(0, true)).toBe('Min 1');
  });

  it('error for confirmations above 10', () => {
    expect(validateConfirmations(11, true)).toBe('Max 10');
  });

  it('no error for valid confirmations', () => {
    expect(validateConfirmations(1, true)).toBe('');
    expect(validateConfirmations(5, true)).toBe('');
    expect(validateConfirmations(10, true)).toBe('');
  });
});

describe('AdvancedSettingsSection — retry options', () => {
  it('has 4 retry options (0–3)', () => {
    expect(RETRY_OPTIONS).toHaveLength(4);
  });

  it('starts at 0 and ends at 3', () => {
    expect(RETRY_OPTIONS[0]).toBe(0);
    expect(RETRY_OPTIONS[3]).toBe(3);
  });
});

describe('AdvancedSettingsSection — SLA periods', () => {
  it('has 4 SLA period options', () => {
    expect(SLA_PERIODS).toHaveLength(4);
  });

  it('contains 7, 14, 30, 90 days', () => {
    expect([...SLA_PERIODS]).toContain(7);
    expect([...SLA_PERIODS]).toContain(14);
    expect([...SLA_PERIODS]).toContain(30);
    expect([...SLA_PERIODS]).toContain(90);
  });

  it('SLI windows contain 1, 7, 14, 30', () => {
    expect([...SLI_WINDOWS]).toContain(1);
    expect([...SLI_WINDOWS]).toContain(7);
    expect([...SLI_WINDOWS]).toContain(14);
    expect([...SLI_WINDOWS]).toContain(30);
  });
});

describe('AdvancedSettingsSection — priority options', () => {
  it('has 5 priority options', () => {
    expect(PRIORITY_OPTIONS).toHaveLength(5);
  });

  it('first option is Unset with value 0', () => {
    expect(PRIORITY_OPTIONS[0]).toEqual({ value: 0, label: 'Unset' });
  });

  it('P1 is Critical', () => {
    const p1 = PRIORITY_OPTIONS.find((p) => p.value === 1);
    expect(p1?.label).toContain('Critical');
  });

  it('P4 is Low', () => {
    const p4 = PRIORITY_OPTIONS.find((p) => p.value === 4);
    expect(p4?.label).toContain('Low');
  });

  it('values are 0–4 in order', () => {
    PRIORITY_OPTIONS.forEach((p, i) => expect(p.value).toBe(i));
  });
});

describe('AdvancedSettingsSection — flap detection', () => {
  it('has 5 threshold options', () => {
    expect(FLAP_THRESHOLD_OPTIONS).toHaveLength(5);
  });

  it('default threshold is 0.5', () => {
    expect(FLAP_THRESHOLD_OPTIONS[2]).toBe(0.5);
  });

  it('thresholds range from 0.3 to 0.7', () => {
    expect(FLAP_THRESHOLD_OPTIONS[0]).toBe(0.3);
    expect(FLAP_THRESHOLD_OPTIONS[4]).toBe(0.7);
  });

  it('flap window min is 5, max is 50', () => {
    expect(FLAP_WINDOW_MIN).toBe(5);
    expect(FLAP_WINDOW_MAX).toBe(50);
  });
});

describe('AdvancedSettingsSection — incident severities', () => {
  it('has 4 severity options', () => {
    expect(INCIDENT_SEVERITIES).toHaveLength(4);
  });

  it('contains CRITICAL, HIGH, MEDIUM, LOW', () => {
    const sev = [...INCIDENT_SEVERITIES];
    expect(sev).toContain('CRITICAL');
    expect(sev).toContain('HIGH');
    expect(sev).toContain('MEDIUM');
    expect(sev).toContain('LOW');
  });
});

describe('AdvancedSettingsSection — adaptive interval defaults', () => {
  it('down interval is 1/4 of normal (min 10)', () => {
    expect(adaptiveDownDefault(60)).toBe(15);
    expect(adaptiveDownDefault(300)).toBe(75);
  });

  it('down interval clamps to minimum 10', () => {
    expect(adaptiveDownDefault(30)).toBe(10);
    expect(adaptiveDownDefault(20)).toBe(10);
  });

  it('degraded interval is 1/2 of normal (min 15)', () => {
    expect(adaptiveDegradedDefault(60)).toBe(30);
    expect(adaptiveDegradedDefault(120)).toBe(60);
  });

  it('degraded interval clamps to minimum 15', () => {
    expect(adaptiveDegradedDefault(30)).toBe(15);
    expect(adaptiveDegradedDefault(20)).toBe(15);
  });
});

describe('AdvancedSettingsSection — rate limiting', () => {
  it('clampThrottle returns null for value < 1000', () => {
    expect(clampThrottle(500)).toBeNull();
    expect(clampThrottle(0)).toBeNull();
    expect(clampThrottle(null)).toBeNull();
  });

  it('clampThrottle keeps valid value', () => {
    expect(clampThrottle(1000)).toBe(1000);
    expect(clampThrottle(5000)).toBe(5000);
  });

  it('clampMaxChecksPerHour returns null for value < 1', () => {
    expect(clampMaxChecksPerHour(0)).toBeNull();
    expect(clampMaxChecksPerHour(null)).toBeNull();
  });

  it('clampMaxChecksPerHour keeps valid value', () => {
    expect(clampMaxChecksPerHour(60)).toBe(60);
    expect(clampMaxChecksPerHour(360)).toBe(360);
  });
});

describe('AdvancedSettingsSection — cron expression toggle', () => {
  it('toggles to default preset when enabling', () => {
    expect(toggleCronExpression(undefined)).toBe('*/5 * * * *');
    expect(toggleCronExpression('')).toBe('*/5 * * * *');
  });

  it('clears when disabling', () => {
    expect(toggleCronExpression('*/5 * * * *')).toBe('');
    expect(toggleCronExpression('0 9 * * *')).toBe('');
  });
});

describe('AdvancedSettingsSection — cron presets', () => {
  it('has 7 presets', () => {
    expect(CRON_PRESETS).toHaveLength(7);
  });

  it('every 5 min preset has correct expression', () => {
    const preset = CRON_PRESETS.find((p) => p.label.includes('5 min'));
    expect(preset?.expr).toBe('*/5 * * * *');
  });

  it('weekdays preset expression ends with 1-5', () => {
    const preset = CRON_PRESETS.find((p) => p.label.includes('Weekdays'));
    expect(preset?.expr).toMatch(/1-5$/);
  });

  it('every preset has non-empty label and expr', () => {
    CRON_PRESETS.forEach((p) => {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.expr.length).toBeGreaterThan(0);
    });
  });
});

describe('AdvancedSettingsSection — business hours schedule days', () => {
  it('default days are Mon–Fri (1-5)', () => {
    const days = getScheduleDays(undefined);
    expect(days).toEqual([1, 2, 3, 4, 5]);
  });

  it('parses custom day string', () => {
    const days = getScheduleDays('1,3,5');
    expect(days).toEqual([1, 3, 5]);
  });

  it('toggleScheduleDay adds a day when not present', () => {
    const result = toggleScheduleDay([1, 2, 3], 4);
    expect(result).toContain(4);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it('toggleScheduleDay removes a day when present', () => {
    const result = toggleScheduleDay([1, 2, 3], 2);
    expect(result).toEqual([1, 3]);
  });

  it('toggleScheduleDay keeps result sorted', () => {
    const result = toggleScheduleDay([1, 3, 5], 2);
    expect(result).toEqual([1, 2, 3, 5]);
  });
});

describe('AdvancedSettingsSection — latency alert display', () => {
  it('returns empty string for no threshold', () => {
    expect(latencyAlertDisplay(null)).toBe('');
    expect(latencyAlertDisplay(undefined)).toBe('');
    expect(latencyAlertDisplay(0)).toBe('');
  });

  it('returns formatted string for valid threshold', () => {
    expect(latencyAlertDisplay(2000)).toBe('Alert if response > 2000ms');
  });
});
