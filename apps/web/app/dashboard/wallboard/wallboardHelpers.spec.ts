import { describe, it, expect } from "vitest";
import {
  statusOrder,
  cardBorderColor,
  cardGlowColor,
  cardBgColor,
  cardDotColor,
  cardStatusLabel,
  cardStatusTextColor,
  formatTypeBadge,
  parseRefreshInterval,
  parseColsParam,
  colsClass,
  deriveLevelFromRun,
  computeUptime24h,
  computeAvgLatency24h,
  downBannerLabel,
  computeWallboardStats,
  latencyTextColor,
  uptimeTextColor,
} from "./wallboardHelpers";

// ── statusOrder ───────────────────────────────────────────────────────────────

describe("statusOrder", () => {
  it("red → 0 (highest priority)", () => expect(statusOrder("red")).toBe(0));
  it("yellow → 1", () => expect(statusOrder("yellow")).toBe(1));
  it("green → 2", () => expect(statusOrder("green")).toBe(2));
  it("unknown → 3 (lowest priority)", () =>
    expect(statusOrder("unknown")).toBe(3));
  it("empty string → 3", () => expect(statusOrder("")).toBe(3));
  it("arbitrary string → 3", () => expect(statusOrder("purple")).toBe(3));

  it("sorts correctly: red < yellow < green < unknown", () => {
    const levels = ["unknown", "green", "red", "yellow"];
    const sorted = [...levels].sort((a, b) => statusOrder(a) - statusOrder(b));
    expect(sorted).toEqual(["red", "yellow", "green", "unknown"]);
  });
});

// ── cardBorderColor ───────────────────────────────────────────────────────────

describe("cardBorderColor", () => {
  it("red → red border", () =>
    expect(cardBorderColor("red")).toBe("border-red-500/70"));
  it("yellow → yellow border", () =>
    expect(cardBorderColor("yellow")).toBe("border-yellow-500/70"));
  it("green → green border", () =>
    expect(cardBorderColor("green")).toBe("border-green-500/40"));
  it("unknown → neutral border", () =>
    expect(cardBorderColor("unknown")).toBe("border-white/10"));
});

// ── cardGlowColor ─────────────────────────────────────────────────────────────

describe("cardGlowColor", () => {
  it("red → red glow", () =>
    expect(cardGlowColor("red")).toContain("239,68,68"));
  it("yellow → yellow glow", () =>
    expect(cardGlowColor("yellow")).toContain("234,179,8"));
  it("green → green glow", () =>
    expect(cardGlowColor("green")).toContain("34,197,94"));
  it("unknown → empty string", () => expect(cardGlowColor("unknown")).toBe(""));
});

// ── cardBgColor ───────────────────────────────────────────────────────────────

describe("cardBgColor", () => {
  it("red → red bg", () =>
    expect(cardBgColor("red")).toBe("bg-red-950/30"));
  it("yellow → yellow bg", () =>
    expect(cardBgColor("yellow")).toBe("bg-yellow-950/20"));
  it("green → subtle bg", () =>
    expect(cardBgColor("green")).toBe("bg-white/[0.03]"));
  it("unknown → subtle bg", () =>
    expect(cardBgColor("unknown")).toBe("bg-white/[0.03]"));
});

// ── cardDotColor ──────────────────────────────────────────────────────────────

describe("cardDotColor", () => {
  it("red → red dot", () => expect(cardDotColor("red")).toBe("bg-red-500"));
  it("yellow → yellow dot", () =>
    expect(cardDotColor("yellow")).toBe("bg-yellow-400"));
  it("green → green dot", () =>
    expect(cardDotColor("green")).toBe("bg-green-500"));
  it("unknown → gray dot", () =>
    expect(cardDotColor("unknown")).toBe("bg-gray-500"));
});

// ── cardStatusLabel ───────────────────────────────────────────────────────────

describe("cardStatusLabel", () => {
  it("red → DOWN", () => expect(cardStatusLabel("red")).toBe("DOWN"));
  it("yellow → DEGRADED", () =>
    expect(cardStatusLabel("yellow")).toBe("DEGRADED"));
  it("green → UP", () => expect(cardStatusLabel("green")).toBe("UP"));
  it("unknown → UNKNOWN", () =>
    expect(cardStatusLabel("unknown")).toBe("UNKNOWN"));
});

// ── cardStatusTextColor ───────────────────────────────────────────────────────

describe("cardStatusTextColor", () => {
  it("red → red text", () =>
    expect(cardStatusTextColor("red")).toBe("text-red-400"));
  it("yellow → yellow text", () =>
    expect(cardStatusTextColor("yellow")).toBe("text-yellow-400"));
  it("green → green text", () =>
    expect(cardStatusTextColor("green")).toBe("text-green-400"));
  it("unknown → gray text", () =>
    expect(cardStatusTextColor("unknown")).toBe("text-gray-400"));
});

// ── formatTypeBadge ───────────────────────────────────────────────────────────

describe("formatTypeBadge", () => {
  it("replaces underscores with spaces", () =>
    expect(formatTypeBadge("HTTP_CHECK")).toBe("HTTP CHECK"));
  it("handles multiple underscores", () =>
    expect(formatTypeBadge("GIT_RELEASE")).toBe("GIT RELEASE"));
  it("passes through plain strings", () =>
    expect(formatTypeBadge("HTTP")).toBe("HTTP"));
  it("empty string returns empty", () =>
    expect(formatTypeBadge("")).toBe(""));
});

// ── parseRefreshInterval ──────────────────────────────────────────────────────

describe("parseRefreshInterval", () => {
  it("parses valid interval", () =>
    expect(parseRefreshInterval("60")).toBe(60));
  it("defaults to 30 for null", () =>
    expect(parseRefreshInterval(null)).toBe(30));
  it("defaults to 30 for NaN", () =>
    expect(parseRefreshInterval("abc")).toBe(30));
  it("clamps minimum to 5", () =>
    expect(parseRefreshInterval("1")).toBe(5));
  it("clamps maximum to 300", () =>
    expect(parseRefreshInterval("9999")).toBe(300));
  it("accepts boundary 5", () =>
    expect(parseRefreshInterval("5")).toBe(5));
  it("accepts boundary 300", () =>
    expect(parseRefreshInterval("300")).toBe(300));
  it("clamps 0 to 5", () =>
    expect(parseRefreshInterval("0")).toBe(5));
  it("clamps negative to 5", () =>
    expect(parseRefreshInterval("-10")).toBe(5));
});

// ── parseColsParam ────────────────────────────────────────────────────────────

describe("parseColsParam", () => {
  it("parses 0 (auto)", () => expect(parseColsParam("0")).toBe(0));
  it("parses 3", () => expect(parseColsParam("3")).toBe(3));
  it("defaults to 0 for null", () => expect(parseColsParam(null)).toBe(0));
  it("defaults to 0 for NaN", () => expect(parseColsParam("abc")).toBe(0));
  it("clamps maximum to 6", () => expect(parseColsParam("9")).toBe(6));
  it("accepts boundary 6", () => expect(parseColsParam("6")).toBe(6));
  it("clamps negative to 0", () => expect(parseColsParam("-1")).toBe(0));
});

// ── colsClass ─────────────────────────────────────────────────────────────────

describe("colsClass", () => {
  it("0 → responsive auto class", () =>
    expect(colsClass(0)).toBe(
      "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    ));
  it("2 → grid-cols-2", () => expect(colsClass(2)).toBe("grid-cols-2"));
  it("3 → grid-cols-3", () => expect(colsClass(3)).toBe("grid-cols-3"));
  it("4 → grid-cols-4", () => expect(colsClass(4)).toBe("grid-cols-4"));
  it("5 → grid-cols-5", () => expect(colsClass(5)).toBe("grid-cols-5"));
  it("6 → grid-cols-6", () => expect(colsClass(6)).toBe("grid-cols-6"));
  it("1 → auto (no explicit 1-col class)", () =>
    expect(colsClass(1)).toBe(
      "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    ));
});

// ── deriveLevelFromRun ────────────────────────────────────────────────────────

describe("deriveLevelFromRun", () => {
  it("null run → unknown", () =>
    expect(deriveLevelFromRun(null)).toBe("unknown"));

  it("run with level:red → red", () =>
    expect(deriveLevelFromRun({ ok: false, level: "red" })).toBe("red"));
  it("run with level:yellow → yellow", () =>
    expect(deriveLevelFromRun({ ok: true, level: "yellow" })).toBe("yellow"));
  it("run with level:green → green", () =>
    expect(deriveLevelFromRun({ ok: true, level: "green" })).toBe("green"));

  it("run without level, ok:true → green", () =>
    expect(deriveLevelFromRun({ ok: true })).toBe("green"));
  it("run without level, ok:false → red", () =>
    expect(deriveLevelFromRun({ ok: false })).toBe("red"));

  it("level:null falls back to ok flag — ok:true → green", () =>
    expect(deriveLevelFromRun({ ok: true, level: null })).toBe("green"));
  it("level:null falls back to ok flag — ok:false → red", () =>
    expect(deriveLevelFromRun({ ok: false, level: null })).toBe("red"));
});

// ── computeUptime24h ──────────────────────────────────────────────────────────

describe("computeUptime24h", () => {
  it("empty runs → null", () => expect(computeUptime24h([])).toBeNull());

  it("all ok → 100%", () => {
    const runs = Array.from({ length: 10 }, () => ({ ok: true }));
    expect(computeUptime24h(runs)).toBe(100);
  });

  it("all failed → 0%", () => {
    const runs = Array.from({ length: 5 }, () => ({ ok: false }));
    expect(computeUptime24h(runs)).toBe(0);
  });

  it("half ok → 50%", () => {
    const runs = [
      { ok: true },
      { ok: false },
      { ok: true },
      { ok: false },
    ];
    expect(computeUptime24h(runs)).toBe(50);
  });

  it("3 of 4 ok → 75%", () => {
    const runs = [{ ok: true }, { ok: true }, { ok: true }, { ok: false }];
    expect(computeUptime24h(runs)).toBeCloseTo(75, 5);
  });

  it("single ok run → 100%", () =>
    expect(computeUptime24h([{ ok: true }])).toBe(100));
  it("single failed run → 0%", () =>
    expect(computeUptime24h([{ ok: false }])).toBe(0));
});

// ── computeAvgLatency24h ──────────────────────────────────────────────────────

describe("computeAvgLatency24h", () => {
  it("empty runs → null", () => expect(computeAvgLatency24h([])).toBeNull());

  it("all null latency → null", () =>
    expect(computeAvgLatency24h([{ latencyMs: null }, { latencyMs: null }])).toBeNull());

  it("zero latency excluded → null when all zero", () =>
    expect(computeAvgLatency24h([{ latencyMs: 0 }, { latencyMs: 0 }])).toBeNull());

  it("computes average of valid runs", () =>
    expect(
      computeAvgLatency24h([{ latencyMs: 100 }, { latencyMs: 200 }, { latencyMs: 300 }])
    ).toBe(200));

  it("skips null values in average", () =>
    expect(
      computeAvgLatency24h([{ latencyMs: 100 }, { latencyMs: null }, { latencyMs: 300 }])
    ).toBe(200));

  it("skips zero values in average", () =>
    expect(
      computeAvgLatency24h([{ latencyMs: 0 }, { latencyMs: 200 }, { latencyMs: 400 }])
    ).toBe(300));

  it("single run → its value", () =>
    expect(computeAvgLatency24h([{ latencyMs: 150 }])).toBe(150));
});

// ── downBannerLabel ───────────────────────────────────────────────────────────

describe("downBannerLabel", () => {
  it("1 monitor → singular", () =>
    expect(downBannerLabel(1)).toBe("1 monitor down"));
  it("2 monitors → plural", () =>
    expect(downBannerLabel(2)).toBe("2 monitors down"));
  it("5 monitors → plural", () =>
    expect(downBannerLabel(5)).toBe("5 monitors down"));
  it("0 monitors → plural", () =>
    expect(downBannerLabel(0)).toBe("0 monitors down"));
});

// ── computeWallboardStats ─────────────────────────────────────────────────────

describe("computeWallboardStats", () => {
  it("empty list → all zeros", () => {
    const stats = computeWallboardStats([]);
    expect(stats).toEqual({ up: 0, degraded: 0, down: 0, total: 0 });
  });

  it("mixed levels", () => {
    const items = [
      { level: "red" as const },
      { level: "red" as const },
      { level: "yellow" as const },
      { level: "green" as const },
      { level: "green" as const },
      { level: "green" as const },
      { level: "unknown" as const },
    ];
    expect(computeWallboardStats(items)).toEqual({
      up: 3,
      degraded: 1,
      down: 2,
      total: 7,
    });
  });

  it("all green", () => {
    const items = Array.from({ length: 5 }, () => ({ level: "green" as const }));
    expect(computeWallboardStats(items)).toEqual({
      up: 5,
      degraded: 0,
      down: 0,
      total: 5,
    });
  });

  it("total includes unknown", () => {
    const items = [
      { level: "unknown" as const },
      { level: "unknown" as const },
    ];
    expect(computeWallboardStats(items).total).toBe(2);
    expect(computeWallboardStats(items).up).toBe(0);
  });
});

// ── latencyTextColor ──────────────────────────────────────────────────────────

describe("latencyTextColor", () => {
  it("null → muted", () =>
    expect(latencyTextColor(null)).toBe("text-white/30"));
  it("0ms → green (boundary under 200)", () =>
    expect(latencyTextColor(0)).toBe("text-green-400"));
  it("199ms → green", () =>
    expect(latencyTextColor(199)).toBe("text-green-400"));
  it("200ms → yellow", () =>
    expect(latencyTextColor(200)).toBe("text-yellow-400"));
  it("999ms → yellow", () =>
    expect(latencyTextColor(999)).toBe("text-yellow-400"));
  it("1000ms → red", () => expect(latencyTextColor(1000)).toBe("text-red-400"));
  it("1500ms → red", () => expect(latencyTextColor(1500)).toBe("text-red-400"));
});

// ── uptimeTextColor ───────────────────────────────────────────────────────────

describe("uptimeTextColor", () => {
  it("null → muted", () => expect(uptimeTextColor(null)).toBe("text-white/30"));
  it("100% → green", () => expect(uptimeTextColor(100)).toBe("text-green-400"));
  it("99% → green (boundary)", () =>
    expect(uptimeTextColor(99)).toBe("text-green-400"));
  it("98.9% → yellow", () =>
    expect(uptimeTextColor(98.9)).toBe("text-yellow-400"));
  it("95% → yellow (boundary)", () =>
    expect(uptimeTextColor(95)).toBe("text-yellow-400"));
  it("94.9% → red", () => expect(uptimeTextColor(94.9)).toBe("text-red-400"));
  it("0% → red", () => expect(uptimeTextColor(0)).toBe("text-red-400"));
});
