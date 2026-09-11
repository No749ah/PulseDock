import { describe, it, expect } from 'vitest';
import { gaugeColor, clampGaugeValue, polarToXY, arcPath, progressRingStrokeColor, progressRingDashOffset } from './metricWidgetHelpers';

describe('gaugeColor', () => {
  const thresholds = { green: 80, yellow: 50 };

  it('returns green when value >= green threshold', () => {
    expect(gaugeColor(80, thresholds)).toBe('#4ade80');
    expect(gaugeColor(99, thresholds)).toBe('#4ade80');
    expect(gaugeColor(100, thresholds)).toBe('#4ade80');
  });

  it('returns yellow when value >= yellow but < green', () => {
    expect(gaugeColor(50, thresholds)).toBe('#facc15');
    expect(gaugeColor(79, thresholds)).toBe('#facc15');
  });

  it('returns red when value < yellow threshold', () => {
    expect(gaugeColor(0, thresholds)).toBe('#f87171');
    expect(gaugeColor(49, thresholds)).toBe('#f87171');
  });
});

describe('clampGaugeValue', () => {
  it('clamps value below 0 to 0', () => {
    expect(clampGaugeValue(-10)).toBe(0);
  });

  it('clamps value above 100 to 100', () => {
    expect(clampGaugeValue(110)).toBe(100);
  });

  it('passes through values in [0, 100]', () => {
    expect(clampGaugeValue(0)).toBe(0);
    expect(clampGaugeValue(50)).toBe(50);
    expect(clampGaugeValue(100)).toBe(100);
  });
});

describe('polarToXY', () => {
  const cx = 100, cy = 100, r = 70;

  it('angle 0 (right) → x = cx+r, y = cy', () => {
    const pt = polarToXY(0, r, cx, cy);
    expect(pt.x).toBeCloseTo(cx + r);
    expect(pt.y).toBeCloseTo(cy);
  });

  it('angle π (left) → x = cx-r, y = cy', () => {
    const pt = polarToXY(Math.PI, r, cx, cy);
    expect(pt.x).toBeCloseTo(cx - r);
    expect(pt.y).toBeCloseTo(cy);
  });

  it('angle π/2 (top in screen coords) → x = cx, y ≈ cy-r', () => {
    const pt = polarToXY(Math.PI / 2, r, cx, cy);
    expect(pt.x).toBeCloseTo(cx);
    expect(pt.y).toBeCloseTo(cy - r);
  });
});

describe('arcPath', () => {
  it('returns a string starting with M and containing A', () => {
    const path = arcPath(Math.PI, 0, 70, 100, 100);
    expect(path).toMatch(/^M /);
    expect(path).toContain(' A ');
  });

  it('produces different paths for different angles', () => {
    const p1 = arcPath(Math.PI, 0, 70, 100, 100);
    const p2 = arcPath(Math.PI, Math.PI / 2, 70, 100, 100);
    expect(p1).not.toBe(p2);
  });

describe('progressRingStrokeColor', () => {
  it('green → #4ade80', () => expect(progressRingStrokeColor('green')).toBe('#4ade80'));
  it('yellow → #facc15', () => expect(progressRingStrokeColor('yellow')).toBe('#facc15'));
  it('red → #f87171', () => expect(progressRingStrokeColor('red')).toBe('#f87171'));
});

describe('progressRingDashOffset', () => {
  const R = 54;
  const circ = 2 * Math.PI * R;

  it('0% → full circumference (no progress shown)', () => {
    expect(progressRingDashOffset(0, R)).toBeCloseTo(circ);
  });

  it('100% → 0 offset (full ring shown)', () => {
    expect(progressRingDashOffset(100, R)).toBeCloseTo(0);
  });

  it('50% → half circumference', () => {
    expect(progressRingDashOffset(50, R)).toBeCloseTo(circ * 0.5);
  });

  it('clamps above 100 to 100', () => {
    expect(progressRingDashOffset(150, R)).toBeCloseTo(0);
  });

  it('clamps below 0 to 0', () => {
    expect(progressRingDashOffset(-5, R)).toBeCloseTo(circ);
  });
});

  it('largeArc flag is 1 when span > π', () => {
    // From π to 0 is exactly π span → largeArc=0 (not > π)
    const path = arcPath(Math.PI, 0, 70, 100, 100);
    // The A command contains the largeArc flag as 5th param
    const parts = path.split(' ');
    expect(parts[6]).toBe('0'); // largeArc=0 for π span
  });
});
