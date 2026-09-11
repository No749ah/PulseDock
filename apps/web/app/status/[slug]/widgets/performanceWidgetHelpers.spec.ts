import { describe, it, expect } from "vitest";
import { apdexRatingColor, computeSharePct } from "./performanceWidgetHelpers";

describe("apdexRatingColor", () => {
  it("Excellent → text-green-400", () => {
    expect(apdexRatingColor("Excellent")).toBe("text-green-400");
  });

  it("Good → text-blue-400", () => {
    expect(apdexRatingColor("Good")).toBe("text-blue-400");
  });

  it("Fair → text-yellow-400", () => {
    expect(apdexRatingColor("Fair")).toBe("text-yellow-400");
  });

  it("Poor → text-orange-400", () => {
    expect(apdexRatingColor("Poor")).toBe("text-orange-400");
  });

  it("null → text-red-400 (fallback)", () => {
    expect(apdexRatingColor(null)).toBe("text-red-400");
  });

  it("undefined → text-red-400 (fallback)", () => {
    expect(apdexRatingColor(undefined)).toBe("text-red-400");
  });

  it("unknown string → text-red-400 (fallback)", () => {
    expect(apdexRatingColor("Terrible")).toBe("text-red-400");
    expect(apdexRatingColor("")).toBe("text-red-400");
  });

  it("all 4 known ratings return distinct colors", () => {
    const colors = ["Excellent", "Good", "Fair", "Poor"].map((r) => apdexRatingColor(r));
    expect(new Set(colors).size).toBe(4);
  });
});

describe("computeSharePct", () => {
  it("returns 0 when total is 0", () => {
    expect(computeSharePct(100, 0)).toBe(0);
  });

  it("returns 100 when part equals total", () => {
    expect(computeSharePct(50, 50)).toBe(100);
  });

  it("returns 50 for half", () => {
    expect(computeSharePct(25, 50)).toBe(50);
  });

  it("returns 0 for 0 part", () => {
    expect(computeSharePct(0, 100)).toBe(0);
  });

  it("returns correct fractional percentage", () => {
    expect(computeSharePct(1, 3)).toBeCloseTo(33.33, 1);
  });

  it("returns > 100 when part > total (no clamping)", () => {
    expect(computeSharePct(200, 100)).toBe(200);
  });
});
