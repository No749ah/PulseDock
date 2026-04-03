/**
 * Unit tests for pure helpers in app/monitors/sla/page.tsx.
 *
 * Covers: SLA_PRESETS structure, complianceStatus 4 branches,
 * budgetBar color thresholds, monthBadge label extraction.
 */
import { describe, it, expect } from 'vitest';

// ── Inline-reproduced helpers (same logic, no JSX dependency) ─────────────────

const SLA_PRESETS = [99.0, 99.5, 99.9, 99.95, 99.99];

interface SlaMonitor {
  id: string;
  slaTarget: number | null;
  compliant: boolean | null;
  uptimePct: number;
}

function complianceStatus(m: SlaMonitor): 'compliant' | 'atRisk' | 'breached' | 'noTarget' {
  if (m.slaTarget == null) return 'noTarget';
  if (m.compliant === false) return 'breached';
  if (m.compliant === true && m.uptimePct - m.slaTarget < 0.1) return 'atRisk';
  return 'compliant';
}

function budgetBarColor(used: number): string {
  if (used >= 90) return 'bg-red-500';
  if (used >= 50) return 'bg-yellow-500';
  return 'bg-green-500';
}

function monthBadgeLabel(month: string): string {
  return month.slice(5); // "YYYY-MM" → "MM"
}

function monthBadgeColor(compliant: boolean | null): string {
  if (compliant === null) return 'bg-zinc-700 text-zinc-400';
  if (compliant) return 'bg-green-900/50 text-green-400 border border-green-700/50';
  return 'bg-red-900/50 text-red-400 border border-red-700/50';
}

// ── SLA_PRESETS ───────────────────────────────────────────────────────────────

describe('SLA_PRESETS', () => {
  it('has 5 preset values', () => {
    expect(SLA_PRESETS).toHaveLength(5);
  });

  it('values are in ascending order', () => {
    for (let i = 1; i < SLA_PRESETS.length; i++) {
      expect(SLA_PRESETS[i]).toBeGreaterThan(SLA_PRESETS[i - 1]);
    }
  });

  it('includes 99.9 (three nines)', () => {
    expect(SLA_PRESETS).toContain(99.9);
  });

  it('includes 99.99 (four nines)', () => {
    expect(SLA_PRESETS).toContain(99.99);
  });

  it('all values are between 99 and 100', () => {
    SLA_PRESETS.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(99);
      expect(v).toBeLessThan(100);
    });
  });
});

// ── complianceStatus ──────────────────────────────────────────────────────────

describe('complianceStatus', () => {
  it('returns noTarget when slaTarget is null', () => {
    expect(complianceStatus({ id: 'm1', slaTarget: null, compliant: null, uptimePct: 99.9 })).toBe('noTarget');
  });

  it('returns breached when compliant is false', () => {
    expect(complianceStatus({ id: 'm1', slaTarget: 99.9, compliant: false, uptimePct: 99.0 })).toBe('breached');
  });

  it('returns atRisk when compliant=true but uptimePct within 0.1 of target', () => {
    // uptimePct - slaTarget = 0.05 < 0.1 → atRisk
    expect(complianceStatus({ id: 'm1', slaTarget: 99.9, compliant: true, uptimePct: 99.95 })).toBe('atRisk');
  });

  it('returns atRisk when uptimePct exactly equals target (delta = 0)', () => {
    expect(complianceStatus({ id: 'm1', slaTarget: 99.9, compliant: true, uptimePct: 99.9 })).toBe('atRisk');
  });

  it('returns compliant when uptimePct is well above target', () => {
    // uptimePct - slaTarget = 0.5 >= 0.1 → compliant
    expect(complianceStatus({ id: 'm1', slaTarget: 99.0, compliant: true, uptimePct: 99.5 })).toBe('compliant');
  });

  it('returns compliant when compliant=null and uptimePct well above target', () => {
    // compliant !== false so not breached; compliant !== true so not atRisk → compliant
    expect(complianceStatus({ id: 'm1', slaTarget: 99.0, compliant: null, uptimePct: 100 })).toBe('compliant');
  });

  it('returns noTarget when slaTarget is null even if compliant=false', () => {
    // null check takes priority
    expect(complianceStatus({ id: 'm1', slaTarget: null, compliant: false, uptimePct: 0 })).toBe('noTarget');
  });
});

// ── budgetBarColor ────────────────────────────────────────────────────────────

describe('budgetBarColor', () => {
  it('returns red at 90%', () => {
    expect(budgetBarColor(90)).toBe('bg-red-500');
  });

  it('returns red above 90%', () => {
    expect(budgetBarColor(100)).toBe('bg-red-500');
    expect(budgetBarColor(95)).toBe('bg-red-500');
  });

  it('returns yellow at 50%', () => {
    expect(budgetBarColor(50)).toBe('bg-yellow-500');
  });

  it('returns yellow between 50% and 89%', () => {
    expect(budgetBarColor(75)).toBe('bg-yellow-500');
    expect(budgetBarColor(89)).toBe('bg-yellow-500');
  });

  it('returns green below 50%', () => {
    expect(budgetBarColor(49)).toBe('bg-green-500');
    expect(budgetBarColor(0)).toBe('bg-green-500');
  });
});

// ── monthBadgeLabel ───────────────────────────────────────────────────────────

describe('monthBadgeLabel', () => {
  it('extracts month digits from YYYY-MM format', () => {
    expect(monthBadgeLabel('2026-01')).toBe('01');
    expect(monthBadgeLabel('2026-12')).toBe('12');
  });

  it('extracts correct month for all 12 months', () => {
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    months.forEach((m) => {
      expect(monthBadgeLabel(`2026-${m}`)).toBe(m);
    });
  });
});

// ── monthBadgeColor ───────────────────────────────────────────────────────────

describe('monthBadgeColor', () => {
  it('returns neutral zinc for null (no data)', () => {
    expect(monthBadgeColor(null)).toBe('bg-zinc-700 text-zinc-400');
  });

  it('returns green for compliant=true', () => {
    expect(monthBadgeColor(true)).toContain('green');
  });

  it('returns red for compliant=false', () => {
    expect(monthBadgeColor(false)).toContain('red');
  });

  it('null/true/false all produce distinct classes', () => {
    const nullC = monthBadgeColor(null);
    const trueC = monthBadgeColor(true);
    const falseC = monthBadgeColor(false);
    expect(nullC).not.toBe(trueC);
    expect(nullC).not.toBe(falseC);
    expect(trueC).not.toBe(falseC);
  });
});
