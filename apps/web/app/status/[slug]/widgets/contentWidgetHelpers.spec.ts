import { describe, it, expect } from "vitest";
import {
  SOCIAL_CONFIG_LABELS,
  SOCIAL_CONFIG_COLORS,
  type SocialPlatform,
} from "./contentWidgetHelpers";

const PLATFORMS: SocialPlatform[] = [
  "github", "twitter", "discord", "linkedin", "youtube", "mastodon", "bluesky", "website"
];

describe("SOCIAL_CONFIG_LABELS", () => {
  it("has labels for all 8 platforms", () => {
    expect(Object.keys(SOCIAL_CONFIG_LABELS)).toHaveLength(8);
  });

  it("every platform has a non-empty label", () => {
    for (const p of PLATFORMS) {
      expect(SOCIAL_CONFIG_LABELS[p]).toBeTruthy();
    }
  });

  it("github → GitHub", () => {
    expect(SOCIAL_CONFIG_LABELS.github).toBe("GitHub");
  });

  it("twitter → Twitter / X", () => {
    expect(SOCIAL_CONFIG_LABELS.twitter).toBe("Twitter / X");
  });

  it("youtube → YouTube", () => {
    expect(SOCIAL_CONFIG_LABELS.youtube).toBe("YouTube");
  });

  it("website → Website", () => {
    expect(SOCIAL_CONFIG_LABELS.website).toBe("Website");
  });

  it("all labels are distinct", () => {
    const labels = Object.values(SOCIAL_CONFIG_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("SOCIAL_CONFIG_COLORS", () => {
  it("has colors for all 8 platforms", () => {
    expect(Object.keys(SOCIAL_CONFIG_COLORS)).toHaveLength(8);
  });

  it("every platform has a non-empty color class string", () => {
    for (const p of PLATFORMS) {
      expect(SOCIAL_CONFIG_COLORS[p]).toBeTruthy();
    }
  });

  it("discord uses indigo", () => {
    expect(SOCIAL_CONFIG_COLORS.discord).toContain("indigo");
  });

  it("youtube uses red", () => {
    expect(SOCIAL_CONFIG_COLORS.youtube).toContain("red");
  });

  it("twitter uses sky", () => {
    expect(SOCIAL_CONFIG_COLORS.twitter).toContain("sky");
  });

  it("every color class includes hover:", () => {
    for (const p of PLATFORMS) {
      expect(SOCIAL_CONFIG_COLORS[p]).toContain("hover:");
    }
  });

  it("all platform colors are distinct", () => {
    const colors = Object.values(SOCIAL_CONFIG_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
