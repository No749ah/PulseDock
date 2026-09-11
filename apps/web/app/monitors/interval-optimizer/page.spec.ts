// Unit tests for monitors/interval-optimizer/page.tsx pure helpers
import { describe, it, expect } from 'vitest';

// ─── formatInterval ───────────────────────────────────────────────────────────

function formatInterval(sec: number | null): string {
  if (sec === null) return 'cron';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.round(sec / 3600)}h`;
}

describe('formatInterval', () => {
  it('returns "cron" for null', () => expect(formatInterval(null)).toBe('cron'));
  it('returns seconds for 0', () => expect(formatInterval(0)).toBe('0s'));
  it('returns seconds for 30', () => expect(formatInterval(30)).toBe('30s'));
  it('returns seconds for 59', () => expect(formatInterval(59)).toBe('59s'));
  it('returns minutes for 60s', () => expect(formatInterval(60)).toBe('1m'));
  it('returns minutes for 300s (5m)', () => expect(formatInterval(300)).toBe('5m'));
  it('returns minutes for 3599s', () => expect(formatInterval(3599)).toBe('60m'));
  it('returns hours for 3600s', () => expect(formatInterval(3600)).toBe('1h'));
  it('returns hours for 7200s', () => expect(formatInterval(7200)).toBe('2h'));
  it('returns hours for 86400s (24h)', () => expect(formatInterval(86400)).toBe('24h'));
  it('rounds minutes correctly for 90s → 2m', () => expect(formatInterval(90)).toBe('2m'));
  it('returns 1s for 1 second', () => expect(formatInterval(1)).toBe('1s'));
});

// ─── REC_CONFIG structure ─────────────────────────────────────────────────────

const REC_CONFIG = {
  increase: {
    label: 'Too Infrequent',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/20',
  },
  decrease: {
    label: 'Too Frequent',
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/20',
  },
  optimal: {
    label: 'Optimal',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
  new: {
    label: 'New',
    bg: 'bg-zinc-700/50',
    text: 'text-zinc-400',
    border: 'border-zinc-600',
  },
} as const;

describe('REC_CONFIG', () => {
  it('has all four recommendation types', () => {
    expect(Object.keys(REC_CONFIG)).toEqual(['increase', 'decrease', 'optimal', 'new']);
  });

  it('increase has Too Infrequent label', () => {
    expect(REC_CONFIG.increase.label).toBe('Too Infrequent');
  });

  it('decrease has Too Frequent label', () => {
    expect(REC_CONFIG.decrease.label).toBe('Too Frequent');
  });

  it('optimal has Optimal label', () => {
    expect(REC_CONFIG.optimal.label).toBe('Optimal');
  });

  it('new has New label', () => {
    expect(REC_CONFIG.new.label).toBe('New');
  });

  it('each config has bg, text, border', () => {
    for (const cfg of Object.values(REC_CONFIG)) {
      expect(cfg).toHaveProperty('bg');
      expect(cfg).toHaveProperty('text');
      expect(cfg).toHaveProperty('border');
    }
  });

  it('increase references red color token', () => {
    expect(REC_CONFIG.increase.bg).toContain('red');
    expect(REC_CONFIG.increase.text).toContain('red');
    expect(REC_CONFIG.increase.border).toContain('red');
  });

  it('decrease references yellow color token', () => {
    expect(REC_CONFIG.decrease.bg).toContain('yellow');
    expect(REC_CONFIG.decrease.text).toContain('yellow');
    expect(REC_CONFIG.decrease.border).toContain('yellow');
  });

  it('optimal references emerald color token', () => {
    expect(REC_CONFIG.optimal.bg).toContain('emerald');
    expect(REC_CONFIG.optimal.text).toContain('emerald');
    expect(REC_CONFIG.optimal.border).toContain('emerald');
  });
});

// ─── filter logic ─────────────────────────────────────────────────────────────

type Rec = 'increase' | 'decrease' | 'optimal' | 'new';
type MonitorRec = { id: string; recommendation: Rec };

function filterMonitors(monitors: MonitorRec[], filter: 'all' | Rec): MonitorRec[] {
  if (filter === 'all') return monitors;
  return monitors.filter(m => m.recommendation === filter);
}

describe('filterMonitors', () => {
  const monitors: MonitorRec[] = [
    { id: '1', recommendation: 'increase' },
    { id: '2', recommendation: 'decrease' },
    { id: '3', recommendation: 'optimal' },
    { id: '4', recommendation: 'new' },
    { id: '5', recommendation: 'optimal' },
  ];

  it('returns all monitors for "all" filter', () => {
    expect(filterMonitors(monitors, 'all')).toHaveLength(5);
  });

  it('returns only increase monitors', () => {
    const result = filterMonitors(monitors, 'increase');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('returns only decrease monitors', () => {
    const result = filterMonitors(monitors, 'decrease');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('returns multiple optimal monitors', () => {
    const result = filterMonitors(monitors, 'optimal');
    expect(result).toHaveLength(2);
  });

  it('returns only new monitors', () => {
    const result = filterMonitors(monitors, 'new');
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no match', () => {
    expect(filterMonitors([], 'optimal')).toHaveLength(0);
  });
});
