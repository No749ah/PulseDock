import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Extracted pure helpers from reliability/page.tsx ───────────────────────

type WeekData = {
  weekStart: string;
  uptimePct: number | null;
  avgLatencyMs: number | null;
  checksTotal: number;
  checksFailed: number;
  incidents: number;
  score: number | null;
};

function scoreColor(score: number | null): string {
  if (score === null) return 'bg-zinc-700';
  if (score >= 95) return 'bg-emerald-500';
  if (score >= 80) return 'bg-green-400';
  if (score >= 60) return 'bg-yellow-400';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-600';
}

function scoreTextColor(score: number | null): string {
  if (score === null) return 'text-zinc-500';
  if (score >= 95) return 'text-emerald-400';
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function formatWeek(ws: string): string {
  const d = new Date(ws + 'T00:00:00Z');
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('monitors/reliability/page — scoreColor', () => {
  it('returns bg-zinc-700 for null score', () => {
    expect(scoreColor(null)).toBe('bg-zinc-700');
  });

  it('returns bg-emerald-500 at exactly 95', () => {
    expect(scoreColor(95)).toBe('bg-emerald-500');
  });

  it('returns bg-emerald-500 above 95 (100)', () => {
    expect(scoreColor(100)).toBe('bg-emerald-500');
  });

  it('returns bg-green-400 at exactly 80', () => {
    expect(scoreColor(80)).toBe('bg-green-400');
  });

  it('returns bg-green-400 between 80 and 94 (85)', () => {
    expect(scoreColor(85)).toBe('bg-green-400');
  });

  it('returns bg-yellow-400 at exactly 60', () => {
    expect(scoreColor(60)).toBe('bg-yellow-400');
  });

  it('returns bg-yellow-400 between 60 and 79 (70)', () => {
    expect(scoreColor(70)).toBe('bg-yellow-400');
  });

  it('returns bg-orange-500 at exactly 40', () => {
    expect(scoreColor(40)).toBe('bg-orange-500');
  });

  it('returns bg-orange-500 between 40 and 59 (50)', () => {
    expect(scoreColor(50)).toBe('bg-orange-500');
  });

  it('returns bg-red-600 below 40 (39)', () => {
    expect(scoreColor(39)).toBe('bg-red-600');
  });

  it('returns bg-red-600 at 0', () => {
    expect(scoreColor(0)).toBe('bg-red-600');
  });

  it('returns bg-red-600 at 1', () => {
    expect(scoreColor(1)).toBe('bg-red-600');
  });
});

describe('monitors/reliability/page — scoreTextColor', () => {
  it('returns text-zinc-500 for null score', () => {
    expect(scoreTextColor(null)).toBe('text-zinc-500');
  });

  it('returns text-emerald-400 at 95', () => {
    expect(scoreTextColor(95)).toBe('text-emerald-400');
  });

  it('returns text-emerald-400 at 100', () => {
    expect(scoreTextColor(100)).toBe('text-emerald-400');
  });

  it('returns text-green-400 at 80', () => {
    expect(scoreTextColor(80)).toBe('text-green-400');
  });

  it('returns text-green-400 at 94', () => {
    expect(scoreTextColor(94)).toBe('text-green-400');
  });

  it('returns text-yellow-400 at 60', () => {
    expect(scoreTextColor(60)).toBe('text-yellow-400');
  });

  it('returns text-yellow-400 at 79', () => {
    expect(scoreTextColor(79)).toBe('text-yellow-400');
  });

  it('returns text-orange-400 at 40', () => {
    expect(scoreTextColor(40)).toBe('text-orange-400');
  });

  it('returns text-orange-400 at 59', () => {
    expect(scoreTextColor(59)).toBe('text-orange-400');
  });

  it('returns text-red-400 at 39', () => {
    expect(scoreTextColor(39)).toBe('text-red-400');
  });

  it('returns text-red-400 at 0', () => {
    expect(scoreTextColor(0)).toBe('text-red-400');
  });
});

describe('monitors/reliability/page — formatWeek', () => {
  it('formats January 1 as 01/01', () => {
    expect(formatWeek('2026-01-01')).toBe('01/01');
  });

  it('formats December 31 as 12/31', () => {
    expect(formatWeek('2026-12-31')).toBe('12/31');
  });

  it('formats April 3 as 04/03', () => {
    expect(formatWeek('2026-04-03')).toBe('04/03');
  });

  it('zero-pads single-digit month and day', () => {
    expect(formatWeek('2026-03-05')).toBe('03/05');
  });

  it('formats November 10 as 11/10', () => {
    expect(formatWeek('2026-11-10')).toBe('11/10');
  });
});
