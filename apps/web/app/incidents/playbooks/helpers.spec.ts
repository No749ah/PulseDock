import { describe, it, expect } from "vitest";
import { SEVERITIES, severityColors, stepTypeColors, type Severity, type StepType } from "./helpers";

describe("SEVERITIES", () => {
  it("has exactly 4 severities", () => {
    expect(SEVERITIES).toHaveLength(4);
  });

  it("contains CRITICAL, HIGH, MEDIUM, LOW in order", () => {
    expect(SEVERITIES).toEqual(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
  });

  it("all values are non-empty uppercase strings", () => {
    for (const s of SEVERITIES) {
      expect(s).toBeTruthy();
      expect(s).toBe(s.toUpperCase());
    }
  });
});

describe("severityColors", () => {
  it("has color for each severity", () => {
    const severities: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    for (const s of severities) {
      expect(severityColors[s]).toBeTruthy();
    }
  });

  it("CRITICAL uses red", () => {
    expect(severityColors.CRITICAL).toContain("red");
  });

  it("HIGH uses orange", () => {
    expect(severityColors.HIGH).toContain("orange");
  });

  it("MEDIUM uses yellow", () => {
    expect(severityColors.MEDIUM).toContain("yellow");
  });

  it("LOW uses blue", () => {
    expect(severityColors.LOW).toContain("blue");
  });

  it("all severity colors are distinct", () => {
    const colors = Object.values(severityColors);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe("stepTypeColors", () => {
  const stepTypes: StepType[] = ["check", "escalate", "runbook", "command", "notify"];

  it("has color for all 5 step types", () => {
    expect(Object.keys(stepTypeColors)).toHaveLength(5);
  });

  it("every step type has a non-empty color", () => {
    for (const t of stepTypes) {
      expect(stepTypeColors[t]).toBeTruthy();
    }
  });

  it("escalate uses red", () => {
    expect(stepTypeColors.escalate).toContain("red");
  });

  it("runbook uses purple", () => {
    expect(stepTypeColors.runbook).toContain("purple");
  });

  it("notify uses green", () => {
    expect(stepTypeColors.notify).toContain("green");
  });

  it("all step type colors are distinct", () => {
    const colors = Object.values(stepTypeColors);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
