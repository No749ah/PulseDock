import type { MonitorCheckPlugin } from '../plugin.contracts';

/**
 * Plugin: Redirect Chain Checker
 *
 * Follows HTTP redirects and asserts that the final URL matches a configured
 * expected URL (exact or prefix). Also optionally asserts the number of hops
 * and the final HTTP status code. Useful for verifying that:
 * - HTTP → HTTPS redirect is in place
 * - www → non-www (or vice versa) redirect works
 * - URL aliases resolve correctly
 * - No redirect loops or excessive chains
 */
export const redirectCheckPlugin: MonitorCheckPlugin = {
  id: 'http.redirect-check',
  displayName: 'Redirect Chain Checker',
  description:
    'Follows HTTP redirects and verifies the final URL matches an expected destination. Useful for HTTP→HTTPS and www→non-www checks.',
  supportedMonitorTypes: ['HTTP'],
  configFields: [
    {
      key: 'expectedFinalUrl',
      label: 'Expected final URL',
      type: 'text',
      required: false,
      placeholder: 'https://example.com/',
      helpText:
        'The final URL after all redirects must start with this value. Leave blank to just count hops.',
    },
    {
      key: 'maxRedirects',
      label: 'Max redirect hops',
      type: 'number',
      required: false,
      placeholder: '5',
      helpText:
        'Fail if the chain exceeds this many redirects (default: 10).',
    },
    {
      key: 'requireHttps',
      label: 'Require HTTPS final URL',
      type: 'boolean',
      required: false,
      helpText: 'When enabled, the final URL must use HTTPS.',
    },
  ],
  async run(context) {
    const expectedFinalUrl = String(context.config.expectedFinalUrl ?? '').trim();
    const maxRedirects = Number(context.config.maxRedirects ?? 10);
    const requireHttps = context.config.requireHttps === true || context.config.requireHttps === 'true';

    const started = Date.now();
    const visited: string[] = [];
    let currentUrl = context.monitor.target;

    try {
      // Manually follow redirects to track chain
      while (true) {
        if (visited.length > maxRedirects) {
          return {
            ok: false,
            statusCode: 0,
            latencyMs: Date.now() - started,
            message: `Redirect chain exceeded ${maxRedirects} hops (visited: ${visited.join(' → ')})`,
            level: 'red',
          };
        }

        const response = await fetch(currentUrl, {
          redirect: 'manual',
          signal: AbortSignal.timeout(context.monitor.timeoutMs),
        });

        visited.push(currentUrl);

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) {
            return {
              ok: false,
              statusCode: response.status,
              latencyMs: Date.now() - started,
              message: `Redirect ${response.status} with no Location header at ${currentUrl}`,
              level: 'red',
            };
          }
          // Resolve relative redirects
          try {
            currentUrl = new URL(location, currentUrl).href;
          } catch {
            currentUrl = location;
          }
          continue;
        }

        // Final response
        const latencyMs = Date.now() - started;
        const hops = visited.length - 1;
        const finalUrl = currentUrl;

        if (requireHttps && !finalUrl.startsWith('https://')) {
          return {
            ok: false,
            statusCode: response.status,
            latencyMs,
            message: `Final URL "${finalUrl}" does not use HTTPS`,
            level: 'red',
          };
        }

        if (expectedFinalUrl && !finalUrl.startsWith(expectedFinalUrl)) {
          return {
            ok: false,
            statusCode: response.status,
            latencyMs,
            message: `Final URL "${finalUrl}" does not match expected "${expectedFinalUrl}" (${hops} hop${hops !== 1 ? 's' : ''})`,
            level: 'red',
          };
        }

        const detail = hops === 0
          ? 'No redirects (direct)'
          : `${hops} hop${hops !== 1 ? 's' : ''} → ${finalUrl}`;

        return {
          ok: response.ok,
          statusCode: response.status,
          latencyMs,
          message: detail,
          level: response.ok ? 'green' : 'red',
        };
      }
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
