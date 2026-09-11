import { describe, it, expect } from "vitest";
import { statusColor, statusLabel, formatUptime, formatLatency, type EmbedStatus } from "./helpers";

describe("statusColor", () => {
  it("returns green hex for up", () => {
    expect(statusColor("up")).toBe("#3fb950");
  });

  it("returns amber hex for degraded", () => {
    expect(statusColor("degraded")).toBe("#d29922");
  });

  it("returns red hex for down", () => {
    expect(statusColor("down")).toBe("#f85149");
  });

  it("returns gray hex for paused", () => {
    expect(statusColor("paused")).toBe("#9ca3af");
  });

  it("all 4 statuses return distinct colors", () => {
    const statuses: EmbedStatus[] = ["up", "down", "degraded", "paused"];
    const colors = statuses.map((s) => statusColor(s));
    expect(new Set(colors).size).toBe(4);
  });
});

describe("statusLabel", () => {
  it("up → Operational", () => {
    expect(statusLabel("up")).toBe("Operational");
  });

  it("degraded → Degraded", () => {
    expect(statusLabel("degraded")).toBe("Degraded");
  });

  it("down → Down", () => {
    expect(statusLabel("down")).toBe("Down");
  });

  it("paused → Paused", () => {
    expect(statusLabel("paused")).toBe("Paused");
  });

  it("all 4 statuses return distinct labels", () => {
    const statuses: EmbedStatus[] = ["up", "down", "degraded", "paused"];
    const labels = statuses.map((s) => statusLabel(s));
    expect(new Set(labels).size).toBe(4);
  });
});

describe("formatUptime", () => {
  it("formats 99.95 as 99.95%", () => {
    expect(formatUptime(99.95)).toBe("99.95%");
  });

  it("formats 100 as 100.00%", () => {
    expect(formatUptime(100)).toBe("100.00%");
  });

  it("formats 0 as 0.00%", () => {
    expect(formatUptime(0)).toBe("0.00%");
  });

  it("rounds to 2 decimal places", () => {
    expect(formatUptime(99.999)).toBe("100.00%");
  });

  it("formats 50.5 as 50.50%", () => {
    expect(formatUptime(50.5)).toBe("50.50%");
  });
});

describe("formatLatency", () => {
  it("returns em-dash for null", () => {
    expect(formatLatency(null)).toBe("—");
  });

  it("returns Xms for values < 1000", () => {
    expect(formatLatency(200)).toBe("200ms");
    expect(formatLatency(999)).toBe("999ms");
    expect(formatLatency(0)).toBe("0ms");
  });

  it("returns X.Xs for values >= 1000", () => {
    expect(formatLatency(1000)).toBe("1.0s");
    expect(formatLatency(1500)).toBe("1.5s");
    expect(formatLatency(2300)).toBe("2.3s");
  });

  it("rounds to 1 decimal place for seconds", () => {
    expect(formatLatency(1050)).toBe("1.1s");
  });
});
