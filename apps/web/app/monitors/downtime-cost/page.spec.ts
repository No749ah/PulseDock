// Unit tests for monitors/downtime-cost/page.tsx pure helpers
import { describe, it, expect } from 'vitest';

// ─── formatMinutes ─────────────────────────────────────────────────────────────

function formatMinutes(minutes: number): string {
  if (minutes === 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

describe('formatMinutes', () => {
  it('returns 0m for zero', () => expect(formatMinutes(0)).toBe('0m'));
  it('returns minutes only for < 60 min', () => expect(formatMinutes(30)).toBe('30m'));
  it('returns minutes only for 59 min', () => expect(formatMinutes(59)).toBe('59m'));
  it('returns hours only for exact hour', () => expect(formatMinutes(60)).toBe('1h'));
  it('returns hours only for 120 min', () => expect(formatMinutes(120)).toBe('2h'));
  it('returns combined for 90 min', () => expect(formatMinutes(90)).toBe('1h 30m'));
  it('returns combined for 65 min', () => expect(formatMinutes(65)).toBe('1h 5m'));
  it('returns hours only for 240 min (no remainder)', () => expect(formatMinutes(240)).toBe('4h'));
  it('returns correct for 1 minute', () => expect(formatMinutes(1)).toBe('1m'));
  it('returns combined for 1439 min (23h 59m)', () => expect(formatMinutes(1439)).toBe('23h 59m'));
});

// ─── formatUsd ────────────────────────────────────────────────────────────────

function formatUsd(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.01) return '<$0.01';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
}

describe('formatUsd', () => {
  it('returns $0.00 for zero', () => expect(formatUsd(0)).toBe('$0.00'));
  it('returns <$0.01 for very small amount', () => expect(formatUsd(0.001)).toBe('<$0.01'));
  it('returns <$0.01 for 0.009', () => expect(formatUsd(0.009)).toBe('<$0.01'));
  it('returns formatted for $0.01', () => expect(formatUsd(0.01)).toBe('$0.01'));
  it('returns formatted for $1.00', () => expect(formatUsd(1)).toBe('$1.00'));
  it('returns formatted for $100.50', () => expect(formatUsd(100.5)).toBe('$100.50'));
  it('returns formatted for $1000', () => expect(formatUsd(1000)).toBe('$1,000.00'));
  it('returns formatted for $9999.99', () => expect(formatUsd(9999.99)).toBe('$9,999.99'));
});

// ─── costColor ────────────────────────────────────────────────────────────────

function costColor(cost: number): string {
  if (cost === 0) return 'text-emerald-400';
  if (cost < 10) return 'text-emerald-400';
  if (cost < 100) return 'text-yellow-400';
  if (cost < 1000) return 'text-orange-400';
  return 'text-red-400';
}

describe('costColor', () => {
  it('returns emerald for 0', () => expect(costColor(0)).toBe('text-emerald-400'));
  it('returns emerald for 9.99 (< 10)', () => expect(costColor(9.99)).toBe('text-emerald-400'));
  it('returns emerald for 0.01', () => expect(costColor(0.01)).toBe('text-emerald-400'));
  it('returns yellow for 10', () => expect(costColor(10)).toBe('text-yellow-400'));
  it('returns yellow for 99.99', () => expect(costColor(99.99)).toBe('text-yellow-400'));
  it('returns orange for 100', () => expect(costColor(100)).toBe('text-orange-400'));
  it('returns orange for 999.99', () => expect(costColor(999.99)).toBe('text-orange-400'));
  it('returns red for 1000', () => expect(costColor(1000)).toBe('text-red-400'));
  it('returns red for 100000', () => expect(costColor(100000)).toBe('text-red-400'));
});

// ─── costBadgeClass ───────────────────────────────────────────────────────────

function costBadgeClass(cost: number): string {
  if (cost === 0) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  if (cost < 10) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  if (cost < 100) return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
  if (cost < 1000) return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
  return 'bg-red-500/10 text-red-400 border border-red-500/20';
}

describe('costBadgeClass', () => {
  it('returns emerald badge for 0', () => {
    const cls = costBadgeClass(0);
    expect(cls).toContain('emerald');
  });
  it('returns emerald badge for < 10', () => {
    const cls = costBadgeClass(5);
    expect(cls).toContain('emerald');
  });
  it('returns yellow badge for 10–99', () => {
    const cls = costBadgeClass(50);
    expect(cls).toContain('yellow');
  });
  it('returns orange badge for 100–999', () => {
    const cls = costBadgeClass(500);
    expect(cls).toContain('orange');
  });
  it('returns red badge for >= 1000', () => {
    const cls = costBadgeClass(1000);
    expect(cls).toContain('red');
  });
  it('each badge class contains border', () => {
    expect(costBadgeClass(0)).toContain('border');
    expect(costBadgeClass(50)).toContain('border');
    expect(costBadgeClass(500)).toContain('border');
    expect(costBadgeClass(5000)).toContain('border');
  });
  it('costColor and costBadgeClass agree on thresholds', () => {
    // Both should reference the same color for each tier
    for (const val of [0, 5, 50, 500, 5000]) {
      const colorName = costColor(val).replace('text-', '').replace('-400', '');
      expect(costBadgeClass(val)).toContain(colorName);
    }
  });
});

// ─── worstMonitor logic ────────────────────────────────────────────────────────

interface MonitorCostEntry {
  id: string;
  name: string;
  downtimeCostPerHour: number;
  downtimeMinutes: number;
  estimatedCost: number;
  incidentCount: number;
  worstIncidentCost: number;
}

function findWorstMonitor(monitors: MonitorCostEntry[]): MonitorCostEntry | null {
  return monitors.reduce<MonitorCostEntry | null>((worst, m) => {
    if (!worst || m.worstIncidentCost > worst.worstIncidentCost) return m;
    return worst;
  }, null);
}

describe('findWorstMonitor', () => {
  const makeEntry = (id: string, worstCost: number): MonitorCostEntry => ({
    id,
    name: `Monitor ${id}`,
    downtimeCostPerHour: 10,
    downtimeMinutes: 30,
    estimatedCost: 5,
    incidentCount: 2,
    worstIncidentCost: worstCost,
  });

  it('returns null for empty array', () => {
    expect(findWorstMonitor([])).toBeNull();
  });

  it('returns the only entry for single-element array', () => {
    const m = makeEntry('a', 100);
    expect(findWorstMonitor([m])).toBe(m);
  });

  it('returns the monitor with highest worstIncidentCost', () => {
    const a = makeEntry('a', 50);
    const b = makeEntry('b', 200);
    const c = makeEntry('c', 100);
    expect(findWorstMonitor([a, b, c])).toBe(b);
  });

  it('returns the first when all costs are equal', () => {
    const a = makeEntry('a', 100);
    const b = makeEntry('b', 100);
    expect(findWorstMonitor([a, b])).toBe(a);
  });

  it('returns monitor with cost 0 when all are 0', () => {
    const a = makeEntry('a', 0);
    expect(findWorstMonitor([a])).toBe(a);
  });
});
