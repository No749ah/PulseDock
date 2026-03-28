import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { runExtractorPipeline, normalizeExtractors } from '../checks/version-extractor.util';

/**
 * Handles version detection, connection testing, and version summary for monitors.
 * Extracted from MonitorsService to keep version-specific logic isolated.
 */
@Injectable()
export class VersionDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  private parseGithubRepo(input: string) {
    const cleaned = input.replace(/^https?:\/\/github.com\//i, '').replace(/\.git$/, '');
    const [owner, repo] = cleaned.split('/');
    if (!owner || !repo) return null;
    return { owner, repo };
  }

  private parseGitlabTarget(target: string, host?: string) {
    const fallbackHost = (host ?? 'gitlab.com').replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (target.startsWith('gitlab:')) {
      const projectPath = target.slice('gitlab:'.length).trim();
      if (!projectPath) return null;
      return { host: fallbackHost, projectPath };
    }
    const m = target.match(/^https?:\/\/([^/]+)\/(.+)$/i);
    if (m) return { host: m[1], projectPath: m[2].replace(/\.git$/, '').replace(/\/$/, '') };

    // Allow plain group/project input when provider=gitlab
    if (target.includes('/')) {
      return { host: fallbackHost, projectPath: target.replace(/\.git$/, '').replace(/^\/+|\/+$/g, '') };
    }

    return null;
  }

  private pickPreferredTag(tags: Array<{ name?: string }>) {
    const nonNightly = tags.find((t) => t.name && !t.name.toLowerCase().includes('nightly'));
    return nonNightly?.name ?? tags[0]?.name ?? null;
  }

  private isSensibleVersionValue(value: string): boolean {
    const v = String(value).trim();
    if (!v) return false;
    if (v.length > 64) return false;

    // Accept semantic-ish versions like 1.2.3, v2.33.3, 2.33.3-linux-amd64
    if (/^v?\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?$/i.test(v)) return true;

    // Accept loose numeric version tokens embedded in strings (e.g. "version=2.33.3")
    if (/v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?/i.test(v)) return true;

    return false;
  }

  private extractVersionFromText(text: string): string | null {
    const source = String(text ?? '');
    if (!source) return null;

    const tokenRe = /v?\d+\.\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?/gi;
    const candidates: Array<{ value: string; score: number }> = [];

    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(source)) !== null) {
      const value = m[0];
      const idx = m.index;
      const before = source.slice(Math.max(0, idx - 60), idx).toLowerCase();
      const after = source.slice(idx + value.length, idx + value.length + 60).toLowerCase();
      const ctx = `${before} ${after}`;

      // Always ignore anything near "latest" markers
      if (ctx.includes('latest')) continue;

      let score = 0;
      if (ctx.includes('versionstring')) score += 7;
      if (ctx.includes('serverversion')) score += 6;
      if (ctx.includes('databaseversion')) score += 3;
      if (ctx.includes('version')) score += 3;
      if (ctx.includes('build')) score += 1;

      if (this.isSensibleVersionValue(value)) score += 2;

      candidates.push({ value, score });
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.value.length - a.value.length;
    });

    return candidates[0]?.value ?? null;
  }

  private extractVersionFromPayload(payload: unknown): string | null {
    if (!payload) return null;
    if (typeof payload === 'string') {
      return this.extractVersionFromText(payload);
    }
    if (Array.isArray(payload)) {
      for (const item of payload) {
        const v = this.extractVersionFromPayload(item);
        if (v) return v;
      }
      return null;
    }
    if (typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;
      const directKeySet = new Set([
        'version',
        'appversion',
        'app_version',
        'release',
        'tag',
        'buildversion',
        'serverversion',
        'databaseversion',
        'imagetag',
      ]);

      for (const [key, value] of Object.entries(obj)) {
        const normalized = key.replace(/[^a-z0-9_]/gi, '').toLowerCase();

        // Never use "latest" fields for deployed/current version detection.
        if (normalized.includes('latest')) continue;

        if (directKeySet.has(normalized) && typeof value === 'string' && this.isSensibleVersionValue(value)) {
          const m = value.match(/v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?/i);
          return m ? m[0] : value;
        }

        // Fallback: accept any key that looks version-like but is not "latest*"
        if (normalized.includes('version') && typeof value === 'string' && this.isSensibleVersionValue(value)) {
          const m = value.match(/v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?/i);
          return m ? m[0] : value;
        }
      }

      const nested = ['data', 'build', 'info', 'meta', 'runtime', 'dependencies'];
      for (const key of nested) {
        const v = this.extractVersionFromPayload(obj[key]);
        if (v) return v;
      }
    }
    return null;
  }

  private async detectDeployedVersion(input: { appUrl?: string; appToken?: string; appVersionEndpoint?: string; appAuthType?: 'none' | 'token' | 'openvpn'; openvpnUsername?: string; openvpnPassword?: string; endpointFallbacks?: string[]; jsonPath?: string; jsonPathExtractors?: string[] }) {
    if (!input.appUrl) {
      return {
        currentVersion: null as string | null,
        tried: [] as string[],
        detectedFrom: null as string | null,
        authFailed: false,
        authMode: null as string | null,
      };
    }

    const base = input.appUrl.replace(/\/$/, '');
    const custom = String(input.appVersionEndpoint ?? '').trim();
    const registryFallbacks = (input.endpointFallbacks ?? []).filter((s) => typeof s === 'string' && s.trim());
    const defaultCandidates = [
      '/version',
      '/api/version',
      '/api/v1/version',
      '/api/system/version',
      '/api/v1/health',
      '/api/v1/info',
      '/health',
      '/api/health',
      '/status',
      '/actuator/info',
      '/actuator/health',
    ];
    // Priority: explicit custom endpoint first, then registry fallbacks, then generic defaults
    const candidates = custom
      ? [custom, ...registryFallbacks]
      : registryFallbacks.length > 0
        ? registryFallbacks
        : defaultCandidates;

    const token = String(input.appToken ?? '').trim();
    const authType = (input.appAuthType ?? 'token') as 'none' | 'token' | 'openvpn';
    const ovpnUser = String(input.openvpnUsername ?? '').trim();
    const ovpnPass = String(input.openvpnPassword ?? '').trim();
    const basic = ovpnUser || ovpnPass ? Buffer.from(`${ovpnUser}:${ovpnPass}`).toString('base64') : '';

    const authModes: Array<{ label: string; apply: (h: Record<string, string>) => void }> =
      authType === 'none'
        ? [{ label: 'no-auth', apply: () => {} }]
        : authType === 'openvpn'
          ? [
              { label: 'openvpn-basic', apply: (h) => { if (basic) h.authorization = `Basic ${basic}`; } },
              { label: 'openvpn-headers', apply: (h) => { if (ovpnUser) h['x-openvpn-username'] = ovpnUser; if (ovpnPass) h['x-openvpn-password'] = ovpnPass; } },
            ]
          : [
              { label: 'authorization-bearer', apply: (h) => { if (token) h.authorization = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`; } },
              { label: 'authorization-raw', apply: (h) => { if (token) h.authorization = token; } },
              { label: 'x-api-key', apply: (h) => { if (token) h['x-api-key'] = token; } },
              { label: 'x-access-token', apply: (h) => { if (token) h['x-access-token'] = token; } },
              { label: 'token', apply: (h) => { if (token) h.token = token; } },
            ];

    const tried: string[] = [];
    let authFailed = false;

    for (const path of candidates) {
      const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;

      for (const mode of authModes) {
        const headers: Record<string, string> = { 'User-Agent': 'PulseDock' };
        mode.apply(headers);

        tried.push(`${url} [${mode.label}]`);

        try {
          const resp = await fetch(url, { headers });
          if (!resp.ok) {
            if (resp.status === 401 || resp.status === 403) authFailed = true;
            continue;
          }

          const contentType = resp.headers.get('content-type') ?? '';
          const body = contentType.includes('application/json') ? await resp.json() : await resp.text();
          const extractors = normalizeExtractors(input.jsonPath, input.jsonPathExtractors);
          const version = extractors.length > 0
            ? (runExtractorPipeline(body, extractors) ?? this.extractVersionFromPayload(body))
            : this.extractVersionFromPayload(body);

          if (version) {
            return {
              currentVersion: version,
              tried,
              detectedFrom: url,
              authFailed: false,
              authMode: mode.label,
            };
          }
        } catch {
          continue;
        }
      }
    }

    return { currentVersion: null as string | null, tried, detectedFrom: null as string | null, authFailed, authMode: null as string | null };
  }

  /**
   * Tests connectivity and version retrieval for a version-monitored source (GitHub, GitLab, Docker Hub, npm, etc.).
   * Used by the UI's "Test Connection" button before saving a version monitor.
   * @param input.provider - The version source provider
   * @param input.target - The target identifier (repo path, package name, image name, etc.)
   * @param input.token - Optional API token for authenticated requests
   * @param input.host - Optional custom GitLab host
   * @returns { ok, message, latestVersion } — ok=false if the connection failed
   * @throws Error when an upstream request fails unexpectedly
   */
  async testVersionConnection(input: { provider: 'github' | 'gitlab' | 'forgejo' | 'gitea' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'nuget' | 'rubygems' | 'gem' | 'go' | 'golang' | 'gomod' | 'maven' | 'helm'; target: string; token?: string; host?: string }) {
    if (input.provider === 'github') {
      const repo = this.parseGithubRepo(input.target);
      if (!repo) return { ok: false, message: 'Invalid GitHub target. Use owner/repo or GitHub URL.' };
      const headers: Record<string, string> = { 'User-Agent': 'PulseDock' };
      if (input.token) headers.authorization = `Bearer ${input.token}`;

      const releaseResp = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`, { headers });
      if (releaseResp.ok) {
        const data = await releaseResp.json() as { tag_name?: string };
        return { ok: true, message: 'GitHub release endpoint reachable', latestVersion: data.tag_name ?? null, source: 'releases/latest' };
      }

      if (releaseResp.status === 404) {
        const tagsResp = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/tags?per_page=1`, { headers });
        if (!tagsResp.ok) return { ok: false, message: `GitHub API ${tagsResp.status} (no releases and tags lookup failed)` };
        const tags = await tagsResp.json() as Array<{ name?: string }>;
        const picked = this.pickPreferredTag(tags);
        return { ok: true, message: 'No GitHub releases found; using latest non-nightly tag fallback', latestVersion: picked, source: 'tags' };
      }

      return { ok: false, message: `GitHub API ${releaseResp.status}`, unauthorized: releaseResp.status === 401 || releaseResp.status === 403 };
    }

    if (input.provider === 'gitlab') {
      const parsed = this.parseGitlabTarget(input.target, input.host);
      if (!parsed) return { ok: false, message: 'Invalid GitLab target. Use gitlab:group/project or GitLab URL.' };
      const headers: Record<string, string> = { 'User-Agent': 'PulseDock' };
      if (input.token) headers['PRIVATE-TOKEN'] = input.token;
      const encodedPath = encodeURIComponent(parsed.projectPath);
      const resp = await fetch(`https://${parsed.host}/api/v4/projects/${encodedPath}/releases/permalink/latest`, { headers });
      if (!resp.ok) return { ok: false, message: `GitLab API ${resp.status}`, unauthorized: resp.status === 401 || resp.status === 403 };
      const data = await resp.json() as { tag_name?: string };
      return { ok: true, message: 'GitLab connection successful', latestVersion: data.tag_name ?? null };
    }

    if (input.provider === 'npm') {
      const pkg = input.target.trim();
      if (!pkg) return { ok: false, message: 'Invalid npm package name.' };
      const resp = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`, {
        headers: { 'User-Agent': 'PulseDock', Accept: 'application/json' },
      });
      if (!resp.ok) return { ok: false, message: `npm registry ${resp.status}` };
      const data = await resp.json() as { version?: string; name?: string };
      return { ok: true, message: 'npm registry reachable', latestVersion: data.version ?? null };
    }

    if (input.provider === 'pypi') {
      const pkg = input.target.trim();
      if (!pkg) return { ok: false, message: 'Invalid PyPI package name.' };
      const resp = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`, {
        headers: { 'User-Agent': 'PulseDock', Accept: 'application/json' },
      });
      if (!resp.ok) return { ok: false, message: `PyPI API ${resp.status}` };
      const data = await resp.json() as { info?: { version?: string } };
      return { ok: true, message: 'PyPI API reachable', latestVersion: data.info?.version ?? null };
    }

    if (input.provider === 'cargo') {
      const pkg = input.target.trim();
      if (!pkg) return { ok: false, message: 'Invalid crate name.' };
      const resp = await fetch(`https://crates.io/api/v1/crates/${encodeURIComponent(pkg)}`, {
        headers: { 'User-Agent': 'PulseDock/1.0 (https://github.com/No749ah/PulseDock)', Accept: 'application/json' },
      });
      if (!resp.ok) return { ok: false, message: `crates.io API ${resp.status}` };
      const data = await resp.json() as { crate?: { max_stable_version?: string; newest_version?: string } };
      return { ok: true, message: 'crates.io API reachable', latestVersion: data.crate?.max_stable_version ?? data.crate?.newest_version ?? null };
    }

    if (input.provider === 'apt') {
      const pkg = input.target.trim().toLowerCase();
      if (!pkg) return { ok: false, message: 'Invalid APT package name.' };

      const resp = await fetch(`https://sources.debian.org/api/src/${encodeURIComponent(pkg)}/`, {
        headers: { 'User-Agent': 'PulseDock' },
      });
      if (!resp.ok) return { ok: false, message: `Debian Sources API ${resp.status}` };

      const data = await resp.json() as { versions?: Array<{ version?: string; suites?: string[] }> };
      const versions = (data.versions ?? []).map((v) => v.version).filter((v): v is string => Boolean(v));
      const stable = versions.find((v) => !/(alpha|beta|rc|nightly|dev|pre)/i.test(v));
      return { ok: true, message: 'APT package lookup successful', latestVersion: stable ?? versions[0] ?? null };
    }

    if (input.provider === 'nuget') {
      const pkg = input.target.replace(/^nuget:/i, '').trim();
      if (!pkg) return { ok: false, message: 'Invalid NuGet package name.' };
      const resp = await fetch(
        `https://api.nuget.org/v3-flatcontainer/${encodeURIComponent(pkg.toLowerCase())}/index.json`,
        { headers: { 'User-Agent': 'PulseDock' } },
      );
      if (!resp.ok) return { ok: false, message: `NuGet API ${resp.status}` };
      const data = await resp.json() as { versions?: string[] };
      const versions = data.versions ?? [];
      const stable = versions.filter((v) => !/(alpha|beta|preview|rc|pre)/i.test(v));
      const latestVersion = stable.at(-1) ?? versions.at(-1) ?? null;
      if (!latestVersion) return { ok: false, message: 'No NuGet versions found.' };
      return { ok: true, message: 'NuGet API reachable', latestVersion };
    }

    if (input.provider === 'rubygems' || input.provider === 'gem') {
      const gem = input.target.replace(/^(rubygems:|gem:)/i, '').trim();
      if (!gem) return { ok: false, message: 'Invalid gem name.' };
      const resp = await fetch(`https://rubygems.org/api/v1/gems/${encodeURIComponent(gem)}.json`, {
        headers: { 'User-Agent': 'PulseDock' },
      });
      if (!resp.ok) return { ok: false, message: `RubyGems API ${resp.status}` };
      const data = await resp.json() as { version?: string };
      return { ok: true, message: 'RubyGems API reachable', latestVersion: data.version ?? null };
    }

    if (input.provider === 'go' || input.provider === 'golang' || input.provider === 'gomod') {
      const module = input.target.replace(/^(go:|golang:|gomod:)/i, '').trim();
      if (!module) return { ok: false, message: 'Invalid Go module path.' };
      const resp = await fetch(`https://proxy.golang.org/${encodeURIComponent(module)}/@latest`, {
        headers: { 'User-Agent': 'PulseDock' },
      });
      if (!resp.ok) return { ok: false, message: `Go proxy API ${resp.status}` };
      const data = await resp.json() as { Version?: string; Error?: string };
      if (data.Error) return { ok: false, message: `Go module error: ${data.Error}` };
      return { ok: true, message: 'Go module proxy reachable', latestVersion: data.Version ?? null };
    }

    if (input.provider === 'forgejo' || input.provider === 'gitea') {
      const rawTarget = input.target.replace(/^(forgejo:|gitea:)/i, '').trim();
      const defaultHost = input.provider === 'forgejo' ? 'codeberg.org' : 'localhost:3000';
      let host = defaultHost;
      let repoPath = rawTarget;
      const parts = rawTarget.split('/');
      if (parts.length >= 3 && parts[0].includes('.')) {
        host = parts[0];
        repoPath = parts.slice(1).join('/');
      }
      if (!repoPath.includes('/')) return { ok: false, message: `Invalid ${input.provider} target. Use "owner/repo" format.` };
      const headers: Record<string, string> = { 'User-Agent': 'PulseDock', Accept: 'application/json' };
      if (input.token) headers['Authorization'] = `token ${input.token}`;
      const resp = await fetch(`https://${host}/api/v1/repos/${repoPath}/releases?limit=1&page=1`, { headers });
      if (!resp.ok) return { ok: false, message: `${input.provider} API ${resp.status}` };
      const releases = await resp.json() as Array<{ tag_name?: string }>;
      return { ok: true, message: `${input.provider} API reachable`, latestVersion: releases[0]?.tag_name ?? null };
    }

    if (input.provider === 'maven') {
      const parts = input.target.trim().split(':');
      if (parts.length < 2) return { ok: false, message: 'Invalid Maven target. Use "groupId:artifactId" format.' };
      const [groupId, artifactId] = parts;
      const resp = await fetch(
        `https://search.maven.org/solrsearch/select?q=g:${encodeURIComponent(groupId)}+AND+a:${encodeURIComponent(artifactId)}&core=gav&rows=1&wt=json`,
        { headers: { 'User-Agent': 'PulseDock', Accept: 'application/json' } },
      );
      if (!resp.ok) return { ok: false, message: `Maven Central API ${resp.status}` };
      const data = await resp.json() as { response?: { docs?: Array<{ v?: string }> } };
      const latestVersion = data.response?.docs?.[0]?.v ?? null;
      if (!latestVersion) return { ok: false, message: 'No Maven artifact version found. Check groupId:artifactId.' };
      return { ok: true, message: 'Maven Central reachable', latestVersion };
    }

    if (input.provider === 'helm') {
      const parts = input.target.trim().split('/');
      if (parts.length < 2) return { ok: false, message: 'Invalid Helm target. Use "repoName/chartName" format.' };
      const [repoName, chartName] = parts;
      const resp = await fetch(
        `https://artifacthub.io/api/v1/packages/helm/${encodeURIComponent(repoName)}/${encodeURIComponent(chartName)}`,
        { headers: { 'User-Agent': 'PulseDock', Accept: 'application/json' } },
      );
      if (!resp.ok) return { ok: false, message: `Artifact Hub API ${resp.status}` };
      const data = await resp.json() as { version?: string; app_version?: string };
      const latestVersion = data.app_version ?? data.version ?? null;
      if (!latestVersion) return { ok: false, message: 'No Helm chart version found.' };
      return { ok: true, message: 'Artifact Hub reachable', latestVersion };
    }

    const image = input.target.includes('/') ? input.target : `library/${input.target}`;
    const resp = await fetch(`https://hub.docker.com/v2/repositories/${image}/tags?page_size=1&page=1&ordering=last_updated`);
    if (!resp.ok) return { ok: false, message: `Docker API ${resp.status}` };
    const data = await resp.json() as { results?: Array<{ name: string }> };
    return { ok: true, message: 'Docker Hub connection successful', latestVersion: data.results?.[0]?.name ?? null };
  }

  /**
   * Attempts to auto-discover the currently deployed version of an application.
   * Strategy: (1) probe the app's version endpoint, (2) fall back to latest release from provider,
   * (3) return strategy='manual' if neither succeeds.
   * @param input - Connection details including provider, target, appUrl, auth config, etc.
   * @returns { currentVersion, strategy, tried, detectedFrom } — strategy indicates how version was found
   * @throws Error when probing endpoints fails unexpectedly
   */
  async discoverCurrentVersion(input: { provider: 'github' | 'gitlab' | 'forgejo' | 'gitea' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'nuget' | 'rubygems' | 'gem' | 'go' | 'golang' | 'gomod' | 'maven' | 'helm'; target: string; token?: string; host?: string; appUrl?: string; appToken?: string; appVersionEndpoint?: string; appAuthType?: 'none' | 'token' | 'openvpn'; openvpnUsername?: string; openvpnPassword?: string; endpointFallbacks?: string[]; jsonPath?: string; jsonPathExtractors?: string[] }) {
    const hasAppUrl = Boolean(input.appUrl && input.appUrl.trim());
    const deployed = await this.detectDeployedVersion({
      appUrl: input.appUrl,
      appToken: input.appToken,
      appVersionEndpoint: input.appVersionEndpoint,
      appAuthType: input.appAuthType,
      openvpnUsername: input.openvpnUsername,
      openvpnPassword: input.openvpnPassword,
      endpointFallbacks: input.endpointFallbacks,
      jsonPath: input.jsonPath,
      jsonPathExtractors: input.jsonPathExtractors,
    });
    if (deployed.currentVersion) {
      return {
        currentVersion: deployed.currentVersion,
        strategy: 'deployed-endpoint',
        tried: deployed.tried,
        detectedFrom: deployed.detectedFrom,
        authMode: deployed.authMode,
      };
    }

    if (hasAppUrl) {
      return {
        currentVersion: null,
        strategy: 'manual',
        authFailed: deployed.authFailed,
        message: deployed.authFailed
          ? 'Application endpoint requires valid auth token (401/403). Check token or auth header format.'
          : 'No application version endpoint returned a usable version. Add app token/custom endpoint or enter current version manually.',
        tried: deployed.tried,
      };
    }

    const probes = await this.testVersionConnection(input);
    if (probes.ok) return { currentVersion: probes.latestVersion ?? null, strategy: 'latest-release-probe', tried: deployed.tried };
    return {
      currentVersion: null,
      strategy: 'manual',
      suggestions: input.provider === 'docker'
        ? ['latest', 'stable', 'main', 'master']
        : ['v1.0.0', 'v0.1.0', 'main'],
      message: 'Auto-discovery failed. Please provide current version manually or a custom app version endpoint.',
      tried: deployed.tried,
    };
  }

  /**
   * Returns a summary of all version monitors (GIT_RELEASE, DOCKER_IMAGE) for the user.
   * Includes aggregate stats (total, green, yellow, red) and per-monitor current/latest status.
   * Used by the dashboard's version overview widget.
   * @param userId - The authenticated user's ID
   * @returns { stats, items } — stats is a count breakdown; items is the per-monitor detail list
   * @throws Error when monitor summary query fails
   */
  async versionSummary(userId: string) {
    // Performance: single query with nested include avoids N+1
    const monitors = await this.prisma.monitor.findMany({
      where: { userId, type: { in: ['GIT_RELEASE', 'DOCKER_IMAGE'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        monitorAlerts: { include: { alertChannel: { select: { id: true, name: true, type: true } } } },
        runs: {
          take: 1,
          orderBy: { checkedAt: 'desc' },
        },
      },
    });

    const rows = monitors.map((m) => {
      const latest = m.runs[0] ?? null;
      const config = (m.configJson as Record<string, unknown> | null) ?? {};
      return {
        id: m.id,
        name: m.name,
        type: m.type,
        target: m.target,
        currentVersion: String(config.currentVersion ?? config.currentTag ?? '').replace(/^v(?=\d)/i, ''),
        latestMessage: latest?.message ?? 'No run yet',
        level: (latest?.level as 'green' | 'yellow' | 'red' | undefined) ?? 'yellow',
        checkedAt: latest?.checkedAt?.toISOString() ?? null,
        intervalSec: m.intervalSec,
        alertChannels: m.monitorAlerts.map((ma) => ({ id: ma.alertChannelId, name: ma.alertChannel.name, type: ma.alertChannel.type, notifyOn: ma.notifyOn })),
      };
    });

    return {
      stats: {
        total: rows.length,
        green: rows.filter((r) => r.level === 'green').length,
        yellow: rows.filter((r) => r.level === 'yellow').length,
        red: rows.filter((r) => r.level === 'red').length,
      },
      items: rows,
    };
  }

  // ── External import parsers ─────────────────────────────────────────────────

  /**
   * Parse an Uptime Robot JSON export and return a normalised monitor list.
   * Uptime Robot monitor types: 1=HTTP(S), 2=Keyword, 3=Ping, 4=Port, 5=Heartbeat
   * We map type 1 and 2 → HTTP; skip unsupported types.
   */
}
