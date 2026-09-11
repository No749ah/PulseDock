/**
 * Unit tests for ConfigHistoryTab pure logic.
 * Tests field label mapping, value formatting, and change display.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  target: 'Target URL',
  type: 'Monitor Type',
  intervalSec: 'Check Interval (s)',
  timeoutMs: 'Timeout (ms)',
  confirmations: 'Confirmations',
  retryCount: 'Retry Count',
  enabled: 'Enabled',
  slaTarget: 'SLA Target (%)',
  slaPeriodDays: 'SLA Period (days)',
  autoIncident: 'Auto-Create Incidents',
  autoIncidentSeverity: 'Incident Severity',
  flapDetectionEnabled: 'Flap Detection',
  flapWindow: 'Flap Window',
  flapThreshold: 'Flap Threshold',
  latencyAlertMs: 'Latency Alert Threshold (ms)',
  anomalyDetection: 'Anomaly Detection',
  anomalyMultiplier: 'Anomaly Multiplier',
  cronExpression: 'Cron Expression',
  scheduleEnabled: 'Business Hours Schedule',
  scheduleDays: 'Schedule Days',
  scheduleStartHour: 'Schedule Start Hour',
  scheduleEndHour: 'Schedule End Hour',
  sliLatencyTarget: 'Latency SLI Target (ms)',
  rtoMinutes: 'RTO (minutes)',
  throttleMs: 'Throttle (ms)',
  maxChecksPerHour: 'Max Checks/Hour',
  metricPath: 'Metric JSONPath',
  metricName: 'Metric Name',
  metricAlertMin: 'Metric Min Alert',
  metricAlertMax: 'Metric Max Alert',
  graphqlQuery: 'GraphQL Query',
  graphqlDataPath: 'GraphQL Data Path',
  graphqlExpectedValue: 'GraphQL Expected Value',
};

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v);
  return s.length > 80 ? s.slice(0, 77) + '…' : s;
}

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function hasChanges(
  entry: { changes: Array<{ field: string; from: unknown; to: unknown }> },
): boolean {
  return entry.changes.length > 0;
}

function sortHistoryNewestFirst(
  entries: Array<{ id: string; createdAt: string }>,
): typeof entries {
  return [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConfigHistoryTab — fieldLabel', () => {
  it('maps known fields to human-readable labels', () => {
    expect(fieldLabel('name')).toBe('Name');
    expect(fieldLabel('intervalSec')).toBe('Check Interval (s)');
    expect(fieldLabel('slaTarget')).toBe('SLA Target (%)');
    expect(fieldLabel('graphqlQuery')).toBe('GraphQL Query');
  });

  it('returns the raw field name for unknown fields', () => {
    expect(fieldLabel('someNewField')).toBe('someNewField');
    expect(fieldLabel('customProp')).toBe('customProp');
  });

  it('all 35 known fields have labels', () => {
    expect(Object.keys(FIELD_LABELS)).toHaveLength(35);
    Object.values(FIELD_LABELS).forEach((label) => {
      expect(label.length).toBeGreaterThan(0);
    });
  });
});

describe('ConfigHistoryTab — formatVal', () => {
  it('null → "—"', () => expect(formatVal(null)).toBe('—'));
  it('undefined → "—"', () => expect(formatVal(undefined)).toBe('—'));

  it('true boolean → "true"', () => expect(formatVal(true)).toBe('true'));
  it('false boolean → "false"', () => expect(formatVal(false)).toBe('false'));

  it('number → string representation', () => {
    expect(formatVal(30)).toBe('30');
    expect(formatVal(0)).toBe('0');
    expect(formatVal(3.14)).toBe('3.14');
  });

  it('short string → returned as-is', () => {
    expect(formatVal('https://example.com')).toBe('https://example.com');
    expect(formatVal('HTTP')).toBe('HTTP');
  });

  it('long string > 80 chars → truncated to 77 + ellipsis', () => {
    const longStr = 'A'.repeat(100);
    const result = formatVal(longStr);
    expect(result.length).toBeLessThanOrEqual(80); // 77 + 3 for "…"
    expect(result.endsWith('…')).toBe(true);
  });

  it('exactly 80 chars → not truncated', () => {
    const str = 'B'.repeat(80);
    expect(formatVal(str)).toBe(str);
    expect(formatVal(str).endsWith('…')).toBe(false);
  });

  it('81 chars → truncated', () => {
    const str = 'C'.repeat(81);
    expect(formatVal(str).endsWith('…')).toBe(true);
  });

  it('object → string coercion', () => {
    expect(formatVal({ x: 1 })).toBe('[object Object]');
  });
});

describe('ConfigHistoryTab — hasChanges', () => {
  it('returns true when changes array has items', () => {
    const entry = { changes: [{ field: 'name', from: 'old', to: 'new' }] };
    expect(hasChanges(entry)).toBe(true);
  });

  it('returns false when changes array is empty', () => {
    expect(hasChanges({ changes: [] })).toBe(false);
  });
});

describe('ConfigHistoryTab — sortHistoryNewestFirst', () => {
  it('sorts entries by createdAt descending', () => {
    const entries = [
      { id: 'a', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'c', createdAt: '2026-03-01T00:00:00Z' },
      { id: 'b', createdAt: '2026-02-01T00:00:00Z' },
    ];
    const sorted = sortHistoryNewestFirst(entries);
    expect(sorted[0].id).toBe('c'); // March newest
    expect(sorted[1].id).toBe('b');
    expect(sorted[2].id).toBe('a'); // January oldest
  });

  it('does not mutate original array', () => {
    const entries = [
      { id: 'a', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'b', createdAt: '2026-03-01T00:00:00Z' },
    ];
    sortHistoryNewestFirst(entries);
    expect(entries[0].id).toBe('a'); // unchanged
  });

  it('handles empty input', () => {
    expect(sortHistoryNewestFirst([])).toHaveLength(0);
  });
});

describe('ConfigHistoryTab — real-world change scenarios', () => {
  it('interval change is human-readable', () => {
    expect(fieldLabel('intervalSec')).toContain('Interval');
    expect(formatVal(30)).toBe('30');
    expect(formatVal(300)).toBe('300');
  });

  it('enabled toggle formats correctly', () => {
    expect(fieldLabel('enabled')).toBe('Enabled');
    expect(formatVal(true)).toBe('true');
    expect(formatVal(false)).toBe('false');
  });

  it('null→value change shows correctly', () => {
    expect(formatVal(null)).toBe('—');
    expect(formatVal('https://example.com/health')).toBe('https://example.com/health');
  });
});
