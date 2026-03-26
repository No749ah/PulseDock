/**
 * HTTP and Browser check runners.
 * Extracted from ChecksService to keep the service focused on orchestration.
 */

import type { PluginExecutionResult } from '../plugin.contracts';
import { extractByPath } from '../version-extractor.util';

export async function runHttpCheck(
  url: string,
  timeoutMs = 5000,
  config: Record<string, unknown> = {},
): Promise<PluginExecutionResult> {
  const started = Date.now();

  const expectedStatus = config['expectedStatus'] as number | number[] | undefined;
  const bodyContains = typeof config['bodyContains'] === 'string' ? config['bodyContains'] : undefined;
  const bodyJsonPath = typeof config['bodyJsonPath'] === 'string' && config['bodyJsonPath'].trim() ? config['bodyJsonPath'].trim() : undefined;
  const bodyJsonPathExpected = typeof config['bodyJsonPathExpected'] === 'string' ? config['bodyJsonPathExpected'].trim() : undefined;
  const responseTimeThresholdMs =
    typeof config['responseTimeThresholdMs'] === 'number' && config['responseTimeThresholdMs'] > 0
      ? config['responseTimeThresholdMs']
      : undefined;
  const needsBody = !!bodyContains || !!bodyJsonPath;
  const httpMethod = (typeof config['httpMethod'] === 'string' ? config['httpMethod'].toUpperCase() : 'GET');
  const safeMethod = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(httpMethod) ? httpMethod : 'GET';
  const requestHeaders: Record<string, string> = {};
  if (config['requestHeaders'] && typeof config['requestHeaders'] === 'object' && !Array.isArray(config['requestHeaders'])) {
    for (const [k, v] of Object.entries(config['requestHeaders'] as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof v === 'string' && k.trim()) {
        requestHeaders[k.trim()] = v;
      }
    }
  }
  const requestBody = typeof config['requestBody'] === 'string' ? config['requestBody'] : undefined;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const fetchOptions: RequestInit = {
      method: safeMethod,
      signal: controller.signal,
      headers: requestHeaders,
    };
    if (requestBody && ['POST', 'PUT', 'PATCH'].includes(safeMethod)) {
      fetchOptions.body = requestBody;
    }
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeout);
    const latencyMs = Date.now() - started;

    let statusOk: boolean;
    if (expectedStatus !== undefined) {
      const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
      statusOk = allowed.includes(response.status);
    } else {
      statusOk = response.ok;
    }

    if (!statusOk) {
      const failBody = await response.text().catch(() => '');
      const expected = expectedStatus ? ` (expected ${Array.isArray(expectedStatus) ? expectedStatus.join('/') : expectedStatus})` : '';
      return {
        ok: false,
        statusCode: response.status,
        latencyMs,
        message: `HTTP ${response.status}${expected}`,
        level: 'red' as const,
        responseBody: failBody ? failBody.slice(0, 500) : null,
      };
    }

    if (needsBody) {
      const body = await response.text().catch(() => '');

      if (bodyContains) {
        const found = body.toLowerCase().includes(bodyContains.toLowerCase());
        if (!found) {
          return {
            ok: false,
            statusCode: response.status,
            latencyMs,
            message: `HTTP ${response.status} — body does not contain "${bodyContains}"`,
            level: 'red' as const,
            responseBody: body.slice(0, 500) || null,
          };
        }
      }

      if (bodyJsonPath) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          return {
            ok: false,
            statusCode: response.status,
            latencyMs,
            message: `HTTP ${response.status} — response is not valid JSON (cannot assert JSON path "${bodyJsonPath}")`,
            level: 'red' as const,
            responseBody: body.slice(0, 500) || null,
          };
        }
        const normalizedPath = bodyJsonPath.startsWith('$.') ? bodyJsonPath.slice(2) : bodyJsonPath.startsWith('$') ? bodyJsonPath.slice(1) : bodyJsonPath;
        const actual = extractByPath(parsed, normalizedPath);
        const actualStr = actual === null || actual === undefined ? '' : String(actual);
        const assertionPasses = bodyJsonPathExpected
          ? actualStr === bodyJsonPathExpected
          : actual !== null && actual !== undefined && actual !== false && actual !== '' && actual !== 0;
        if (!assertionPasses) {
          const expectDesc = bodyJsonPathExpected ? `"${bodyJsonPathExpected}"` : 'truthy value';
          return {
            ok: false,
            statusCode: response.status,
            latencyMs,
            message: `HTTP ${response.status} — JSON path "${bodyJsonPath}" is ${actualStr ? `"${actualStr}"` : 'missing/falsy'} (expected ${expectDesc})`,
            level: 'red' as const,
            responseBody: body.slice(0, 500) || null,
          };
        }
      }

      if (responseTimeThresholdMs !== undefined && latencyMs > responseTimeThresholdMs) {
        const assertDesc = bodyJsonPath ? `JSON path "${bodyJsonPath}" OK` : `body contains "${bodyContains}"`;
        return {
          ok: false,
          statusCode: response.status,
          latencyMs,
          message: `Degraded — ${latencyMs}ms exceeds threshold (${responseTimeThresholdMs}ms), ${assertDesc}`,
          level: 'yellow' as const,
        };
      }
      const okDesc = bodyJsonPath
        ? `JSON path "${bodyJsonPath}"${bodyJsonPathExpected ? ` = "${bodyJsonPathExpected}"` : ' is truthy'}`
        : `body contains "${bodyContains}"`;
      return {
        ok: true,
        statusCode: response.status,
        latencyMs,
        message: `OK — ${okDesc}`,
        level: 'green' as const,
      };
    }

    await response.text().catch(() => undefined);

    if (responseTimeThresholdMs !== undefined && latencyMs > responseTimeThresholdMs) {
      return {
        ok: false,
        statusCode: response.status,
        latencyMs,
        message: `Degraded — ${latencyMs}ms exceeds threshold (${responseTimeThresholdMs}ms)`,
        level: 'yellow' as const,
      };
    }

    return {
      ok: true,
      statusCode: response.status,
      latencyMs,
      message: 'OK',
      level: 'green' as const,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      latencyMs: Date.now() - started,
      message: error instanceof Error ? error.message : 'Request failed',
      level: 'red' as const,
    };
  }
}

export async function runBrowserCheck(
  target: string,
  config: Record<string, unknown>,
  timeoutMs = 15000,
): Promise<PluginExecutionResult> {
  const url = target.trim().startsWith('http') ? target.trim() : `https://${target.trim()}`;
  const expectedText = typeof config.browserExpectedText === 'string' ? config.browserExpectedText.trim() : '';
  const selector = typeof config.browserSelector === 'string' ? config.browserSelector.trim() : '';
  const allowedCodes: number[] =
    Array.isArray(config.browserStatusCodes) && (config.browserStatusCodes as number[]).every((c) => typeof c === 'number')
      ? (config.browserStatusCodes as number[])
      : [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; PulseDock/1.0; +https://pulsedock.io) PulseDockBrowserCheck/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    const latencyMs = Date.now() - start;
    clearTimeout(timer);

    const statusOk =
      allowedCodes.length > 0
        ? allowedCodes.includes(resp.status)
        : resp.status >= 200 && resp.status < 400;

    if (!statusOk) {
      return {
        ok: false,
        statusCode: resp.status,
        latencyMs,
        message: `HTTP ${resp.status} — expected ${allowedCodes.length > 0 ? allowedCodes.join('/') : '2xx-3xx'}`,
        level: resp.status >= 500 ? ('red' as const) : ('yellow' as const),
      };
    }

    if (expectedText || selector) {
      const body = await resp.text();

      if (expectedText && !body.toLowerCase().includes(expectedText.toLowerCase())) {
        return {
          ok: false,
          statusCode: resp.status,
          latencyMs,
          message: `Expected text not found: "${expectedText}"`,
          level: 'red' as const,
        };
      }

      if (selector) {
        const selectorPresent = htmlContainsSelector(body, selector);
        if (!selectorPresent) {
          return {
            ok: false,
            statusCode: resp.status,
            latencyMs,
            message: `Element not found: "${selector}"`,
            level: 'red' as const,
          };
        }
      }
    }

    return {
      ok: true,
      statusCode: resp.status,
      latencyMs,
      message: `${resp.status} OK${latencyMs > 0 ? ` (${latencyMs}ms)` : ''}`,
      level: 'green' as const,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      statusCode: 0,
      latencyMs,
      message: isTimeout ? `Timeout after ${timeoutMs}ms` : `Error: ${err instanceof Error ? err.message : String(err)}`,
      level: 'red' as const,
    };
  }
}

/**
 * Lightweight HTML presence check for a CSS selector without a DOM parser.
 * Handles: tag selectors, #id, .class, [attr], [attr="value"].
 */
export function htmlContainsSelector(html: string, selector: string): boolean {
  const trimmed = selector.trim();

  const idMatch = trimmed.match(/^#([\w-]+)$/);
  if (idMatch) {
    const id = idMatch[1];
    return new RegExp(`id=["']${id}["']`, 'i').test(html);
  }

  const classMatch = trimmed.match(/^\.([\w-]+)$/);
  if (classMatch) {
    const cls = classMatch[1];
    return new RegExp(`class=["'][^"']*\\b${cls}\\b`, 'i').test(html);
  }

  const attrMatch = trimmed.match(/^\[([^\]="]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
  if (attrMatch) {
    const attr = attrMatch[1];
    const val = attrMatch[2];
    if (val) {
      return new RegExp(`${attr}=["']${val}["']`, 'i').test(html);
    }
    return new RegExp(`\\b${attr}=`, 'i').test(html);
  }

  const tagMatch = trimmed.match(/^([\w-]+)$/);
  if (tagMatch) {
    return new RegExp(`<${tagMatch[1]}[\\s>]`, 'i').test(html);
  }

  const tagClassMatch = trimmed.match(/^([\w-]+)\.([\w-]+)$/);
  if (tagClassMatch) {
    const tag = tagClassMatch[1];
    const cls = tagClassMatch[2];
    return new RegExp(`<${tag}[^>]*class=["'][^"']*\\b${cls}\\b`, 'i').test(html);
  }

  const tagIdMatch = trimmed.match(/^([\w-]+)#([\w-]+)$/);
  if (tagIdMatch) {
    const tag = tagIdMatch[1];
    const id = tagIdMatch[2];
    return new RegExp(`<${tag}[^>]*id=["']${id}["']`, 'i').test(html);
  }

  return html.toLowerCase().includes(trimmed.toLowerCase());
}
