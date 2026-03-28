/**
 * HTTP and Browser check runners.
 * Extracted from ChecksService to keep the service focused on orchestration.
 *
 * Uses Node.js native http/https modules for HTTP checks to capture socket-level
 * timing phases: DNS resolution, TCP connect, TLS handshake, TTFB, and download.
 */

import * as https from 'https';
import * as http from 'http';
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'http';
import type { PluginExecutionResult, SecurityHeadersAudit, SecurityHeaderResult, Timings } from '../plugin.contracts';
import { extractByPath } from '../version-extractor.util';

interface TimedResult {
  statusCode: number;
  body: string;
  latencyMs: number;
  timings: Timings;
  responseHeaders: Record<string, string>;
}

// ─── Security Headers Audit ───────────────────────────────────────────────────

/** Checks a set of security response headers and returns a graded audit report. */
export function auditSecurityHeaders(headers: Record<string, string>): SecurityHeadersAudit {
  const normalised: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    normalised[k.toLowerCase()] = v;
  }

  const checks: SecurityHeaderResult[] = [
    {
      name: 'Strict-Transport-Security',
      present: 'strict-transport-security' in normalised,
      value: normalised['strict-transport-security'] ?? null,
      severity: 'critical',
      description: 'Enforces HTTPS connections and prevents protocol downgrade attacks.',
      recommendation: 'Add: Strict-Transport-Security: max-age=31536000; includeSubDomains',
    },
    {
      name: 'Content-Security-Policy',
      present: 'content-security-policy' in normalised || 'content-security-policy-report-only' in normalised,
      value: normalised['content-security-policy'] ?? normalised['content-security-policy-report-only'] ?? null,
      severity: 'critical',
      description: 'Prevents XSS and data injection attacks by controlling allowed content sources.',
      recommendation: 'Add: Content-Security-Policy: default-src \'self\'',
    },
    {
      name: 'X-Frame-Options',
      present: 'x-frame-options' in normalised,
      value: normalised['x-frame-options'] ?? null,
      severity: 'warning',
      description: 'Prevents clickjacking by controlling iframe embedding.',
      recommendation: 'Add: X-Frame-Options: DENY or SAMEORIGIN',
    },
    {
      name: 'X-Content-Type-Options',
      present: 'x-content-type-options' in normalised,
      value: normalised['x-content-type-options'] ?? null,
      severity: 'warning',
      description: 'Prevents MIME type sniffing attacks.',
      recommendation: 'Add: X-Content-Type-Options: nosniff',
    },
    {
      name: 'Referrer-Policy',
      present: 'referrer-policy' in normalised,
      value: normalised['referrer-policy'] ?? null,
      severity: 'info',
      description: 'Controls how much referrer information is sent with requests.',
      recommendation: 'Add: Referrer-Policy: no-referrer or strict-origin-when-cross-origin',
    },
    {
      name: 'Permissions-Policy',
      present: 'permissions-policy' in normalised,
      value: normalised['permissions-policy'] ?? null,
      severity: 'info',
      description: 'Controls access to browser features like camera, mic, geolocation.',
      recommendation: 'Add: Permissions-Policy: camera=(), microphone=(), geolocation=()',
    },
    {
      name: 'X-XSS-Protection',
      present: 'x-xss-protection' in normalised,
      value: normalised['x-xss-protection'] ?? null,
      severity: 'info',
      description: 'Legacy XSS filter for older browsers. Largely superseded by CSP.',
      recommendation: 'Add: X-XSS-Protection: 1; mode=block',
    },
    {
      name: 'Cache-Control',
      present: 'cache-control' in normalised,
      value: normalised['cache-control'] ?? null,
      severity: 'info',
      description: 'Controls caching behavior to prevent sensitive data exposure.',
      recommendation: 'Add: Cache-Control: no-store for authenticated pages',
    },
  ];

  // Scoring: critical=30pts, warning=15pts, info=5pts
  const weights: Record<SecurityHeaderResult['severity'], number> = { critical: 30, warning: 15, info: 5 };
  const maxScore = checks.reduce((sum, c) => sum + weights[c.severity], 0); // 30+30+15+15+5+5+5+5 = 110
  const earned = checks.filter(c => c.present).reduce((sum, c) => sum + weights[c.severity], 0);
  const score = Math.round((earned / maxScore) * 100);

  let grade: string;
  if (score >= 90) grade = 'A';
  else if (score >= 75) grade = 'B';
  else if (score >= 55) grade = 'C';
  else if (score >= 35) grade = 'D';
  else grade = 'F';

  return { grade, score, headers: checks };
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
        // Flatten response headers (Node may return string | string[] per header)
        const responseHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (v !== undefined) {
            responseHeaders[k] = Array.isArray(v) ? v.join(', ') : v;
          }
        }
        resolve({
          statusCode: res.statusCode ?? 0,
          body,
          latencyMs,
          timings,
          responseHeaders,
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

/**
 * Follow HTTP redirects (3xx) up to maxRedirects times.
 * Returns the final timed result plus the redirect chain.
 * Accumulates total latency across hops.
 * @param url - Starting URL
 * @param options - Request options (forwarded to runTimedRequest)
 * @param maxRedirects - Max redirects to follow (default 10)
 */
async function runTimedRequestWithRedirects(
  url: string,
  options: Parameters<typeof runTimedRequest>[1],
  maxRedirects = 10,
): Promise<TimedResult & { redirectChain: string[] }> {
  const redirectChain: string[] = [];
  let currentUrl = url;
  let totalLatencyMs = 0;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const result = await runTimedRequest(currentUrl, options);
    totalLatencyMs += result.latencyMs;

    const isRedirect = result.statusCode >= 301 && result.statusCode <= 308;
    const location = result.responseHeaders['location'];

    if (isRedirect && location) {
      redirectChain.push(currentUrl);
      // Resolve relative location against current URL
      try {
        currentUrl = new URL(location, currentUrl).href;
      } catch {
        // Invalid location header — return what we have
        return { ...result, latencyMs: totalLatencyMs, redirectChain };
      }
      // For POST→GET redirect (301/302/303), switch to GET
      if ([301, 302, 303].includes(result.statusCode) && options.method !== 'GET') {
        options = { ...options, method: 'GET', body: undefined };
      }
      continue;
    }

    // Non-redirect response or no location header — return final
    return { ...result, latencyMs: totalLatencyMs, redirectChain };
  }

  // Too many redirects
  throw new Error(`Too many redirects (>${maxRedirects}) from ${url}`);
}

/**
 * Performs a pre-authentication step: POSTs credentials to a login endpoint and
 * extracts a session cookie or bearer token to use in the main request.
 *
 * @param preAuthUrl - Login endpoint URL (e.g. https://app.example.com/api/auth/login)
 * @param preAuthBody - JSON string or object for the POST body
 * @param preAuthExtractCookie - Cookie name to extract from Set-Cookie header
 * @param preAuthExtractToken - Dot-path (e.g. "data.token") to extract bearer from JSON response body
 * @param timeoutMs - Timeout in ms for the auth request
 * @returns { cookie, bearerToken } — at most one will be set
 */
async function runPreAuth(
  preAuthUrl: string,
  preAuthBody: string,
  preAuthExtractCookie: string | undefined,
  preAuthExtractToken: string | undefined,
  timeoutMs: number,
): Promise<{ cookie: string | null; bearerToken: string | null; error: string | null }> {
  try {
    const result = await runTimedRequest(preAuthUrl, {
      method: 'POST',
      timeoutMs,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'PulseDock/1.0' },
      body: preAuthBody,
    });

    let cookie: string | null = null;
    let bearerToken: string | null = null;

    // Extract cookie from Set-Cookie header
    if (preAuthExtractCookie) {
      const setCookie = result.responseHeaders['set-cookie'] ?? '';
      const allCookies = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
      const cookieRegex = new RegExp(`(?:^|;\\s*)${preAuthExtractCookie}=([^;]+)`, 'i');
      const match = allCookies.match(cookieRegex);
      if (match) cookie = `${preAuthExtractCookie}=${match[1]}`;
    }

    // Extract bearer token from response body via dot-path
    if (preAuthExtractToken && result.body) {
      try {
        const parsed = JSON.parse(result.body) as unknown;
        const extracted = extractByPath(parsed, preAuthExtractToken);
        if (typeof extracted === 'string' && extracted.trim()) {
          bearerToken = extracted.trim();
        }
      } catch {
        // non-JSON response — token extraction fails silently, main check will fail auth
      }
    }

    if (!cookie && !bearerToken) {
      const hint = preAuthExtractCookie
        ? `cookie "${preAuthExtractCookie}" not found in Set-Cookie`
        : `token path "${preAuthExtractToken}" not found in response`;
      return { cookie: null, bearerToken: null, error: `Pre-auth succeeded (HTTP ${result.statusCode}) but ${hint}` };
    }

    return { cookie, bearerToken, error: null };
  } catch (err) {
    return { cookie: null, bearerToken: null, error: `Pre-auth request failed: ${err instanceof Error ? err.message : String(err)}` };
  }
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
  const detectContentChanges = config['detectContentChanges'] === true;
  const minResponseBodyBytes = typeof config['minResponseBodyBytes'] === 'number' && config['minResponseBodyBytes'] > 0
    ? config['minResponseBodyBytes'] : undefined;
  const maxResponseBodyBytes = typeof config['maxResponseBodyBytes'] === 'number' && config['maxResponseBodyBytes'] > 0
    ? config['maxResponseBodyBytes'] : undefined;
  const checkResponseSize = minResponseBodyBytes !== undefined || maxResponseBodyBytes !== undefined;
  // Header assertion: assert a specific response header is present (and optionally matches a value)
  const assertResponseHeader = typeof config['assertResponseHeader'] === 'string' && config['assertResponseHeader'].trim()
    ? config['assertResponseHeader'].trim().toLowerCase() : undefined;
  const assertResponseHeaderValue = typeof config['assertResponseHeaderValue'] === 'string'
    ? config['assertResponseHeaderValue'] : undefined;
  // ─── Custom Metric Capture ────────────────────────────────────────────────────
  const metricPath = typeof config['metricPath'] === 'string' && config['metricPath'].trim() ? config['metricPath'].trim() : undefined;
  const metricAlertMin = typeof config['metricAlertMin'] === 'number' ? config['metricAlertMin'] : undefined;
  const metricAlertMax = typeof config['metricAlertMax'] === 'number' ? config['metricAlertMax'] : undefined;
  const needsBody = !!bodyContains || !!bodyJsonPath || detectContentChanges || checkResponseSize || !!metricPath;
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
  const checkSecurityHeaders = config['checkSecurityHeaders'] === true;

  // ─── Header Tracking ──────────────────────────────────────────────────────────
  const trackedHeaderNames: string[] = typeof config['trackedHeaders'] === 'string' && config['trackedHeaders'].trim()
    ? config['trackedHeaders'].split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
    : [];

  // ─── Authentication ───────────────────────────────────────────────────────────
  // authType: 'none' | 'basic' | 'bearer' | 'api-key'
  const authType = typeof config['authType'] === 'string' ? config['authType'] : 'none';
  if (authType === 'basic') {
    const user = typeof config['authUser'] === 'string' ? config['authUser'] : '';
    const pass = typeof config['authPassword'] === 'string' ? config['authPassword'] : '';
    if (user || pass) {
      requestHeaders['Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    }
  } else if (authType === 'bearer') {
    const token = typeof config['authToken'] === 'string' ? config['authToken'] : '';
    if (token) requestHeaders['Authorization'] = `Bearer ${token}`;
  } else if (authType === 'api-key') {
    const keyName = typeof config['authApiKeyName'] === 'string' ? config['authApiKeyName'].trim() : '';
    const keyValue = typeof config['authApiKeyValue'] === 'string' ? config['authApiKeyValue'] : '';
    const keyIn = typeof config['authApiKeyIn'] === 'string' ? config['authApiKeyIn'] : 'header';
    if (keyName && keyValue && keyIn === 'header') {
      requestHeaders[keyName] = keyValue;
    }
    // query-string API key: append to URL handled below
  }

  // For API key in query string, we append before building the request
  let effectiveUrl = url;
  if (authType === 'api-key') {
    const keyName = typeof config['authApiKeyName'] === 'string' ? config['authApiKeyName'].trim() : '';
    const keyValue = typeof config['authApiKeyValue'] === 'string' ? config['authApiKeyValue'] : '';
    const keyIn = typeof config['authApiKeyIn'] === 'string' ? config['authApiKeyIn'] : 'header';
    if (keyName && keyValue && keyIn === 'query') {
      const sep = url.includes('?') ? '&' : '?';
      effectiveUrl = `${url}${sep}${encodeURIComponent(keyName)}=${encodeURIComponent(keyValue)}`;
    }
  }

  const followRedirects = config['followRedirects'] !== false; // default: follow redirects
  const maxRedirects = typeof config['maxRedirects'] === 'number' ? Math.min(Math.max(0, config['maxRedirects']), 20) : 10;

  // ─── Pre-Request Authentication Step ─────────────────────────────────────────
  // When preAuthUrl is set, POST credentials first to obtain a session cookie or
  // bearer token, then inject it into the main request automatically.
  const preAuthUrl = typeof config['preAuthUrl'] === 'string' && config['preAuthUrl'].trim() ? config['preAuthUrl'].trim() : undefined;
  if (preAuthUrl) {
    const preAuthBody = typeof config['preAuthBody'] === 'string' ? config['preAuthBody']
      : (config['preAuthBody'] && typeof config['preAuthBody'] === 'object' ? JSON.stringify(config['preAuthBody']) : '{}');
    const preAuthExtractCookie = typeof config['preAuthExtractCookie'] === 'string' && config['preAuthExtractCookie'].trim()
      ? config['preAuthExtractCookie'].trim() : undefined;
    const preAuthExtractToken = typeof config['preAuthExtractToken'] === 'string' && config['preAuthExtractToken'].trim()
      ? config['preAuthExtractToken'].trim() : undefined;

    const { cookie, bearerToken, error } = await runPreAuth(
      preAuthUrl, preAuthBody, preAuthExtractCookie, preAuthExtractToken, Math.min(timeoutMs, 10000),
    );
    if (error) {
      return { ok: false, statusCode: 0, latencyMs: 0, message: `Pre-auth failed: ${error}`, level: 'red' as const };
    }
    if (cookie) {
      // Merge with any existing Cookie header
      const existing = requestHeaders['Cookie'] ?? requestHeaders['cookie'] ?? '';
      requestHeaders['Cookie'] = existing ? `${existing}; ${cookie}` : cookie;
    }
    if (bearerToken) {
      requestHeaders['Authorization'] = `Bearer ${bearerToken}`;
    }
  }

  try {
    const timedResult = followRedirects
      ? await runTimedRequestWithRedirects(effectiveUrl, {
          method: safeMethod,
          timeoutMs,
          headers: requestHeaders,
          body: requestBody,
        }, maxRedirects)
      : { ...await runTimedRequest(effectiveUrl, {
          method: safeMethod,
          timeoutMs,
          headers: requestHeaders,
          body: requestBody,
        }), redirectChain: [] as string[] };

    const { statusCode, body, latencyMs, timings, responseHeaders, redirectChain } = timedResult;
    const securityAudit = checkSecurityHeaders ? auditSecurityHeaders(responseHeaders) : null;
    const responseBodyHash = detectContentChanges && body ? createHash('sha256').update(body).digest('hex').slice(0, 64) : null;

    // ─── Response size (always captured for HTTP/BROWSER monitors) ────────────
    const responseSizeBytes = body ? Buffer.byteLength(body, 'utf8') : 0;

    // ─── Capture tracked headers ──────────────────────────────────────────────
    const capturedHeaders: Record<string, string | null> | null = trackedHeaderNames.length > 0
      ? Object.fromEntries(trackedHeaderNames.map((h) => [h, responseHeaders[h] ?? null]))
      : null;

    // ─── Custom Metric Extraction ─────────────────────────────────────────────
    let capturedMetricValue: number | null = null;
    if (metricPath && body) {
      try {
        const parsed = JSON.parse(body);
        const normPath = metricPath.startsWith('$.') ? metricPath.slice(2) : metricPath.startsWith('$') ? metricPath.slice(1) : metricPath;
        const extracted = extractByPath(parsed, normPath);
        const numVal = Number(extracted);
        if (!isNaN(numVal) && isFinite(numVal)) {
          capturedMetricValue = numVal;
        }
      } catch {
        // body is not JSON or path extraction failed — capturedMetricValue stays null
      }
    }

    let statusOk: boolean;
    if (expectedStatus !== undefined) {
      const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
      statusOk = allowed.includes(statusCode);
    } else {
      statusOk = statusCode >= 200 && statusCode < 300;
    }

    if (!statusOk) {
      const expected = expectedStatus ? ` (expected ${Array.isArray(expectedStatus) ? expectedStatus.join('/') : expectedStatus})` : '';
      const redirectNote = redirectChain.length > 0 ? ` [via ${redirectChain.length} redirect${redirectChain.length > 1 ? 's' : ''}]` : '';
      return {
        ok: false,
        statusCode,
        latencyMs,
        message: `HTTP ${statusCode}${expected}${redirectNote}`,
        level: 'red' as const,
        responseBody: body ? body.slice(0, 500) : null,
        timings,
        ...(redirectChain.length > 0 ? { redirectChain } : {}),
      };
    }

    // ─── Response header assertion ────────────────────────────────────────────
    if (assertResponseHeader) {
      const actualValue = responseHeaders[assertResponseHeader] ?? null;
      if (actualValue === null) {
        return {
          ok: false,
          statusCode,
          latencyMs,
          message: `HTTP ${statusCode} — header "${assertResponseHeader}" missing`,
          level: 'red' as const,
          timings,
          securityHeadersAudit: securityAudit,
          ...(capturedHeaders ? { capturedHeaders } : {}),
        };
      }
      if (assertResponseHeaderValue !== undefined) {
        const expected = assertResponseHeaderValue.trim();
        // Case-insensitive contains match (covers "application/json; charset=utf-8" matching "application/json")
        if (!actualValue.toLowerCase().includes(expected.toLowerCase())) {
          return {
            ok: false,
            statusCode,
            latencyMs,
            message: `HTTP ${statusCode} — header "${assertResponseHeader}" is "${actualValue}" (expected to contain "${expected}")`,
            level: 'red' as const,
            timings,
            securityHeadersAudit: securityAudit,
            ...(capturedHeaders ? { capturedHeaders } : {}),
          };
        }
      }
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

      // ─── Response size check ──────────────────────────────────────────────────
      if (checkResponseSize) {
        if (minResponseBodyBytes !== undefined && responseSizeBytes < minResponseBodyBytes) {
          return {
            ok: false,
            statusCode,
            latencyMs,
            message: `Response too small — ${responseSizeBytes} bytes (min ${minResponseBodyBytes})`,
            level: 'yellow' as const,
            timings,
            responseSizeBytes,
            ...(capturedHeaders ? { capturedHeaders } : {}),
          };
        }
        if (maxResponseBodyBytes !== undefined && responseSizeBytes > maxResponseBodyBytes) {
          return {
            ok: false,
            statusCode,
            latencyMs,
            message: `Response too large — ${responseSizeBytes} bytes (max ${maxResponseBodyBytes})`,
            level: 'yellow' as const,
            timings,
            responseSizeBytes,
            ...(capturedHeaders ? { capturedHeaders } : {}),
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
        : checkResponseSize ? `Size OK (${Buffer.byteLength(body, 'utf8')} bytes)`
        : `body contains "${bodyContains}"`;
      return {
        ok: true,
        statusCode,
        latencyMs,
        message: `OK — ${okDesc}`,
        level: 'green' as const,
        timings,
        securityHeadersAudit: securityAudit,
        responseBodyHash,
        responseSizeBytes,
        ...(capturedMetricValue !== null ? { capturedMetricValue } : {}),
        ...(capturedHeaders ? { capturedHeaders } : {}),
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
        securityHeadersAudit: securityAudit,
        responseBodyHash,
        responseSizeBytes,
        ...(capturedHeaders ? { capturedHeaders } : {}),
      };
    }

    // ─── Metric alert check ───────────────────────────────────────────────────
    if (capturedMetricValue !== null && metricPath) {
      const metricName = typeof config['metricName'] === 'string' ? config['metricName'] : metricPath;
      const metricUnit = typeof config['metricUnit'] === 'string' ? config['metricUnit'] : '';
      const valueStr = `${capturedMetricValue}${metricUnit ? ' ' + metricUnit : ''}`;
      if (metricAlertMin !== undefined && capturedMetricValue < metricAlertMin) {
        return {
          ok: true,
          statusCode,
          latencyMs,
          message: `Degraded — ${metricName} = ${valueStr} (below min ${metricAlertMin})`,
          level: 'yellow' as const,
          timings,
          securityHeadersAudit: securityAudit,
          responseBodyHash,
          responseSizeBytes,
          capturedMetricValue,
          ...(redirectChain.length > 0 ? { redirectChain } : {}),
          ...(capturedHeaders ? { capturedHeaders } : {}),
        };
      }
      if (metricAlertMax !== undefined && capturedMetricValue > metricAlertMax) {
        return {
          ok: true,
          statusCode,
          latencyMs,
          message: `Degraded — ${metricName} = ${valueStr} (above max ${metricAlertMax})`,
          level: 'yellow' as const,
          timings,
          securityHeadersAudit: securityAudit,
          responseBodyHash,
          responseSizeBytes,
          capturedMetricValue,
          ...(redirectChain.length > 0 ? { redirectChain } : {}),
          ...(capturedHeaders ? { capturedHeaders } : {}),
        };
      }
    }

    // Compute message suffix for security audit grade and redirect info
    const secGradeSuffix = securityAudit ? ` [Security: ${securityAudit.grade}]` : '';
    const redirectSuffix = redirectChain.length > 0 ? ` [${redirectChain.length} redirect${redirectChain.length > 1 ? 's' : ''}]` : '';
    const headerAssertSuffix = assertResponseHeader
      ? ` [header "${assertResponseHeader}" OK]`
      : '';
    return {
      ok: true,
      statusCode,
      latencyMs,
      message: `OK${headerAssertSuffix}${redirectSuffix}${secGradeSuffix}`,
      level: 'green' as const,
      timings,
      securityHeadersAudit: securityAudit,
      responseBodyHash,
      responseSizeBytes,
      ...(capturedMetricValue !== null ? { capturedMetricValue } : {}),
      ...(redirectChain.length > 0 ? { redirectChain } : {}),
      ...(capturedHeaders ? { capturedHeaders } : {}),
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
