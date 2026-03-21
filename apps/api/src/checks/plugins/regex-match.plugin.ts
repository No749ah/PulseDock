import type { MonitorCheckPlugin } from '../plugin.contracts';

/**
 * Plugin: HTTP Regex Matcher
 *
 * Runs an HTTP request and checks whether the response body matches
 * a user-supplied regular expression. Useful when the expected value
 * is dynamic or requires pattern matching (e.g. version numbers).
 */
export const regexMatchPlugin: MonitorCheckPlugin = {
  id: 'http.regex-match',
  displayName: 'HTTP Regex Matcher',
  description: 'Marks the monitor healthy when the HTTP response body matches a regular expression.',
  supportedMonitorTypes: ['HTTP'],
  configFields: [
    {
      key: 'pattern',
      label: 'Regex pattern',
      type: 'text',
      required: true,
      placeholder: 'v\\d+\\.\\d+\\.\\d+',
      helpText: 'ECMAScript regular expression (without slashes). Case-insensitive flag added automatically.',
    },
    {
      key: 'expectedMatch',
      label: 'Expected capture group (optional)',
      type: 'text',
      required: false,
      placeholder: '1.2.3',
      helpText: 'When set, the full match (or first capture group) must equal this value.',
    },
  ],
  async run(context) {
    const rawPattern = String(context.config.pattern ?? '').trim();
    if (!rawPattern) {
      return { ok: false, statusCode: 400, latencyMs: null, message: 'pattern is required in monitor config', level: 'red' };
    }

    let regex: RegExp;
    try {
      regex = new RegExp(rawPattern, 'i');
    } catch {
      return { ok: false, statusCode: 400, latencyMs: null, message: `Invalid regex: ${rawPattern}`, level: 'red' };
    }

    const expectedMatch = String(context.config.expectedMatch ?? '').trim();
    const started = Date.now();
    try {
      const response = await fetch(context.monitor.target, {
        signal: AbortSignal.timeout(context.monitor.timeoutMs),
      });
      const body = await response.text();
      const match = body.match(regex);
      const found = match !== null;

      if (!found) {
        return {
          ok: false,
          statusCode: response.status,
          latencyMs: Date.now() - started,
          message: `Pattern /${rawPattern}/i not found in response`,
          level: 'red',
        };
      }

      if (expectedMatch) {
        const actual = match[1] ?? match[0];
        const valueMatches = actual === expectedMatch;
        return {
          ok: response.ok && valueMatches,
          statusCode: response.status,
          latencyMs: Date.now() - started,
          message: valueMatches
            ? `Pattern matched: "${actual}"`
            : `Pattern matched but value "${actual}" !== expected "${expectedMatch}"`,
          level: response.ok && valueMatches ? 'green' : 'red',
        };
      }

      return {
        ok: response.ok,
        statusCode: response.status,
        latencyMs: Date.now() - started,
        message: `Pattern matched: "${match[0]}"`,
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
