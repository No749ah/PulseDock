/**
 * HTTP and Browser check runners.
 * Extracted from ChecksService to keep the service focused on orchestration.
 *
 * Uses Node.js native http/https modules for HTTP checks to capture socket-level
 * timing phases: DNS resolution, TCP connect, TLS handshake, TTFB, and download.
 */

import * as https from 'https';
import * as http from 'http';
import type { IncomingMessage } from 'http';
import type { PluginExecutionResult, Timings } from '../plugin.contracts';
import { extractByPath } from '../version-extractor.util';

interface TimedResult {
  statusCode: number;
  body: string;
  latencyMs: number;
  timings: Timings;
}

/**
 * Performs a timed HTTP/HTTPS request using Node.js native modules.
 * Captures DNS, TCP connect, TLS handshake, TTFB and download timing phases.
 */
function runTimedRequest(
  url: string,
  options: {
    method: string;
    timeoutMs: number;
    headers: Record<string, string>;
    body?: string;
  },
): Promise<TimedResult> {
  return new Promise((resolve, reject) => {
    const startMs = Date.now();
    let dnsStart: number | null = null;
    let dnsMs: number | null = null;
    let tcpStart: number | null = null;
    let tcpMs: number | null = null;
    let tlsStart: number | null = null;
    let tlsMs: number | null = null;
    let ttfbMs: number | null = null;
    let bodyStart: number | null = null;
    let downloadMs: number | null = null;

    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      reject(new Error(`Invalid URL: ${url}`));
      return;
    }

    const isHttps = urlObj.protocol === 'https:';
    const lib: typeof https | typeof http = isHttps ? https : http;

    const requestOptions: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port !== '' ? parseInt(urlObj.port, 10) : isHttps ? 443 : 80,
      path: (urlObj.pathname || '/') + urlObj.search,
      method: options.method,
      headers: {
        'User-Agent': 'PulseDock-Monitor/1.0',
        ...options.headers,
      },
      timeout: options.timeoutMs,
    };

    const chunks: Buffer[] = [];

    const req = lib.request(requestOptions, (res: IncomingMessage) => {
      ttfbMs = Date.now() - startMs;
      bodyStart = Date.now();

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        downloadMs = bodyStart !== null ? Date.now() - bodyStart : null;
        const latencyMs = Date.now() - startMs;
        const body = Buffer.concat(chunks).toString('utf8');
        const timings: Timings = {
          dnsMs,
          tcpMs,
          tlsMs: isHttps ? tlsMs : null,
          ttfbMs,
          downloadMs,
        };
        resolve({
          statusCode: res.statusCode ?? 0,
          body,
          latencyMs,
          timings,
        });
      });

      res.on('error', (err: Error) => {
        reject(err);
      });
    });

    req.on('socket', (socket) => {
      // DNS resolution start
      dnsStart = Date.now();

      socket.on('lookup', (_err: Error | null, _address: string) => {
        if (dnsStart !== null) {
          dnsMs = Date.now() - dnsStart;
        }
        tcpStart = Date.now();
      });

      socket.on('connect', () => {
        if (tcpStart !== null) {
          tcpMs = Date.now() - tcpStart;
        } else if (dnsStart !== null) {
          // lookup may not fire for cached DNS — measure from dnsStart
          tcpMs = Date.now() - dnsStart;
        }
        if (isHttps) {
          tlsStart = Date.now();
        }
      });

      socket.on('secureConnect', () => {
        if (tlsStart !== null) {
          tlsMs = Date.now() - tlsStart;
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out after ${options.timeoutMs}ms`));
    });

    req.on('error', (err: Error) => {
      reject(err);
    });

    if (options.body && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
      req.write(options.body);
    }

    req.end();
  });
}

export async function runHttpCheck(
  url: string,
  timeoutMs = 5000,
  config: Record<string, unknown> = {},
): Promise<PluginExecutionResult> {
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
    const timedResult = await runTimedRequest(url, {
      method: safeMethod,
      timeoutMs,
      headers: requestHeaders,
      body: requestBody,
    });

    const { statusCode, body, latencyMs, timings } = timedResult;

    let statusOk: boolean;
    if (expectedStatus !== undefined) {
      const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
      statusOk = allowed.includes(statusCode);
    } else {
      statusOk = statusCode >= 200 && statusCode < 300;
    }

    if (!statusOk) {
      const expected = expectedStatus ? ` (expected ${Array.isArray(expectedStatus) ? expectedStatus.join('/') : expectedStatus})` : '';
      return {
        ok: false,
        statusCode,
        latencyMs,
        message: `HTTP ${statusCode}${expected}`,
        level: 'red' as const,
        responseBody: body ? body.slice(0, 500) : null,
        timings,
      };
    }

    if (needsBody) {
      if (bodyContains) {
        const found = body.toLowerCase().includes(bodyContains.toLowerCase());
        if (!found) {
          return {
            ok: false,
            statusCode,
            latencyMs,
            message: `HTTP ${statusCode} — body does not contain "${bodyContains}"`,
            level: 'red' as const,
            responseBody: body.slice(0, 500) || null,
            timings,
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
            statusCode,
            latencyMs,
            message: `HTTP ${statusCode} — response is not valid JSON (cannot assert JSON path "${bodyJsonPath}")`,
            level: 'red' as const,
            responseBody: body.slice(0, 500) || null,
            timings,
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
            statusCode,
            latencyMs,
            message: `HTTP ${statusCode} — JSON path "${bodyJsonPath}" is ${actualStr ? `"${actualStr}"` : 'missing/falsy'} (expected ${expectDesc})`,
            level: 'red' as const,
            responseBody: body.slice(0, 500) || null,
            timings,
          };
        }
      }

      if (responseTimeThresholdMs !== undefined && latencyMs > responseTimeThresholdMs) {
        const assertDesc = bodyJsonPath ? `JSON path "${bodyJsonPath}" OK` : `body contains "${bodyContains}"`;
        return {
          ok: false,
          statusCode,
          latencyMs,
          message: `Degraded — ${latencyMs}ms exceeds threshold (${responseTimeThresholdMs}ms), ${assertDesc}`,
          level: 'yellow' as const,
          timings,
        };
      }
      const okDesc = bodyJsonPath
        ? `JSON path "${bodyJsonPath}"${bodyJsonPathExpected ? ` = "${bodyJsonPathExpected}"` : ' is truthy'}`
        : `body contains "${bodyContains}"`;
      return {
        ok: true,
        statusCode,
        latencyMs,
        message: `OK — ${okDesc}`,
        level: 'green' as const,
        timings,
      };
    }

    if (responseTimeThresholdMs !== undefined && latencyMs > responseTimeThresholdMs) {
      return {
        ok: false,
        statusCode,
        latencyMs,
        message: `Degraded — ${latencyMs}ms exceeds threshold (${responseTimeThresholdMs}ms)`,
        level: 'yellow' as const,
        timings,
      };
    }

    return {
      ok: true,
      statusCode,
      latencyMs,
      message: 'OK',
      level: 'green' as const,
      timings,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      latencyMs: 0,
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

  const start = Date.now();

  try {
    const timedResult = await runTimedRequest(url, {
      method: 'GET',
      timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PulseDock/1.0; +https://pulsedock.io) PulseDockBrowserCheck/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    const { statusCode, body, latencyMs, timings } = timedResult;

    const statusOk =
      allowedCodes.length > 0
        ? allowedCodes.includes(statusCode)
        : statusCode >= 200 && statusCode < 400;

    if (!statusOk) {
      return {
        ok: false,
        statusCode,
        latencyMs,
        message: `HTTP ${statusCode} — expected ${allowedCodes.length > 0 ? allowedCodes.join('/') : '2xx-3xx'}`,
        level: statusCode >= 500 ? ('red' as const) : ('yellow' as const),
        timings,
      };
    }

    if (expectedText || selector) {
      if (expectedText && !body.toLowerCase().includes(expectedText.toLowerCase())) {
        return {
          ok: false,
          statusCode,
          latencyMs,
          message: `Expected text not found: "${expectedText}"`,
          level: 'red' as const,
          timings,
        };
      }

      if (selector) {
        const selectorPresent = htmlContainsSelector(body, selector);
        if (!selectorPresent) {
          return {
            ok: false,
            statusCode,
            latencyMs,
            message: `Element not found: "${selector}"`,
            level: 'red' as const,
            timings,
          };
        }
      }
    }

    return {
      ok: true,
      statusCode,
      latencyMs,
      message: `${statusCode} OK${latencyMs > 0 ? ` (${latencyMs}ms)` : ''}`,
      level: 'green' as const,
      timings,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const isTimeout = err instanceof Error && (err.message.includes('timed out') || err.name === 'AbortError');
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
