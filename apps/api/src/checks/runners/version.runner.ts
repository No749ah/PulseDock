/**
 * Version check runners: Git release, Docker image, app version detection.
 * Extracted from ChecksService to keep the service focused on orchestration.
 */

import {
  classifyVersionStatus,
  isClearlyUnstableTag,
  selectBestSemverTag,
  parseGithubRepo,
  parseGitlabTarget,
} from '../semver.util';
import { normalizeExtractors, extractVersionWithFallback } from '../version-extractor.util';

/**
 * Recursively extract a version string from an unknown payload.
 */
export function extractVersion(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === 'string') {
    const m = payload.match(/v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?/i);
    return m ? m[0] : null;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const v = extractVersion(item);
      if (v) return v;
    }
    return null;
  }
  if (typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    const lowerObj = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
    for (const key of ['version', 'appversion', 'app_version', 'release', 'tag', 'buildversion']) {
      const val = lowerObj.get(key);
      if (typeof val === 'string') return val;
    }
    for (const key of ['data', 'build', 'info', 'meta']) {
      const val = lowerObj.get(key);
      const v = extractVersion(val);
      if (v) return v;
    }
  }
  return null;
}

/**
 * Detect the current app version by probing common version endpoints.
 */
export async function detectAppVersion(config: Record<string, unknown>): Promise<string | null> {
  const appUrl = String(config.appUrl ?? '').trim();
  if (!appUrl) return null;
  const base = appUrl.replace(/\/$/, '');
  const custom = String(config.appVersionEndpoint ?? '').trim();

  const configFallbacks = Array.isArray(config.endpointFallbacks)
    ? (config.endpointFallbacks as string[]).filter((s) => typeof s === 'string' && s.trim())
    : [];

  const candidates = custom
    ? [custom, ...configFallbacks]
    : configFallbacks.length > 0
      ? configFallbacks
      : ['/version', '/api/version', '/api/v1/version', '/api/v1/health', '/api/v1/info', '/health', '/api/health', '/status'];

  const headers: Record<string, string> = { 'User-Agent': 'PulseDock' };
  const token = String(config.appToken ?? '').trim();
  if (token) headers.authorization = `Bearer ${token}`;

  for (const path of candidates) {
    const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) continue;
      const contentType = resp.headers.get('content-type') ?? '';
      const body = contentType.includes('application/json') ? await resp.json() : await resp.text();
      const extractors = normalizeExtractors(
        config.jsonPath as string | undefined,
        Array.isArray(config.jsonPathExtractors) ? (config.jsonPathExtractors as string[]) : undefined,
      );
      const detected = extractVersionWithFallback(body, extractors) ?? extractVersion(body);
      if (detected) return detected;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Fetch the latest version from GitHub releases/tags.
 */
export async function fetchGithubLatestVersion(
  owner: string,
  repo: string,
  headers: Record<string, string>,
  includePrerelease: boolean,
): Promise<{ latestVersion: string | null; publishedAtRaw?: string; sourceLabel: string; errorStatus?: number }> {
  const latestResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers });
  if (latestResp.ok) {
    const latest = await latestResp.json() as { tag_name?: string; published_at?: string; created_at?: string };
    return {
      latestVersion: latest.tag_name ?? null,
      publishedAtRaw: latest.published_at ?? latest.created_at,
      sourceLabel: 'release',
    };
  }

  const releasesResp = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=20`,
    { headers },
  );

  if (releasesResp.ok) {
    const releases = await releasesResp.json() as Array<{ tag_name?: string; prerelease?: boolean; draft?: boolean; published_at?: string; created_at?: string }>;
    const candidates = releases
      .filter((r) => !r.draft)
      .filter((r) => includePrerelease || !r.prerelease)
      .map((r) => ({
        tag: r.tag_name ?? null,
        publishedAtRaw: r.published_at ?? r.created_at,
      }))
      .filter((r) => r.tag);

    if (candidates.length > 0) {
      const best = selectBestSemverTag(candidates.map((c) => c.tag as string), includePrerelease) ?? candidates[0]?.tag ?? null;
      const bestMeta = candidates.find((c) => c.tag === best);
      return { latestVersion: best, publishedAtRaw: bestMeta?.publishedAtRaw, sourceLabel: 'release-list' };
    }
  }

  const tagsResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/tags?per_page=100`, { headers });
  if (!tagsResp.ok) {
    return { latestVersion: null, sourceLabel: 'tag', errorStatus: tagsResp.status };
  }

  const tags = await tagsResp.json() as Array<{ name?: string }>;
  const names = tags.map((t) => t.name).filter((n): n is string => Boolean(n));
  const picked = selectBestSemverTag(names, includePrerelease)
    ?? names.find((n) => includePrerelease || !isClearlyUnstableTag(n))
    ?? names[0]
    ?? null;

  return { latestVersion: picked, sourceLabel: 'tag' };
}

/**
 * Run a git release version check against various providers (npm, PyPI, Cargo, Maven, Helm, APT, GitLab, GitHub).
 */
export async function runGitReleaseCheck(target: string, config: Record<string, unknown>) {
  try {
    const includePrerelease = Boolean(config.includePrerelease ?? false);
    const detectedCurrent = await detectAppVersion(config);
    const currentVersion = detectedCurrent || String(config.currentVersion ?? '').trim() || null;

    const provider = String(config.provider ?? '').toLowerCase();

    // ── npm ──────────────────────────────────────────────────────────────────
    if (provider === 'npm') {
      const pkg = target.trim();
      if (!pkg) return { ok: false, statusCode: 400, latencyMs: null, message: 'Invalid npm package name', level: 'red' as const };

      const npmResp = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`, {
        headers: { 'User-Agent': 'PulseDock', Accept: 'application/json' },
      });
      if (!npmResp.ok) {
        return { ok: false, statusCode: npmResp.status, latencyMs: null, message: `npm registry ${npmResp.status}`, level: 'red' as const };
      }
      const npmPayload = await npmResp.json() as { version?: string; name?: string };
      const latestVersion = npmPayload.version ?? null;

      if (!latestVersion) {
        return { ok: false, statusCode: 404, latencyMs: null, message: 'No npm version found', level: 'red' as const };
      }

      if (currentVersion) {
        const level = classifyVersionStatus(currentVersion, latestVersion);
        return { ok: level === 'green', statusCode: 200, latencyMs: null, message: `npm current ${currentVersion}, latest ${latestVersion}`, level } as const;
      }
      return { ok: true, statusCode: 200, latencyMs: null, message: `npm latest ${latestVersion}`, level: 'green' as const };
    }

    // ── PyPI ─────────────────────────────────────────────────────────────────
    if (provider === 'pypi') {
      const pkg = target.trim();
      if (!pkg) return { ok: false, statusCode: 400, latencyMs: null, message: 'Invalid PyPI package name', level: 'red' as const };

      const pypiResp = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`, {
        headers: { 'User-Agent': 'PulseDock', Accept: 'application/json' },
      });
      if (!pypiResp.ok) {
        return { ok: false, statusCode: pypiResp.status, latencyMs: null, message: `PyPI API ${pypiResp.status}`, level: 'red' as const };
      }
      const pypiPayload = await pypiResp.json() as { info?: { version?: string } };
      const latestVersion = pypiPayload.info?.version ?? null;

      if (!latestVersion) {
        return { ok: false, statusCode: 404, latencyMs: null, message: 'No PyPI version found', level: 'red' as const };
      }

      if (currentVersion) {
        const level = classifyVersionStatus(currentVersion, latestVersion);
        return { ok: level === 'green', statusCode: 200, latencyMs: null, message: `PyPI current ${currentVersion}, latest ${latestVersion}`, level } as const;
      }
      return { ok: true, statusCode: 200, latencyMs: null, message: `PyPI latest ${latestVersion}`, level: 'green' as const };
    }

    // ── Cargo (crates.io) ────────────────────────────────────────────────────
    if (provider === 'cargo') {
      const pkg = target.trim();
      if (!pkg) return { ok: false, statusCode: 400, latencyMs: null, message: 'Invalid crate name', level: 'red' as const };

      const cargoResp = await fetch(`https://crates.io/api/v1/crates/${encodeURIComponent(pkg)}`, {
        headers: { 'User-Agent': 'PulseDock/1.0 (https://github.com/No749ah/PulseDock)', Accept: 'application/json' },
      });
      if (!cargoResp.ok) {
        return { ok: false, statusCode: cargoResp.status, latencyMs: null, message: `crates.io API ${cargoResp.status}`, level: 'red' as const };
      }
      const cargoPayload = await cargoResp.json() as { crate?: { newest_version?: string; max_stable_version?: string } };
      const latestVersion = cargoPayload.crate?.max_stable_version ?? cargoPayload.crate?.newest_version ?? null;

      if (!latestVersion) {
        return { ok: false, statusCode: 404, latencyMs: null, message: 'No crate version found', level: 'red' as const };
      }

      if (currentVersion) {
        const level = classifyVersionStatus(currentVersion, latestVersion);
        return { ok: level === 'green', statusCode: 200, latencyMs: null, message: `Cargo current ${currentVersion}, latest ${latestVersion}`, level } as const;
      }
      return { ok: true, statusCode: 200, latencyMs: null, message: `Cargo latest ${latestVersion}`, level: 'green' as const };
    }

    // ── Maven Central ────────────────────────────────────────────────────────
    if (provider === 'maven') {
      const parts = target.trim().split(':');
      if (parts.length < 2) return { ok: false, statusCode: 400, latencyMs: null, message: 'Invalid Maven target. Use "groupId:artifactId" format.', level: 'red' as const };
      const [groupId, artifactId] = parts;
      const mavenResp = await fetch(
        `https://search.maven.org/solrsearch/select?q=g:${encodeURIComponent(groupId)}+AND+a:${encodeURIComponent(artifactId)}&core=gav&rows=1&wt=json`,
        { headers: { 'User-Agent': 'PulseDock/1.0', Accept: 'application/json' } },
      );
      if (!mavenResp.ok) return { ok: false, statusCode: mavenResp.status, latencyMs: null, message: `Maven Central API ${mavenResp.status}`, level: 'red' as const };
      const mavenPayload = await mavenResp.json() as { response?: { docs?: Array<{ v?: string }> } };
      const latestVersion = mavenPayload.response?.docs?.[0]?.v ?? null;
      if (!latestVersion) return { ok: false, statusCode: 404, latencyMs: null, message: 'No Maven artifact version found', level: 'red' as const };
      if (currentVersion) {
        const level = classifyVersionStatus(currentVersion, latestVersion);
        return { ok: level === 'green', statusCode: 200, latencyMs: null, message: `Maven current ${currentVersion}, latest ${latestVersion}`, level } as const;
      }
      return { ok: true, statusCode: 200, latencyMs: null, message: `Maven latest ${latestVersion}`, level: 'green' as const };
    }

    // ── Helm (Artifact Hub) ──────────────────────────────────────────────────
    if (provider === 'helm') {
      const parts = target.trim().split('/');
      if (parts.length < 2) return { ok: false, statusCode: 400, latencyMs: null, message: 'Invalid Helm target. Use "repoName/chartName" format.', level: 'red' as const };
      const [repoName, chartName] = parts;
      const helmResp = await fetch(
        `https://artifacthub.io/api/v1/packages/helm/${encodeURIComponent(repoName)}/${encodeURIComponent(chartName)}`,
        { headers: { 'User-Agent': 'PulseDock/1.0', Accept: 'application/json' } },
      );
      if (!helmResp.ok) return { ok: false, statusCode: helmResp.status, latencyMs: null, message: `Artifact Hub API ${helmResp.status}`, level: 'red' as const };
      const helmPayload = await helmResp.json() as { version?: string; app_version?: string };
      const latestVersion = helmPayload.app_version ?? helmPayload.version ?? null;
      if (!latestVersion) return { ok: false, statusCode: 404, latencyMs: null, message: 'No Helm chart version found', level: 'red' as const };
      if (currentVersion) {
        const level = classifyVersionStatus(currentVersion, latestVersion);
        return { ok: level === 'green', statusCode: 200, latencyMs: null, message: `Helm current ${currentVersion}, latest ${latestVersion}`, level } as const;
      }
      return { ok: true, statusCode: 200, latencyMs: null, message: `Helm latest ${latestVersion}`, level: 'green' as const };
    }

    // ── APT ──────────────────────────────────────────────────────────────────
    if (provider === 'apt') {
      const pkg = target.trim().toLowerCase();
      if (!pkg) return { ok: false, statusCode: 400, latencyMs: null, message: 'Invalid APT package', level: 'red' as const };

      const aptResp = await fetch(`https://sources.debian.org/api/src/${encodeURIComponent(pkg)}/`, {
        headers: { 'User-Agent': 'PulseDock' },
      });
      if (!aptResp.ok) {
        return { ok: false, statusCode: aptResp.status, latencyMs: null, message: `Debian Sources API ${aptResp.status}`, level: 'red' as const };
      }
      const payload = await aptResp.json() as { versions?: Array<{ version?: string }> };
      const versions = (payload.versions ?? []).map((i) => i.version).filter((v): v is string => Boolean(v));
      const latestVersion = versions.find((v) => !/(alpha|beta|rc|nightly|dev|pre)/i.test(v)) ?? versions[0] ?? null;

      if (!latestVersion) {
        return { ok: false, statusCode: 404, latencyMs: null, message: 'No APT package versions found', level: 'red' as const };
      }

      if (currentVersion) {
        const level = classifyVersionStatus(currentVersion, latestVersion);
        return {
          ok: level === 'green',
          statusCode: 200,
          latencyMs: null,
          message: `APT current ${currentVersion}, latest ${latestVersion}`,
          level,
        } as const;
      }

      return { ok: true, statusCode: 200, latencyMs: null, message: `APT latest ${latestVersion}`, level: 'green' as const };
    }

    // ── GitLab ───────────────────────────────────────────────────────────────
    if (provider === 'gitlab' || target.startsWith('gitlab:') || target.includes('gitlab.com/')) {
      const parsedGitlab = parseGitlabTarget(target, config);
      if (parsedGitlab) {
        const encodedPath = encodeURIComponent(parsedGitlab.projectPath);
        const gitlabHeaders: Record<string, string> = { 'User-Agent': 'PulseDock' };
        const gitlabToken = String(config.gitlabToken ?? config.token ?? process.env.GITLAB_TOKEN ?? '').trim();
        if (gitlabToken) gitlabHeaders['PRIVATE-TOKEN'] = gitlabToken;

        const response = await fetch(`https://${parsedGitlab.host}/api/v4/projects/${encodedPath}/releases/permalink/latest`, {
          headers: gitlabHeaders,
        });
        if (!response.ok) {
          return { ok: false, statusCode: response.status, latencyMs: null, message: `GitLab API ${response.status}`, level: 'red' as const };
        }
        const latest = await response.json() as { tag_name?: string; released_at?: string; created_at?: string };
        const latestVersion = latest.tag_name ?? null;

        if (currentVersion && latestVersion) {
          const level = classifyVersionStatus(currentVersion, latestVersion);
          return { ok: level === 'green', statusCode: 200, latencyMs: null, message: `GitLab current ${currentVersion}, latest ${latestVersion}`, level } as const;
        }

        const publishedAt = new Date(latest.released_at ?? latest.created_at ?? Date.now()).getTime();
        const ageHours = (Date.now() - publishedAt) / 36e5;
        const warn = Number(config.warnAfterHours ?? 336);
        const crit = Number(config.critAfterHours ?? 720);
        const level = ageHours > crit ? 'red' : ageHours > warn ? 'yellow' : 'green';
        return {
          ok: level === 'green',
          statusCode: 200,
          latencyMs: null,
          message: `GitLab latest ${latestVersion ?? 'unknown'} (${Math.floor(ageHours)}h old)`,
          level,
        } as const;
      }
    }

    // ── GitHub (default) ─────────────────────────────────────────────────────
    const repo = parseGithubRepo(target);
    if (!repo) {
      return { ok: false, statusCode: 0, latencyMs: null, message: 'Invalid GitHub/GitLab target', level: 'red' as const };
    }

    const githubHeaders: Record<string, string> = {
      'User-Agent': 'PulseDock',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const githubToken = String(config.githubToken ?? process.env.GITHUB_TOKEN ?? '').trim();
    if (githubToken) githubHeaders.authorization = `Bearer ${githubToken}`;

    const latestData = await fetchGithubLatestVersion(repo.owner, repo.repo, githubHeaders, includePrerelease);
    if (!latestData.latestVersion) {
      return {
        ok: false,
        statusCode: latestData.errorStatus ?? 404,
        latencyMs: null,
        message: latestData.errorStatus ? `GitHub API ${latestData.errorStatus}` : 'No release/tag found',
        level: 'red' as const,
      };
    }

    if (currentVersion) {
      const level = classifyVersionStatus(currentVersion, latestData.latestVersion);
      return {
        ok: level === 'green',
        statusCode: 200,
        latencyMs: null,
        message: `GitHub current ${currentVersion}, latest ${latestData.latestVersion}`,
        level,
      } as const;
    }

    const publishedAt = new Date(latestData.publishedAtRaw ?? Date.now()).getTime();
    const ageHours = (Date.now() - publishedAt) / 36e5;
    const warn = Number(config.warnAfterHours ?? 336);
    const crit = Number(config.critAfterHours ?? 720);
    const level = ageHours > crit ? 'red' : ageHours > warn ? 'yellow' : 'green';

    return {
      ok: level === 'green',
      statusCode: 200,
      latencyMs: null,
      message: `GitHub latest ${latestData.sourceLabel} ${latestData.latestVersion} (${Math.floor(ageHours)}h old)`,
      level,
    } as const;
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      latencyMs: null,
      message: error instanceof Error ? `Version check failed: ${error.message}` : 'Version check failed',
      level: 'red' as const,
    };
  }
}

/**
 * Run a Docker image version check against Docker Hub.
 */
export async function runDockerCheck(target: string, config: Record<string, unknown>) {
  try {
    const includePrerelease = Boolean(config.includePrerelease ?? false);
    const currentTag = String(config.currentTag ?? config.currentVersion ?? '').trim() || null;
    const image = target.includes('/') ? target : `library/${target}`;
    const response = await fetch(`https://hub.docker.com/v2/repositories/${image}/tags?page_size=50&page=1&ordering=last_updated`);
    if (!response.ok) {
      return { ok: false, statusCode: response.status, latencyMs: null, message: `Docker API ${response.status}`, level: 'red' as const };
    }

    const payload = await response.json() as { results?: Array<{ name: string; last_updated: string }> };
    const tags = payload.results ?? [];
    const tagNames = tags.map((t) => t.name);
    const latestFromSemver = selectBestSemverTag(tagNames, includePrerelease);
    const latest = latestFromSemver ?? tags.find((t) => includePrerelease || !isClearlyUnstableTag(t.name))?.name ?? tags[0]?.name ?? null;

    if (!latest) {
      return { ok: false, statusCode: 404, latencyMs: null, message: 'No tags found', level: 'red' as const };
    }

    if (currentTag) {
      const level = classifyVersionStatus(currentTag, latest);
      return {
        ok: level === 'green',
        statusCode: 200,
        latencyMs: null,
        message: `Docker current ${currentTag}, latest ${latest}`,
        level,
      } as const;
    }

    const latestMeta = tags.find((t) => t.name === latest) ?? tags[0];
    const ageHours = (Date.now() - new Date(latestMeta.last_updated).getTime()) / 36e5;
    const warn = Number(config.warnAfterHours ?? 336);
    const crit = Number(config.critAfterHours ?? 720);
    const level = ageHours > crit ? 'red' : ageHours > warn ? 'yellow' : 'green';

    return {
      ok: level === 'green',
      statusCode: 200,
      latencyMs: null,
      message: `Latest ${latest} (${Math.floor(ageHours)}h old)`,
      level,
    } as const;
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      latencyMs: null,
      message: error instanceof Error ? `Docker check failed: ${error.message}` : 'Docker check failed',
      level: 'red' as const,
    };
  }
}
