/**
 * Unit tests for GeoTab pure logic.
 * Tests latency color thresholds, region availability calculations, and period validation.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

interface GeoRegionStat {
  region: string;
  totalRuns: number;
  okRuns: number;
  uptimePct: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
}

type GeoPeriod = 1 | 7 | 30;
const VALID_GEO_PERIODS: GeoPeriod[] = [1, 7, 30];

function latencyColor(ms: number | null): string {
  if (ms === null) return 'text-text-muted';
  if (ms < 200) return 'text-success';
  if (ms < 500) return 'text-warning';
  return 'text-danger';
}

function isGeoPeriodValid(p: number): p is GeoPeriod {
  return (VALID_GEO_PERIODS as number[]).includes(p);
}

function hasGeoData(stats: { regions: GeoRegionStat[]; hasGeoData: boolean } | null): boolean {
  if (!stats) return false;
  return stats.hasGeoData && stats.regions.length > 0;
}

function regionUptimeColor(pct: number): string {
  if (pct >= 99) return 'text-success';
  if (pct >= 95) return 'text-warning';
  return 'text-danger';
}

function sortRegionsByLatency(regions: GeoRegionStat[]): GeoRegionStat[] {
  return [...regions].sort((a, b) => {
    if (a.avgLatencyMs === null) return 1;
    if (b.avgLatencyMs === null) return -1;
    return a.avgLatencyMs - b.avgLatencyMs;
  });
}

function regionLabel(region: string): string {
  return region.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRegion(region: string, avgLatencyMs: number | null, uptimePct = 99.9): GeoRegionStat {
  return {
    region,
    totalRuns: 100,
    okRuns: Math.round(uptimePct),
    uptimePct,
    avgLatencyMs,
    p95LatencyMs: avgLatencyMs ? avgLatencyMs * 1.5 : null,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GeoTab — latencyColor', () => {
  it('null latency → text-text-muted (no data)', () => {
    expect(latencyColor(null)).toBe('text-text-muted');
  });

  it('< 200ms → text-success (fast)', () => {
    expect(latencyColor(0)).toBe('text-success');
    expect(latencyColor(100)).toBe('text-success');
    expect(latencyColor(199)).toBe('text-success');
  });

  it('200-499ms → text-warning (moderate)', () => {
    expect(latencyColor(200)).toBe('text-warning');
    expect(latencyColor(350)).toBe('text-warning');
    expect(latencyColor(499)).toBe('text-warning');
  });

  it('≥ 500ms → text-danger (slow)', () => {
    expect(latencyColor(500)).toBe('text-danger');
    expect(latencyColor(1000)).toBe('text-danger');
    expect(latencyColor(5000)).toBe('text-danger');
  });
});

describe('GeoTab — isGeoPeriodValid', () => {
  it('accepts 1d, 7d, 30d', () => {
    expect(isGeoPeriodValid(1)).toBe(true);
    expect(isGeoPeriodValid(7)).toBe(true);
    expect(isGeoPeriodValid(30)).toBe(true);
  });

  it('rejects other values', () => {
    expect(isGeoPeriodValid(0)).toBe(false);
    expect(isGeoPeriodValid(14)).toBe(false);
    expect(isGeoPeriodValid(90)).toBe(false);
  });
});

describe('GeoTab — hasGeoData', () => {
  it('returns false for null stats', () => {
    expect(hasGeoData(null)).toBe(false);
  });

  it('returns false when hasGeoData flag is false', () => {
    expect(hasGeoData({ regions: [], hasGeoData: false })).toBe(false);
  });

  it('returns false when regions array is empty', () => {
    expect(hasGeoData({ regions: [], hasGeoData: true })).toBe(false);
  });

  it('returns true when flag is true and regions exist', () => {
    const stats = { regions: [makeRegion('us-east', 150)], hasGeoData: true };
    expect(hasGeoData(stats)).toBe(true);
  });
});

describe('GeoTab — regionUptimeColor', () => {
  it('≥ 99% → text-success', () => {
    expect(regionUptimeColor(100)).toBe('text-success');
    expect(regionUptimeColor(99)).toBe('text-success');
    expect(regionUptimeColor(99.9)).toBe('text-success');
  });

  it('95-98.9% → text-warning', () => {
    expect(regionUptimeColor(98)).toBe('text-warning');
    expect(regionUptimeColor(95)).toBe('text-warning');
  });

  it('< 95% → text-danger', () => {
    expect(regionUptimeColor(94)).toBe('text-danger');
    expect(regionUptimeColor(80)).toBe('text-danger');
    expect(regionUptimeColor(0)).toBe('text-danger');
  });
});

describe('GeoTab — sortRegionsByLatency', () => {
  it('sorts by avgLatencyMs ascending', () => {
    const regions = [
      makeRegion('eu-west', 300),
      makeRegion('us-east', 150),
      makeRegion('ap-south', 450),
    ];
    const sorted = sortRegionsByLatency(regions);
    expect(sorted[0].region).toBe('us-east');
    expect(sorted[1].region).toBe('eu-west');
    expect(sorted[2].region).toBe('ap-south');
  });

  it('puts null-latency regions at the end', () => {
    const regions = [
      makeRegion('us-east', null),
      makeRegion('eu-west', 200),
    ];
    const sorted = sortRegionsByLatency(regions);
    expect(sorted[0].region).toBe('eu-west');
    expect(sorted[1].region).toBe('us-east');
  });

  it('handles multiple null-latency regions', () => {
    const regions = [makeRegion('a', null), makeRegion('b', null)];
    const sorted = sortRegionsByLatency(regions);
    expect(sorted).toHaveLength(2);
  });

  it('does not mutate original array', () => {
    const regions = [makeRegion('a', 300), makeRegion('b', 100)];
    sortRegionsByLatency(regions);
    expect(regions[0].region).toBe('a'); // unchanged
  });
});

describe('GeoTab — regionLabel', () => {
  it('converts kebab-case to Title Case', () => {
    expect(regionLabel('us-east')).toBe('Us East');
    expect(regionLabel('eu-central-1')).toBe('Eu Central 1');
    expect(regionLabel('ap-south-east')).toBe('Ap South East');
  });

  it('handles single-word region', () => {
    expect(regionLabel('global')).toBe('Global');
  });
});
