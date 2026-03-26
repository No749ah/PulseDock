/**
 * Unit tests for status-page widget shared helpers.
 * Tests pure logic functions — no DOM/React needed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  timeAgo,
  formatRelative,
  levelLabel,
  isNoConfig,
} from './shared';

// ── timeAgo ────────────────────────────────────────────────────────────────

describe('timeAgo', () => {
  const NOW = 1_700_000_000_000; // fixed epoch

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns "<n>s ago" for less than a minute', () => {
    const iso = new Date(NOW - 45_000).toISOString(); // 45 seconds ago
    expect(timeAgo(iso)).toBe('45s ago');
  });

  it('returns "0s ago" for exactly now', () => {
    const iso = new Date(NOW).toISOString();
    expect(timeAgo(iso)).toBe('0s ago');
  });

  it('returns "<n>m ago" for 1-59 minutes', () => {
    const iso = new Date(NOW - 5 * 60_000).toISOString(); // 5 min ago
    expect(timeAgo(iso)).toBe('5m ago');
  });

  it('returns "59m ago" at 59 minutes', () => {
    const iso = new Date(NOW - 59 * 60_000).toISOString();
    expect(timeAgo(iso)).toBe('59m ago');
  });

  it('returns "<n>h ago" for 1+ hours', () => {
    const iso = new Date(NOW - 3 * 3600_000).toISOString(); // 3 hours ago
    expect(timeAgo(iso)).toBe('3h ago');
  });

  it('returns "1h ago" at exactly 60 minutes', () => {
    const iso = new Date(NOW - 60 * 60_000).toISOString();
    expect(timeAgo(iso)).toBe('1h ago');
  });
});

// ── formatRelative ─────────────────────────────────────────────────────────

describe('formatRelative', () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns "just now" for very recent (<1 minute)', () => {
    const iso = new Date(NOW - 30_000).toISOString();
    expect(formatRelative(iso)).toBe('just now');
  });

  it('returns "<n>m ago" for 1-59 minutes', () => {
    const iso = new Date(NOW - 10 * 60_000).toISOString();
    expect(formatRelative(iso)).toBe('10m ago');
  });

  it('returns "<n>h ago" for 1-23 hours', () => {
    const iso = new Date(NOW - 2 * 3600_000).toISOString();
    expect(formatRelative(iso)).toBe('2h ago');
  });

  it('returns "<n>d ago" for 1+ days', () => {
    const iso = new Date(NOW - 3 * 86400_000).toISOString();
    expect(formatRelative(iso)).toBe('3d ago');
  });

  it('returns "23h ago" at 23 hours', () => {
    const iso = new Date(NOW - 23 * 3600_000).toISOString();
    expect(formatRelative(iso)).toBe('23h ago');
  });
});

// ── levelLabel ─────────────────────────────────────────────────────────────

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
});

// ── isNoConfig ─────────────────────────────────────────────────────────────

describe('isNoConfig', () => {
  it('returns true for _noConfig: true object', () => {
    expect(isNoConfig({ _noConfig: true })).toBe(true);
  });

  it('returns false for _noConfig: false', () => {
    expect(isNoConfig({ _noConfig: false })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isNoConfig(null)).toBe(false);
  });

  it('returns false for string', () => {
    expect(isNoConfig('hello')).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isNoConfig({})).toBe(false);
  });

  it('returns false for object without _noConfig key', () => {
    expect(isNoConfig({ data: 42 })).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isNoConfig(undefined)).toBe(false);
  });
});
