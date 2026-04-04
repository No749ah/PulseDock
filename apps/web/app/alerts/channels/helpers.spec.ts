import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Inline helpers (mirrored from helpers.ts) ──────────────────────────────

type HealthStatus = 'healthy' | 'degraded' | 'failing' | 'untested';

const STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  failing: 'Failing',
  untested: 'Untested',
};

const STATUS_COLORS: Record<HealthStatus, string> = {
  healthy: 'text-emerald-400',
  degraded: 'text-yellow-400',
  failing: 'text-red-400',
  untested: 'text-zinc-400',
};

const STATUS_BG: Record<HealthStatus, string> = {
  healthy: 'bg-emerald-500/10',
  degraded: 'bg-yellow-500/10',
  failing: 'bg-red-500/10',
  untested: 'bg-zinc-500/10',
};

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ── Tests ──────────────────────────────────────────────────────────────────

const NOW = new Date('2026-01-15T12:00:00.000Z').getTime();

describe('STATUS_LABELS', () => {
  it('maps all 4 health statuses', () => {
    expect(Object.keys(STATUS_LABELS)).toHaveLength(4);
  });

  it('returns expected labels', () => {
    expect(STATUS_LABELS.healthy).toBe('Healthy');
    expect(STATUS_LABELS.degraded).toBe('Degraded');
    expect(STATUS_LABELS.failing).toBe('Failing');
    expect(STATUS_LABELS.untested).toBe('Untested');
  });
});

describe('STATUS_COLORS', () => {
  it('maps all 4 health statuses', () => {
    expect(Object.keys(STATUS_COLORS)).toHaveLength(4);
  });

  it('uses emerald for healthy', () => {
    expect(STATUS_COLORS.healthy).toContain('emerald');
  });

  it('uses yellow for degraded', () => {
    expect(STATUS_COLORS.degraded).toContain('yellow');
  });

  it('uses red for failing', () => {
    expect(STATUS_COLORS.failing).toContain('red');
  });

  it('uses zinc for untested', () => {
    expect(STATUS_COLORS.untested).toContain('zinc');
  });
});

describe('STATUS_BG', () => {
  it('maps all 4 health statuses to bg classes', () => {
    for (const key of Object.keys(STATUS_BG) as HealthStatus[]) {
      expect(STATUS_BG[key]).toMatch(/^bg-/);
    }
  });
});

describe('relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Never" for null', () => {
    expect(relativeTime(null)).toBe('Never');
  });

  it('returns "Just now" for < 60s ago', () => {
    const iso = new Date(NOW - 30_000).toISOString();
    expect(relativeTime(iso)).toBe('Just now');
  });

  it('returns "Just now" for exact now', () => {
    const iso = new Date(NOW).toISOString();
    expect(relativeTime(iso)).toBe('Just now');
  });

  it('returns minutes for 1-59 min', () => {
    const iso = new Date(NOW - 5 * 60_000).toISOString();
    expect(relativeTime(iso)).toBe('5m ago');
  });

  it('returns 59m ago at boundary', () => {
    const iso = new Date(NOW - 59 * 60_000).toISOString();
    expect(relativeTime(iso)).toBe('59m ago');
  });

  it('returns hours for 1-23h', () => {
    const iso = new Date(NOW - 3 * 3600_000).toISOString();
    expect(relativeTime(iso)).toBe('3h ago');
  });

  it('returns 23h ago at boundary', () => {
    const iso = new Date(NOW - 23 * 3600_000).toISOString();
    expect(relativeTime(iso)).toBe('23h ago');
  });

  it('returns days for >= 24h', () => {
    const iso = new Date(NOW - 2 * 86400_000).toISOString();
    expect(relativeTime(iso)).toBe('2d ago');
  });

  it('returns 1d ago at exactly 24h', () => {
    const iso = new Date(NOW - 86400_000).toISOString();
    expect(relativeTime(iso)).toBe('1d ago');
  });
});
