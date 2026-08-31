import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import type { PrismaService } from './prisma.service';

const METRIC_DEFS: Record<string, { help: string; type: 'counter' | 'gauge'; prometheusName: string }> = {
  requestsTotal: { help: 'Total HTTP requests handled by the API', type: 'counter', prometheusName: 'pulsedock_requests_total' },
  errorsTotal: { help: 'Total HTTP errors (4xx/5xx) returned by the API', type: 'counter', prometheusName: 'pulsedock_errors_total' },
  authLoginFailed: { help: 'Total failed login attempts', type: 'counter', prometheusName: 'pulsedock_auth_login_failed_total' },
  alertsSent: { help: 'Total alert notifications successfully dispatched', type: 'counter', prometheusName: 'pulsedock_alerts_sent_total' },
  alertsFailed: { help: 'Total alert notifications that failed to dispatch', type: 'counter', prometheusName: 'pulsedock_alerts_failed_total' },
};

/** Histogram buckets for monitor check duration (in ms). Wider range than HTTP requests. */
const CHECK_DURATION_BUCKETS = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000];

/** Default histogram buckets (in ms) for HTTP request duration. */
const HTTP_DURATION_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/** Sanitize a Prometheus label value by escaping backslash, double-quote, and newline. */
function sanitizeLabel(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * In-process metrics service that tracks lightweight counters for key events.
 *
 * Counters are stored in memory and reset on process restart (i.e. they are not
 * persisted). The `/v1/admin/metrics` endpoint exposes a JSON snapshot, and the
 * dedicated `/metrics/prometheus` endpoint exposes the same data as Prometheus text
 * format so it can be scraped by a Prometheus server or Grafana Alloy.
 *
 * For high-cardinality or persistent metrics, consider shipping to an external
 * TSDB via OpenTelemetry rather than extending this service.
 */
@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  /** Event loop delay histogram (20ms resolution). */
  private eld: IntervalHistogram | null = null;

  onModuleInit() {
    try {
      this.eld = monitorEventLoopDelay({ resolution: 20 });
      this.eld.enable();
    } catch {
      // Graceful fallback if perf_hooks unavailable
      this.eld = null;
    }
  }

  onModuleDestroy() {
    this.eld?.disable();
  }

  private readonly counters = {
    requestsTotal: 0,
    errorsTotal: 0,
    authLoginFailed: 0,
    alertsSent: 0,
    alertsFailed: 0,
  };

  /** HTTP request duration histogram buckets: bucket → count of requests ≤ bucket ms. */
  private readonly httpDurationBuckets: Map<number, number> = new Map(
    HTTP_DURATION_BUCKETS.map((b) => [b, 0]),
  );
  private httpDurationSum = 0;
  private httpDurationCount = 0;

  /**
   * Monitor check execution counters by type and result.
   * Key format: `{type}:{result}` where result is 'ok' or 'fail'.
   */
  private readonly checkExecutionCounts = new Map<string, number>();

  /** Monitor check duration histogram (keyed by monitor type). */
  private readonly checkDurationBuckets = new Map<string, Map<number, number>>();
  private readonly checkDurationSums = new Map<string, number>();
  private readonly checkDurationCounts = new Map<string, number>();

  /** Number of monitor checks currently in-flight. */
  private checksInFlight = 0;

  /**
   * Increments a named counter.
   *
   * @param key - Counter name (must be a key of the counters map)
   * @param by  - Amount to increment by (default: 1)
   */
  inc<K extends keyof typeof this.counters>(key: K, by = 1) {
    this.counters[key] += by;
  }

  /**
   * Records a completed monitor check execution.
   *
   * @param type - Monitor type (HTTP, TCP, DNS, etc.)
   * @param ok - Whether the check succeeded
   * @param durationMs - Check duration in milliseconds
   */
  observeCheckExecution(type: string, ok: boolean, durationMs: number) {
    const key = `${type}:${ok ? 'ok' : 'fail'}`;
    this.checkExecutionCounts.set(key, (this.checkExecutionCounts.get(key) ?? 0) + 1);

    // Update check duration histogram for this type
    const normalizedType = type.toLowerCase();
    if (!this.checkDurationBuckets.has(normalizedType)) {
      this.checkDurationBuckets.set(normalizedType, new Map(CHECK_DURATION_BUCKETS.map((b) => [b, 0])));
      this.checkDurationSums.set(normalizedType, 0);
      this.checkDurationCounts.set(normalizedType, 0);
    }
    this.checkDurationSums.set(normalizedType, (this.checkDurationSums.get(normalizedType) ?? 0) + durationMs);
    this.checkDurationCounts.set(normalizedType, (this.checkDurationCounts.get(normalizedType) ?? 0) + 1);
    const buckets = this.checkDurationBuckets.get(normalizedType)!;
    for (const bucket of CHECK_DURATION_BUCKETS) {
      if (durationMs <= bucket) {
        buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
        return;
      }
    }
    // Exceeds all buckets — counted only in +Inf
  }

  /** Increment in-flight check counter. Call before starting a check. */
  checkStarted() {
    this.checksInFlight++;
  }

  /** Decrement in-flight check counter. Call after a check completes. */
  checkFinished() {
    this.checksInFlight = Math.max(0, this.checksInFlight - 1);
  }

  /**
   * Records an HTTP request duration observation (in milliseconds).
   * Updates the histogram buckets, sum, and count for Prometheus exposition.
   *
   * @param durationMs - Request duration in milliseconds
   */
  observeHttpDuration(durationMs: number) {
    this.httpDurationCount++;
    this.httpDurationSum += durationMs;
    // Increment only the smallest matching bucket; cumulation is done at output time.
    for (const bucket of HTTP_DURATION_BUCKETS) {
      if (durationMs <= bucket) {
        this.httpDurationBuckets.set(bucket, (this.httpDurationBuckets.get(bucket) ?? 0) + 1);
        return;
      }
    }
    // If durationMs > all buckets, it's only counted in +Inf (via httpDurationCount)
  }

  /**
   * Returns a point-in-time JSON snapshot of all counters.
   *
   * @returns Object with all counter values plus an ISO timestamp
   */
  snapshot() {
    return {
      ...this.counters,
      at: new Date().toISOString(),
    };
  }

  /**
   * Renders base metrics (process + counters) in Prometheus text exposition format.
   * Does not include per-monitor data (use `prometheusFullText` for that).
   */
  prometheusText(): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(this.counters)) {
      const def = METRIC_DEFS[key];
      const name = def.prometheusName;
      lines.push(`# HELP ${name} ${def.help}`);
      lines.push(`# TYPE ${name} ${def.type}`);
      lines.push(`${name} ${value}`);
    }

    // HTTP request duration histogram
    lines.push('# HELP pulsedock_http_request_duration_ms HTTP request duration in milliseconds');
    lines.push('# TYPE pulsedock_http_request_duration_ms histogram');
    let cumulative = 0;
    for (const bucket of HTTP_DURATION_BUCKETS) {
      cumulative += this.httpDurationBuckets.get(bucket) ?? 0;
      lines.push(`pulsedock_http_request_duration_ms_bucket{le="${bucket}"} ${cumulative}`);
    }
    lines.push(`pulsedock_http_request_duration_ms_bucket{le="+Inf"} ${this.httpDurationCount}`);
    lines.push(`pulsedock_http_request_duration_ms_sum ${this.httpDurationSum}`);
    lines.push(`pulsedock_http_request_duration_ms_count ${this.httpDurationCount}`);

    // Process metrics
    // Monitor check execution counter
    lines.push('# HELP pulsedock_checks_executed_total Total monitor checks executed');
    lines.push('# TYPE pulsedock_checks_executed_total counter');
    for (const [key, count] of this.checkExecutionCounts.entries()) {
      const [type, result] = key.split(':');
      lines.push(`pulsedock_checks_executed_total{type="${sanitizeLabel(type)}",result="${result}"} ${count}`);
    }

    // In-flight checks gauge
    lines.push('# HELP pulsedock_checks_in_flight Number of monitor checks currently executing');
    lines.push('# TYPE pulsedock_checks_in_flight gauge');
    lines.push(`pulsedock_checks_in_flight ${this.checksInFlight}`);

    // Check duration histogram (per type)
    lines.push('# HELP pulsedock_check_duration_ms Monitor check duration in milliseconds');
    lines.push('# TYPE pulsedock_check_duration_ms histogram');
    for (const [type, buckets] of this.checkDurationBuckets.entries()) {
      let cumulative = 0;
      for (const bucket of CHECK_DURATION_BUCKETS) {
        cumulative += buckets.get(bucket) ?? 0;
        lines.push(`pulsedock_check_duration_ms_bucket{type="${sanitizeLabel(type)}",le="${bucket}"} ${cumulative}`);
      }
      const totalCount = this.checkDurationCounts.get(type) ?? 0;
      lines.push(`pulsedock_check_duration_ms_bucket{type="${sanitizeLabel(type)}",le="+Inf"} ${totalCount}`);
      lines.push(`pulsedock_check_duration_ms_sum{type="${sanitizeLabel(type)}"} ${this.checkDurationSums.get(type) ?? 0}`);
      lines.push(`pulsedock_check_duration_ms_count{type="${sanitizeLabel(type)}"} ${totalCount}`);
    }

    lines.push('# HELP pulsedock_process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE pulsedock_process_uptime_seconds gauge');
    lines.push(`pulsedock_process_uptime_seconds ${Math.floor(process.uptime())}`);

    const mem = process.memoryUsage();
    lines.push('# HELP pulsedock_process_heap_used_bytes Process heap memory used in bytes');
    lines.push('# TYPE pulsedock_process_heap_used_bytes gauge');
    lines.push(`pulsedock_process_heap_used_bytes ${mem.heapUsed}`);

    lines.push('# HELP pulsedock_process_heap_total_bytes Process heap memory total in bytes');
    lines.push('# TYPE pulsedock_process_heap_total_bytes gauge');
    lines.push(`pulsedock_process_heap_total_bytes ${mem.heapTotal}`);

    lines.push('# HELP pulsedock_process_rss_bytes Process resident set size in bytes');
    lines.push('# TYPE pulsedock_process_rss_bytes gauge');
    lines.push(`pulsedock_process_rss_bytes ${mem.rss}`);

    lines.push('# HELP pulsedock_process_external_bytes Process external memory in bytes (C++ objects bound to JS)');
    lines.push('# TYPE pulsedock_process_external_bytes gauge');
    lines.push(`pulsedock_process_external_bytes ${mem.external}`);

    // Event loop delay metrics (from perf_hooks monitorEventLoopDelay)
    if (this.eld) {
      const toMs = (ns: number) => Number((ns / 1e6).toFixed(3));
      lines.push('# HELP pulsedock_eventloop_lag_min_ms Minimum event loop delay in milliseconds');
      lines.push('# TYPE pulsedock_eventloop_lag_min_ms gauge');
      lines.push(`pulsedock_eventloop_lag_min_ms ${toMs(this.eld.min)}`);

      lines.push('# HELP pulsedock_eventloop_lag_max_ms Maximum event loop delay in milliseconds');
      lines.push('# TYPE pulsedock_eventloop_lag_max_ms gauge');
      lines.push(`pulsedock_eventloop_lag_max_ms ${toMs(this.eld.max)}`);

      lines.push('# HELP pulsedock_eventloop_lag_mean_ms Mean event loop delay in milliseconds');
      lines.push('# TYPE pulsedock_eventloop_lag_mean_ms gauge');
      lines.push(`pulsedock_eventloop_lag_mean_ms ${toMs(this.eld.mean)}`);

      lines.push('# HELP pulsedock_eventloop_lag_p50_ms Event loop delay 50th percentile in milliseconds');
      lines.push('# TYPE pulsedock_eventloop_lag_p50_ms gauge');
      lines.push(`pulsedock_eventloop_lag_p50_ms ${toMs(this.eld.percentile(50))}`);

      lines.push('# HELP pulsedock_eventloop_lag_p99_ms Event loop delay 99th percentile in milliseconds');
      lines.push('# TYPE pulsedock_eventloop_lag_p99_ms gauge');
      lines.push(`pulsedock_eventloop_lag_p99_ms ${toMs(this.eld.percentile(99))}`);
    }

    // Active handles and requests (Node.js process health indicators)
    const activeHandles = (process as NodeJS.Process & { _getActiveHandles?: () => unknown[] })._getActiveHandles?.()?.length ?? -1;
    const activeRequests = (process as NodeJS.Process & { _getActiveRequests?: () => unknown[] })._getActiveRequests?.()?.length ?? -1;
    if (activeHandles >= 0) {
      lines.push('# HELP pulsedock_process_active_handles Number of active libuv handles');
      lines.push('# TYPE pulsedock_process_active_handles gauge');
      lines.push(`pulsedock_process_active_handles ${activeHandles}`);
    }
    if (activeRequests >= 0) {
      lines.push('# HELP pulsedock_process_active_requests Number of active libuv requests');
      lines.push('# TYPE pulsedock_process_active_requests gauge');
      lines.push(`pulsedock_process_active_requests ${activeRequests}`);
    }

    // CPU usage (user + system time in seconds since process start)
    const cpuUsage = process.cpuUsage();
    lines.push('# HELP pulsedock_process_cpu_user_seconds_total Total user CPU time in seconds');
    lines.push('# TYPE pulsedock_process_cpu_user_seconds_total counter');
    lines.push(`pulsedock_process_cpu_user_seconds_total ${(cpuUsage.user / 1e6).toFixed(3)}`);

    lines.push('# HELP pulsedock_process_cpu_system_seconds_total Total system CPU time in seconds');
    lines.push('# TYPE pulsedock_process_cpu_system_seconds_total counter');
    lines.push(`pulsedock_process_cpu_system_seconds_total ${(cpuUsage.system / 1e6).toFixed(3)}`);

    // Trailing newline required by Prometheus text format
    lines.push('');
    return lines.join('\n');
  }

  /**
   * Returns full Prometheus text including per-monitor gauges by querying the database.
   *
   * Exports:
   * - `pulsedock_monitor_up` — 1=up, 0=down/degraded, -1=paused
   * - `pulsedock_monitor_latency_ms` — last check latency in milliseconds (-1 if unavailable)
   * - `pulsedock_monitor_uptime_pct_7d` — 7-day rolling uptime percentage (0–100)
   * - `pulsedock_monitor_checks_total` — total check count over last 7 days
   * - `pulsedock_monitors_total` — total monitor count
   * - `pulsedock_monitors_up_total` — monitors currently up
   * - `pulsedock_monitors_down_total` — monitors currently down
   * - `pulsedock_monitors_paused_total` — monitors currently paused
   *
   * @param prisma - PrismaService instance (injected at call site)
   * @returns Prometheus text exposition format string
   */
  async prometheusFullText(prisma: PrismaService): Promise<string> {
    const lines: string[] = [this.prometheusText()];

    // Limit to first 500 monitors to avoid huge payloads
    const monitors = await prisma.monitor.findMany({
      take: 500,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        type: true,
        target: true,
        enabled: true,
        runs: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
          select: {
            ok: true,
            latencyMs: true,
            checkedAt: true,
          },
        },
      },
    });

    // Compute 7-day uptime per monitor in a single batched query
    const since7d = new Date(Date.now() - 7 * 86_400_000);
    const runCounts = await prisma.monitorRun.groupBy({
      by: ['monitorId', 'ok'],
      where: {
        monitorId: { in: monitors.map((m) => m.id) },
        checkedAt: { gte: since7d },
      },
      _count: { _all: true },
    });

    // Build lookup: monitorId → { up: n, total: n }
    const uptimeMap = new Map<string, { up: number; total: number }>();
    for (const row of runCounts) {
      const current = uptimeMap.get(row.monitorId) ?? { up: 0, total: 0 };
      current.total += row._count._all;
      if (row.ok) current.up += row._count._all;
      uptimeMap.set(row.monitorId, current);
    }

    // Summary counters
    let totalUp = 0;
    let totalDown = 0;
    let totalPaused = 0;

    // Per-monitor metric lines
    const monitorUpLines: string[] = [];
    const latencyLines: string[] = [];
    const uptimePctLines: string[] = [];
    const checksTotalLines: string[] = [];

    for (const monitor of monitors) {
      const latestRun = monitor.runs[0] as { ok: boolean; latencyMs: number | null; checkedAt: Date } | undefined;
      const id = sanitizeLabel(monitor.id);
      const name = sanitizeLabel(monitor.name);
      const type = sanitizeLabel(monitor.type);
      const target = sanitizeLabel(monitor.target);

      const labels = `id="${id}",name="${name}",type="${type}",target="${target}"`;
      const nameLabels = `id="${id}",name="${name}"`;

      let upValue: number;
      if (!monitor.enabled) {
        upValue = -1;
        totalPaused++;
      } else if (!latestRun) {
        upValue = -1; // no data yet
        totalPaused++;
      } else if (latestRun.ok) {
        upValue = 1;
        totalUp++;
      } else {
        upValue = 0;
        totalDown++;
      }

      monitorUpLines.push(`pulsedock_monitor_up{${labels}} ${upValue}`);

      const latencyVal = latestRun?.latencyMs ?? -1;
      latencyLines.push(`pulsedock_monitor_latency_ms{${labels}} ${latencyVal}`);

      const counts = uptimeMap.get(monitor.id);
      const uptimePct = counts && counts.total > 0 ? (counts.up / counts.total) * 100 : -1;
      uptimePctLines.push(`pulsedock_monitor_uptime_pct_7d{${nameLabels}} ${uptimePct < 0 ? -1 : Number(uptimePct.toFixed(4))}`);

      const totalChecks = counts?.total ?? 0;
      checksTotalLines.push(`pulsedock_monitor_checks_total{${nameLabels}} ${totalChecks}`);
    }

    // Summary aggregate gauges
    lines.push('# HELP pulsedock_monitors_total Total number of configured monitors');
    lines.push('# TYPE pulsedock_monitors_total gauge');
    lines.push(`pulsedock_monitors_total ${monitors.length}`);

    lines.push('# HELP pulsedock_monitors_up_total Number of monitors currently reporting up status');
    lines.push('# TYPE pulsedock_monitors_up_total gauge');
    lines.push(`pulsedock_monitors_up_total ${totalUp}`);

    lines.push('# HELP pulsedock_monitors_down_total Number of monitors currently reporting down or degraded status');
    lines.push('# TYPE pulsedock_monitors_down_total gauge');
    lines.push(`pulsedock_monitors_down_total ${totalDown}`);

    lines.push('# HELP pulsedock_monitors_paused_total Number of monitors that are paused or have no data');
    lines.push('# TYPE pulsedock_monitors_paused_total gauge');
    lines.push(`pulsedock_monitors_paused_total ${totalPaused}`);

    // Per-monitor metrics
    lines.push('# HELP pulsedock_monitor_up Monitor up status: 1=up, 0=down/degraded, -1=paused/no-data');
    lines.push('# TYPE pulsedock_monitor_up gauge');
    lines.push(...monitorUpLines);

    lines.push('# HELP pulsedock_monitor_latency_ms Last check latency in milliseconds (-1 if unavailable)');
    lines.push('# TYPE pulsedock_monitor_latency_ms gauge');
    lines.push(...latencyLines);

    lines.push('# HELP pulsedock_monitor_uptime_pct_7d 7-day rolling uptime percentage (0-100), -1 if no data');
    lines.push('# TYPE pulsedock_monitor_uptime_pct_7d gauge');
    lines.push(...uptimePctLines);

    lines.push('# HELP pulsedock_monitor_checks_total Total checks run in last 7 days');
    lines.push('# TYPE pulsedock_monitor_checks_total gauge');
    lines.push(...checksTotalLines);

    lines.push('');
    return lines.join('\n');
  }
}
