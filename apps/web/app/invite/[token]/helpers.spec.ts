import { describe, it, expect } from "vitest";
import { ROLE_COLORS, ROLE_DESC } from "./helpers";

describe("ROLE_COLORS", () => {
  const roles = ["OWNER", "ADMIN", "EDITOR", "VIEWER"] as const;

  it("has colors for all 4 roles", () => {
    expect(Object.keys(ROLE_COLORS)).toHaveLength(4);
  });

  it("every role has a non-empty color class", () => {
    for (const r of roles) {
      expect(ROLE_COLORS[r]).toBeTruthy();
    }
  });

  it("OWNER uses yellow", () => {
    expect(ROLE_COLORS.OWNER).toContain("yellow");
  });

  it("ADMIN uses purple", () => {
    expect(ROLE_COLORS.ADMIN).toContain("purple");
  });

  it("EDITOR uses blue", () => {
    expect(ROLE_COLORS.EDITOR).toContain("blue");
  });

  it("VIEWER uses slate", () => {
    expect(ROLE_COLORS.VIEWER).toContain("slate");
  });

  it("all role colors are distinct", () => {
    const colors = Object.values(ROLE_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe("ROLE_DESC", () => {
  const roles = ["OWNER", "ADMIN", "EDITOR", "VIEWER"] as const;

  it("has descriptions for all 4 roles", () => {
    expect(Object.keys(ROLE_DESC)).toHaveLength(4);
  });

  it("every role has a non-empty description", () => {
    for (const r of roles) {
      expect(ROLE_DESC[r]).toBeTruthy();
    }
  });

  it("OWNER description mentions full control", () => {
    expect(ROLE_DESC.OWNER.toLowerCase()).toContain("full");
  });

  it("VIEWER description mentions read-only", () => {
    expect(ROLE_DESC.VIEWER.toLowerCase()).toContain("read");
  });

  it("all role descriptions are distinct", () => {
    const descs = Object.values(ROLE_DESC);
    expect(new Set(descs).size).toBe(descs.length);
  });
});
