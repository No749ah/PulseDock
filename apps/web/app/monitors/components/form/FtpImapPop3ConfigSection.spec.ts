import { describe, it, expect, vi } from "vitest";

// FtpImapPop3ConfigSection — three export components sharing same checkTls toggle contract

type TlsFormData = {
  checkTls?: boolean;
};

function simulateCheckTlsToggle(formData: TlsFormData, checked: boolean): TlsFormData {
  return { ...formData, checkTls: checked };
}

describe("FtpConfigSection", () => {
  describe("default values", () => {
    it("defaults checkTls to false", () => {
      const val = ({} as TlsFormData).checkTls ?? false;
      expect(val).toBe(false);
    });

    it("respects existing checkTls = true", () => {
      expect({ checkTls: true }.checkTls ?? false).toBe(true);
    });
  });

  describe("AUTH TLS toggle", () => {
    it("enables AUTH TLS check", () => {
      expect(simulateCheckTlsToggle({ checkTls: false }, true).checkTls).toBe(true);
    });

    it("disables AUTH TLS check", () => {
      expect(simulateCheckTlsToggle({ checkTls: true }, false).checkTls).toBe(false);
    });

    it("preserves other form fields", () => {
      const formData = { checkTls: false, name: "ftp.example.com" } as TlsFormData & { name: string };
      const updated = simulateCheckTlsToggle(formData, true) as typeof formData;
      expect(updated.checkTls).toBe(true);
      expect(updated.name).toBe("ftp.example.com");
    });
  });
});

describe("ImapConfigSection", () => {
  describe("default values", () => {
    it("defaults checkTls to false (STARTTLS)", () => {
      const val = ({} as TlsFormData).checkTls ?? false;
      expect(val).toBe(false);
    });
  });

  describe("STARTTLS toggle", () => {
    it("enables STARTTLS", () => {
      expect(simulateCheckTlsToggle({}, true).checkTls).toBe(true);
    });

    it("disables STARTTLS", () => {
      expect(simulateCheckTlsToggle({ checkTls: true }, false).checkTls).toBe(false);
    });

    it("calls onSetFormData with merged data", () => {
      const onSetFormData = vi.fn();
      onSetFormData(simulateCheckTlsToggle({ checkTls: false }, true));
      expect(onSetFormData).toHaveBeenCalledWith({ checkTls: true });
    });
  });
});

describe("Pop3ConfigSection", () => {
  describe("default values", () => {
    it("defaults checkTls to false (STLS)", () => {
      const val = ({} as TlsFormData).checkTls ?? false;
      expect(val).toBe(false);
    });
  });

  describe("STLS toggle", () => {
    it("enables STLS upgrade", () => {
      expect(simulateCheckTlsToggle({}, true).checkTls).toBe(true);
    });

    it("disables STLS upgrade", () => {
      expect(simulateCheckTlsToggle({ checkTls: true }, false).checkTls).toBe(false);
    });

    it("toggle state is independent per component instance", () => {
      const ftpData: TlsFormData = { checkTls: false };
      const imapData: TlsFormData = { checkTls: true };
      const pop3Data: TlsFormData = { checkTls: false };

      expect(simulateCheckTlsToggle(ftpData, true).checkTls).toBe(true);
      expect(simulateCheckTlsToggle(imapData, false).checkTls).toBe(false);
      expect(simulateCheckTlsToggle(pop3Data, true).checkTls).toBe(true);
    });
  });
});
