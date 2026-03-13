import { Injectable, Optional } from '@nestjs/common';

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/i;
import type { Monitor, MonitorRun } from '../types';
import { PrismaService } from '../common/prisma.service';
import { AlertsService } from '../alerts/alerts.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { PluginRegistry } from './plugin.registry';
import { executePluginSafely } from './plugin.sandbox';
import { httpResponseMatchPlugin } from './plugins/http-response-match.plugin';

@Injectable()
export class ChecksService {
  private readonly realtime: Pick<RealtimeEvents, 'monitorChecked'>;
  private readonly pluginRegistry = new PluginRegistry();

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
    @Optional() realtime?: RealtimeEvents,
  ) {
    this.realtime = realtime ?? { monitorChecked: () => undefined };
    this.pluginRegistry.register(httpResponseMatchPlugin);
  }

  listPlugins() {
    return this.pluginRegistry.list();
  }

  private parseGithubRepo(input: string) {
    const cleaned = input.replace(/^https?:\/\/github.com\//i, '').replace(/\.git$/, '');
    const [owner, repo] = cleaned.split('/');
    if (!owner || !repo) return null;
    return { owner, repo };
  }

  private parseSemver(v?: string | null) {
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

  private normalizeVersion(value?: string | null) {
    if (!value) return null;
    const direct = this.parseSemver(value);
    if (direct) return direct;
    const extracted = value.match(/v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?/);
    if (!extracted) return null;
    return this.parseSemver(extracted[0]);
  }

  private comparePrereleaseParts(a: string | number, b: string | number) {
    const aNum = typeof a === 'number';
    const bNum = typeof b === 'number';
    if (aNum && bNum) return a - b;
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    return String(a).localeCompare(String(b));
  }

  private compareSemver(a?: string | null, b?: string | null) {
    const pa = this.normalizeVersion(a);
    const pb = this.normalizeVersion(b);
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
      const cmp = this.comparePrereleaseParts(aPre[i], bPre[i]);
      if (cmp !== 0) return cmp;
    }

    return 0;
  }

  private classifyVersionStatus(currentVersion?: string | null, latestVersion?: string | null): 'green' | 'yellow' | 'red' {
    const cmp = this.compareSemver(currentVersion, latestVersion);
    if (cmp === null) {
      return currentVersion && latestVersion && this.normalizeVersion(currentVersion)?.major === this.normalizeVersion(latestVersion)?.major ? 'yellow' : 'red';
    }
    if (cmp >= 0) return 'green';

    const current = this.normalizeVersion(currentVersion);
    const latest = this.normalizeVersion(latestVersion);
    if (!current || !latest) return 'yellow';

    // Concept:
    // - GREEN: current >= latest (okay)
    // - YELLOW: update available in same major line
    // - RED: critical update (major version behind)
    if (latest.major > current.major) return 'red';
    return 'yellow';
  }

  private isClearlyUnstableTag(tag?: string | null) {
    if (!tag) return false;
    const t = tag.toLowerCase();
    return /(nightly|alpha|beta|rc|canary|snapshot|dev)/.test(t);
  }

  private parseGitlabTarget(target: string, config: Record<string, unknown>) {
    const host = String(config.gitlabHost ?? 'gitlab.com').replace(/\/$/, '');
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

  private selectBestSemverTag(tags: string[], includePrerelease: boolean) {
    const filtered = tags.filter((tag) => {
      const parsed = this.normalizeVersion(tag);
      if (!parsed) return false;
      if (includePrerelease) return true;
      return parsed.prerelease.length === 0 && !this.isClearlyUnstableTag(tag);
    });

    const source = filtered.length > 0 ? filtered : tags;
    if (source.length === 0) return null;

    return source.sort((a, b) => {
      const cmp = this.compareSemver(a, b);
      return cmp === null ? 0 : -cmp;
    })[0] ?? null;
  }

  private async runHttpCheck(url: string, timeoutMs = 5000) {
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      return {
        ok: response.ok,
        statusCode: response.status,
        latencyMs: Date.now() - started,
        message: response.ok ? 'OK' : `HTTP ${response.status}`,
        level: response.ok ? 'green' : 'red' as const,
      };
    } catch (error) {
      return {
        ok: false,
        statusCode: 0,
        latencyMs: Date.now() - started,
        message: error instanceof Error ? error.message : 'Request failed',
        level: 'red' as const,
      };
    }
  }

  private extractVersion(payload: unknown): string | null {
    if (!payload) return null;
    if (typeof payload === 'string') {
      const m = payload.match(/v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?/i);
      return m ? m[0] : null;
    }
    if (Array.isArray(payload)) {
      for (const item of payload) {
        const v = this.extractVersion(item);
        if (v) return v;
      }
      return null;
    }
    if (typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;
      for (const key of ['version', 'appVersion', 'app_version', 'release', 'tag', 'buildVersion']) {
        if (typeof obj[key] === 'string') return obj[key] as string;
      }
      for (const key of ['data', 'build', 'info', 'meta']) {
        const v = this.extractVersion(obj[key]);
        if (v) return v;
      }
    }
    return null;
  }

  private async detectAppVersion(config: Record<string, unknown>) {
    const appUrl = String(config.appUrl ?? '').trim();
    if (!appUrl) return null;
    const base = appUrl.replace(/\/$/, '');
    const custom = String(config.appVersionEndpoint ?? '').trim();
    const candidates = custom
      ? [custom]
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
        const detected = this.extractVersion(body);
        if (detected) return detected;
      } catch {
        continue;
      }
    }
    return null;
  }

  private async fetchGithubLatestVersion(
    owner: string,
    repo: string,
    headers: Record<string, string>,
    includePrerelease: boolean,
  ) {
    const latestResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers });
    if (latestResp.ok) {
      const latest = await latestResp.json() as { tag_name?: string; published_at?: string; created_at?: string };
      return {
        latestVersion: latest.tag_name ?? null,
        publishedAtRaw: latest.published_at ?? latest.created_at,
        sourceLabel: 'release',
      };
    }

    // releases/latest returns 404 when there are no releases.
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
        const best = this.selectBestSemverTag(candidates.map((c) => c.tag as string), includePrerelease) ?? candidates[0]?.tag ?? null;
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
    const picked = this.selectBestSemverTag(names, includePrerelease)
      ?? names.find((n) => includePrerelease || !this.isClearlyUnstableTag(n))
      ?? names[0]
      ?? null;

    return { latestVersion: picked, sourceLabel: 'tag' };
  }

  private async runGitReleaseCheck(target: string, config: Record<string, unknown>) {
    try {
      const includePrerelease = Boolean(config.includePrerelease ?? false);
      const detectedCurrent = await this.detectAppVersion(config);
      const currentVersion = detectedCurrent || String(config.currentVersion ?? '').trim() || null;

      const provider = String(config.provider ?? '').toLowerCase();

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
          const level = this.classifyVersionStatus(currentVersion, latestVersion);
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

      if (provider === 'gitlab' || target.startsWith('gitlab:') || target.includes('gitlab.com/')) {
        const parsedGitlab = this.parseGitlabTarget(target, config);
        if (parsedGitlab) {
          const encodedPath = encodeURIComponent(parsedGitlab.projectPath);
          const gitlabHeaders: Record<string, string> = { 'User-Agent': 'PulseDock' };
          const gitlabToken = String(config.gitlabToken ?? process.env.GITLAB_TOKEN ?? '').trim();
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
            const level = this.classifyVersionStatus(currentVersion, latestVersion);
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

      const repo = this.parseGithubRepo(target);
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

      const latestData = await this.fetchGithubLatestVersion(repo.owner, repo.repo, githubHeaders, includePrerelease);
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
        const level = this.classifyVersionStatus(currentVersion, latestData.latestVersion);
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

  private async runDockerCheck(target: string, config: Record<string, unknown>) {
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
      const latestFromSemver = this.selectBestSemverTag(tagNames, includePrerelease);
      const latest = latestFromSemver ?? tags.find((t) => includePrerelease || !this.isClearlyUnstableTag(t.name))?.name ?? tags[0]?.name ?? null;

      if (!latest) {
        return { ok: false, statusCode: 404, latencyMs: null, message: 'No tags found', level: 'red' as const };
      }

      if (currentTag) {
        const level = this.classifyVersionStatus(currentTag, latest);
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

  private async runPluginMonitor(monitor: Monitor) {
    const pluginId = String(monitor.config.pluginId ?? '').trim();
    if (!pluginId) return null;

    const plugin = this.pluginRegistry.get(pluginId, monitor.type);
    if (!plugin) {
      return {
        ok: false,
        statusCode: 400,
        latencyMs: null,
        message: `Unknown or incompatible plugin: ${pluginId}`,
        level: 'red' as const,
      };
    }

    return executePluginSafely(
      plugin,
      {
        monitor: {
          id: monitor.id,
          name: monitor.name,
          type: monitor.type,
          target: monitor.target,
          timeoutMs: monitor.timeoutMs,
        },
        config: monitor.config,
        nowIso: new Date().toISOString(),
      },
      monitor.timeoutMs,
    );
  }

  async runMonitor(monitor: Monitor): Promise<MonitorRun> {
    const prev = await this.prisma.monitorRun.findFirst({
      where: { monitorId: monitor.id },
      orderBy: { checkedAt: 'desc' },
    });

    const pluginResult = await this.runPluginMonitor(monitor);
    const result = pluginResult ?? (
      monitor.type === 'HTTP'
        ? await this.runHttpCheck(monitor.target, monitor.timeoutMs)
        : monitor.type === 'GIT_RELEASE'
        ? await this.runGitReleaseCheck(monitor.target, monitor.config)
        : await this.runDockerCheck(monitor.target, monitor.config)
    );

    const created = await this.prisma.monitorRun.create({
      data: {
        userId: monitor.userId,
        monitorId: monitor.id,
        ok: result.ok,
        status: result.statusCode,
        latencyMs: result.latencyMs,
        message: result.message,
        level: result.level,
      },
    });

    const run: MonitorRun = {
      id: created.id,
      userId: created.userId,
      monitorId: created.monitorId,
      checkedAt: created.checkedAt.toISOString(),
      ok: created.ok,
      statusCode: created.status,
      latencyMs: created.latencyMs,
      message: created.message,
      level: created.level as 'green' | 'yellow' | 'red',
    };

    const levelChanged = !prev || prev.level !== run.level;
    if ((run.level === 'red' || run.level === 'yellow') && levelChanged) {
      await this.alerts.notifyMonitorFailure(monitor, run);
    }

    this.realtime.monitorChecked(monitor.userId, {
      monitor: {
        id: monitor.id,
        name: monitor.name,
        type: monitor.type,
        target: monitor.target,
        enabled: monitor.enabled,
      },
      run,
      changed: {
        previousLevel: prev?.level ?? null,
        levelChanged,
      },
    });

    return run;
  }
}
