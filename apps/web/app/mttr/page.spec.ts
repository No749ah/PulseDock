/**
 * Unit tests for mttr/page.tsx pure helpers.
 *
 * Covered:
 *   - formatMinutes: null/zero/<1/<60/hours+mins/hours-only
 *   - mttrColor: null + 4 threshold bands
 *   - mttrBarColor: null + 4 threshold hex values
 *   - mttrBadgeVariant: null + 3 severity variants
 *   - formatWeek: ISO date → "MMM D" label
 */
import { describe, it, expect } from 'vitest';

// ─── Mirror pure helpers ──────────────────────────────────────────────────────

function formatMinutes(min: number | null): string {
  if (min === null || min < 0) return 'N/A';
  if (min < 1) return '< 1 min';
  if (min < 60) return `${Math.round(min)} min`;
  const hours = Math.floor(min / 60);
  const mins = Math.round(min % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function mttrColor(min: number | null): string {
  if (min === null) return 'text-text-secondary';
  if (min < 15) return 'text-green-400';
  if (min < 60) return 'text-yellow-400';
  if (min < 240) return 'text-orange-400';
  return 'text-red-400';
}

function mttrBarColor(min: number | null): string {
  if (min === null) return '#6b7280';
  if (min < 15) return '#4ade80';
  if (min < 60) return '#facc15';
  if (min < 240) return '#fb923c';
  return '#f87171';
}

function mttrBadgeVariant(min: number | null): 'success' | 'warning' | 'danger' | 'default' {
  if (min === null) return 'default';
  if (min < 15) return 'success';
  if (min < 60) return 'warning';
  return 'danger';
}

function formatWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ─── formatMinutes ────────────────────────────────────────────────────────────

describe('formatMinutes', () => {
  describe('null / negative', () => {
    it('returns "N/A" for null', () => {
      expect(formatMinutes(null)).toBe('N/A');
    });

    it('returns "N/A" for negative values', () => {
      expect(formatMinutes(-1)).toBe('N/A');
      expect(formatMinutes(-100)).toBe('N/A');
    });
  });

  describe('< 1 minute', () => {
    it('returns "< 1 min" for 0', () => {
      expect(formatMinutes(0)).toBe('< 1 min');
    });

    it('returns "< 1 min" for 0.5', () => {
      expect(formatMinutes(0.5)).toBe('< 1 min');
    });

    it('returns "< 1 min" for 0.99', () => {
      expect(formatMinutes(0.99)).toBe('< 1 min');
    });
  });

  describe('1–59 minutes', () => {
    it('returns "X min" for 1', () => {
      expect(formatMinutes(1)).toBe('1 min');
    });

    it('returns "X min" for 5', () => {
      expect(formatMinutes(5)).toBe('5 min');
    });

    it('returns "X min" for 30', () => {
      expect(formatMinutes(30)).toBe('30 min');
    });

    it('returns "59 min" for 59', () => {
      expect(formatMinutes(59)).toBe('59 min');
    });

    it('rounds to nearest minute', () => {
      expect(formatMinutes(1.4)).toBe('1 min');
      expect(formatMinutes(1.6)).toBe('2 min');
    });
  });

  describe('>= 60 minutes', () => {
    it('returns "1h" for 60 minutes (no remainder)', () => {
      expect(formatMinutes(60)).toBe('1h');
    });

    it('returns "1h 30m" for 90 minutes', () => {
      expect(formatMinutes(90)).toBe('1h 30m');
    });

    it('returns "2h" for 120 minutes', () => {
      expect(formatMinutes(120)).toBe('2h');
    });

    it('returns "4h" for 240 minutes', () => {
      expect(formatMinutes(240)).toBe('4h');
    });

    it('returns "1h 1m" for 61 minutes', () => {
      expect(formatMinutes(61)).toBe('1h 1m');
    });

    it('returns "23h 59m" for 1439 minutes', () => {
      expect(formatMinutes(1439)).toBe('23h 59m');
    });

    it('omits minutes when remainder is 0', () => {
      expect(formatMinutes(180)).toBe('3h');
      expect(formatMinutes(300)).toBe('5h');
    });
  });
});

// ─── mttrColor ────────────────────────────────────────────────────────────────

describe('mttrColor', () => {
  it('returns secondary color for null', () => {
    expect(mttrColor(null)).toBe('text-text-secondary');
  });

  it('returns green for < 15 minutes', () => {
    expect(mttrColor(0)).toBe('text-green-400');
    expect(mttrColor(5)).toBe('text-green-400');
    expect(mttrColor(14.9)).toBe('text-green-400');
  });

  it('returns yellow for 15–59 minutes', () => {
    expect(mttrColor(15)).toBe('text-yellow-400');
    expect(mttrColor(30)).toBe('text-yellow-400');
    expect(mttrColor(59)).toBe('text-yellow-400');
  });

  it('returns orange for 60–239 minutes', () => {
    expect(mttrColor(60)).toBe('text-orange-400');
    expect(mttrColor(120)).toBe('text-orange-400');
    expect(mttrColor(239)).toBe('text-orange-400');
  });

  it('returns red for >= 240 minutes', () => {
    expect(mttrColor(240)).toBe('text-red-400');
    expect(mttrColor(480)).toBe('text-red-400');
    expect(mttrColor(10000)).toBe('text-red-400');
  });
});

// ─── mttrBarColor ─────────────────────────────────────────────────────────────

describe('mttrBarColor', () => {
  it('returns gray hex for null', () => {
    expect(mttrBarColor(null)).toBe('#6b7280');
  });

  it('returns green hex for < 15 minutes', () => {
    expect(mttrBarColor(0)).toBe('#4ade80');
    expect(mttrBarColor(14)).toBe('#4ade80');
  });

  it('returns yellow hex for 15–59 minutes', () => {
    expect(mttrBarColor(15)).toBe('#facc15');
    expect(mttrBarColor(59)).toBe('#facc15');
  });

  it('returns orange hex for 60–239 minutes', () => {
    expect(mttrBarColor(60)).toBe('#fb923c');
    expect(mttrBarColor(239)).toBe('#fb923c');
  });

  it('returns red hex for >= 240 minutes', () => {
    expect(mttrBarColor(240)).toBe('#f87171');
    expect(mttrBarColor(600)).toBe('#f87171');
  });

  it('hex values are valid 7-char strings', () => {
    [null, 5, 30, 100, 300].forEach((v) => {
      const color = mttrBarColor(v);
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });
  });
});

// ─── mttrBadgeVariant ─────────────────────────────────────────────────────────

describe('mttrBadgeVariant', () => {
  it('returns "default" for null', () => {
    expect(mttrBadgeVariant(null)).toBe('default');
  });

  it('returns "success" for < 15 minutes', () => {
    expect(mttrBadgeVariant(0)).toBe('success');
    expect(mttrBadgeVariant(14)).toBe('success');
  });

  it('returns "warning" for 15–59 minutes', () => {
    expect(mttrBadgeVariant(15)).toBe('warning');
    expect(mttrBadgeVariant(59)).toBe('warning');
  });

  it('returns "danger" for >= 60 minutes', () => {
    expect(mttrBadgeVariant(60)).toBe('danger');
    expect(mttrBadgeVariant(240)).toBe('danger');
    expect(mttrBadgeVariant(10000)).toBe('danger');
  });

  it('all possible return values are valid badge variants', () => {
    const valid = new Set(['success', 'warning', 'danger', 'default']);
    [null, 0, 14, 15, 59, 60, 300].forEach((v) => {
      expect(valid.has(mttrBadgeVariant(v))).toBe(true);
    });
  });
});

// ─── formatWeek ───────────────────────────────────────────────────────────────

describe('formatWeek', () => {
  it('formats January 1st correctly', () => {
    expect(formatWeek('2026-01-01')).toBe('Jan 1');
  });

  it('formats April 2nd correctly', () => {
    expect(formatWeek('2026-04-02')).toBe('Apr 2');
  });

  it('formats December 31st correctly', () => {
    expect(formatWeek('2026-12-31')).toBe('Dec 31');
  });

  it('uses UTC timezone (no off-by-one from local tz)', () => {
    // 2026-03-01 must be Mar 1 regardless of system timezone
    const result = formatWeek('2026-03-01');
    expect(result).toBe('Mar 1');
  });

  it('produces short month names (3 chars)', () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    months.forEach((month, i) => {
      const mm = String(i + 1).padStart(2, '0');
      const result = formatWeek(`2026-${mm}-15`);
      expect(result).toContain(month);
    });
  });
});
