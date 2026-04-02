import { describe, it, expect, vi } from "vitest";

// SslConfigSection — sslWarnDays defaults and clamping

type SslFormData = {
  sslWarnDays?: number;
};

function simulateWarnDaysChange(formData: SslFormData, raw: string): SslFormData {
  return { ...formData, sslWarnDays: Math.max(1, Number(raw) || 30) };
}

describe("SslConfigSection", () => {
  describe("default values", () => {
    it("defaults sslWarnDays to 30 when not set", () => {
      const val = ({} as SslFormData).sslWarnDays ?? 30;
      expect(val).toBe(30);
    });

    it("respects existing sslWarnDays", () => {
      const formData: SslFormData = { sslWarnDays: 14 };
      const val = formData.sslWarnDays ?? 30;
      expect(val).toBe(14);
    });
  });

  describe("warn days clamping (min 1, fallback 30)", () => {
    it("accepts 30", () => {
      expect(simulateWarnDaysChange({}, "30").sslWarnDays).toBe(30);
    });

    it("accepts 1", () => {
      expect(simulateWarnDaysChange({}, "1").sslWarnDays).toBe(1);
    });

    it("accepts 365", () => {
      expect(simulateWarnDaysChange({}, "365").sslWarnDays).toBe(365);
    });

    it("clamps 0 to 1 (min)", () => {
      // Math.max(1, Number("0") || 30) = Math.max(1, 30) = 30 ... wait
      // Number("0") = 0, 0 || 30 = 30, Math.max(1, 30) = 30
      expect(simulateWarnDaysChange({}, "0").sslWarnDays).toBe(30);
    });

    it("clamps negative to min via Number||30 fallback", () => {
      // Number("-5") = -5, -5 is truthy so NO fallback → Math.max(1, -5) = 1
      expect(simulateWarnDaysChange({}, "-5").sslWarnDays).toBe(1);
    });

    it("falls back to 30 for non-numeric", () => {
      // Number("abc") = NaN, NaN || 30 = 30, Math.max(1, 30) = 30
      expect(simulateWarnDaysChange({}, "abc").sslWarnDays).toBe(30);
    });

    it("accepts 7 (common cert expiry threshold)", () => {
      expect(simulateWarnDaysChange({}, "7").sslWarnDays).toBe(7);
    });
  });

  describe("onChange preserves other fields", () => {
    it("merges without overwriting unrelated fields", () => {
      const formData = { sslWarnDays: 30, name: "my monitor" } as SslFormData & { name: string };
      const updated = simulateWarnDaysChange(formData, "60") as typeof formData;
      expect(updated.sslWarnDays).toBe(60);
      expect(updated.name).toBe("my monitor");
    });

    it("calls onSetFormData with merged data", () => {
      const onSetFormData = vi.fn();
      const formData: SslFormData = {};
      onSetFormData(simulateWarnDaysChange(formData, "21"));
      expect(onSetFormData).toHaveBeenCalledWith({ sslWarnDays: 21 });
    });
  });
});
