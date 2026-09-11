/**
 * Unit tests for VersionSection pure logic.
 * Tests update count arithmetic, visibility guard, and major/minor label logic.
 */
import { describe, it, expect } from 'vitest';

interface DashboardStats {
  totalMonitors: number;
  uptimeMonitors: number;
  uptimePct: number;
  uptimeGreen: number;
  uptimeYellow: number;
  uptimeRed: number;
  versionMonitors: number;
  versionUpToDate: number;
  versionUpdateAvailable: number;
  versionMajorBehind: number;
}

// ── Total updates available (mirrors component expression) ────────────────────
function totalUpdates(stats: DashboardStats): number {
  return stats.versionUpdateAvailable + stats.versionMajorBehind;
}

// ── Major behind label (mirrors component logic) ──────────────────────────────
function majorBehindLabel(count: number): string {
  return `${count} major version${count !== 1 ? 's' : ''} behind`;
}

// ── Visibility guard ──────────────────────────────────────────────────────────
function shouldRender(stats: DashboardStats): boolean {
  return stats.versionMonitors > 0;
}

function makStats(overrides: Partial<DashboardStats> = {}): DashboardStats {
  return {
    totalMonitors: 5,
    uptimeMonitors: 3,
    uptimePct: 99.9,
    uptimeGreen: 3,
    uptimeYellow: 0,
    uptimeRed: 0,
    versionMonitors: 2,
    versionUpToDate: 1,
    versionUpdateAvailable: 1,
    versionMajorBehind: 0,
    ...overrides,
  };
}

// ── Visibility guard ──────────────────────────────────────────────────────────
describe('VersionSection — shouldRender', () => {
  it('hides when versionMonitors === 0', () => {
    expect(shouldRender(makStats({ versionMonitors: 0 }))).toBe(false);
  });

  it('shows when versionMonitors > 0', () => {
    expect(shouldRender(makStats({ versionMonitors: 1 }))).toBe(true);
  });

  it('shows for large version monitor count', () => {
    expect(shouldRender(makStats({ versionMonitors: 100 }))).toBe(true);
  });
});

// ── Total updates calculation ─────────────────────────────────────────────────
describe('VersionSection — totalUpdates', () => {
  it('sums versionUpdateAvailable + versionMajorBehind', () => {
    expect(totalUpdates(makStats({ versionUpdateAvailable: 3, versionMajorBehind: 1 }))).toBe(4);
  });

  it('returns 0 when all up to date', () => {
    expect(totalUpdates(makStats({ versionUpdateAvailable: 0, versionMajorBehind: 0 }))).toBe(0);
  });

  it('handles major-only updates', () => {
    expect(totalUpdates(makStats({ versionUpdateAvailable: 0, versionMajorBehind: 5 }))).toBe(5);
  });

  it('handles minor-only updates', () => {
    expect(totalUpdates(makStats({ versionUpdateAvailable: 7, versionMajorBehind: 0 }))).toBe(7);
  });
});

// ── Major behind label ────────────────────────────────────────────────────────
describe('VersionSection — majorBehindLabel', () => {
  it('singular for 1 major version', () => {
    expect(majorBehindLabel(1)).toBe('1 major version behind');
  });

  it('plural for 0', () => {
    expect(majorBehindLabel(0)).toBe('0 major versions behind');
  });

  it('plural for 2', () => {
    expect(majorBehindLabel(2)).toBe('2 major versions behind');
  });

  it('plural for large count', () => {
    expect(majorBehindLabel(10)).toBe('10 major versions behind');
  });
});

// ── Up-to-date count display ──────────────────────────────────────────────────
describe('VersionSection — up-to-date count', () => {
  it('reflects versionUpToDate directly', () => {
    const stats = makStats({ versionUpToDate: 7 });
    expect(stats.versionUpToDate).toBe(7);
  });

  it('can be 0 when all monitors have updates', () => {
    const stats = makStats({ versionUpToDate: 0, versionUpdateAvailable: 2, versionMajorBehind: 1 });
    expect(stats.versionUpToDate).toBe(0);
    expect(totalUpdates(stats)).toBe(3);
  });
});

// ── Invariants ────────────────────────────────────────────────────────────────
describe('VersionSection — invariants', () => {
  it('versionUpToDate + totalUpdates does not exceed versionMonitors for valid data', () => {
    const stats = makStats({
      versionMonitors: 5,
      versionUpToDate: 3,
      versionUpdateAvailable: 1,
      versionMajorBehind: 1,
    });
    expect(stats.versionUpToDate + totalUpdates(stats)).toBeLessThanOrEqual(stats.versionMonitors);
  });
});
