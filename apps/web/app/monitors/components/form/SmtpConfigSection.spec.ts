import { describe, it, expect, vi } from "vitest";

// SmtpConfigSection — EHLO hostname defaults and STARTTLS checkbox

type SmtpFormData = {
  ehlo?: string;
  checkTls?: boolean;
};

function simulateEhloChange(formData: SmtpFormData, value: string): SmtpFormData {
  return { ...formData, ehlo: value };
}
function simulateCheckTlsToggle(formData: SmtpFormData, checked: boolean): SmtpFormData {
  return { ...formData, checkTls: checked };
}

describe("SmtpConfigSection", () => {
  describe("default values", () => {
    it("defaults ehlo to pulsedock.monitor", () => {
      const val = ({} as SmtpFormData).ehlo ?? "pulsedock.monitor";
      expect(val).toBe("pulsedock.monitor");
    });

    it("respects existing ehlo value", () => {
      const formData: SmtpFormData = { ehlo: "mail.example.com" };
      const val = formData.ehlo ?? "pulsedock.monitor";
      expect(val).toBe("mail.example.com");
    });

    it("defaults checkTls to false", () => {
      const val = ({} as SmtpFormData).checkTls ?? false;
      expect(val).toBe(false);
    });

    it("respects existing checkTls = true", () => {
      const formData: SmtpFormData = { checkTls: true };
      const val = formData.checkTls ?? false;
      expect(val).toBe(true);
    });
  });

  describe("ehlo hostname", () => {
    it("updates to custom hostname", () => {
      expect(simulateEhloChange({}, "my-monitor.internal").ehlo).toBe("my-monitor.internal");
    });

    it("accepts empty string", () => {
      expect(simulateEhloChange({ ehlo: "pulsedock.monitor" }, "").ehlo).toBe("");
    });

    it("accepts IP-style string", () => {
      expect(simulateEhloChange({}, "192.168.1.100").ehlo).toBe("192.168.1.100");
    });
  });

  describe("checkTls toggle", () => {
    it("enables STARTTLS", () => {
      const formData: SmtpFormData = { checkTls: false };
      expect(simulateCheckTlsToggle(formData, true).checkTls).toBe(true);
    });

    it("disables STARTTLS", () => {
      const formData: SmtpFormData = { checkTls: true };
      expect(simulateCheckTlsToggle(formData, false).checkTls).toBe(false);
    });
  });

  describe("onChange preserves other fields", () => {
    it("preserves checkTls when updating ehlo", () => {
      const formData: SmtpFormData = { checkTls: true };
      const updated = simulateEhloChange(formData, "custom.host");
      expect(updated.ehlo).toBe("custom.host");
      expect(updated.checkTls).toBe(true);
    });

    it("preserves ehlo when toggling checkTls", () => {
      const formData: SmtpFormData = { ehlo: "pulsedock.monitor" };
      const updated = simulateCheckTlsToggle(formData, true);
      expect(updated.checkTls).toBe(true);
      expect(updated.ehlo).toBe("pulsedock.monitor");
    });

    it("calls onSetFormData with correct shape", () => {
      const onSetFormData = vi.fn();
      const formData: SmtpFormData = { ehlo: "pulsedock.monitor", checkTls: false };
      onSetFormData(simulateCheckTlsToggle(formData, true));
      expect(onSetFormData).toHaveBeenCalledWith({ ehlo: "pulsedock.monitor", checkTls: true });
    });
  });
});
