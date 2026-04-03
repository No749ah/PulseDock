import { describe, it, expect } from "vitest";
import { parseVersionFromMessage, classifyVersionDiff } from "./versionWidgetHelpers";

describe("parseVersionFromMessage", () => {
  it("returns nulls for null input", () => {
    expect(parseVersionFromMessage(null)).toEqual({ current: null, latest: null });
  });

  it("returns nulls for empty string", () => {
    expect(parseVersionFromMessage("")).toEqual({ current: null, latest: null });
  });

  it("parses comma-separated version string", () => {
    expect(parseVersionFromMessage("current 1.2.3, latest 1.3.0")).toEqual({
      current: "1.2.3",
      latest: "1.3.0",
    });
  });

  it("parses space-separated version string", () => {
    expect(parseVersionFromMessage("current v2.0.0 latest v2.1.0")).toEqual({
      current: "v2.0.0",
      latest: "v2.1.0",
    });
  });

  it("is case-insensitive", () => {
    expect(parseVersionFromMessage("Current 0.9.1, Latest 0.9.1")).toEqual({
      current: "0.9.1",
      latest: "0.9.1",
    });
  });

  it("returns nulls for unrecognized text", () => {
    expect(parseVersionFromMessage("some random text")).toEqual({ current: null, latest: null });
  });

  it("parses same-version string", () => {
    expect(parseVersionFromMessage("current 1.0.0, latest 1.0.0")).toEqual({
      current: "1.0.0",
      latest: "1.0.0",
    });
  });
});

describe("classifyVersionDiff", () => {
  it("returns up-to-date when versions are identical", () => {
    expect(classifyVersionDiff("1.0.0", "1.0.0")).toBe("up-to-date");
  });

  it("detects patch update", () => {
    expect(classifyVersionDiff("1.0.0", "1.0.1")).toBe("patch");
  });

  it("detects minor update", () => {
    expect(classifyVersionDiff("1.0.0", "1.1.0")).toBe("minor");
  });

  it("detects major update", () => {
    expect(classifyVersionDiff("1.0.0", "2.0.0")).toBe("major");
  });

  it("strips v prefix before comparing — patch", () => {
    expect(classifyVersionDiff("v1.2.3", "v1.2.4")).toBe("patch");
  });

  it("strips v prefix before comparing — minor", () => {
    expect(classifyVersionDiff("v1.2.3", "v1.3.0")).toBe("minor");
  });

  it("strips v prefix before comparing — major", () => {
    expect(classifyVersionDiff("v1.2.3", "v2.0.0")).toBe("major");
  });

  it("returns up-to-date for identical versions without v prefix", () => {
    expect(classifyVersionDiff("2.0.0", "2.0.0")).toBe("up-to-date");
  });
});
