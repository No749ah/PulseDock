/**
 * Unit tests for SecurityTab pure logic.
 * Tests gradeColor, gradeBg, severityBadge, and score classification.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

function gradeColor(g: string): string {
  if (g === 'A') return 'text-success';
  if (g === 'B') return 'text-emerald-400';
  if (g === 'C') return 'text-yellow-400';
  if (g === 'D') return 'text-orange-400';
  return 'text-danger';
}

function gradeBg(g: string): string {
  if (g === 'A') return 'bg-success/10 border-success/30';
  if (g === 'B') return 'bg-emerald-400/10 border-emerald-400/30';
  if (g === 'C') return 'bg-yellow-400/10 border-yellow-400/30';
  if (g === 'D') return 'bg-orange-400/10 border-orange-400/30';
  return 'bg-danger/10 border-danger/30';
}

function severityBadge(s: string): string {
  if (s === 'critical') return 'bg-danger/10 text-danger border border-danger/20';
  if (s === 'warning') return 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20';
  return 'bg-white/5 text-text-muted border border-white/10';
}

function scoreBarColor(score: number): string {
  if (score >= 75) return 'bg-success';
  if (score >= 55) return 'bg-yellow-400';
  return 'bg-danger';
}

function findAuditRun<T extends { securityAuditJson?: unknown }>(runs: T[]): T | undefined {
  return runs.find((r) => r.securityAuditJson);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SecurityTab — gradeColor', () => {
  it('returns success for A grade', () => {
    expect(gradeColor('A')).toBe('text-success');
  });

  it('returns emerald for B grade', () => {
    expect(gradeColor('B')).toBe('text-emerald-400');
  });

  it('returns yellow for C grade', () => {
    expect(gradeColor('C')).toBe('text-yellow-400');
  });

  it('returns orange for D grade', () => {
    expect(gradeColor('D')).toBe('text-orange-400');
  });

  it('returns danger for F grade', () => {
    expect(gradeColor('F')).toBe('text-danger');
  });

  it('returns danger for unknown grade', () => {
    expect(gradeColor('X')).toBe('text-danger');
    expect(gradeColor('')).toBe('text-danger');
  });
});

describe('SecurityTab — gradeBg', () => {
  it('returns success bg for A', () => {
    const bg = gradeBg('A');
    expect(bg).toContain('success');
  });

  it('returns emerald bg for B', () => {
    const bg = gradeBg('B');
    expect(bg).toContain('emerald');
  });

  it('returns yellow bg for C', () => {
    const bg = gradeBg('C');
    expect(bg).toContain('yellow');
  });

  it('returns orange bg for D', () => {
    const bg = gradeBg('D');
    expect(bg).toContain('orange');
  });

  it('returns danger bg for F and unknown', () => {
    expect(gradeBg('F')).toContain('danger');
    expect(gradeBg('')).toContain('danger');
  });
});

describe('SecurityTab — severityBadge', () => {
  it('returns danger classes for critical severity', () => {
    const cls = severityBadge('critical');
    expect(cls).toContain('danger');
  });

  it('returns yellow classes for warning severity', () => {
    const cls = severityBadge('warning');
    expect(cls).toContain('yellow');
  });

  it('returns muted classes for info or unknown severity', () => {
    const cls = severityBadge('info');
    expect(cls).toContain('text-muted');
    const clsUnknown = severityBadge('');
    expect(clsUnknown).toContain('text-muted');
  });
});

describe('SecurityTab — scoreBarColor', () => {
  it('returns success for scores >= 75', () => {
    expect(scoreBarColor(75)).toBe('bg-success');
    expect(scoreBarColor(100)).toBe('bg-success');
    expect(scoreBarColor(90)).toBe('bg-success');
  });

  it('returns yellow for scores between 55 and 74', () => {
    expect(scoreBarColor(55)).toBe('bg-yellow-400');
    expect(scoreBarColor(74)).toBe('bg-yellow-400');
    expect(scoreBarColor(65)).toBe('bg-yellow-400');
  });

  it('returns danger for scores below 55', () => {
    expect(scoreBarColor(54)).toBe('bg-danger');
    expect(scoreBarColor(0)).toBe('bg-danger');
    expect(scoreBarColor(30)).toBe('bg-danger');
  });
});

describe('SecurityTab — findAuditRun', () => {
  it('returns first run with audit data', () => {
    const runs = [
      { checkedAt: '2026-01-01', securityAuditJson: null },
      { checkedAt: '2026-01-02', securityAuditJson: { grade: 'A', score: 90, headers: [] } },
      { checkedAt: '2026-01-03', securityAuditJson: { grade: 'B', score: 80, headers: [] } },
    ];
    const run = findAuditRun(runs);
    expect(run?.checkedAt).toBe('2026-01-02');
  });

  it('returns undefined when no audit data exists', () => {
    const runs = [
      { checkedAt: '2026-01-01', securityAuditJson: null },
      { checkedAt: '2026-01-02' },
    ];
    expect(findAuditRun(runs)).toBeUndefined();
  });

  it('returns undefined for empty runs', () => {
    expect(findAuditRun([])).toBeUndefined();
  });
});
