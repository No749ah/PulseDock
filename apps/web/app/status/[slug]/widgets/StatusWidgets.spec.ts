// Pure-logic unit tests for StatusWidgets
// Logic mirrored inline — no React/DOM rendering
import { describe, it, expect } from "vitest";

// ── Pure logic extracted from StatusWidgets.tsx ──────────────────────────

function computeOverallSystemStatus(monitors: Array<{ level: string }>): "green" | "yellow" | "red" {
  const hasRed = monitors.some((m) => m.level === "red");
  const hasYellow = monitors.some((m) => m.level === "yellow");
  return hasRed ? "red" : hasYellow ? "yellow" : "green";
}

function buildSystemStatusLabel(level: string): string {
  if (level === "red") return "Major Outage";
  if (level === "yellow") return "Partial Degradation";
  return "All Systems Operational";
}

function buildSystemStatusSubLabel(
  level: string,
  monitorCount: number,
  outageCount: number,
  degradedCount: number
): string | null {
  const affectedCount = degradedCount + outageCount;
  if (level === "green") {
    if (monitorCount === 0) return null;
    return `${monitorCount} monitor${monitorCount !== 1 ? "s" : ""} online`;
  }
  if (level === "yellow") {
    return `${affectedCount} monitor${affectedCount !== 1 ? "s" : ""} degraded`;
  }
  // red
  return `${outageCount} monitor${outageCount !== 1 ? "s" : ""} down${degradedCount > 0 ? `, ${degradedCount} degraded` : ""}`;
}

function clampUptimePct(raw: number): number {
  return Math.max(0, Math.min(100, Math.round(raw * 100) / 100));
}

function resolveUptimePctFromLevel(level: string | undefined): number {
  if (level === "green") return 100;
  if (level === "yellow") return 95.0;
  return 80.0;
}

function filterActiveIncidents(incidents: Array<{ status: string }>): Array<{ status: string }> {
  return incidents.filter((i) => i.status !== "resolved");
}

function getDownMonitors(monitors: Array<{ level: string }>): Array<{ level: string }> {
  return monitors.filter((m) => m.level === "red");
}

function buildIncidentBannerState(
  activeIncidents: unknown[],
  downMonitors: unknown[]
): { variant: "ok" | "incident"; count: number } {
  if (activeIncidents.length === 0 && downMonitors.length === 0) {
    return { variant: "ok", count: 0 };
  }
  return { variant: "incident", count: activeIncidents.length + downMonitors.length };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("computeOverallSystemStatus", () => {
  it("returns green for empty array", () => {
    expect(computeOverallSystemStatus([])).toBe("green");
  });

  it("returns green when all monitors are green", () => {
    expect(computeOverallSystemStatus([{ level: "green" }, { level: "green" }])).toBe("green");
  });

  it("returns yellow when any monitor is yellow and none are red", () => {
    expect(computeOverallSystemStatus([{ level: "green" }, { level: "yellow" }])).toBe("yellow");
  });

  it("returns red when any monitor is red", () => {
    expect(computeOverallSystemStatus([{ level: "red" }])).toBe("red");
  });

  it("returns red when both yellow and red monitors exist", () => {
    expect(
      computeOverallSystemStatus([{ level: "green" }, { level: "yellow" }, { level: "red" }])
    ).toBe("red");
  });

  it("returns red even if only one red monitor among many green", () => {
    expect(
      computeOverallSystemStatus([{ level: "green" }, { level: "green" }, { level: "red" }])
    ).toBe("red");
  });
});

describe("buildSystemStatusLabel", () => {
  it("returns 'All Systems Operational' for green", () => {
    expect(buildSystemStatusLabel("green")).toBe("All Systems Operational");
  });

  it("returns 'Partial Degradation' for yellow", () => {
    expect(buildSystemStatusLabel("yellow")).toBe("Partial Degradation");
  });

  it("returns 'Major Outage' for red", () => {
    expect(buildSystemStatusLabel("red")).toBe("Major Outage");
  });
});

describe("buildSystemStatusSubLabel", () => {
  it("returns null for green with 0 monitors", () => {
    expect(buildSystemStatusSubLabel("green", 0, 0, 0)).toBeNull();
  });

  it("returns singular '1 monitor online' for green with 1 monitor", () => {
    expect(buildSystemStatusSubLabel("green", 1, 0, 0)).toBe("1 monitor online");
  });

  it("returns plural for green with multiple monitors", () => {
    expect(buildSystemStatusSubLabel("green", 5, 0, 0)).toBe("5 monitors online");
  });

  it("returns singular '1 monitor degraded' for yellow with 1 affected", () => {
    expect(buildSystemStatusSubLabel("yellow", 3, 0, 1)).toBe("1 monitor degraded");
  });

  it("returns plural for yellow with multiple affected", () => {
    expect(buildSystemStatusSubLabel("yellow", 5, 1, 2)).toBe("3 monitors degraded");
  });

  it("yellow uses affectedCount = degradedCount + outageCount", () => {
    expect(buildSystemStatusSubLabel("yellow", 10, 2, 3)).toBe("5 monitors degraded");
  });

  it("returns '1 monitor down' for red with no degraded (singular)", () => {
    expect(buildSystemStatusSubLabel("red", 3, 1, 0)).toBe("1 monitor down");
  });

  it("returns plural '2 monitors down' for red with no degraded", () => {
    expect(buildSystemStatusSubLabel("red", 5, 2, 0)).toBe("2 monitors down");
  });

  it("returns down + degraded for red with degraded > 0", () => {
    expect(buildSystemStatusSubLabel("red", 5, 2, 1)).toBe("2 monitors down, 1 degraded");
  });

  it("returns down + degraded plural for red with multiple degraded", () => {
    expect(buildSystemStatusSubLabel("red", 10, 3, 2)).toBe("3 monitors down, 2 degraded");
  });
});

describe("clampUptimePct", () => {
  it("clamps 99.999 to 100", () => {
    expect(clampUptimePct(99.999)).toBe(100);
  });

  it("clamps -5 to 0", () => {
    expect(clampUptimePct(-5)).toBe(0);
  });

  it("clamps 105 to 100", () => {
    expect(clampUptimePct(105)).toBe(100);
  });

  it("rounds 95.555 to 95.56", () => {
    expect(clampUptimePct(95.555)).toBe(95.56);
  });

  it("keeps 100 as 100", () => {
    expect(clampUptimePct(100)).toBe(100);
  });

  it("keeps 0 as 0", () => {
    expect(clampUptimePct(0)).toBe(0);
  });
});

describe("resolveUptimePctFromLevel", () => {
  it("returns 100 for green", () => {
    expect(resolveUptimePctFromLevel("green")).toBe(100);
  });

  it("returns 95 for yellow", () => {
    expect(resolveUptimePctFromLevel("yellow")).toBe(95.0);
  });

  it("returns 80 for red", () => {
    expect(resolveUptimePctFromLevel("red")).toBe(80.0);
  });

  it("returns 80 for undefined", () => {
    expect(resolveUptimePctFromLevel(undefined)).toBe(80.0);
  });

  it("returns 80 for unknown level", () => {
    expect(resolveUptimePctFromLevel("unknown")).toBe(80.0);
  });
});

describe("filterActiveIncidents", () => {
  it("filters out resolved incidents", () => {
    const incidents = [
      { status: "investigating" },
      { status: "resolved" },
      { status: "identified" },
    ];
    expect(filterActiveIncidents(incidents)).toHaveLength(2);
  });

  it("returns empty array when all incidents are resolved", () => {
    const incidents = [{ status: "resolved" }, { status: "resolved" }];
    expect(filterActiveIncidents(incidents)).toHaveLength(0);
  });

  it("returns all incidents when none are resolved", () => {
    const incidents = [{ status: "investigating" }, { status: "identified" }];
    expect(filterActiveIncidents(incidents)).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(filterActiveIncidents([])).toHaveLength(0);
  });

  it("is case-sensitive — RESOLVED is not filtered", () => {
    const incidents = [{ status: "RESOLVED" }, { status: "resolved" }];
    const result = filterActiveIncidents(incidents);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("RESOLVED");
  });
});

describe("getDownMonitors", () => {
  it("returns only red-level monitors", () => {
    const monitors = [{ level: "green" }, { level: "red" }, { level: "yellow" }, { level: "red" }];
    expect(getDownMonitors(monitors)).toHaveLength(2);
  });

  it("returns empty array when no red monitors", () => {
    expect(getDownMonitors([{ level: "green" }, { level: "yellow" }])).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(getDownMonitors([])).toHaveLength(0);
  });
});

describe("buildIncidentBannerState", () => {
  it("returns ok with count 0 when both arrays are empty", () => {
    expect(buildIncidentBannerState([], [])).toEqual({ variant: "ok", count: 0 });
  });

  it("returns incident variant when there are active incidents", () => {
    const result = buildIncidentBannerState([{ id: "1" }], []);
    expect(result).toEqual({ variant: "incident", count: 1 });
  });

  it("returns incident variant when there are down monitors", () => {
    const result = buildIncidentBannerState([], [{ level: "red" }]);
    expect(result).toEqual({ variant: "incident", count: 1 });
  });

  it("combines incident and down monitor counts", () => {
    const result = buildIncidentBannerState([{}, {}], [{}]);
    expect(result).toEqual({ variant: "incident", count: 3 });
  });

  it("counts all incidents and down monitors", () => {
    const result = buildIncidentBannerState([{}, {}, {}], [{}, {}]);
    expect(result.count).toBe(5);
    expect(result.variant).toBe("incident");
  });
});
