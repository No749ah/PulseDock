import { describe, it, expect } from "vitest";
import { METHODS, statusColor, hasBody } from "./playgroundHelpers";

describe("METHODS", () => {
  it("has 5 HTTP methods", () => {
    expect(METHODS).toHaveLength(5);
  });

  it("contains GET, POST, PUT, DELETE, PATCH", () => {
    expect(METHODS).toContain("GET");
    expect(METHODS).toContain("POST");
    expect(METHODS).toContain("PUT");
    expect(METHODS).toContain("DELETE");
    expect(METHODS).toContain("PATCH");
  });

  it("all methods are non-empty strings", () => {
    for (const m of METHODS) {
      expect(m).toBeTruthy();
    }
  });
});

describe("statusColor", () => {
  it("returns emerald for 2xx codes", () => {
    expect(statusColor(200)).toContain("emerald");
    expect(statusColor(201)).toContain("emerald");
    expect(statusColor(299)).toContain("emerald");
  });

  it("returns amber for 3xx codes", () => {
    expect(statusColor(300)).toContain("amber");
    expect(statusColor(301)).toContain("amber");
    expect(statusColor(399)).toContain("amber");
  });

  it("returns red for 4xx codes", () => {
    expect(statusColor(400)).toContain("red");
    expect(statusColor(404)).toContain("red");
  });

  it("returns red for 5xx codes", () => {
    expect(statusColor(500)).toContain("red");
    expect(statusColor(503)).toContain("red");
  });

  it("returns red for 1xx codes (not 2xx or 3xx)", () => {
    expect(statusColor(100)).toContain("red");
  });

  it("2xx, 3xx, 4xx+ return 3 distinct color families", () => {
    const c2 = statusColor(200);
    const c3 = statusColor(301);
    const c4 = statusColor(404);
    expect(c2).not.toBe(c3);
    expect(c3).not.toBe(c4);
    expect(c2).not.toBe(c4);
  });
});

describe("hasBody", () => {
  it("returns true for POST", () => {
    expect(hasBody("POST")).toBe(true);
  });

  it("returns true for PUT", () => {
    expect(hasBody("PUT")).toBe(true);
  });

  it("returns true for PATCH", () => {
    expect(hasBody("PATCH")).toBe(true);
  });

  it("returns false for GET", () => {
    expect(hasBody("GET")).toBe(false);
  });

  it("returns false for DELETE", () => {
    expect(hasBody("DELETE")).toBe(false);
  });

  it("returns false for HEAD", () => {
    expect(hasBody("HEAD")).toBe(false);
  });

  it("returns false for OPTIONS", () => {
    expect(hasBody("OPTIONS")).toBe(false);
  });
});
