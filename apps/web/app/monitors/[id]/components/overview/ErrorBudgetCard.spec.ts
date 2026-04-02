/**
 * Unit tests for ErrorBudgetCard pure logic.
 * Tests budget remaining color thresholds, latency budget status styling,
 * and budget progress bar calculations.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

type LatencyBudgetStatus = 'no-budget' | 'healthy' | 'warning' | 'exceeded';

function budgetRemainingColor(pct: number): string {
  if (pct > 30) return 'bg-green-500/15 text-green-400';
  if (pct > 10) return 'bg-yellow-500/15 text-yellow-400';
  return 'bg-red-500/15 text-red-400';
}

function latencyBudgetStatusColor(status: LatencyBudgetStatus): string {
  switch (status) {
    case 'healthy': return 'text-green-400';
    case 'warning': return 'text-yellow-400';
    case 'exceeded': return 'text-red-400';
    default: return 'text-text-muted';
  }
}

function latencyBudgetStatusLabel(status: LatencyBudgetStatus): string {
  switch (status) {
    case 'healthy': return 'Healthy';
    case 'warning': return 'Warning';
    case 'exceeded': return 'Exceeded';
    default: return 'No budget set';
  }
}

function budgetUsedPct(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.min((used / total) * 100, 100);
}

function budgetProgressBarColor(pct: number): string {
  if (pct <= 50) return 'bg-green-500';
  if (pct <= 80) return 'bg-yellow-500';
  return 'bg-red-500';
}

function hasSloTarget(slaTarget: number | null | undefined): boolean {
  return slaTarget != null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ErrorBudgetCard — budgetRemainingColor', () => {
  it('> 30% remaining → green (healthy)', () => {
    expect(budgetRemainingColor(100)).toContain('green');
    expect(budgetRemainingColor(31)).toContain('green');
  });

  it('11-30% remaining → yellow (at risk)', () => {
    expect(budgetRemainingColor(30)).toContain('yellow');
    expect(budgetRemainingColor(20)).toContain('yellow');
    expect(budgetRemainingColor(11)).toContain('yellow');
  });

  it('≤ 10% remaining → red (critical)', () => {
    expect(budgetRemainingColor(10)).toContain('red');
    expect(budgetRemainingColor(5)).toContain('red');
    expect(budgetRemainingColor(0)).toContain('red');
  });
});

describe('ErrorBudgetCard — latencyBudgetStatusColor', () => {
  it('healthy → green', () => expect(latencyBudgetStatusColor('healthy')).toContain('green'));
  it('warning → yellow', () => expect(latencyBudgetStatusColor('warning')).toContain('yellow'));
  it('exceeded → red', () => expect(latencyBudgetStatusColor('exceeded')).toContain('red'));
  it('no-budget → muted', () => expect(latencyBudgetStatusColor('no-budget')).toContain('muted'));
});

describe('ErrorBudgetCard — latencyBudgetStatusLabel', () => {
  it('healthy → "Healthy"', () => expect(latencyBudgetStatusLabel('healthy')).toBe('Healthy'));
  it('warning → "Warning"', () => expect(latencyBudgetStatusLabel('warning')).toBe('Warning'));
  it('exceeded → "Exceeded"', () => expect(latencyBudgetStatusLabel('exceeded')).toBe('Exceeded'));
  it('no-budget → "No budget set"', () => expect(latencyBudgetStatusLabel('no-budget')).toBe('No budget set'));
});

describe('ErrorBudgetCard — budgetUsedPct', () => {
  it('0 used → 0%', () => expect(budgetUsedPct(0, 100)).toBe(0));
  it('50 used of 100 → 50%', () => expect(budgetUsedPct(50, 100)).toBe(50));
  it('100 used of 100 → 100%', () => expect(budgetUsedPct(100, 100)).toBe(100));
  it('caps at 100% even if over-budget', () => expect(budgetUsedPct(150, 100)).toBe(100));
  it('handles zero total gracefully', () => expect(budgetUsedPct(0, 0)).toBe(0));
  it('partial usage is proportional', () => {
    expect(budgetUsedPct(25, 200)).toBe(12.5);
  });
});

describe('ErrorBudgetCard — budgetProgressBarColor', () => {
  it('0-50% used → green bar', () => {
    expect(budgetProgressBarColor(0)).toBe('bg-green-500');
    expect(budgetProgressBarColor(50)).toBe('bg-green-500');
  });

  it('51-80% used → yellow bar', () => {
    expect(budgetProgressBarColor(51)).toBe('bg-yellow-500');
    expect(budgetProgressBarColor(80)).toBe('bg-yellow-500');
  });

  it('> 80% used → red bar (nearly depleted)', () => {
    expect(budgetProgressBarColor(81)).toBe('bg-red-500');
    expect(budgetProgressBarColor(100)).toBe('bg-red-500');
  });
});

describe('ErrorBudgetCard — hasSloTarget', () => {
  it('returns true for a numeric SLA target', () => {
    expect(hasSloTarget(99.9)).toBe(true);
    expect(hasSloTarget(99)).toBe(true);
    expect(hasSloTarget(0)).toBe(true); // 0 is a valid (bad) target
  });

  it('returns false for null', () => {
    expect(hasSloTarget(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(hasSloTarget(undefined)).toBe(false);
  });
});

describe('ErrorBudgetCard — real-world scenarios', () => {
  it('99.9% SLA with 60% budget remaining → healthy', () => {
    const remainingPct = 60;
    expect(budgetRemainingColor(remainingPct)).toContain('green');
  });

  it('99.9% SLA with 8% budget remaining → critical red', () => {
    const remainingPct = 8;
    expect(budgetRemainingColor(remainingPct)).toContain('red');
  });

  it('exceeded latency budget shows red + "Exceeded"', () => {
    expect(latencyBudgetStatusColor('exceeded')).toContain('red');
    expect(latencyBudgetStatusLabel('exceeded')).toBe('Exceeded');
  });
});
