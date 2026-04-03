/**
 * @vitest-environment node
 * Unit tests for pure helpers in monitors/schedule/page.tsx
 */

import { describe, it, expect } from 'vitest';

// ── Inline helpers from page.tsx ─────────────────────────────────────────────

function fmtInterval(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

function fmtCountdown(sec: number | null): string {
  if (sec === null) return '—';
  if (sec <= 0) return 'Now';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h`;
}

// HeatBar color logic (inline from component)
function heatBarColor(pct: number): string {
  if (pct >= 0.9) return 'bg-red-500';
  if (pct >= 0.7) return 'bg-orange-500';
  if (pct >= 0.5) return 'bg-yellow-500';
  return 'bg-green-500';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('monitors/schedule/page — fmtInterval', () => {
  it('formats sub-60s as seconds', () => {
    expect(fmtInterval(1)).toBe('1s');
    expect(fmtInterval(30)).toBe('30s');
    expect(fmtInterval(59)).toBe('59s');
  });

  it('boundary: 60s becomes 1m', () => {
    expect(fmtInterval(60)).toBe('1m');
  });

  it('formats minutes range (60–3599s)', () => {
    expect(fmtInterval(120)).toBe('2m');
    expect(fmtInterval(300)).toBe('5m');
    expect(fmtInterval(3599)).toBe('60m');
  });

  it('boundary: 3600s becomes 1h', () => {
    expect(fmtInterval(3600)).toBe('1h');
  });

  it('formats hours range (3600–86399s)', () => {
    expect(fmtInterval(7200)).toBe('2h');
    expect(fmtInterval(43200)).toBe('12h');
    expect(fmtInterval(86399)).toBe('24h');
  });

  it('boundary: 86400s becomes 1d', () => {
    expect(fmtInterval(86400)).toBe('1d');
  });

  it('formats days', () => {
    expect(fmtInterval(172800)).toBe('2d');
    expect(fmtInterval(604800)).toBe('7d');
  });

  it('rounds minutes correctly', () => {
    // 90s = 1.5m → rounds to 2m
    expect(fmtInterval(90)).toBe('2m');
    // 150s = 2.5m → rounds to 3m
    expect(fmtInterval(150)).toBe('3m');
  });

  it('rounds hours correctly', () => {
    // 5400s = 1.5h → rounds to 2h
    expect(fmtInterval(5400)).toBe('2h');
  });
});

describe('monitors/schedule/page — fmtCountdown', () => {
  it('returns em dash for null', () => {
    expect(fmtCountdown(null)).toBe('—');
  });

  it('returns Now for 0', () => {
    expect(fmtCountdown(0)).toBe('Now');
  });

  it('returns Now for negative values', () => {
    expect(fmtCountdown(-1)).toBe('Now');
    expect(fmtCountdown(-100)).toBe('Now');
  });

  it('formats sub-60s as seconds', () => {
    expect(fmtCountdown(1)).toBe('1s');
    expect(fmtCountdown(30)).toBe('30s');
    expect(fmtCountdown(59)).toBe('59s');
  });

  it('boundary: 60s becomes minutes', () => {
    expect(fmtCountdown(60)).toBe('1m 0s');
  });

  it('formats minutes+seconds', () => {
    expect(fmtCountdown(90)).toBe('1m 30s');
    expect(fmtCountdown(125)).toBe('2m 5s');
    expect(fmtCountdown(3599)).toBe('59m 59s');
  });

  it('boundary: 3600s becomes hours', () => {
    expect(fmtCountdown(3600)).toBe('1h');
  });

  it('formats hours only (no minutes shown)', () => {
    expect(fmtCountdown(7200)).toBe('2h');
    expect(fmtCountdown(3601)).toBe('1h');
  });

  it('null returns em dash not string null', () => {
    expect(fmtCountdown(null)).not.toBe('null');
    expect(fmtCountdown(null)).toBe('—');
  });
});

describe('monitors/schedule/page — heatBarColor', () => {
  it('returns red for >= 90% load', () => {
    expect(heatBarColor(0.9)).toBe('bg-red-500');
    expect(heatBarColor(1.0)).toBe('bg-red-500');
    expect(heatBarColor(0.95)).toBe('bg-red-500');
  });

  it('returns orange for 70–89% load', () => {
    expect(heatBarColor(0.7)).toBe('bg-orange-500');
    expect(heatBarColor(0.8)).toBe('bg-orange-500');
    expect(heatBarColor(0.89)).toBe('bg-orange-500');
  });

  it('returns yellow for 50–69% load', () => {
    expect(heatBarColor(0.5)).toBe('bg-yellow-500');
    expect(heatBarColor(0.6)).toBe('bg-yellow-500');
    expect(heatBarColor(0.69)).toBe('bg-yellow-500');
  });

  it('returns green for < 50% load', () => {
    expect(heatBarColor(0.0)).toBe('bg-green-500');
    expect(heatBarColor(0.3)).toBe('bg-green-500');
    expect(heatBarColor(0.49)).toBe('bg-green-500');
  });

  it('boundary: exactly 0.9 is red not orange', () => {
    expect(heatBarColor(0.9)).toBe('bg-red-500');
    expect(heatBarColor(0.9)).not.toBe('bg-orange-500');
  });

  it('boundary: exactly 0.7 is orange not yellow', () => {
    expect(heatBarColor(0.7)).toBe('bg-orange-500');
    expect(heatBarColor(0.7)).not.toBe('bg-yellow-500');
  });

  it('boundary: exactly 0.5 is yellow not green', () => {
    expect(heatBarColor(0.5)).toBe('bg-yellow-500');
    expect(heatBarColor(0.5)).not.toBe('bg-green-500');
  });
});
