import { describe, it, expect } from "vitest";
import { EVENT_TYPE_COLORS } from "./eventsTimelineHelpers";

describe("EVENT_TYPE_COLORS", () => {
  it("has exactly 5 entries", () => {
    expect(Object.keys(EVENT_TYPE_COLORS)).toHaveLength(5);
  });

  it("has entries for deploy, note, incident, maintenance, config", () => {
    expect(EVENT_TYPE_COLORS).toHaveProperty("deploy");
    expect(EVENT_TYPE_COLORS).toHaveProperty("note");
    expect(EVENT_TYPE_COLORS).toHaveProperty("incident");
    expect(EVENT_TYPE_COLORS).toHaveProperty("maintenance");
    expect(EVENT_TYPE_COLORS).toHaveProperty("config");
  });

  it("deploy contains 'blue'", () => {
    expect(EVENT_TYPE_COLORS.deploy).toContain("blue");
  });

  it("note contains 'text-muted'", () => {
    expect(EVENT_TYPE_COLORS.note).toContain("text-muted");
  });

  it("incident contains 'red'", () => {
    expect(EVENT_TYPE_COLORS.incident).toContain("red");
  });

  it("maintenance contains 'yellow'", () => {
    expect(EVENT_TYPE_COLORS.maintenance).toContain("yellow");
  });

  it("config contains 'purple'", () => {
    expect(EVENT_TYPE_COLORS.config).toContain("purple");
  });

  it("unknown key returns undefined", () => {
    expect(EVENT_TYPE_COLORS["unknown"]).toBeUndefined();
  });
});
