/**
 * Unit tests for MetricTab pure logic.
 * Tests level colour/label mapping, metric period buttons, stat formatting.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

const PERIOD_OPTIONS = [7, 30, 90] as const;
type Period = typeof PERIOD_OPTIONS[number];

function metricLevelColor(level: string): string {
  if (level === 'red') return 'text-danger';
  if (level === 'yellow') return 'text-warning';
  return 'text-success';
}

function metricLevelLabel(level: string): string {
  if (level === 'red') return 'Down';
  if (level === 'yellow') return 'Degraded';
  return 'OK';
}

function periodButtonClass(period: Period, activePeriod: number): string {
  return period === activePeriod
    ? 'bg-accent text-white'
    : 'bg-surface-elevated text-text-secondary hover:text-text-primary';
}

function resolveMetricName(
  metricDataName: string | null | undefined,
  monitorMetricName: string | null | undefined,
): string {
  return metricDataName ?? monitorMetricName ?? 'Captured Value';
}

interface Stats {
  min: number | null;
  max: number | null;
  avg: number | null;
  latest: number | null;
  count: number;
}

function computeRange(stats: Stats): number | null {
  if (stats.min == null || stats.max == null) return null;
  return stats.max - stats.min;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MetricTab — PERIOD_OPTIONS', () => {
  it('has 3 period options', () => {
    expect(PERIOD_OPTIONS).toHaveLength(3);
  });

  it('contains 7, 30, and 90 days', () => {
    expect(PERIOD_OPTIONS).toContain(7);
    expect(PERIOD_OPTIONS).toContain(30);
    expect(PERIOD_OPTIONS).toContain(90);
  });
});

describe('MetricTab — metricLevelColor', () => {
  it('returns danger for red level', () => {
    expect(metricLevelColor('red')).toBe('text-danger');
  });

  it('returns warning for yellow level', () => {
    expect(metricLevelColor('yellow')).toBe('text-warning');
  });

  it('returns success for green level', () => {
    expect(metricLevelColor('green')).toBe('text-success');
  });

  it('returns success for unknown level', () => {
    expect(metricLevelColor('ok')).toBe('text-success');
    expect(metricLevelColor('')).toBe('text-success');
  });
});

describe('MetricTab — metricLevelLabel', () => {
  it('returns Down for red level', () => {
    expect(metricLevelLabel('red')).toBe('Down');
  });

  it('returns Degraded for yellow level', () => {
    expect(metricLevelLabel('yellow')).toBe('Degraded');
  });

  it('returns OK for green level', () => {
    expect(metricLevelLabel('green')).toBe('OK');
  });

  it('returns OK for unknown level', () => {
    expect(metricLevelLabel('')).toBe('OK');
  });
});

describe('MetricTab — periodButtonClass', () => {
  it('returns active class when period matches', () => {
    expect(periodButtonClass(7, 7)).toBe('bg-accent text-white');
    expect(periodButtonClass(30, 30)).toBe('bg-accent text-white');
    expect(periodButtonClass(90, 90)).toBe('bg-accent text-white');
  });

  it('returns inactive class when period does not match', () => {
    const cls = periodButtonClass(30, 7);
    expect(cls).toBe('bg-surface-elevated text-text-secondary hover:text-text-primary');
  });
});

describe('MetricTab — resolveMetricName', () => {
  it('uses metricData name when available', () => {
    expect(resolveMetricName('Response Time', 'Latency')).toBe('Response Time');
  });

  it('falls back to monitor metric name when metricData name is null', () => {
    expect(resolveMetricName(null, 'Latency')).toBe('Latency');
  });

  it('falls back to "Captured Value" when both are null', () => {
    expect(resolveMetricName(null, null)).toBe('Captured Value');
    expect(resolveMetricName(undefined, undefined)).toBe('Captured Value');
  });

  it('falls back to "Captured Value" when both are undefined', () => {
    expect(resolveMetricName(undefined, null)).toBe('Captured Value');
  });
});

describe('MetricTab — computeRange', () => {
  it('computes max - min', () => {
    expect(computeRange({ min: 10, max: 100, avg: 50, latest: 80, count: 5 })).toBe(90);
  });

  it('returns null when min is null', () => {
    expect(computeRange({ min: null, max: 100, avg: 50, latest: 80, count: 5 })).toBeNull();
  });

  it('returns null when max is null', () => {
    expect(computeRange({ min: 10, max: null, avg: 50, latest: 80, count: 5 })).toBeNull();
  });

  it('returns 0 when min equals max', () => {
    expect(computeRange({ min: 50, max: 50, avg: 50, latest: 50, count: 3 })).toBe(0);
  });
});
