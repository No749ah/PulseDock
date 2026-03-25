/**
 * Unit tests for MonitorStatusCell logic.
 * Tests are based on the label/badge computation logic in MonitorStatusCell.tsx.
 * We extract and test the pure status derivation logic separately.
 */
import { describe, it, expect } from 'vitest';

type Level = 'green' | 'yellow' | 'red';

interface Run {
  monitorId: string;
  ok: boolean;
  level?: Level | null;
  checkedAt: string;
  latencyMs?: number;
}

const VERSION_TYPES = new Set(['GIT_RELEASE', 'DOCKER_IMAGE']);

function computeStatusLabel(
  monitorId: string,
  monitorType: string,
  enabled: boolean,
  runs: Run[],
): string {
  const monitorRuns = runs.filter((r) => r.monitorId === monitorId);
  const latest = monitorRuns[0];

  if (!enabled) return 'Disabled';

  if (!latest) return 'Pending';

  const isVersion = VERSION_TYPES.has(monitorType);

  if (isVersion) {
    if (latest.level === 'green') return 'Up to date';
    if (latest.level === 'yellow') return 'Update available';
    return 'Major update';
  } else {
    if (latest.level === 'yellow') return 'Degraded';
    if (latest.ok) return 'Operational';
    return 'Down';
  }
}

function computeUptimePct(monitorId: string, monitorType: string, runs: Run[]): number | null {
  const isVersion = VERSION_TYPES.has(monitorType);
  if (isVersion) return null;
  const monitorRuns = runs.filter((r) => r.monitorId === monitorId);
  if (monitorRuns.length === 0) return null;
  const up = monitorRuns.filter((r) => r.ok || r.level === 'yellow').length;
  return Math.round((up / monitorRuns.length) * 1000) / 10;
}

const makeRun = (overrides: Partial<Run> & { monitorId: string }): Run => ({
  ok: true,
  level: 'green',
  checkedAt: new Date().toISOString(),
  ...overrides,
});

describe('MonitorStatusCell — computeStatusLabel', () => {
  it('returns "Disabled" when monitor is disabled regardless of runs', () => {
    const runs = [makeRun({ monitorId: 'm1', ok: true, level: 'green' })];
    expect(computeStatusLabel('m1', 'HTTP', false, runs)).toBe('Disabled');
  });

  it('returns "Pending" when enabled but no runs', () => {
    expect(computeStatusLabel('m1', 'HTTP', true, [])).toBe('Pending');
  });

  it('returns "Operational" for HTTP monitor with ok=true', () => {
    const runs = [makeRun({ monitorId: 'm1', ok: true, level: 'green' })];
    expect(computeStatusLabel('m1', 'HTTP', true, runs)).toBe('Operational');
  });

  it('returns "Down" for HTTP monitor with ok=false', () => {
    const runs = [makeRun({ monitorId: 'm1', ok: false, level: 'red' })];
    expect(computeStatusLabel('m1', 'HTTP', true, runs)).toBe('Down');
  });

  it('returns "Degraded" for HTTP monitor with level=yellow', () => {
    const runs = [makeRun({ monitorId: 'm1', ok: true, level: 'yellow' })];
    expect(computeStatusLabel('m1', 'HTTP', true, runs)).toBe('Degraded');
  });

  it('returns "Up to date" for GIT_RELEASE monitor with level=green', () => {
    const runs = [makeRun({ monitorId: 'm1', ok: true, level: 'green' })];
    expect(computeStatusLabel('m1', 'GIT_RELEASE', true, runs)).toBe('Up to date');
  });

  it('returns "Update available" for GIT_RELEASE monitor with level=yellow', () => {
    const runs = [makeRun({ monitorId: 'm1', ok: true, level: 'yellow' })];
    expect(computeStatusLabel('m1', 'GIT_RELEASE', true, runs)).toBe('Update available');
  });

  it('returns "Major update" for GIT_RELEASE monitor with level=red', () => {
    const runs = [makeRun({ monitorId: 'm1', ok: false, level: 'red' })];
    expect(computeStatusLabel('m1', 'GIT_RELEASE', true, runs)).toBe('Major update');
  });

  it('returns "Up to date" for DOCKER_IMAGE monitor with level=green', () => {
    const runs = [makeRun({ monitorId: 'm1', ok: true, level: 'green' })];
    expect(computeStatusLabel('m1', 'DOCKER_IMAGE', true, runs)).toBe('Up to date');
  });

  it('filters runs by monitorId correctly', () => {
    const runs = [
      makeRun({ monitorId: 'm1', ok: false, level: 'red' }),
      makeRun({ monitorId: 'm2', ok: true, level: 'green' }),
    ];
    expect(computeStatusLabel('m1', 'HTTP', true, runs)).toBe('Down');
    expect(computeStatusLabel('m2', 'HTTP', true, runs)).toBe('Operational');
  });

  it('uses latest run (first in array) for status', () => {
    const runs = [
      makeRun({ monitorId: 'm1', ok: false, level: 'red', checkedAt: new Date(2000).toISOString() }),
      makeRun({ monitorId: 'm1', ok: true, level: 'green', checkedAt: new Date(1000).toISOString() }),
    ];
    expect(computeStatusLabel('m1', 'HTTP', true, runs)).toBe('Down');
  });
});

describe('MonitorStatusCell — computeUptimePct', () => {
  it('returns null for version monitor types', () => {
    const runs = [makeRun({ monitorId: 'm1', ok: true })];
    expect(computeUptimePct('m1', 'GIT_RELEASE', runs)).toBeNull();
    expect(computeUptimePct('m1', 'DOCKER_IMAGE', runs)).toBeNull();
  });

  it('returns null when no runs', () => {
    expect(computeUptimePct('m1', 'HTTP', [])).toBeNull();
  });

  it('returns 100 when all runs are ok', () => {
    const runs = Array.from({ length: 5 }, () => makeRun({ monitorId: 'm1', ok: true, level: 'green' }));
    expect(computeUptimePct('m1', 'HTTP', runs)).toBe(100);
  });

  it('returns 0 when all runs failed', () => {
    const runs = Array.from({ length: 4 }, () => makeRun({ monitorId: 'm1', ok: false, level: 'red' }));
    expect(computeUptimePct('m1', 'HTTP', runs)).toBe(0);
  });

  it('counts degraded (yellow) as "up" for uptime calculation', () => {
    const runs = [
      makeRun({ monitorId: 'm1', ok: true, level: 'yellow' }),
      makeRun({ monitorId: 'm1', ok: true, level: 'green' }),
      makeRun({ monitorId: 'm1', ok: false, level: 'red' }),
      makeRun({ monitorId: 'm1', ok: false, level: 'red' }),
    ];
    // 2 up (yellow + green) out of 4 = 50%
    expect(computeUptimePct('m1', 'HTTP', runs)).toBe(50);
  });

  it('computes 75% uptime correctly', () => {
    const runs = [
      makeRun({ monitorId: 'm1', ok: true }),
      makeRun({ monitorId: 'm1', ok: true }),
      makeRun({ monitorId: 'm1', ok: true }),
      makeRun({ monitorId: 'm1', ok: false, level: 'red' }),
    ];
    expect(computeUptimePct('m1', 'HTTP', runs)).toBe(75);
  });

  it('rounds to 1 decimal place', () => {
    // 1 out of 3 = 33.3%
    const runs = [
      makeRun({ monitorId: 'm1', ok: true }),
      makeRun({ monitorId: 'm1', ok: false, level: 'red' }),
      makeRun({ monitorId: 'm1', ok: false, level: 'red' }),
    ];
    expect(computeUptimePct('m1', 'HTTP', runs)).toBe(33.3);
  });

  it('filters by monitorId for uptime calculation', () => {
    const runs = [
      makeRun({ monitorId: 'm1', ok: true }),
      makeRun({ monitorId: 'm1', ok: false, level: 'red' }),
      makeRun({ monitorId: 'm2', ok: true }),
      makeRun({ monitorId: 'm2', ok: true }),
    ];
    expect(computeUptimePct('m1', 'HTTP', runs)).toBe(50);
    expect(computeUptimePct('m2', 'HTTP', runs)).toBe(100);
  });
});
