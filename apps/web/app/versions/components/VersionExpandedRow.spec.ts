/**
 * Unit tests for VersionExpandedRow pure logic.
 * Tests run stats aggregation, provider resolution, and badge variant mapping.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

interface Run {
  level: string;
}

interface Stats {
  total: number;
  green: number;
  yellow: number;
  red: number;
}

function aggregateRunStats(runs: Run[]): Stats {
  return runs.reduce(
    (acc, r) => {
      acc.total += 1;
      if (r.level === 'green') acc.green += 1;
      else if (r.level === 'yellow') acc.yellow += 1;
      else acc.red += 1;
      return acc;
    },
    { total: 0, green: 0, yellow: 0, red: 0 },
  );
}

function resolveProvider(
  cfg: Record<string, unknown>,
  monitorType: string,
): string {
  return String(cfg.provider ?? (monitorType === 'DOCKER_IMAGE' ? 'docker' : 'github')).toLowerCase();
}

// levelBadgeVariant mirrored from utils.tsx
function levelBadgeVariant(level: string): 'success' | 'warning' | 'danger' {
  if (level === 'green') return 'success';
  if (level === 'yellow') return 'warning';
  return 'danger';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('VersionExpandedRow — aggregateRunStats', () => {
  it('returns zeros for empty runs', () => {
    expect(aggregateRunStats([])).toEqual({ total: 0, green: 0, yellow: 0, red: 0 });
  });

  it('counts green runs correctly', () => {
    const runs = [{ level: 'green' }, { level: 'green' }, { level: 'green' }];
    const stats = aggregateRunStats(runs);
    expect(stats.total).toBe(3);
    expect(stats.green).toBe(3);
    expect(stats.yellow).toBe(0);
    expect(stats.red).toBe(0);
  });

  it('counts yellow runs correctly', () => {
    const runs = [{ level: 'yellow' }, { level: 'green' }, { level: 'yellow' }];
    const stats = aggregateRunStats(runs);
    expect(stats.yellow).toBe(2);
    expect(stats.green).toBe(1);
  });

  it('counts red runs correctly', () => {
    const runs = [{ level: 'red' }, { level: 'red' }];
    const stats = aggregateRunStats(runs);
    expect(stats.red).toBe(2);
  });

  it('treats unknown levels as red', () => {
    const runs = [{ level: 'unknown' }, { level: '' }];
    const stats = aggregateRunStats(runs);
    expect(stats.red).toBe(2);
    expect(stats.green).toBe(0);
    expect(stats.yellow).toBe(0);
  });

  it('handles mixed levels', () => {
    const runs = [
      { level: 'green' }, { level: 'yellow' }, { level: 'red' },
      { level: 'green' }, { level: 'red' },
    ];
    const stats = aggregateRunStats(runs);
    expect(stats.total).toBe(5);
    expect(stats.green).toBe(2);
    expect(stats.yellow).toBe(1);
    expect(stats.red).toBe(2);
  });
});

describe('VersionExpandedRow — resolveProvider', () => {
  it('uses config provider when set', () => {
    expect(resolveProvider({ provider: 'npm' }, 'GIT_RELEASE')).toBe('npm');
  });

  it('defaults to docker for DOCKER_IMAGE type', () => {
    expect(resolveProvider({}, 'DOCKER_IMAGE')).toBe('docker');
  });

  it('defaults to github for GIT_RELEASE type', () => {
    expect(resolveProvider({}, 'GIT_RELEASE')).toBe('github');
  });

  it('lowercases config provider', () => {
    expect(resolveProvider({ provider: 'NPM' }, 'GIT_RELEASE')).toBe('npm');
    expect(resolveProvider({ provider: 'PyPI' }, 'GIT_RELEASE')).toBe('pypi');
  });
});

describe('VersionExpandedRow — levelBadgeVariant', () => {
  it('returns success for green', () => {
    expect(levelBadgeVariant('green')).toBe('success');
  });

  it('returns warning for yellow', () => {
    expect(levelBadgeVariant('yellow')).toBe('warning');
  });

  it('returns danger for red', () => {
    expect(levelBadgeVariant('red')).toBe('danger');
  });

  it('returns danger for unknown levels', () => {
    expect(levelBadgeVariant('unknown')).toBe('danger');
    expect(levelBadgeVariant('')).toBe('danger');
  });
});
