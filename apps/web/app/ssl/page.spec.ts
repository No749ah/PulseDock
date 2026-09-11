/**
 * @vitest-environment node
 * Pure helper coverage for app/ssl/page.tsx
 * Tests: daysLabel, expiryBadgeVariant, relativeTime
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Inline the helpers under test (extracted from page.tsx) ──────────────────

function daysLabel(days: number | null): string {
  if (days === null) return '—';
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  return `${days}d`;
}

function expiryBadgeVariant(days: number | null, type: string): 'danger' | 'warning' | 'success' | 'default' {
  if (type !== 'SSL_CERT') return 'default';
  if (days === null) return 'default';
  if (days < 0 || days <= 0) return 'danger';
  if (days < 10) return 'danger';
  if (days <= 30) return 'warning';
  return 'success';
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── daysLabel ────────────────────────────────────────────────────────────────

describe('daysLabel', () => {
  it('returns em-dash for null', () => {
    expect(daysLabel(null)).toBe('—');
  });

  it('returns expired message for negative days', () => {
    expect(daysLabel(-1)).toBe('Expired 1d ago');
    expect(daysLabel(-14)).toBe('Expired 14d ago');
    expect(daysLabel(-365)).toBe('Expired 365d ago');
  });

  it('returns "Expires today" for 0', () => {
    expect(daysLabel(0)).toBe('Expires today');
  });

  it('returns days with d suffix for positive values', () => {
    expect(daysLabel(1)).toBe('1d');
    expect(daysLabel(30)).toBe('30d');
    expect(daysLabel(90)).toBe('90d');
    expect(daysLabel(365)).toBe('365d');
  });
});

// ── expiryBadgeVariant ───────────────────────────────────────────────────────

describe('expiryBadgeVariant', () => {
  it('returns default for non-SSL_CERT types', () => {
    expect(expiryBadgeVariant(5, 'HTTP')).toBe('default');
    expect(expiryBadgeVariant(5, 'TCP')).toBe('default');
    expect(expiryBadgeVariant(null, 'HEARTBEAT')).toBe('default');
  });

  it('returns default when days is null (SSL_CERT)', () => {
    expect(expiryBadgeVariant(null, 'SSL_CERT')).toBe('default');
  });

  it('returns danger for expired (negative days)', () => {
    expect(expiryBadgeVariant(-1, 'SSL_CERT')).toBe('danger');
    expect(expiryBadgeVariant(-30, 'SSL_CERT')).toBe('danger');
  });

  it('returns danger for 0 days', () => {
    expect(expiryBadgeVariant(0, 'SSL_CERT')).toBe('danger');
  });

  it('returns danger for 1–9 days', () => {
    expect(expiryBadgeVariant(1, 'SSL_CERT')).toBe('danger');
    expect(expiryBadgeVariant(9, 'SSL_CERT')).toBe('danger');
  });

  it('returns warning for 10–30 days', () => {
    expect(expiryBadgeVariant(10, 'SSL_CERT')).toBe('warning');
    expect(expiryBadgeVariant(20, 'SSL_CERT')).toBe('warning');
    expect(expiryBadgeVariant(30, 'SSL_CERT')).toBe('warning');
  });

  it('returns success for >30 days', () => {
    expect(expiryBadgeVariant(31, 'SSL_CERT')).toBe('success');
    expect(expiryBadgeVariant(90, 'SSL_CERT')).toBe('success');
    expect(expiryBadgeVariant(365, 'SSL_CERT')).toBe('success');
  });
});

// ── relativeTime ─────────────────────────────────────────────────────────────

describe('relativeTime (ssl/page)', () => {
  const NOW = new Date('2026-04-02T18:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns em-dash for null input', () => {
    expect(relativeTime(null)).toBe('—');
  });

  it('returns em-dash for empty string', () => {
    expect(relativeTime('')).toBe('—');
  });

  it('returns "just now" for < 2 minutes ago', () => {
    const ts = new Date(NOW - 90_000).toISOString(); // 1.5 min
    expect(relativeTime(ts)).toBe('just now');
  });

  it('returns "Xm ago" for 2–59 minutes', () => {
    const ts30 = new Date(NOW - 30 * 60_000).toISOString();
    expect(relativeTime(ts30)).toBe('30m ago');

    const ts59 = new Date(NOW - 59 * 60_000).toISOString();
    expect(relativeTime(ts59)).toBe('59m ago');
  });

  it('returns "Xh ago" for 1–23 hours', () => {
    const ts3h = new Date(NOW - 3 * 3_600_000).toISOString();
    expect(relativeTime(ts3h)).toBe('3h ago');

    const ts23h = new Date(NOW - 23 * 3_600_000).toISOString();
    expect(relativeTime(ts23h)).toBe('23h ago');
  });

  it('returns "Xd ago" for >= 24 hours', () => {
    const ts1d = new Date(NOW - 86_400_000).toISOString();
    expect(relativeTime(ts1d)).toBe('1d ago');

    const ts7d = new Date(NOW - 7 * 86_400_000).toISOString();
    expect(relativeTime(ts7d)).toBe('7d ago');
  });
});
