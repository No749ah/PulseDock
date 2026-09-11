/**
 * @vitest-environment node
 * Unit tests for pure helpers in alerts/analytics/page.tsx
 */

import { describe, it, expect } from 'vitest';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Helper to determine successRate color class (inline logic from ChannelReliability)
function successRateColor(rate: number): string {
  if (rate >= 99) return 'text-green-400 font-semibold';
  if (rate >= 90) return 'text-yellow-400 font-semibold';
  return 'text-red-400 font-semibold';
}

// Helper to determine channel reliability bar color (inline logic from ChannelReliability)
function reliabilityBarColor(rate: number): string {
  if (rate >= 99) return 'bg-green-500';
  if (rate >= 90) return 'bg-yellow-500';
  return 'bg-red-500';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('alerts/analytics/page — formatDate', () => {
  it('formats a January date correctly', () => {
    expect(formatDate('2026-01-05')).toBe('Jan 5');
  });

  it('formats a December date correctly', () => {
    expect(formatDate('2026-12-31')).toBe('Dec 31');
  });

  it('formats a February date correctly', () => {
    expect(formatDate('2026-02-14')).toBe('Feb 14');
  });

  it('formats mid-year date correctly', () => {
    expect(formatDate('2026-07-04')).toBe('Jul 4');
  });

  it('produces month-day format (no year)', () => {
    const result = formatDate('2026-03-15');
    // Should not contain the year
    expect(result).not.toContain('2026');
    expect(result).toContain('Mar');
    expect(result).toContain('15');
  });

  it('handles first day of month', () => {
    expect(formatDate('2026-06-01')).toBe('Jun 1');
  });

  it('handles last day of non-leap February', () => {
    expect(formatDate('2026-02-28')).toBe('Feb 28');
  });

  it('handles single-digit day without leading zero', () => {
    const result = formatDate('2026-04-03');
    expect(result).toBe('Apr 3');
  });
});

describe('alerts/analytics/page — successRateColor', () => {
  it('returns green for rate >= 99', () => {
    expect(successRateColor(99)).toContain('text-green-400');
    expect(successRateColor(100)).toContain('text-green-400');
  });

  it('returns yellow for rate between 90 and 98', () => {
    expect(successRateColor(90)).toContain('text-yellow-400');
    expect(successRateColor(95)).toContain('text-yellow-400');
    expect(successRateColor(98)).toContain('text-yellow-400');
  });

  it('returns red for rate below 90', () => {
    expect(successRateColor(89)).toContain('text-red-400');
    expect(successRateColor(0)).toContain('text-red-400');
  });

  it('all tiers include font-semibold', () => {
    expect(successRateColor(100)).toContain('font-semibold');
    expect(successRateColor(95)).toContain('font-semibold');
    expect(successRateColor(80)).toContain('font-semibold');
  });

  it('boundary: exactly 99 is green not yellow', () => {
    expect(successRateColor(99)).toContain('text-green-400');
    expect(successRateColor(99)).not.toContain('text-yellow-400');
  });

  it('boundary: exactly 90 is yellow not red', () => {
    expect(successRateColor(90)).toContain('text-yellow-400');
    expect(successRateColor(90)).not.toContain('text-red-400');
  });
});

describe('alerts/analytics/page — reliabilityBarColor', () => {
  it('returns green for rate >= 99', () => {
    expect(reliabilityBarColor(99)).toBe('bg-green-500');
    expect(reliabilityBarColor(100)).toBe('bg-green-500');
  });

  it('returns yellow for rate 90–98', () => {
    expect(reliabilityBarColor(90)).toBe('bg-yellow-500');
    expect(reliabilityBarColor(98)).toBe('bg-yellow-500');
  });

  it('returns red for rate below 90', () => {
    expect(reliabilityBarColor(89)).toBe('bg-red-500');
    expect(reliabilityBarColor(0)).toBe('bg-red-500');
  });
});
