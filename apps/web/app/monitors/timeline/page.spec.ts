// Unit tests for monitors/timeline/page.tsx pure helpers
import { describe, it, expect } from 'vitest';

// ─── levelColor ───────────────────────────────────────────────────────────────

function levelColor(level: 'green' | 'yellow' | 'red'): string {
  if (level === 'green') return 'bg-success';
  if (level === 'yellow') return 'bg-warning';
  return 'bg-error';
}

describe('levelColor', () => {
  it('returns bg-success for green', () => expect(levelColor('green')).toBe('bg-success'));
  it('returns bg-warning for yellow', () => expect(levelColor('yellow')).toBe('bg-warning'));
  it('returns bg-error for red', () => expect(levelColor('red')).toBe('bg-error'));
});

// ─── levelLabel ───────────────────────────────────────────────────────────────

function levelLabel(level: string): string {
  if (level === 'green') return 'Operational';
  if (level === 'yellow') return 'Degraded';
  return 'Down';
}

describe('levelLabel', () => {
  it('returns Operational for green', () => expect(levelLabel('green')).toBe('Operational'));
  it('returns Degraded for yellow', () => expect(levelLabel('yellow')).toBe('Degraded'));
  it('returns Down for red', () => expect(levelLabel('red')).toBe('Down'));
  it('returns Down for unknown level', () => expect(levelLabel('unknown')).toBe('Down'));
  it('returns Down for empty string', () => expect(levelLabel('')).toBe('Down'));
});

// ─── uptimeColor (from UptimeBadge) ───────────────────────────────────────────

function uptimeColor(pct: number): string {
  if (pct >= 99) return 'text-success';
  if (pct >= 95) return 'text-warning';
  return 'text-error';
}

describe('uptimeColor', () => {
  it('returns success for 100%', () => expect(uptimeColor(100)).toBe('text-success'));
  it('returns success for exactly 99%', () => expect(uptimeColor(99)).toBe('text-success'));
  it('returns success for 99.5%', () => expect(uptimeColor(99.5)).toBe('text-success'));
  it('returns warning for 98%', () => expect(uptimeColor(98)).toBe('text-warning'));
  it('returns warning for exactly 95%', () => expect(uptimeColor(95)).toBe('text-warning'));
  it('returns error for 94.9%', () => expect(uptimeColor(94.9)).toBe('text-error'));
  it('returns error for 0%', () => expect(uptimeColor(0)).toBe('text-error'));
  it('returns warning for 95.0', () => expect(uptimeColor(95.0)).toBe('text-warning'));
});

// ─── HOUR_OPTIONS ─────────────────────────────────────────────────────────────

const HOUR_OPTIONS = [
  { label: '1h', value: 1 },
  { label: '3h', value: 3 },
  { label: '6h', value: 6 },
  { label: '12h', value: 12 },
  { label: '24h', value: 24 },
  { label: '48h', value: 48 },
  { label: '7d', value: 168 },
];

describe('HOUR_OPTIONS', () => {
  it('has 7 options', () => expect(HOUR_OPTIONS).toHaveLength(7));
  it('first option is 1h', () => {
    expect(HOUR_OPTIONS[0]).toEqual({ label: '1h', value: 1 });
  });
  it('last option is 7d (168h)', () => {
    expect(HOUR_OPTIONS[HOUR_OPTIONS.length - 1]).toEqual({ label: '7d', value: 168 });
  });
  it('all options have label and value', () => {
    for (const opt of HOUR_OPTIONS) {
      expect(opt).toHaveProperty('label');
      expect(opt).toHaveProperty('value');
      expect(typeof opt.label).toBe('string');
      expect(typeof opt.value).toBe('number');
    }
  });
  it('values are strictly increasing', () => {
    for (let i = 1; i < HOUR_OPTIONS.length; i++) {
      expect(HOUR_OPTIONS[i].value).toBeGreaterThan(HOUR_OPTIONS[i - 1].value);
    }
  });
  it('48h is the second-to-last option', () => {
    expect(HOUR_OPTIONS[HOUR_OPTIONS.length - 2].value).toBe(48);
  });
});

// ─── TimelineBar segment width computation ────────────────────────────────────

interface Segment {
  start: string;
  end: string;
  level: 'green' | 'yellow' | 'red';
}

function computeSegmentWidthPct(seg: Segment, from: string, to: string): number {
  const windowMs = new Date(to).getTime() - new Date(from).getTime();
  if (windowMs <= 0) return 0;
  const segStart = Math.max(new Date(seg.start).getTime(), new Date(from).getTime());
  const segEnd = Math.min(new Date(seg.end).getTime(), new Date(to).getTime());
  return Math.max(0, ((segEnd - segStart) / windowMs) * 100);
}

describe('computeSegmentWidthPct', () => {
  const base = '2026-01-01T00:00:00.000Z';
  const end1h = '2026-01-01T01:00:00.000Z';

  it('full-window segment returns 100%', () => {
    const seg: Segment = { start: base, end: end1h, level: 'green' };
    expect(computeSegmentWidthPct(seg, base, end1h)).toBeCloseTo(100);
  });

  it('half-window segment returns 50%', () => {
    const mid = '2026-01-01T00:30:00.000Z';
    const seg: Segment = { start: base, end: mid, level: 'green' };
    expect(computeSegmentWidthPct(seg, base, end1h)).toBeCloseTo(50);
  });

  it('zero-width window returns 0', () => {
    const seg: Segment = { start: base, end: base, level: 'green' };
    expect(computeSegmentWidthPct(seg, base, base)).toBe(0);
  });

  it('segment before window is clipped to 0', () => {
    const before = '2025-12-31T23:00:00.000Z';
    const beforeEnd = '2025-12-31T23:30:00.000Z';
    const seg: Segment = { start: before, end: beforeEnd, level: 'red' };
    expect(computeSegmentWidthPct(seg, base, end1h)).toBe(0);
  });

  it('segment extending beyond window is clipped', () => {
    const beyond = '2026-01-01T02:00:00.000Z';
    const seg: Segment = { start: base, end: beyond, level: 'yellow' };
    // window is base → end1h (1h), segment covers base → 2h; clipped to window = 100%
    expect(computeSegmentWidthPct(seg, base, end1h)).toBeCloseTo(100);
  });

  it('quarter-window segment returns 25%', () => {
    const q1 = '2026-01-01T00:15:00.000Z';
    const seg: Segment = { start: base, end: q1, level: 'green' };
    expect(computeSegmentWidthPct(seg, base, end1h)).toBeCloseTo(25);
  });
});
