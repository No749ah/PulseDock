import { describe, it, expect } from 'vitest';

// ── Inline helpers (mirrored from slaWidgetHelpers.ts) ─────────────────────

function formatMinutes(min: number): string {
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function computeBudgetUsed(
  allowedDownMin: number | null,
  remainingDownMin: number | null,
): number | null {
  if (allowedDownMin === null || remainingDownMin === null || allowedDownMin <= 0) return null;
  return Math.min(100, Math.round(((allowedDownMin - remainingDownMin) / allowedDownMin) * 100));
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('formatMinutes', () => {
  it('returns seconds for < 1 minute', () => {
    expect(formatMinutes(0.5)).toBe('30s');
  });

  it('returns 0s for 0 minutes', () => {
    expect(formatMinutes(0)).toBe('0s');
  });

  it('returns seconds rounded for fractional minute', () => {
    expect(formatMinutes(0.75)).toBe('45s');
  });

  it('returns minutes for 1-59', () => {
    expect(formatMinutes(1)).toBe('1m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(59)).toBe('59m');
  });

  it('returns hours only when no remainder', () => {
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(120)).toBe('2h');
  });

  it('returns hours and minutes when remainder > 0', () => {
    expect(formatMinutes(90)).toBe('1h 30m');
    expect(formatMinutes(150)).toBe('2h 30m');
  });

  it('handles large values', () => {
    expect(formatMinutes(1440)).toBe('24h');
    expect(formatMinutes(1441)).toBe('24h 1m');
  });
});

describe('computeBudgetUsed', () => {
  it('returns null when allowedDownMin is null', () => {
    expect(computeBudgetUsed(null, 10)).toBeNull();
  });

  it('returns null when remainingDownMin is null', () => {
    expect(computeBudgetUsed(60, null)).toBeNull();
  });

  it('returns null when both are null', () => {
    expect(computeBudgetUsed(null, null)).toBeNull();
  });

  it('returns null when allowedDownMin is 0', () => {
    expect(computeBudgetUsed(0, 0)).toBeNull();
  });

  it('returns null when allowedDownMin is negative', () => {
    expect(computeBudgetUsed(-5, 10)).toBeNull();
  });

  it('returns 0 when no budget used (remaining == allowed)', () => {
    expect(computeBudgetUsed(60, 60)).toBe(0);
  });

  it('returns 50 when half budget used', () => {
    expect(computeBudgetUsed(60, 30)).toBe(50);
  });

  it('returns 100 when full budget used', () => {
    expect(computeBudgetUsed(60, 0)).toBe(100);
  });

  it('caps at 100 even when over budget', () => {
    expect(computeBudgetUsed(60, -30)).toBe(100);
  });

  it('rounds to nearest integer', () => {
    // 20/60 = 33.33...% → 33
    expect(computeBudgetUsed(60, 40)).toBe(33);
  });
});
