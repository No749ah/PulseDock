import { describe, it, expect } from "vitest";
import { TYPE_COLORS, NOTIFY_LABELS } from "./alertChannelsCardHelpers";

describe("TYPE_COLORS", () => {
  const channelTypes = ["email", "slack", "discord", "webhook", "telegram"] as const;

  it("has colors for 5 channel types", () => {
    expect(Object.keys(TYPE_COLORS)).toHaveLength(5);
  });

  it("every channel type has a non-empty color string", () => {
    for (const t of channelTypes) {
      expect(TYPE_COLORS[t]).toBeTruthy();
    }
  });

  it("email uses yellow", () => {
    expect(TYPE_COLORS.email).toContain("yellow");
  });

  it("slack uses green", () => {
    expect(TYPE_COLORS.slack).toContain("green");
  });

  it("discord uses indigo", () => {
    expect(TYPE_COLORS.discord).toContain("indigo");
  });

  it("webhook uses blue", () => {
    expect(TYPE_COLORS.webhook).toContain("blue");
  });

  it("telegram uses sky", () => {
    expect(TYPE_COLORS.telegram).toContain("sky");
  });

  it("all channel type colors are distinct", () => {
    const colors = Object.values(TYPE_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe("NOTIFY_LABELS", () => {
  const notifyKeys = ["ON_CHANGE", "ALWAYS", "FIRST_ONLY", "DAILY_DIGEST", "VERSION_ANY", "VERSION_MAJOR"] as const;

  it("has labels for all 6 notify modes", () => {
    expect(Object.keys(NOTIFY_LABELS)).toHaveLength(6);
  });

  it("every notify mode has a non-empty label", () => {
    for (const k of notifyKeys) {
      expect(NOTIFY_LABELS[k]).toBeTruthy();
    }
  });

  it("ON_CHANGE → On change", () => {
    expect(NOTIFY_LABELS.ON_CHANGE).toBe("On change");
  });

  it("ALWAYS → Always", () => {
    expect(NOTIFY_LABELS.ALWAYS).toBe("Always");
  });

  it("DAILY_DIGEST → Daily digest", () => {
    expect(NOTIFY_LABELS.DAILY_DIGEST).toBe("Daily digest");
  });

  it("VERSION_MAJOR → Major only", () => {
    expect(NOTIFY_LABELS.VERSION_MAJOR).toBe("Major only");
  });

  it("all labels are distinct", () => {
    const labels = Object.values(NOTIFY_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
