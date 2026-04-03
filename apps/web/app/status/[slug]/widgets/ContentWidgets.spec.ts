import { describe, it, expect } from "vitest";
import { SOCIAL_CONFIG_LABELS, SOCIAL_CONFIG_COLORS } from "./contentWidgetHelpers";

describe("SOCIAL_CONFIG_LABELS", () => {
  it("has exactly 8 entries", () => {
    expect(Object.keys(SOCIAL_CONFIG_LABELS)).toHaveLength(8);
  });

  it("maps github to 'GitHub'", () => {
    expect(SOCIAL_CONFIG_LABELS.github).toBe("GitHub");
  });

  it("maps twitter to 'Twitter / X'", () => {
    expect(SOCIAL_CONFIG_LABELS.twitter).toBe("Twitter / X");
  });

  it("maps discord to 'Discord'", () => {
    expect(SOCIAL_CONFIG_LABELS.discord).toBe("Discord");
  });

  it("maps linkedin to 'LinkedIn'", () => {
    expect(SOCIAL_CONFIG_LABELS.linkedin).toBe("LinkedIn");
  });

  it("maps youtube to 'YouTube'", () => {
    expect(SOCIAL_CONFIG_LABELS.youtube).toBe("YouTube");
  });

  it("maps mastodon to 'Mastodon'", () => {
    expect(SOCIAL_CONFIG_LABELS.mastodon).toBe("Mastodon");
  });

  it("maps bluesky to 'Bluesky'", () => {
    expect(SOCIAL_CONFIG_LABELS.bluesky).toBe("Bluesky");
  });

  it("maps website to 'Website'", () => {
    expect(SOCIAL_CONFIG_LABELS.website).toBe("Website");
  });

  it("all labels are non-empty strings", () => {
    for (const val of Object.values(SOCIAL_CONFIG_LABELS)) {
      expect(typeof val).toBe("string");
      expect(val.length).toBeGreaterThan(0);
    }
  });
});

describe("SOCIAL_CONFIG_COLORS", () => {
  it("has exactly 8 entries", () => {
    expect(Object.keys(SOCIAL_CONFIG_COLORS)).toHaveLength(8);
  });

  it("github contains 'neutral'", () => {
    expect(SOCIAL_CONFIG_COLORS.github).toContain("neutral");
  });

  it("twitter contains 'sky-700'", () => {
    expect(SOCIAL_CONFIG_COLORS.twitter).toContain("sky-700");
  });

  it("discord contains 'indigo'", () => {
    expect(SOCIAL_CONFIG_COLORS.discord).toContain("indigo");
  });

  it("linkedin contains 'blue-800'", () => {
    expect(SOCIAL_CONFIG_COLORS.linkedin).toContain("blue-800");
  });

  it("youtube contains 'red'", () => {
    expect(SOCIAL_CONFIG_COLORS.youtube).toContain("red");
  });

  it("mastodon contains 'purple'", () => {
    expect(SOCIAL_CONFIG_COLORS.mastodon).toContain("purple");
  });

  it("bluesky contains 'sky-6'", () => {
    expect(SOCIAL_CONFIG_COLORS.bluesky).toContain("sky-6");
  });

  it("website contains 'gray'", () => {
    expect(SOCIAL_CONFIG_COLORS.website).toContain("gray");
  });
});
