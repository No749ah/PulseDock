import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Pure helpers mirrored inline (no JSX import) ──────────────────────

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
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

function isNoConfig(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    '_noConfig' in data &&
    (data as Record<string, unknown>)._noConfig === true
  );
}

function levelLabel(level: 'green' | 'yellow' | 'red'): string {
  return level === 'green' ? 'Operational' : level === 'yellow' ? 'Degraded' : 'Outage';
}

type Level = 'green' | 'yellow' | 'red';

function computeSystemLevel(monitors: { level: Level }[]): Level {
  if (monitors.length === 0) return 'green';
  if (monitors.some((m) => m.level === 'red')) return 'red';
  if (monitors.some((m) => m.level === 'yellow')) return 'yellow';
  return 'green';
}

function buildStatusConfig(
  level: Level,
  monitorCount: number,
  _affectedCount: number,
  outageCount: number,
  degradedCount: number,
  operationalCount: number,
): { label: string; subLabel: string | null } {
  if (level === 'green') {
    return {
      label: 'All Systems Operational',
      subLabel: operationalCount > 0 ? `${operationalCount} monitor(s) online` : null,
    };
  }
  if (level === 'yellow') {
    return {
      label: 'Partial Degradation',
      subLabel: `${degradedCount} monitor(s) degraded`,
    };
  }
  // red
  let subLabel = `${outageCount} monitor(s) down`;
  if (degradedCount > 0) subLabel += ` + ${degradedCount} degraded`;
  return { label: 'Major Outage', subLabel };
}

function uptimeBarColor(uptimePct: number): string {
  if (uptimePct >= 99.5) return 'bg-green-400';
  if (uptimePct >= 90) return 'bg-yellow-400';
  return 'bg-red-400';
}

function uptimePctColor(uptimePct: number): string {
  if (uptimePct >= 99.5) return 'text-green-400';
  if (uptimePct >= 90) return 'text-yellow-400';
  return 'text-red-400';
}

// ── Tests ──────────────────────────────────────────────────────────────

const NOW = new Date('2024-01-15T12:00:00.000Z').getTime();

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns seconds ago when diff < 60s', () => {
    const iso = new Date(NOW - 30_000).toISOString();
    expect(timeAgo(iso)).toBe('30s ago');
  });

  it('returns 0s ago when just now', () => {
    const iso = new Date(NOW).toISOString();
    expect(timeAgo(iso)).toBe('0s ago');
  });

  it('returns 59s ago at boundary', () => {
    const iso = new Date(NOW - 59_000).toISOString();
    expect(timeAgo(iso)).toBe('59s ago');
  });

  it('returns minutes ago when diff >= 60s and < 3600s', () => {
    const iso = new Date(NOW - 120_000).toISOString();
    expect(timeAgo(iso)).toBe('2m ago');
  });

  it('returns 59m ago at boundary', () => {
    const iso = new Date(NOW - 59 * 60 * 1000).toISOString();
    expect(timeAgo(iso)).toBe('59m ago');
  });

  it('returns hours ago when diff >= 3600s', () => {
    const iso = new Date(NOW - 3 * 3600_000).toISOString();
    expect(timeAgo(iso)).toBe('3h ago');
  });

  it('returns 1h ago at exact 3600s', () => {
    const iso = new Date(NOW - 3600_000).toISOString();
    expect(timeAgo(iso)).toBe('1h ago');
  });
});

describe('formatRelative', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for < 1 minute ago', () => {
    const iso = new Date(NOW - 30_000).toISOString();
    expect(formatRelative(iso)).toBe('just now');
  });

  it('returns "just now" for exact 0ms diff', () => {
    const iso = new Date(NOW).toISOString();
    expect(formatRelative(iso)).toBe('just now');
  });

  it('returns minutes for 1-59 min', () => {
    const iso = new Date(NOW - 5 * 60_000).toISOString();
    expect(formatRelative(iso)).toBe('5m ago');
  });

  it('returns 59m ago at boundary', () => {
    const iso = new Date(NOW - 59 * 60_000).toISOString();
    expect(formatRelative(iso)).toBe('59m ago');
  });

  it('returns hours for 1-23 hours', () => {
    const iso = new Date(NOW - 3 * 3600_000).toISOString();
    expect(formatRelative(iso)).toBe('3h ago');
  });

  it('returns 23h ago at boundary', () => {
    const iso = new Date(NOW - 23 * 3600_000).toISOString();
    expect(formatRelative(iso)).toBe('23h ago');
  });

  it('returns days for >= 24 hours', () => {
    const iso = new Date(NOW - 2 * 24 * 3600_000).toISOString();
    expect(formatRelative(iso)).toBe('2d ago');
  });

  it('returns 1d ago at exactly 24h', () => {
    const iso = new Date(NOW - 24 * 3600_000).toISOString();
    expect(formatRelative(iso)).toBe('1d ago');
  });
});

describe('isNoConfig', () => {
  it('returns true for { _noConfig: true }', () => {
    expect(isNoConfig({ _noConfig: true })).toBe(true);
  });

  it('returns false for {}', () => {
    expect(isNoConfig({})).toBe(false);
  });

  it('returns false for { _noConfig: false }', () => {
    expect(isNoConfig({ _noConfig: false })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isNoConfig(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isNoConfig(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isNoConfig('hello')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isNoConfig(42)).toBe(false);
  });
});

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

describe('computeSystemLevel', () => {
  it('returns "green" for empty array', () => {
    expect(computeSystemLevel([])).toBe('green');
  });

  it('returns "green" when all monitors are green', () => {
    expect(computeSystemLevel([{ level: 'green' }, { level: 'green' }])).toBe('green');
  });

  it('returns "red" when any monitor is red', () => {
    expect(computeSystemLevel([{ level: 'green' }, { level: 'red' }])).toBe('red');
  });

  it('returns "red" even when some are yellow', () => {
    expect(computeSystemLevel([{ level: 'yellow' }, { level: 'red' }])).toBe('red');
  });

  it('returns "yellow" when any monitor is yellow and none are red', () => {
    expect(computeSystemLevel([{ level: 'green' }, { level: 'yellow' }])).toBe('yellow');
  });

  it('returns "yellow" for single yellow monitor', () => {
    expect(computeSystemLevel([{ level: 'yellow' }])).toBe('yellow');
  });
});

describe('buildStatusConfig', () => {
  it('green with monitors: All Systems Operational with subLabel', () => {
    const result = buildStatusConfig('green', 5, 0, 0, 0, 5);
    expect(result.label).toBe('All Systems Operational');
    expect(result.subLabel).toBe('5 monitor(s) online');
  });

  it('green with 0 operational: subLabel is null', () => {
    const result = buildStatusConfig('green', 0, 0, 0, 0, 0);
    expect(result.label).toBe('All Systems Operational');
    expect(result.subLabel).toBeNull();
  });

  it('yellow: Partial Degradation with degraded count', () => {
    const result = buildStatusConfig('yellow', 5, 2, 0, 2, 3);
    expect(result.label).toBe('Partial Degradation');
    expect(result.subLabel).toBe('2 monitor(s) degraded');
  });

  it('red: Major Outage with outage count only', () => {
    const result = buildStatusConfig('red', 5, 2, 2, 0, 3);
    expect(result.label).toBe('Major Outage');
    expect(result.subLabel).toBe('2 monitor(s) down');
  });

  it('red: Major Outage with degraded suffix', () => {
    const result = buildStatusConfig('red', 5, 3, 2, 1, 2);
    expect(result.label).toBe('Major Outage');
    expect(result.subLabel).toBe('2 monitor(s) down + 1 degraded');
  });

  it('red: no degraded suffix when degradedCount is 0', () => {
    const result = buildStatusConfig('red', 3, 3, 3, 0, 0);
    expect(result.subLabel).toBe('3 monitor(s) down');
    expect(result.subLabel).not.toContain('degraded');
  });
});

describe('uptimeBarColor', () => {
  it('returns bg-green-400 at exactly 99.5', () => {
    expect(uptimeBarColor(99.5)).toBe('bg-green-400');
  });

  it('returns bg-green-400 at 100', () => {
    expect(uptimeBarColor(100)).toBe('bg-green-400');
  });

  it('returns bg-yellow-400 at 99.4 (just below green threshold)', () => {
    expect(uptimeBarColor(99.4)).toBe('bg-yellow-400');
  });

  it('returns bg-yellow-400 at exactly 90', () => {
    expect(uptimeBarColor(90)).toBe('bg-yellow-400');
  });

  it('returns bg-red-400 at 89.9 (just below yellow threshold)', () => {
    expect(uptimeBarColor(89.9)).toBe('bg-red-400');
  });

  it('returns bg-red-400 at 0', () => {
    expect(uptimeBarColor(0)).toBe('bg-red-400');
  });
});

describe('uptimePctColor', () => {
  it('returns text-green-400 at 99.5', () => {
    expect(uptimePctColor(99.5)).toBe('text-green-400');
  });

  it('returns text-green-400 at 100', () => {
    expect(uptimePctColor(100)).toBe('text-green-400');
  });

  it('returns text-yellow-400 at 95', () => {
    expect(uptimePctColor(95)).toBe('text-yellow-400');
  });

  it('returns text-yellow-400 at exactly 90', () => {
    expect(uptimePctColor(90)).toBe('text-yellow-400');
  });

  it('returns text-red-400 at 89', () => {
    expect(uptimePctColor(89)).toBe('text-red-400');
  });

  it('returns text-red-400 at 0', () => {
    expect(uptimePctColor(0)).toBe('text-red-400');
  });
});
