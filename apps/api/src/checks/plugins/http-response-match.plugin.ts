import type { MonitorCheckPlugin } from '../plugin.contracts';

export const httpResponseMatchPlugin: MonitorCheckPlugin = {
  id: 'http.response-match',
  displayName: 'HTTP Response Matcher',
  supportedMonitorTypes: ['HTTP'],
  async run(context) {
    const expectedText = String(context.config.expectedText ?? '').trim();
    if (!expectedText) {
      return {
        ok: false,
        statusCode: 400,
        latencyMs: null,
        message: 'expectedText is required in monitor config',
        level: 'red',
      };
    }

    const started = Date.now();
    try {
      const response = await fetch(context.monitor.target);
      const body = await response.text();
      const matched = body.includes(expectedText);
      return {
        ok: response.ok && matched,
        statusCode: response.status,
        latencyMs: Date.now() - started,
        message: matched
          ? `Matched expected text \"${expectedText}\"`
          : `Expected text \"${expectedText}\" not found`,
        level: response.ok && matched ? 'green' : 'red',
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
