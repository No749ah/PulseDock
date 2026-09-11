/**
 * Unit tests for admin/page.tsx pure helpers.
 *
 * formatUptime() is a pure function — fully testable without React rendering.
 * RelativeTime label computation is mirrored as a pure helper.
 */
import { describe, it, expect } from 'vitest';

// ─── Mirror formatUptime ──────────────────────────────────────────────────────

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

// ─── Mirror RelativeTime label ────────────────────────────────────────────────

function relativeTimeLabel(iso: string, now: number): string {
  const d = new Date(iso);
  const diff = now - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString();
}

// ─── formatUptime ─────────────────────────────────────────────────────────────

describe('formatUptime', () => {
  describe('seconds-only range (< 1 minute)', () => {
    it('returns "0m Xs" for values < 60s', () => {
      expect(formatUptime(0)).toBe('0m 0s');
      expect(formatUptime(1000)).toBe('0m 1s');
      expect(formatUptime(30000)).toBe('0m 30s');
      expect(formatUptime(59000)).toBe('0m 59s');
    });
  });

  describe('minutes range (< 1 hour)', () => {
    it('returns "Xm Ys" for exactly 1 minute', () => {
      expect(formatUptime(60000)).toBe('1m 0s');
    });

    it('returns "Xm Ys" for 90 seconds', () => {
      expect(formatUptime(90000)).toBe('1m 30s');
    });

    it('returns "Xm Ys" for 59 minutes 59 seconds', () => {
      expect(formatUptime(3599000)).toBe('59m 59s');
    });

    it('returns "Xm Ys" for 5 minutes', () => {
      expect(formatUptime(5 * 60 * 1000)).toBe('5m 0s');
    });
  });

  describe('hours range (>= 1 hour, < 1 day)', () => {
    it('returns "Xh Ym" for exactly 1 hour', () => {
      expect(formatUptime(3600000)).toBe('1h 0m');
    });

    it('returns "Xh Ym" for 1 hour 30 minutes', () => {
      expect(formatUptime(3600000 + 30 * 60000)).toBe('1h 30m');
    });

    it('returns "Xh Ym" for 23 hours 59 minutes', () => {
      expect(formatUptime(23 * 3600000 + 59 * 60000)).toBe('23h 59m');
    });

    it('returns "Xh Ym" for 2 hours exactly', () => {
      expect(formatUptime(2 * 3600000)).toBe('2h 0m');
    });
  });

  describe('days range (>= 1 day)', () => {
    it('returns "Xd Yh Zm" for exactly 1 day', () => {
      expect(formatUptime(86400000)).toBe('1d 0h 0m');
    });

    it('returns "Xd Yh Zm" for 1 day 2 hours 30 minutes', () => {
      expect(formatUptime(86400000 + 2 * 3600000 + 30 * 60000)).toBe('1d 2h 30m');
    });

    it('returns "Xd Yh Zm" for 7 days', () => {
      expect(formatUptime(7 * 86400000)).toBe('7d 0h 0m');
    });

    it('returns "Xd Yh Zm" for 30 days 12 hours', () => {
      expect(formatUptime(30 * 86400000 + 12 * 3600000)).toBe('30d 12h 0m');
    });

    it('returns "Xd Yh Zm" for 365 days', () => {
      expect(formatUptime(365 * 86400000)).toBe('365d 0h 0m');
    });
  });

  describe('boundary: exactly at transition points', () => {
    it('just under 1 hour (3599s) → minutes', () => {
      expect(formatUptime(3599000)).toBe('59m 59s');
    });

    it('exactly 1 hour (3600s) → hours', () => {
      expect(formatUptime(3600000)).toBe('1h 0m');
    });

    it('just under 1 day (86399s) → hours', () => {
      // 86399s = 23h 59m 59s → "23h 59m"
      expect(formatUptime(86399000)).toBe('23h 59m');
    });

    it('exactly 1 day (86400s) → days', () => {
      expect(formatUptime(86400000)).toBe('1d 0h 0m');
    });
  });
});

// ─── relativeTimeLabel ────────────────────────────────────────────────────────

describe('relativeTimeLabel', () => {
  const now = new Date('2026-04-02T12:00:00Z').getTime();

  it('shows seconds ago for < 60s', () => {
    const iso = new Date(now - 30 * 1000).toISOString();
    expect(relativeTimeLabel(iso, now)).toBe('30s ago');
  });

  it('shows minutes ago for 60s–3599s', () => {
    const iso = new Date(now - 5 * 60 * 1000).toISOString();
    expect(relativeTimeLabel(iso, now)).toBe('5m ago');
  });

  it('shows hours ago for 3600s–86399s', () => {
    const iso = new Date(now - 2 * 3600 * 1000).toISOString();
    expect(relativeTimeLabel(iso, now)).toBe('2h ago');
  });

  it('shows locale date string for >= 1 day', () => {
    const d = new Date(now - 2 * 86400 * 1000);
    const iso = d.toISOString();
    const result = relativeTimeLabel(iso, now);
    // Should match toLocaleDateString output, not a relative string
    expect(result).toBe(d.toLocaleDateString());
    expect(result).not.toContain('ago');
  });

  it('returns "0s ago" for current moment', () => {
    const iso = new Date(now).toISOString();
    expect(relativeTimeLabel(iso, now)).toBe('0s ago');
  });

  it('returns "1m ago" for exactly 60s', () => {
    const iso = new Date(now - 60 * 1000).toISOString();
    expect(relativeTimeLabel(iso, now)).toBe('1m ago');
  });

  it('returns "1h ago" for exactly 3600s', () => {
    const iso = new Date(now - 3600 * 1000).toISOString();
    expect(relativeTimeLabel(iso, now)).toBe('1h ago');
  });
});
