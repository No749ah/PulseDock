import { describe, expect, it } from "vitest";
import { INPUT_BASE } from "../design-tokens";

describe("Input design primitive", () => {
  it("contains the shared interactive field states", () => {
    expect(INPUT_BASE).toContain("focus:border-accent");
    expect(INPUT_BASE).toContain("focus:ring-accent/30");
    expect(INPUT_BASE).toContain("disabled:cursor-not-allowed");
  });

  it("derives stable ids from labels", () => {
    const id = `input-${"API token".toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    expect(id).toBe("input-api-token");
  });
});
