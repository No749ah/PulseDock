import type { MonitorCheckPlugin } from '../plugin.contracts';

/**
 * Plugin: Response Time Assertion
 *
 * Performs an HTTP request and marks the monitor degraded (yellow) or down (red)
 * when the response time exceeds configurable thresholds. Ideal for SLA enforcement
 * on latency-sensitive endpoints.
 */
export const responseTimePlugin: MonitorCheckPlugin = {
  id: 'http.response-time',
  displayName: 'Response Time Assertion',
  description: 'Marks the monitor degraded or down when the HTTP response time exceeds configured thresholds.',
  supportedMonitorTypes: ['HTTP'],
  configFields: [
    {
      key: 'warnMs',
      label: 'Warning threshold (ms)',
      type: 'number',
      required: false,
      placeholder: '1000',
      helpText: 'Response time above this value marks the monitor as degraded (yellow).',
    },
    {
      key: 'criticalMs',
      label: 'Critical threshold (ms)',
      type: 'number',
      required: false,
      placeholder: '3000',
      helpText: 'Response time above this value marks the monitor as down (red).',
    },
  ],
  async run(context) {
    const warnMs = Number(context.config.warnMs ?? 0);
    const criticalMs = Number(context.config.criticalMs ?? 0);

    if (criticalMs <= 0 && warnMs <= 0) {
      return { ok: false, statusCode: 400, latencyMs: null, message: 'At least one threshold (warnMs or criticalMs) is required', level: 'red' };
    }

    const started = Date.now();
    try {
      const response = await fetch(context.monitor.target, {
        signal: AbortSignal.timeout(context.monitor.timeoutMs),
      });
      const latencyMs = Date.now() - started;

      if (criticalMs > 0 && latencyMs > criticalMs) {
        return {
          ok: false,
          statusCode: response.status,
          latencyMs,
          message: `Response time ${latencyMs}ms exceeds critical threshold of ${criticalMs}ms`,
          level: 'red',
        };
      }
      if (warnMs > 0 && latencyMs > warnMs) {
        return {
          ok: true,
          statusCode: response.status,
          latencyMs,
          message: `Response time ${latencyMs}ms exceeds warning threshold of ${warnMs}ms`,
          level: 'yellow',
        };
      }
      return {
        ok: response.ok,
        statusCode: response.status,
        latencyMs,
        message: `Response time ${latencyMs}ms within thresholds`,
        level: response.ok ? 'green' : 'red',
      };
    } catch (error) {
      return {
        ok: false,
        statusCode: 0,
        latencyMs: Date.now() - started,
        message: error instanceof Error ? error.message : 'Request failed',
        level: 'red',
      };
    }
  },
};
