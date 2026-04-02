/**
 * Unit tests for ScheduledReportsCard pure logic.
 * Tests frequency options, day of week labels, hour formatting, toggle state,
 * and frequency button class logic.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily', desc: 'One email per day' },
  { value: 'weekly', label: 'Weekly', desc: 'One email per week' },
];

function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00 UTC`;
}

function frequencyButtonClass(value: string, selectedFrequency: string): string {
  const base = 'flex flex-col items-start gap-1 px-4 py-3 rounded-lg border text-left transition-colors';
  const active = 'border-accent bg-accent/10 text-accent';
  const inactive = 'border-border bg-surface-elevated/50 text-text-secondary hover:border-accent/50';
  return `${base} ${value === selectedFrequency ? active : inactive}`;
}

function toggleClass(enabled: boolean): string {
  return enabled
    ? 'bg-accent'
    : 'bg-surface-elevated border border-border';
}

function showDayPicker(frequency: string): boolean {
  return frequency === 'weekly';
}

function showLastSent(lastSentAt: string | null | undefined): boolean {
  return !!lastSentAt;
}

function showNeverSentMsg(report: { lastSentAt?: string | null } | null): boolean {
  return !!report && !report.lastSentAt;
}

function showTestButton(enabled: boolean, report: object | null): boolean {
  return enabled && report !== null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ScheduledReportsCard — DAYS_OF_WEEK', () => {
  it('has 7 entries (Sun-Sat)', () => expect(DAYS_OF_WEEK).toHaveLength(7));
  it('starts with Sunday (index 0)', () => expect(DAYS_OF_WEEK[0]).toBe('Sunday'));
  it('ends with Saturday (index 6)', () => expect(DAYS_OF_WEEK[6]).toBe('Saturday'));
  it('Monday is index 1', () => expect(DAYS_OF_WEEK[1]).toBe('Monday'));
  it('Friday is index 5', () => expect(DAYS_OF_WEEK[5]).toBe('Friday'));
});

describe('ScheduledReportsCard — hourLabel', () => {
  it('formats midnight as "00:00 UTC"', () => expect(hourLabel(0)).toBe('00:00 UTC'));
  it('formats noon as "12:00 UTC"', () => expect(hourLabel(12)).toBe('12:00 UTC'));
  it('formats 23:00 as "23:00 UTC"', () => expect(hourLabel(23)).toBe('23:00 UTC'));
  it('zero-pads single-digit hours', () => {
    expect(hourLabel(8)).toBe('08:00 UTC');
    expect(hourLabel(1)).toBe('01:00 UTC');
  });
  it('generates 24 unique hour labels', () => {
    const labels = Array.from({ length: 24 }, (_, i) => hourLabel(i));
    expect(new Set(labels).size).toBe(24);
  });
});

describe('ScheduledReportsCard — FREQUENCY_OPTIONS', () => {
  it('has exactly 2 options (daily + weekly)', () => expect(FREQUENCY_OPTIONS).toHaveLength(2));
  it('includes daily and weekly', () => {
    const values = FREQUENCY_OPTIONS.map((o) => o.value);
    expect(values).toContain('daily');
    expect(values).toContain('weekly');
  });
  it('all options have label and desc', () => {
    FREQUENCY_OPTIONS.forEach((o) => {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.desc.length).toBeGreaterThan(0);
    });
  });
});

describe('ScheduledReportsCard — frequencyButtonClass', () => {
  it('active frequency gets accent styling', () => {
    expect(frequencyButtonClass('weekly', 'weekly')).toContain('accent');
  });
  it('inactive frequency gets secondary styling', () => {
    expect(frequencyButtonClass('daily', 'weekly')).toContain('text-text-secondary');
  });
});

describe('ScheduledReportsCard — toggleClass', () => {
  it('enabled → accent background', () => expect(toggleClass(true)).toContain('accent'));
  it('disabled → surface background', () => {
    expect(toggleClass(false)).toContain('surface-elevated');
    expect(toggleClass(false)).not.toContain('accent');
  });
});

describe('ScheduledReportsCard — showDayPicker', () => {
  it('shows day picker only for weekly frequency', () => {
    expect(showDayPicker('weekly')).toBe(true);
    expect(showDayPicker('daily')).toBe(false);
  });
});

describe('ScheduledReportsCard — showLastSent', () => {
  it('shows last sent info when lastSentAt is set', () => {
    expect(showLastSent('2026-01-01T00:00:00Z')).toBe(true);
  });
  it('hides last sent info when lastSentAt is null', () => {
    expect(showLastSent(null)).toBe(false);
    expect(showLastSent(undefined)).toBe(false);
  });
});

describe('ScheduledReportsCard — showNeverSentMsg', () => {
  it('shows "never sent" message when report exists but never sent', () => {
    expect(showNeverSentMsg({ lastSentAt: null })).toBe(true);
  });
  it('does not show message when no report yet', () => {
    expect(showNeverSentMsg(null)).toBe(false);
  });
  it('does not show message when report has been sent', () => {
    expect(showNeverSentMsg({ lastSentAt: '2026-01-01T00:00:00Z' })).toBe(false);
  });
});

describe('ScheduledReportsCard — showTestButton', () => {
  it('shows test button when enabled and report exists', () => {
    expect(showTestButton(true, { id: '1' })).toBe(true);
  });
  it('hides test button when disabled', () => {
    expect(showTestButton(false, { id: '1' })).toBe(false);
  });
  it('hides test button when no report yet', () => {
    expect(showTestButton(true, null)).toBe(false);
  });
});
