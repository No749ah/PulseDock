import { describe, it, expect } from "vitest";
import { getScopedMonitors, passesVisibilityRule, monitorDetailHref } from "./widgetIndexHelpers";
import type { Widget, MonitorSummary } from "./shared";

function makeWidget(config: Widget["config"] = {}): Widget {
  return { id: "w1", type: "status", x: 0, y: 0, w: 6, h: 2, config };
}

function makeMonitor(overrides: Partial<MonitorSummary> = {}): MonitorSummary {
  return {
    id: "m1",
    name: "Test Monitor",
    type: "HTTP",
    level: "green",
    lastChecked: null,
    latencyMs: null,
    message: null,
    ...overrides,
  };
}

const monitors = [
  makeMonitor({ id: "m1", type: "HTTP", level: "green", tags: ["web"], folderId: "f1" }),
  makeMonitor({ id: "m2", type: "TCP", level: "yellow", tags: ["infra"], folderId: "f1" }),
  makeMonitor({ id: "m3", type: "HTTP", level: "red", tags: ["web"], folderId: "f2" }),
];

describe("getScopedMonitors", () => {
  it("returns all monitors when no config filter", () => {
    const widget = makeWidget({});
    expect(getScopedMonitors(widget, monitors)).toHaveLength(3);
  });

  it("filters by monitorIds array", () => {
    const widget = makeWidget({ monitorIds: ["m1", "m3"] });
    const result = getScopedMonitors(widget, monitors);
    expect(result.map((m) => m.id)).toEqual(["m1", "m3"]);
  });

  it("filters by single monitorId when no monitorIds", () => {
    const widget = makeWidget({ monitorId: "m2" });
    const result = getScopedMonitors(widget, monitors);
    expect(result.map((m) => m.id)).toEqual(["m2"]);
  });

  it("monitorIds takes precedence over monitorId", () => {
    const widget = makeWidget({ monitorIds: ["m1"], monitorId: "m3" });
    const result = getScopedMonitors(widget, monitors);
    expect(result.map((m) => m.id)).toEqual(["m1"]);
  });

  it("filters by tag", () => {
    const widget = makeWidget({ tag: "infra" });
    const result = getScopedMonitors(widget, monitors);
    expect(result.map((m) => m.id)).toEqual(["m2"]);
  });

  it("filters by folderId", () => {
    const widget = makeWidget({ folderId: "f2" });
    const result = getScopedMonitors(widget, monitors);
    expect(result.map((m) => m.id)).toEqual(["m3"]);
  });

  it("filters by monitorType", () => {
    const widget = makeWidget({ monitorType: "TCP" });
    const result = getScopedMonitors(widget, monitors);
    expect(result.map((m) => m.id)).toEqual(["m2"]);
  });

  it("stacks multiple filters (tag + monitorType)", () => {
    const widget = makeWidget({ tag: "web", monitorType: "HTTP" });
    const result = getScopedMonitors(widget, monitors);
    expect(result.map((m) => m.id)).toEqual(["m1", "m3"]);
  });

  it("returns empty when no monitors match", () => {
    const widget = makeWidget({ monitorIds: ["x99"] });
    expect(getScopedMonitors(widget, monitors)).toHaveLength(0);
  });
});

describe("passesVisibilityRule", () => {
  it("always rule → true with any monitors", () => {
    const widget = makeWidget({ visibility: "always" });
    expect(passesVisibilityRule(widget, monitors)).toBe(true);
  });

  it("default (no visibility) → true", () => {
    const widget = makeWidget({});
    expect(passesVisibilityRule(widget, [])).toBe(true);
  });

  it("outage rule → true when a red monitor exists", () => {
    const widget = makeWidget({ visibility: "outage" });
    expect(passesVisibilityRule(widget, [makeMonitor({ level: "red" })])).toBe(true);
  });

  it("outage rule → false when no red monitors", () => {
    const widget = makeWidget({ visibility: "outage" });
    expect(passesVisibilityRule(widget, [makeMonitor({ level: "green" })])).toBe(false);
  });

  it("outage rule → false when empty scope", () => {
    const widget = makeWidget({ visibility: "outage" });
    expect(passesVisibilityRule(widget, [])).toBe(false);
  });

  it("degraded rule → true when yellow but no red", () => {
    const widget = makeWidget({ visibility: "degraded" });
    const scoped = [makeMonitor({ level: "yellow" }), makeMonitor({ level: "green" })];
    expect(passesVisibilityRule(widget, scoped)).toBe(true);
  });

  it("degraded rule → false when red present", () => {
    const widget = makeWidget({ visibility: "degraded" });
    const scoped = [makeMonitor({ level: "red" }), makeMonitor({ level: "yellow" })];
    expect(passesVisibilityRule(widget, scoped)).toBe(false);
  });

  it("operational rule → true when all green", () => {
    const widget = makeWidget({ visibility: "operational" });
    const scoped = [makeMonitor({ level: "green" }), makeMonitor({ level: "green" })];
    expect(passesVisibilityRule(widget, scoped)).toBe(true);
  });

  it("operational rule → false when red present", () => {
    const widget = makeWidget({ visibility: "operational" });
    const scoped = [makeMonitor({ level: "red" })];
    expect(passesVisibilityRule(widget, scoped)).toBe(false);
  });

  it("unknown rule → true (catch-all)", () => {
    const widget = makeWidget({ visibility: "never_heard_of_this" });
    expect(passesVisibilityRule(widget, monitors)).toBe(true);
  });
});

describe("monitorDetailHref", () => {
  it("returns href for monitorId config", () => {
    const widget = makeWidget({ monitorId: "m2" });
    expect(monitorDetailHref(widget, [])).toBe("/monitors/m2");
  });

  it("returns href for first monitorIds entry", () => {
    const widget = makeWidget({ monitorIds: ["m3", "m1"] });
    expect(monitorDetailHref(widget, [])).toBe("/monitors/m3");
  });

  it("falls back to first scoped monitor when no config ids", () => {
    const widget = makeWidget({});
    const scoped = [makeMonitor({ id: "m5" })];
    expect(monitorDetailHref(widget, scoped)).toBe("/monitors/m5");
  });

  it("returns null when no config ids and empty scoped monitors", () => {
    const widget = makeWidget({});
    expect(monitorDetailHref(widget, [])).toBeNull();
  });

  it("monitorId takes precedence over scoped monitors", () => {
    const widget = makeWidget({ monitorId: "specific" });
    const scoped = [makeMonitor({ id: "other" })];
    expect(monitorDetailHref(widget, scoped)).toBe("/monitors/specific");
  });
});
