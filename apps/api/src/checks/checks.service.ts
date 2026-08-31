import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { Monitor, MonitorRun } from '../types';
import { PrismaService } from '../common/prisma.service';
import { MetricsService } from '../common/metrics.service';
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
import { runTcpCheck, runSslCheck, runDnsCheck, runPingCheck, runSmtpCheck, runFtpCheck, runImapCheck, runPop3Check } from './runners/network.runner';
import { runWhoisCheck } from './runners/whois.runner';
import { runCtLogCheck } from './runners/ct-log.runner';
import { runGraphQLCheck } from './runners/graphql.runner';
import { runTransactionCheck } from './runners/transaction.runner';
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
    @Optional() private readonly metrics?: MetricsService,
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
    // Merge top-level trackedHeaders + metric capture fields + headerAssertions into config for HTTP/BROWSER runners
    const monitorExt = monitor as typeof monitor & {
      trackedHeaders?: string | null;
      metricPath?: string | null;
      metricName?: string | null;
      metricUnit?: string | null;
      metricAlertMin?: number | null;
      metricAlertMax?: number | null;
      headerAssertions?: unknown | null;
    };
    const httpConfig = {
      ...monitor.config,
      ...(monitorExt.trackedHeaders ? { trackedHeaders: monitorExt.trackedHeaders } : {}),
      ...(monitorExt.metricPath ? { metricPath: monitorExt.metricPath } : {}),
      ...(monitorExt.metricName ? { metricName: monitorExt.metricName } : {}),
      ...(monitorExt.metricUnit ? { metricUnit: monitorExt.metricUnit } : {}),
      ...(monitorExt.metricAlertMin !== null && monitorExt.metricAlertMin !== undefined ? { metricAlertMin: monitorExt.metricAlertMin } : {}),
      ...(monitorExt.metricAlertMax !== null && monitorExt.metricAlertMax !== undefined ? { metricAlertMax: monitorExt.metricAlertMax } : {}),
      ...(Array.isArray(monitorExt.headerAssertions) && monitorExt.headerAssertions.length > 0 ? { headerAssertions: monitorExt.headerAssertions } : {}),
    };

    switch (monitor.type) {
      case 'HTTP':
        return runHttpCheck(monitor.target, monitor.timeoutMs, httpConfig);
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
        return runBrowserCheck(monitor.target, httpConfig as Record<string, unknown>, monitor.timeoutMs);
      case 'WHOIS':
        return runWhoisCheck(monitor.target, monitor.config as { warnDays?: number; criticalDays?: number }, monitor.timeoutMs);
      case 'FTP':
        return runFtpCheck(monitor.target, monitor.config, monitor.timeoutMs);
      case 'IMAP':
        return runImapCheck(monitor.target, monitor.config, monitor.timeoutMs);
      case 'POP3':
        return runPop3Check(monitor.target, monitor.config, monitor.timeoutMs);
      case 'CT_LOG':
        return runCtLogCheck(monitor.target, monitor.config ?? {}, monitor.timeoutMs);
      case 'GRAPHQL':
        return runGraphQLCheck({
          url: monitor.target,
          query: monitor.graphqlQuery ?? undefined,
          variables: monitor.graphqlVariables ?? undefined,
          dataPath: monitor.graphqlDataPath ?? undefined,
          expectedValue: monitor.graphqlExpectedValue ?? undefined,
          timeoutMs: monitor.timeoutMs ?? 30_000,
        });
      case 'TRANSACTION': {
        const txConfig = (monitor.config ?? {}) as {
          transactionSteps?: unknown[];
          initialVars?: Record<string, string>;
          continueOnFailure?: boolean;
        };
        return runTransactionCheck(
          (txConfig.transactionSteps ?? []) as import('./runners/transaction.runner').TransactionStep[],
          txConfig.initialVars ?? {},
          txConfig.continueOnFailure ?? false,
        );
      }
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
    this.metrics?.checkStarted();

    let runResult: MonitorRun | undefined;
    try {
      runResult = await this._runMonitorInner(monitor);
      return runResult;
    } finally {
      this.metrics?.checkFinished();
      // Use the latency from the check result rather than wall-clock time
      // to avoid interfering with Date.now mocks in tests.
      const durationMs = runResult?.latencyMs ?? 0;
      this.metrics?.observeCheckExecution(monitor.type, runResult?.ok ?? false, durationMs);
    }
  }

  /** Inner implementation of runMonitor — separated for metrics wrapper. */
  private async _runMonitorInner(monitor: Monitor): Promise<MonitorRun> {
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

    // Fetch recent runs — we need enough for both confirmations and flap detection.
    const monitorFlapWindow = monitor.flapWindow ?? 10;
    const fetchCount = Math.max(confirmations, monitorFlapWindow);

    let recentRuns: Array<{ level: string }> = [];
    if (typeof monitorRunModel.findMany === 'function') {
      recentRuns = await monitorRunModel.findMany({
        where: { monitorId: monitor.id },
        orderBy: { checkedAt: 'desc' },
        take: fetchCount,
      });
    } else {
      const prevRun = await this.prisma.monitorRun.findFirst({
        where: { monitorId: monitor.id },
        orderBy: { checkedAt: 'desc' },
      });
      recentRuns = prevRun ? [{ level: prevRun.level }] : [];
    }

    const prev = recentRuns[0] ?? null;

    // ── Retry Logic ───────────────────────────────────────────────────────────────────
    // If retryCount > 0, automatically retry failed checks up to retryCount times with
    // exponential backoff (500ms, 1s, 2s). This prevents transient network blips from
    // generating false alerts. The final result (success or last failure) is recorded.
    const maxRetries = Math.max(0, Math.min(3, monitor.retryCount ?? 0));

    const pluginResult = await this.runPluginMonitor(monitor);
    let result = pluginResult ?? await this.dispatchCheck(monitor);

    if (!result.ok && maxRetries > 0) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const backoffMs = 500 * Math.pow(2, attempt - 1); // 500ms, 1s, 2s
        await new Promise((r) => setTimeout(r, backoffMs));
        const retryPluginResult = await this.runPluginMonitor(monitor);
        const retryResult = retryPluginResult ?? await this.dispatchCheck(monitor);
        if (retryResult.ok) {
          result = retryResult;
          break;
        }
        // On last retry, keep the latest failure result (more recent message/status)
        result = retryResult;
      }
    }

    // ── DNS Baseline Persistence ──────────────────────────────────────────────────────
    // When a DNS monitor has detectChanges enabled and resolvedRecords are available,
    // persist the baseline to configJson if not set yet (first successful run).
    // This allows subsequent runs to detect record changes.
    const dnsResult = result as PluginExecutionResult;
    if (
      monitor.type === 'DNS' &&
      dnsResult.resolvedRecords &&
      dnsResult.resolvedRecords.length > 0 &&
      monitor.config.detectChanges === true &&
      !Array.isArray(monitor.config.dnsBaseline)
    ) {
      try {
        const currentConfig = (monitor.config as Record<string, unknown>);
        await this.prisma.monitor.update({
          where: { id: monitor.id },
          data: {
            configJson: {
              ...currentConfig,
              dnsBaseline: dnsResult.resolvedRecords,
              dnsBaselineSetAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
        this.logger.log(
          `[DNSChange] Baseline set for monitor ${monitor.id} (${monitor.name}): ${dnsResult.resolvedRecords.join(', ')}`,
        );
      } catch (err) {
        this.logger.warn(
          `[DNSChange] Failed to persist baseline for monitor ${monitor.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────────────────────

    // ── HTTP Content Change Detection ─────────────────────────────────────────────────
    // When detectContentChanges is enabled on HTTP/BROWSER monitors:
    // - First successful run: persist contentHash as baseline
    // - Subsequent runs: compare hash; if different → degrade level to yellow and alert
    const httpResult = result as PluginExecutionResult;
    if (
      (monitor.type === 'HTTP' || monitor.type === 'BROWSER') &&
      httpResult.responseBodyHash &&
      monitor.config.detectContentChanges === true &&
      httpResult.ok
    ) {
      const storedHash = typeof monitor.config.contentHash === 'string' ? monitor.config.contentHash : null;
      if (!storedHash) {
        // First run — persist baseline hash
        try {
          const currentConfig = (monitor.config as Record<string, unknown>);
          await this.prisma.monitor.update({
            where: { id: monitor.id },
            data: {
              configJson: {
                ...currentConfig,
                contentHash: httpResult.responseBodyHash,
                contentHashSetAt: new Date().toISOString(),
              } as Prisma.InputJsonValue,
            },
          });
          this.logger.log(
            `[ContentChange] Baseline set for monitor ${monitor.id} (${monitor.name}): ${httpResult.responseBodyHash}`,
          );
        } catch (err) {
          this.logger.warn(
            `[ContentChange] Failed to persist baseline for monitor ${monitor.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else if (storedHash !== httpResult.responseBodyHash) {
        // Hash changed — degrade to yellow
        result = {
          ...result,
          ok: false,
          level: 'yellow',
          message: `Content changed — page content differs from baseline`,
        };
        this.logger.log(
          `[ContentChange] Content changed for monitor ${monitor.id} (${monitor.name}): ${storedHash} → ${httpResult.responseBodyHash}`,
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────────────────────

    // ── Response Header Tracking ──────────────────────────────────────────────────────
    // When trackedHeaders is set on HTTP/BROWSER monitors:
    // - First successful run with capturedHeaders: persist as headerBaseline
    // - Subsequent runs: compare; if any tracked header changed → degrade to yellow
    const headerResult = result as PluginExecutionResult;
    if (
      (monitor.type === 'HTTP' || monitor.type === 'BROWSER') &&
      headerResult.capturedHeaders &&
      headerResult.ok
    ) {
      const monitorWithHeaders = monitor as typeof monitor & {
        trackedHeaders?: string | null;
        headerBaseline?: Record<string, string | null> | null;
        headerBaselineSetAt?: Date | null;
      };
      const hasBaseline =
        monitorWithHeaders.headerBaseline &&
        typeof monitorWithHeaders.headerBaseline === 'object' &&
        Object.keys(monitorWithHeaders.headerBaseline).length > 0;

      if (!hasBaseline) {
        // First run — persist baseline
        try {
          await this.prisma.monitor.update({
            where: { id: monitor.id },
            data: {
              headerBaseline: headerResult.capturedHeaders as Prisma.InputJsonValue,
              headerBaselineSetAt: new Date(),
            },
          });
          this.logger.log(
            `[HeaderTracking] Baseline set for monitor ${monitor.id} (${monitor.name}): ${JSON.stringify(headerResult.capturedHeaders)}`,
          );
        } catch (err) {
          this.logger.warn(
            `[HeaderTracking] Failed to persist baseline for monitor ${monitor.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        // Compare with baseline
        const baseline = monitorWithHeaders.headerBaseline as Record<string, string | null>;
        const current = headerResult.capturedHeaders;
        const changed: string[] = [];
        for (const [header, baselineValue] of Object.entries(baseline)) {
          const currentValue = current[header] ?? null;
          if (currentValue !== baselineValue) {
            changed.push(`${header}: "${baselineValue ?? '(absent)'}" → "${currentValue ?? '(absent)'}"`);
          }
        }
        if (changed.length > 0) {
          result = {
            ...result,
            ok: false,
            level: 'yellow',
            message: `Header changed — ${changed.join('; ')}`,
          };
          this.logger.log(
            `[HeaderTracking] Headers changed for monitor ${monitor.id} (${monitor.name}): ${changed.join(', ')}`,
          );
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────────────

    // ── Geo-region round-robin tagging ───────────────────────────────────────────────
    // Pick the next region from monitor.geoRegions (if configured) using round-robin
    let geoRegion: string | null = null;
    const monitorWithGeo = monitor as typeof monitor & { geoRegions?: string[] };
    if (monitorWithGeo.geoRegions && monitorWithGeo.geoRegions.length > 0) {
      const runCount = await this.prisma.monitorRun.count({ where: { monitorId: monitor.id } });
      geoRegion = monitorWithGeo.geoRegions[runCount % monitorWithGeo.geoRegions.length];
    }
    // ─────────────────────────────────────────────────────────────────────────────────

    const created = await this.prisma.monitorRun.create({
      data: {
        userId: monitor.userId,
        monitorId: monitor.id,
        ok: result.ok,
        status: (result as PluginExecutionResult).statusCode,
        latencyMs: result.latencyMs,
        message: result.message,
        level: result.level,
        // Capture response body on failure for debugging (max 500 chars)
        responseBody: (result as PluginExecutionResult).responseBody ? (result as PluginExecutionResult).responseBody!.slice(0, 500) : null,
        // HTTP timing breakdown (DNS, TCP, TLS, TTFB, Download) for HTTP/BROWSER monitors
        timingsJson: ((result as PluginExecutionResult).timings
          ? ((result as PluginExecutionResult).timings as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull),
        // Security headers audit (only present when checkSecurityHeaders=true on HTTP monitors)
        securityAuditJson: ((result as PluginExecutionResult).securityHeadersAudit
          ? ((result as PluginExecutionResult).securityHeadersAudit as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull),
        // Response body size in bytes (HTTP/BROWSER monitors)
        responseSizeBytes: typeof (result as PluginExecutionResult).responseSizeBytes === 'number'
          ? (result as PluginExecutionResult).responseSizeBytes
          : null,
        // HTTP redirect chain (URLs followed before reaching final response)
        redirectChain: Array.isArray((result as PluginExecutionResult & { redirectChain?: string[] }).redirectChain)
          ? (result as PluginExecutionResult & { redirectChain?: string[] }).redirectChain!
          : [],
        // Geo region tag (round-robin from monitor.geoRegions if configured)
        geoRegion,
        // Custom metric value captured from response body via metricPath JSONPath
        capturedMetricValue: typeof (result as PluginExecutionResult).capturedMetricValue === 'number'
          ? (result as PluginExecutionResult).capturedMetricValue
          : null,
        // Header assertion failures (present when headerAssertions configured and at least one fails)
        headerAssertionsFailed: Array.isArray((result as PluginExecutionResult).headerAssertionsFailed) && (result as PluginExecutionResult).headerAssertionsFailed!.length > 0
          ? ((result as PluginExecutionResult).headerAssertionsFailed as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });

    // ── Anomaly Detection ─────────────────────────────────────────────────────────────
    // If anomalyDetection is enabled and the run succeeded (green) with high latency,
    // compute P95 of last 7 days of latency data and upgrade level to yellow if exceeded.
    let anomalyLevel: string = created.level;
    let anomalyMessage: string = created.message;
    const monitorWithAnomaly = monitor as typeof monitor & { anomalyDetection?: boolean; anomalyMultiplier?: number };
    if (
      monitorWithAnomaly.anomalyDetection &&
      created.ok &&
      created.latencyMs !== null &&
      created.latencyMs > 0
    ) {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentLatencies = await this.prisma.monitorRun.findMany({
          where: {
            monitorId: monitor.id,
            checkedAt: { gte: sevenDaysAgo },
            ok: true,
            latencyMs: { not: null },
          },
          select: { latencyMs: true },
          orderBy: { checkedAt: 'desc' },
          take: 500,
        });
        if (recentLatencies.length >= 10) {
          const sortedLatencies = recentLatencies
            .map((r) => r.latencyMs as number)
            .filter((l) => l > 0)
            .sort((a, b) => a - b);
          const p95Index = Math.floor(sortedLatencies.length * 0.95);
          const p95Baseline = sortedLatencies[p95Index] ?? sortedLatencies[sortedLatencies.length - 1];
          const multiplier = monitorWithAnomaly.anomalyMultiplier ?? 2.0;
          const threshold = p95Baseline * multiplier;
          if (created.latencyMs > threshold) {
            anomalyLevel = 'yellow';
            anomalyMessage = `Anomaly: ${created.latencyMs}ms exceeds ${multiplier}× P95 baseline (${Math.round(p95Baseline)}ms → threshold ${Math.round(threshold)}ms). ${created.message}`;
            this.logger.warn(
              `[AnomalyDetection] Monitor ${monitor.id} latency spike: ${created.latencyMs}ms > ${Math.round(threshold)}ms threshold (${multiplier}× P95 ${Math.round(p95Baseline)}ms)`,
            );
          }
        }
      } catch (err) {
        // Non-fatal: anomaly detection failure should never break normal alerting
        this.logger.warn(`[AnomalyDetection] Check failed for monitor ${monitor.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // ──────────────────────────────────────────────────────────────────────────────────

    // ── Fixed Latency Alert Threshold ────────────────────────────────────────────────
    // If latencyAlertMs is configured and the check succeeded but latency exceeded the
    // threshold, upgrade the level to yellow and update the message accordingly.
    // This runs after anomaly detection; anomaly yellow takes priority if both fire.
    const monitorWithLatencyAlert = monitor as typeof monitor & { latencyAlertMs?: number | null };
    if (
      anomalyLevel === 'green' &&
      created.ok &&
      typeof monitorWithLatencyAlert.latencyAlertMs === 'number' &&
      monitorWithLatencyAlert.latencyAlertMs > 0 &&
      created.latencyMs !== null &&
      created.latencyMs > monitorWithLatencyAlert.latencyAlertMs
    ) {
      anomalyLevel = 'yellow';
      anomalyMessage = `Slow response: ${created.latencyMs}ms exceeds latency threshold of ${monitorWithLatencyAlert.latencyAlertMs}ms. ${created.message}`;
      this.logger.warn(
        `[LatencyAlert] Monitor ${monitor.id} (${monitor.name}) latency ${created.latencyMs}ms exceeds threshold ${monitorWithLatencyAlert.latencyAlertMs}ms`,
      );
    }
    // ──────────────────────────────────────────────────────────────────────────────────

    const run: MonitorRun = {
      id: created.id,
      userId: created.userId,
      monitorId: created.monitorId,
      monitorType: monitor.type,
      checkedAt: created.checkedAt.toISOString(),
      ok: created.ok,
      statusCode: created.status,
      latencyMs: created.latencyMs,
      message: anomalyMessage,
      level: anomalyLevel as 'green' | 'yellow' | 'red',
    };

    const levelChanged = !prev || prev.level !== run.level;
    const wasUnhealthy = prev && (prev.level === 'red' || prev.level === 'yellow');
    const isRecovery = run.level === 'green' && wasUnhealthy && levelChanged;

    // ── Flap Detection ─────────────────────────────────────────────────────────────────
    // A monitor is "flapping" when it rapidly alternates between healthy and unhealthy states.
    // Detection uses configurable window size and threshold per monitor.
    // When the ratio of state transitions ≥ flapThreshold → flapping → suppress noise alerts.
    // Flapping state clears automatically when the monitor stabilizes.
    const flapWindow = monitor.flapWindow ?? 10;
    const flapThreshold = monitor.flapThreshold ?? 0.5;
    const flapWindowRuns = [{ level: run.level }, ...recentRuns.slice(0, flapWindow - 1)];
    let stateChanges = 0;
    for (let i = 1; i < flapWindowRuns.length; i++) {
      const isUnhealthy = (l: string) => l === 'red' || l === 'yellow';
      const prevHealthy = !isUnhealthy(flapWindowRuns[i].level);
      const currHealthy = !isUnhealthy(flapWindowRuns[i - 1].level);
      if (prevHealthy !== currHealthy) stateChanges++;
    }

    const minRuns = Math.ceil(flapWindow / 2);
    const transitionRatio = flapWindowRuns.length > 1 ? stateChanges / (flapWindowRuns.length - 1) : 0;
    const nowFlapping = (monitor.flapDetectionEnabled ?? true)
      && flapWindowRuns.length >= minRuns
      && transitionRatio >= flapThreshold;
    const wasFlapping = monitor.isFlapping ?? false;
    const flapStateChanged = nowFlapping !== wasFlapping;

    // Persist flap state change to DB (non-blocking, non-critical)
    if (flapStateChanged) {
      const now = new Date();
      this.prisma.monitor
        .update({
          where: { id: monitor.id },
          data: {
            isFlapping: nowFlapping,
            flapAlertedAt: nowFlapping ? now : null,
          },
        })
        .catch((err: Error) =>
          this.logger.warn(`[FlapDetection] Failed to persist flap state for monitor ${monitor.id}: ${err.message}`),
        );

      if (nowFlapping) {
        this.logger.warn(
          `[FlapDetection] Monitor ${monitor.id} (${monitor.name}) is now FLAPPING (${stateChanges} state changes in last ${flapWindowRuns.length} runs)`,
        );
      } else {
        this.logger.log(
          `[FlapDetection] Monitor ${monitor.id} (${monitor.name}) is no longer flapping — stable`,
        );
      }
    }
    // ──────────────────────────────────────────────────────────────────────────────────

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

    // Flap suppression: when a monitor is flapping, suppress failure alerts to avoid noise.
    // Only send a "flapping started" notification once (when flapStateChanged && nowFlapping).
    // Recoveries are always sent so users know when a flapping monitor stabilizes.
    const flapSuppressed = nowFlapping && !flapStateChanged && (monitor.flapDetectionEnabled ?? true);

    // Call notifyMonitorFailure for every unhealthy run (after confirmation threshold)
    // AND for recoveries. The alerts service's notifyOn filter decides per-channel
    // whether to actually dispatch (ON_CHANGE, ALWAYS, FIRST_ONLY, DAILY_DIGEST, etc.)
    if (!dependencySuppressed && !flapSuppressed && (shouldAlertFailure || (isCurrentUnhealthy && consecutiveFailures >= confirmations))) {
      await this.alerts.notifyMonitorFailure(monitor, run, alertContext);
    } else if (isRecovery) {
      await this.alerts.notifyMonitorFailure(monitor, run, alertContext);
    } else if (nowFlapping && flapStateChanged) {
      // Notify once that flapping has started — use the existing failure path with flap context
      const flapContext = { ...alertContext, isFlapping: true };
      await this.alerts.notifyMonitorFailure(monitor, run, flapContext).catch((err: Error) =>
        this.logger.warn(`[FlapDetection] Flap notification failed: ${err.message}`),
      );
    }

    // Auto-incident: create incident when monitor goes down, resolve when it recovers
    if (monitor.autoIncident) {
      await this.handleAutoIncident(monitor, run, shouldAlertFailure, isRecovery, consecutiveFailures, confirmations);
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

    // ── Per-monitor Status Webhook ────────────────────────────────────────────────────
    // When statusWebhookUrl is set on the monitor, fire a POST to that URL on every
    // status change (levelChanged). Includes HMAC-SHA256 signature when statusWebhookSecret
    // is configured. Useful for CI/CD integrations, custom dashboards, and automation.
    if (levelChanged) {
      const monitorWithWebhook = monitor as typeof monitor & {
        statusWebhookUrl?: string | null;
        statusWebhookSecret?: string | null;
      };
      if (monitorWithWebhook.statusWebhookUrl) {
        void this.fireMonitorStatusWebhook(
          monitorWithWebhook.statusWebhookUrl,
          monitorWithWebhook.statusWebhookSecret ?? null,
          monitor,
          run,
          prev?.level ?? null,
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────────────────────

    return run;
  }

  /**
   * Fires a per-monitor status webhook when the monitor's level changes.
   * Posts a JSON payload to statusWebhookUrl with monitor details and the level change.
   * If statusWebhookSecret is set, adds an X-PulseDock-Signature header (HMAC-SHA256).
   *
   * @param url - The webhook URL to POST to
   * @param secret - Optional HMAC-SHA256 signing secret
   * @param monitor - The monitor that changed state
   * @param run - The current check result
   * @param previousLevel - The previous run's level (null if first run)
   */
  private async fireMonitorStatusWebhook(
    url: string,
    secret: string | null,
    monitor: Monitor,
    run: MonitorRun,
    previousLevel: string | null,
  ): Promise<void> {
    try {
      const payload = {
        event: 'monitor.status_changed',
        monitorId: monitor.id,
        monitorName: monitor.name,
        monitorType: monitor.type,
        target: monitor.target,
        level: run.level,
        previousLevel,
        ok: run.ok,
        latencyMs: run.latencyMs,
        message: run.message,
        checkedAt: new Date(run.checkedAt).toISOString(),
      };
      const body = JSON.stringify(payload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'PulseDock-Monitor/1.0',
        'X-PulseDock-Event': 'monitor.status_changed',
      };

      if (secret) {
        const { createHmac } = await import('node:crypto');
        const sig = createHmac('sha256', secret).update(body).digest('hex');
        headers['X-PulseDock-Signature'] = `sha256=${sig}`;
      }

      const fetchImpl = globalThis.fetch;
      if (typeof fetchImpl === 'function') {
        const resp = await (fetchImpl as typeof fetch)(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
        if (!resp.ok) {
          this.logger.warn(`[StatusWebhook] Monitor ${monitor.id} webhook returned ${resp.status} for ${url}`);
        }
      }
    } catch (err) {
      this.logger.warn(
        `[StatusWebhook] Failed to fire webhook for monitor ${monitor.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Computes the current overall status of a published status page and fires its
   /**
   * Handles auto-incident lifecycle for a monitor check result.
   * Creates an incident when a monitor first crosses the failure threshold,
   * and auto-resolves the incident when the monitor recovers.
   *
   * @param monitor - The monitor (must have autoIncident=true)
   * @param run - The current check result
   * @param shouldAlertFailure - True if this run crosses the confirmation threshold for failure
   * @param isRecovery - True if monitor just recovered to green
   * @param consecutiveFailures - Number of consecutive failures including this one
   * @param confirmations - The monitor's confirmation threshold
   */
  private async handleAutoIncident(
    monitor: Monitor,
    run: MonitorRun,
    shouldAlertFailure: boolean,
    isRecovery: boolean,
    consecutiveFailures: number,
    confirmations: number,
  ): Promise<void> {
    try {
      const isCurrentUnhealthy = run.level === 'red' || run.level === 'yellow';

      if (isCurrentUnhealthy && !monitor.activeAutoIncidentId && consecutiveFailures >= confirmations) {
        // Monitor just went down and no active incident — create one
        const severity = (monitor.autoIncidentSeverity as string) ?? 'MEDIUM';
        const incident = await this.prisma.incident.create({
          data: {
            userId: monitor.userId,
            title: `${monitor.name} is ${run.level === 'red' ? 'down' : 'degraded'}`,
            description: `Automatically created by PulseDock monitoring.\n\nCheck message: ${run.message}\n\nMonitor: ${monitor.target}`,
            autoCreated: true,
            status: 'INVESTIGATING',
            severity: severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
            updates: {
              create: {
                body: `Monitor check failed: ${run.message}`,
                status: 'INVESTIGATING',
              },
            },
            monitors: {
              create: {
                monitorId: monitor.id,
              },
            },
          },
        });

        await this.prisma.monitor.update({
          where: { id: monitor.id },
          data: { activeAutoIncidentId: incident.id },
        });

        this.logger.log(`[AutoIncident] Created incident ${incident.id} for monitor ${monitor.id} (${monitor.name})`);
      } else if (isRecovery && monitor.activeAutoIncidentId) {
        // Monitor recovered — auto-resolve the open incident
        const incidentId = monitor.activeAutoIncidentId;
        const now = new Date();

        await this.prisma.incident.update({
          where: { id: incidentId },
          data: {
            status: 'RESOLVED',
            resolvedAt: now,
            updates: {
              create: {
                body: `Monitor recovered automatically. Latency: ${run.latencyMs != null ? `${run.latencyMs}ms` : 'N/A'}`,
                status: 'RESOLVED',
              },
            },
          },
        });

        await this.prisma.monitor.update({
          where: { id: monitor.id },
          data: { activeAutoIncidentId: null },
        });

        this.logger.log(`[AutoIncident] Resolved incident ${incidentId} for monitor ${monitor.id} (${monitor.name})`);
      }
    } catch (err) {
      // Non-fatal: auto-incident errors should never break the check pipeline
      this.logger.warn(`[AutoIncident] Failed for monitor ${monitor.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
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
