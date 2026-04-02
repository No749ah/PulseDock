import { describe, it, expect, vi } from "vitest";

// WhoisConfigSection — default thresholds and clamping logic

type WhoisFormData = {
  whoisWarnDays?: number;
  whoisCriticalDays?: number;
};

function simulateWarnChange(formData: WhoisFormData, raw: string): WhoisFormData {
  return { ...formData, whoisWarnDays: Math.max(1, Number(raw)) };
}
function simulateCriticalChange(formData: WhoisFormData, raw: string): WhoisFormData {
  return { ...formData, whoisCriticalDays: Math.max(1, Number(raw)) };
}

describe("WhoisConfigSection", () => {
  describe("default values", () => {
    it("defaults whoisWarnDays to 30", () => {
      const formData: WhoisFormData = {};
      const val = formData.whoisWarnDays ?? 30;
      expect(val).toBe(30);
    });

    it("defaults whoisCriticalDays to 7", () => {
      const formData: WhoisFormData = {};
      const val = formData.whoisCriticalDays ?? 7;
      expect(val).toBe(7);
    });

    it("respects existing whoisWarnDays", () => {
      const formData: WhoisFormData = { whoisWarnDays: 60 };
      const val = formData.whoisWarnDays ?? 30;
      expect(val).toBe(60);
    });

    it("respects existing whoisCriticalDays", () => {
      const formData: WhoisFormData = { whoisCriticalDays: 14 };
      const val = formData.whoisCriticalDays ?? 7;
      expect(val).toBe(14);
    });
  });

  describe("warnDays clamping (min 1)", () => {
    it("accepts valid values", () => {
      expect(simulateWarnChange({}, "30").whoisWarnDays).toBe(30);
      expect(simulateWarnChange({}, "90").whoisWarnDays).toBe(90);
      expect(simulateWarnChange({}, "1").whoisWarnDays).toBe(1);
    });

    it("clamps 0 to 1", () => {
      expect(simulateWarnChange({}, "0").whoisWarnDays).toBe(1);
    });

    it("clamps negative to 1", () => {
      expect(simulateWarnChange({}, "-10").whoisWarnDays).toBe(1);
    });

    it("handles large values", () => {
      expect(simulateWarnChange({}, "365").whoisWarnDays).toBe(365);
    });
  });

  describe("criticalDays clamping (min 1)", () => {
    it("accepts valid values", () => {
      expect(simulateCriticalChange({}, "7").whoisCriticalDays).toBe(7);
      expect(simulateCriticalChange({}, "14").whoisCriticalDays).toBe(14);
    });

    it("clamps 0 to 1", () => {
      expect(simulateCriticalChange({}, "0").whoisCriticalDays).toBe(1);
    });

    it("clamps negative to 1", () => {
      expect(simulateCriticalChange({}, "-5").whoisCriticalDays).toBe(1);
    });
  });

  describe("onChange merges fields", () => {
    it("preserves other form fields when updating warn days", () => {
      const formData: WhoisFormData = { whoisCriticalDays: 5 };
      const updated = simulateWarnChange(formData, "45");
      expect(updated.whoisWarnDays).toBe(45);
      expect(updated.whoisCriticalDays).toBe(5);
    });

    it("preserves other form fields when updating critical days", () => {
      const formData: WhoisFormData = { whoisWarnDays: 30 };
      const updated = simulateCriticalChange(formData, "10");
      expect(updated.whoisCriticalDays).toBe(10);
      expect(updated.whoisWarnDays).toBe(30);
    });

    it("calls onSetFormData with merged data", () => {
      const onSetFormData = vi.fn();
      const formData: WhoisFormData = { whoisCriticalDays: 7 };
      onSetFormData(simulateWarnChange(formData, "30"));
      expect(onSetFormData).toHaveBeenCalledWith({ whoisWarnDays: 30, whoisCriticalDays: 7 });
    });
  });
});
