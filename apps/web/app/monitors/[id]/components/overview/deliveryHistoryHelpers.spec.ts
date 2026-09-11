import { describe, it, expect } from "vitest";
import { CHANNEL_TYPE_BADGE_COLORS, triggerLabel } from "./deliveryHistoryHelpers";

describe("CHANNEL_TYPE_BADGE_COLORS", () => {
  const channelTypes = ["slack", "discord", "email", "webhook", "telegram", "pagerduty", "opsgenie", "sms"] as const;

  it("has colors for 8 channel types", () => {
    expect(Object.keys(CHANNEL_TYPE_BADGE_COLORS)).toHaveLength(8);
  });

  it("every channel type has a non-empty color string", () => {
    for (const t of channelTypes) {
      expect(CHANNEL_TYPE_BADGE_COLORS[t]).toBeTruthy();
    }
  });

  it("slack uses green", () => {
    expect(CHANNEL_TYPE_BADGE_COLORS.slack).toContain("green");
  });

  it("discord uses indigo", () => {
    expect(CHANNEL_TYPE_BADGE_COLORS.discord).toContain("indigo");
  });

  it("email uses blue", () => {
    expect(CHANNEL_TYPE_BADGE_COLORS.email).toContain("blue");
  });

  it("webhook uses orange", () => {
    expect(CHANNEL_TYPE_BADGE_COLORS.webhook).toContain("orange");
  });

  it("sms uses emerald", () => {
    expect(CHANNEL_TYPE_BADGE_COLORS.sms).toContain("emerald");
  });

  it("all channel colors are distinct", () => {
    const colors = Object.values(CHANNEL_TYPE_BADGE_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe("triggerLabel", () => {
  it("monitor_failure → Failure", () => {
    expect(triggerLabel("monitor_failure")).toBe("Failure");
  });

  it("monitor_recovery → Recovery", () => {
    expect(triggerLabel("monitor_recovery")).toBe("Recovery");
  });

  it("test → Test", () => {
    expect(triggerLabel("test")).toBe("Test");
  });

  it("null → em-dash", () => {
    expect(triggerLabel(null)).toBe("—");
  });

  it("unknown trigger → capitalized first char", () => {
    expect(triggerLabel("webhook")).toBe("Webhook");
    expect(triggerLabel("custom_event")).toBe("Custom_event");
  });

  it("empty string → em-dash", () => {
    expect(triggerLabel("")).toBe("—");
  });
});
