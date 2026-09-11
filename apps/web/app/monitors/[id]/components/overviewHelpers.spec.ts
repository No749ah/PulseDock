import { describe, it, expect } from "vitest";
import {
  EVENT_COLORS,
  build90DayBuckets,
  fillDayBuckets,
  calendarCellColor,
  calendarCellTooltip,
  buildCalendarWeeks,
  computeChartAvg,
  computeChartP95,
  findClosestPoint,
  buildChartMarks,
} from "./overviewHelpers";

// ── EVENT_COLORS ─────────────────────────────────────────────────────────────

describe("EVENT_COLORS", () => {
  it("has correct color for all five event types", () => {
    expect(EVENT_COLORS.deploy).toBe("#3b82f6");
    expect(EVENT_COLORS.incident).toBe("#ef4444");
    expect(EVENT_COLORS.maintenance).toBe("#f59e0b");
    expect(EVENT_COLORS.config).toBe("#a855f7");
    expect(EVENT_COLORS.note).toBe("#6b7280");
  });

  it("has exactly 5 entries", () => {
    expect(Object.keys(EVENT_COLORS)).toHaveLength(5);
  });
});

// ── build90DayBuckets ─────────────────────────────────────────────────────────

describe("build90DayBuckets", () => {
  const now = new Date("2026-04-04T02:00:00Z");

  it("returns exactly 90 buckets", () => {
    expect(build90DayBuckets(now)).toHaveLength(90);
  });

  it("last bucket is today", () => {
    const days = build90DayBuckets(now);
    expect(days[89].date).toBe("2026-04-04");
  });

  it("first bucket is 89 days ago", () => {
    const days = build90DayBuckets(now);
    expect(days[0].date).toBe("2026-01-05");
  });

  it("all buckets start at zero ok/total", () => {
    const days = build90DayBuckets(now);
    for (const d of days) {
      expect(d.ok).toBe(0);
      expect(d.total).toBe(0);
    }
  });

  it("buckets are in ascending date order", () => {
    const days = build90DayBuckets(now);
    for (let i = 1; i < days.length; i++) {
      expect(days[i].date > days[i - 1].date).toBe(true);
    }
  });
});

// ── fillDayBuckets ────────────────────────────────────────────────────────────

describe("fillDayBuckets", () => {
  const now = new Date("2026-04-04T02:00:00Z");

  it("increments total and ok for matching days", () => {
    const days = build90DayBuckets(now);
    fillDayBuckets(days, [
      { checkedAt: "2026-04-04T01:00:00Z", ok: true },
      { checkedAt: "2026-04-04T00:30:00Z", ok: false },
    ]);
    const today = days.find((d) => d.date === "2026-04-04")!;
    expect(today.total).toBe(2);
    expect(today.ok).toBe(1);
  });

  it("ignores runs outside the 90-day window", () => {
    const days = build90DayBuckets(now);
    fillDayBuckets(days, [
      { checkedAt: "2025-01-01T00:00:00Z", ok: true },
    ]);
    const total = days.reduce((s, d) => s + d.total, 0);
    expect(total).toBe(0);
  });

  it("handles empty runs list without errors", () => {
    const days = build90DayBuckets(now);
    expect(() => fillDayBuckets(days, [])).not.toThrow();
  });

  it("accumulates multiple ok runs on same day", () => {
    const days = build90DayBuckets(now);
    fillDayBuckets(days, [
      { checkedAt: "2026-04-04T00:00:00Z", ok: true },
      { checkedAt: "2026-04-04T01:00:00Z", ok: true },
      { checkedAt: "2026-04-04T02:00:00Z", ok: true },
    ]);
    const today = days.find((d) => d.date === "2026-04-04")!;
    expect(today.total).toBe(3);
    expect(today.ok).toBe(3);
  });
});

// ── calendarCellColor ─────────────────────────────────────────────────────────

describe("calendarCellColor", () => {
  it("returns bg-surface-elevated for null", () => {
    expect(calendarCellColor(null)).toBe("bg-surface-elevated");
  });

  it("returns bg-surface-elevated for zero total", () => {
    expect(calendarCellColor({ date: "2026-04-04", ok: 0, total: 0 })).toBe("bg-surface-elevated");
  });

  it("returns green-500/80 for 100% uptime", () => {
    expect(calendarCellColor({ date: "2026-04-04", ok: 5, total: 5 })).toBe("bg-green-500/80");
  });

  it("returns green-500/50 for >=90% uptime", () => {
    expect(calendarCellColor({ date: "2026-04-04", ok: 9, total: 10 })).toBe("bg-green-500/50");
  });

  it("returns yellow-500/60 for >=50% uptime", () => {
    expect(calendarCellColor({ date: "2026-04-04", ok: 5, total: 10 })).toBe("bg-yellow-500/60");
  });

  it("returns red-500/70 for <50% uptime", () => {
    expect(calendarCellColor({ date: "2026-04-04", ok: 1, total: 10 })).toBe("bg-red-500/70");
  });

  it("boundary: exactly 90% = green/50", () => {
    expect(calendarCellColor({ date: "2026-04-04", ok: 9, total: 10 })).toBe("bg-green-500/50");
  });

  it("boundary: exactly 50% = yellow/60", () => {
    expect(calendarCellColor({ date: "2026-04-04", ok: 5, total: 10 })).toBe("bg-yellow-500/60");
  });
});

// ── calendarCellTooltip ───────────────────────────────────────────────────────

describe("calendarCellTooltip", () => {
  it("returns empty string for null", () => {
    expect(calendarCellTooltip(null)).toBe("");
  });

  it("returns 'no data' for zero total", () => {
    expect(calendarCellTooltip({ date: "2026-04-04", ok: 0, total: 0 })).toBe("2026-04-04: no data");
  });

  it("formats 100% correctly", () => {
    expect(calendarCellTooltip({ date: "2026-04-04", ok: 10, total: 10 })).toBe(
      "2026-04-04: 100% uptime (10/10 ok)",
    );
  });

  it("rounds percentage", () => {
    // 1/3 = 33.33% → rounds to 33
    expect(calendarCellTooltip({ date: "2026-04-01", ok: 1, total: 3 })).toBe(
      "2026-04-01: 33% uptime (1/3 ok)",
    );
  });

  it("formats partial uptime with correct fraction", () => {
    expect(calendarCellTooltip({ date: "2026-03-31", ok: 7, total: 10 })).toBe(
      "2026-03-31: 70% uptime (7/10 ok)",
    );
  });
});

// ── buildCalendarWeeks ────────────────────────────────────────────────────────

describe("buildCalendarWeeks", () => {
  const now = new Date("2026-04-04T02:00:00Z");

  it("every week has exactly 7 cells", () => {
    const days = build90DayBuckets(now);
    const weeks = buildCalendarWeeks(days);
    for (const wk of weeks) {
      expect(wk).toHaveLength(7);
    }
  });

  it("total non-null cells equals 90", () => {
    const days = build90DayBuckets(now);
    const weeks = buildCalendarWeeks(days);
    const count = weeks.flat().filter((c) => c !== null).length;
    expect(count).toBe(90);
  });

  it("start padding is correct for first day of week", () => {
    // 2026-01-05 is a Monday → getUTCDay() = 1 → 1 null at start
    const days = build90DayBuckets(now);
    const weeks = buildCalendarWeeks(days);
    const firstWeek = weeks[0];
    // Count leading nulls
    let leadingNulls = 0;
    for (const cell of firstWeek) {
      if (cell === null) leadingNulls++;
      else break;
    }
    const firstDay = new Date(days[0].date + "T00:00:00Z");
    expect(leadingNulls).toBe(firstDay.getUTCDay());
  });

  it("returns at least 13 weeks for 90 days", () => {
    const days = build90DayBuckets(now);
    const weeks = buildCalendarWeeks(days);
    expect(weeks.length).toBeGreaterThanOrEqual(13);
  });
});

// ── computeChartAvg ───────────────────────────────────────────────────────────

describe("computeChartAvg", () => {
  it("returns undefined for empty array", () => {
    expect(computeChartAvg([])).toBeUndefined();
  });

  it("returns undefined when all avgLatencyMs are null", () => {
    expect(
      computeChartAvg([
        { ts: "t", avgLatencyMs: null, p95LatencyMs: null, uptimePct: 100 },
      ]),
    ).toBeUndefined();
  });

  it("returns undefined when average is 0 (all-zero latencies)", () => {
    expect(
      computeChartAvg([
        { ts: "t", avgLatencyMs: 0, p95LatencyMs: null, uptimePct: 100 },
      ]),
    ).toBeUndefined();
  });

  it("rounds to nearest integer", () => {
    const data = [
      { ts: "t1", avgLatencyMs: 100, p95LatencyMs: null, uptimePct: 100 },
      { ts: "t2", avgLatencyMs: 101, p95LatencyMs: null, uptimePct: 100 },
    ];
    expect(computeChartAvg(data)).toBe(101); // (100+101)/2 = 100.5 → 101 (Math.round)
  });

  it("skips null points in average calculation", () => {
    const data = [
      { ts: "t1", avgLatencyMs: 200, p95LatencyMs: null, uptimePct: 100 },
      { ts: "t2", avgLatencyMs: null, p95LatencyMs: null, uptimePct: 100 },
    ];
    expect(computeChartAvg(data)).toBe(200);
  });
});

// ── computeChartP95 ───────────────────────────────────────────────────────────

describe("computeChartP95", () => {
  it("returns undefined for empty array", () => {
    expect(computeChartP95([])).toBeUndefined();
  });

  it("returns undefined when all p95LatencyMs are null", () => {
    expect(
      computeChartP95([{ ts: "t", avgLatencyMs: 100, p95LatencyMs: null, uptimePct: 100 }]),
    ).toBeUndefined();
  });

  it("computes average of p95 values", () => {
    const data = [
      { ts: "t1", avgLatencyMs: 50, p95LatencyMs: 300, uptimePct: 100 },
      { ts: "t2", avgLatencyMs: 50, p95LatencyMs: 500, uptimePct: 100 },
    ];
    expect(computeChartP95(data)).toBe(400);
  });

  it("skips null p95 points", () => {
    const data = [
      { ts: "t1", avgLatencyMs: 50, p95LatencyMs: 400, uptimePct: 100 },
      { ts: "t2", avgLatencyMs: 50, p95LatencyMs: null, uptimePct: 100 },
    ];
    expect(computeChartP95(data)).toBe(400);
  });
});

// ── findClosestPoint ──────────────────────────────────────────────────────────

describe("findClosestPoint", () => {
  it("returns undefined for empty array", () => {
    expect(findClosestPoint([], "2026-04-04T01:00:00Z")).toBeUndefined();
  });

  it("finds exact match", () => {
    const pts = [
      { time: "T1", value: 100, ok: true, checkedAt: "2026-04-04T01:00:00Z" },
      { time: "T2", value: 200, ok: true, checkedAt: "2026-04-04T02:00:00Z" },
    ];
    expect(findClosestPoint(pts, "2026-04-04T01:00:00Z")?.time).toBe("T1");
  });

  it("finds nearest point when no exact match", () => {
    const pts = [
      { time: "T1", value: 100, ok: true, checkedAt: "2026-04-04T01:00:00Z" },
      { time: "T2", value: 200, ok: true, checkedAt: "2026-04-04T03:00:00Z" },
    ];
    // 02:00 is equidistant; T1 is 1h before, T2 is 1h after → depends on iteration order (first wins on tie)
    expect(findClosestPoint(pts, "2026-04-04T02:00:00Z")?.time).toBe("T1");
  });

  it("returns closest point when event is before all data", () => {
    const pts = [
      { time: "T1", value: 100, ok: true, checkedAt: "2026-04-04T06:00:00Z" },
      { time: "T2", value: 200, ok: true, checkedAt: "2026-04-04T12:00:00Z" },
    ];
    expect(findClosestPoint(pts, "2026-04-04T00:00:00Z")?.time).toBe("T1");
  });
});

// ── buildChartMarks ───────────────────────────────────────────────────────────

describe("buildChartMarks", () => {
  const pts = [
    { time: "T1", value: 100, ok: true, checkedAt: "2026-04-04T01:00:00Z" },
    { time: "T2", value: 200, ok: true, checkedAt: "2026-04-04T03:00:00Z" },
  ];

  it("returns empty array when no events", () => {
    expect(buildChartMarks([], pts)).toEqual([]);
  });

  it("returns empty array when no mapped data", () => {
    const evts = [{ createdAt: "2026-04-04T02:00:00Z", eventType: "deploy" }];
    expect(buildChartMarks(evts, [])).toEqual([]);
  });

  it("filters events outside chart time range", () => {
    const evts = [{ createdAt: "2026-04-05T00:00:00Z", eventType: "deploy" }];
    expect(buildChartMarks(evts, pts)).toHaveLength(0);
  });

  it("includes events within chart time range", () => {
    const evts = [{ createdAt: "2026-04-04T02:00:00Z", eventType: "deploy" }];
    const marks = buildChartMarks(evts, pts);
    expect(marks).toHaveLength(1);
    expect(marks[0].color).toBe(EVENT_COLORS.deploy);
    expect(marks[0].label).toBe("depl");
  });

  it("uses note color for unknown event type", () => {
    const evts = [{ createdAt: "2026-04-04T02:00:00Z", eventType: "unknown_type" }];
    const marks = buildChartMarks(evts, pts);
    expect(marks[0].color).toBe(EVENT_COLORS.note);
  });

  it("label is first 4 chars of event type", () => {
    const evts = [{ createdAt: "2026-04-04T02:00:00Z", eventType: "maintenance" }];
    const marks = buildChartMarks(evts, pts);
    expect(marks[0].label).toBe("main");
  });

  it("handles multiple events correctly", () => {
    const evts = [
      { createdAt: "2026-04-04T01:30:00Z", eventType: "deploy" },
      { createdAt: "2026-04-04T02:30:00Z", eventType: "incident" },
    ];
    const marks = buildChartMarks(evts, pts);
    expect(marks).toHaveLength(2);
    expect(marks[0].color).toBe(EVENT_COLORS.deploy);
    expect(marks[1].color).toBe(EVENT_COLORS.incident);
  });
});
