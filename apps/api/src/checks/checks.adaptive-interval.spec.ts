/**
 * Unit tests for adaptive interval logic in ChecksScheduler.
 *
 * The scheduler uses effectiveIntervalSec instead of monitor.intervalSec when
 * adaptiveIntervalEnabled=true and the latest run has level='red' or 'yellow'.
 *
 * Tests validate the pure logic of effective interval calculation:
 * 1. adaptiveIntervalEnabled=false → always uses intervalSec (no change)
 * 2. level='green' → uses intervalSec (not adaptive)
 * 3. level='red', adaptiveIntervalDownSec set → uses that value
 * 4. level='red', adaptiveIntervalDownSec null → defaults to intervalSec / 4 (min 10s)
 * 5. level='yellow', adaptiveIntervalDegradedSec set → uses that value
 * 6. level='yellow', adaptiveIntervalDegradedSec null → defaults to intervalSec / 2 (min 15s)
 * 7. intervalSec=20, red, null down → floor(20/4)=5 clamped to min 10s
 * 8. intervalSec=20, yellow, null degraded → floor(20/2)=10 clamped to min 15s
 */
import { describe, it, expect } from 'vitest';

// ─── Pure logic extracted for unit testing ────────────────────────────────────
// This mirrors the exact logic in checks.scheduler.ts tick() → due filter

function computeEffectiveIntervalSec(
  intervalSec: number,
  adaptiveIntervalEnabled: boolean,
  adaptiveIntervalDownSec: number | null | undefined,
  adaptiveIntervalDegradedSec: number | null | undefined,
  latestLevel: string | null | undefined,
): number {
  if (!adaptiveIntervalEnabled || !latestLevel) return intervalSec;
  if (latestLevel === 'red') {
    return adaptiveIntervalDownSec ?? Math.max(10, Math.floor(intervalSec / 4));
  }
  if (latestLevel === 'yellow') {
    return adaptiveIntervalDegradedSec ?? Math.max(15, Math.floor(intervalSec / 2));
  }
  return intervalSec; // green or unknown level → no change
}

// ─────────────────────────────────────────────────────────────────────────────

describe('computeEffectiveIntervalSec — adaptive interval logic', () => {
  it('returns intervalSec when adaptiveIntervalEnabled is false (green level)', () => {
    expect(computeEffectiveIntervalSec(60, false, 15, 30, 'green')).toBe(60);
  });

  it('returns intervalSec when adaptiveIntervalEnabled is false (red level)', () => {
    expect(computeEffectiveIntervalSec(60, false, 15, 30, 'red')).toBe(60);
  });

  it('returns intervalSec when level is green even with adaptive enabled', () => {
    expect(computeEffectiveIntervalSec(60, true, 15, 30, 'green')).toBe(60);
  });

  it('uses adaptiveIntervalDownSec when set and level is red', () => {
    expect(computeEffectiveIntervalSec(60, true, 15, 30, 'red')).toBe(15);
  });

  it('defaults to intervalSec / 4 (min 10s) when adaptiveIntervalDownSec is null and level is red', () => {
    // 60 / 4 = 15 — above min 10
    expect(computeEffectiveIntervalSec(60, true, null, null, 'red')).toBe(15);
  });

  it('uses adaptiveIntervalDegradedSec when set and level is yellow', () => {
    expect(computeEffectiveIntervalSec(60, true, 15, 30, 'yellow')).toBe(30);
  });

  it('defaults to intervalSec / 2 (min 15s) when adaptiveIntervalDegradedSec is null and level is yellow', () => {
    // 60 / 2 = 30 — above min 15
    expect(computeEffectiveIntervalSec(60, true, null, null, 'yellow')).toBe(30);
  });

  it('clamps red default to min 10s when intervalSec is very small', () => {
    // intervalSec=20: floor(20/4)=5 → clamped to 10
    expect(computeEffectiveIntervalSec(20, true, null, null, 'red')).toBe(10);
  });

  it('clamps yellow default to min 15s when intervalSec is small', () => {
    // intervalSec=20: floor(20/2)=10 → clamped to 15
    expect(computeEffectiveIntervalSec(20, true, null, null, 'yellow')).toBe(15);
  });

  it('returns intervalSec when latestLevel is null (no run yet)', () => {
    expect(computeEffectiveIntervalSec(60, true, 15, 30, null)).toBe(60);
  });

  it('returns intervalSec when latestLevel is undefined', () => {
    expect(computeEffectiveIntervalSec(60, true, 15, 30, undefined)).toBe(60);
  });

  it('handles large intervalSec correctly for red level', () => {
    // intervalSec=3600: floor(3600/4)=900
    expect(computeEffectiveIntervalSec(3600, true, null, null, 'red')).toBe(900);
  });

  it('handles large intervalSec correctly for yellow level', () => {
    // intervalSec=3600: floor(3600/2)=1800
    expect(computeEffectiveIntervalSec(3600, true, null, null, 'yellow')).toBe(1800);
  });
});
