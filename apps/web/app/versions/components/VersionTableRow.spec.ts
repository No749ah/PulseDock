/**
 * Unit tests for VersionTableRow pure logic.
 * Tests provider label mapping, changelog URL derivation, version status display logic.
 */
import { describe, it, expect } from 'vitest';

// ── Logic mirrored from component ────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  github: 'GitHub', gitlab: 'GitLab', docker: 'Docker',
  apt: 'APT', npm: 'npm', pypi: 'PyPI',
  cargo: 'Cargo', maven: 'Maven', helm: 'Helm',
};

function resolveProvider(cfg: Record<string, unknown>, monitorType: string): string {
  return String(cfg.provider ?? (monitorType === 'DOCKER_IMAGE' ? 'docker' : 'github')).toLowerCase();
}

function deriveChangelogUrl(hasUpdate: boolean, to: string | null, target: string): string | null {
  if (!hasUpdate || !to || !target) return null;
  const ghMatch = target.match(/^([^/]+\/[^/]+)$/);
  if (ghMatch) return `https://github.com/${ghMatch[1]}/releases`;
  return null;
}

function formatUpdateLabel(to: string | null, level: string): string {
  if (to) {
    return /^v\d/i.test(to) ? `${to} available` : `v${to} available`;
  }
  return level === 'red' ? 'Critical update' : 'Update available';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('VersionTableRow — PROVIDER_LABELS', () => {
  it('has labels for all 9 known providers', () => {
    expect(Object.keys(PROVIDER_LABELS)).toHaveLength(9);
  });

  it('maps each provider to a non-empty display label', () => {
    Object.values(PROVIDER_LABELS).forEach((label) => {
      expect(label.length).toBeGreaterThan(0);
    });
  });

  it('maps known providers correctly', () => {
    expect(PROVIDER_LABELS.github).toBe('GitHub');
    expect(PROVIDER_LABELS.docker).toBe('Docker');
    expect(PROVIDER_LABELS.npm).toBe('npm');
    expect(PROVIDER_LABELS.pypi).toBe('PyPI');
    expect(PROVIDER_LABELS.cargo).toBe('Cargo');
    expect(PROVIDER_LABELS.maven).toBe('Maven');
    expect(PROVIDER_LABELS.helm).toBe('Helm');
  });
});

describe('VersionTableRow — resolveProvider', () => {
  it('returns provider from config when set', () => {
    expect(resolveProvider({ provider: 'npm' }, 'GIT_RELEASE')).toBe('npm');
  });

  it('defaults to "docker" when config has no provider and type is DOCKER_IMAGE', () => {
    expect(resolveProvider({}, 'DOCKER_IMAGE')).toBe('docker');
  });

  it('defaults to "github" when config has no provider and type is GIT_RELEASE', () => {
    expect(resolveProvider({}, 'GIT_RELEASE')).toBe('github');
  });

  it('lowercases the provider from config', () => {
    expect(resolveProvider({ provider: 'GitHub' }, 'GIT_RELEASE')).toBe('github');
  });

  it('falls back to github for unknown types', () => {
    expect(resolveProvider({}, 'HTTP')).toBe('github');
  });

  it('handles numeric provider in config gracefully via String()', () => {
    expect(resolveProvider({ provider: 42 }, 'GIT_RELEASE')).toBe('42');
  });
});

describe('VersionTableRow — deriveChangelogUrl', () => {
  it('returns null when no update', () => {
    expect(deriveChangelogUrl(false, '1.2.0', 'owner/repo')).toBeNull();
  });

  it('returns null when to is null', () => {
    expect(deriveChangelogUrl(true, null, 'owner/repo')).toBeNull();
  });

  it('returns null when target is empty', () => {
    expect(deriveChangelogUrl(true, '1.2.0', '')).toBeNull();
  });

  it('returns GitHub releases URL for owner/repo format', () => {
    const url = deriveChangelogUrl(true, '2.0.0', 'facebook/react');
    expect(url).toBe('https://github.com/facebook/react/releases');
  });

  it('returns null for full URL targets (not owner/repo)', () => {
    expect(deriveChangelogUrl(true, '2.0.0', 'https://github.com/owner/repo')).toBeNull();
  });

  it('returns null for docker image targets like nginx:latest', () => {
    expect(deriveChangelogUrl(true, '1.25', 'nginx:latest')).toBeNull();
  });

  it('returns null for single-segment targets like npm package names', () => {
    expect(deriveChangelogUrl(true, '2.0.0', 'react')).toBeNull();
  });

  it('builds correct URL for various owner/repo combos', () => {
    expect(deriveChangelogUrl(true, '3.0.0', 'No749ah/PulseDock'))
      .toBe('https://github.com/No749ah/PulseDock/releases');
  });
});

describe('VersionTableRow — formatUpdateLabel', () => {
  it('prefixes v when to does not start with v', () => {
    expect(formatUpdateLabel('1.2.3', 'yellow')).toBe('v1.2.3 available');
  });

  it('keeps v prefix when to already starts with v and digit', () => {
    expect(formatUpdateLabel('v1.2.3', 'yellow')).toBe('v1.2.3 available');
  });

  it('handles uppercase V prefix', () => {
    expect(formatUpdateLabel('V2.0.0', 'yellow')).toBe('V2.0.0 available');
  });

  it('returns "Critical update" when to is null and level is red', () => {
    expect(formatUpdateLabel(null, 'red')).toBe('Critical update');
  });

  it('returns "Update available" when to is null and level is yellow', () => {
    expect(formatUpdateLabel(null, 'yellow')).toBe('Update available');
  });

  it('returns "Update available" when to is null and level is unknown', () => {
    expect(formatUpdateLabel(null, 'unknown')).toBe('Update available');
  });
});
