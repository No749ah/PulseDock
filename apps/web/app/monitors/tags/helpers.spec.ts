import { describe, it, expect } from "vitest";
import { PRESET_COLORS, getTagMonitorCount } from "./helpers";

describe("PRESET_COLORS", () => {
  it("has 10 preset colors", () => {
    expect(PRESET_COLORS).toHaveLength(10);
  });

  it("all values are hex color strings", () => {
    for (const color of PRESET_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("first color is indigo", () => {
    expect(PRESET_COLORS[0]).toBe("#6366f1");
  });

  it("all colors are unique", () => {
    expect(new Set(PRESET_COLORS).size).toBe(PRESET_COLORS.length);
  });
});

describe("getTagMonitorCount", () => {
  it("returns 0 for empty monitors list", () => {
    expect(getTagMonitorCount("tag1", [])).toBe(0);
  });

  it("returns 0 when no monitors have the tag", () => {
    const monitors = [
      { tags: [{ id: "tag2" }] },
      { tags: [{ id: "tag3" }] },
    ];
    expect(getTagMonitorCount("tag1", monitors)).toBe(0);
  });

  it("counts monitors with the given tag", () => {
    const monitors = [
      { tags: [{ id: "tag1" }, { id: "tag2" }] },
      { tags: [{ id: "tag2" }] },
      { tags: [{ id: "tag1" }] },
    ];
    expect(getTagMonitorCount("tag1", monitors)).toBe(2);
  });

  it("handles monitors without tags property", () => {
    const monitors = [
      { tags: undefined },
      { tags: [{ id: "tag1" }] },
    ];
    expect(getTagMonitorCount("tag1", monitors)).toBe(1);
  });

  it("handles monitors with empty tags array", () => {
    const monitors = [
      { tags: [] },
      { tags: [{ id: "tag1" }] },
    ];
    expect(getTagMonitorCount("tag1", monitors)).toBe(1);
  });

  it("returns count of all monitors when all have the tag", () => {
    const monitors = [
      { tags: [{ id: "tag1" }] },
      { tags: [{ id: "tag1" }] },
      { tags: [{ id: "tag1" }] },
    ];
    expect(getTagMonitorCount("tag1", monitors)).toBe(3);
  });
});
