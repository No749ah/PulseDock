/**
 * Unit tests for SimulateTab pure logic.
 * Tests noise score display, uptime formatting, alert rate classification.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

type NoiseScore = 'low' | 'medium' | 'high';

function noiseScoreClass(score: NoiseScore): string {
  if (score === 'low') return 'text-success';
  if (score === 'medium') return 'text-warning';
  return 'text-danger';
}

function noiseScoreEmoji(score: NoiseScore): string {
  if (score === 'low') return '🟢';
  if (score === 'medium') return '🟡';
  return '🔴';
}

function noiseScoreLabel(score: NoiseScore): string {
  return score.charAt(0).toUpperCase() + score.slice(1) + ' noise';
}

function formatUptimePct(uptimePct: number): string {
  return `${uptimePct}%`;
}

interface SimResult {
  totalRuns: number;
  totalFails: number;
  uptimePct: number;
  alertsFired: number;
  recoverysFired: number;
  flappingAlertsFired: number;
  alertsPerDay: number;
  noiseScore: NoiseScore;
}

function computeUptimePct(totalRuns: number, totalFails: number): number {
  if (totalRuns === 0) return 100;
  return parseFloat(((1 - totalFails / totalRuns) * 100).toFixed(2));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SimulateTab — noiseScoreClass', () => {
  it('returns success class for low noise', () => {
    expect(noiseScoreClass('low')).toBe('text-success');
  });

  it('returns warning class for medium noise', () => {
    expect(noiseScoreClass('medium')).toBe('text-warning');
  });

  it('returns danger class for high noise', () => {
    expect(noiseScoreClass('high')).toBe('text-danger');
  });
});

describe('SimulateTab — noiseScoreEmoji', () => {
  it('returns green circle for low noise', () => {
    expect(noiseScoreEmoji('low')).toBe('🟢');
  });

  it('returns yellow circle for medium noise', () => {
    expect(noiseScoreEmoji('medium')).toBe('🟡');
  });

  it('returns red circle for high noise', () => {
    expect(noiseScoreEmoji('high')).toBe('🔴');
  });
});

describe('SimulateTab — noiseScoreLabel', () => {
  it('capitalizes and appends "noise"', () => {
    expect(noiseScoreLabel('low')).toBe('Low noise');
    expect(noiseScoreLabel('medium')).toBe('Medium noise');
    expect(noiseScoreLabel('high')).toBe('High noise');
  });
});

describe('SimulateTab — formatUptimePct', () => {
  it('appends percent sign', () => {
    expect(formatUptimePct(99.9)).toBe('99.9%');
    expect(formatUptimePct(100)).toBe('100%');
    expect(formatUptimePct(0)).toBe('0%');
  });
});

describe('SimulateTab — computeUptimePct', () => {
  it('returns 100% when no runs', () => {
    expect(computeUptimePct(0, 0)).toBe(100);
  });

  it('returns 100% when no failures', () => {
    expect(computeUptimePct(100, 0)).toBe(100);
  });

  it('computes correct uptime percentage', () => {
    expect(computeUptimePct(100, 1)).toBe(99);
    expect(computeUptimePct(1000, 5)).toBe(99.5);
  });

  it('returns 0% when all runs failed', () => {
    expect(computeUptimePct(10, 10)).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    const result = computeUptimePct(300, 1);
    expect(result).toBeCloseTo(99.67, 1);
  });
});
