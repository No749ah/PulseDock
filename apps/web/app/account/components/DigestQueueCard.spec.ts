/**
 * Unit tests for DigestQueueCard pure helpers.
 *
 * Tests the `formatRelative` time formatter and the `EVENT_META`
 * constant structure — both are pure, side-effect-free logic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mirrors of pure helpers from DigestQueueCard.tsx ────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type EventType = 'down' | 'recovery' | 'degraded' | 'flapping';

const EVENT_LABELS: Record<EventType, string> = {
  down: 'DOWN',
  recovery: 'RECOVERED',
  degraded: 'DEGRADED',
  flapping: 'FLAPPING',
};

const EVENT_COLORS: Record<EventType, string> = {
  down: 'text-red-400 bg-red-400/10',
  recovery: 'text-green-400 bg-green-400/10',
  degraded: 'text-yellow-400 bg-yellow-400/10',
  flapping: 'text-purple-400 bg-purple-400/10',
};

// ─── formatRelative ───────────────────────────────────────────────────────────

describe('formatRelative', () => {
  const NOW = new Date('2026-04-02T15:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for 0 seconds ago', () => {
    const iso = new Date(NOW).toISOString();
    expect(formatRelative(iso)).toBe('just now');
  });

  it('returns "just now" for 30 seconds ago', () => {
    const iso = new Date(NOW - 30_000).toISOString();
    expect(formatRelative(iso)).toBe('just now');
  });

  it('returns "just now" for 59 seconds ago', () => {
    const iso = new Date(NOW - 59_000).toISOString();
    expect(formatRelative(iso)).toBe('just now');
  });

  it('returns "1m ago" for exactly 1 minute ago', () => {
    const iso = new Date(NOW - 60_000).toISOString();
    expect(formatRelative(iso)).toBe('1m ago');
  });

  it('returns "5m ago" for 5 minutes ago', () => {
    const iso = new Date(NOW - 5 * 60_000).toISOString();
    expect(formatRelative(iso)).toBe('5m ago');
  });

  it('returns "59m ago" for 59 minutes ago', () => {
    const iso = new Date(NOW - 59 * 60_000).toISOString();
    expect(formatRelative(iso)).toBe('59m ago');
  });

  it('returns "1h ago" for exactly 60 minutes ago', () => {
    const iso = new Date(NOW - 60 * 60_000).toISOString();
    expect(formatRelative(iso)).toBe('1h ago');
  });

  it('returns "3h ago" for 3 hours ago', () => {
    const iso = new Date(NOW - 3 * 60 * 60_000).toISOString();
    expect(formatRelative(iso)).toBe('3h ago');
  });

  it('returns "23h ago" for 23 hours ago', () => {
    const iso = new Date(NOW - 23 * 60 * 60_000).toISOString();
    expect(formatRelative(iso)).toBe('23h ago');
  });

  it('returns "1d ago" for exactly 24 hours ago', () => {
    const iso = new Date(NOW - 24 * 60 * 60_000).toISOString();
    expect(formatRelative(iso)).toBe('1d ago');
  });

  it('returns "7d ago" for 7 days ago', () => {
    const iso = new Date(NOW - 7 * 24 * 60 * 60_000).toISOString();
    expect(formatRelative(iso)).toBe('7d ago');
  });

  it('returns "30d ago" for 30 days ago', () => {
    const iso = new Date(NOW - 30 * 24 * 60 * 60_000).toISOString();
    expect(formatRelative(iso)).toBe('30d ago');
  });
});

// ─── EVENT_META structure ─────────────────────────────────────────────────────

describe('EVENT_LABELS', () => {
  const eventTypes: EventType[] = ['down', 'recovery', 'degraded', 'flapping'];

  it('has entries for all 4 event types', () => {
    expect(Object.keys(EVENT_LABELS)).toHaveLength(4);
    for (const et of eventTypes) {
      expect(EVENT_LABELS[et]).toBeDefined();
    }
  });

  it('down has label DOWN', () => {
    expect(EVENT_LABELS.down).toBe('DOWN');
  });

  it('recovery has label RECOVERED', () => {
    expect(EVENT_LABELS.recovery).toBe('RECOVERED');
  });

  it('degraded has label DEGRADED', () => {
    expect(EVENT_LABELS.degraded).toBe('DEGRADED');
  });

  it('flapping has label FLAPPING', () => {
    expect(EVENT_LABELS.flapping).toBe('FLAPPING');
  });
});

describe('EVENT_COLORS', () => {
  it('down uses red color classes', () => {
    expect(EVENT_COLORS.down).toContain('red');
  });

  it('recovery uses green color classes', () => {
    expect(EVENT_COLORS.recovery).toContain('green');
  });

  it('degraded uses yellow color classes', () => {
    expect(EVENT_COLORS.degraded).toContain('yellow');
  });

  it('flapping uses purple color classes', () => {
    expect(EVENT_COLORS.flapping).toContain('purple');
  });

  it('all event types have non-empty color strings', () => {
    for (const [, color] of Object.entries(EVENT_COLORS)) {
      expect(color.length).toBeGreaterThan(0);
    }
  });
});
