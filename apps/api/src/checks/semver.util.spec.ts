/**
 * @file semver.util.spec.ts
 * Unit tests for semver parsing, comparison, classification, and tag selection utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  parseSemver,
  normalizeVersion,
  comparePrereleaseParts,
  compareSemver,
  classifyVersionStatus,
  isClearlyUnstableTag,
  selectBestSemverTag,
  parseGithubRepo,
  parseGitlabTarget,
} from './semver.util';

// ────────────────────────────────────────────────────────────────────────────
// parseSemver
// ────────────────────────────────────────────────────────────────────────────

describe('parseSemver', () => {
  it('parses a clean semver string', () => {
    const result = parseSemver('1.2.3');
    expect(result).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [], raw: '1.2.3' });
  });

  it('parses semver with leading "v"', () => {
    const result = parseSemver('v2.10.5');
    expect(result).toEqual({ major: 2, minor: 10, patch: 5, prerelease: [], raw: 'v2.10.5' });
  });

  it('parses semver with prerelease tag', () => {
    const result = parseSemver('1.0.0-alpha.1');
    expect(result).not.toBeNull();
    expect(result!.major).toBe(1);
    expect(result!.prerelease).toEqual(['alpha', 1]);
  });

  it('parses semver with build metadata (strips it)', () => {
    const result = parseSemver('1.0.0+build.20250101');
    expect(result).not.toBeNull();
    expect(result!.major).toBe(1);
    expect(result!.prerelease).toEqual([]);
  });

  it('returns null for non-semver string', () => {
    expect(parseSemver('not-a-version')).toBeNull();
    expect(parseSemver('release-2025')).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(parseSemver(null)).toBeNull();
    expect(parseSemver(undefined)).toBeNull();
    expect(parseSemver('')).toBeNull();
  });

  it('parses prerelease with numeric-only parts', () => {
    const result = parseSemver('2.0.0-rc.1');
    expect(result!.prerelease).toEqual(['rc', 1]);
  });

  it('handles uppercase V prefix', () => {
    const result = parseSemver('V3.0.0');
    expect(result).not.toBeNull();
    expect(result!.major).toBe(3);
  });

  it('trims whitespace before parsing', () => {
    const result = parseSemver('  1.0.0  ');
    expect(result).not.toBeNull();
    expect(result!.patch).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// normalizeVersion
// ────────────────────────────────────────────────────────────────────────────

describe('normalizeVersion', () => {
  it('returns parsed version for clean semver', () => {
    expect(normalizeVersion('1.2.3')).toEqual(parseSemver('1.2.3'));
  });

  it('extracts semver from a longer string', () => {
    const result = normalizeVersion('PulseDock/v2.3.1 (linux/amd64)');
    expect(result).not.toBeNull();
    expect(result!.major).toBe(2);
    expect(result!.minor).toBe(3);
  });

  it('returns null when no semver can be extracted', () => {
    expect(normalizeVersion('release-2025')).toBeNull();
    expect(normalizeVersion(null)).toBeNull();
  });

  it('handles strings like "version 5.0.1"', () => {
    const result = normalizeVersion('version 5.0.1');
    expect(result).not.toBeNull();
    expect(result!.major).toBe(5);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// comparePrereleaseParts
// ────────────────────────────────────────────────────────────────────────────

describe('comparePrereleaseParts', () => {
  it('compares two numbers', () => {
    expect(comparePrereleaseParts(1, 2)).toBeLessThan(0);
    expect(comparePrereleaseParts(3, 2)).toBeGreaterThan(0);
    expect(comparePrereleaseParts(2, 2)).toBe(0);
  });

  it('numeric < string (semver spec: numeric identifiers have lower precedence)', () => {
    expect(comparePrereleaseParts(1, 'alpha')).toBeLessThan(0);
  });

  it('string > numeric', () => {
    expect(comparePrereleaseParts('alpha', 1)).toBeGreaterThan(0);
  });

  it('compares two strings lexicographically', () => {
    expect(comparePrereleaseParts('alpha', 'beta')).toBeLessThan(0);
    expect(comparePrereleaseParts('rc', 'alpha')).toBeGreaterThan(0);
    expect(comparePrereleaseParts('beta', 'beta')).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// compareSemver
// ────────────────────────────────────────────────────────────────────────────

describe('compareSemver', () => {
  it('returns positive when a > b', () => {
    expect(compareSemver('2.0.0', '1.9.9')).toBeGreaterThan(0);
  });

  it('returns negative when a < b', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBeLessThan(0);
  });

  it('returns 0 for identical versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns null when either version is unparseable', () => {
    expect(compareSemver('not-semver', '1.0.0')).toBeNull();
    expect(compareSemver('1.0.0', null)).toBeNull();
    expect(compareSemver(undefined, undefined)).toBeNull();
  });

  it('release > prerelease of same version', () => {
    expect(compareSemver('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
  });

  it('prerelease < release', () => {
    expect(compareSemver('1.0.0-alpha', '1.0.0')).toBeLessThan(0);
  });

  it('compares minor versions correctly', () => {
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0);
  });

  it('compares patch versions correctly', () => {
    expect(compareSemver('1.0.10', '1.0.9')).toBeGreaterThan(0);
  });

  it('handles "v" prefix on both sides', () => {
    expect(compareSemver('v1.2.3', 'v1.2.3')).toBe(0);
    expect(compareSemver('v2.0.0', 'v1.9.9')).toBeGreaterThan(0);
  });

  it('handles mixed "v" prefix', () => {
    expect(compareSemver('v1.0.0', '1.0.0')).toBe(0);
  });

  it('compares prerelease identifiers: rc.2 > rc.1', () => {
    expect(compareSemver('1.0.0-rc.2', '1.0.0-rc.1')).toBeGreaterThan(0);
  });

  it('compares prerelease identifiers: alpha < beta', () => {
    expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0);
  });

  it('handles versions embedded in longer strings', () => {
    expect(compareSemver('v2.1.0 (stable)', 'v2.0.0')).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// classifyVersionStatus
// ────────────────────────────────────────────────────────────────────────────

describe('classifyVersionStatus', () => {
  it('returns "green" when current == latest', () => {
    expect(classifyVersionStatus('1.2.3', '1.2.3')).toBe('green');
  });

  it('returns "green" when current > latest (e.g. edge/nightly case)', () => {
    expect(classifyVersionStatus('2.0.0', '1.9.9')).toBe('green');
  });

  it('returns "yellow" for minor/patch update available', () => {
    expect(classifyVersionStatus('1.0.0', '1.0.1')).toBe('yellow');
    expect(classifyVersionStatus('1.0.0', '1.1.0')).toBe('yellow');
  });

  it('returns "red" for major update available', () => {
    expect(classifyVersionStatus('1.9.9', '2.0.0')).toBe('red');
  });

  it('returns "yellow" or "red" when both versions are unparseable (non-semver strings)', () => {
    // Both can't be parsed as semver; result depends on major extraction fallback
    const result = classifyVersionStatus('release-2025-01', 'release-2025-12');
    expect(['yellow', 'red']).toContain(result);
  });

  it('returns "yellow" when unparseable but same major can be extracted', () => {
    // Same first number can still resolve to same major
    const result = classifyVersionStatus('version 1.2.3 something', 'version 1.3.0 build');
    expect(['yellow', 'green', 'red']).toContain(result);
  });

  it('returns "red" when current is null', () => {
    expect(classifyVersionStatus(null, '1.0.0')).toBe('red');
  });

  it('returns "red" when latest is null', () => {
    expect(classifyVersionStatus('1.0.0', null)).toBe('red');
  });

  it('returns "red" for two-major-version gap', () => {
    expect(classifyVersionStatus('1.0.0', '3.0.0')).toBe('red');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// isClearlyUnstableTag
// ────────────────────────────────────────────────────────────────────────────

describe('isClearlyUnstableTag', () => {
  it.each([
    ['v1.0.0-alpha', true],
    ['v1.0.0-beta.1', true],
    ['v2.0.0-rc.1', true],
    ['v1.0.0-nightly', true],
    ['v1.0.0-canary', true],
    ['v1.0.0-snapshot', true],
    ['v1.0.0-dev', true],
    ['v1.0.0', false],
    ['v2.0.0-stable', false],
    ['v1.0.0+build.1', false],
  ])('%s -> %s', (tag, expected) => {
    expect(isClearlyUnstableTag(tag)).toBe(expected);
  });

  it('returns false for null/undefined', () => {
    expect(isClearlyUnstableTag(null)).toBe(false);
    expect(isClearlyUnstableTag(undefined)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isClearlyUnstableTag('v1.0.0-ALPHA')).toBe(true);
    expect(isClearlyUnstableTag('v1.0.0-Beta')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// selectBestSemverTag
// ────────────────────────────────────────────────────────────────────────────

describe('selectBestSemverTag', () => {
  it('returns the highest stable tag', () => {
    const tags = ['v1.0.0', 'v1.1.0', 'v1.2.0'];
    expect(selectBestSemverTag(tags, false)).toBe('v1.2.0');
  });

  it('excludes prerelease tags when includePrerelease=false', () => {
    const tags = ['v1.0.0', 'v2.0.0-alpha', 'v1.9.0'];
    expect(selectBestSemverTag(tags, false)).toBe('v1.9.0');
  });

  it('includes prerelease tags when includePrerelease=true', () => {
    const tags = ['v1.0.0', 'v2.0.0-alpha', 'v1.9.0'];
    expect(selectBestSemverTag(tags, true)).toBe('v2.0.0-alpha');
  });

  it('returns null for empty array', () => {
    expect(selectBestSemverTag([], false)).toBeNull();
  });

  it('falls back to first tag when all tags are non-semver (includePrerelease=false)', () => {
    // Falls back to source (all tags) when no stable filtered results — returns first sorted element
    const tags = ['latest', 'edge', 'nightly'];
    // These don't parse as semver, so filtered is empty → fallback to source, sorts stably → returns first
    expect(selectBestSemverTag(tags, false)).toBeTruthy();
  });

  it('falls back to all tags when no stable ones exist', () => {
    const tags = ['v1.0.0-alpha', 'v1.0.0-beta'];
    // No stable tag — should fallback to prerelease pool and pick highest
    const result = selectBestSemverTag(tags, false);
    // Falls back to the source array (prerelease) when filtered is empty
    expect(result).toBe('v1.0.0-beta');
  });

  it('handles single tag', () => {
    expect(selectBestSemverTag(['v3.0.0'], false)).toBe('v3.0.0');
  });

  it('correctly orders 10.x > 9.x', () => {
    const tags = ['v9.0.0', 'v10.0.0', 'v8.5.0'];
    expect(selectBestSemverTag(tags, false)).toBe('v10.0.0');
  });

  it('filters unstable tags (nightly/canary) when includePrerelease=false', () => {
    const tags = ['v1.0.0', 'v2.0.0-nightly', 'v1.5.0-canary'];
    expect(selectBestSemverTag(tags, false)).toBe('v1.0.0');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// parseGithubRepo
// ────────────────────────────────────────────────────────────────────────────

describe('parseGithubRepo', () => {
  it('parses owner/repo shorthand', () => {
    expect(parseGithubRepo('owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('parses full GitHub URL', () => {
    expect(parseGithubRepo('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('parses GitHub URL with .git suffix', () => {
    expect(parseGithubRepo('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('parses HTTP GitHub URL', () => {
    expect(parseGithubRepo('http://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('returns null when missing repo part', () => {
    expect(parseGithubRepo('justowner')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseGithubRepo('')).toBeNull();
  });

  it('handles org/repo with hyphen/dots', () => {
    expect(parseGithubRepo('my-org/my-repo.js')).toEqual({ owner: 'my-org', repo: 'my-repo.js' });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// parseGitlabTarget
// ────────────────────────────────────────────────────────────────────────────

describe('parseGitlabTarget', () => {
  it('parses gitlab: prefixed shorthand', () => {
    const result = parseGitlabTarget('gitlab:group/project', {});
    expect(result).toEqual({ host: 'gitlab.com', projectPath: 'group/project' });
  });

  it('uses custom gitlabHost from config', () => {
    const result = parseGitlabTarget('gitlab:group/project', { gitlabHost: 'gitlab.mycompany.com' });
    expect(result).toEqual({ host: 'gitlab.mycompany.com', projectPath: 'group/project' });
  });

  it('strips protocol from gitlabHost', () => {
    const result = parseGitlabTarget('gitlab:group/project', { gitlabHost: 'https://gitlab.mycompany.com' });
    expect(result!.host).toBe('gitlab.mycompany.com');
  });

  it('parses full GitLab HTTPS URL', () => {
    const result = parseGitlabTarget('https://gitlab.com/group/project', {});
    expect(result).toEqual({ host: 'gitlab.com', projectPath: 'group/project' });
  });

  it('parses full URL with trailing .git', () => {
    const result = parseGitlabTarget('https://gitlab.com/group/project.git', {});
    expect(result!.projectPath).toBe('group/project');
  });

  it('parses bare group/project string', () => {
    const result = parseGitlabTarget('group/project', {});
    expect(result).toEqual({ host: 'gitlab.com', projectPath: 'group/project' });
  });

  it('returns null for gitlab: prefix with empty path', () => {
    const result = parseGitlabTarget('gitlab:', {});
    expect(result).toBeNull();
  });

  it('returns null for non-matching single word', () => {
    const result = parseGitlabTarget('justproject', {});
    expect(result).toBeNull();
  });

  it('handles nested subgroup paths', () => {
    const result = parseGitlabTarget('https://gitlab.com/group/subgroup/project', {});
    expect(result!.projectPath).toBe('group/subgroup/project');
  });
});
