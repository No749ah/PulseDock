/**
 * Flap Detection unit tests.
 * Tests the configurable flap detection logic used in runMonitor().
 */
import { describe, it, expect } from 'vitest';

/**
 * Pure computation of flapping state, mirroring the logic in checks.service.ts runMonitor().
 * Takes recent run levels (newest first) and the current run level, plus config params.
 * Returns whether the monitor should be considered flapping.
 */
function computeIsFlapping(params: {
  currentLevel: string;
  recentRunLevels: string[];
  flapWindow: number;
  flapThreshold: number;
  flapDetectionEnabled: boolean;
}): boolean {
  const { currentLevel, recentRunLevels, flapWindow, flapThreshold, flapDetectionEnabled } = params;
  if (!flapDetectionEnabled) return false;

  const flapWindowRuns = [
    { level: currentLevel },
    ...recentRunLevels.slice(0, flapWindow - 1).map((level) => ({ level })),
  ];

  const minRuns = Math.ceil(flapWindow / 2);
  if (flapWindowRuns.length < minRuns) return false;

  let stateChanges = 0;
  for (let i = 1; i < flapWindowRuns.length; i++) {
    const isUnhealthy = (l: string) => l === 'red' || l === 'yellow';
    const prevHealthy = !isUnhealthy(flapWindowRuns[i].level);
    const currHealthy = !isUnhealthy(flapWindowRuns[i - 1].level);
    if (prevHealthy !== currHealthy) stateChanges++;
  }

  const transitionRatio = flapWindowRuns.length > 1 ? stateChanges / (flapWindowRuns.length - 1) : 0;
  return transitionRatio >= flapThreshold;
}

describe('Flap Detection — configurable window and threshold', () => {
  it('returns false when insufficient data (fewer than flapWindow/2 runs)', () => {
    // flapWindow=10 → need at least ceil(10/2)=5 runs total (including current)
    // We only have 3 recent + 1 current = 4 total → insufficient
    expect(computeIsFlapping({
      currentLevel: 'green',
      recentRunLevels: ['red', 'green', 'red'],
      flapWindow: 10,
      flapThreshold: 0.5,
      flapDetectionEnabled: true,
    })).toBe(false);
  });

  it('returns false when all checks are green (no transitions)', () => {
    expect(computeIsFlapping({
      currentLevel: 'green',
      recentRunLevels: ['green', 'green', 'green', 'green', 'green', 'green', 'green', 'green', 'green'],
      flapWindow: 10,
      flapThreshold: 0.5,
      flapDetectionEnabled: true,
    })).toBe(false);
  });

  it('returns false when all checks are red (no transitions)', () => {
    expect(computeIsFlapping({
      currentLevel: 'red',
      recentRunLevels: ['red', 'red', 'red', 'red', 'red', 'red', 'red', 'red', 'red'],
      flapWindow: 10,
      flapThreshold: 0.5,
      flapDetectionEnabled: true,
    })).toBe(false);
  });

  it('returns true when at exactly flapThreshold', () => {
    // 10 runs total, 9 boundaries. Need ratio >= 0.5 → need 5+ transitions out of 9.
    // Pattern: green, red, green, red, green, red, green, green, green, green
    // Transitions: g→r, r→g, g→r, r→g, g→r = 5 transitions out of 9 = 0.555... >= 0.5 ✓
    expect(computeIsFlapping({
      currentLevel: 'green',
      recentRunLevels: ['red', 'green', 'red', 'green', 'red', 'green', 'green', 'green', 'green'],
      flapWindow: 10,
      flapThreshold: 0.5,
      flapDetectionEnabled: true,
    })).toBe(true);
  });

  it('returns false when just below threshold', () => {
    // 10 runs, 9 boundaries. Need ratio < 0.5 → need < 4.5 → max 4 transitions.
    // Pattern: green, red, green, red, green, green, green, green, green, green
    // Transitions: g→r, r→g, g→r, r→g = 4 transitions out of 9 = 0.444... < 0.5 → false
    expect(computeIsFlapping({
      currentLevel: 'green',
      recentRunLevels: ['red', 'green', 'red', 'green', 'green', 'green', 'green', 'green', 'green'],
      flapWindow: 10,
      flapThreshold: 0.5,
      flapDetectionEnabled: true,
    })).toBe(false);
  });

  it('returns true when above threshold', () => {
    // Alternating pattern: g,r,g,r,g,r,g,r,g,r = 9 transitions out of 9 = 1.0 >= 0.5
    expect(computeIsFlapping({
      currentLevel: 'green',
      recentRunLevels: ['red', 'green', 'red', 'green', 'red', 'green', 'red', 'green', 'red'],
      flapWindow: 10,
      flapThreshold: 0.5,
      flapDetectionEnabled: true,
    })).toBe(true);
  });

  it('counts mixed yellow/green/red transitions correctly', () => {
    // Pattern (newest first): green, yellow, green, red, green, yellow, red, green, green, green
    // Healthy/unhealthy transitions:
    // green→yellow (h→u), yellow→green (u→h), green→red (h→u), red→green (u→h),
    // green→yellow (h→u), yellow→red (both unhealthy, no transition),
    // red→green (u→h), green→green (no change), green→green (no change)
    // = 6 transitions out of 9 = 0.667 >= 0.5
    expect(computeIsFlapping({
      currentLevel: 'green',
      recentRunLevels: ['yellow', 'green', 'red', 'green', 'yellow', 'red', 'green', 'green', 'green'],
      flapWindow: 10,
      flapThreshold: 0.5,
      flapDetectionEnabled: true,
    })).toBe(true);
  });

  it('uses only last flapWindow runs, not older ones', () => {
    // flapWindow=5 → look at current + 4 most recent
    // Current: green; recent[0..3]: red, green, red, green → all alternating
    // flapWindowRuns = [green, red, green, red, green] → 4 transitions out of 4 = 1.0 >= 0.5
    // But if we used flapWindow=10, we'd also see the stable runs and it would be different
    expect(computeIsFlapping({
      currentLevel: 'green',
      recentRunLevels: ['red', 'green', 'red', 'green', 'green', 'green', 'green', 'green', 'green', 'green', 'green', 'green'],
      flapWindow: 5,
      flapThreshold: 0.5,
      flapDetectionEnabled: true,
    })).toBe(true);

    // Same data with flapWindow=10: only 4 transitions out of 9 = 0.44 < 0.5
    expect(computeIsFlapping({
      currentLevel: 'green',
      recentRunLevels: ['red', 'green', 'red', 'green', 'green', 'green', 'green', 'green', 'green', 'green', 'green', 'green'],
      flapWindow: 10,
      flapThreshold: 0.5,
      flapDetectionEnabled: true,
    })).toBe(false);
  });
});
