import { describe, it, expect, vi } from "vitest";

// BrowserConfigSection — expected text, CSS selector, and allowed status codes

type BrowserFormData = {
  browserExpectedText?: string;
  browserSelector?: string;
  browserStatusCodesRaw?: string;
};

function simulateExpectedTextChange(formData: BrowserFormData, value: string): BrowserFormData {
  return { ...formData, browserExpectedText: value };
}
function simulateSelectorChange(formData: BrowserFormData, value: string): BrowserFormData {
  return { ...formData, browserSelector: value };
}
function simulateStatusCodesChange(formData: BrowserFormData, value: string): BrowserFormData {
  return { ...formData, browserStatusCodesRaw: value };
}

describe("BrowserConfigSection", () => {
  describe("default values", () => {
    it("browserExpectedText defaults to empty string", () => {
      const val = ({} as BrowserFormData).browserExpectedText ?? "";
      expect(val).toBe("");
    });

    it("browserSelector defaults to empty string", () => {
      const val = ({} as BrowserFormData).browserSelector ?? "";
      expect(val).toBe("");
    });

    it("browserStatusCodesRaw defaults to empty string", () => {
      const val = ({} as BrowserFormData).browserStatusCodesRaw ?? "";
      expect(val).toBe("");
    });

    it("respects pre-set browserExpectedText", () => {
      const formData: BrowserFormData = { browserExpectedText: "Welcome" };
      expect(formData.browserExpectedText ?? "").toBe("Welcome");
    });

    it("respects pre-set browserSelector", () => {
      const formData: BrowserFormData = { browserSelector: "#app" };
      expect(formData.browserSelector ?? "").toBe("#app");
    });
  });

  describe("expectedText field", () => {
    it("sets text assertion", () => {
      expect(simulateExpectedTextChange({}, "Dashboard").browserExpectedText).toBe("Dashboard");
    });

    it("clears text assertion", () => {
      const formData: BrowserFormData = { browserExpectedText: "Welcome" };
      expect(simulateExpectedTextChange(formData, "").browserExpectedText).toBe("");
    });

    it("handles special characters", () => {
      const text = '<script>alert("xss")</script>';
      expect(simulateExpectedTextChange({}, text).browserExpectedText).toBe(text);
    });
  });

  describe("CSS selector field", () => {
    const validSelectors = [
      "#app",
      ".nav-bar",
      "main",
      "[data-testid=\"login\"]",
      "div.container",
      "header#top",
    ];

    it.each(validSelectors)("accepts selector: %s", (selector) => {
      expect(simulateSelectorChange({}, selector).browserSelector).toBe(selector);
    });

    it("clears selector", () => {
      const formData: BrowserFormData = { browserSelector: "#app" };
      expect(simulateSelectorChange(formData, "").browserSelector).toBe("");
    });
  });

  describe("statusCodesRaw field", () => {
    it("sets comma-separated status codes", () => {
      expect(simulateStatusCodesChange({}, "200, 301, 302").browserStatusCodesRaw).toBe("200, 301, 302");
    });

    it("clears status codes (accept all 2xx/3xx by default)", () => {
      const formData: BrowserFormData = { browserStatusCodesRaw: "200" };
      expect(simulateStatusCodesChange(formData, "").browserStatusCodesRaw).toBe("");
    });

    it("accepts single status code", () => {
      expect(simulateStatusCodesChange({}, "200").browserStatusCodesRaw).toBe("200");
    });
  });

  describe("onChange preserves other fields", () => {
    it("preserves selector when updating expectedText", () => {
      const formData: BrowserFormData = { browserSelector: "#app" };
      const updated = simulateExpectedTextChange(formData, "Hello");
      expect(updated.browserExpectedText).toBe("Hello");
      expect(updated.browserSelector).toBe("#app");
    });

    it("preserves all fields when updating status codes", () => {
      const formData: BrowserFormData = {
        browserExpectedText: "Welcome",
        browserSelector: ".main",
      };
      const updated = simulateStatusCodesChange(formData, "200, 204");
      expect(updated.browserStatusCodesRaw).toBe("200, 204");
      expect(updated.browserExpectedText).toBe("Welcome");
      expect(updated.browserSelector).toBe(".main");
    });

    it("calls onSetFormData with merged data", () => {
      const onSetFormData = vi.fn();
      const formData: BrowserFormData = { browserSelector: "#main" };
      onSetFormData(simulateExpectedTextChange(formData, "Ready"));
      expect(onSetFormData).toHaveBeenCalledWith({
        browserSelector: "#main",
        browserExpectedText: "Ready",
      });
    });
  });
});
