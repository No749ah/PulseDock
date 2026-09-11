/**
 * @vitest-environment node
 * Unit tests for pure helpers in monitors/anomaly/page.tsx
 */

import { describe, it, expect } from 'vitest';

// ── Inline helpers from page.tsx ─────────────────────────────────────────────

type Severity = 'critical' | 'high' | 'medium' | 'low';

const SEVERITY_CONFIG: Record<Severity, { label: string; bg: string; border: string; text: string; dot: string }> = {
  critical: {
    label: 'Critical',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
    dot: 'bg-red-500',
  },
  high: {
    label: 'High',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-400',
    dot: 'bg-orange-500',
  },
  medium: {
    label: 'Medium',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    dot: 'bg-yellow-500',
  },
  low: {
    label: 'Low',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    dot: 'bg-blue-400',
  },
};

const ANOMALY_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  uptime_regression: { label: 'Uptime Regression', color: 'text-red-400' },
  latency_regression: { label: 'Latency Spike', color: 'text-orange-400' },
  flapping: { label: 'Flapping', color: 'text-yellow-400' },
  failure_burst: { label: 'Failure Burst', color: 'text-orange-400' },
  recovered: { label: 'Recovered', color: 'text-green-400' },
  latency_improvement: { label: 'Latency Improved', color: 'text-green-400' },
  currently_degraded: { label: 'Currently Degraded', color: 'text-red-400' },
};

function formatHours(h: number): string {
  if (h === 24) return '24h';
  if (h === 48) return '48h';
  if (h === 168) return '7d';
  return `${h}h`;
}

function uptimeColor(pct: number | null): string {
  if (pct === null) return 'text-zinc-500';
  if (pct >= 99) return 'text-green-400';
  if (pct >= 95) return 'text-yellow-400';
  return 'text-red-400';
}

function latencyColor(ms: number | null): string {
  if (ms === null) return 'text-zinc-500';
  if (ms < 300) return 'text-green-400';
  if (ms < 1000) return 'text-yellow-400';
  return 'text-red-400';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('monitors/anomaly/page — SEVERITY_CONFIG', () => {
  it('has all 4 severity levels', () => {
    const levels: Severity[] = ['critical', 'high', 'medium', 'low'];
    for (const level of levels) {
      expect(SEVERITY_CONFIG[level]).toBeDefined();
    }
  });

  it('critical uses red palette', () => {
    const cfg = SEVERITY_CONFIG.critical;
    expect(cfg.label).toBe('Critical');
    expect(cfg.text).toContain('red');
    expect(cfg.dot).toContain('red');
  });

  it('high uses orange palette', () => {
    const cfg = SEVERITY_CONFIG.high;
    expect(cfg.label).toBe('High');
    expect(cfg.text).toContain('orange');
    expect(cfg.dot).toContain('orange');
  });

  it('medium uses yellow palette', () => {
    const cfg = SEVERITY_CONFIG.medium;
    expect(cfg.label).toBe('Medium');
    expect(cfg.text).toContain('yellow');
    expect(cfg.dot).toContain('yellow');
  });

  it('low uses blue palette', () => {
    const cfg = SEVERITY_CONFIG.low;
    expect(cfg.label).toBe('Low');
    expect(cfg.text).toContain('blue');
    expect(cfg.dot).toContain('blue');
  });

  it('all severities have unique labels', () => {
    const labels = Object.values(SEVERITY_CONFIG).map((c) => c.label);
    expect(new Set(labels).size).toBe(4);
  });

  it('all severities have bg with /10 opacity', () => {
    for (const cfg of Object.values(SEVERITY_CONFIG)) {
      expect(cfg.bg).toContain('/10');
    }
  });

  it('all severities have border with /30 opacity', () => {
    for (const cfg of Object.values(SEVERITY_CONFIG)) {
      expect(cfg.border).toContain('/30');
    }
  });
});

describe('monitors/anomaly/page — ANOMALY_TYPE_LABELS', () => {
  it('has 7 anomaly types', () => {
    expect(Object.keys(ANOMALY_TYPE_LABELS)).toHaveLength(7);
  });

  it('uptime_regression is labeled correctly', () => {
    expect(ANOMALY_TYPE_LABELS.uptime_regression.label).toBe('Uptime Regression');
    expect(ANOMALY_TYPE_LABELS.uptime_regression.color).toContain('red');
  });

  it('latency_regression is labeled correctly', () => {
    expect(ANOMALY_TYPE_LABELS.latency_regression.label).toBe('Latency Spike');
    expect(ANOMALY_TYPE_LABELS.latency_regression.color).toContain('orange');
  });

  it('flapping is labeled correctly', () => {
    expect(ANOMALY_TYPE_LABELS.flapping.label).toBe('Flapping');
    expect(ANOMALY_TYPE_LABELS.flapping.color).toContain('yellow');
  });

  it('failure_burst is labeled correctly', () => {
    expect(ANOMALY_TYPE_LABELS.failure_burst.label).toBe('Failure Burst');
    expect(ANOMALY_TYPE_LABELS.failure_burst.color).toContain('orange');
  });

  it('recovered uses green color', () => {
    expect(ANOMALY_TYPE_LABELS.recovered.label).toBe('Recovered');
    expect(ANOMALY_TYPE_LABELS.recovered.color).toContain('green');
  });

  it('latency_improvement uses green color', () => {
    expect(ANOMALY_TYPE_LABELS.latency_improvement.label).toBe('Latency Improved');
    expect(ANOMALY_TYPE_LABELS.latency_improvement.color).toContain('green');
  });

  it('currently_degraded uses red color', () => {
    expect(ANOMALY_TYPE_LABELS.currently_degraded.label).toBe('Currently Degraded');
    expect(ANOMALY_TYPE_LABELS.currently_degraded.color).toContain('red');
  });

  it('all entries have non-empty label and color', () => {
    for (const [, val] of Object.entries(ANOMALY_TYPE_LABELS)) {
      expect(val.label.length).toBeGreaterThan(0);
      expect(val.color.length).toBeGreaterThan(0);
    }
  });
});

describe('monitors/anomaly/page — formatHours', () => {
  it('returns 24h for 24', () => {
    expect(formatHours(24)).toBe('24h');
  });

  it('returns 48h for 48', () => {
    expect(formatHours(48)).toBe('48h');
  });

  it('returns 7d for 168', () => {
    expect(formatHours(168)).toBe('7d');
  });

  it('returns Nh for arbitrary hours', () => {
    expect(formatHours(12)).toBe('12h');
    expect(formatHours(72)).toBe('72h');
    expect(formatHours(1)).toBe('1h');
  });

  it('all 3 canonical period labels are distinct', () => {
    const labels = [formatHours(24), formatHours(48), formatHours(168)];
    expect(new Set(labels).size).toBe(3);
  });
});

describe('monitors/anomaly/page — uptimeColor', () => {
  it('returns zinc for null', () => {
    expect(uptimeColor(null)).toBe('text-zinc-500');
  });

  it('returns green for >= 99%', () => {
    expect(uptimeColor(99)).toBe('text-green-400');
    expect(uptimeColor(100)).toBe('text-green-400');
    expect(uptimeColor(99.9)).toBe('text-green-400');
  });

  it('returns yellow for 95–98.99%', () => {
    expect(uptimeColor(95)).toBe('text-yellow-400');
    expect(uptimeColor(98)).toBe('text-yellow-400');
    expect(uptimeColor(98.99)).toBe('text-yellow-400');
  });

  it('returns red for below 95%', () => {
    expect(uptimeColor(94.99)).toBe('text-red-400');
    expect(uptimeColor(0)).toBe('text-red-400');
  });

  it('boundary: exactly 99 is green', () => {
    expect(uptimeColor(99)).toBe('text-green-400');
  });

  it('boundary: exactly 95 is yellow', () => {
    expect(uptimeColor(95)).toBe('text-yellow-400');
  });
});

describe('monitors/anomaly/page — latencyColor', () => {
  it('returns zinc for null', () => {
    expect(latencyColor(null)).toBe('text-zinc-500');
  });

  it('returns green for < 300ms', () => {
    expect(latencyColor(0)).toBe('text-green-400');
    expect(latencyColor(100)).toBe('text-green-400');
    expect(latencyColor(299)).toBe('text-green-400');
  });

  it('returns yellow for 300–999ms', () => {
    expect(latencyColor(300)).toBe('text-yellow-400');
    expect(latencyColor(500)).toBe('text-yellow-400');
    expect(latencyColor(999)).toBe('text-yellow-400');
  });

  it('returns red for >= 1000ms', () => {
    expect(latencyColor(1000)).toBe('text-red-400');
    expect(latencyColor(5000)).toBe('text-red-400');
  });

  it('boundary: exactly 300 is yellow not green', () => {
    expect(latencyColor(300)).toBe('text-yellow-400');
    expect(latencyColor(300)).not.toBe('text-green-400');
  });

  it('boundary: exactly 1000 is red not yellow', () => {
    expect(latencyColor(1000)).toBe('text-red-400');
    expect(latencyColor(1000)).not.toBe('text-yellow-400');
  });
});
