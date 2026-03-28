import { describe, it, expect } from 'vitest';
import { simulateAlertRules, SimulateRun } from './monitors.service';

function makeRuns(pattern: boolean[], baseTime = new Date('2024-01-01T12:00:00Z').getTime()): SimulateRun[] {
  return pattern.map((ok, i) => ({
    ok,
    checkedAt: new Date(baseTime + i * 60_000).toISOString(),
  }));
}

describe('simulateAlertRules', () => {
  it('single failure with confirmations=1 fires alert', () => {
    const runs = makeRuns([true, false, true]);
    const result = simulateAlertRules(runs, { confirmations: 1 });
    expect(result.alertsFired).toBe(1);
    expect(result.timeline.some((e) => e.type === 'alert')).toBe(true);
  });

  it('two failures with confirmations=3 does NOT fire until 3rd consecutive fail', () => {
    // 2 fails — should not fire
    const runs2 = makeRuns([true, false, false, true]);
    const result2 = simulateAlertRules(runs2, { confirmations: 3 });
    expect(result2.alertsFired).toBe(0);

    // 3 consecutive fails — should fire
    const runs3 = makeRuns([true, false, false, false, true]);
    const result3 = simulateAlertRules(runs3, { confirmations: 3 });
    expect(result3.alertsFired).toBe(1);
  });

  it('recovery fires recovery alert after an alert', () => {
    const runs = makeRuns([false, false, true]);
    const result = simulateAlertRules(runs, { confirmations: 1 });
    expect(result.alertsFired).toBe(1);
    expect(result.recoverysFired).toBe(1);
    expect(result.timeline.some((e) => e.type === 'recovery')).toBe(true);
  });

  it('flap detection fires "flapping" instead of regular alert', () => {
    // Alternating pattern in a 5-run window → should trigger flap detection
    const runs = makeRuns([true, false, true, false, true, false]);
    const result = simulateAlertRules(runs, {
      confirmations: 1,
      flapDetection: true,
      flapWindow: 5,
      flapThreshold: 3,
    });
    expect(result.flappingAlertsFired).toBeGreaterThan(0);
    expect(result.timeline.some((e) => e.type === 'flapping')).toBe(true);
  });

  it('schedule filter skips alerts outside business hours', () => {
    // Create runs at UTC hour 2 (outside 9-17 window)
    const baseTime = new Date('2024-01-15T02:00:00Z').getTime(); // 2am UTC
    const runs = makeRuns([false, false, false], baseTime);
    const result = simulateAlertRules(runs, {
      confirmations: 1,
      scheduleStartHour: 9,
      scheduleEndHour: 17,
    });
    expect(result.alertsFired).toBe(0);
  });

  it('all-ok runs produce 0 alerts', () => {
    const runs = makeRuns([true, true, true, true, true]);
    const result = simulateAlertRules(runs, { confirmations: 1 });
    expect(result.alertsFired).toBe(0);
    expect(result.recoverysFired).toBe(0);
    expect(result.flappingAlertsFired).toBe(0);
    expect(result.noiseScore).toBe('low');
    expect(result.timeline).toHaveLength(0);
  });
});
