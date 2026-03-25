/**
 * Semver parsing, comparison, and version classification utilities.
 * Extracted from ChecksService to keep the service focused on orchestration.
 */

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/i;

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: (string | number)[];
  raw: string;
}

export function parseSemver(v?: string | null): ParsedSemver | null {
  if (!v) return null;
  const m = v.trim().match(SEMVER_RE);
  if (!m) return null;
  const prerelease = m[4]
    ? m[4].split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part))
    : [];
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease,
    raw: v.trim(),
  };
}

export function normalizeVersion(value?: string | null): ParsedSemver | null {
  if (!value) return null;
  const direct = parseSemver(value);
  if (direct) return direct;
  const extracted = value.match(/v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?/);
  if (!extracted) return null;
  return parseSemver(extracted[0]);
}

export function comparePrereleaseParts(a: string | number, b: string | number): number {
  const aNum = typeof a === 'number';
  const bNum = typeof b === 'number';
  if (aNum && bNum) return (a as number) - (b as number);
  if (aNum && !bNum) return -1;
  if (!aNum && bNum) return 1;
  return String(a).localeCompare(String(b));
}

export function compareSemver(a?: string | null, b?: string | null): number | null {
  const pa = normalizeVersion(a);
  const pb = normalizeVersion(b);
  if (!pa || !pb) return null;

  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;

  const aPre = pa.prerelease;
  const bPre = pb.prerelease;

  if (aPre.length === 0 && bPre.length === 0) return 0;
  if (aPre.length === 0) return 1;
  if (bPre.length === 0) return -1;

  const len = Math.max(aPre.length, bPre.length);
  for (let i = 0; i < len; i += 1) {
    if (aPre[i] === undefined) return -1;
    if (bPre[i] === undefined) return 1;
    const cmp = comparePrereleaseParts(aPre[i], bPre[i]);
    if (cmp !== 0) return cmp;
  }

  return 0;
}

export function classifyVersionStatus(
  currentVersion?: string | null,
  latestVersion?: string | null,
): 'green' | 'yellow' | 'red' {
  const cmp = compareSemver(currentVersion, latestVersion);
  if (cmp === null) {
    return currentVersion && latestVersion && normalizeVersion(currentVersion)?.major === normalizeVersion(latestVersion)?.major
      ? 'yellow'
      : 'red';
  }
  if (cmp >= 0) return 'green';

  const current = normalizeVersion(currentVersion);
  const latest = normalizeVersion(latestVersion);
  if (!current || !latest) return 'yellow';

  if (latest.major > current.major) return 'red';
  return 'yellow';
}

export function isClearlyUnstableTag(tag?: string | null): boolean {
  if (!tag) return false;
  const t = tag.toLowerCase();
  return /(nightly|alpha|beta|rc|canary|snapshot|dev)/.test(t);
}

export function selectBestSemverTag(tags: string[], includePrerelease: boolean): string | null {
  const filtered = tags.filter((tag) => {
    const parsed = normalizeVersion(tag);
    if (!parsed) return false;
    if (includePrerelease) return true;
    return parsed.prerelease.length === 0 && !isClearlyUnstableTag(tag);
  });

  const source = filtered.length > 0 ? filtered : tags;
  if (source.length === 0) return null;

  return source.sort((a, b) => {
    const cmp = compareSemver(a, b);
    return cmp === null ? 0 : -cmp;
  })[0] ?? null;
}

export function parseGithubRepo(input: string): { owner: string; repo: string } | null {
  const cleaned = input.replace(/^https?:\/\/github.com\//i, '').replace(/\.git$/, '');
  const [owner, repo] = cleaned.split('/');
  if (!owner || !repo) return null;
  return { owner, repo };
}

export function parseGitlabTarget(
  target: string,
  config: Record<string, unknown>,
): { host: string; projectPath: string } | null {
  const host = (String(config.gitlabHost ?? '').trim() || 'gitlab.com').replace(/\/$/, '').replace(/^https?:\/\//i, '');
  if (target.startsWith('gitlab:')) {
    const projectPath = target.slice('gitlab:'.length).trim();
    if (!projectPath) return null;
    return { host, projectPath };
  }
  const m = target.match(/^https?:\/\/([^/]+)\/(.+)$/i);
  if (m) return { host: m[1], projectPath: m[2].replace(/\.git$/, '').replace(/\/$/, '') };
  if (target.includes('/')) return { host, projectPath: target.replace(/\.git$/, '').replace(/^\/+|\/+$/g, '') };
  return null;
}
