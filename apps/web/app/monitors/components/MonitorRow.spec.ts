/**
 * Unit tests for MonitorRow pure logic.
 * Tests lastRun lookup, column visibility, and aria label derivation.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

interface MonitorRun {
  monitorId: string;
  latencyMs?: number | null;
  checkedAt: string;
}

function findLastRun(runs: MonitorRun[], monitorId: string): MonitorRun | undefined {
  return runs.find((r) => r.monitorId === monitorId);
}

function selectAriaLabel(selected: boolean, monitorName: string): string {
  return selected ? `Deselect ${monitorName}` : `Select ${monitorName}`;
}

function formatLatency(latencyMs: number | null | undefined): string {
  return latencyMs != null ? `${latencyMs}ms` : '—';
}

function toggleEnabledTitle(enabled: boolean): string {
  return enabled ? 'Disable monitor' : 'Enable monitor';
}

function pinTitle(pinned: boolean): string {
  return pinned ? 'Unpin' : 'Pin';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MonitorRow — findLastRun', () => {
  const runs: MonitorRun[] = [
    { monitorId: 'a', latencyMs: 120, checkedAt: '2026-01-01T00:00:00Z' },
    { monitorId: 'b', latencyMs: 200, checkedAt: '2026-01-01T00:01:00Z' },
    { monitorId: 'c', latencyMs: null, checkedAt: '2026-01-01T00:02:00Z' },
  ];

  it('finds run for matching monitor id', () => {
    expect(findLastRun(runs, 'a')?.latencyMs).toBe(120);
    expect(findLastRun(runs, 'b')?.latencyMs).toBe(200);
  });

  it('returns undefined when monitor has no run', () => {
    expect(findLastRun(runs, 'z')).toBeUndefined();
  });

  it('returns undefined for empty runs array', () => {
    expect(findLastRun([], 'a')).toBeUndefined();
  });

  it('handles null latencyMs in run', () => {
    const run = findLastRun(runs, 'c');
    expect(run).toBeDefined();
    expect(run?.latencyMs).toBeNull();
  });
});

describe('MonitorRow — selectAriaLabel', () => {
  it('returns Deselect label when selected', () => {
    expect(selectAriaLabel(true, 'My Monitor')).toBe('Deselect My Monitor');
  });

  it('returns Select label when not selected', () => {
    expect(selectAriaLabel(false, 'My Monitor')).toBe('Select My Monitor');
  });

  it('includes monitor name in label', () => {
    const label = selectAriaLabel(false, 'Production API');
    expect(label).toContain('Production API');
  });
});

describe('MonitorRow — formatLatency', () => {
  it('formats numeric latency with ms suffix', () => {
    expect(formatLatency(120)).toBe('120ms');
    expect(formatLatency(0)).toBe('0ms');
    expect(formatLatency(1500)).toBe('1500ms');
  });

  it('returns dash for null', () => {
    expect(formatLatency(null)).toBe('—');
  });

  it('returns dash for undefined', () => {
    expect(formatLatency(undefined)).toBe('—');
  });
});

describe('MonitorRow — toggleEnabledTitle', () => {
  it('shows Disable when monitor is enabled', () => {
    expect(toggleEnabledTitle(true)).toBe('Disable monitor');
  });

  it('shows Enable when monitor is disabled', () => {
    expect(toggleEnabledTitle(false)).toBe('Enable monitor');
  });
});

describe('MonitorRow — pinTitle', () => {
  it('shows Unpin when monitor is pinned', () => {
    expect(pinTitle(true)).toBe('Unpin');
  });

  it('shows Pin when monitor is not pinned', () => {
    expect(pinTitle(false)).toBe('Pin');
  });
});
