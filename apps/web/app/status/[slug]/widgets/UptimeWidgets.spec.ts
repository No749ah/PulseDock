// Pure-logic unit tests for UptimeWidgets
// Logic mirrored inline — no React/DOM rendering
import { describe, it, expect } from "vitest";

// ── Pure logic extracted from UptimeWidgets.tsx ──────────────────────────

function resolveUptimePct(
  widgetData: { uptimePct?: number } | undefined,
  monitor: { level: string } | undefined
): number {
  const uptimePctRaw =
    widgetData?.uptimePct ??
    (!monitor ? 100 : monitor.level === "green" ? 100 : monitor.level === "yellow" ? 95.0 : 80.0);
  return Math.max(0, Math.min(100, Math.round(uptimePctRaw * 100) / 100));
}

function resolvePeriodDays(
  widgetData: { periodDays?: number } | undefined,
  configPeriodDays: number | undefined
): number {
  return widgetData?.periodDays ?? configPeriodDays ?? 30;
}

function uptimeBorderColor(uptimePct: number): string {
  if (uptimePct >= 99.5) return "border-green-500/20";
  if (uptimePct >= 90) return "border-yellow-500/20";
  return "border-red-500/30";
}

function resolveUptimeLabel(
  configLabel: string | undefined,
  monitorName: string | undefined
): string {
  return configLabel ?? monitorName ?? "Uptime";
}

function formatUptimePct(pct: number): string {
  return pct.toFixed(2);
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("resolveUptimePct", () => {
  it("uses widgetData.uptimePct when present", () => {
    expect(resolveUptimePct({ uptimePct: 98.5 }, { level: "green" })).toBe(98.5);
  });

  it("clamps widgetData.uptimePct above 100", () => {
    expect(resolveUptimePct({ uptimePct: 105 }, undefined)).toBe(100);
  });

  it("clamps widgetData.uptimePct below 0", () => {
    expect(resolveUptimePct({ uptimePct: -5 }, undefined)).toBe(0);
  });

  it("falls back to 100 for green monitor when no widgetData", () => {
    expect(resolveUptimePct(undefined, { level: "green" })).toBe(100);
  });

  it("falls back to 95 for yellow monitor when no widgetData", () => {
    expect(resolveUptimePct(undefined, { level: "yellow" })).toBe(95.0);
  });

  it("falls back to 80 for red monitor when no widgetData", () => {
    expect(resolveUptimePct(undefined, { level: "red" })).toBe(80.0);
  });

  it("falls back to 100 when no widgetData and no monitor", () => {
    expect(resolveUptimePct(undefined, undefined)).toBe(100);
  });

  it("uses widgetData.uptimePct even when monitor is red", () => {
    expect(resolveUptimePct({ uptimePct: 75 }, { level: "red" })).toBe(75);
  });

  it("rounds fractional uptimePct correctly", () => {
    expect(resolveUptimePct({ uptimePct: 95.555 }, undefined)).toBe(95.56);
  });
});

describe("resolvePeriodDays", () => {
  it("uses widgetData.periodDays when present", () => {
    expect(resolvePeriodDays({ periodDays: 7 }, 30)).toBe(7);
  });

  it("falls back to configPeriodDays when widgetData has no periodDays", () => {
    expect(resolvePeriodDays({}, 14)).toBe(14);
  });

  it("falls back to 30 when both are undefined", () => {
    expect(resolvePeriodDays(undefined, undefined)).toBe(30);
  });

  it("falls back to 30 when widgetData is undefined and configPeriodDays is undefined", () => {
    expect(resolvePeriodDays(undefined, undefined)).toBe(30);
  });

  it("uses configPeriodDays when widgetData is undefined", () => {
    expect(resolvePeriodDays(undefined, 90)).toBe(90);
  });

  it("prefers widgetData.periodDays over configPeriodDays", () => {
    expect(resolvePeriodDays({ periodDays: 60 }, 90)).toBe(60);
  });
});

describe("uptimeBorderColor", () => {
  it("returns green border for 100%", () => {
    expect(uptimeBorderColor(100)).toContain("green");
  });

  it("returns green border for exactly 99.5%", () => {
    expect(uptimeBorderColor(99.5)).toContain("green");
  });

  it("returns yellow border for 99.4%", () => {
    expect(uptimeBorderColor(99.4)).toContain("yellow");
  });

  it("returns yellow border for exactly 90%", () => {
    expect(uptimeBorderColor(90)).toContain("yellow");
  });

  it("returns red border for 89.9%", () => {
    expect(uptimeBorderColor(89.9)).toContain("red");
  });

  it("returns red border for 0%", () => {
    expect(uptimeBorderColor(0)).toContain("red");
  });

  it("returns yellow border for 95%", () => {
    expect(uptimeBorderColor(95)).toContain("yellow");
  });
});

describe("resolveUptimeLabel", () => {
  it("uses configLabel when defined", () => {
    expect(resolveUptimeLabel("My Service", "Monitor Name")).toBe("My Service");
  });

  it("uses monitorName when configLabel is undefined", () => {
    expect(resolveUptimeLabel(undefined, "Monitor Name")).toBe("Monitor Name");
  });

  it("falls back to 'Uptime' when both are undefined", () => {
    expect(resolveUptimeLabel(undefined, undefined)).toBe("Uptime");
  });

  it("uses empty configLabel string as-is", () => {
    expect(resolveUptimeLabel("", "Monitor Name")).toBe("");
  });
});

describe("formatUptimePct", () => {
  it("formats 100 as '100.00'", () => {
    expect(formatUptimePct(100)).toBe("100.00");
  });

  it("formats 99.5 as '99.50'", () => {
    expect(formatUptimePct(99.5)).toBe("99.50");
  });

  it("formats 0 as '0.00'", () => {
    expect(formatUptimePct(0)).toBe("0.00");
  });

  it("formats 95.123 as '95.12' (toFixed truncation)", () => {
    expect(formatUptimePct(95.123)).toBe("95.12");
  });

  it("formats 99.999 as '100.00'", () => {
    expect(formatUptimePct(99.999)).toBe("100.00");
  });
});
