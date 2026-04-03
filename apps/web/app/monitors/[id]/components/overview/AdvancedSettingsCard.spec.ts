/**
 * Unit tests for AdvancedSettingsCard pure logic helpers.
 * Tests the hasSettings guard, business hours schedule formatting,
 * anomaly multiplier, and auto-incident severity label.
 */
import { describe, it, expect } from 'vitest';

// ── Pure helpers mirrored from component ─────────────────────────────────────

interface ExtendedMonitor {
  retryCount?: number | null;
  anomalyDetection?: boolean;
  anomalyMultiplier?: number | null;
  latencyAlertMs?: number | null;
  scheduleEnabled?: boolean;
  scheduleStartHour?: number | null;
  scheduleEndHour?: number | null;
  scheduleDays?: string | null;
  confirmations?: number | null;
  autoIncident?: boolean;
  autoIncidentSeverity?: string | null;
  runbookUrl?: string | null;
  statusWebhookUrl?: string | null;
  timeoutMs?: number | null;
}

function hasSettings(m: ExtendedMonitor): boolean {
  return (
    (m.retryCount != null && m.retryCount > 0) ||
    Boolean(m.anomalyDetection) ||
    Boolean(m.latencyAlertMs) ||
    Boolean(m.scheduleEnabled) ||
    (m.confirmations != null && m.confirmations > 1) ||
    Boolean(m.autoIncident) ||
    Boolean(m.runbookUrl) ||
    Boolean(m.statusWebhookUrl) ||
    Boolean(m.timeoutMs && m.timeoutMs > 0)
  );
}

function businessHoursLabel(m: ExtendedMonitor): string {
  const start = m.scheduleStartHour ?? 8;
  const end = m.scheduleEndHour ?? 18;
  return `${start}:00 – ${end}:00 UTC`;
}

function businessDaysLabel(m: ExtendedMonitor): string {
  const days = (m.scheduleDays ?? '1,2,3,4,5').split(',');
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.map((d) => names[parseInt(d)] ?? d).join(', ');
}

function anomalyMultiplierLabel(m: ExtendedMonitor): string {
  return `${m.anomalyMultiplier ?? 2}× P95 baseline`;
}

function autoIncidentSeverityLabel(m: ExtendedMonitor): string {
  return (m.autoIncidentSeverity ?? 'MEDIUM').toLowerCase();
}

function confirmationsLabel(count: number): string {
  return `${count}× before alert`;
}

function retryCountLabel(count: number): string {
  return `${count}× on failure`;
}

function latencyThresholdLabel(ms: number): string {
  return `> ${ms}ms`;
}

// ── hasSettings ───────────────────────────────────────────────────────────────

describe('hasSettings', () => {
  it('returns false for an empty monitor config', () => {
    expect(hasSettings({})).toBe(false);
  });

  it('returns true when retryCount > 0', () => {
    expect(hasSettings({ retryCount: 3 })).toBe(true);
  });

  it('returns false when retryCount is 0', () => {
    expect(hasSettings({ retryCount: 0 })).toBe(false);
  });

  it('returns false when retryCount is null', () => {
    expect(hasSettings({ retryCount: null })).toBe(false);
  });

  it('returns true when anomalyDetection is enabled', () => {
    expect(hasSettings({ anomalyDetection: true })).toBe(true);
  });

  it('returns false when anomalyDetection is false', () => {
    expect(hasSettings({ anomalyDetection: false })).toBe(false);
  });

  it('returns true when latencyAlertMs is set', () => {
    expect(hasSettings({ latencyAlertMs: 500 })).toBe(true);
  });

  it('returns false when latencyAlertMs is 0 (falsy)', () => {
    expect(hasSettings({ latencyAlertMs: 0 })).toBe(false);
  });

  it('returns true when scheduleEnabled is true', () => {
    expect(hasSettings({ scheduleEnabled: true })).toBe(true);
  });

  it('returns true when confirmations > 1', () => {
    expect(hasSettings({ confirmations: 2 })).toBe(true);
  });

  it('returns false when confirmations is 1 (default)', () => {
    expect(hasSettings({ confirmations: 1 })).toBe(false);
  });

  it('returns false when confirmations is null', () => {
    expect(hasSettings({ confirmations: null })).toBe(false);
  });

  it('returns true when autoIncident is true', () => {
    expect(hasSettings({ autoIncident: true })).toBe(true);
  });

  it('returns true when runbookUrl is set', () => {
    expect(hasSettings({ runbookUrl: 'https://runbooks.example.com/db-down' })).toBe(true);
  });

  it('returns false when runbookUrl is empty string', () => {
    expect(hasSettings({ runbookUrl: '' })).toBe(false);
  });

  it('returns true when statusWebhookUrl is set', () => {
    expect(hasSettings({ statusWebhookUrl: 'https://hooks.example.com/pulsedock' })).toBe(true);
  });

  it('returns true when timeoutMs > 0', () => {
    expect(hasSettings({ timeoutMs: 5000 })).toBe(true);
  });

  it('returns false when timeoutMs is 0', () => {
    expect(hasSettings({ timeoutMs: 0 })).toBe(false);
  });

  it('returns false when timeoutMs is null', () => {
    expect(hasSettings({ timeoutMs: null })).toBe(false);
  });
});

// ── businessHoursLabel ────────────────────────────────────────────────────────

describe('businessHoursLabel', () => {
  it('formats custom start and end hours', () => {
    expect(businessHoursLabel({ scheduleStartHour: 9, scheduleEndHour: 17 })).toBe('9:00 – 17:00 UTC');
  });

  it('defaults to 8–18 when not configured', () => {
    expect(businessHoursLabel({})).toBe('8:00 – 18:00 UTC');
  });

  it('defaults start hour when only end is set', () => {
    expect(businessHoursLabel({ scheduleEndHour: 20 })).toBe('8:00 – 20:00 UTC');
  });

  it('defaults end hour when only start is set', () => {
    expect(businessHoursLabel({ scheduleStartHour: 6 })).toBe('6:00 – 18:00 UTC');
  });

  it('handles midnight-crossing schedule (0–24)', () => {
    expect(businessHoursLabel({ scheduleStartHour: 0, scheduleEndHour: 24 })).toBe('0:00 – 24:00 UTC');
  });
});

// ── businessDaysLabel ─────────────────────────────────────────────────────────

describe('businessDaysLabel', () => {
  it('defaults to Mon–Fri when scheduleDays is null', () => {
    expect(businessDaysLabel({})).toBe('Mon, Tue, Wed, Thu, Fri');
  });

  it('formats custom weekday selection', () => {
    expect(businessDaysLabel({ scheduleDays: '1,3,5' })).toBe('Mon, Wed, Fri');
  });

  it('includes weekend days', () => {
    expect(businessDaysLabel({ scheduleDays: '0,6' })).toBe('Sun, Sat');
  });

  it('handles single day', () => {
    expect(businessDaysLabel({ scheduleDays: '3' })).toBe('Wed');
  });

  it('handles all days 0–6', () => {
    expect(businessDaysLabel({ scheduleDays: '0,1,2,3,4,5,6' })).toBe('Sun, Mon, Tue, Wed, Thu, Fri, Sat');
  });
});

// ── anomalyMultiplierLabel ────────────────────────────────────────────────────

describe('anomalyMultiplierLabel', () => {
  it('returns default 2× label when multiplier is not set', () => {
    expect(anomalyMultiplierLabel({})).toBe('2× P95 baseline');
  });

  it('returns configured multiplier', () => {
    expect(anomalyMultiplierLabel({ anomalyMultiplier: 3 })).toBe('3× P95 baseline');
  });

  it('handles null multiplier — falls back to 2', () => {
    expect(anomalyMultiplierLabel({ anomalyMultiplier: null })).toBe('2× P95 baseline');
  });

  it('handles decimal multiplier', () => {
    expect(anomalyMultiplierLabel({ anomalyMultiplier: 1.5 })).toBe('1.5× P95 baseline');
  });
});

// ── autoIncidentSeverityLabel ─────────────────────────────────────────────────

describe('autoIncidentSeverityLabel', () => {
  it('lowercases configured severity', () => {
    expect(autoIncidentSeverityLabel({ autoIncidentSeverity: 'HIGH' })).toBe('high');
  });

  it('defaults to medium when not configured', () => {
    expect(autoIncidentSeverityLabel({})).toBe('medium');
  });

  it('defaults to medium when null', () => {
    expect(autoIncidentSeverityLabel({ autoIncidentSeverity: null })).toBe('medium');
  });

  it('handles LOW severity', () => {
    expect(autoIncidentSeverityLabel({ autoIncidentSeverity: 'LOW' })).toBe('low');
  });

  it('handles CRITICAL severity', () => {
    expect(autoIncidentSeverityLabel({ autoIncidentSeverity: 'CRITICAL' })).toBe('critical');
  });
});

// ── confirmationsLabel ────────────────────────────────────────────────────────

describe('confirmationsLabel', () => {
  it('formats 2 confirmations', () => {
    expect(confirmationsLabel(2)).toBe('2× before alert');
  });

  it('formats 5 confirmations', () => {
    expect(confirmationsLabel(5)).toBe('5× before alert');
  });

  it('formats 10 confirmations', () => {
    expect(confirmationsLabel(10)).toBe('10× before alert');
  });
});

// ── retryCountLabel ───────────────────────────────────────────────────────────

describe('retryCountLabel', () => {
  it('formats 3 retries', () => {
    expect(retryCountLabel(3)).toBe('3× on failure');
  });

  it('formats 1 retry', () => {
    expect(retryCountLabel(1)).toBe('1× on failure');
  });
});

// ── latencyThresholdLabel ─────────────────────────────────────────────────────

describe('latencyThresholdLabel', () => {
  it('formats 500ms threshold', () => {
    expect(latencyThresholdLabel(500)).toBe('> 500ms');
  });

  it('formats 1000ms threshold', () => {
    expect(latencyThresholdLabel(1000)).toBe('> 1000ms');
  });

  it('formats 250ms threshold', () => {
    expect(latencyThresholdLabel(250)).toBe('> 250ms');
  });
});
