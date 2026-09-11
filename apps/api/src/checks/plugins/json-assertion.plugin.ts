import type { MonitorCheckPlugin } from '../plugin.contracts';
import { extractByPath } from '../version-extractor.util';

/**
 * Plugin: JSON Assertion
 *
 * Fetches a JSON API endpoint, extracts a value at a dot-notation path,
 * and compares it against an expected value. Fails gracefully when the
 * endpoint is not JSON or the path is not found.
 *
 * @example
 *   path: "status"  expected: "ok"
 *   path: "data.version"  expected: "1.2.3"
 */
export const jsonAssertionPlugin: MonitorCheckPlugin = {
  id: 'http.json-assertion',
  displayName: 'JSON Assertion',
  description: 'Fetches a JSON endpoint and asserts a field value matches the expected string.',
  supportedMonitorTypes: ['HTTP'],
  configFields: [
    {
      key: 'path',
      label: 'JSON path',
      type: 'text',
      required: true,
      placeholder: 'status',
      helpText: 'Dot-notation path to the field, e.g. "data.health.status".',
    },
    {
      key: 'expected',
      label: 'Expected value',
      type: 'text',
      required: true,
      placeholder: 'ok',
      helpText: 'The extracted value must equal this string (case-sensitive).',
    },
    {
      key: 'warnOn',
      label: 'Warn value (optional)',
      type: 'text',
      required: false,
      placeholder: 'degraded',
      helpText: 'When the extracted value equals this string, mark the monitor as degraded (yellow) instead of down.',
    },
  ],
  async run(context) {
    const path = String(context.config.path ?? '').trim();
    const expected = String(context.config.expected ?? '').trim();
    const warnOn = String(context.config.warnOn ?? '').trim();

    if (!path || !expected) {
      return { ok: false, statusCode: 400, latencyMs: null, message: 'path and expected are required', level: 'red' };
    }

    const started = Date.now();
    try {
      const response = await fetch(context.monitor.target, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(context.monitor.timeoutMs),
      });
      const latencyMs = Date.now() - started;

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return {
          ok: false,
          statusCode: response.status,
          latencyMs,
          message: 'Response is not valid JSON',
          level: 'red',
        };
      }

      const actual = extractByPath(body, path);
      if (actual === undefined || actual === null) {
        return {
          ok: false,
          statusCode: response.status,
          latencyMs,
          message: `Path "${path}" not found in response`,
          level: 'red',
        };
      }

      const actualStr = String(actual);
      if (actualStr === expected) {
        return {
          ok: true,
          statusCode: response.status,
          latencyMs,
          message: `"${path}" = "${actualStr}" ✓`,
          level: 'green',
        };
      }
      if (warnOn && actualStr === warnOn) {
        return {
          ok: false,
          statusCode: response.status,
          latencyMs,
          message: `"${path}" = "${actualStr}" (degraded)`,
          level: 'yellow',
        };
      }
      return {
        ok: false,
        statusCode: response.status,
        latencyMs,
        message: `"${path}" = "${actualStr}", expected "${expected}"`,
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
