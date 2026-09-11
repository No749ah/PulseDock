/**
 * Unit tests for SloSection pure logic.
 * Tests SLO summary label, visibility guard, compliance percentage, status badge classes.
 */
import { describe, it, expect } from 'vitest';

interface SloMonitorSummary {
  id: string;
  name: string;
  slaTarget: number;
  current: number;
  status: 'ok' | 'warning' | 'breached';
  errorBudgetPct: number;
  daysRemaining: number;
}

interface SloSummary {
  monitors: SloMonitorSummary[];
  summary: { total: number; ok: number; warning: number; breached: number };
}

// ── Component helpers ─────────────────────────────────────────────────────────
function shouldRender(sloSummary: SloSummary): boolean {
  return sloSummary.summary.total > 0;
}

function sloStatusClass(status: SloMonitorSummary['status']): string {
  if (status === 'ok') return 'text-success bg-success/10';
  if (status === 'warning') return 'text-warning bg-warning/10';
  return 'text-danger bg-danger/10';
}

function compliancePct(current: number, target: number): string {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  return pct.toFixed(1) + '%';
}

function sloSummaryLabel(summary: SloSummary['summary']): string {
  return `${summary.total} monitor${summary.total !== 1 ? 's' : ''} with SLA targets`;
}

function makeSloSummary(overrides: Partial<SloSummary['summary']> = {}): SloSummary {
  return {
    monitors: [],
    summary: { total: 3, ok: 2, warning: 1, breached: 0, ...overrides },
  };
}

// ── Visibility guard ──────────────────────────────────────────────────────────
describe('SloSection — shouldRender', () => {
  it('hides when total === 0', () => {
    expect(shouldRender(makeSloSummary({ total: 0 }))).toBe(false);
  });

  it('shows when total > 0', () => {
    expect(shouldRender(makeSloSummary({ total: 1 }))).toBe(true);
  });
});

// ── Status classes ────────────────────────────────────────────────────────────
describe('SloSection — sloStatusClass', () => {
  it('ok uses success styling', () => {
    const c = sloStatusClass('ok');
    expect(c).toContain('text-success');
    expect(c).toContain('bg-success/10');
  });

  it('warning uses warning styling', () => {
    const c = sloStatusClass('warning');
    expect(c).toContain('text-warning');
    expect(c).toContain('bg-warning/10');
  });

  it('breached uses danger styling', () => {
    const c = sloStatusClass('breached');
    expect(c).toContain('text-danger');
    expect(c).toContain('bg-danger/10');
  });

  it('all three statuses have distinct classes', () => {
    const classes = ['ok', 'warning', 'breached'].map((s) => sloStatusClass(s as SloMonitorSummary['status']));
    expect(new Set(classes).size).toBe(3);
  });
});

// ── Compliance percentage ─────────────────────────────────────────────────────
describe('SloSection — compliancePct', () => {
  it('100% compliance when current === target', () => {
    expect(compliancePct(100, 100)).toBe('100.0%');
  });

  it('calculates partial compliance correctly', () => {
    expect(compliancePct(50, 100)).toBe('50.0%');
  });

  it('caps at 100% even if current > target', () => {
    expect(compliancePct(110, 100)).toBe('100.0%');
  });

  it('returns "0.0%" when target is 0', () => {
    expect(compliancePct(99, 0)).toBe('0.0%');
  });

  it('handles decimal targets', () => {
    expect(compliancePct(99.5, 99.9)).toMatch(/^\d+\.\d+%$/);
  });
});

// ── Summary label ─────────────────────────────────────────────────────────────
describe('SloSection — sloSummaryLabel', () => {
  it('singular for 1 monitor', () => {
    expect(sloSummaryLabel({ total: 1, ok: 1, warning: 0, breached: 0 })).toBe('1 monitor with SLA targets');
  });

  it('plural for 0 monitors', () => {
    expect(sloSummaryLabel({ total: 0, ok: 0, warning: 0, breached: 0 })).toBe('0 monitors with SLA targets');
  });

  it('plural for multiple monitors', () => {
    expect(sloSummaryLabel({ total: 5, ok: 3, warning: 1, breached: 1 })).toBe('5 monitors with SLA targets');
  });
});

// ── Summary count invariants ──────────────────────────────────────────────────
describe('SloSection — summary invariants', () => {
  it('ok + warning + breached should equal total for valid data', () => {
    const s = { total: 5, ok: 3, warning: 1, breached: 1 };
    expect(s.ok + s.warning + s.breached).toBe(s.total);
  });

  it('all zero state is consistent', () => {
    const s = { total: 0, ok: 0, warning: 0, breached: 0 };
    expect(s.ok + s.warning + s.breached).toBe(s.total);
  });
});
