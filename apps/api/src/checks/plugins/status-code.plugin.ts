import type { MonitorCheckPlugin } from '../plugin.contracts';

/**
 * Plugin: HTTP Status Code Assertion
 *
 * Checks that the HTTP response status code is one of a list of acceptable codes.
 * Useful for monitoring endpoints that return non-200 codes intentionally
 * (e.g. 301 redirects, 204 no-content, 401 auth walls).
 */
export const statusCodePlugin: MonitorCheckPlugin = {
  id: 'http.status-code',
  displayName: 'HTTP Status Code Assertion',
  description: 'Marks the monitor healthy only when the HTTP response code matches an allowed list.',
  supportedMonitorTypes: ['HTTP'],
  configFields: [
    {
      key: 'allowedCodes',
      label: 'Allowed status codes',
      type: 'text',
      required: true,
      placeholder: '200,201,204',
      helpText: 'Comma-separated list of acceptable HTTP status codes.',
    },
    {
      key: 'warnCodes',
      label: 'Warning codes (optional)',
      type: 'text',
      required: false,
      placeholder: '301,302',
      helpText: 'Codes that produce a degraded (yellow) result instead of down (red).',
    },
  ],
  async run(context) {
    const rawAllowed = String(context.config.allowedCodes ?? '').trim();
    if (!rawAllowed) {
      return { ok: false, statusCode: 400, latencyMs: null, message: 'allowedCodes is required', level: 'red' };
    }

    const allowedCodes = rawAllowed.split(',').map((s) => Number(s.trim())).filter(Boolean);
    const warnCodes = String(context.config.warnCodes ?? '').split(',').map((s) => Number(s.trim())).filter(Boolean);

    const started = Date.now();
    try {
      const response = await fetch(context.monitor.target, {
        redirect: 'manual',
        signal: AbortSignal.timeout(context.monitor.timeoutMs),
      });
      const latencyMs = Date.now() - started;

      if (allowedCodes.includes(response.status)) {
        return { ok: true, statusCode: response.status, latencyMs, message: `Status ${response.status} is allowed`, level: 'green' };
      }
      if (warnCodes.includes(response.status)) {
        return { ok: false, statusCode: response.status, latencyMs, message: `Status ${response.status} is a warning code`, level: 'yellow' };
      }
      return {
        ok: false,
        statusCode: response.status,
        latencyMs,
        message: `Status ${response.status} not in allowed list [${allowedCodes.join(', ')}]`,
        level: 'red',
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
