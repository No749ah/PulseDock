import { describe, it, expect } from "vitest";
import {
  flattenTree,
  uptimeBarColor,
  STATUS_LABELS,
  type FolderNode,
  type OverallStatus,
} from "./helpers";

describe("flattenTree", () => {
  it("returns empty array for empty input", () => {
    expect(flattenTree([])).toEqual([]);
  });

  it("returns single root node", () => {
    const node: FolderNode = { id: "a", name: "A", children: [] };
    expect(flattenTree([node])).toEqual([node]);
  });

  it("flattens nested children depth-first", () => {
    const tree: FolderNode[] = [
      {
        id: "root", name: "Root", children: [
          { id: "child1", name: "Child1", children: [] },
          { id: "child2", name: "Child2", children: [
            { id: "grandchild", name: "GC", children: [] },
          ]},
        ],
      },
    ];
    const result = flattenTree(tree);
    expect(result.map((n) => n.id)).toEqual(["root", "child1", "child2", "grandchild"]);
  });

  it("handles multiple root nodes", () => {
    const trees: FolderNode[] = [
      { id: "a", name: "A", children: [{ id: "a1", name: "A1", children: [] }] },
      { id: "b", name: "B", children: [] },
    ];
    const result = flattenTree(trees);
    expect(result.map((n) => n.id)).toEqual(["a", "a1", "b"]);
  });

  it("preserves extra properties on nodes", () => {
    const node: FolderNode = { id: "x", name: "X", children: [], monitorCount: 3 };
    const result = flattenTree([node]);
    expect(result[0].monitorCount).toBe(3);
  });
});

describe("uptimeBarColor", () => {
  it("returns bg-success for >= 99%", () => {
    expect(uptimeBarColor(99)).toBe("bg-success");
    expect(uptimeBarColor(100)).toBe("bg-success");
    expect(uptimeBarColor(99.5)).toBe("bg-success");
  });

  it("returns bg-warning for 95–98.x%", () => {
    expect(uptimeBarColor(95)).toBe("bg-warning");
    expect(uptimeBarColor(98)).toBe("bg-warning");
    expect(uptimeBarColor(98.9)).toBe("bg-warning");
  });

  it("returns bg-danger for < 95%", () => {
    expect(uptimeBarColor(94.9)).toBe("bg-danger");
    expect(uptimeBarColor(0)).toBe("bg-danger");
    expect(uptimeBarColor(50)).toBe("bg-danger");
  });

  it("boundary: exactly 99 is bg-success", () => {
    expect(uptimeBarColor(99)).toBe("bg-success");
  });

  it("boundary: exactly 95 is bg-warning", () => {
    expect(uptimeBarColor(95)).toBe("bg-warning");
  });
});

describe("STATUS_LABELS", () => {
  it("has label for all 4 statuses", () => {
    const statuses: OverallStatus[] = ["operational", "degraded", "outage", "empty"];
    for (const s of statuses) {
      expect(STATUS_LABELS[s]).toBeTruthy();
    }
  });

  it("operational maps to Operational", () => {
    expect(STATUS_LABELS.operational).toBe("Operational");
  });

  it("degraded maps to Degraded", () => {
    expect(STATUS_LABELS.degraded).toBe("Degraded");
  });

  it("outage maps to Outage", () => {
    expect(STATUS_LABELS.outage).toBe("Outage");
  });

  it("empty maps to No monitors", () => {
    expect(STATUS_LABELS.empty).toBe("No monitors");
  });
});
