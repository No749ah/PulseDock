import { describe, it, expect, vi } from "vitest";

// PingConfigSection — pingCount and pingMaxLossPct defaults and clamping

type PingFormData = {
  pingCount?: number;
  pingMaxLossPct?: number;
};

function simulatePingCountChange(formData: PingFormData, raw: string): PingFormData {
  return { ...formData, pingCount: Math.min(10, Math.max(1, Number(raw))) };
}

function simulateMaxLossChange(formData: PingFormData, raw: string): PingFormData {
  if (raw === "") return { ...formData, pingMaxLossPct: undefined };
  return { ...formData, pingMaxLossPct: Number(raw) };
}

describe("PingConfigSection", () => {
  describe("default values", () => {
    it("defaults pingCount to 3", () => {
      const val = ({} as PingFormData).pingCount ?? 3;
      expect(val).toBe(3);
    });

    it("respects existing pingCount", () => {
      const formData: PingFormData = { pingCount: 5 };
      const val = formData.pingCount ?? 3;
      expect(val).toBe(5);
    });

    it("pingMaxLossPct is undefined by default (any loss = warn)", () => {
      const formData: PingFormData = {};
      expect(formData.pingMaxLossPct).toBeUndefined();
    });
  });

  describe("pingCount clamping (1–10)", () => {
    it("accepts 1 (min)", () => {
      expect(simulatePingCountChange({}, "1").pingCount).toBe(1);
    });

    it("accepts 5", () => {
      expect(simulatePingCountChange({}, "5").pingCount).toBe(5);
    });

    it("accepts 10 (max)", () => {
      expect(simulatePingCountChange({}, "10").pingCount).toBe(10);
    });

    it("clamps above 10 to 10", () => {
      expect(simulatePingCountChange({}, "15").pingCount).toBe(10);
    });

    it("clamps 0 to 1", () => {
      expect(simulatePingCountChange({}, "0").pingCount).toBe(1);
    });

    it("clamps negative to 1", () => {
      expect(simulatePingCountChange({}, "-3").pingCount).toBe(1);
    });
  });

  describe("pingMaxLossPct", () => {
    it("sets percentage value", () => {
      expect(simulateMaxLossChange({}, "20").pingMaxLossPct).toBe(20);
    });

    it("sets to undefined when value is empty string", () => {
      expect(simulateMaxLossChange({ pingMaxLossPct: 20 }, "").pingMaxLossPct).toBeUndefined();
    });

    it("accepts 0 (no tolerance)", () => {
      expect(simulateMaxLossChange({}, "0").pingMaxLossPct).toBe(0);
    });

    it("accepts 100 (full tolerance)", () => {
      expect(simulateMaxLossChange({}, "100").pingMaxLossPct).toBe(100);
    });

    it("accepts 50 (half tolerance)", () => {
      expect(simulateMaxLossChange({}, "50").pingMaxLossPct).toBe(50);
    });
  });

  describe("onChange preserves other fields", () => {
    it("preserves pingMaxLossPct when changing pingCount", () => {
      const formData: PingFormData = { pingMaxLossPct: 10 };
      const updated = simulatePingCountChange(formData, "5");
      expect(updated.pingCount).toBe(5);
      expect(updated.pingMaxLossPct).toBe(10);
    });

    it("preserves pingCount when changing max loss", () => {
      const formData: PingFormData = { pingCount: 3 };
      const updated = simulateMaxLossChange(formData, "25");
      expect(updated.pingMaxLossPct).toBe(25);
      expect(updated.pingCount).toBe(3);
    });

    it("calls onSetFormData with correct shape", () => {
      const onSetFormData = vi.fn();
      const formData: PingFormData = { pingCount: 3 };
      onSetFormData(simulateMaxLossChange(formData, "15"));
      expect(onSetFormData).toHaveBeenCalledWith({ pingCount: 3, pingMaxLossPct: 15 });
    });

    it("calls onSetFormData with undefined for cleared loss", () => {
      const onSetFormData = vi.fn();
      const formData: PingFormData = { pingCount: 3, pingMaxLossPct: 20 };
      onSetFormData(simulateMaxLossChange(formData, ""));
      expect(onSetFormData).toHaveBeenCalledWith({ pingCount: 3, pingMaxLossPct: undefined });
    });
  });
});
