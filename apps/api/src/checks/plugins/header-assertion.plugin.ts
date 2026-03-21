import type { MonitorCheckPlugin } from '../plugin.contracts';

/**
 * Plugin: HTTP Header Assertion
 *
 * Makes an HTTP request and asserts that a specific response header exists and
 * optionally matches an expected value or pattern. Useful for verifying
 * security headers (Content-Security-Policy, X-Frame-Options, HSTS) or
 * custom application headers (X-API-Version, Cache-Control, etc.).
 */
export const headerAssertionPlugin: MonitorCheckPlugin = {
  id: 'http.header-assertion',
  displayName: 'HTTP Header Assertion',
  description:
    'Verifies that a specific HTTP response header is present and optionally matches an expected value.',
  supportedMonitorTypes: ['HTTP'],
  configFields: [
    {
      key: 'headerName',
      label: 'Header name',
      type: 'text',
      required: true,
      placeholder: 'Content-Security-Policy',
      helpText: 'Response header to check (case-insensitive).',
    },
    {
      key: 'expectedValue',
      label: 'Expected value (optional)',
      type: 'text',
      required: false,
      placeholder: 'default-src',
      helpText:
        "If provided, the header value must contain this substring. Leave blank to only assert the header exists.",
    },
    {
      key: 'failOnMissing',
      label: 'Fail when header is missing',
      type: 'boolean',
      required: false,
      helpText: "When enabled, monitor goes red if the header is absent. When disabled, it goes yellow.",
    },
  ],
  async run(context) {
    const headerName = String(context.config.headerName ?? '').trim().toLowerCase();
    const expectedValue = String(context.config.expectedValue ?? '').trim();
    const failOnMissing = context.config.failOnMissing === true || context.config.failOnMissing === 'true';

    if (!headerName) {
      return {
        ok: false,
        statusCode: 400,
        latencyMs: null,
        message: 'headerName is required in monitor config',
        level: 'red',
      };
    }

    const started = Date.now();
    try {
      const response = await fetch(context.monitor.target, {
        signal: AbortSignal.timeout(context.monitor.timeoutMs),
      });
      const latencyMs = Date.now() - started;
      const actualValue = response.headers.get(headerName);

      if (actualValue == null) {
        return {
          ok: !failOnMissing,
          statusCode: response.status,
          latencyMs,
          message: `Header "${headerName}" not present in response`,
          level: failOnMissing ? 'red' : 'yellow',
        };
      }

      if (expectedValue && !actualValue.includes(expectedValue)) {
        return {
          ok: false,
          statusCode: response.status,
          latencyMs,
          message: `Header "${headerName}" value "${actualValue}" does not contain expected "${expectedValue}"`,
          level: 'red',
        };
      }

      const detail = expectedValue
        ? `contains "${expectedValue}"`
        : `present ("${actualValue.slice(0, 60)}${actualValue.length > 60 ? '…' : ''}")`;

      return {
        ok: true,
        statusCode: response.status,
        latencyMs,
        message: `Header "${headerName}" ${detail}`,
        level: 'green',
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
