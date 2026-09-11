import { describe, it, expect } from 'vitest';

/**
 * Unit tests for REPEAT_EVERY_N alert logic.
 * Tests the pure filtering logic extracted from alerts.service.ts notifyMonitorFailure().
 */

type MockLink = {
  notifyOn: string;
  lastNotifiedAt: Date | null;
  repeatIntervalMin: number | null;
};

/** Mirrors the REPEAT_EVERY_N case in alerts.service.ts */
function shouldRepeat(link: MockLink, level: string, now: Date): boolean {
  if (link.notifyOn !== 'REPEAT_EVERY_N') return false;
  if (level === 'green') return false;
  if (!link.lastNotifiedAt) return true; // first failure
  const intervalMin = link.repeatIntervalMin ?? 30;
  const intervalMs = Math.max(1, intervalMin) * 60_000;
  return now.getTime() - link.lastNotifiedAt.getTime() >= intervalMs;
}

describe('REPEAT_EVERY_N alert logic', () => {
  const now = new Date('2026-03-28T15:00:00Z');

  it('fires on first failure (no lastNotifiedAt)', () => {
    const link: MockLink = { notifyOn: 'REPEAT_EVERY_N', lastNotifiedAt: null, repeatIntervalMin: 30 };
    expect(shouldRepeat(link, 'red', now)).toBe(true);
  });

  it('does NOT fire while green (recovery)', () => {
    const link: MockLink = { notifyOn: 'REPEAT_EVERY_N', lastNotifiedAt: null, repeatIntervalMin: 30 };
    expect(shouldRepeat(link, 'green', now)).toBe(false);
  });

  it('fires again when interval has elapsed', () => {
    const lastNotified = new Date(now.getTime() - 31 * 60_000); // 31 min ago
    const link: MockLink = { notifyOn: 'REPEAT_EVERY_N', lastNotifiedAt: lastNotified, repeatIntervalMin: 30 };
    expect(shouldRepeat(link, 'red', now)).toBe(true);
  });

  it('does NOT fire when interval has not elapsed', () => {
    const lastNotified = new Date(now.getTime() - 10 * 60_000); // 10 min ago
    const link: MockLink = { notifyOn: 'REPEAT_EVERY_N', lastNotifiedAt: lastNotified, repeatIntervalMin: 30 };
    expect(shouldRepeat(link, 'red', now)).toBe(false);
  });

  it('uses default 30-min interval when repeatIntervalMin is null', () => {
    const lastNotified29 = new Date(now.getTime() - 29 * 60_000); // 29 min ago
    const lastNotified31 = new Date(now.getTime() - 31 * 60_000); // 31 min ago
    const link: MockLink = { notifyOn: 'REPEAT_EVERY_N', lastNotifiedAt: lastNotified29, repeatIntervalMin: null };
    expect(shouldRepeat(link, 'red', now)).toBe(false);
    link.lastNotifiedAt = lastNotified31;
    expect(shouldRepeat(link, 'red', now)).toBe(true);
  });

  it('respects custom interval (5 min)', () => {
    const lastNotified6 = new Date(now.getTime() - 6 * 60_000); // 6 min ago
    const lastNotified4 = new Date(now.getTime() - 4 * 60_000); // 4 min ago
    const link5: MockLink = { notifyOn: 'REPEAT_EVERY_N', lastNotifiedAt: lastNotified6, repeatIntervalMin: 5 };
    expect(shouldRepeat(link5, 'red', now)).toBe(true);
    link5.lastNotifiedAt = lastNotified4;
    expect(shouldRepeat(link5, 'red', now)).toBe(false);
  });

  it('also fires for yellow (degraded) level', () => {
    const link: MockLink = { notifyOn: 'REPEAT_EVERY_N', lastNotifiedAt: null, repeatIntervalMin: 30 };
    expect(shouldRepeat(link, 'yellow', now)).toBe(true);
  });

  it('does NOT fire for other notifyOn modes', () => {
    const link: MockLink = { notifyOn: 'ON_CHANGE', lastNotifiedAt: null, repeatIntervalMin: null };
    expect(shouldRepeat(link, 'red', now)).toBe(false);
  });
});
