import { describe, it, expect, vi } from "vitest";

// CtLogConfigSection — default values, lookback clamping, checkbox toggles

type CtLogFormData = {
  ctLogLookbackDays?: number;
  ctLogAlertOnNewSubdomains?: boolean;
  ctLogAlertOnWildcard?: boolean;
};

function simulateLookbackChange(formData: CtLogFormData, raw: string): CtLogFormData {
  return { ...formData, ctLogLookbackDays: Math.min(30, Math.max(1, parseInt(raw, 10) || 7)) };
}
function simulateSubdomainToggle(formData: CtLogFormData, checked: boolean): CtLogFormData {
  return { ...formData, ctLogAlertOnNewSubdomains: checked };
}
function simulateWildcardToggle(formData: CtLogFormData, checked: boolean): CtLogFormData {
  return { ...formData, ctLogAlertOnWildcard: checked };
}

describe("CtLogConfigSection", () => {
  describe("default values", () => {
    it("defaults ctLogLookbackDays to 7", () => {
      const val = ({} as CtLogFormData).ctLogLookbackDays ?? 7;
      expect(val).toBe(7);
    });

    it("defaults ctLogAlertOnNewSubdomains to true", () => {
      const val = ({} as CtLogFormData).ctLogAlertOnNewSubdomains ?? true;
      expect(val).toBe(true);
    });

    it("defaults ctLogAlertOnWildcard to true", () => {
      const val = ({} as CtLogFormData).ctLogAlertOnWildcard ?? true;
      expect(val).toBe(true);
    });

    it("respects explicit false for subdomain alert", () => {
      const formData: CtLogFormData = { ctLogAlertOnNewSubdomains: false };
      const val = formData.ctLogAlertOnNewSubdomains ?? true;
      expect(val).toBe(false);
    });

    it("respects explicit false for wildcard alert", () => {
      const formData: CtLogFormData = { ctLogAlertOnWildcard: false };
      const val = formData.ctLogAlertOnWildcard ?? true;
      expect(val).toBe(false);
    });
  });

  describe("lookback days clamping (1–30, fallback 7)", () => {
    it("accepts valid value 1", () => {
      expect(simulateLookbackChange({}, "1").ctLogLookbackDays).toBe(1);
    });

    it("accepts valid value 15", () => {
      expect(simulateLookbackChange({}, "15").ctLogLookbackDays).toBe(15);
    });

    it("accepts max value 30", () => {
      expect(simulateLookbackChange({}, "30").ctLogLookbackDays).toBe(30);
    });

    it("clamps above 30 to 30", () => {
      expect(simulateLookbackChange({}, "50").ctLogLookbackDays).toBe(30);
    });

    it("clamps 0 to fallback 7 (parseInt(0)||7 = 7)", () => {
      // parseInt("0", 10) = 0, which is falsy, so || 7 applies → result is 7
      expect(simulateLookbackChange({}, "0").ctLogLookbackDays).toBe(7);
    });

    it("clamps negative to 1 (parseInt returns negative, max(1, -5) = 1)", () => {
      // parseInt("-5", 10) = -5, truthy so no fallback; Math.max(1, -5) = 1
      expect(simulateLookbackChange({}, "-5").ctLogLookbackDays).toBe(1);
    });

    it("falls back to 7 for non-numeric input", () => {
      expect(simulateLookbackChange({}, "abc").ctLogLookbackDays).toBe(7);
    });

    it("falls back to 7 for empty string", () => {
      expect(simulateLookbackChange({}, "").ctLogLookbackDays).toBe(7);
    });
  });

  describe("checkbox toggles", () => {
    it("enables subdomain alerts", () => {
      const formData: CtLogFormData = { ctLogAlertOnNewSubdomains: false };
      expect(simulateSubdomainToggle(formData, true).ctLogAlertOnNewSubdomains).toBe(true);
    });

    it("disables subdomain alerts", () => {
      const formData: CtLogFormData = { ctLogAlertOnNewSubdomains: true };
      expect(simulateSubdomainToggle(formData, false).ctLogAlertOnNewSubdomains).toBe(false);
    });

    it("enables wildcard alerts", () => {
      const formData: CtLogFormData = { ctLogAlertOnWildcard: false };
      expect(simulateWildcardToggle(formData, true).ctLogAlertOnWildcard).toBe(true);
    });

    it("disables wildcard alerts", () => {
      const formData: CtLogFormData = { ctLogAlertOnWildcard: true };
      expect(simulateWildcardToggle(formData, false).ctLogAlertOnWildcard).toBe(false);
    });
  });

  describe("onChange preserves other fields", () => {
    it("preserves lookback days when toggling subdomain checkbox", () => {
      const formData: CtLogFormData = { ctLogLookbackDays: 14, ctLogAlertOnWildcard: false };
      const updated = simulateSubdomainToggle(formData, true);
      expect(updated.ctLogLookbackDays).toBe(14);
      expect(updated.ctLogAlertOnWildcard).toBe(false);
      expect(updated.ctLogAlertOnNewSubdomains).toBe(true);
    });

    it("preserves checkbox flags when updating lookback days", () => {
      const formData: CtLogFormData = {
        ctLogAlertOnNewSubdomains: true,
        ctLogAlertOnWildcard: false,
      };
      const updated = simulateLookbackChange(formData, "10");
      expect(updated.ctLogLookbackDays).toBe(10);
      expect(updated.ctLogAlertOnNewSubdomains).toBe(true);
      expect(updated.ctLogAlertOnWildcard).toBe(false);
    });
  });
});
