import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as net from 'node:net';
import * as tls from 'node:tls';
import * as dns from 'node:dns/promises';
import { execFile } from 'node:child_process';

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/i;
import type { Monitor, MonitorRun } from '../types';
import { PrismaService } from '../common/prisma.service';
import { AlertsService } from '../alerts/alerts.service';
import { MailerService } from '../common/mailer.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { PluginRegistry } from './plugin.registry';
import type { PluginExecutionResult } from './plugin.contracts';
import { executePluginSafely } from './plugin.sandbox';
import { httpResponseMatchPlugin } from './plugins/http-response-match.plugin';

@Injectable()
export class ChecksService {
  private readonly realtime: Pick<RealtimeEvents, 'monitorChecked' | 'statusPageUpdated'>;
  private readonly pluginRegistry = new PluginRegistry();

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
    @Optional() private readonly mailer?: MailerService,
    @Optional() realtime?: RealtimeEvents,
  ) {
    this.realtime = realtime ?? { monitorChecked: () => undefined, statusPageUpdated: () => undefined };
    this.pluginRegistry.register(httpResponseMatchPlugin);
  }

  /**
   * Returns all registered check plugins available for monitor configuration.
   * @returns Array of plugin descriptors (id, name, supportedTypes, configSchema)
   */
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

  private async runHttpCheck(
    url: string,
    timeoutMs = 5000,
    config: Record<string, unknown> = {},
  ) {
    const started = Date.now();

    // Config options:
    //   expectedStatus: number | number[]  — expected HTTP status code(s) (default: any 2xx)
    //   bodyContains: string               — response body must contain this string (case-insensitive)
    //   httpMethod: string                 — HTTP method to use (default: GET)
    //   requestHeaders: Record<string,string> — custom request headers to send
    //   requestBody: string                — request body for POST/PUT/PATCH
    //   responseTimeThresholdMs: number    — if response latency exceeds this, return yellow (degraded)
    const expectedStatus = config['expectedStatus'] as number | number[] | undefined;
    const bodyContains = typeof config['bodyContains'] === 'string' ? config['bodyContains'] : undefined;
    const responseTimeThresholdMs =
      typeof config['responseTimeThresholdMs'] === 'number' && config['responseTimeThresholdMs'] > 0
        ? config['responseTimeThresholdMs']
        : undefined;
    const needsBody = !!bodyContains;
    const httpMethod = (typeof config['httpMethod'] === 'string' ? config['httpMethod'].toUpperCase() : 'GET');
    const safeMethod = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(httpMethod) ? httpMethod : 'GET';
    const requestHeaders: Record<string, string> = {};
    if (config['requestHeaders'] && typeof config['requestHeaders'] === 'object' && !Array.isArray(config['requestHeaders'])) {
      for (const [k, v] of Object.entries(config['requestHeaders'] as Record<string, unknown>)) {
        if (typeof k === 'string' && typeof v === 'string' && k.trim()) {
          requestHeaders[k.trim()] = v;
        }
      }
    }
    const requestBody = typeof config['requestBody'] === 'string' ? config['requestBody'] : undefined;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const fetchOptions: RequestInit = {
        method: safeMethod,
        signal: controller.signal,
        headers: requestHeaders,
      };
      if (requestBody && ['POST', 'PUT', 'PATCH'].includes(safeMethod)) {
        fetchOptions.body = requestBody;
      }
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeout);
      const latencyMs = Date.now() - started;

      // Determine if status is acceptable
      let statusOk: boolean;
      if (expectedStatus !== undefined) {
        const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
        statusOk = allowed.includes(response.status);
      } else {
        statusOk = response.ok; // default: 2xx
      }

      if (!statusOk) {
        // Drain body to avoid connection leak
        await response.text().catch(() => undefined);
        const expected = expectedStatus ? ` (expected ${Array.isArray(expectedStatus) ? expectedStatus.join('/') : expectedStatus})` : '';
        return {
          ok: false,
          statusCode: response.status,
          latencyMs,
          message: `HTTP ${response.status}${expected}`,
          level: 'red' as const,
        };
      }

      // Check body keyword if requested
      if (needsBody) {
        const body = await response.text().catch(() => '');
        const found = body.toLowerCase().includes(bodyContains!.toLowerCase());
        if (!found) {
          return {
            ok: false,
            statusCode: response.status,
            latencyMs,
            message: `HTTP ${response.status} — body does not contain "${bodyContains}"`,
            level: 'red' as const,
          };
        }
        // Check response time threshold even when body keyword matches
        if (responseTimeThresholdMs !== undefined && latencyMs > responseTimeThresholdMs) {
          return {
            ok: false,
            statusCode: response.status,
            latencyMs,
            message: `Degraded — ${latencyMs}ms exceeds threshold (${responseTimeThresholdMs}ms), body contains "${bodyContains}"`,
            level: 'yellow' as const,
          };
        }
        return {
          ok: true,
          statusCode: response.status,
          latencyMs,
          message: `OK — body contains "${bodyContains}"`,
          level: 'green' as const,
        };
      }

      // Drain body
      await response.text().catch(() => undefined);

      // Check response time threshold
      if (responseTimeThresholdMs !== undefined && latencyMs > responseTimeThresholdMs) {
        return {
          ok: false,
          statusCode: response.status,
          latencyMs,
          message: `Degraded — ${latencyMs}ms exceeds threshold (${responseTimeThresholdMs}ms)`,
          level: 'yellow' as const,
        };
      }

      return {
        ok: true,
        statusCode: response.status,
        latencyMs,
        message: 'OK',
        level: 'green' as const,
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
      // Case-insensitive key lookup — APIs use Version, version, VERSION, etc.
      const lowerObj = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
      for (const key of ['version', 'appversion', 'app_version', 'release', 'tag', 'buildversion']) {
        const val = lowerObj.get(key);
        if (typeof val === 'string') return val;
      }
      for (const key of ['data', 'build', 'info', 'meta']) {
        const val = lowerObj.get(key);
        const v = this.extractVersion(val);
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

    // endpointFallbacks: ordered list from registry entry's versionSource.endpointFallbacks
    // Stored in configJson when monitor is created from a registry tool.
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
          const level = this.classifyVersionStatus(currentVersion, latestVersion);
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
          const level = this.classifyVersionStatus(currentVersion, latestVersion);
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
          const level = this.classifyVersionStatus(currentVersion, latestVersion);
          return { ok: level === 'green', statusCode: 200, latencyMs: null, message: `Cargo current ${currentVersion}, latest ${latestVersion}`, level } as const;
        }
        return { ok: true, statusCode: 200, latencyMs: null, message: `Cargo latest ${latestVersion}`, level: 'green' as const };
      }

      // ── Maven Central ────────────────────────────────────────────────────────
      // target format: "groupId:artifactId" e.g. "org.springframework:spring-core"
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
          const level = this.classifyVersionStatus(currentVersion, latestVersion);
          return { ok: level === 'green', statusCode: 200, latencyMs: null, message: `Maven current ${currentVersion}, latest ${latestVersion}`, level } as const;
        }
        return { ok: true, statusCode: 200, latencyMs: null, message: `Maven latest ${latestVersion}`, level: 'green' as const };
      }

      // ── Helm (Artifact Hub) ──────────────────────────────────────────────────
      // target format: "repoName/chartName" e.g. "bitnami/redis" or "grafana/grafana"
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
        // Prefer app_version (the underlying app), fall back to chart version
        const latestVersion = helmPayload.app_version ?? helmPayload.version ?? null;
        if (!latestVersion) return { ok: false, statusCode: 404, latencyMs: null, message: 'No Helm chart version found', level: 'red' as const };
        if (currentVersion) {
          const level = this.classifyVersionStatus(currentVersion, latestVersion);
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

  private async runTcpCheck(target: string, timeoutMs = 5000): Promise<PluginExecutionResult> {
    const started = Date.now();
    const normalized = target.trim();
    const [host, portRaw] = normalized.split(':');
    const port = Number(portRaw);

    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
      return {
        ok: false,
        statusCode: 400,
        latencyMs: null,
        message: 'Invalid TCP target. Use host:port (e.g. db.example.com:5432)',
        level: 'red' as const,
      };
    }

    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      let settled = false;

      const finalize = (payload: { ok: boolean; message: string; level: 'green' | 'yellow' | 'red'; statusCode?: number; latencyMs?: number | null }) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve({
          ok: payload.ok,
          statusCode: payload.statusCode ?? (payload.ok ? 200 : 0),
          latencyMs: payload.latencyMs ?? (payload.ok ? Date.now() - started : null),
          message: payload.message,
          level: payload.level,
        });
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finalize({ ok: true, message: `TCP connect ok (${host}:${port})`, level: 'green' }));
      socket.once('timeout', () => finalize({ ok: false, message: `TCP timeout (${host}:${port})`, level: 'red' }));
      socket.once('error', (err) => finalize({ ok: false, message: `TCP error: ${err.message}`, level: 'red' }));
    });
  }

  private normalizeSslHost(target: string) {
    const raw = target.trim();
    if (!raw) return null;

    try {
      const withProto = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
      const parsed = new URL(withProto);
      return parsed.hostname || null;
    } catch {
      return null;
    }
  }

  private async runSslCheck(target: string, timeoutMs = 5000): Promise<PluginExecutionResult> {
    const host = this.normalizeSslHost(target);
    if (!host) {
      return {
        ok: false,
        statusCode: 400,
        latencyMs: null,
        message: 'Invalid SSL target. Use domain or HTTPS URL',
        level: 'red' as const,
      };
    }

    const started = Date.now();

    return new Promise((resolve) => {
      const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: timeoutMs }, () => {
        const cert = socket.getPeerCertificate();
        socket.end();

        const validTo = typeof cert?.valid_to === 'string' ? cert.valid_to : '';
        const expiresAt = validTo ? new Date(validTo) : null;
        if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
          resolve({
            ok: false,
            statusCode: 0,
            latencyMs: null,
            message: 'SSL certificate metadata unavailable',
            level: 'red' as const,
          });
          return;
        }

        const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        const isoDate = expiresAt.toISOString().slice(0, 10);

        if (daysLeft < 0) {
          resolve({
            ok: false,
            statusCode: 0,
            latencyMs: Date.now() - started,
            message: `SSL cert EXPIRED (${isoDate})`,
            level: 'red' as const,
          });
          return;
        }

        const level = daysLeft > 30 ? 'green' : daysLeft >= 10 ? 'yellow' : 'red';
        resolve({
          ok: daysLeft > 0,
          statusCode: 200,
          latencyMs: Date.now() - started,
          message: `SSL cert expires in ${daysLeft} days (${isoDate})`,
          level,
        });
      });

      socket.once('timeout', () => {
        socket.destroy();
        resolve({
          ok: false,
          statusCode: 0,
          latencyMs: null,
          message: `SSL check timeout (${host})`,
          level: 'red' as const,
        });
      });

      socket.once('error', (err) => {
        socket.destroy();
        resolve({
          ok: false,
          statusCode: 0,
          latencyMs: null,
          message: `SSL check failed: ${err.message}`,
          level: 'red' as const,
        });
      });
    });
  }

  private async runHeartbeatCheck(monitor: Monitor): Promise<PluginExecutionResult> {
    const timeoutMinRaw = Number(monitor.config.timeoutMin ?? 5);
    const timeoutMin = Number.isFinite(timeoutMinRaw) && timeoutMinRaw > 0 ? timeoutMinRaw : 5;
    const lastHeartbeat = typeof monitor.config.lastHeartbeatAt === 'string' ? monitor.config.lastHeartbeatAt : null;

    if (!lastHeartbeat) {
      return {
        ok: false,
        statusCode: 0,
        latencyMs: null,
        message: 'No heartbeat received yet',
        level: 'red' as const,
      };
    }

    const lastMs = new Date(lastHeartbeat).getTime();
    if (Number.isNaN(lastMs)) {
      return {
        ok: false,
        statusCode: 0,
        latencyMs: null,
        message: 'Heartbeat timestamp is invalid',
        level: 'red' as const,
      };
    }

    const elapsedMs = Date.now() - lastMs;
    const maxAgeMs = timeoutMin * 60 * 1000;
    if (elapsedMs <= maxAgeMs) {
      return {
        ok: true,
        statusCode: 200,
        latencyMs: null,
        message: `Heartbeat healthy (${Math.floor(elapsedMs / 1000)}s ago)`,
        level: 'green' as const,
      };
    }

    const overdueSec = Math.floor((elapsedMs - maxAgeMs) / 1000);
    return {
      ok: false,
      statusCode: 0,
      latencyMs: null,
      message: `Heartbeat overdue by ${overdueSec}s`,
      level: 'red' as const,
    };
  }

  /**
   * Resolves a hostname via DNS and measures lookup latency.
   * Config options:
   *   - `recordType`: 'A' | 'AAAA' | 'MX' | 'TXT' | 'CNAME' | 'NS' (default 'A')
   *   - `expectedValue`: Optional — if set, the first resolved value must contain this string.
   *
   * @param target  - Hostname to resolve (e.g. "example.com")
   * @param config  - Monitor configJson
   * @param timeoutMs - Lookup timeout in milliseconds
   */
  private async runDnsCheck(target: string, config: Record<string, unknown>, timeoutMs = 5000): Promise<PluginExecutionResult> {
    const hostname = target.trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
    if (!hostname) {
      return { ok: false, statusCode: 400, latencyMs: null, message: 'Invalid DNS target — provide a hostname', level: 'red' as const };
    }

    const recordType = (typeof config.recordType === 'string' ? config.recordType.toUpperCase() : 'A') as 'A' | 'AAAA' | 'MX' | 'TXT' | 'CNAME' | 'NS';
    const expectedValue = typeof config.expectedValue === 'string' && config.expectedValue.trim() ? config.expectedValue.trim() : null;

    const started = Date.now();

    try {
      // Race the DNS lookup against a timeout
      let resolved: string[] = [];
      await Promise.race([
        (async () => {
          switch (recordType) {
            case 'A':    resolved = await dns.resolve4(hostname); break;
            case 'AAAA': resolved = await dns.resolve6(hostname); break;
            case 'CNAME': resolved = [await dns.resolveCname(hostname).then(r => r[0] ?? '')]; break;
            case 'NS':   resolved = await dns.resolveNs(hostname); break;
            case 'TXT':  resolved = (await dns.resolveTxt(hostname)).map(a => a.join('')); break;
            case 'MX':   resolved = (await dns.resolveMx(hostname)).map(r => `${r.exchange} (${r.priority})`); break;
            default:     resolved = await dns.resolve4(hostname);
          }
        })(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DNS lookup timed out')), timeoutMs)),
      ]);

      const latencyMs = Date.now() - started;
      const first = resolved[0] ?? '';

      if (expectedValue && !resolved.some(r => r.includes(expectedValue))) {
        return {
          ok: false,
          statusCode: 0,
          latencyMs,
          message: `DNS resolved but expected value "${expectedValue}" not found in ${recordType} records: ${resolved.slice(0, 3).join(', ')}`,
          level: 'yellow' as const,
        };
      }

      return {
        ok: true,
        statusCode: 200,
        latencyMs,
        message: `${recordType} resolved: ${resolved.length > 1 ? `${first} (+${resolved.length - 1} more)` : first}`,
        level: latencyMs > 2000 ? 'yellow' : 'green' as const,
      };
    } catch (error) {
      const latencyMs = Date.now() - started;
      return {
        ok: false,
        statusCode: 0,
        latencyMs,
        message: error instanceof Error ? `DNS ${recordType} failed: ${error.message}` : `DNS ${recordType} check failed`,
        level: 'red' as const,
      };
    }
  }

  /**
   * Sends ICMP pings to a host and reports round-trip latency.
   * Uses the system `ping` command (available on Linux/macOS via exec).
   * Config options:
   *   - `pingCount`: number of pings to send (default 3, max 10)
   *   - `warnLatencyMs`: warn threshold in ms (default 200)
   *   - `critLatencyMs`: crit threshold in ms (default 1000)
   *
   * @param target   - Hostname or IP to ping
   * @param config   - Monitor configJson
   * @param timeoutMs - Total timeout in milliseconds
   */
  private async runPingCheck(target: string, config: Record<string, unknown>, timeoutMs = 10000): Promise<PluginExecutionResult> {
    const host = target.trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
    if (!host) {
      return { ok: false, statusCode: 400, latencyMs: null, message: 'Invalid PING target — provide a hostname or IP', level: 'red' as const };
    }

    const count = Math.min(Math.max(Number(config.pingCount ?? 3), 1), 10);
    const warnMs = Number(config.warnLatencyMs ?? 200);
    const critMs = Number(config.critLatencyMs ?? 1000);

    const started = Date.now();

    return new Promise((resolve) => {
      const args = ['-c', String(count), '-W', '2', host]; // -W 2: per-ping timeout 2s
      const child = execFile('ping', args, { timeout: timeoutMs }, (err, stdout) => {
        const elapsed = Date.now() - started;

        if (err) {
          resolve({
            ok: false,
            statusCode: 0,
            latencyMs: elapsed,
            message: err.code === 'ETIMEDOUT' ? `Ping timed out (${host})` : `Ping failed: ${host} unreachable`,
            level: 'red' as const,
          });
          return;
        }

        // Parse avg RTT from ping output: rtt min/avg/max/mdev = X/Y/Z/W ms
        const rttMatch = stdout.match(/rtt[^=]*=\s*[\d.]+\/([\d.]+)\/[\d.]+\/[\d.]+ ms/);
        const avgMs = rttMatch ? Math.round(parseFloat(rttMatch[1])) : elapsed;

        // Parse packet loss
        const lossMatch = stdout.match(/(\d+)%\s+packet loss/);
        const loss = lossMatch ? parseInt(lossMatch[1], 10) : 0;

        if (loss === 100) {
          resolve({ ok: false, statusCode: 0, latencyMs: avgMs, message: `100% packet loss to ${host}`, level: 'red' as const });
          return;
        }

        const level = avgMs >= critMs ? 'red' : avgMs >= warnMs ? 'yellow' : 'green';
        const lossStr = loss > 0 ? ` (${loss}% loss)` : '';

        resolve({
          ok: level !== 'red',
          statusCode: 200,
          latencyMs: avgMs,
          message: `Ping ${host}: avg ${avgMs}ms${lossStr}`,
          level: level as 'green' | 'yellow' | 'red',
        });
      });

      // Ensure the process is killed if timeout fires before child exits
      setTimeout(() => { try { child.kill(); } catch { /* ignore */ } }, timeoutMs + 500);
    });
  }

  private async dispatchCheck(monitor: Monitor) {
    switch (monitor.type) {
      case 'HTTP':
        return this.runHttpCheck(monitor.target, monitor.timeoutMs, monitor.config);
      case 'GIT_RELEASE':
        return this.runGitReleaseCheck(monitor.target, monitor.config);
      case 'DOCKER_IMAGE':
        return this.runDockerCheck(monitor.target, monitor.config);
      case 'TCP':
        return this.runTcpCheck(monitor.target, monitor.timeoutMs);
      case 'SSL_CERT':
        return this.runSslCheck(monitor.target, monitor.timeoutMs);
      case 'HEARTBEAT':
        return this.runHeartbeatCheck(monitor);
      case 'DNS':
        return this.runDnsCheck(monitor.target, monitor.config, monitor.timeoutMs);
      case 'PING':
        return this.runPingCheck(monitor.target, monitor.config, monitor.timeoutMs);
      default:
        return this.runHttpCheck(monitor.target, monitor.timeoutMs);
    }
  }

  /**
   * Handles an incoming heartbeat ping by updating the lastHeartbeatAt timestamp on the monitor.
   * Called by the public heartbeat endpoint (no auth required — uses token for lookup).
   * @param token - The unique heartbeat token from the monitor's config
   * @throws NotFoundException if no HEARTBEAT monitor matches the token
   */
  async handleHeartbeatPing(token: string): Promise<void> {
    const monitor = await this.prisma.monitor.findFirst({
      where: {
        type: 'HEARTBEAT',
        configJson: { path: ['token'], equals: token },
      },
    });

    if (!monitor) {
      throw new NotFoundException('Heartbeat monitor not found');
    }

    const existingConfig = (monitor.configJson as Record<string, unknown> | null) ?? {};
    await this.prisma.monitor.update({
      where: { id: monitor.id },
      data: {
        configJson: {
          ...existingConfig,
          lastHeartbeatAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
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

  /**
   * Executes a monitor check and persists the result to the database.
   * Dispatches to the appropriate check implementation based on monitor type
   * (HTTP, GIT_RELEASE, DOCKER_IMAGE, TCP, SSL_CERT, HEARTBEAT).
   * Handles the confirmation threshold: only triggers alerts after N consecutive failures.
   * Emits real-time monitorChecked and statusPageUpdated events on level changes.
   * Calls AlertsService.notifyMonitorFailure for failures and recoveries.
   * @param monitor - The monitor to execute (includes type, target, config, confirmations)
   * @returns The persisted MonitorRun record with level, latency, and message
   */
  async runMonitor(monitor: Monitor): Promise<MonitorRun> {
    // Confirmations: fetch last N runs to check for consecutive failures.
    // Test mocks may only implement findFirst(), so gracefully fall back.
    const confirmations = Math.max(1, Math.min(10, monitor.confirmations ?? 1));
    const monitorRunModel = this.prisma.monitorRun as unknown as {
      findMany?: (args: {
        where: { monitorId: string };
        orderBy: { checkedAt: 'desc' };
        take: number;
      }) => Promise<Array<{ level: string }>>;
    };

    let recentRuns: Array<{ level: string }> = [];
    if (typeof monitorRunModel.findMany === 'function') {
      recentRuns = await monitorRunModel.findMany({
        where: { monitorId: monitor.id },
        orderBy: { checkedAt: 'desc' },
        take: confirmations,
      });
    } else {
      const prevRun = await this.prisma.monitorRun.findFirst({
        where: { monitorId: monitor.id },
        orderBy: { checkedAt: 'desc' },
      });
      recentRuns = prevRun ? [{ level: prevRun.level }] : [];
    }

    const prev = recentRuns[0] ?? null;

    const pluginResult = await this.runPluginMonitor(monitor);
    const result = pluginResult ?? await this.dispatchCheck(monitor);

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
      monitorType: monitor.type,
      checkedAt: created.checkedAt.toISOString(),
      ok: created.ok,
      statusCode: created.status,
      latencyMs: created.latencyMs,
      message: created.message,
      level: created.level as 'green' | 'yellow' | 'red',
    };

    const levelChanged = !prev || prev.level !== run.level;
    const wasUnhealthy = prev && (prev.level === 'red' || prev.level === 'yellow');
    const isRecovery = run.level === 'green' && wasUnhealthy && levelChanged;

    // Confirmations check: only alert on failure if we have `confirmations` consecutive failures.
    // For confirmations=1 (default), alert immediately (existing behaviour).
    // For confirmations=N, all of the last N-1 stored runs plus this new run must be unhealthy.
    const isCurrentUnhealthy = run.level === 'red' || run.level === 'yellow';
    let previousUnhealthyStreak = 0;
    for (const r of recentRuns) {
      if (r.level === 'red' || r.level === 'yellow') {
        previousUnhealthyStreak += 1;
      } else {
        break;
      }
    }
    const consecutiveFailures = isCurrentUnhealthy ? 1 + previousUnhealthyStreak : 0;
    const crossedFailureThreshold = previousUnhealthyStreak < confirmations && consecutiveFailures >= confirmations;
    const shouldAlertFailure = isCurrentUnhealthy && crossedFailureThreshold;

    const alertContext = {
      levelChanged,
      previousLevel: prev?.level ?? null,
      failureStreak: consecutiveFailures,
    };

    // Call notifyMonitorFailure for every unhealthy run (after confirmation threshold)
    // AND for recoveries. The alerts service's notifyOn filter decides per-channel
    // whether to actually dispatch (ON_CHANGE, ALWAYS, FIRST_ONLY, DAILY_DIGEST, etc.)
    if (shouldAlertFailure || (isCurrentUnhealthy && consecutiveFailures >= confirmations)) {
      await this.alerts.notifyMonitorFailure(monitor, run, alertContext);
    } else if (isRecovery) {
      await this.alerts.notifyMonitorFailure(monitor, run, alertContext);
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

    // Notify public status pages that include this monitor
    if (levelChanged) {
      try {
        const pages = await this.prisma.publicStatusPage.findMany({
          where: { userId: monitor.userId, isPublished: true },
          select: { slug: true, layout: true, notifyWebhookUrl: true, slackWebhookUrl: true, discordWebhookUrl: true, lastNotifiedStatus: true, id: true, title: true },
        });
        const monitorId = monitor.id;
        for (const page of pages) {
          const layoutStr = JSON.stringify(page.layout);
          if (layoutStr.includes(monitorId)) {
            this.realtime.statusPageUpdated(page.slug, {
              monitorId,
              level: result.level,
              latencyMs: result.latencyMs,
              checkedAt: new Date().toISOString(),
            });

            // Fire webhook + subscriber emails when status may have changed
            void this.fireStatusPageWebhook(page, monitor.userId);
          }
        }
      } catch {
        // Non-critical — don't block the check result
      }
    }

    return run;
  }

  /**
   * Computes the current overall status of a published status page and fires its
   * notification webhook if the status has changed since the last notification.
   * @param page - Status page record (must include id, slug, notifyWebhookUrl, lastNotifiedStatus)
   * @param userId - Owner user ID for querying monitors
   */
  private async fireStatusPageWebhook(
    page: { id: string; slug: string; title: string; notifyWebhookUrl: string | null; slackWebhookUrl?: string | null; discordWebhookUrl?: string | null; lastNotifiedStatus: string | null; layout: unknown },
    userId: string,
  ): Promise<void> {
    try {
      // Extract unique monitor IDs referenced in the layout
      const layoutStr = JSON.stringify(page.layout);
      const monitorIdRegex = /"monitorId"\s*:\s*"([^"]+)"/g;
      const monitorIds = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = monitorIdRegex.exec(layoutStr)) !== null) monitorIds.add(m[1]);

      // Fetch latest run for each referenced monitor
      const monitors = await this.prisma.monitor.findMany({
        where: { id: { in: [...monitorIds] }, userId, enabled: true },
        select: {
          id: true,
          name: true,
          runs: { orderBy: { checkedAt: 'desc' }, take: 1, select: { level: true, ok: true } },
        },
      });

      const hasDown = monitors.some(mon => mon.runs[0]?.level === 'red');
      const hasDegraded = monitors.some(mon => mon.runs[0]?.level === 'yellow');
      const overallStatus: string = hasDown ? 'outage' : hasDegraded ? 'degraded' : 'operational';

      // Only fire if status actually changed
      if (overallStatus === page.lastNotifiedStatus) return;

      // Skip persisting / notifying if there is nothing to notify
      // (no webhook URL and no mailer — avoids spurious DB writes in tests/lite deployments)
      const hasWebhook = Boolean(page.notifyWebhookUrl);
      const hasSlack = Boolean(page.slackWebhookUrl);
      const hasDiscord = Boolean(page.discordWebhookUrl);
      const hasMailer = Boolean(this.mailer);
      if (!hasWebhook && !hasSlack && !hasDiscord && !hasMailer) return;

      // Persist new status so we don't re-fire on the next check
      await this.prisma.publicStatusPage.update({
        where: { id: page.id },
        data: { lastNotifiedStatus: overallStatus },
      });

      const payload = {
        event: 'status_page.status_changed',
        slug: page.slug,
        status: overallStatus,
        previousStatus: page.lastNotifiedStatus,
        timestamp: new Date().toISOString(),
        affectedMonitors: monitors
          .filter(mon => mon.runs[0]?.ok === false)
          .map(mon => ({ id: mon.id, name: mon.name })),
      };

      // Fire webhook if configured
      if (page.notifyWebhookUrl) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10_000);
        try {
          await fetch(page.notifyWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'PulseDock-StatusPage/1.0' },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(timer);
        }
      }

      // Fire Slack + Discord webhooks if configured
      const appBase = process.env.APP_BASE_URL ?? process.env.APP_URL ?? 'http://localhost:1234';
      const pageUrl = `${appBase}/status/${page.slug}`;
      const previousStatus = page.lastNotifiedStatus ?? 'unknown';

      if (page.slackWebhookUrl) {
        const slackColor = overallStatus === 'operational' ? 'good' : overallStatus === 'degraded' ? 'warning' : 'danger';
        const slackPayload = {
          text: `*${page.title}* status changed: ${previousStatus} → ${overallStatus}`,
          attachments: [{
            color: slackColor,
            title: page.title,
            title_link: pageUrl,
            text: `System is now *${overallStatus}*`,
            footer: 'PulseDock',
            ts: Math.floor(Date.now() / 1000),
          }],
        };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10_000);
        try {
          await fetch(page.slackWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'PulseDock-StatusPage/1.0' },
            body: JSON.stringify(slackPayload),
            signal: ctrl.signal,
          });
        } catch (err) {
          console.error('[PulseDock] Slack webhook delivery failed:', err instanceof Error ? err.message : String(err));
        } finally {
          clearTimeout(timer);
        }
      }

      if (page.discordWebhookUrl) {
        const discordColor = overallStatus === 'operational' ? 0x22c55e : overallStatus === 'degraded' ? 0xf59e0b : 0xef4444;
        const discordPayload = {
          embeds: [{
            title: `${page.title} — ${overallStatus.toUpperCase()}`,
            description: `Status changed: ${previousStatus} → ${overallStatus}`,
            color: discordColor,
            url: pageUrl,
            timestamp: new Date().toISOString(),
            footer: { text: 'PulseDock' },
          }],
        };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10_000);
        try {
          await fetch(page.discordWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'PulseDock-StatusPage/1.0' },
            body: JSON.stringify(discordPayload),
            signal: ctrl.signal,
          });
        } catch (err) {
          console.error('[PulseDock] Discord webhook delivery failed:', err instanceof Error ? err.message : String(err));
        } finally {
          clearTimeout(timer);
        }
      }

      // Email subscribers when status degrades (not on recovery — avoid spam)
      if (overallStatus !== 'operational' && this.mailer) {
        try {
          const subscribers = await this.prisma.statusPageSubscriber.findMany({
            where: { statusPageId: page.id },
            select: { email: true },
          });

          if (subscribers.length > 0) {
            const appBase = process.env.APP_BASE_URL ?? process.env.APP_URL ?? 'http://localhost:1234';
            const pageUrl = `${appBase}/status/${page.slug}`;
            const statusLabel = overallStatus === 'outage' ? 'Outage Detected' : 'Performance Degradation';
            const statusColor = overallStatus === 'outage' ? '#ef4444' : '#f59e0b';
            const headline = `${statusLabel} — ${page.title ?? page.slug}`;
            const affectedNames = payload.affectedMonitors.map(m => m.name).join(', ');
            const body = affectedNames
              ? `The following services are currently affected: ${affectedNames}.\n\nWe are investigating and will provide updates as soon as possible.`
              : `We are investigating the issue and will provide updates shortly.`;

            // Fire-and-forget: send all subscriber emails concurrently
            await Promise.allSettled(
              subscribers.map((sub) =>
                this.mailer!.sendStatusPageUpdateEmail(sub.email, {
                  pageTitle: page.title ?? page.slug,
                  pageSlug: page.slug,
                  pageUrl,
                  subject: `[${page.title ?? page.slug}] ${statusLabel}`,
                  headline,
                  body,
                  statusColor,
                })
              )
            );
          }
        } catch {
          // Subscriber email failure is non-critical
        }
      }
    } catch {
      // Webhook/notification delivery failure is non-critical
    }
  }
}
