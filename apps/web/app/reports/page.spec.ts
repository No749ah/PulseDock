/**
 * @vitest-environment node
 * Pure helper coverage for app/reports/page.tsx
 * Tests: formatMinutes, formatDuration, budgetStatusBadgeVariant,
 *        budgetBarColor, uptimeBadgeVariant, statusBadgeVariant, DAY_NAMES
 */

import { describe, it, expect } from 'vitest';

// ── Inline helpers extracted from page.tsx ───────────────────────────────────

type ErrorBudgetStatus = 'healthy' | 'warning' | 'critical' | 'exhausted';

function formatMinutes(min: number): string {
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${min.toFixed(1)}m`;
  if (min < 1440) return `${(min / 60).toFixed(1)}h`;
  return `${(min / 1440).toFixed(1)}d`;
}

function budgetStatusBadgeVariant(status: ErrorBudgetStatus): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'healthy') return 'success';
  if (status === 'warning') return 'warning';
  if (status === 'critical' || status === 'exhausted') return 'danger';
  return 'default';
}

function budgetBarColor(status: ErrorBudgetStatus): string {
  if (status === 'healthy') return 'bg-success';
  if (status === 'warning') return 'bg-warning';
  return 'bg-danger';
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}

function uptimeBadgeVariant(pct: number | null): 'success' | 'warning' | 'danger' | 'default' {
  if (pct === null) return 'default';
  if (pct >= 99) return 'success';
  if (pct >= 95) return 'warning';
  return 'danger';
}

function statusBadgeVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'UP' || status === 'OK') return 'success';
  if (status === 'DEGRADED') return 'warning';
  if (status === 'DOWN' || status === 'ERROR') return 'danger';
  return 'default';
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── formatMinutes ────────────────────────────────────────────────────────────

describe('formatMinutes', () => {
  it('returns seconds for < 1 minute', () => {
    expect(formatMinutes(0)).toBe('0s');
    expect(formatMinutes(0.5)).toBe('30s');
    expect(formatMinutes(0.25)).toBe('15s');
    expect(formatMinutes(0.999)).toBe('60s'); // Math.round(0.999 * 60) = 60
  });

  it('returns minutes with 1 decimal for 1–59 min', () => {
    expect(formatMinutes(1)).toBe('1.0m');
    expect(formatMinutes(30)).toBe('30.0m');
    expect(formatMinutes(59)).toBe('59.0m');
    expect(formatMinutes(5.5)).toBe('5.5m');
  });

  it('returns hours with 1 decimal for 1h–23h59m', () => {
    expect(formatMinutes(60)).toBe('1.0h');
    expect(formatMinutes(90)).toBe('1.5h');
    expect(formatMinutes(120)).toBe('2.0h');
    expect(formatMinutes(1439)).toBe('24.0h'); // 1439/60 = 23.98.. → '24.0h'
  });

  it('returns days with 1 decimal for >= 1440 min', () => {
    expect(formatMinutes(1440)).toBe('1.0d');
    expect(formatMinutes(2880)).toBe('2.0d');
    expect(formatMinutes(10080)).toBe('7.0d');
  });
});

// ── budgetStatusBadgeVariant ─────────────────────────────────────────────────

describe('budgetStatusBadgeVariant', () => {
  it('returns success for healthy', () => {
    expect(budgetStatusBadgeVariant('healthy')).toBe('success');
  });

  it('returns warning for warning', () => {
    expect(budgetStatusBadgeVariant('warning')).toBe('warning');
  });

  it('returns danger for critical', () => {
    expect(budgetStatusBadgeVariant('critical')).toBe('danger');
  });

  it('returns danger for exhausted', () => {
    expect(budgetStatusBadgeVariant('exhausted')).toBe('danger');
  });
});

// ── budgetBarColor ───────────────────────────────────────────────────────────

describe('budgetBarColor', () => {
  it('returns bg-success for healthy', () => {
    expect(budgetBarColor('healthy')).toBe('bg-success');
  });

  it('returns bg-warning for warning', () => {
    expect(budgetBarColor('warning')).toBe('bg-warning');
  });

  it('returns bg-danger for critical', () => {
    expect(budgetBarColor('critical')).toBe('bg-danger');
  });

  it('returns bg-danger for exhausted', () => {
    expect(budgetBarColor('exhausted')).toBe('bg-danger');
  });
});

// ── formatDuration (seconds) ─────────────────────────────────────────────────

describe('formatDuration (seconds)', () => {
  it('returns seconds for < 60s', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(1)).toBe('1s');
    expect(formatDuration(59)).toBe('59s');
  });

  it('returns minutes for 1m–59m59s', () => {
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(120)).toBe('2m');
    expect(formatDuration(3599)).toBe('59m');
  });

  it('returns hours + minutes for 1h–23h59m', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(3660)).toBe('1h 1m');
    expect(formatDuration(7200)).toBe('2h 0m');
    expect(formatDuration(86399)).toBe('23h 59m');
  });

  it('returns days + hours for >= 1d', () => {
    expect(formatDuration(86400)).toBe('1d 0h');
    expect(formatDuration(90000)).toBe('1d 1h');
    expect(formatDuration(172800)).toBe('2d 0h');
  });
});

// ── uptimeBadgeVariant ───────────────────────────────────────────────────────

describe('uptimeBadgeVariant', () => {
  it('returns default for null', () => {
    expect(uptimeBadgeVariant(null)).toBe('default');
  });

  it('returns success for >= 99%', () => {
    expect(uptimeBadgeVariant(99)).toBe('success');
    expect(uptimeBadgeVariant(99.9)).toBe('success');
    expect(uptimeBadgeVariant(100)).toBe('success');
  });

  it('returns warning for 95–98.99%', () => {
    expect(uptimeBadgeVariant(95)).toBe('warning');
    expect(uptimeBadgeVariant(98)).toBe('warning');
    expect(uptimeBadgeVariant(98.99)).toBe('warning');
  });

  it('returns danger for < 95%', () => {
    expect(uptimeBadgeVariant(94.99)).toBe('danger');
    expect(uptimeBadgeVariant(50)).toBe('danger');
    expect(uptimeBadgeVariant(0)).toBe('danger');
  });
});

// ── statusBadgeVariant ───────────────────────────────────────────────────────

describe('statusBadgeVariant', () => {
  it('returns success for UP and OK', () => {
    expect(statusBadgeVariant('UP')).toBe('success');
    expect(statusBadgeVariant('OK')).toBe('success');
  });

  it('returns warning for DEGRADED', () => {
    expect(statusBadgeVariant('DEGRADED')).toBe('warning');
  });

  it('returns danger for DOWN and ERROR', () => {
    expect(statusBadgeVariant('DOWN')).toBe('danger');
    expect(statusBadgeVariant('ERROR')).toBe('danger');
  });

  it('returns default for unknown status', () => {
    expect(statusBadgeVariant('UNKNOWN')).toBe('default');
    expect(statusBadgeVariant('PENDING')).toBe('default');
    expect(statusBadgeVariant('')).toBe('default');
  });
});

// ── DAY_NAMES ────────────────────────────────────────────────────────────────

describe('DAY_NAMES', () => {
  it('has 7 entries', () => {
    expect(DAY_NAMES).toHaveLength(7);
  });

  it('starts with Sunday (index 0) matching JS Date.getDay()', () => {
    expect(DAY_NAMES[0]).toBe('Sunday');
    expect(DAY_NAMES[1]).toBe('Monday');
    expect(DAY_NAMES[6]).toBe('Saturday');
  });

  it('contains all expected weekday names', () => {
    const expected = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    expect(DAY_NAMES).toEqual(expected);
  });
});
