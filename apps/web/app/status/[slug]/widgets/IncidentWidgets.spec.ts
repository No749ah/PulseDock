// Pure-logic unit tests for IncidentWidgets
// Logic mirrored inline — no React/DOM rendering
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Pure logic extracted from IncidentWidgets.tsx ────────────────────────

// filterActiveIncidents — filters where status !== "resolved" (lowercase exact match)
function filterActiveIncidents(incidents: Array<{ status: string }>): Array<{ status: string }> {
  return incidents.filter((i) => i.status !== "resolved");
}

// formatIncidentDuration — mirrors IncidentTimeline's inline formatDuration logic
// resolved: compute ms diff between createdAt and resolvedAt, format
// not resolved: "Ongoing"
function formatIncidentDuration(createdAt: string, resolvedAt: string | null): string {
  if (!resolvedAt) return "Ongoing";
  const ms = new Date(resolvedAt).getTime() - new Date(createdAt).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

// getMaintenanceStatus — mirrors ScheduledMaintenance component inline logic
function getMaintenanceStatus(
  maintenance: { startsAt: string; endsAt: string },
  now: Date
): "upcoming" | "active" | "completed" {
  const start = new Date(maintenance.startsAt).getTime();
  const end = new Date(maintenance.endsAt).getTime();
  const nowMs = now.getTime();
  if (nowMs < start) return "upcoming";
  if (nowMs >= start && nowMs <= end) return "active";
  return "completed";
}

// countIncidentsByStatus
function countIncidentsByStatus(incidents: Array<{ status: string }>): {
  open: number;
  resolved: number;
  total: number;
} {
  const resolved = incidents.filter((i) => i.status === "resolved").length;
  const open = incidents.length - resolved;
  return { open, resolved, total: incidents.length };
}

// getIncidentPluralLabel
function getIncidentPluralLabel(count: number): string {
  return count === 1 ? "Active Incident" : "Active Incidents";
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("filterActiveIncidents", () => {
  it("filters out lowercase 'resolved' incidents", () => {
    const incidents = [
      { status: "investigating" },
      { status: "resolved" },
      { status: "identified" },
    ];
    expect(filterActiveIncidents(incidents)).toHaveLength(2);
  });

  it("does NOT filter out uppercase 'RESOLVED' (case-sensitive)", () => {
    const incidents = [{ status: "RESOLVED" }, { status: "resolved" }];
    const result = filterActiveIncidents(incidents);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("RESOLVED");
  });

  it("returns empty array when all resolved", () => {
    expect(filterActiveIncidents([{ status: "resolved" }, { status: "resolved" }])).toHaveLength(0);
  });

  it("returns all when none are resolved", () => {
    const incidents = [{ status: "investigating" }, { status: "monitoring" }];
    expect(filterActiveIncidents(incidents)).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(filterActiveIncidents([])).toHaveLength(0);
  });

  it("keeps 'monitoring' status as active", () => {
    const result = filterActiveIncidents([{ status: "monitoring" }]);
    expect(result).toHaveLength(1);
  });
});

describe("formatIncidentDuration", () => {
  it("returns 'Ongoing' when resolvedAt is null", () => {
    expect(formatIncidentDuration("2024-01-01T10:00:00Z", null)).toBe("Ongoing");
  });

  it("formats duration < 60min as 'Xm'", () => {
    const created = "2024-01-01T10:00:00Z";
    const resolved = "2024-01-01T10:45:00Z"; // 45 minutes
    expect(formatIncidentDuration(created, resolved)).toBe("45m");
  });

  it("formats duration of exactly 60min as '1h'", () => {
    const created = "2024-01-01T10:00:00Z";
    const resolved = "2024-01-01T11:00:00Z"; // 60 minutes = 1h exactly
    expect(formatIncidentDuration(created, resolved)).toBe("1h");
  });

  it("formats duration of 1h 30m as '1h 30m'", () => {
    const created = "2024-01-01T10:00:00Z";
    const resolved = "2024-01-01T11:30:00Z"; // 90 minutes
    expect(formatIncidentDuration(created, resolved)).toBe("1h 30m");
  });

  it("formats duration of exactly 2h as '2h'", () => {
    const created = "2024-01-01T10:00:00Z";
    const resolved = "2024-01-01T12:00:00Z"; // 120 minutes
    expect(formatIncidentDuration(created, resolved)).toBe("2h");
  });

  it("formats duration of 0 minutes as '0m'", () => {
    const created = "2024-01-01T10:00:00Z";
    const resolved = "2024-01-01T10:00:00Z";
    expect(formatIncidentDuration(created, resolved)).toBe("0m");
  });

  it("formats duration of 5 minutes as '5m'", () => {
    const created = "2024-01-01T10:00:00Z";
    const resolved = "2024-01-01T10:05:00Z";
    expect(formatIncidentDuration(created, resolved)).toBe("5m");
  });

  it("formats duration of 3h 15m correctly", () => {
    const created = "2024-01-01T08:00:00Z";
    const resolved = "2024-01-01T11:15:00Z"; // 3h 15m
    expect(formatIncidentDuration(created, resolved)).toBe("3h 15m");
  });
});

describe("getMaintenanceStatus", () => {
  const maintenance = {
    startsAt: "2024-06-01T10:00:00Z",
    endsAt: "2024-06-01T12:00:00Z",
  };

  it("returns 'upcoming' when now is before startsAt", () => {
    const now = new Date("2024-06-01T09:00:00Z");
    expect(getMaintenanceStatus(maintenance, now)).toBe("upcoming");
  });

  it("returns 'active' when now is exactly at startsAt", () => {
    const now = new Date("2024-06-01T10:00:00Z");
    expect(getMaintenanceStatus(maintenance, now)).toBe("active");
  });

  it("returns 'active' when now is between startsAt and endsAt", () => {
    const now = new Date("2024-06-01T11:00:00Z");
    expect(getMaintenanceStatus(maintenance, now)).toBe("active");
  });

  it("returns 'active' when now is exactly at endsAt", () => {
    const now = new Date("2024-06-01T12:00:00Z");
    expect(getMaintenanceStatus(maintenance, now)).toBe("active");
  });

  it("returns 'completed' when now is after endsAt", () => {
    const now = new Date("2024-06-01T13:00:00Z");
    expect(getMaintenanceStatus(maintenance, now)).toBe("completed");
  });

  it("returns 'completed' when now is well after maintenance window", () => {
    const now = new Date("2024-07-01T00:00:00Z");
    expect(getMaintenanceStatus(maintenance, now)).toBe("completed");
  });
});

describe("countIncidentsByStatus", () => {
  it("returns zeros for empty array", () => {
    expect(countIncidentsByStatus([])).toEqual({ open: 0, resolved: 0, total: 0 });
  });

  it("counts resolved and open correctly", () => {
    const incidents = [
      { status: "investigating" },
      { status: "resolved" },
      { status: "resolved" },
      { status: "monitoring" },
    ];
    expect(countIncidentsByStatus(incidents)).toEqual({ open: 2, resolved: 2, total: 4 });
  });

  it("counts all as open when none are resolved", () => {
    const incidents = [{ status: "investigating" }, { status: "identified" }];
    expect(countIncidentsByStatus(incidents)).toEqual({ open: 2, resolved: 0, total: 2 });
  });

  it("counts all as resolved when all are resolved", () => {
    const incidents = [{ status: "resolved" }, { status: "resolved" }];
    expect(countIncidentsByStatus(incidents)).toEqual({ open: 0, resolved: 2, total: 2 });
  });

  it("total equals open + resolved", () => {
    const incidents = [
      { status: "investigating" },
      { status: "resolved" },
    ];
    const result = countIncidentsByStatus(incidents);
    expect(result.total).toBe(result.open + result.resolved);
  });
});

describe("getIncidentPluralLabel", () => {
  it("returns 'Active Incident' for count 1", () => {
    expect(getIncidentPluralLabel(1)).toBe("Active Incident");
  });

  it("returns 'Active Incidents' for count 2", () => {
    expect(getIncidentPluralLabel(2)).toBe("Active Incidents");
  });

  it("returns 'Active Incidents' for count 0", () => {
    expect(getIncidentPluralLabel(0)).toBe("Active Incidents");
  });

  it("returns 'Active Incidents' for large count", () => {
    expect(getIncidentPluralLabel(10)).toBe("Active Incidents");
  });
});
