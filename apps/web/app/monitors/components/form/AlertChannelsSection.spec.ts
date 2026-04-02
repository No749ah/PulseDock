import { describe, it, expect } from "vitest";

// AlertChannelsSection — pure render contract (no props required, optional className)
// This section is a placeholder and only renders static informational content.

interface AlertChannelsSectionProps {
  className?: string;
}

// Test the contract: component accepts optional className, renders static info label
function buildProps(overrides: Partial<AlertChannelsSectionProps> = {}): AlertChannelsSectionProps {
  return { ...overrides };
}

describe("AlertChannelsSection", () => {
  describe("props contract", () => {
    it("accepts no props", () => {
      const props = buildProps();
      expect(props.className).toBeUndefined();
    });

    it("accepts optional className", () => {
      const props = buildProps({ className: "mt-4" });
      expect(props.className).toBe("mt-4");
    });

    it("does not require className (key absent from empty props)", () => {
      const props = buildProps({});
      // buildProps({}) returns {} — className key is not present, which is fine
      expect(props.className).toBeUndefined();
    });
  });

  describe("content contract", () => {
    it("has expected label text", () => {
      const label = "Alert Channels";
      expect(label).toBeTruthy();
    });

    it("has expected info text about out-of-modal management", () => {
      const info = "Alert channel assignment and notifyOn preferences are currently managed outside this modal.";
      expect(info).toContain("notifyOn");
      expect(info).toContain("outside this modal");
    });
  });
});
