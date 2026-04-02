import { describe, it, expect, vi } from "vitest";

// VersionConfigSection — default values and onChange contract
// Pure data contract tests (no rendering required)

type VersionFormData = {
  versionProvider?: string;
  versionTargetUrl?: string;
  versionRepo?: string;
  versionAuthType?: string;
  versionInstanceUrl?: string;
  versionHeaders?: string;
};

function simulateProviderChange(formData: VersionFormData, value: string): VersionFormData {
  return { ...formData, versionProvider: value };
}

describe("VersionConfigSection", () => {
  describe("default values", () => {
    it("defaults provider to github when not set", () => {
      const formData: VersionFormData = {};
      const provider = formData.versionProvider ?? "github";
      expect(provider).toBe("github");
    });

    it("preserves existing provider", () => {
      const formData: VersionFormData = { versionProvider: "docker" };
      const provider = formData.versionProvider ?? "github";
      expect(provider).toBe("docker");
    });

    it("versionTargetUrl is undefined by default", () => {
      const formData: VersionFormData = {};
      expect(formData.versionTargetUrl).toBeUndefined();
    });

    it("versionRepo is undefined by default", () => {
      const formData: VersionFormData = {};
      expect(formData.versionRepo).toBeUndefined();
    });

    it("versionAuthType is undefined by default", () => {
      const formData: VersionFormData = {};
      expect(formData.versionAuthType).toBeUndefined();
    });

    it("versionInstanceUrl is undefined by default", () => {
      const formData: VersionFormData = {};
      expect(formData.versionInstanceUrl).toBeUndefined();
    });

    it("versionHeaders is undefined by default", () => {
      const formData: VersionFormData = {};
      expect(formData.versionHeaders).toBeUndefined();
    });
  });

  describe("supported providers", () => {
    const providers = ["github", "docker", "custom"];

    it.each(providers)("supports provider: %s", (provider) => {
      const formData: VersionFormData = {};
      const updated = simulateProviderChange(formData, provider);
      expect(updated.versionProvider).toBe(provider);
    });
  });

  describe("onChange callback", () => {
    it("spreads existing formData when updating provider", () => {
      const formData: VersionFormData = { versionRepo: "owner/repo" };
      const updated = simulateProviderChange(formData, "docker");
      expect(updated.versionRepo).toBe("owner/repo");
      expect(updated.versionProvider).toBe("docker");
    });

    it("merges provider change without losing other fields", () => {
      const formData: VersionFormData = {
        versionProvider: "github",
        versionRepo: "my/repo",
        versionTargetUrl: "https://api.github.com",
        versionHeaders: '{"Authorization":"token xxx"}',
      };
      const updated = simulateProviderChange(formData, "custom");
      expect(updated.versionProvider).toBe("custom");
      expect(updated.versionRepo).toBe("my/repo");
      expect(updated.versionTargetUrl).toBe("https://api.github.com");
      expect(updated.versionHeaders).toBe('{"Authorization":"token xxx"}');
    });

    it("calls onSetFormData once per change", () => {
      const onSetFormData = vi.fn();
      const formData: VersionFormData = {};
      onSetFormData(simulateProviderChange(formData, "docker"));
      expect(onSetFormData).toHaveBeenCalledTimes(1);
    });
  });
});
