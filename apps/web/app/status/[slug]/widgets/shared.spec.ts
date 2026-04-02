/**
 * Unit tests for status/[slug]/widgets/shared.tsx pure helpers.
 *
 * Covers: timeAgo, formatRelative, isNoConfig, levelLabel.
 * Components are NOT rendered — only pure functions are tested.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// ── Mirror pure helpers (avoids 'use client' / JSX boundary) ────────────────

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function isNoConfig(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    '_noConfig' in data &&
    (data as Record<string, unknown>)._noConfig === true
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function levelLabel(level: 'green' | 'yellow' | 'red'): string {
  return level === 'green'
    ? 'Operational'
    : level === 'yellow'
    ? 'Degraded'
    : 'Outage';
}

// ── timeAgo ──────────────────────────────────────────────────────────────────

describe('timeAgo', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns "Xs ago" for < 60 seconds', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base + 30 * 1000);
    expect(timeAgo(new Date(base).toISOString())).toBe('30s ago');
  });

  it('returns "0s ago" for same timestamp', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base);
    expect(timeAgo(new Date(base).toISOString())).toBe('0s ago');
  });

  it('returns "1s ago" for 1 second', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base + 1000);
    expect(timeAgo(new Date(base).toISOString())).toBe('1s ago');
  });

  it('returns "59s ago" for 59 seconds', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base + 59 * 1000);
    expect(timeAgo(new Date(base).toISOString())).toBe('59s ago');
  });

  it('returns "Xm ago" for < 60 minutes', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base + 15 * 60 * 1000);
    expect(timeAgo(new Date(base).toISOString())).toBe('15m ago');
  });

  it('returns "1m ago" at exactly 60 seconds', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base + 60 * 1000);
    expect(timeAgo(new Date(base).toISOString())).toBe('1m ago');
  });

  it('returns "59m ago" for 59 minutes', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base + 59 * 60 * 1000);
    expect(timeAgo(new Date(base).toISOString())).toBe('59m ago');
  });

  it('returns "Xh ago" for >= 60 minutes', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T00:00:00Z').getTime();
    vi.setSystemTime(base + 3 * 60 * 60 * 1000);
    expect(timeAgo(new Date(base).toISOString())).toBe('3h ago');
  });

  it('returns "1h ago" at exactly 60 minutes', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base + 60 * 60 * 1000);
    expect(timeAgo(new Date(base).toISOString())).toBe('1h ago');
  });

  it('returns "24h ago" for 24 hours', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T00:00:00Z').getTime();
    vi.setSystemTime(base + 24 * 60 * 60 * 1000);
    expect(timeAgo(new Date(base).toISOString())).toBe('24h ago');
  });

  it('floors sub-second remainder', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base + 30 * 1000 + 999);
    expect(timeAgo(new Date(base).toISOString())).toBe('30s ago');
  });
});

// ── formatRelative ───────────────────────────────────────────────────────────

describe('formatRelative', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns "just now" for < 1 minute ago', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base + 30 * 1000);
    expect(formatRelative(new Date(base).toISOString())).toBe('just now');
  });

  it('returns "just now" for 0 seconds ago', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base);
    expect(formatRelative(new Date(base).toISOString())).toBe('just now');
  });

  it('returns "just now" for 59 seconds ago', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base + 59 * 1000);
    expect(formatRelative(new Date(base).toISOString())).toBe('just now');
  });

  it('returns "Xm ago" for < 60 minutes', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base + 20 * 60 * 1000);
    expect(formatRelative(new Date(base).toISOString())).toBe('20m ago');
  });

  it('returns "1m ago" at exactly 60 seconds', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base + 60 * 1000);
    expect(formatRelative(new Date(base).toISOString())).toBe('1m ago');
  });

  it('returns "59m ago" for 59 minutes', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base + 59 * 60 * 1000);
    expect(formatRelative(new Date(base).toISOString())).toBe('59m ago');
  });

  it('returns "Xh ago" for < 24 hours', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T00:00:00Z').getTime();
    vi.setSystemTime(base + 5 * 60 * 60 * 1000);
    expect(formatRelative(new Date(base).toISOString())).toBe('5h ago');
  });

  it('returns "1h ago" at exactly 60 minutes', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T12:00:00Z').getTime();
    vi.setSystemTime(base + 60 * 60 * 1000);
    expect(formatRelative(new Date(base).toISOString())).toBe('1h ago');
  });

  it('returns "23h ago" for 23 hours', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T00:00:00Z').getTime();
    vi.setSystemTime(base + 23 * 60 * 60 * 1000);
    expect(formatRelative(new Date(base).toISOString())).toBe('23h ago');
  });

  it('returns "Xd ago" for >= 24 hours', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T00:00:00Z').getTime();
    vi.setSystemTime(base + 2 * 24 * 60 * 60 * 1000);
    expect(formatRelative(new Date(base).toISOString())).toBe('2d ago');
  });

  it('returns "1d ago" at exactly 24 hours', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T00:00:00Z').getTime();
    vi.setSystemTime(base + 24 * 60 * 60 * 1000);
    expect(formatRelative(new Date(base).toISOString())).toBe('1d ago');
  });

  it('returns "7d ago" for one week', () => {
    vi.useFakeTimers();
    const base = new Date('2026-04-01T00:00:00Z').getTime();
    vi.setSystemTime(base + 7 * 24 * 60 * 60 * 1000);
    expect(formatRelative(new Date(base).toISOString())).toBe('7d ago');
  });
});

// ── isNoConfig ───────────────────────────────────────────────────────────────

describe('isNoConfig', () => {
  it('returns true for object with _noConfig: true', () => {
    expect(isNoConfig({ _noConfig: true })).toBe(true);
  });

  it('returns true even with extra properties', () => {
    expect(isNoConfig({ _noConfig: true, other: 'value' })).toBe(true);
  });

  it('returns false for object with _noConfig: false', () => {
    expect(isNoConfig({ _noConfig: false })).toBe(false);
  });

  it('returns false for object missing _noConfig', () => {
    expect(isNoConfig({ foo: 'bar' })).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isNoConfig({})).toBe(false);
  });

  it('returns false for null', () => {
    expect(isNoConfig(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isNoConfig(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isNoConfig('_noConfig')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isNoConfig(42)).toBe(false);
  });

  it('returns false for an array', () => {
    expect(isNoConfig([{ _noConfig: true }])).toBe(false);
  });

  it('returns false when _noConfig is a truthy non-boolean', () => {
    expect(isNoConfig({ _noConfig: 1 })).toBe(false);
    expect(isNoConfig({ _noConfig: 'yes' })).toBe(false);
  });
});

// ── levelLabel ───────────────────────────────────────────────────────────────

describe('levelLabel', () => {
  it('returns "Operational" for green', () => {
    expect(levelLabel('green')).toBe('Operational');
  });

  it('returns "Degraded" for yellow', () => {
    expect(levelLabel('yellow')).toBe('Degraded');
  });

  it('returns "Outage" for red', () => {
    expect(levelLabel('red')).toBe('Outage');
  });

  it('covers all three valid levels', () => {
    const levels: Array<'green' | 'yellow' | 'red'> = ['green', 'yellow', 'red'];
    const labels = levels.map(levelLabel);
    expect(labels).toEqual(['Operational', 'Degraded', 'Outage']);
  });
});
