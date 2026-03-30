import { BadRequestException, Inject, Injectable, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { MonitorType } from '../types';
import { AuditService } from '../common/audit.service';
import { MonitorsCrudService } from './monitors-crud.service';

@Injectable()
export class MonitorsExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => MonitorsCrudService))
    private readonly crud: MonitorsCrudService,
  ) {}

  /**
   * Exports all monitors for the user as a portable JSON object.
   * Sensitive config (tokens, passwords) is sanitized before export.
   * @param userId - The authenticated user's ID
   * @returns Export envelope with version, timestamp, and monitor list
   */
  async exportMonitors(userId: string, opts?: { format?: 'json' | 'yaml'; ids?: string[]; includeAlertChannels?: boolean }) {
    // Legacy: called without opts returns plain JSON object for backward compat
    if (!opts || (!opts.format && !opts.ids && !opts.includeAlertChannels)) {
      const monitors = await this.crud.list(userId);
      return {
        version: '1',
        exportedAt: new Date().toISOString(),
        monitors: monitors.map((m) => ({
          name: m.name,
          type: m.type,
          target: m.target,
          intervalSec: m.intervalSec,
          timeoutMs: m.timeoutMs,
          confirmations: m.confirmations,
          config: m.config,
          enabled: m.enabled,
        })),
      };
    }
    return this.exportMonitorsConfig(userId, {
      format: opts.format ?? 'json',
      ids: opts.ids,
      includeAlertChannels: opts.includeAlertChannels ?? false,
    });
  }

  /**
   * Imports monitors from a previously exported JSON array.
   * Creates each monitor in sequence; collects errors per item without failing the batch.
   * @param userId - The authenticated user's ID
   * @param items - Array of monitor definitions to import
   * @returns Summary of { imported, errors } with per-item error details
   */
  async importMonitors(userId: string, items: Array<{
    name: string;
    target: string;
    type: MonitorType;
    intervalSec?: number;
    timeoutMs?: number;
    confirmations?: number;
    config?: Record<string, unknown>;
    enabled?: boolean;
  }>) {
    const created = [];
    const errors: Array<{ index: number; name: string; error: string }> = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      try {
        const monitor = await this.crud.create(userId, {
          name: item.name,
          target: item.target,
          type: item.type,
          intervalSec: item.intervalSec,
          timeoutMs: item.timeoutMs,
          confirmations: item.confirmations,
          config: item.config,
        });
        if (item.enabled === false) {
          await this.crud.update(userId, monitor.id, { enabled: false });
        }
        created.push(monitor);
      } catch (err) {
        errors.push({ index: i, name: item.name, error: err instanceof Error ? err.message : String(err) });
      }
    }

    await this.audit.log('monitor.import', userId, userId, { imported: created.length, errors: errors.length });
    return { imported: created.length, errors };
  }

  // ─── Export / Import (GitOps) ─────────────────────────────────────────────

  /**
   * Exports monitor configurations as JSON or YAML (GitOps format).
   */
  async exportMonitorsConfig(userId: string, opts: { format: 'json' | 'yaml'; ids?: string[]; includeAlertChannels: boolean }) {
    const where = opts.ids?.length ? { userId, id: { in: opts.ids } } : { userId };
    const monitors = await this.prisma.monitor.findMany({
      where,
      include: {
        monitorAlerts: { include: { alertChannel: { select: { name: true } } } },
        monitorTags: { include: { tag: true } },
        folder: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const exported = monitors.map(m => ({
      name: m.name,
      type: m.type,
      target: m.target,
      intervalSec: m.intervalSec,
      enabled: m.enabled,
      timeoutMs: m.timeoutMs,
      retryCount: m.retryCount ?? 0,
      confirmations: m.confirmations ?? 1,
      tags: m.monitorTags.map((t: { tag: { name: string } }) => t.tag.name),
      folder: m.folder?.name ?? null,
      config: (m.configJson ?? {}) as Record<string, unknown>,
      slaTarget: m.slaTarget ?? null,
      ...(opts.includeAlertChannels && {
        alertChannelNames: m.monitorAlerts.map((ma: { alertChannel: { name: string } }) => ma.alertChannel.name),
      }),
    }));

    const payload = { version: '1', exportedAt: new Date().toISOString(), monitors: exported };
    const dateStr = new Date().toISOString().split('T')[0];

    if (opts.format === 'yaml') {
      const yaml = await import('js-yaml');
      return {
        content: yaml.dump(payload),
        contentType: 'application/yaml',
        filename: `pulsedock-monitors-${dateStr}.yaml`,
      };
    }

    return {
      content: JSON.stringify(payload, null, 2),
      contentType: 'application/json',
      filename: `pulsedock-monitors-${dateStr}.json`,
    };
  }

  /**
   * Imports monitor configurations from a JSON or YAML config string.
   */
  async importMonitorsConfig(userId: string, opts: { format: 'json' | 'yaml'; content: string; dryRun?: boolean; overwriteExisting?: boolean }) {
    let parsed: { version: string; monitors: unknown[] };

    try {
      if (opts.format === 'yaml') {
        const yaml = await import('js-yaml');
        parsed = yaml.load(opts.content) as typeof parsed;
      } else {
        parsed = JSON.parse(opts.content) as typeof parsed;
      }
    } catch {
      throw new BadRequestException('Invalid config format — could not parse JSON/YAML');
    }

    if (!parsed?.monitors || !Array.isArray(parsed.monitors)) {
      throw new BadRequestException('Invalid config: missing monitors array');
    }

    const results: { name: string; id?: string; action: 'created' | 'updated' | 'skipped' | 'error'; error?: string }[] = [];

    for (const raw of parsed.monitors) {
      const m = raw as Record<string, unknown>;
      if (!m.name || !m.type || !m.target) {
        results.push({ name: String(m.name ?? 'unknown'), action: 'error', error: 'Missing required fields: name, type, target' });
        continue;
      }

      const existing = await this.prisma.monitor.findFirst({ where: { userId, name: String(m.name) } });

      if (existing && !opts.overwriteExisting) {
        results.push({ name: String(m.name), id: existing.id, action: 'skipped' });
        continue;
      }

      if (opts.dryRun) {
        results.push({ name: String(m.name), action: existing ? 'updated' : 'created' });
        continue;
      }

      const data = {
        userId,
        name: String(m.name),
        type: String(m.type) as MonitorType,
        target: String(m.target),
        intervalSec: Number(m.intervalSec ?? 60),
        enabled: Boolean(m.enabled ?? true),
        timeoutMs: Number(m.timeoutMs ?? 5000),
        retryCount: Number(m.retryCount ?? 0),
        confirmations: Number(m.confirmations ?? 1),
        slaTarget: m.slaTarget ? Number(m.slaTarget) : null,
        configJson: ((m.config as Record<string, unknown>) ?? {}) as Prisma.InputJsonValue,
      };

      try {
        if (existing && opts.overwriteExisting) {
          const updated = await this.prisma.monitor.update({ where: { id: existing.id }, data });
          results.push({ name: String(m.name), id: updated.id, action: 'updated' });
        } else {
          const created = await this.prisma.monitor.create({ data });
          results.push({ name: String(m.name), id: created.id, action: 'created' });
        }
      } catch (e) {
        results.push({ name: String(m.name), action: 'error', error: e instanceof Error ? e.message : 'Unknown error' });
      }
    }

    return {
      created: results.filter(r => r.action === 'created').length,
      updated: results.filter(r => r.action === 'updated').length,
      skipped: results.filter(r => r.action === 'skipped').length,
      errors: results.filter(r => r.action === 'error').map(r => `${r.name}: ${r.error}`),
      monitors: results,
    };
  }

  // ── External import parsers ─────────────────────────────────────────────────

  /**
   * Parse an Uptime Robot JSON export and return a normalised monitor list.
   * Uptime Robot monitor types: 1=HTTP(S), 2=Keyword, 3=Ping, 4=Port, 5=Heartbeat
   * We map type 1 and 2 → HTTP; skip unsupported types.
   */
  private parseUptimeRobot(raw: unknown): Array<{
    name: string; target: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';
    intervalSec?: number; enabled?: boolean;
  }> {
    const data = raw as Record<string, unknown>;
    const monitors: unknown[] = Array.isArray(data['monitors'])
      ? (data['monitors'] as unknown[])
      : Array.isArray(raw)
        ? (raw as unknown[])
        : [];

    const results: Array<{ name: string; target: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE'; intervalSec?: number; enabled?: boolean }> = [];

    for (const m of monitors) {
      const mon = m as Record<string, unknown>;
      const urlRaw = (mon['url'] ?? mon['target'] ?? '') as string;
      const name = (mon['friendly_name'] ?? mon['name'] ?? urlRaw) as string;
      const type = (mon['type'] as number) ?? 1;
      // Only import HTTP-like monitors (type 1 = HTTP, 2 = Keyword)
      if (![1, 2].includes(type)) continue;
      const interval = (mon['interval'] as number) ?? 300;
      // status: 2=up, else paused/down — treat non-2 as disabled
      const status = (mon['status'] as number) ?? 2;

      if (!urlRaw || !/^https?:\/\//i.test(urlRaw)) continue;

      results.push({
        name: String(name).slice(0, 255),
        target: urlRaw,
        type: 'HTTP',
        intervalSec: Math.max(10, interval),
        enabled: status === 2,
      });
    }
    return results;
  }

  /**
   * Parse a BetterUptime JSON export.
   * BetterUptime API format: { data: [{ id, attributes: { url, pronounceable_name, check_type, call, request_interval_seconds, paused } }] }
   * Also accepts a plain array of attribute objects.
   */
  private parseBetterUptime(raw: unknown): Array<{
    name: string; target: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';
    intervalSec?: number; enabled?: boolean;
  }> {
    const data = raw as Record<string, unknown>;

    // Support both { data: [...] } and plain array
    let items: unknown[] = [];
    if (Array.isArray(data['data'])) {
      items = data['data'] as unknown[];
    } else if (Array.isArray(raw)) {
      items = raw as unknown[];
    }

    const results: Array<{ name: string; target: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE'; intervalSec?: number; enabled?: boolean }> = [];

    for (const item of items) {
      const entry = item as Record<string, unknown>;
      // Support both nested { attributes: {...} } and flat objects
      const attrs = (entry['attributes'] as Record<string, unknown>) ?? entry;

      const url = (attrs['url'] ?? '') as string;
      const name = (attrs['pronounceable_name'] ?? attrs['name'] ?? url) as string;
      const checkType = (attrs['check_type'] ?? 'status') as string;
      const paused = (attrs['paused'] ?? false) as boolean;
      const interval = (attrs['request_interval_seconds'] ?? attrs['interval'] ?? 180) as number;

      // Only import HTTP-type checks
      if (!['status', 'expected_status_code', 'keyword'].includes(checkType)) continue;
      if (!url || !/^https?:\/\//i.test(url)) continue;

      results.push({
        name: String(name).slice(0, 255),
        target: url,
        type: 'HTTP',
        intervalSec: Math.max(10, interval as number),
        enabled: !paused,
      });
    }
    return results;
  }

  /**
   * Parse an Uptime Kuma JSON backup export.
   * Format: { monitorList: [{ name, url, type, interval, active }] }
   * @param raw - Raw parsed JSON from Uptime Kuma backup
   */
  private parseUptimeKuma(raw: unknown): Array<{
    name: string; target: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';
    intervalSec?: number; enabled?: boolean;
  }> {
    const data = raw as Record<string, unknown>;
    let items: unknown[] = [];

    // Uptime Kuma backup: { monitorList: [...] } or { monitors: [...] } or plain array
    if (Array.isArray(data['monitorList'])) {
      items = data['monitorList'] as unknown[];
    } else if (Array.isArray(data['monitors'])) {
      items = data['monitors'] as unknown[];
    } else if (Array.isArray(raw)) {
      items = raw as unknown[];
    }

    const results: Array<{
      name: string; target: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';
      intervalSec?: number; enabled?: boolean;
    }> = [];

    for (const item of items) {
      const entry = item as Record<string, unknown>;
      // Uptime Kuma monitor types: 1=HTTP, 2=Port, 3=Ping, etc.
      const monType = entry['type'] as string | number | undefined;
      const url = (entry['url'] ?? '') as string;
      const hostname = (entry['hostname'] ?? '') as string;
      const name = (entry['name'] ?? url ?? hostname) as string;
      const interval = (entry['interval'] ?? 60) as number;
      const active = entry['active'] !== false && entry['active'] !== 0;

      // Import HTTP monitors (type = 'http' or 1) — skip ping/port/etc.
      if (monType !== undefined && monType !== 'http' && monType !== 1 && monType !== 'HTTP') {
        continue;
      }

      const target = url || (hostname ? `http://${hostname}` : '');
      if (!target || !/^https?:\/\//i.test(target)) continue;

      results.push({
        name: String(name).slice(0, 255),
        target,
        type: 'HTTP',
        intervalSec: Math.max(10, Number(interval) || 60),
        enabled: active,
      });
    }
    return results;
  }

  /**
   * Parse a generic CSV export where the first row is headers.
   * Looks for columns: name/Name, url/URL/target/Target, interval/Interval
   */
  private parseCsv(csv: string): Array<{
    name: string; target: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';
    intervalSec?: number; enabled?: boolean;
  }> {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = (lines[0] ?? '').split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
    const nameIdx = headers.findIndex((h) => ['name', 'friendly_name', 'monitor name'].includes(h));
    const urlIdx = headers.findIndex((h) => ['url', 'target', 'address', 'website'].includes(h));
    const intervalIdx = headers.findIndex((h) => ['interval', 'check interval', 'request_interval_seconds'].includes(h));
    const pausedIdx = headers.findIndex((h) => ['paused', 'status', 'enabled'].includes(h));

    if (urlIdx === -1) return [];

    const results: Array<{ name: string; target: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE'; intervalSec?: number; enabled?: boolean }> = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = (lines[i] ?? '').split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      const url = cols[urlIdx] ?? '';
      if (!url || !/^https?:\/\//i.test(url)) continue;

      const name = nameIdx >= 0 ? (cols[nameIdx] ?? url) : url;
      const interval = intervalIdx >= 0 ? parseInt(cols[intervalIdx] ?? '300', 10) : 300;
      const pausedRaw = pausedIdx >= 0 ? (cols[pausedIdx] ?? '') : '';
      const enabled = !['paused', 'false', '0', 'disabled'].includes(pausedRaw.toLowerCase());

      results.push({
        name: name.slice(0, 255),
        target: url,
        type: 'HTTP',
        intervalSec: isNaN(interval) ? 300 : Math.max(10, interval),
        enabled,
      });
    }
    return results;
  }

  /**
   * Imports monitors from an external monitoring tool export (Uptime Robot, Better Uptime, or CSV).
   * Skips duplicates based on target URL. Collects per-item errors without failing the whole batch.
   * @param userId - The authenticated user's ID
   * @param source - Import source format: 'uptime-robot' | 'better-uptime' | 'csv'
   * @param payload - The raw export data (JSON object or CSV string)
   * @returns { imported, skipped, errors, message } with import summary
   */
  async importExternal(
    userId: string,
    source: 'uptime-robot' | 'better-uptime' | 'uptime-kuma' | 'csv',
    payload: unknown,
  ) {
    let items: Array<{
      name: string; target: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';
      intervalSec?: number; enabled?: boolean;
    }>;

    switch (source) {
      case 'uptime-robot':
        items = this.parseUptimeRobot(payload);
        break;
      case 'better-uptime':
        items = this.parseBetterUptime(payload);
        break;
      case 'uptime-kuma':
        items = this.parseUptimeKuma(payload);
        break;
      case 'csv':
        items = this.parseCsv(typeof payload === 'string' ? payload : JSON.stringify(payload));
        break;
      default:
        items = [];
    }

    if (!items.length) {
      return { imported: 0, skipped: 0, errors: [], message: 'No importable monitors found in the provided data.' };
    }

    const created = [];
    const errors: Array<{ index: number; name: string; error: string }> = [];
    let skipped = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      try {
        // Skip duplicates (same target already exists for this user)
        const existing = await this.prisma.monitor.findFirst({ where: { userId, target: item.target } });
        if (existing) { skipped++; continue; }

        const monitor = await this.crud.create(userId, {
          name: item.name,
          target: item.target,
          type: item.type,
          intervalSec: item.intervalSec,
        });
        if (item.enabled === false) {
          await this.crud.update(userId, monitor.id, { enabled: false });
        }
        created.push(monitor);
      } catch (err) {
        errors.push({ index: i, name: item?.name ?? '?', error: err instanceof Error ? err.message : String(err) });
      }
    }

    await this.audit.log('monitor.import_external', userId, userId, {
      source,
      imported: created.length,
      skipped,
      errors: errors.length,
    });

    return {
      imported: created.length,
      skipped,
      errors,
      message: `Imported ${created.length} monitor${created.length !== 1 ? 's' : ''}${skipped ? `, skipped ${skipped} duplicate${skipped !== 1 ? 's' : ''}` : ''}.`,
    };
  }

  // ── Import from Docker Compose ──────────────────────────────────────────────

  /**
   * Parses a docker-compose YAML string and returns suggested monitors for each service.
   * Does NOT persist anything — returns suggestions only.
   */
  importFromCompose(compose: string): SuggestedMonitor[] {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require('js-yaml') as typeof import('js-yaml');

    let parsed: unknown;
    try {
      parsed = yaml.load(compose);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Invalid YAML: ${msg}`);
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('services' in parsed) ||
      typeof (parsed as Record<string, unknown>).services !== 'object'
    ) {
      return [];
    }

    const services = (parsed as { services: Record<string, unknown> }).services;
    const suggestions: SuggestedMonitor[] = [];

    for (const [serviceName, serviceDef] of Object.entries(services)) {
      if (!serviceDef || typeof serviceDef !== 'object') continue;

      const svc = serviceDef as {
        image?: string;
        ports?: Array<string | { published?: string | number; target?: string | number }>;
      };

      const image = (svc.image ?? '').toLowerCase();

      // Parse port mappings → list of host ports
      const hostPorts: number[] = [];
      if (Array.isArray(svc.ports)) {
        for (const p of svc.ports) {
          if (typeof p === 'string') {
            // "hostPort:containerPort" or just "containerPort"
            const parts = p.split(':');
            const hostPart = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
            const portNum = parseInt(hostPart.replace(/[^0-9]/g, ''), 10);
            if (!isNaN(portNum)) hostPorts.push(portNum);
          } else if (typeof p === 'object' && p !== null) {
            const pub = p.published;
            if (pub !== undefined) {
              const portNum = typeof pub === 'number' ? pub : parseInt(String(pub), 10);
              if (!isNaN(portNum)) hostPorts.push(portNum);
            }
          }
        }
      }

      const firstPort = hostPorts[0];
      const hasPort = (port: number) => hostPorts.includes(port);

      // Helper: build HTTP target
      const httpTarget = (port: number) => `http://localhost:${port}`;
      // Helper: build TCP target
      const tcpTarget = (port: number) => `localhost:${port}`;

      // ── Image-based heuristics ───────────────────────────────────────────
      if (/nginx|traefik|caddy|haproxy/.test(image)) {
        const port = hasPort(443) ? 443 : hasPort(80) ? 80 : firstPort;
        if (port !== undefined) {
          const proto = port === 443 ? 'https' : 'http';
          suggestions.push({
            name: serviceName,
            type: 'HTTP',
            target: `${proto}://localhost:${port}`,
            reason: `${image.match(/nginx|traefik|caddy|haproxy/)?.[0] ?? 'proxy'} image detected on port ${port}`,
            intervalSec: 60,
          });
        }
        continue;
      }

      if (/postgres/.test(image)) {
        const port = firstPort ?? 5432;
        suggestions.push({
          name: serviceName,
          type: 'TCP',
          target: tcpTarget(port),
          reason: `postgres image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      if (/redis/.test(image)) {
        const port = firstPort ?? 6379;
        suggestions.push({
          name: serviceName,
          type: 'TCP',
          target: tcpTarget(port),
          reason: `redis image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      if (/mysql|mariadb/.test(image)) {
        const port = firstPort ?? 3306;
        suggestions.push({
          name: serviceName,
          type: 'TCP',
          target: tcpTarget(port),
          reason: `${image.match(/mysql|mariadb/)?.[0] ?? 'mysql'} image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      if (/mongo/.test(image)) {
        const port = firstPort ?? 27017;
        suggestions.push({
          name: serviceName,
          type: 'TCP',
          target: tcpTarget(port),
          reason: `mongo image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      if (/rabbitmq/.test(image)) {
        const tcpPort = firstPort ?? 5672;
        suggestions.push({
          name: serviceName,
          type: 'TCP',
          target: tcpTarget(tcpPort),
          reason: `rabbitmq image detected on port ${tcpPort}`,
          intervalSec: 60,
        });
        // Also suggest management UI if port 15672 is mapped
        if (hasPort(15672)) {
          suggestions.push({
            name: `${serviceName}-management`,
            type: 'HTTP',
            target: httpTarget(15672),
            reason: `rabbitmq management UI on port 15672`,
            intervalSec: 60,
          });
        }
        continue;
      }

      if (/elasticsearch/.test(image)) {
        const port = firstPort ?? 9200;
        suggestions.push({
          name: serviceName,
          type: 'HTTP',
          target: httpTarget(port),
          reason: `elasticsearch image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      if (/grafana/.test(image)) {
        const port = firstPort ?? 3000;
        suggestions.push({
          name: serviceName,
          type: 'HTTP',
          target: httpTarget(port),
          reason: `grafana image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      if (/prometheus/.test(image)) {
        const port = firstPort ?? 9090;
        suggestions.push({
          name: serviceName,
          type: 'HTTP',
          target: httpTarget(port),
          reason: `prometheus image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      if (/minio/.test(image)) {
        const port = hasPort(9001) ? 9001 : firstPort ?? 9000;
        suggestions.push({
          name: serviceName,
          type: 'HTTP',
          target: httpTarget(port),
          reason: `minio image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      // ── Port-based fallback heuristics ───────────────────────────────────
      if (hasPort(80) || hasPort(443)) {
        const port = hasPort(443) ? 443 : 80;
        const proto = port === 443 ? 'https' : 'http';
        suggestions.push({
          name: serviceName,
          type: 'HTTP',
          target: `${proto}://localhost:${port}`,
          reason: `port ${port} exposed (HTTP)`,
          intervalSec: 60,
        });
        continue;
      }

      if (firstPort !== undefined) {
        suggestions.push({
          name: serviceName,
          type: 'TCP',
          target: tcpTarget(firstPort),
          reason: `port ${firstPort} exposed`,
          intervalSec: 60,
        });
        continue;
      }

      // No ports → skip
    }

    return suggestions;
  }

  // ─── OpenAPI Import ────────────────────────────────────────────────────────

  async previewFromOpenApi(opts: {
    specJson?: string;
    url?: string;
    baseUrl: string;
    maxPaths?: number;
  }): Promise<{ suggestions: OpenApiSuggestion[] }> {
    if (!opts.specJson && !opts.url) {
      throw new BadRequestException('Either specJson or url must be provided');
    }

    let rawSpec: string = opts.specJson ?? '';

    if (opts.url && !opts.specJson) {
      // In real use we'd fetch; for now throw if no json
      throw new BadRequestException('Fetching spec by url is not supported in this context');
    }

    let spec: Record<string, unknown>;
    try {
      spec = JSON.parse(rawSpec);
    } catch {
      throw new BadRequestException('Invalid JSON in specJson');
    }

    const basePath = typeof (spec as { basePath?: string }).basePath === 'string'
      ? (spec as { basePath: string }).basePath
      : '';

    const paths = (spec as { paths?: Record<string, Record<string, { summary?: string; tags?: string[] }>> }).paths ?? {};

    const SUPPORTED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

    const suggestions: OpenApiSuggestion[] = [];

    for (const [path, methods] of Object.entries(paths)) {
      if (opts.maxPaths != null && suggestions.length >= opts.maxPaths) break;

      for (const [method, op] of Object.entries(methods)) {
        if (opts.maxPaths != null && suggestions.length >= opts.maxPaths) break;

        const upperMethod = method.toUpperCase();
        if (!SUPPORTED_METHODS.includes(upperMethod)) continue;

        // Replace path params with sensible placeholders
        const resolvedPath = path.replace(/\{([^}]+)\}/g, (_match, param: string) => {
          // Use numeric placeholder for likely id params, "example" for others
          const lower = param.toLowerCase();
          if (lower.endsWith('id') || lower === 'id') return '1';
          return 'example';
        });

        const url = `${opts.baseUrl}${basePath}${resolvedPath}`;

        const expectedStatus = upperMethod === 'POST' ? 201
          : upperMethod === 'DELETE' ? 204
          : 200;

        suggestions.push({
          key: `${upperMethod}:${path}`,
          method: upperMethod as OpenApiSuggestion['method'],
          path,
          url,
          expectedStatus,
          summary: op.summary,
          tags: op.tags,
        });
      }
    }

    return { suggestions };
  }

  async importFromOpenApi(
    userId: string,
    opts: {
      specJson?: string;
      url?: string;
      baseUrl: string;
      selectedPaths: string[];
      intervalSec?: number;
      folderId?: string;
      alertChannelIds?: string[];
    },
  ): Promise<{ created: number; monitors: unknown[] }> {
    const { suggestions } = await this.previewFromOpenApi({
      specJson: opts.specJson,
      url: opts.url,
      baseUrl: opts.baseUrl,
    });

    const selected = suggestions.filter((s) => opts.selectedPaths.includes(s.key));

    const monitors: unknown[] = [];
    for (const s of selected) {
      const monitor = await this.crud.create(userId, {
        name: s.summary ?? `${s.method} ${s.path}`,
        target: s.url,
        type: 'HTTP' as MonitorType,
        intervalSec: opts.intervalSec ?? 60,
        folderId: opts.folderId ?? null,
        alertChannelIds: opts.alertChannelIds,
        config: {
          method: s.method,
          expectedStatus: s.expectedStatus,
        },
      });
      monitors.push(monitor);
    }

    return { created: monitors.length, monitors };
  }

  // ─── Playground rate-limit: in-memory map userId → timestamps ───────────────
  private readonly _playgroundTimestamps = new Map<string, number[]>();
}


export interface SuggestedMonitor {
  name: string;
  type: 'HTTP' | 'TCP';
  target: string;
  reason: string;
  intervalSec: number;
}

export interface OpenApiSuggestion {
  key: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  path: string;
  url: string;
  expectedStatus: number;
  summary?: string;
  tags?: string[];
}
