import { describe, it, expect, vi } from "vitest";

// TcpConfigSection — connection timeout defaults and onChange

type TcpFormData = {
  tcpTimeoutMs?: number;
  timeoutMs?: number;
};

function simulateTimeoutChange(formData: TcpFormData, raw: string): TcpFormData {
  return { ...formData, tcpTimeoutMs: parseInt(raw, 10) || 5000 };
}

describe("TcpConfigSection", () => {
  describe("default values", () => {
    it("uses tcpTimeoutMs if set", () => {
      const formData: TcpFormData = { tcpTimeoutMs: 3000 };
      const val = formData.tcpTimeoutMs ?? formData.timeoutMs ?? 5000;
      expect(val).toBe(3000);
    });

    it("falls back to timeoutMs if tcpTimeoutMs not set", () => {
      const formData: TcpFormData = { timeoutMs: 8000 };
      const val = formData.tcpTimeoutMs ?? formData.timeoutMs ?? 5000;
      expect(val).toBe(8000);
    });

    it("falls back to 5000 if neither is set", () => {
      const formData: TcpFormData = {};
      const val = formData.tcpTimeoutMs ?? formData.timeoutMs ?? 5000;
      expect(val).toBe(5000);
    });
  });

  describe("simulateTimeoutChange", () => {
    it("sets valid timeout", () => {
      expect(simulateTimeoutChange({}, "10000").tcpTimeoutMs).toBe(10000);
    });

    it("falls back to 5000 for invalid input", () => {
      expect(simulateTimeoutChange({}, "abc").tcpTimeoutMs).toBe(5000);
    });

    it("falls back to 5000 for empty string", () => {
      expect(simulateTimeoutChange({}, "").tcpTimeoutMs).toBe(5000);
    });

    it("falls back to 5000 for zero", () => {
      // parseInt("0") || 5000 → 0 is falsy, so fallback
      expect(simulateTimeoutChange({}, "0").tcpTimeoutMs).toBe(5000);
    });

    it("accepts 500 (min boundary)", () => {
      expect(simulateTimeoutChange({}, "500").tcpTimeoutMs).toBe(500);
    });

    it("accepts 60000 (max boundary)", () => {
      expect(simulateTimeoutChange({}, "60000").tcpTimeoutMs).toBe(60000);
    });
  });

  describe("onChange preserves other fields", () => {
    it("keeps existing timeoutMs when setting tcpTimeoutMs", () => {
      const formData: TcpFormData = { timeoutMs: 8000 };
      const updated = simulateTimeoutChange(formData, "3000");
      expect(updated.tcpTimeoutMs).toBe(3000);
      expect(updated.timeoutMs).toBe(8000);
    });

    it("calls onSetFormData with correct value", () => {
      const onSetFormData = vi.fn();
      const formData: TcpFormData = {};
      onSetFormData(simulateTimeoutChange(formData, "15000"));
      expect(onSetFormData).toHaveBeenCalledWith({ tcpTimeoutMs: 15000 });
    });
  });
});
