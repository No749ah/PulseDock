import { describe, it, expect } from "vitest";
import { EVENT_TYPE_COLORS } from "./eventsTimelineHelpers";

describe("EVENT_TYPE_COLORS", () => {
  const eventTypes = ["deploy", "note", "incident", "maintenance", "config"] as const;

  it("has colors for all 5 event types", () => {
    expect(Object.keys(EVENT_TYPE_COLORS)).toHaveLength(5);
  });

  it("every event type has a non-empty color string", () => {
    for (const t of eventTypes) {
      expect(EVENT_TYPE_COLORS[t]).toBeTruthy();
    }
  });

  it("deploy uses blue", () => {
    expect(EVENT_TYPE_COLORS.deploy).toContain("blue");
  });

  it("incident uses red", () => {
    expect(EVENT_TYPE_COLORS.incident).toContain("red");
  });

  it("maintenance uses yellow", () => {
    expect(EVENT_TYPE_COLORS.maintenance).toContain("yellow");
  });

  it("config uses purple", () => {
    expect(EVENT_TYPE_COLORS.config).toContain("purple");
  });

  it("all event type colors are distinct", () => {
    const colors = Object.values(EVENT_TYPE_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
