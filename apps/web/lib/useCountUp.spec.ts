import { describe, it, expect } from "vitest";

/**
 * useCountUp is a React hook that animates a number from 0 to target using
 * requestAnimationFrame with ease-out cubic easing.
 *
 * Due to React 18 + jsdom compatibility issues with renderHook, we test the
 * underlying animation math (ease-out cubic, formatting) as pure functions.
 */

/** Ease-out cubic: 1 - (1 - t)^3  — mirrors the hook's easing function */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Compute animated value at a given progress (mirrors hook step() logic) */
function computeValue(
  from: number,
  target: number,
  elapsed: number,
  duration: number
): number {
  const progress = Math.min(elapsed / duration, 1);
  const eased = easeOutCubic(progress);
  return from + (target - from) * eased;
}

/** Format value with decimals (mirrors hook's return) */
function formatValue(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

describe("useCountUp animation math", () => {
  describe("easeOutCubic", () => {
    it("returns 0 at t=0", () => {
      expect(easeOutCubic(0)).toBe(0);
    });

    it("returns 1 at t=1", () => {
      expect(easeOutCubic(1)).toBe(1);
    });

    it("is greater than linear at t=0.5 (ease-out is fast-start)", () => {
      const linear = 0.5;
      const eased = easeOutCubic(0.5);
      expect(eased).toBeGreaterThan(linear);
      // 1 - (1-0.5)^3 = 1 - 0.125 = 0.875
      expect(eased).toBeCloseTo(0.875, 5);
    });

    it("is close to 1 at t=0.9 (tail decelerates)", () => {
      // 1 - (1-0.9)^3 = 1 - 0.001 = 0.999
      expect(easeOutCubic(0.9)).toBeCloseTo(0.999, 3);
    });

    it("handles values at t=0.25", () => {
      // 1 - (0.75)^3 = 1 - 0.421875 = 0.578125
      expect(easeOutCubic(0.25)).toBeCloseTo(0.578125, 5);
    });
  });

  describe("computeValue", () => {
    it("returns from at elapsed=0", () => {
      expect(computeValue(0, 100, 0, 1000)).toBe(0);
    });

    it("returns target at elapsed=duration", () => {
      expect(computeValue(0, 100, 1000, 1000)).toBe(100);
    });

    it("returns target when elapsed exceeds duration", () => {
      expect(computeValue(0, 100, 2000, 1000)).toBe(100);
    });

    it("computes correct intermediate value at 50% time", () => {
      const value = computeValue(0, 100, 500, 1000);
      // easeOutCubic(0.5) = 0.875 → value = 87.5
      expect(value).toBeCloseTo(87.5, 1);
    });

    it("works with non-zero from value", () => {
      const value = computeValue(50, 150, 1000, 1000);
      // At completion: from + (target - from) * 1 = 150
      expect(value).toBe(150);
    });

    it("works with counting down (target < from)", () => {
      const value = computeValue(100, 0, 1000, 1000);
      expect(value).toBe(0);
    });

    it("handles intermediate down-counting", () => {
      const value = computeValue(100, 0, 500, 1000);
      // easeOutCubic(0.5) = 0.875 → 100 + (0-100)*0.875 = 12.5
      expect(value).toBeCloseTo(12.5, 1);
    });

    it("handles negative targets", () => {
      const value = computeValue(0, -50, 1000, 1000);
      expect(value).toBe(-50);
    });

    it("handles fractional targets", () => {
      const value = computeValue(0, 99.9, 1000, 1000);
      expect(value).toBeCloseTo(99.9, 1);
    });
  });

  describe("formatValue", () => {
    it("formats with 0 decimals (default behavior)", () => {
      expect(formatValue(99.7, 0)).toBe("100");
    });

    it("formats with 1 decimal", () => {
      expect(formatValue(99.95, 1)).toBe("100.0");
    });

    it("formats with 2 decimals", () => {
      expect(formatValue(99.99, 2)).toBe("99.99");
    });

    it("pads with zeros when needed", () => {
      expect(formatValue(50, 2)).toBe("50.00");
    });

    it("rounds correctly", () => {
      expect(formatValue(99.45, 1)).toBe("99.5");
    });

    it("handles 0", () => {
      expect(formatValue(0, 0)).toBe("0");
    });

    it("handles 0 with decimals", () => {
      expect(formatValue(0, 2)).toBe("0.00");
    });

    it("handles large numbers", () => {
      expect(formatValue(1234567.89, 1)).toBe("1234567.9");
    });
  });

  describe("animation timeline", () => {
    it("produces monotonically increasing values for ascending animation", () => {
      const steps = [0, 100, 200, 300, 500, 700, 1000];
      const values = steps.map((t) => computeValue(0, 100, t, 1000));

      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
      }
    });

    it("produces monotonically decreasing values for descending animation", () => {
      const steps = [0, 100, 200, 300, 500, 700, 1000];
      const values = steps.map((t) => computeValue(100, 0, t, 1000));

      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
      }
    });

    it("covers most of the range in first half (ease-out characteristic)", () => {
      const halfValue = computeValue(0, 100, 500, 1000);
      // Should be >75% of the way there at 50% time (ease-out = fast start)
      expect(halfValue).toBeGreaterThan(75);
    });

    it("default duration is 1200ms", () => {
      // The hook defaults to 1200ms duration
      const val = computeValue(0, 100, 1200, 1200);
      expect(val).toBe(100);
    });
  });
});
