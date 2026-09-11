/**
 * Unit tests for PerformanceTab pure logic.
 * Tests latency bucket bar colors, percentile colors, delta colors, response size bar colors,
 * and status transition dot colors.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

function latencyBucketBarColor(to: number): string {
  // to === -1 means "≥ some threshold" (last open-ended bucket)
  if (to !== -1 && to <= 200) return 'bg-green-500';
  if (to !== -1 && to <= 500) return 'bg-yellow-500';
  if (to !== -1 && to <= 1000) return 'bg-orange-500';
  return 'bg-red-500';
}

function percentileColor(val: number | null): string {
  if (val === null) return 'text-text-muted';
  if (val < 200) return 'text-green-400';
  if (val < 500) return 'text-yellow-400';
  return 'text-red-400';
}

function deltaColor(delta: number | null, higher: boolean): string {
  if (delta === null) return 'text-text-muted';
  const improved = higher ? delta > 0 : delta < 0;
  const degraded = higher ? delta < 0 : delta > 0;
  if (improved) return 'text-green-400';
  if (degraded) return 'text-red-400';
  return 'text-text-muted';
}

function deltaPrefix(delta: number | null): string {
  return delta !== null && delta > 0 ? '+' : '';
}

function responseSizeBarColor(devPct: number, isLatest: boolean): string {
  if (devPct > 60) return 'bg-danger';
  if (devPct > 30) return 'bg-warning';
  if (isLatest) return 'bg-accent';
  return 'bg-accent/40';
}

function transitionDotColor(to: string): string {
  if (to === 'green') return 'bg-success';
  if (to === 'yellow') return 'bg-warning';
  return 'bg-danger';
}

function transitionTextColor(to: string): string {
  if (to === 'green') return 'text-success';
  if (to === 'yellow') return 'text-warning';
  return 'text-danger';
}

function bucketWidthPct(count: number, maxCount: number): number {
  if (maxCount === 0) return 0;
  return (count / maxCount) * 100;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / (1024 * 1024)).toFixed(1)}MB`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PerformanceTab — latencyBucketBarColor', () => {
  it('to ≤ 200 → green-500 (fast)', () => {
    expect(latencyBucketBarColor(100)).toBe('bg-green-500');
    expect(latencyBucketBarColor(200)).toBe('bg-green-500');
  });

  it('201-500 → yellow-500 (moderate)', () => {
    expect(latencyBucketBarColor(201)).toBe('bg-yellow-500');
    expect(latencyBucketBarColor(500)).toBe('bg-yellow-500');
  });

  it('501-1000 → orange-500 (slow)', () => {
    expect(latencyBucketBarColor(501)).toBe('bg-orange-500');
    expect(latencyBucketBarColor(1000)).toBe('bg-orange-500');
  });

  it('> 1000 → red-500 (very slow)', () => {
    expect(latencyBucketBarColor(1001)).toBe('bg-red-500');
    expect(latencyBucketBarColor(5000)).toBe('bg-red-500');
  });

  it('to = -1 (open-ended bucket) → red-500', () => {
    expect(latencyBucketBarColor(-1)).toBe('bg-red-500');
  });
});

describe('PerformanceTab — percentileColor', () => {
  it('null → text-text-muted (no data)', () => {
    expect(percentileColor(null)).toBe('text-text-muted');
  });

  it('< 200ms → green-400 (fast)', () => {
    expect(percentileColor(0)).toBe('text-green-400');
    expect(percentileColor(199)).toBe('text-green-400');
  });

  it('200-499ms → yellow-400 (moderate)', () => {
    expect(percentileColor(200)).toBe('text-yellow-400');
    expect(percentileColor(499)).toBe('text-yellow-400');
  });

  it('≥ 500ms → red-400 (slow)', () => {
    expect(percentileColor(500)).toBe('text-red-400');
    expect(percentileColor(2000)).toBe('text-red-400');
  });
});

describe('PerformanceTab — deltaColor', () => {
  it('null delta → muted', () => {
    expect(deltaColor(null, true)).toBe('text-text-muted');
    expect(deltaColor(null, false)).toBe('text-text-muted');
  });

  it('0 delta → muted (no change)', () => {
    expect(deltaColor(0, true)).toBe('text-text-muted');
    expect(deltaColor(0, false)).toBe('text-text-muted');
  });

  it('positive delta, higher=true → green (improvement)', () => {
    // e.g. uptime: more is better, positive delta = improved
    expect(deltaColor(5, true)).toBe('text-green-400');
  });

  it('negative delta, higher=true → red (degradation)', () => {
    expect(deltaColor(-5, true)).toBe('text-red-400');
  });

  it('negative delta, higher=false → green (improvement)', () => {
    // e.g. latency: less is better, negative delta = improved
    expect(deltaColor(-50, false)).toBe('text-green-400');
  });

  it('positive delta, higher=false → red (degradation)', () => {
    expect(deltaColor(50, false)).toBe('text-red-400');
  });
});

describe('PerformanceTab — deltaPrefix', () => {
  it('positive delta → "+"', () => expect(deltaPrefix(5)).toBe('+'));
  it('zero delta → "" (no prefix)', () => expect(deltaPrefix(0)).toBe(''));
  it('negative delta → "" (no prefix, minus is in the number itself)', () => expect(deltaPrefix(-5)).toBe(''));
  it('null delta → ""', () => expect(deltaPrefix(null)).toBe(''));
});

describe('PerformanceTab — responseSizeBarColor', () => {
  it('deviation > 60% → danger (anomalous size)', () => {
    expect(responseSizeBarColor(61, false)).toBe('bg-danger');
    expect(responseSizeBarColor(100, false)).toBe('bg-danger');
  });

  it('deviation 31-60% → warning', () => {
    expect(responseSizeBarColor(31, false)).toBe('bg-warning');
    expect(responseSizeBarColor(60, false)).toBe('bg-warning');
  });

  it('deviation ≤ 30%, latest → accent (highlighted)', () => {
    expect(responseSizeBarColor(20, true)).toBe('bg-accent');
  });

  it('deviation ≤ 30%, not latest → accent/40 (subdued)', () => {
    expect(responseSizeBarColor(20, false)).toBe('bg-accent/40');
  });
});

describe('PerformanceTab — transitionDotColor', () => {
  it('green → bg-success', () => expect(transitionDotColor('green')).toBe('bg-success'));
  it('yellow → bg-warning', () => expect(transitionDotColor('yellow')).toBe('bg-warning'));
  it('red → bg-danger', () => expect(transitionDotColor('red')).toBe('bg-danger'));
  it('unknown status → bg-danger (default degraded)', () => expect(transitionDotColor('unknown')).toBe('bg-danger'));
});

describe('PerformanceTab — transitionTextColor', () => {
  it('green → text-success', () => expect(transitionTextColor('green')).toBe('text-success'));
  it('yellow → text-warning', () => expect(transitionTextColor('yellow')).toBe('text-warning'));
  it('red → text-danger', () => expect(transitionTextColor('red')).toBe('text-danger'));
});

describe('PerformanceTab — bucketWidthPct', () => {
  it('returns 0 for zero maxCount', () => expect(bucketWidthPct(5, 0)).toBe(0));
  it('100% when count equals max', () => expect(bucketWidthPct(10, 10)).toBe(100));
  it('50% when count is half of max', () => expect(bucketWidthPct(5, 10)).toBe(50));
  it('0% for count of 0', () => expect(bucketWidthPct(0, 10)).toBe(0));
});

describe('PerformanceTab — formatBytes', () => {
  it('< 1KB → bytes', () => {
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(1)).toBe('1B');
  });

  it('1KB-1MB → KB with 1 decimal', () => {
    expect(formatBytes(1024)).toBe('1.0KB');
    expect(formatBytes(2048)).toBe('2.0KB');
    expect(formatBytes(1536)).toBe('1.5KB');
  });

  it('≥ 1MB → MB with 1 decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0MB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0MB');
  });
});
