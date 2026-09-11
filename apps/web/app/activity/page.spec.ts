/**
 * @vitest-environment node
 * Pure helper coverage for app/activity/page.tsx
 * Tests: relativeTime, levelColor, levelBg, severityColor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Inline helpers extracted from page.tsx ───────────────────────────────────

function relativeTime(ts: string): string {
  const delta = Date.now() - new Date(ts).getTime();
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

function levelColor(level: string): string {
  if (level === 'green') return 'text-green-400';
  if (level === 'yellow') return 'text-yellow-400';
  return 'text-red-400';
}

function levelBg(level: string): string {
  if (level === 'green') return 'bg-green-500/10 border-green-500/20';
  if (level === 'yellow') return 'bg-yellow-500/10 border-yellow-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

function severityColor(s: string): string {
  if (s === 'CRITICAL') return 'text-red-400';
  if (s === 'HIGH') return 'text-orange-400';
  if (s === 'MEDIUM') return 'text-yellow-400';
  return 'text-blue-400';
}

// ── relativeTime ─────────────────────────────────────────────────────────────

describe('relativeTime (activity/page)', () => {
  const NOW = new Date('2026-04-02T18:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for < 60 seconds ago', () => {
    const ts = new Date(NOW - 30_000).toISOString();
    expect(relativeTime(ts)).toBe('just now');
  });

  it('returns "just now" for exactly 59 seconds ago', () => {
    const ts = new Date(NOW - 59_000).toISOString();
    expect(relativeTime(ts)).toBe('just now');
  });

  it('returns "Xm ago" for 1–59 minutes ago', () => {
    const ts1m = new Date(NOW - 60_000).toISOString();
    expect(relativeTime(ts1m)).toBe('1m ago');

    const ts30m = new Date(NOW - 30 * 60_000).toISOString();
    expect(relativeTime(ts30m)).toBe('30m ago');

    const ts59m = new Date(NOW - 59 * 60_000).toISOString();
    expect(relativeTime(ts59m)).toBe('59m ago');
  });

  it('returns "Xh ago" for 1–23 hours ago', () => {
    const ts1h = new Date(NOW - 3_600_000).toISOString();
    expect(relativeTime(ts1h)).toBe('1h ago');

    const ts12h = new Date(NOW - 12 * 3_600_000).toISOString();
    expect(relativeTime(ts12h)).toBe('12h ago');

    const ts23h = new Date(NOW - 23 * 3_600_000).toISOString();
    expect(relativeTime(ts23h)).toBe('23h ago');
  });

  it('returns "Xd ago" for >= 24 hours ago', () => {
    const ts1d = new Date(NOW - 86_400_000).toISOString();
    expect(relativeTime(ts1d)).toBe('1d ago');

    const ts7d = new Date(NOW - 7 * 86_400_000).toISOString();
    expect(relativeTime(ts7d)).toBe('7d ago');

    const ts30d = new Date(NOW - 30 * 86_400_000).toISOString();
    expect(relativeTime(ts30d)).toBe('30d ago');
  });
});

// ── levelColor ───────────────────────────────────────────────────────────────

describe('levelColor', () => {
  it('returns green text for green level', () => {
    expect(levelColor('green')).toBe('text-green-400');
  });

  it('returns yellow text for yellow level', () => {
    expect(levelColor('yellow')).toBe('text-yellow-400');
  });

  it('returns red text for red level', () => {
    expect(levelColor('red')).toBe('text-red-400');
  });

  it('returns red text for unknown level (default)', () => {
    expect(levelColor('unknown')).toBe('text-red-400');
    expect(levelColor('')).toBe('text-red-400');
    expect(levelColor('CRITICAL')).toBe('text-red-400');
  });
});

// ── levelBg ──────────────────────────────────────────────────────────────────

describe('levelBg', () => {
  it('returns green background for green level', () => {
    expect(levelBg('green')).toBe('bg-green-500/10 border-green-500/20');
  });

  it('returns yellow background for yellow level', () => {
    expect(levelBg('yellow')).toBe('bg-yellow-500/10 border-yellow-500/20');
  });

  it('returns red background for red level', () => {
    expect(levelBg('red')).toBe('bg-red-500/10 border-red-500/20');
  });

  it('returns red background for unknown level (default)', () => {
    expect(levelBg('orange')).toBe('bg-red-500/10 border-red-500/20');
    expect(levelBg('')).toBe('bg-red-500/10 border-red-500/20');
  });
});

// ── severityColor ─────────────────────────────────────────────────────────────

describe('severityColor', () => {
  it('returns red for CRITICAL', () => {
    expect(severityColor('CRITICAL')).toBe('text-red-400');
  });

  it('returns orange for HIGH', () => {
    expect(severityColor('HIGH')).toBe('text-orange-400');
  });

  it('returns yellow for MEDIUM', () => {
    expect(severityColor('MEDIUM')).toBe('text-yellow-400');
  });

  it('returns blue for LOW and unknown values (default)', () => {
    expect(severityColor('LOW')).toBe('text-blue-400');
    expect(severityColor('INFO')).toBe('text-blue-400');
    expect(severityColor('')).toBe('text-blue-400');
  });
});
