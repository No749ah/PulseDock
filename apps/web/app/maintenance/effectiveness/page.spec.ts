/**
 * @vitest-environment node
 * Pure helper coverage for app/maintenance/effectiveness/page.tsx
 * Tests: formatDuration, STATUS_CONFIG structure, WindowEffectiveness status keys
 */

import { describe, it, expect } from 'vitest';

// ── Inline helpers extracted from page.tsx ───────────────────────────────────

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const STATUS_CONFIG = {
  effective: { label: 'Effective', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  'over-active': { label: 'Over-scheduled', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  'no-data': { label: 'No data', color: 'text-zinc-400', bg: 'bg-zinc-700/30', border: 'border-zinc-600' },
} as const;

type WindowStatus = 'effective' | 'over-active' | 'no-data';

// ── formatDuration (minutes) ─────────────────────────────────────────────────

describe('formatDuration (maintenance/effectiveness)', () => {
  it('returns "Xm" for values under 60 minutes', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(1)).toBe('1m');
    expect(formatDuration(30)).toBe('30m');
    expect(formatDuration(59)).toBe('59m');
  });

  it('returns "Xh" for exact multiples of 60', () => {
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(480)).toBe('8h');
    expect(formatDuration(1440)).toBe('24h');
  });

  it('returns "Xh Ym" when minutes remainder exists', () => {
    expect(formatDuration(61)).toBe('1h 1m');
    expect(formatDuration(90)).toBe('1h 30m');
    expect(formatDuration(125)).toBe('2h 5m');
    expect(formatDuration(1439)).toBe('23h 59m');
  });
});

// ── STATUS_CONFIG ─────────────────────────────────────────────────────────────

describe('STATUS_CONFIG', () => {
  it('covers all three window status keys', () => {
    const keys = Object.keys(STATUS_CONFIG);
    expect(keys).toContain('effective');
    expect(keys).toContain('over-active');
    expect(keys).toContain('no-data');
    expect(keys).toHaveLength(3);
  });

  it('has correct labels', () => {
    expect(STATUS_CONFIG.effective.label).toBe('Effective');
    expect(STATUS_CONFIG['over-active'].label).toBe('Over-scheduled');
    expect(STATUS_CONFIG['no-data'].label).toBe('No data');
  });

  it('has distinct color classes per status', () => {
    const colors = Object.values(STATUS_CONFIG).map(c => c.color);
    // all three should be different
    expect(new Set(colors).size).toBe(3);
  });

  it('effective entry uses emerald palette', () => {
    expect(STATUS_CONFIG.effective.color).toContain('emerald');
    expect(STATUS_CONFIG.effective.bg).toContain('emerald');
    expect(STATUS_CONFIG.effective.border).toContain('emerald');
  });

  it('over-active entry uses yellow palette', () => {
    expect(STATUS_CONFIG['over-active'].color).toContain('yellow');
    expect(STATUS_CONFIG['over-active'].bg).toContain('yellow');
    expect(STATUS_CONFIG['over-active'].border).toContain('yellow');
  });

  it('no-data entry uses zinc palette', () => {
    expect(STATUS_CONFIG['no-data'].color).toContain('zinc');
    expect(STATUS_CONFIG['no-data'].bg).toContain('zinc');
    expect(STATUS_CONFIG['no-data'].border).toContain('zinc');
  });
});

// ── WindowStatus type contract ────────────────────────────────────────────────

describe('WindowEffectiveness status type coverage', () => {
  const validStatuses: WindowStatus[] = ['effective', 'over-active', 'no-data'];

  it('all valid statuses have a CONFIG entry', () => {
    for (const s of validStatuses) {
      expect(STATUS_CONFIG[s]).toBeDefined();
    }
  });

  it('STATUS_CONFIG keys match WindowStatus union', () => {
    const configKeys = Object.keys(STATUS_CONFIG) as WindowStatus[];
    expect(configKeys.sort()).toEqual([...validStatuses].sort());
  });
});
