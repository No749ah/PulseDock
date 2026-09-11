import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractVersion, runDockerCheck, runGitReleaseCheck } from './version.runner';

// ── extractVersion ───────────────────────────────────────────────────────────

describe('extractVersion', () => {
  it('returns null for falsy input', () => {
    expect(extractVersion(null)).toBeNull();
    expect(extractVersion(undefined)).toBeNull();
    expect(extractVersion('')).toBeNull();
  });

  it('extracts semver from a plain string', () => {
    expect(extractVersion('1.2.3')).toBe('1.2.3');
    expect(extractVersion('v2.0.0')).toBe('v2.0.0');
  });

  it('extracts version from a string with prefix/suffix noise', () => {
    expect(extractVersion('Release 1.2.3 (stable)')).toBe('1.2.3');
  });

  it('extracts version from "version" key in object', () => {
    expect(extractVersion({ version: '3.4.5' })).toBe('3.4.5');
  });

  it('extracts version from "tag" key in object', () => {
    expect(extractVersion({ tag: 'v1.0.0' })).toBe('v1.0.0');
  });

  it('extracts version from "appversion" key (case-insensitive)', () => {
    expect(extractVersion({ appVersion: '2.1.0' })).toBe('2.1.0');
  });

  it('extracts version nested inside "build" key', () => {
    expect(extractVersion({ build: { version: '5.0.1' } })).toBe('5.0.1');
  });

  it('extracts version from "data" wrapper', () => {
    expect(extractVersion({ data: { version: '1.0.0' } })).toBe('1.0.0');
  });

  it('extracts first version from an array', () => {
    expect(extractVersion([{ version: '1.0.0' }, { version: '2.0.0' }])).toBe('1.0.0');
  });

  it('returns null when no version found in object', () => {
    expect(extractVersion({ foo: 'bar', baz: 42 })).toBeNull();
  });

  it('returns null for an empty array', () => {
    expect(extractVersion([])).toBeNull();
  });
});

// ── runDockerCheck ───────────────────────────────────────────────────────────

describe('runDockerCheck', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  function makeTags(names: string[]): unknown {
    return {
      results: names.map((name) => ({
        name,
        last_updated: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1h ago
      })),
    };
  }

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns green when up-to-date with latest tag', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(makeTags(['2.0.0', '1.9.0', 'latest'])),
    } as unknown as Response);

    const result = await runDockerCheck('grafana/grafana', { currentTag: '2.0.0' });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
  });

  it('returns yellow when behind by minor version', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(makeTags(['2.1.0', '2.0.0', '1.9.0'])),
    } as unknown as Response);

    const result = await runDockerCheck('grafana/grafana', { currentTag: '2.0.0' });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('yellow');
    expect(result.message).toContain('current 2.0.0');
    expect(result.message).toContain('latest 2.1.0');
  });

  it('returns red when significantly behind (major version)', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(makeTags(['5.0.0', '4.0.0', '3.0.0'])),
    } as unknown as Response);

    const result = await runDockerCheck('grafana/grafana', { currentTag: '2.0.0' });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
  });

  it('returns ok:false for Docker Hub API error', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 404,
    } as unknown as Response);

    const result = await runDockerCheck('nonexistent/image', {});
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
  });

  it('returns ok:false when no tags found', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ results: [] }),
    } as unknown as Response);

    const result = await runDockerCheck('empty/image', {});
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
  });

  it('handles namespace-less image name (adds library/ prefix)', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(makeTags(['1.0.0'])),
    } as unknown as Response);

    await runDockerCheck('nginx', {});
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('library/nginx'),
    );
  });

  it('handles fetch error gracefully', async () => {
    fetchSpy.mockRejectedValue(new Error('Network failure'));
    const result = await runDockerCheck('nginx', {});
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Docker check failed');
  });
});

// ── runGitReleaseCheck ───────────────────────────────────────────────────────

describe('runGitReleaseCheck', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  function makeRelease(tagName: string): unknown {
    return {
      tag_name: tagName,
      published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
    };
  }

  function makeTagList(names: string[]): unknown {
    return names.map((name) => ({ name }));
  }

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns green for npm package at latest version', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ version: '2.0.0' }),
    } as unknown as Response);

    const result = await runGitReleaseCheck('express', {
      provider: 'npm',
      currentVersion: '2.0.0',
    });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
  });

  it('returns yellow for npm package behind by minor version', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ version: '2.1.0' }),
    } as unknown as Response);

    const result = await runGitReleaseCheck('express', {
      provider: 'npm',
      currentVersion: '2.0.0',
    });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('yellow');
  });

  it('returns red for npm package behind by major version', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ version: '5.0.0' }),
    } as unknown as Response);

    const result = await runGitReleaseCheck('express', {
      provider: 'npm',
      currentVersion: '2.0.0',
    });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
  });

  it('handles npm API error', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 404 } as unknown as Response);
    const result = await runGitReleaseCheck('nonexistent-package-xyz', { provider: 'npm' });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
  });

  it('returns error for invalid npm package (empty target)', async () => {
    const result = await runGitReleaseCheck('', { provider: 'npm' });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('returns green for PyPI package at latest', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ info: { version: '3.0.0' } }),
    } as unknown as Response);

    const result = await runGitReleaseCheck('requests', {
      provider: 'pypi',
      currentVersion: '3.0.0',
    });
    expect(result.ok).toBe(true);
  });

  it('returns error for empty PyPI target', async () => {
    const result = await runGitReleaseCheck('', { provider: 'pypi' });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('returns green for Cargo crate at latest', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ crate: { max_stable_version: '1.5.0' } }),
    } as unknown as Response);

    const result = await runGitReleaseCheck('serde', {
      provider: 'cargo',
      currentVersion: '1.5.0',
    });
    expect(result.ok).toBe(true);
  });

  it('returns error for invalid Maven target format', async () => {
    const result = await runGitReleaseCheck('invaliddformat', { provider: 'maven' });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('groupId:artifactId');
  });

  it('returns error for invalid Helm target format', async () => {
    const result = await runGitReleaseCheck('noSlash', { provider: 'helm' });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('repoName/chartName');
  });

  it('returns ok for GitHub latest release (green, recent)', async () => {
    // GitHub calls: /releases/latest
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(makeRelease('v3.0.0')),
    } as unknown as Response);

    const result = await runGitReleaseCheck('grafana/grafana', {});
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toContain('v3.0.0');
  });

  it('returns yellow for GitHub release older than warnAfterHours', async () => {
    const oldPublish = new Date(Date.now() - 400 * 60 * 60 * 1000).toISOString(); // 400h ago
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ tag_name: 'v1.0.0', published_at: oldPublish }),
    } as unknown as Response);

    const result = await runGitReleaseCheck('some/repo', { warnAfterHours: 336 });
    expect(result.level).toBe('yellow');
  });

  it('returns red for GitHub release older than critAfterHours', async () => {
    const veryOld = new Date(Date.now() - 800 * 60 * 60 * 1000).toISOString(); // 800h ago
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ tag_name: 'v1.0.0', published_at: veryOld }),
    } as unknown as Response);

    const result = await runGitReleaseCheck('some/repo', { critAfterHours: 720 });
    expect(result.level).toBe('red');
  });

  it('falls back to tags when releases list is empty', async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response) // /releases/latest
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue([]) } as unknown as Response) // /releases list
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(makeTagList(['v2.0.0', 'v1.9.0'])),
      } as unknown as Response); // /tags

    const result = await runGitReleaseCheck('owner/repo', {});
    expect(result.ok).toBe(true);
    expect(result.message).toContain('v2.0.0');
  });

  it('returns error when all GitHub API calls fail', async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response)
      .mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response)
      .mockResolvedValueOnce({ ok: false, status: 403 } as unknown as Response);

    const result = await runGitReleaseCheck('owner/repo', {});
    expect(result.ok).toBe(false);
  });

  it('returns error for invalid GitHub target', async () => {
    const result = await runGitReleaseCheck('notavalidtarget', { provider: 'github' });
    // Should fail with invalid target message
    expect(result.ok).toBe(false);
  });

  it('handles fetch error gracefully', async () => {
    fetchSpy.mockRejectedValue(new Error('DNS lookup failed'));
    const result = await runGitReleaseCheck('grafana/grafana', {});
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Version check failed');
  });

  it('compares version when currentVersion is provided for GitHub', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(makeRelease('v4.0.0')),
    } as unknown as Response);

    const result = await runGitReleaseCheck('grafana/grafana', { currentVersion: 'v3.0.0' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('current v3.0.0');
    expect(result.message).toContain('latest v4.0.0');
  });
});
