import { Injectable } from '@nestjs/common';

const METRIC_DEFS: Record<string, { help: string; type: 'counter' | 'gauge' }> = {
  requestsTotal: { help: 'Total HTTP requests handled by the API', type: 'counter' },
  errorsTotal: { help: 'Total HTTP errors (4xx/5xx) returned by the API', type: 'counter' },
  authLoginFailed: { help: 'Total failed login attempts', type: 'counter' },
  alertsSent: { help: 'Total alert notifications successfully dispatched', type: 'counter' },
  alertsFailed: { help: 'Total alert notifications that failed to dispatch', type: 'counter' },
};

/**
 * In-process metrics service that tracks lightweight counters for key events.
 *
 * Counters are stored in memory and reset on process restart (i.e. they are not
 * persisted). The `/v1/admin/metrics` endpoint exposes a JSON snapshot, and the
 * dedicated `/metrics` endpoint exposes the same data as Prometheus text format
 * so it can be scraped by a Prometheus server or Grafana Alloy.
 *
 * For high-cardinality or persistent metrics, consider shipping to an external
 * TSDB via OpenTelemetry rather than extending this service.
 */
@Injectable()
export class MetricsService {
  private readonly counters = {
    requestsTotal: 0,
    errorsTotal: 0,
    authLoginFailed: 0,
    alertsSent: 0,
    alertsFailed: 0,
  };

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
   * Renders metrics in Prometheus text exposition format (version 0.0.4).
   * Content-Type: text/plain; version=0.0.4; charset=utf-8
   */
  prometheusText(): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(this.counters)) {
      const def = METRIC_DEFS[key];
      const name = `pulsedock_${key}`;
      lines.push(`# HELP ${name} ${def.help}`);
      lines.push(`# TYPE ${name} ${def.type}`);
      lines.push(`${name} ${value}`);
    }

    // Add process uptime as a gauge
    lines.push('# HELP pulsedock_process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE pulsedock_process_uptime_seconds gauge');
    lines.push(`pulsedock_process_uptime_seconds ${Math.floor(process.uptime())}`);

    // Trailing newline required by Prometheus text format
    lines.push('');
    return lines.join('\n');
  }
}
