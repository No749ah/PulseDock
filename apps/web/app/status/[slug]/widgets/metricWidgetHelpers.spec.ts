import { describe, it, expect } from 'vitest';

// ── Inline helpers (mirrored from metricWidgetHelpers.ts) ──────────────────

function gaugeColor(value: number, thresholds: { green: number; yellow: number }): string {
  if (value >= thresholds.green) return '#4ade80';
  if (value >= thresholds.yellow) return '#facc15';
  return '#f87171';
}

function clampGaugeValue(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

function polarToXY(angle: number, r: number, cx: number, cy: number): { x: number; y: number } {
  return {
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  };
}

function arcPath(fromAngle: number, toAngle: number, r: number, cx: number, cy: number): string {
  const start = polarToXY(fromAngle, r, cx, cy);
  const end = polarToXY(toAngle, r, cx, cy);
  const largeArc = fromAngle - toAngle > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function progressRingStrokeColor(color: 'green' | 'yellow' | 'red'): string {
  if (color === 'green') return '#4ade80';
  if (color === 'yellow') return '#facc15';
  return '#f87171';
}

function progressRingDashOffset(pct: number, radius: number): number {
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, pct));
  return circumference * (1 - clamped / 100);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('gaugeColor', () => {
  const thresholds = { green: 90, yellow: 70 };

  it('returns green color when value >= green threshold', () => {
    expect(gaugeColor(90, thresholds)).toBe('#4ade80');
    expect(gaugeColor(100, thresholds)).toBe('#4ade80');
    expect(gaugeColor(95, thresholds)).toBe('#4ade80');
  });

  it('returns yellow color when value >= yellow but < green threshold', () => {
    expect(gaugeColor(70, thresholds)).toBe('#facc15');
    expect(gaugeColor(89, thresholds)).toBe('#facc15');
    expect(gaugeColor(75, thresholds)).toBe('#facc15');
  });

  it('returns red color when value < yellow threshold', () => {
    expect(gaugeColor(69, thresholds)).toBe('#f87171');
    expect(gaugeColor(0, thresholds)).toBe('#f87171');
    expect(gaugeColor(50, thresholds)).toBe('#f87171');
  });

  it('handles exact boundary values correctly', () => {
    expect(gaugeColor(90, thresholds)).toBe('#4ade80');
    expect(gaugeColor(70, thresholds)).toBe('#facc15');
  });
});

describe('clampGaugeValue', () => {
  it('clamps values above 100 to 100', () => {
    expect(clampGaugeValue(101)).toBe(100);
    expect(clampGaugeValue(200)).toBe(100);
    expect(clampGaugeValue(100)).toBe(100);
  });

  it('clamps values below 0 to 0', () => {
    expect(clampGaugeValue(-1)).toBe(0);
    expect(clampGaugeValue(-100)).toBe(0);
    expect(clampGaugeValue(0)).toBe(0);
  });

  it('returns values within [0, 100] unchanged', () => {
    expect(clampGaugeValue(50)).toBe(50);
    expect(clampGaugeValue(1)).toBe(1);
    expect(clampGaugeValue(99)).toBe(99);
  });
});

describe('polarToXY', () => {
  it('returns center + radius for angle 0 (cos=1, sin=0)', () => {
    const result = polarToXY(0, 10, 50, 50);
    expect(result.x).toBeCloseTo(60);
    expect(result.y).toBeCloseTo(50);
  });

  it('returns correct coords for angle π/2 (90°)', () => {
    const result = polarToXY(Math.PI / 2, 10, 50, 50);
    expect(result.x).toBeCloseTo(50);
    expect(result.y).toBeCloseTo(40); // cy - r * sin(π/2) = 50 - 10 = 40
  });

  it('returns correct coords for angle π (180°)', () => {
    const result = polarToXY(Math.PI, 10, 50, 50);
    expect(result.x).toBeCloseTo(40);
    expect(result.y).toBeCloseTo(50);
  });

  it('handles zero radius', () => {
    const result = polarToXY(Math.PI / 4, 0, 30, 30);
    expect(result.x).toBe(30);
    expect(result.y).toBe(30);
  });
});

describe('arcPath', () => {
  it('returns a string starting with M and containing A', () => {
    const path = arcPath(Math.PI, 0, 50, 100, 100);
    expect(path).toMatch(/^M /);
    expect(path).toContain(' A ');
  });

  it('uses largeArc=0 when angle diff <= π', () => {
    // fromAngle - toAngle = π/2 which is not > π → largeArc 0
    const path = arcPath(Math.PI, Math.PI / 2, 50, 100, 100);
    expect(path).toContain(' 0 1 ');
  });

  it('uses largeArc=1 when angle diff > π', () => {
    // fromAngle - toAngle = 4 > π → largeArc 1
    const path = arcPath(Math.PI * 1.5, 0, 50, 100, 100);
    expect(path).toContain(' 1 1 ');
  });
});

describe('progressRingStrokeColor', () => {
  it('returns green hex for green variant', () => {
    expect(progressRingStrokeColor('green')).toBe('#4ade80');
  });

  it('returns yellow hex for yellow variant', () => {
    expect(progressRingStrokeColor('yellow')).toBe('#facc15');
  });

  it('returns red hex for red variant', () => {
    expect(progressRingStrokeColor('red')).toBe('#f87171');
  });
});

describe('progressRingDashOffset', () => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  it('returns 0 offset at 100% (full ring)', () => {
    expect(progressRingDashOffset(100, radius)).toBeCloseTo(0);
  });

  it('returns full circumference at 0%', () => {
    expect(progressRingDashOffset(0, radius)).toBeCloseTo(circumference);
  });

  it('returns half circumference at 50%', () => {
    expect(progressRingDashOffset(50, radius)).toBeCloseTo(circumference * 0.5);
  });

  it('clamps values above 100 to 100 (offset ~0)', () => {
    expect(progressRingDashOffset(150, radius)).toBeCloseTo(0);
  });

  it('clamps values below 0 to 0 (offset = circumference)', () => {
    expect(progressRingDashOffset(-10, radius)).toBeCloseTo(circumference);
  });

  it('handles different radii', () => {
    const r = 20;
    const c = 2 * Math.PI * r;
    expect(progressRingDashOffset(25, r)).toBeCloseTo(c * 0.75);
  });
});
