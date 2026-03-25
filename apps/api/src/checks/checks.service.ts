import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { Monitor, MonitorRun } from '../types';
import { PrismaService } from '../common/prisma.service';
import { AlertsService } from '../alerts/alerts.service';
import { MailerService } from '../common/mailer.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { PluginRegistry } from './plugin.registry';
import type { PluginExecutionResult } from './plugin.contracts';
import { executePluginSafely } from './plugin.sandbox';
import { ExternalPluginLoader } from './external-plugin-loader';
import { httpResponseMatchPlugin } from './plugins/http-response-match.plugin';
import { regexMatchPlugin } from './plugins/regex-match.plugin';
import { responseTimePlugin } from './plugins/response-time.plugin';
import { jsonAssertionPlugin } from './plugins/json-assertion.plugin';
import { statusCodePlugin } from './plugins/status-code.plugin';
import { headerAssertionPlugin } from './plugins/header-assertion.plugin';
import { redirectCheckPlugin } from './plugins/redirect-check.plugin';
import { certExpiryPlugin } from './plugins/cert-expiry.plugin';

// Extracted runner modules
import { runHttpCheck } from './runners/http.runner';
import { runBrowserCheck } from './runners/http.runner';
import { runTcpCheck, runSslCheck, runDnsCheck, runPingCheck, runSmtpCheck } from './runners/network.runner';
import { runGitReleaseCheck, runDockerCheck } from './runners/version.runner';

@Injectable()
export class ChecksService {
  private readonly logger = new Logger(ChecksService.name);
  private readonly realtime: Pick<RealtimeEvents, 'monitorChecked' | 'statusPageUpdated'>;
  private readonly pluginRegistry = new PluginRegistry();
  private readonly externalPluginLoader: ExternalPluginLoader;

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
    @Optional() private readonly mailer?: MailerService,
    @Optional() realtime?: RealtimeEvents,
    @Optional() externalPluginLoader?: ExternalPluginLoader,
  ) {
    this.realtime = realtime ?? { monitorChecked: () => undefined, statusPageUpdated: () => undefined };
    this.externalPluginLoader = externalPluginLoader ?? new ExternalPluginLoader();
    this.pluginRegistry.register(httpResponseMatchPlugin);
    this.pluginRegistry.register(regexMatchPlugin);
    this.pluginRegistry.register(responseTimePlugin);
    this.pluginRegistry.register(jsonAssertionPlugin);
    this.pluginRegistry.register(statusCodePlugin);
    this.pluginRegistry.register(headerAssertionPlugin);
    this.pluginRegistry.register(redirectCheckPlugin);
    this.pluginRegistry.register(certExpiryPlugin);

    // Load external plugins asynchronously — errors are caught inside loadPlugins()
    void this.initExternalPlugins();
  }

  private async initExternalPlugins(): Promise<void> {
    const dir = this.externalPluginLoader.getPluginDir();
    const plugins = await this.externalPluginLoader.loadPlugins();
    let loaded = 0;

    for (const plugin of plugins) {
      if (this.pluginRegistry.list().some((p) => p.id === plugin.id)) {
        this.logger.warn(`External plugin ${plugin.id} conflicts with a built-in plugin — skipping`);
        continue;
      }
      try {
        this.pluginRegistry.register(plugin);
        loaded++;
      } catch (err) {
        this.logger.warn(
          `Failed to register external plugin ${plugin.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (loaded > 0) {
      this.logger.log(`Loaded ${loaded} external plugin${loaded !== 1 ? 's' : ''} from ${dir}`);
    }
  }

  /**
   * Returns all registered check plugins available for monitor configuration.
   * @returns Array of plugin descriptors (id, name, supportedTypes, configSchema)
   */
  listPlugins() {
    return this.pluginRegistry.list();
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

  private async dispatchCheck(monitor: Monitor) {
    switch (monitor.type) {
      case 'HTTP':
        return runHttpCheck(monitor.target, monitor.timeoutMs, monitor.config);
      case 'GIT_RELEASE':
        return runGitReleaseCheck(monitor.target, monitor.config);
      case 'DOCKER_IMAGE':
        return runDockerCheck(monitor.target, monitor.config);
      case 'TCP':
        return runTcpCheck(monitor.target, monitor.timeoutMs);
      case 'SSL_CERT':
        return runSslCheck(monitor.target, monitor.timeoutMs);
      case 'HEARTBEAT':
        return this.runHeartbeatCheck(monitor);
      case 'DNS':
        return runDnsCheck(monitor.target, monitor.config, monitor.timeoutMs);
      case 'PING':
        return runPingCheck(monitor.target, monitor.config, monitor.timeoutMs);
      case 'SMTP':
        return runSmtpCheck(monitor.target, monitor.config, monitor.timeoutMs);
      case 'BROWSER':
        return runBrowserCheck(monitor.target, monitor.config, monitor.timeoutMs);
      default:
        return runHttpCheck(monitor.target, monitor.timeoutMs);
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

    // Dependency suppression: if any monitor this monitor depends on is currently down,
    // suppress failure alerts to avoid noise cascade (e.g. app alerts suppressed when DB is down).
    // Recoveries are always sent regardless of dependencies.
    let dependencySuppressed = false;
    if (isCurrentUnhealthy && (shouldAlertFailure || consecutiveFailures >= confirmations)) {
      try {
        const deps = await this.prisma.monitorDependency.findMany({
          where: { monitorId: monitor.id },
          select: { dependsOnId: true },
        });
        if (deps.length > 0) {
          const depIds = deps.map((d) => d.dependsOnId);
          const latestRuns = await this.prisma.monitorRun.findMany({
            where: { monitorId: { in: depIds } },
            orderBy: { checkedAt: 'desc' },
            distinct: ['monitorId'],
            select: { monitorId: true, level: true },
          });
          const anyDepDown = latestRuns.some((r) => r.level === 'red' || r.level === 'yellow');
          if (anyDepDown) {
            dependencySuppressed = true;
            this.logger.warn(
              `[ChecksService] Suppressed alerts for monitor ${monitor.id} — dependency is down (dep IDs: ${depIds.join(', ')})`,
            );
          }
        }
      } catch (err) {
        // Non-fatal: if dependency check fails, proceed with alerting normally
        this.logger.warn(`[ChecksService] Dependency suppression check failed for monitor ${monitor.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Call notifyMonitorFailure for every unhealthy run (after confirmation threshold)
    // AND for recoveries. The alerts service's notifyOn filter decides per-channel
    // whether to actually dispatch (ON_CHANGE, ALWAYS, FIRST_ONLY, DAILY_DIGEST, etc.)
    if (!dependencySuppressed && (shouldAlertFailure || (isCurrentUnhealthy && consecutiveFailures >= confirmations))) {
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
          this.logger.warn(`Slack webhook delivery failed: ${err instanceof Error ? err.message : String(err)}`);
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
          this.logger.warn(`Discord webhook delivery failed: ${err instanceof Error ? err.message : String(err)}`);
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
            const subscriberAppBase = process.env.APP_BASE_URL ?? process.env.APP_URL ?? 'http://localhost:1234';
            const subscriberPageUrl = `${subscriberAppBase}/status/${page.slug}`;
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
                  pageUrl: subscriberPageUrl,
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
