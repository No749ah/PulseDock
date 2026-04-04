import { describe, it, expect } from "vitest";
import { computeLayout, statusColor, statusBg, statusTextClass, type MonitorStatus } from "./helpers";

describe("computeLayout", () => {
  it("returns empty map for empty nodes", () => {
    expect(computeLayout([], [])).toEqual(new Map());
  });

  it("places single node at x=0", () => {
    const positions = computeLayout([{ id: "a" }], []);
    expect(positions.has("a")).toBe(true);
    expect(positions.get("a")!.x).toBe(0);
  });

  it("places all nodes in the map", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const positions = computeLayout(nodes, []);
    expect(positions.size).toBe(3);
  });

  it("places connected nodes in different layers (x positions)", () => {
    const nodes = [{ id: "a" }, { id: "b" }];
    const edges = [{ source: "a", target: "b" }];
    const positions = computeLayout(nodes, edges);
    expect(positions.get("a")!.x).toBeLessThan(positions.get("b")!.x);
  });

  it("places a 3-node chain in 3 distinct x positions", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const edges = [{ source: "a", target: "b" }, { source: "b", target: "c" }];
    const positions = computeLayout(nodes, edges);
    const xs = [positions.get("a")!.x, positions.get("b")!.x, positions.get("c")!.x];
    expect(new Set(xs).size).toBe(3);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });

  it("ignores edges with unknown source/target nodes", () => {
    const nodes = [{ id: "a" }, { id: "b" }];
    const edges = [{ source: "x", target: "y" }]; // unknown nodes
    const positions = computeLayout(nodes, edges);
    // Both nodes are roots → same layer
    expect(positions.get("a")!.x).toBe(positions.get("b")!.x);
  });

  it("returns positions for all nodes even with no edges", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const positions = computeLayout(nodes, []);
    expect(positions.size).toBe(3);
  });
});

describe("statusColor", () => {
  const statuses: MonitorStatus[] = ["up", "down", "degraded", "paused", "no-data"];

  it("returns distinct hex colors for each status", () => {
    const colors = statuses.map((s) => statusColor(s));
    expect(new Set(colors).size).toBe(5);
  });

  it("up → green hex", () => {
    expect(statusColor("up")).toBe("#22c55e");
  });

  it("down → red hex", () => {
    expect(statusColor("down")).toBe("#ef4444");
  });

  it("degraded → yellow hex", () => {
    expect(statusColor("degraded")).toBe("#eab308");
  });

  it("paused → gray hex", () => {
    expect(statusColor("paused")).toBe("#6b7280");
  });

  it("no-data → dark hex", () => {
    expect(statusColor("no-data")).toBe("#374151");
  });
});

describe("statusBg", () => {
  it("returns a background hex for each status", () => {
    const statuses: MonitorStatus[] = ["up", "down", "degraded", "paused", "no-data"];
    for (const s of statuses) {
      expect(statusBg(s)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("up bg is dark green", () => {
    expect(statusBg("up")).toBe("#052e16");
  });

  it("down bg is dark red", () => {
    expect(statusBg("down")).toBe("#1c0000");
  });
});

describe("statusTextClass", () => {
  it("up → text-green-400", () => {
    expect(statusTextClass("up")).toBe("text-green-400");
  });

  it("down → text-red-400", () => {
    expect(statusTextClass("down")).toBe("text-red-400");
  });

  it("degraded → text-yellow-400", () => {
    expect(statusTextClass("degraded")).toBe("text-yellow-400");
  });

  it("paused → text-gray-400", () => {
    expect(statusTextClass("paused")).toBe("text-gray-400");
  });

  it("no-data → text-gray-500", () => {
    expect(statusTextClass("no-data")).toBe("text-gray-500");
  });

  it("all statuses return distinct text classes", () => {
    const statuses: MonitorStatus[] = ["up", "down", "degraded", "paused", "no-data"];
    const classes = statuses.map((s) => statusTextClass(s));
    expect(new Set(classes).size).toBe(5);
  });
});
