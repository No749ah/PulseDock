import { describe, it, expect } from "vitest";
import { METHOD_COLORS } from "./openApiImportHelpers";

describe("METHOD_COLORS", () => {
  const methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"] as const;

  it("has colors for 6 HTTP methods", () => {
    expect(Object.keys(METHOD_COLORS)).toHaveLength(6);
  });

  it("every method has a non-empty color string", () => {
    for (const m of methods) {
      expect(METHOD_COLORS[m]).toBeTruthy();
    }
  });

  it("GET uses blue", () => {
    expect(METHOD_COLORS.GET).toContain("blue");
  });

  it("POST uses green", () => {
    expect(METHOD_COLORS.POST).toContain("green");
  });

  it("PUT uses amber", () => {
    expect(METHOD_COLORS.PUT).toContain("amber");
  });

  it("DELETE uses red", () => {
    expect(METHOD_COLORS.DELETE).toContain("red");
  });

  it("PATCH uses purple", () => {
    expect(METHOD_COLORS.PATCH).toContain("purple");
  });

  it("HEAD uses slate", () => {
    expect(METHOD_COLORS.HEAD).toContain("slate");
  });

  it("all method colors are distinct", () => {
    const colors = Object.values(METHOD_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
