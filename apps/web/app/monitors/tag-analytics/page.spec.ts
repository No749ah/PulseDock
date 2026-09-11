import { describe, it, expect } from 'vitest';

// ─── Extracted pure helpers from monitors/tag-analytics/page.tsx ─────────────

type HealthStatus = 'healthy' | 'degraded' | 'critical';

function healthColor(health: HealthStatus): string {
  if (health === 'healthy') return 'text-emerald-400';
  if (health === 'degraded') return 'text-yellow-400';
  return 'text-red-400';
}

function healthBg(health: HealthStatus): string {
  if (health === 'healthy') return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
  if (health === 'degraded') return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400';
  return 'bg-red-500/10 border-red-500/20 text-red-400';
}

function uptimeColor(pct: number): string {
  if (pct > 99) return 'text-emerald-400';
  if (pct >= 95) return 'text-yellow-400';
  return 'text-red-400';
}

function formatLatency(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('monitors/tag-analytics/page — healthColor', () => {
  it('returns text-emerald-400 for healthy', () => {
    expect(healthColor('healthy')).toBe('text-emerald-400');
  });

  it('returns text-yellow-400 for degraded', () => {
    expect(healthColor('degraded')).toBe('text-yellow-400');
  });

  it('returns text-red-400 for critical', () => {
    expect(healthColor('critical')).toBe('text-red-400');
  });
});

describe('monitors/tag-analytics/page — healthBg', () => {
  it('returns emerald classes for healthy', () => {
    const result = healthBg('healthy');
    expect(result).toContain('bg-emerald-500/10');
    expect(result).toContain('border-emerald-500/20');
    expect(result).toContain('text-emerald-400');
  });

  it('returns yellow classes for degraded', () => {
    const result = healthBg('degraded');
    expect(result).toContain('bg-yellow-500/10');
    expect(result).toContain('border-yellow-500/20');
    expect(result).toContain('text-yellow-400');
  });

  it('returns red classes for critical', () => {
    const result = healthBg('critical');
    expect(result).toContain('bg-red-500/10');
    expect(result).toContain('border-red-500/20');
    expect(result).toContain('text-red-400');
  });
});

describe('monitors/tag-analytics/page — uptimeColor', () => {
  it('returns text-emerald-400 above 99 (99.1)', () => {
    expect(uptimeColor(99.1)).toBe('text-emerald-400');
  });

  it('returns text-emerald-400 at 100', () => {
    expect(uptimeColor(100)).toBe('text-emerald-400');
  });

  it('returns text-yellow-400 at exactly 99 (boundary, not > 99)', () => {
    expect(uptimeColor(99)).toBe('text-yellow-400');
  });

  it('returns text-yellow-400 at 95', () => {
    expect(uptimeColor(95)).toBe('text-yellow-400');
  });

  it('returns text-yellow-400 at 98', () => {
    expect(uptimeColor(98)).toBe('text-yellow-400');
  });

  it('returns text-red-400 below 95 (94.9)', () => {
    expect(uptimeColor(94.9)).toBe('text-red-400');
  });

  it('returns text-red-400 at 0', () => {
    expect(uptimeColor(0)).toBe('text-red-400');
  });
});

describe('monitors/tag-analytics/page — formatLatency', () => {
  it('returns em dash for null', () => {
    expect(formatLatency(null)).toBe('—');
  });

  it('formats 0ms correctly', () => {
    expect(formatLatency(0)).toBe('0ms');
  });

  it('formats 500ms correctly', () => {
    expect(formatLatency(500)).toBe('500ms');
  });

  it('formats 999ms correctly (boundary before seconds)', () => {
    expect(formatLatency(999)).toBe('999ms');
  });

  it('formats 1000ms as 1.0s', () => {
    expect(formatLatency(1000)).toBe('1.0s');
  });

  it('formats 1500ms as 1.5s', () => {
    expect(formatLatency(1500)).toBe('1.5s');
  });

  it('formats 2000ms as 2.0s', () => {
    expect(formatLatency(2000)).toBe('2.0s');
  });

  it('formats 3333ms as 3.3s (1 decimal)', () => {
    expect(formatLatency(3333)).toBe('3.3s');
  });
});
