import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// ─── ESM-safe mocks for node:https and node:http ──────────────────────────────
// vi.doMock + dynamic import() doesn't work in ESM — the module is cached after
// the first static import. Use vi.hoisted + vi.mock factory with mutable config.

interface MockConfig {
  statusCode: number;
  body: string;
  shouldError?: Error;
  delayMs?: number;
  secureConnect?: boolean;
}

const mockState = vi.hoisted(() => ({
  https: { statusCode: 200, body: '' } as MockConfig,
  http: { statusCode: 200, body: '' } as MockConfig,
  lastRequestOpts: null as unknown,
  // Queue of responses for redirect testing (consumed in order, falls back to https/http config)
  responseQueue: [] as Array<MockConfig & { location?: string }>,
}));

function buildMockModule(getConfig: () => MockConfig) {
  return {
    request: vi.fn((opts: unknown, callback: (res: EventEmitter & { statusCode: number; headers: Record<string, string> }) => void) => {
      mockState.lastRequestOpts = opts;
      // Use queue if available, otherwise fall through to static config
      const cfg = (mockState.responseQueue.length > 0 ? mockState.responseQueue.shift() : null) ?? getConfig();
      const req = new EventEmitter() as EventEmitter & {
        write: ReturnType<typeof vi.fn>;
        end: ReturnType<typeof vi.fn>;
        destroy: (err?: Error) => void;
      };

      req.write = vi.fn();
      req.end = vi.fn(() => {
        setTimeout(() => {
          if (cfg.shouldError) {
            req.emit('error', cfg.shouldError);
            return;
          }

          const socket = new EventEmitter();
          req.emit('socket', socket);

          setTimeout(() => {
            socket.emit('lookup', null, '1.2.3.4');
            setTimeout(() => {
              socket.emit('connect');
              if (cfg.secureConnect) {
                setTimeout(() => {
                  socket.emit('secureConnect');
                  fireResponse();
                }, 5);
              } else {
                fireResponse();
              }
            }, 5);
          }, 5);
        }, cfg.delayMs ?? 0);
      });

      req.destroy = (err?: Error) => {
        if (err) req.emit('error', err);
      };

      function fireResponse() {
        const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> };
        res.statusCode = cfg.statusCode;
        // Support location header for redirect testing
        res.headers = (cfg as MockConfig & { location?: string }).location
          ? { location: (cfg as MockConfig & { location?: string }).location! }
          : {};
        callback(res);
        setTimeout(() => {
          res.emit('data', Buffer.from(cfg.body));
          res.emit('end');
        }, 5);
      }

      return req;
    }),
  };
}

vi.mock('https', () => buildMockModule(() => mockState.https));
vi.mock('http', () => buildMockModule(() => mockState.http));

// Import AFTER mocks are established
import { runHttpCheck, runBrowserCheck, htmlContainsSelector, auditSecurityHeaders } from './http.runner';

// ── htmlContainsSelector ─────────────────────────────────────────────────────

describe('htmlContainsSelector', () => {
  it('matches by id', () => {
    expect(htmlContainsSelector('<div id="main">hello</div>', '#main')).toBe(true);
    expect(htmlContainsSelector('<div id="other">hello</div>', '#main')).toBe(false);
  });

  it('matches by class', () => {
    expect(htmlContainsSelector('<div class="container active">hi</div>', '.container')).toBe(true);
    expect(htmlContainsSelector('<div class="other">hi</div>', '.container')).toBe(false);
  });

  it('matches by tag', () => {
    expect(htmlContainsSelector('<main class="x">content</main>', 'main')).toBe(true);
    expect(htmlContainsSelector('<div>content</div>', 'main')).toBe(false);
  });

  it('matches by attribute without value', () => {
    expect(htmlContainsSelector('<input data-testid="foo" />', '[data-testid]')).toBe(true);
    expect(htmlContainsSelector('<input type="text" />', '[data-testid]')).toBe(false);
  });

  it('matches by attribute with value', () => {
    expect(htmlContainsSelector('<input type="submit" />', '[type="submit"]')).toBe(true);
    expect(htmlContainsSelector('<input type="text" />', '[type="submit"]')).toBe(false);
  });

  it('matches tag.class compound selector', () => {
    expect(htmlContainsSelector('<button class="btn primary">OK</button>', 'button.btn')).toBe(true);
    expect(htmlContainsSelector('<div class="btn">OK</div>', 'button.btn')).toBe(false);
  });

  it('matches tag#id compound selector', () => {
    expect(htmlContainsSelector('<form id="login-form" class="x">', 'form#login-form')).toBe(true);
    expect(htmlContainsSelector('<div id="login-form">', 'form#login-form')).toBe(false);
  });

  it('falls back to substring for unknown patterns', () => {
    expect(htmlContainsSelector('<body>hello world</body>', 'hello world')).toBe(true);
    expect(htmlContainsSelector('<body>nothing</body>', 'hello world')).toBe(false);
  });
});

// ── runHttpCheck ─────────────────────────────────────────────────────────────

describe('runHttpCheck', () => {
  beforeEach(() => {
    mockState.https = { statusCode: 200, body: '' };
    mockState.http = { statusCode: 200, body: '' };
  });

  it('returns ok:true for 200 response', async () => {
    mockState.https = { statusCode: 200, body: '' };
    const result = await runHttpCheck('https://example.com');
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.level).toBe('green');
  });

  it('returns ok:false for 500 response', async () => {
    mockState.https = { statusCode: 500, body: 'Internal Server Error' };
    const result = await runHttpCheck('https://example.com');
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.level).toBe('red');
  });

  it('returns ok:false on request error', async () => {
    mockState.https = { statusCode: 0, body: '', shouldError: new Error('ECONNREFUSED') };
    const result = await runHttpCheck('https://example.com');
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(0);
    expect(result.message).toContain('ECONNREFUSED');
  });

  it('respects expectedStatus as a single value', async () => {
    mockState.https = { statusCode: 404, body: 'Not Found' };
    const result = await runHttpCheck('https://example.com', 5000, { expectedStatus: 404 });
    expect(result.ok).toBe(true);
  });

  it('respects expectedStatus as an array', async () => {
    mockState.https = { statusCode: 201, body: '' };
    const result = await runHttpCheck('https://example.com', 5000, { expectedStatus: [200, 201] });
    expect(result.ok).toBe(true);
  });

  it('fails when status not in expectedStatus array', async () => {
    mockState.https = { statusCode: 200, body: '' };
    const result = await runHttpCheck('https://example.com', 5000, { expectedStatus: [201, 202] });
    expect(result.ok).toBe(false);
  });

  it('checks bodyContains (case-insensitive)', async () => {
    mockState.https = { statusCode: 200, body: 'status: ok' };
    const result = await runHttpCheck('https://example.com', 5000, { bodyContains: 'STATUS: OK' });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('body contains');
  });

  it('fails when bodyContains not found', async () => {
    mockState.https = { statusCode: 200, body: 'error: service unavailable' };
    const result = await runHttpCheck('https://example.com', 5000, { bodyContains: '"status":"ok"' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('does not contain');
  });

  it('checks bodyJsonPath truthy assertion', async () => {
    mockState.https = { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };
    const result = await runHttpCheck('https://example.com', 5000, { bodyJsonPath: '$.status' });
    expect(result.ok).toBe(true);
  });

  it('fails bodyJsonPath when value does not match expected', async () => {
    mockState.https = { statusCode: 200, body: JSON.stringify({ status: 'degraded' }) };
    const result = await runHttpCheck('https://example.com', 5000, {
      bodyJsonPath: '$.status',
      bodyJsonPathExpected: 'ok',
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('JSON path');
  });

  it('fails bodyJsonPath when response is not valid JSON', async () => {
    mockState.https = { statusCode: 200, body: 'not json at all' };
    const result = await runHttpCheck('https://example.com', 5000, { bodyJsonPath: '$.status' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('not valid JSON');
  });

  it('returns green when responseTimeThresholdMs is invalid (negative)', async () => {
    mockState.https = { statusCode: 200, body: 'all good' };
    const result = await runHttpCheck('https://example.com', 5000, { responseTimeThresholdMs: -1 });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
  });

  it('returns ok:false on request error (timeout)', async () => {
    mockState.https = { statusCode: 0, body: '', shouldError: new Error('Request timed out after 100ms') };
    const result = await runHttpCheck('https://example.com', 100);
    expect(result.ok).toBe(false);
  });

  describe('authentication', () => {
    beforeEach(() => {
      mockState.https = { statusCode: 200, body: '' };
      mockState.lastRequestOpts = null;
    });

    it('adds Basic Auth Authorization header from authType=basic', async () => {
      await runHttpCheck('https://example.com', 5000, { authType: 'basic', authUser: 'admin', authPassword: 'secret' });
      const opts = mockState.lastRequestOpts as { headers?: Record<string, string> };
      const expected = `Basic ${Buffer.from('admin:secret').toString('base64')}`;
      expect(opts?.headers?.['Authorization']).toBe(expected);
    });

    it('adds Bearer Authorization header from authType=bearer', async () => {
      await runHttpCheck('https://example.com', 5000, { authType: 'bearer', authToken: 'mytoken123' });
      const opts = mockState.lastRequestOpts as { headers?: Record<string, string> };
      expect(opts?.headers?.['Authorization']).toBe('Bearer mytoken123');
    });

    it('adds API key as custom header from authType=api-key (header)', async () => {
      await runHttpCheck('https://example.com', 5000, { authType: 'api-key', authApiKeyName: 'X-API-Key', authApiKeyValue: 'mykey', authApiKeyIn: 'header' });
      const opts = mockState.lastRequestOpts as { headers?: Record<string, string> };
      expect(opts?.headers?.['X-API-Key']).toBe('mykey');
    });

    it('appends API key as query param from authType=api-key (query)', async () => {
      await runHttpCheck('https://example.com/status', 5000, { authType: 'api-key', authApiKeyName: 'api_key', authApiKeyValue: 'qkeyval', authApiKeyIn: 'query' });
      const opts = mockState.lastRequestOpts as { path?: string };
      expect(opts?.path).toContain('api_key=qkeyval');
    });

    it('does not add Authorization header when authType=none', async () => {
      await runHttpCheck('https://example.com', 5000, { authType: 'none' });
      const opts = mockState.lastRequestOpts as { headers?: Record<string, string> };
      expect(opts?.headers?.['Authorization']).toBeUndefined();
    });

    it('does not add Authorization header when authType omitted', async () => {
      await runHttpCheck('https://example.com', 5000, {});
      const opts = mockState.lastRequestOpts as { headers?: Record<string, string> };
      expect(opts?.headers?.['Authorization']).toBeUndefined();
    });

    it('skips Basic Auth Authorization when both user and password are empty', async () => {
      await runHttpCheck('https://example.com', 5000, { authType: 'basic', authUser: '', authPassword: '' });
      const opts = mockState.lastRequestOpts as { headers?: Record<string, string> };
      expect(opts?.headers?.['Authorization']).toBeUndefined();
    });

    it('does not override existing Authorization header with bearer when token is empty', async () => {
      await runHttpCheck('https://example.com', 5000, { authType: 'bearer', authToken: '' });
      const opts = mockState.lastRequestOpts as { headers?: Record<string, string> };
      expect(opts?.headers?.['Authorization']).toBeUndefined();
    });
  });
});

// ── runBrowserCheck ──────────────────────────────────────────────────────────

describe('runBrowserCheck', () => {
  beforeEach(() => {
    mockState.https = { statusCode: 200, body: '' };
    mockState.http = { statusCode: 200, body: '' };
  });

  it('returns ok:true for 200 HTML response', async () => {
    mockState.https = { statusCode: 200, body: '<html><body>Hello</body></html>' };
    const result = await runBrowserCheck('https://example.com', {});
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
  });

  it('auto-prepends https:// if missing', async () => {
    mockState.https = { statusCode: 200, body: '<html></html>' };
    const result = await runBrowserCheck('example.com', {});
    expect(result.ok).toBe(true);
  });

  it('returns ok:false for 500 response', async () => {
    mockState.https = { statusCode: 500, body: 'Error' };
    const result = await runBrowserCheck('https://example.com', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
  });

  it('returns yellow for 4xx (client error)', async () => {
    mockState.https = { statusCode: 404, body: 'Not Found' };
    const result = await runBrowserCheck('https://example.com', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('yellow');
  });

  it('checks for expected text in body', async () => {
    mockState.https = { statusCode: 200, body: '<html>Welcome to PulseDock</html>' };
    const result = await runBrowserCheck('https://example.com', { browserExpectedText: 'PulseDock' });
    expect(result.ok).toBe(true);
  });

  it('fails when expected text not found', async () => {
    mockState.https = { statusCode: 200, body: '<html>Other site</html>' };
    const result = await runBrowserCheck('https://example.com', { browserExpectedText: 'PulseDock' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Expected text not found');
  });

  it('checks CSS selector presence', async () => {
    mockState.https = { statusCode: 200, body: '<html><div id="root">app</div></html>' };
    const result = await runBrowserCheck('https://example.com', { browserSelector: '#root' });
    expect(result.ok).toBe(true);
  });

  it('fails when CSS selector not found', async () => {
    mockState.https = { statusCode: 200, body: '<html><div>nothing</div></html>' };
    const result = await runBrowserCheck('https://example.com', { browserSelector: '#missing-element' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Element not found');
  });

  it('respects custom browserStatusCodes', async () => {
    mockState.https = { statusCode: 302, body: '' };
    const result = await runBrowserCheck('https://example.com', { browserStatusCodes: [200, 302] });
    expect(result.ok).toBe(true);
  });

  it('returns ok:false on request error', async () => {
    mockState.https = { statusCode: 0, body: '', shouldError: new Error('Network error') };
    const result = await runBrowserCheck('https://example.com', {});
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Error');
  });

  it('returns timeout message on timeout error', async () => {
    mockState.https = { statusCode: 0, body: '', shouldError: new Error('Request timed out after 5000ms') };
    const result = await runBrowserCheck('https://example.com', {}, 5000);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Timeout');
  });
});

// ── responseBody capture ─────────────────────────────────────────────────────

describe('runHttpCheck — responseBody capture', () => {
  beforeEach(() => {
    mockState.https = { statusCode: 200, body: '' };
    mockState.http = { statusCode: 200, body: '' };
  });

  it('captures responseBody on HTTP status failure', async () => {
    mockState.https = { statusCode: 503, body: '{"error":"Service Unavailable"}' };
    const result = await runHttpCheck('https://example.com');
    expect(result.ok).toBe(false);
    expect(result.responseBody).toBe('{"error":"Service Unavailable"}');
  });

  it('captures responseBody on expectedStatus mismatch', async () => {
    mockState.https = { statusCode: 400, body: '{"code":"BAD_REQUEST"}' };
    const result = await runHttpCheck('https://example.com', 5000, { expectedStatus: 200 });
    expect(result.ok).toBe(false);
    expect(result.responseBody).toBe('{"code":"BAD_REQUEST"}');
  });

  it('captures responseBody when bodyContains assertion fails', async () => {
    mockState.https = { statusCode: 200, body: '{"status":"error"}' };
    const result = await runHttpCheck('https://example.com', 5000, { bodyContains: 'ok' });
    expect(result.ok).toBe(false);
    expect(result.responseBody).toBe('{"status":"error"}');
  });

  it('captures responseBody when bodyJsonPath assertion fails', async () => {
    mockState.https = { statusCode: 200, body: '{"status":"error"}' };
    const result = await runHttpCheck('https://example.com', 5000, {
      bodyJsonPath: '$.status',
      bodyJsonPathExpected: 'ok',
    });
    expect(result.ok).toBe(false);
    expect(result.responseBody).toBeDefined();
    expect(result.responseBody).toContain('error');
  });

  it('captures responseBody when response is not valid JSON for bodyJsonPath check', async () => {
    mockState.https = { statusCode: 200, body: '<html>not json</html>' };
    const result = await runHttpCheck('https://example.com', 5000, { bodyJsonPath: '$.status' });
    expect(result.ok).toBe(false);
    expect(result.responseBody).toContain('<html>');
  });

  it('truncates responseBody to 500 chars', async () => {
    const longBody = 'x'.repeat(1000);
    mockState.https = { statusCode: 500, body: longBody };
    const result = await runHttpCheck('https://example.com');
    expect(result.ok).toBe(false);
    expect(result.responseBody).toBeDefined();
    expect(result.responseBody!.length).toBe(500);
  });

  it('does not include responseBody on successful check', async () => {
    mockState.https = { statusCode: 200, body: 'OK' };
    const result = await runHttpCheck('https://example.com');
    expect(result.ok).toBe(true);
    expect(result.responseBody).toBeUndefined();
  });
});

// ── HTTP Timing Breakdown ─────────────────────────────────────────────────────

describe('runHttpCheck — timing breakdown', () => {
  beforeEach(() => {
    mockState.https = { statusCode: 200, body: '' };
    mockState.http = { statusCode: 200, body: '' };
  });

  it('returns timings object on successful HTTPS request', async () => {
    mockState.https = { statusCode: 200, body: 'OK', secureConnect: true };
    const result = await runHttpCheck('https://example.com');
    expect(result.ok).toBe(true);
    expect(result.timings).toBeDefined();
    expect(result.timings).not.toBeNull();
    expect(typeof result.timings!.dnsMs).toBe('number');
    expect(typeof result.timings!.tcpMs).toBe('number');
    expect(typeof result.timings!.ttfbMs).toBe('number');
    expect(typeof result.timings!.downloadMs).toBe('number');
  });

  it('TLS timing is null for HTTP (not HTTPS) targets', async () => {
    mockState.http = { statusCode: 200, body: 'OK' };
    const result = await runHttpCheck('http://example.com');
    expect(result.ok).toBe(true);
    expect(result.timings).toBeDefined();
    expect(result.timings!.tlsMs).toBeNull();
  });

  it('returns timings even on failed status code', async () => {
    mockState.https = { statusCode: 500, body: 'Server Error' };
    const result = await runHttpCheck('https://example.com');
    expect(result.ok).toBe(false);
    expect(result.timings).toBeDefined();
    expect(result.timings!.ttfbMs).not.toBeNull();
  });

  it('timings object has all required fields', async () => {
    mockState.https = { statusCode: 200, body: 'OK' };
    const result = await runHttpCheck('https://example.com');
    expect(result.timings).toMatchObject({
      dnsMs: expect.anything(),
      tcpMs: expect.anything(),
      ttfbMs: expect.anything(),
      downloadMs: expect.anything(),
    });
    expect('tlsMs' in (result.timings ?? {})).toBe(true);
  });

  it('timings are absent on network error (no connection)', async () => {
    mockState.https = { statusCode: 0, body: '', shouldError: new Error('ECONNREFUSED') };
    const result = await runHttpCheck('https://example.com');
    expect(result.ok).toBe(false);
    expect(result.timings).toBeUndefined();
  });

  it('timing values are non-negative numbers when present', async () => {
    mockState.https = { statusCode: 200, body: 'OK' };
    const result = await runHttpCheck('https://example.com');
    const t = result.timings!;
    if (t.dnsMs !== null) expect(t.dnsMs).toBeGreaterThanOrEqual(0);
    if (t.tcpMs !== null) expect(t.tcpMs).toBeGreaterThanOrEqual(0);
    if (t.ttfbMs !== null) expect(t.ttfbMs).toBeGreaterThanOrEqual(0);
    if (t.downloadMs !== null) expect(t.downloadMs).toBeGreaterThanOrEqual(0);
  });
});

// ── auditSecurityHeaders ─────────────────────────────────────────────────────

describe('auditSecurityHeaders', () => {
  it('returns grade F for empty headers', () => {
    const result = auditSecurityHeaders({});
    expect(result.grade).toBe('F');
    expect(result.score).toBe(0);
    expect(result.headers.every((h) => !h.present)).toBe(true);
  });

  it('returns grade A for all security headers present', () => {
    const headers = {
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'content-security-policy': "default-src 'self'",
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=()',
      'x-xss-protection': '1; mode=block',
      'cache-control': 'no-store',
    };
    const result = auditSecurityHeaders(headers);
    expect(result.grade).toBe('A');
    expect(result.score).toBe(100);
    expect(result.headers.every((h) => h.present)).toBe(true);
  });

  it('is case-insensitive for header names', () => {
    const headers = {
      'Strict-Transport-Security': 'max-age=31536000',
      'Content-Security-Policy': "default-src 'self'",
    };
    const result = auditSecurityHeaders(headers);
    const hsts = result.headers.find((h) => h.name === 'Strict-Transport-Security');
    expect(hsts?.present).toBe(true);
  });

  it('stores actual header value when present', () => {
    const headers = {
      'x-frame-options': 'SAMEORIGIN',
    };
    const result = auditSecurityHeaders(headers);
    const xfo = result.headers.find((h) => h.name === 'X-Frame-Options');
    expect(xfo?.value).toBe('SAMEORIGIN');
  });

  it('stores null value when header is absent', () => {
    const result = auditSecurityHeaders({});
    const hsts = result.headers.find((h) => h.name === 'Strict-Transport-Security');
    expect(hsts?.present).toBe(false);
    expect(hsts?.value).toBeNull();
  });

  it('includes severity for each header', () => {
    const result = auditSecurityHeaders({});
    for (const h of result.headers) {
      expect(['critical', 'warning', 'info']).toContain(h.severity);
    }
  });

  it('returns partial grade B/C for partial headers', () => {
    // Only non-critical headers (warning + info): score < 90 → B or lower
    const headers = {
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
    };
    const result = auditSecurityHeaders(headers);
    expect(['B', 'C', 'D', 'F']).toContain(result.grade);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
  });
});

describe('runHttpCheck — content change detection', () => {
  beforeEach(() => {
    mockState.https = { statusCode: 200, body: '<html><body>Hello World</body></html>' };
  });

  it('returns responseBodyHash when detectContentChanges=true', async () => {
    const result = await runHttpCheck('https://example.com', 5000, { detectContentChanges: true });
    expect(result.ok).toBe(true);
    expect(result.responseBodyHash).toBeTypeOf('string');
    expect(result.responseBodyHash!.length).toBe(64);
  });

  it('responseBodyHash is null when detectContentChanges is not set', async () => {
    const result = await runHttpCheck('https://example.com', 5000, {});
    expect(result.responseBodyHash).toBeNull();
  });

  it('same body produces same hash across calls', async () => {
    mockState.https = { statusCode: 200, body: 'stable content' };
    const r1 = await runHttpCheck('https://example.com', 5000, { detectContentChanges: true });
    const r2 = await runHttpCheck('https://example.com', 5000, { detectContentChanges: true });
    expect(r1.responseBodyHash).toBe(r2.responseBodyHash);
  });

  it('different body produces different hash', async () => {
    mockState.https = { statusCode: 200, body: 'original content' };
    const r1 = await runHttpCheck('https://example.com', 5000, { detectContentChanges: true });
    mockState.https = { statusCode: 200, body: 'updated content — something changed!' };
    const r2 = await runHttpCheck('https://example.com', 5000, { detectContentChanges: true });
    expect(r1.responseBodyHash).not.toBe(r2.responseBodyHash);
  });

  it('includes hash even when bodyContains also passes', async () => {
    mockState.https = { statusCode: 200, body: '<html>status: ok</html>' };
    const result = await runHttpCheck('https://example.com', 5000, {
      detectContentChanges: true,
      bodyContains: 'status: ok',
    });
    expect(result.ok).toBe(true);
    expect(result.responseBodyHash).toBeTypeOf('string');
  });
});

// ─── Redirect following ───────────────────────────────────────────────────────
describe('runHttpCheck — redirect following', () => {
  beforeEach(() => {
    mockState.https = { statusCode: 200, body: 'final' };
    mockState.http = { statusCode: 200, body: 'final' };
    mockState.responseQueue = [];
  });

  it('follows a single 301 redirect to final 200', async () => {
    mockState.responseQueue = [
      { statusCode: 301, body: '', location: 'https://example.com/new' },
      { statusCode: 200, body: 'redirected landing' },
    ];
    const result = await runHttpCheck('https://example.com', 5000, { followRedirects: true });
    expect(result.ok).toBe(true);
    expect(result.redirectChain).toHaveLength(1);
    expect(result.redirectChain![0]).toBe('https://example.com');
  });

  it('follows multiple redirects accumulating the chain', async () => {
    mockState.responseQueue = [
      { statusCode: 302, body: '', location: 'https://example.com/step1' },
      { statusCode: 302, body: '', location: 'https://example.com/step2' },
      { statusCode: 200, body: 'final page' },
    ];
    const result = await runHttpCheck('https://example.com', 5000, { followRedirects: true });
    expect(result.ok).toBe(true);
    expect(result.redirectChain).toHaveLength(2);
  });

  it('does NOT follow redirect when followRedirects=false', async () => {
    mockState.https = { statusCode: 301, body: '' };
    const result = await runHttpCheck('https://example.com', 5000, { followRedirects: false });
    // 301 is not in default expected statuses so it should be red
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(301);
  });

  it('default behavior follows redirects (followRedirects unset)', async () => {
    mockState.responseQueue = [
      { statusCode: 302, body: '', location: 'https://example.com/dest' },
      { statusCode: 200, body: 'ok' },
    ];
    const result = await runHttpCheck('https://example.com', 5000, {});
    expect(result.ok).toBe(true);
  });

  it('includes redirect info in success message', async () => {
    mockState.responseQueue = [
      { statusCode: 301, body: '', location: 'https://example.com/new' },
      { statusCode: 200, body: 'done' },
    ];
    const result = await runHttpCheck('https://example.com', 5000, {});
    expect(result.ok).toBe(true);
    expect(result.message).toContain('redirect');
  });

  it('returns final non-redirect statusCode even after redirect chain', async () => {
    mockState.responseQueue = [
      { statusCode: 302, body: '', location: 'https://example.com/gone' },
      { statusCode: 404, body: 'not found' },
    ];
    const result = await runHttpCheck('https://example.com', 5000, {});
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
    expect(result.redirectChain).toHaveLength(1);
  });

  it('resolves relative redirect location against current URL', async () => {
    mockState.responseQueue = [
      { statusCode: 302, body: '', location: '/relative/path' },
      { statusCode: 200, body: 'ok' },
    ];
    const result = await runHttpCheck('https://example.com/original', 5000, {});
    expect(result.ok).toBe(true);
    expect(result.redirectChain![0]).toBe('https://example.com/original');
  });

  it('no redirectChain property when no redirects occurred', async () => {
    mockState.https = { statusCode: 200, body: 'direct' };
    const result = await runHttpCheck('https://example.com', 5000, {});
    // Should not have redirectChain key or it should be empty/absent
    expect('redirectChain' in result ? (result as { redirectChain?: string[] }).redirectChain ?? [] : []).toHaveLength(0);
  });
});
