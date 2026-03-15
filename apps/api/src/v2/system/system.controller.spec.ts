import { describe, it, expect, beforeEach } from 'vitest';
import { V2SystemController } from './system.controller';

describe('V2SystemController', () => {
  let controller: V2SystemController;

  beforeEach(() => {
    controller = new V2SystemController();
  });

  describe('info()', () => {
    it('returns service name and version', () => {
      const result = controller.info() as Record<string, unknown>;
      expect(result.service).toBe('pulsedock-api');
      expect(typeof result.version).toBe('string');
    });

    it('returns apiVersions with supported v1 and v2', () => {
      const result = controller.info() as Record<string, unknown>;
      const apiVersions = result.apiVersions as Record<string, unknown>;
      expect(apiVersions.supported).toContain('v1');
      expect(apiVersions.supported).toContain('v2');
    });

    it('lists v1 and v2 features', () => {
      const result = controller.info() as Record<string, unknown>;
      const features = result.features as Record<string, unknown[]>;
      expect(Array.isArray(features.v1)).toBe(true);
      expect(Array.isArray(features.v2)).toBe(true);
      expect(features.v1.length).toBeGreaterThan(0);
      expect(features.v2.length).toBeGreaterThan(0);
    });

    it('includes breakingChangePolicy with changelog URL', () => {
      const result = controller.info() as Record<string, unknown>;
      const policy = result.breakingChangePolicy as Record<string, unknown>;
      expect(typeof policy.changelogUrl).toBe('string');
      expect(policy.deprecationNoticeDays).toBe(180);
    });

    it('includes links with docs path', () => {
      const result = controller.info() as Record<string, unknown>;
      const links = result.links as Record<string, unknown>;
      expect(links.docs).toBe('/docs');
    });
  });

  describe('versions()', () => {
    it('returns v1 and v2 version entries', () => {
      const result = controller.versions() as Record<string, unknown>;
      const versions = result.versions as Array<Record<string, unknown>>;
      expect(versions).toHaveLength(2);
      const v1 = versions.find((v) => v.version === 'v1');
      const v2 = versions.find((v) => v.version === 'v2');
      expect(v1).toBeDefined();
      expect(v2).toBeDefined();
    });

    it('v1 status is stable', () => {
      const result = controller.versions() as Record<string, unknown>;
      const versions = result.versions as Array<Record<string, unknown>>;
      const v1 = versions.find((v) => v.version === 'v1');
      expect(v1?.status).toBe('stable');
    });

    it('v2 status is stable', () => {
      const result = controller.versions() as Record<string, unknown>;
      const versions = result.versions as Array<Record<string, unknown>>;
      const v2 = versions.find((v) => v.version === 'v2');
      expect(v2?.status).toBe('stable');
    });

    it('v1 has features list', () => {
      const result = controller.versions() as Record<string, unknown>;
      const versions = result.versions as Array<Record<string, unknown>>;
      const v1 = versions.find((v) => v.version === 'v1');
      expect(Array.isArray(v1?.features)).toBe(true);
    });
  });
});

