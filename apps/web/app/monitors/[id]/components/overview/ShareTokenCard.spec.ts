import { describe, it, expect } from "vitest";
import {
  buildShareTokenPath,
  buildShareJsonPath,
  copyButtonLabel,
  isTokenActionDisabled,
  generateButtonLabel,
} from "./shareTokenHelpers";

describe("buildShareTokenPath", () => {
  it("builds correct path for standard token", () => {
    expect(buildShareTokenPath("abc123")).toBe("/public/monitor/abc123");
  });

  it("builds correct path for uuid-style token", () => {
    expect(buildShareTokenPath("a1b2c3d4-e5f6-7890")).toBe(
      "/public/monitor/a1b2c3d4-e5f6-7890",
    );
  });

  it("handles empty token gracefully", () => {
    expect(buildShareTokenPath("")).toBe("/public/monitor/");
  });
});

describe("buildShareJsonPath", () => {
  it("builds correct JSON endpoint path", () => {
    expect(buildShareJsonPath("abc123")).toBe(
      "/v1/public/monitor/abc123/status.json",
    );
  });

  it("builds correct JSON endpoint for uuid token", () => {
    expect(buildShareJsonPath("tok-999")).toBe(
      "/v1/public/monitor/tok-999/status.json",
    );
  });
});

describe("copyButtonLabel", () => {
  it("returns Copied! when copied is true", () => {
    expect(copyButtonLabel(true)).toBe("Copied!");
  });

  it("returns Copy JSON URL when copied is false", () => {
    expect(copyButtonLabel(false)).toBe("Copy JSON URL");
  });
});

describe("isTokenActionDisabled", () => {
  it("returns true when loading", () => {
    expect(isTokenActionDisabled(true)).toBe(true);
  });

  it("returns false when not loading", () => {
    expect(isTokenActionDisabled(false)).toBe(false);
  });
});

describe("generateButtonLabel", () => {
  it("returns Generating… when loading", () => {
    expect(generateButtonLabel(true)).toBe("Generating…");
  });

  it("returns Generate Share Token when not loading", () => {
    expect(generateButtonLabel(false)).toBe("Generate Share Token");
  });
});
