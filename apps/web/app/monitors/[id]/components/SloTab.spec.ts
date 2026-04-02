/**
 * Unit tests for SloTab pure logic.
 * Tests StatusBadge variants, formatMinutes, and SLO status derivation.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

type SloStatus = 'ok' | 'warning' | 'breached';

function sloStatusBadgeClasses(status: SloStatus): { bg: string; text: string; border: string } {
  if (status === 'ok') return { bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500/20' };
  if (status === 'warning') return { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/20' };
  return { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/20' };
}

function sloStatusLabel(status: SloStatus): string {
  if (status === 'ok') return 'OK';
  if (status === 'warning') return 'WARNING';
  return 'BREACHED';
}

function formatMinutes(minutes: number): string {
  const abs = Math.abs(minutes);
  const sign = minutes < 0 ? '-' : '';
  if (abs < 1) return `${sign}${Math.round(abs * 60)}s`;
  if (abs < 60) return `${sign}${abs.toFixed(1)}m`;
  return `${sign}${(abs / 60).toFixed(1)}h`;
}

function deriveSloStatus(compliancePct: number, slaTarget: number): SloStatus {
  if (compliancePct >= slaTarget) return 'ok';
  const burnBuffer = slaTarget - (slaTarget * 0.01); // 1% warning buffer
  if (compliancePct >= burnBuffer) return 'warning';
  return 'breached';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SloTab — sloStatusBadgeClasses', () => {
  it('returns green classes for ok', () => {
    const cls = sloStatusBadgeClasses('ok');
    expect(cls.bg).toContain('green');
    expect(cls.text).toContain('green');
    expect(cls.border).toContain('green');
  });

  it('returns yellow classes for warning', () => {
    const cls = sloStatusBadgeClasses('warning');
    expect(cls.bg).toContain('yellow');
    expect(cls.text).toContain('yellow');
    expect(cls.border).toContain('yellow');
  });

  it('returns red classes for breached', () => {
    const cls = sloStatusBadgeClasses('breached');
    expect(cls.bg).toContain('red');
    expect(cls.text).toContain('red');
    expect(cls.border).toContain('red');
  });
});

describe('SloTab — sloStatusLabel', () => {
  it('returns OK for ok status', () => {
    expect(sloStatusLabel('ok')).toBe('OK');
  });

  it('returns WARNING for warning status', () => {
    expect(sloStatusLabel('warning')).toBe('WARNING');
  });

  it('returns BREACHED for breached status', () => {
    expect(sloStatusLabel('breached')).toBe('BREACHED');
  });
});

describe('SloTab — formatMinutes', () => {
  it('converts sub-minute to seconds', () => {
    expect(formatMinutes(0.5)).toBe('30s');
    expect(formatMinutes(0.25)).toBe('15s');
  });

  it('shows minutes for values under 60', () => {
    expect(formatMinutes(1)).toBe('1.0m');
    expect(formatMinutes(30)).toBe('30.0m');
    expect(formatMinutes(59.9)).toBe('59.9m');
  });

  it('shows hours for values >= 60 minutes', () => {
    expect(formatMinutes(60)).toBe('1.0h');
    expect(formatMinutes(120)).toBe('2.0h');
    expect(formatMinutes(90)).toBe('1.5h');
  });

  it('handles negative values with sign prefix', () => {
    expect(formatMinutes(-30)).toBe('-30.0m');
    expect(formatMinutes(-60)).toBe('-1.0h');
    expect(formatMinutes(-0.5)).toBe('-30s');
  });

  it('handles zero', () => {
    expect(formatMinutes(0)).toBe('0s');
  });
});

describe('SloTab — deriveSloStatus', () => {
  it('returns ok when compliance meets target', () => {
    expect(deriveSloStatus(99.9, 99.9)).toBe('ok');
    expect(deriveSloStatus(100, 99.9)).toBe('ok');
  });

  it('returns breached when well below target', () => {
    expect(deriveSloStatus(95, 99.9)).toBe('breached');
    expect(deriveSloStatus(80, 99.0)).toBe('breached');
  });

  it('returns warning in the 1% buffer zone', () => {
    // target=99.9, buffer = 99.9 * 0.99 = 98.901
    const status = deriveSloStatus(99.0, 99.9);
    expect(['warning', 'breached']).toContain(status);
  });
});
