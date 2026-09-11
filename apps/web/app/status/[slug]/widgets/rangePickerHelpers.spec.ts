import { describe, it, expect } from "vitest";
import { RANGES, isValidRange, getDefaultRange, type RangeValue } from "./rangePickerHelpers";

describe("RANGES", () => {
  it("has 4 range options", () => {
    expect(RANGES).toHaveLength(4);
  });

  it("contains 24h, 7d, 30d, 90d", () => {
    const values = RANGES.map((r) => r.value);
    expect(values).toContain("24h");
    expect(values).toContain("7d");
    expect(values).toContain("30d");
    expect(values).toContain("90d");
  });

  it("every range has a matching label and value", () => {
    for (const r of RANGES) {
      expect(r.label).toBeTruthy();
      expect(r.value).toBeTruthy();
      expect(r.label).toBe(r.value); // label equals value in this impl
    }
  });

  it("all range values are distinct", () => {
    const values = RANGES.map((r) => r.value);
    expect(new Set(values).size).toBe(4);
  });
});

describe("isValidRange", () => {
  it("returns true for 24h", () => {
    expect(isValidRange("24h")).toBe(true);
  });

  it("returns true for 7d", () => {
    expect(isValidRange("7d")).toBe(true);
  });

  it("returns true for 30d", () => {
    expect(isValidRange("30d")).toBe(true);
  });

  it("returns true for 90d", () => {
    expect(isValidRange("90d")).toBe(true);
  });

  it("returns false for unknown value", () => {
    expect(isValidRange("1y")).toBe(false);
    expect(isValidRange("")).toBe(false);
    expect(isValidRange("12h")).toBe(false);
  });
});

describe("getDefaultRange", () => {
  it("returns 24h as the default", () => {
    expect(getDefaultRange()).toBe("24h");
  });

  it("returns a valid range value", () => {
    expect(isValidRange(getDefaultRange())).toBe(true);
  });
});
