/**
 * @vitest-environment node
 * Unit tests for pure helpers in alerts/response-time/page.tsx
 */

import { describe, it, expect } from 'vitest';

// ── Inline helpers from page.tsx ─────────────────────────────────────────────

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function latencyColor(ms: number | null): string {
  if (ms === null) return 'text-zinc-400';
  if (ms < 1000) return 'text-emerald-400';
  if (ms < 5000) return 'text-yellow-400';
  return 'text-red-400';
}

function formatDate(d: string): string {
  const parts = d.split('-');
  return `${parts[1]}/${parts[2]}`;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('alerts/response-time/page — formatMs', () => {
  it('returns — for null', () => {
    expect(formatMs(null)).toBe('—');
  });

  it('formats 0ms', () => {
    expect(formatMs(0)).toBe('0ms');
  });

  it('formats sub-second values in ms', () => {
    expect(formatMs(250)).toBe('250ms');
    expect(formatMs(999)).toBe('999ms');
  });

  it('formats exactly 1000ms as 1.0s', () => {
    expect(formatMs(1000)).toBe('1.0s');
  });

  it('formats values above 1000 in seconds with 1 decimal', () => {
    expect(formatMs(1500)).toBe('1.5s');
    expect(formatMs(5000)).toBe('5.0s');
    expect(formatMs(12345)).toBe('12.3s');
  });

  it('rounds to 1 decimal place', () => {
    // 2345 / 1000 = 2.345 → rounds to 2.3 (toFixed(1) uses standard rounding)
    expect(formatMs(2345)).toBe('2.3s');
    expect(formatMs(2355)).toBe('2.4s');
  });
});

describe('alerts/response-time/page — latencyColor', () => {
  it('returns muted for null', () => {
    expect(latencyColor(null)).toBe('text-zinc-400');
  });

  it('returns green for 0ms', () => {
    expect(latencyColor(0)).toBe('text-emerald-400');
  });

  it('returns green for values < 1000ms', () => {
    expect(latencyColor(1)).toBe('text-emerald-400');
    expect(latencyColor(500)).toBe('text-emerald-400');
    expect(latencyColor(999)).toBe('text-emerald-400');
  });

  it('returns yellow at exactly 1000ms', () => {
    expect(latencyColor(1000)).toBe('text-yellow-400');
  });

  it('returns yellow for 1000–4999ms', () => {
    expect(latencyColor(2000)).toBe('text-yellow-400');
    expect(latencyColor(4999)).toBe('text-yellow-400');
  });

  it('returns red at exactly 5000ms', () => {
    expect(latencyColor(5000)).toBe('text-red-400');
  });

  it('returns red for values >= 5000ms', () => {
    expect(latencyColor(10000)).toBe('text-red-400');
    expect(latencyColor(60000)).toBe('text-red-400');
  });
});

describe('alerts/response-time/page — formatDate', () => {
  it('extracts MM/DD from YYYY-MM-DD', () => {
    expect(formatDate('2026-04-03')).toBe('04/03');
  });

  it('preserves leading zeros', () => {
    expect(formatDate('2026-01-09')).toBe('01/09');
  });

  it('works for December', () => {
    expect(formatDate('2025-12-31')).toBe('12/31');
  });

  it('works for arbitrary date strings with dashes', () => {
    expect(formatDate('2026-07-15')).toBe('07/15');
  });
});
