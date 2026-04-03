import { describe, it, expect } from 'vitest';
import { buildTimingPhases, computeTotal, computeBarWidth } from './checkRunsHelpers';

describe('checkRunsHelpers', () => {
  it('buildTimingPhases({}) returns 5 phases with null values', () => {
    const phases = buildTimingPhases({});
    expect(phases).toHaveLength(5);
    expect(phases.map((p) => p.value)).toEqual([null, null, null, null, null]);
  });

  it('buildTimingPhases maps provided values and keeps missing as null', () => {
    const phases = buildTimingPhases({ dnsMs: 10, tcpMs: 20 });
    expect(phases[0].value).toBe(10);
    expect(phases[1].value).toBe(20);
    expect(phases[2].value).toBeNull();
    expect(phases[3].value).toBeNull();
    expect(phases[4].value).toBeNull();
  });

  it('buildTimingPhases returns labels in expected order', () => {
    const phases = buildTimingPhases({});
    expect(phases.map((p) => p.label)).toEqual(['DNS', 'TCP', 'TLS', 'TTFB', 'Download']);
  });

  it('buildTimingPhases returns colors in expected order', () => {
    const phases = buildTimingPhases({});
    expect(phases.map((p) => p.color)).toEqual([
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-orange-500',
      'bg-cyan-500',
    ]);
  });

  it('computeTotal uses provided totalMs when present', () => {
    const phases = buildTimingPhases({ dnsMs: 10, tcpMs: 20 });
    expect(computeTotal(phases, 500)).toBe(500);
  });

  it('computeTotal sums non-null phase values when totalMs is null', () => {
    expect(
      computeTotal(
        [
          { label: 'A', value: 100, color: 'x' },
          { label: 'B', value: 200, color: 'y' },
          { label: 'C', value: null, color: 'z' },
        ],
        null
      )
    ).toBe(300);
  });

  it('computeTotal returns 0 for empty phases and null totalMs', () => {
    expect(computeTotal([], null)).toBe(0);
  });

  it('computeBarWidth returns proportional width', () => {
    expect(computeBarWidth(50, 100)).toBe(50);
    expect(computeBarWidth(5, 100)).toBe(5);
  });

  it('computeBarWidth clamps to min 2%', () => {
    expect(computeBarWidth(0, 100)).toBe(2);
    expect(computeBarWidth(0.5, 100)).toBe(2);
  });
});
