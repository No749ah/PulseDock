import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { MonitorType } from '../types';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';

@Injectable()
export class MonitorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checksService: ChecksService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeEvents,
  ) {}

  private sanitizeConfig(config: Record<string, unknown> | null | undefined) {
    const c = { ...(config ?? {}) } as Record<string, unknown>;

    const hasRepoToken = typeof c.token === 'string' && String(c.token).trim().length > 0;
    const hasAppToken = typeof c.appToken === 'string' && String(c.appToken).trim().length > 0;
    const hasOpenvpnPassword = typeof c.openvpnPassword === 'string' && String(c.openvpnPassword).trim().length > 0;

    if ('token' in c) delete c.token;
    if ('appToken' in c) delete c.appToken;
    if ('openvpnPassword' in c) delete c.openvpnPassword;

    c.hasRepoToken = hasRepoToken;
    c.hasAppToken = hasAppToken;
    c.hasOpenvpnPassword = hasOpenvpnPassword;

    return c;
  }

  listPlugins() {
    return this.checksService.listPlugins();
  }

  async list(userId: string) {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { monitorAlerts: true },
    });

    return monitors.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.name,
      type: m.type,
      target: m.target,
      intervalSec: m.intervalSec,
      timeoutMs: m.timeoutMs,
      config: this.sanitizeConfig((m.configJson as Record<string, unknown> | null) ?? {}),
      alertChannelIds: m.monitorAlerts.map((ma) => ma.alertChannelId),
      folderId: m.folderId,
      enabled: m.enabled,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async create(userId: string, body: {
    name: string;
    target: string;
    type: MonitorType;
    intervalSec?: number;
    timeoutMs?: number;
    config?: Record<string, unknown>;
    alertChannelIds?: string[];
    folderId?: string | null;
  }) {
    const created = await this.prisma.monitor.create({
      data: {
        userId,
        name: body.name,
        target: body.target,
        type: body.type,
        intervalSec: body.intervalSec ?? 60,
        timeoutMs: body.timeoutMs ?? 5000,
        configJson: (body.config ?? {}) as Prisma.InputJsonValue,
        folderId: body.folderId ?? null,
        monitorAlerts: {
          create: (body.alertChannelIds ?? []).map((alertChannelId) => ({ alertChannelId })),
        },
      },
    });

    await this.audit.log('monitor.create', userId, userId, { monitorId: created.id, type: created.type, target: created.target });

    const response = {
      id: created.id,
      userId: created.userId,
      name: created.name,
      type: created.type,
      target: created.target,
      intervalSec: created.intervalSec,
      timeoutMs: created.timeoutMs,
      config: this.sanitizeConfig((created.configJson as Record<string, unknown> | null) ?? {}),
      alertChannelIds: body.alertChannelIds ?? [],
      folderId: created.folderId,
      enabled: created.enabled,
      createdAt: created.createdAt.toISOString(),
    };

    this.realtime.monitorCreated(userId, response);
    return response;
  }

  async update(userId: string, monitorId: string, body: {
    name?: string;
    target?: string;
    type?: MonitorType;
    intervalSec?: number;
    timeoutMs?: number;
    config?: Record<string, unknown>;
    alertChannelIds?: string[];
    folderId?: string | null;
    enabled?: boolean;
  }) {
    const current = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!current) throw new NotFoundException('monitor not found');

    const currentConfig = (current.configJson as Record<string, unknown> | null) ?? {};
    const mergedConfig = body.config ? { ...currentConfig, ...body.config } : currentConfig;

    await this.prisma.monitor.update({
      where: { id: monitorId },
      data: {
        name: body.name ?? current.name,
        target: body.target ?? current.target,
        type: body.type ?? current.type,
        intervalSec: body.intervalSec ?? current.intervalSec,
        timeoutMs: body.timeoutMs ?? current.timeoutMs,
        configJson: mergedConfig as Prisma.InputJsonValue,
        folderId: body.folderId === undefined ? current.folderId : body.folderId,
        enabled: body.enabled ?? current.enabled,
      },
    });

    if (body.alertChannelIds) {
      await this.prisma.monitorAlert.deleteMany({ where: { monitorId } });
      if (body.alertChannelIds.length > 0) {
        await this.prisma.monitorAlert.createMany({
          data: body.alertChannelIds.map((alertChannelId) => ({ monitorId, alertChannelId })),
        });
      }
    }

    await this.audit.log('monitor.update', userId, userId, { monitorId });
    const updated = await this.list(userId).then((items) => items.find((m) => m.id === monitorId));
    if (updated) this.realtime.monitorUpdated(userId, updated);
    return updated;
  }

  async exportMonitors(userId: string) {
    const monitors = await this.list(userId);
    return {
      version: '1',
      exportedAt: new Date().toISOString(),
      monitors: monitors.map((m) => ({
        name: m.name,
        type: m.type,
        target: m.target,
        intervalSec: m.intervalSec,
        timeoutMs: m.timeoutMs,
        config: m.config,
        enabled: m.enabled,
      })),
    };
  }

  async importMonitors(userId: string, items: Array<{
    name: string;
    target: string;
    type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';
    intervalSec?: number;
    timeoutMs?: number;
    config?: Record<string, unknown>;
    enabled?: boolean;
  }>) {
    const created = [];
    const errors: Array<{ index: number; name: string; error: string }> = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      try {
        const monitor = await this.create(userId, {
          name: item.name,
          target: item.target,
          type: item.type,
          intervalSec: item.intervalSec,
          timeoutMs: item.timeoutMs,
          config: item.config,
        });
        if (item.enabled === false) {
          await this.update(userId, monitor.id, { enabled: false });
        }
        created.push(monitor);
      } catch (err) {
        errors.push({ index: i, name: item.name, error: err instanceof Error ? err.message : String(err) });
      }
    }

    await this.audit.log('monitor.import', userId, userId, { imported: created.length, errors: errors.length });
    return { imported: created.length, errors };
  }

  async remove(userId: string, monitorId: string) {
    const current = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!current) throw new NotFoundException('monitor not found');
    await this.prisma.monitor.delete({ where: { id: monitorId } });
    await this.audit.log('monitor.delete', userId, userId, { monitorId });
    this.realtime.monitorDeleted(userId, { id: monitorId });
    return { ok: true };
  }

  async listMonitorAlerts(userId: string, monitorId: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    const assignments = await this.prisma.monitorAlert.findMany({
      where: { monitorId },
      include: { alertChannel: true },
    });

    return assignments.map((a) => ({
      id: a.alertChannel.id,
      name: a.alertChannel.name,
      type: a.alertChannel.type,
      config: (a.alertChannel.configJson as Record<string, unknown>) ?? {},
      createdAt: a.alertChannel.createdAt.toISOString(),
    }));
  }

  async addMonitorAlert(userId: string, monitorId: string, channelId: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    const channel = await this.prisma.alertChannel.findFirst({ where: { id: channelId, userId } });
    if (!channel) throw new NotFoundException('alert channel not found');

    await this.prisma.monitorAlert.upsert({
      where: { monitorId_alertChannelId: { monitorId, alertChannelId: channelId } },
      create: { monitorId, alertChannelId: channelId },
      update: {},
    });

    await this.audit.log('monitor.alert.add', userId, userId, { monitorId, channelId });
    return { ok: true };
  }

  async removeMonitorAlert(userId: string, monitorId: string, channelId: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    await this.prisma.monitorAlert.deleteMany({
      where: { monitorId, alertChannelId: channelId },
    });

    await this.audit.log('monitor.alert.remove', userId, userId, { monitorId, channelId });
    return { ok: true };
  }

  async runNow(userId: string, monitorId: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');
    await this.audit.log('monitor.run_now', userId, userId, { monitorId });
    return this.checksService.runMonitor({
      id: monitor.id,
      userId: monitor.userId,
      name: monitor.name,
      type: monitor.type,
      target: monitor.target,
      intervalSec: monitor.intervalSec,
      timeoutMs: monitor.timeoutMs,
      config: (monitor.configJson as Record<string, unknown> | null) ?? {},
      alertChannelIds: [],
      folderId: monitor.folderId,
      enabled: monitor.enabled,
      createdAt: monitor.createdAt.toISOString(),
    });
  }

  async getRecentRuns(userId: string, limit = 10) {
    const runs = await this.prisma.monitorRun.findMany({
      where: { monitor: { userId } },
      orderBy: { checkedAt: 'desc' },
      take: limit,
    });
    return runs.map((r) => ({
      id: r.id,
      userId: r.userId,
      monitorId: r.monitorId,
      checkedAt: r.checkedAt.toISOString(),
      ok: r.ok,
      statusCode: r.status,
      latencyMs: r.latencyMs,
      message: r.message,
      level: (r.level as 'green' | 'yellow' | 'red'),
    }));
  }

  async runs(userId: string) {
    const runs = await this.prisma.monitorRun.findMany({ where: { userId }, orderBy: { checkedAt: 'desc' }, take: 200 });
    return runs.map((r) => ({
      id: r.id,
      userId: r.userId,
      monitorId: r.monitorId,
      checkedAt: r.checkedAt.toISOString(),
      ok: r.ok,
      statusCode: r.status,
      latencyMs: r.latencyMs,
      message: r.message,
      level: r.level as 'green' | 'yellow' | 'red',
    }));
  }

  async monitorRuns(userId: string, monitorId: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    const runs = await this.prisma.monitorRun.findMany({
      where: { userId, monitorId },
      orderBy: { checkedAt: 'desc' },
      take: 200,
    });

    return runs.map((r) => ({
      id: r.id,
      monitorId: r.monitorId,
      checkedAt: r.checkedAt.toISOString(),
      ok: r.ok,
      statusCode: r.status,
      latencyMs: r.latencyMs,
      message: r.message,
      level: r.level as 'green' | 'yellow' | 'red',
    }));
  }

  private parseGithubRepo(input: string) {
    const cleaned = input.replace(/^https?:\/\/github.com\//i, '').replace(/\.git$/, '');
    const [owner, repo] = cleaned.split('/');
    if (!owner || !repo) return null;
    return { owner, repo };
  }

  private parseGitlabTarget(target: string, host?: string) {
    const fallbackHost = (host ?? 'gitlab.com').replace(/\/$/, '');
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

  private async detectDeployedVersion(input: { appUrl?: string; appToken?: string; appVersionEndpoint?: string; appAuthType?: 'none' | 'token' | 'openvpn'; openvpnUsername?: string; openvpnPassword?: string }) {
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
    const candidates = custom ? [custom] : defaultCandidates;

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
          const version = this.extractVersionFromPayload(body);

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

  async testVersionConnection(input: { provider: 'github' | 'gitlab' | 'docker' | 'apt'; target: string; token?: string; host?: string }) {
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

    const image = input.target.includes('/') ? input.target : `library/${input.target}`;
    const resp = await fetch(`https://hub.docker.com/v2/repositories/${image}/tags?page_size=1&page=1&ordering=last_updated`);
    if (!resp.ok) return { ok: false, message: `Docker API ${resp.status}` };
    const data = await resp.json() as { results?: Array<{ name: string }> };
    return { ok: true, message: 'Docker Hub connection successful', latestVersion: data.results?.[0]?.name ?? null };
  }

  async discoverCurrentVersion(input: { provider: 'github' | 'gitlab' | 'docker' | 'apt'; target: string; token?: string; host?: string; appUrl?: string; appToken?: string; appVersionEndpoint?: string; appAuthType?: 'none' | 'token' | 'openvpn'; openvpnUsername?: string; openvpnPassword?: string }) {
    const hasAppUrl = Boolean(input.appUrl && input.appUrl.trim());
    const deployed = await this.detectDeployedVersion({ appUrl: input.appUrl, appToken: input.appToken, appVersionEndpoint: input.appVersionEndpoint });
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

  async versionSummary(userId: string) {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId, type: { in: ['GIT_RELEASE', 'DOCKER_IMAGE'] } },
      orderBy: { createdAt: 'desc' },
    });

    const rows = await Promise.all(monitors.map(async (m) => {
      const latest = await this.prisma.monitorRun.findFirst({ where: { monitorId: m.id }, orderBy: { checkedAt: 'desc' } });
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
      };
    }));

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
}
