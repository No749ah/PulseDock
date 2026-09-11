import { describe, it, expect } from 'vitest';

// ─── Extracted pure helpers from incidents/insights/page.tsx ─────────────────

function formatMinutes(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatWeek(ws: string): string {
  const d = new Date(ws + 'T00:00:00Z');
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('incidents/insights/page — formatMinutes', () => {
  it('returns em dash for null', () => {
    expect(formatMinutes(null)).toBe('—');
  });

  it('returns 0m for 0 minutes', () => {
    expect(formatMinutes(0)).toBe('0m');
  });

  it('returns 1m for 1 minute', () => {
    expect(formatMinutes(1)).toBe('1m');
  });

  it('returns 59m for 59 minutes (< 60)', () => {
    expect(formatMinutes(59)).toBe('59m');
  });

  it('returns 1h for exactly 60 minutes (no remainder)', () => {
    expect(formatMinutes(60)).toBe('1h');
  });

  it('returns 1h 1m for 61 minutes', () => {
    expect(formatMinutes(61)).toBe('1h 1m');
  });

  it('returns 1h 30m for 90 minutes', () => {
    expect(formatMinutes(90)).toBe('1h 30m');
  });

  it('returns 2h for 120 minutes (no remainder)', () => {
    expect(formatMinutes(120)).toBe('2h');
  });

  it('returns 2h 15m for 135 minutes', () => {
    expect(formatMinutes(135)).toBe('2h 15m');
  });

  it('returns 24h for 1440 minutes (no remainder)', () => {
    expect(formatMinutes(1440)).toBe('24h');
  });

  it('returns 24h 30m for 1470 minutes', () => {
    expect(formatMinutes(1470)).toBe('24h 30m');
  });

  it('returns 100h for 6000 minutes', () => {
    expect(formatMinutes(6000)).toBe('100h');
  });
});

describe('incidents/insights/page — formatWeek', () => {
  it('formats 2026-01-01 as 01/01', () => {
    expect(formatWeek('2026-01-01')).toBe('01/01');
  });

  it('formats 2026-04-03 as 04/03', () => {
    expect(formatWeek('2026-04-03')).toBe('04/03');
  });

  it('formats 2026-12-31 as 12/31', () => {
    expect(formatWeek('2026-12-31')).toBe('12/31');
  });

  it('zero-pads month and day correctly (2026-03-05 → 03/05)', () => {
    expect(formatWeek('2026-03-05')).toBe('03/05');
  });

  it('formats October as 10 (two digits)', () => {
    expect(formatWeek('2026-10-15')).toBe('10/15');
  });
});
