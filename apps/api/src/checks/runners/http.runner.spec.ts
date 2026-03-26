import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { runHttpCheck, runBrowserCheck, htmlContainsSelector } from './http.runner';

// ── http/https mock helpers ───────────────────────────────────────────────────

interface MockSocketEvents {
  lookup?: () => void;
  connect?: () => void;
  secureConnect?: () => void;
}

/**
 * Creates a fake Node.js http/https request/response pair that simulates socket
 * timing events (lookup, connect, secureConnect) and returns a body.
 */
function createMockHttpModule(
  statusCode: number,
  body: string,
  socketEvents: MockSocketEvents = {},
  delayMs = 0,
  shouldError?: Error,
) {
  return {
    request: vi.fn((_opts: unknown, callback: (res: EventEmitter & { statusCode: number }) => void) => {
      const req = new EventEmitter() as EventEmitter & {
        write: ReturnType<typeof vi.fn>;
        end: ReturnType<typeof vi.fn>;
        destroy: (err?: Error) => void;
      };

      req.write = vi.fn();
      req.end = vi.fn(() => {
        // Simulate socket events
        setTimeout(() => {
          if (shouldError) {
            req.emit('error', shouldError);
            return;
          }

          const socket = new EventEmitter();
          req.emit('socket', socket);

          setTimeout(() => {
            socket.emit('lookup', null, '1.2.3.4');

            setTimeout(() => {
              socket.emit('connect');

              if (socketEvents.secureConnect !== undefined) {
                setTimeout(() => {
                  socket.emit('secureConnect');
                  fireResponse();
                }, 5);
              } else {
                fireResponse();
              }
            }, 5);
          }, 5);
        }, delayMs);
      });

      req.destroy = (err?: Error) => {
        if (err) req.emit('error', err);
      };

      function fireResponse() {
        const res = new EventEmitter() as EventEmitter & { statusCode: number };
        res.statusCode = statusCode;
        callback(res);

        setTimeout(() => {
          res.emit('data', Buffer.from(body));
          res.emit('end');
        }, 5);
      }

      return req;
    }),
  };
}

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
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok:true for 200 response', async () => {
    const mockHttps = createMockHttpModule(200, '');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com');
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.level).toBe('green');
  });

  it('returns ok:false for 500 response', async () => {
    const mockHttps = createMockHttpModule(500, 'Internal Server Error');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com');
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.level).toBe('red');
  });

  it('returns ok:false on request error', async () => {
    const mockHttps = createMockHttpModule(0, '', {}, 0, new Error('ECONNREFUSED'));
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com');
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(0);
    expect(result.message).toContain('ECONNREFUSED');
  });

  it('respects expectedStatus as a single value', async () => {
    const mockHttps = createMockHttpModule(404, 'Not Found');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', 5000, { expectedStatus: 404 });
    expect(result.ok).toBe(true);
  });

  it('respects expectedStatus as an array', async () => {
    const mockHttps = createMockHttpModule(201, '');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', 5000, { expectedStatus: [200, 201] });
    expect(result.ok).toBe(true);
  });

  it('fails when status not in expectedStatus array', async () => {
    const mockHttps = createMockHttpModule(200, '');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', 5000, { expectedStatus: [201, 202] });
    expect(result.ok).toBe(false);
  });

  it('checks bodyContains (case-insensitive)', async () => {
    const mockHttps = createMockHttpModule(200, 'status: ok');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', 5000, { bodyContains: 'STATUS: OK' });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('body contains');
  });

  it('fails when bodyContains not found', async () => {
    const mockHttps = createMockHttpModule(200, 'error: service unavailable');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', 5000, { bodyContains: '"status":"ok"' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('does not contain');
  });

  it('checks bodyJsonPath truthy assertion', async () => {
    const mockHttps = createMockHttpModule(200, JSON.stringify({ status: 'ok' }));
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', 5000, { bodyJsonPath: '$.status' });
    expect(result.ok).toBe(true);
  });

  it('fails bodyJsonPath when value does not match expected', async () => {
    const mockHttps = createMockHttpModule(200, JSON.stringify({ status: 'degraded' }));
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', 5000, {
      bodyJsonPath: '$.status',
      bodyJsonPathExpected: 'ok',
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('JSON path');
  });

  it('fails bodyJsonPath when response is not valid JSON', async () => {
    const mockHttps = createMockHttpModule(200, 'not json at all');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', 5000, { bodyJsonPath: '$.status' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('not valid JSON');
  });

  it('returns green when responseTimeThresholdMs is invalid (negative)', async () => {
    const mockHttps = createMockHttpModule(200, 'all good');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    // Negative threshold is guarded (> 0 check), so it's skipped — should still pass
    const result = await run('https://example.com', 5000, { responseTimeThresholdMs: -1 });
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
  });

  it('uses custom httpMethod via request options', async () => {
    const mockHttps = createMockHttpModule(200, '');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    await run('https://example.com', 5000, { httpMethod: 'POST' });
    const callOpts = mockHttps.request.mock.calls[0][0] as { method: string };
    expect(callOpts.method).toBe('POST');
  });

  it('sanitizes unknown httpMethod to GET', async () => {
    const mockHttps = createMockHttpModule(200, '');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    await run('https://example.com', 5000, { httpMethod: 'INVALID_METHOD' });
    const callOpts = mockHttps.request.mock.calls[0][0] as { method: string };
    expect(callOpts.method).toBe('GET');
  });

  it('passes requestHeaders to the request', async () => {
    const mockHttps = createMockHttpModule(200, '');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    await run('https://example.com', 5000, {
      requestHeaders: { 'X-Api-Key': 'secret', Authorization: 'Bearer token' },
    });
    const callOpts = mockHttps.request.mock.calls[0][0] as { headers: Record<string, string> };
    expect(callOpts.headers['X-Api-Key']).toBe('secret');
    expect(callOpts.headers['Authorization']).toBe('Bearer token');
  });

  it('returns ok:false on request error (timeout)', async () => {
    const mockHttps = createMockHttpModule(0, '', {}, 0, new Error('Request timed out after 100ms'));
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', 100);
    expect(result.ok).toBe(false);
  });
});

// ── runBrowserCheck ──────────────────────────────────────────────────────────

describe('runBrowserCheck', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok:true for 200 HTML response', async () => {
    const mockHttps = createMockHttpModule(200, '<html><body>Hello</body></html>');
    vi.doMock('https', () => mockHttps);
    const { runBrowserCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', {});
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
  });

  it('auto-prepends https:// if missing', async () => {
    const mockHttps = createMockHttpModule(200, '<html></html>');
    vi.doMock('https', () => mockHttps);
    const { runBrowserCheck: run } = await import('./http.runner');
    await run('example.com', {});
    // When protocol is prepended, it uses https module
    expect(mockHttps.request).toHaveBeenCalled();
  });

  it('returns ok:false for 500 response', async () => {
    const mockHttps = createMockHttpModule(500, 'Error');
    vi.doMock('https', () => mockHttps);
    const { runBrowserCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
  });

  it('returns yellow for 4xx (client error)', async () => {
    const mockHttps = createMockHttpModule(404, 'Not Found');
    vi.doMock('https', () => mockHttps);
    const { runBrowserCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', {});
    expect(result.ok).toBe(false);
    expect(result.level).toBe('yellow');
  });

  it('checks for expected text in body', async () => {
    const mockHttps = createMockHttpModule(200, '<html>Welcome to PulseDock</html>');
    vi.doMock('https', () => mockHttps);
    const { runBrowserCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', { browserExpectedText: 'PulseDock' });
    expect(result.ok).toBe(true);
  });

  it('fails when expected text not found', async () => {
    const mockHttps = createMockHttpModule(200, '<html>Other site</html>');
    vi.doMock('https', () => mockHttps);
    const { runBrowserCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', { browserExpectedText: 'PulseDock' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Expected text not found');
  });

  it('checks CSS selector presence', async () => {
    const mockHttps = createMockHttpModule(200, '<html><div id="root">app</div></html>');
    vi.doMock('https', () => mockHttps);
    const { runBrowserCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', { browserSelector: '#root' });
    expect(result.ok).toBe(true);
  });

  it('fails when CSS selector not found', async () => {
    const mockHttps = createMockHttpModule(200, '<html><div>nothing</div></html>');
    vi.doMock('https', () => mockHttps);
    const { runBrowserCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', { browserSelector: '#missing-element' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Element not found');
  });

  it('respects custom browserStatusCodes', async () => {
    const mockHttps = createMockHttpModule(302, '');
    vi.doMock('https', () => mockHttps);
    const { runBrowserCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', { browserStatusCodes: [200, 302] });
    expect(result.ok).toBe(true);
  });

  it('returns ok:false on request error', async () => {
    const mockHttps = createMockHttpModule(0, '', {}, 0, new Error('Network error'));
    vi.doMock('https', () => mockHttps);
    const { runBrowserCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', {});
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Error');
  });

  it('returns timeout message on timeout error', async () => {
    const mockHttps = createMockHttpModule(0, '', {}, 0, new Error('Request timed out after 5000ms'));
    vi.doMock('https', () => mockHttps);
    const { runBrowserCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', {}, 5000);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Timeout');
  });

  it('sends browser-like User-Agent header', async () => {
    const mockHttps = createMockHttpModule(200, '');
    vi.doMock('https', () => mockHttps);
    const { runBrowserCheck: run } = await import('./http.runner');
    await run('https://example.com', {});
    const callOpts = mockHttps.request.mock.calls[0][0] as { headers: Record<string, string> };
    const ua = callOpts.headers['User-Agent'];
    expect(ua).toContain('Mozilla');
    expect(ua).toContain('PulseDock');
  });
});

// ── responseBody capture ─────────────────────────────────────────────────────

describe('runHttpCheck — responseBody capture', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures responseBody on HTTP status failure', async () => {
    const mockHttps = createMockHttpModule(503, '{"error":"Service Unavailable"}');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com');
    expect(result.ok).toBe(false);
    expect(result.responseBody).toBe('{"error":"Service Unavailable"}');
  });

  it('captures responseBody on expectedStatus mismatch', async () => {
    const mockHttps = createMockHttpModule(400, '{"code":"BAD_REQUEST"}');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', 5000, { expectedStatus: 200 });
    expect(result.ok).toBe(false);
    expect(result.responseBody).toBe('{"code":"BAD_REQUEST"}');
  });

  it('captures responseBody when bodyContains assertion fails', async () => {
    const mockHttps = createMockHttpModule(200, '{"status":"error"}');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', 5000, { bodyContains: 'ok' });
    expect(result.ok).toBe(false);
    expect(result.responseBody).toBe('{"status":"error"}');
  });

  it('captures responseBody when bodyJsonPath assertion fails', async () => {
    const mockHttps = createMockHttpModule(200, '{"status":"error"}');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', 5000, {
      bodyJsonPath: '$.status',
      bodyJsonPathExpected: 'ok',
    });
    expect(result.ok).toBe(false);
    expect(result.responseBody).toBeDefined();
    expect(result.responseBody).toContain('error');
  });

  it('captures responseBody when response is not valid JSON for bodyJsonPath check', async () => {
    const mockHttps = createMockHttpModule(200, '<html>not json</html>');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com', 5000, { bodyJsonPath: '$.status' });
    expect(result.ok).toBe(false);
    expect(result.responseBody).toContain('<html>');
  });

  it('truncates responseBody to 500 chars', async () => {
    const longBody = 'x'.repeat(1000);
    const mockHttps = createMockHttpModule(500, longBody);
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com');
    expect(result.ok).toBe(false);
    expect(result.responseBody).toBeDefined();
    expect(result.responseBody!.length).toBe(500);
  });

  it('does not include responseBody on successful check', async () => {
    const mockHttps = createMockHttpModule(200, 'OK');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com');
    expect(result.ok).toBe(true);
    expect(result.responseBody).toBeUndefined();
  });
});

// ── HTTP Timing Breakdown ─────────────────────────────────────────────────────

describe('runHttpCheck — timing breakdown', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns timings object on successful HTTPS request', async () => {
    const mockHttps = createMockHttpModule(200, 'OK', { secureConnect: () => undefined });
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com');
    expect(result.ok).toBe(true);
    expect(result.timings).toBeDefined();
    expect(result.timings).not.toBeNull();
    expect(typeof result.timings!.dnsMs).toBe('number');
    expect(typeof result.timings!.tcpMs).toBe('number');
    expect(typeof result.timings!.ttfbMs).toBe('number');
    expect(typeof result.timings!.downloadMs).toBe('number');
  });

  it('TLS timing is null for HTTP (not HTTPS) targets', async () => {
    const mockHttp = createMockHttpModule(200, 'OK');
    vi.doMock('http', () => mockHttp);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('http://example.com');
    expect(result.ok).toBe(true);
    expect(result.timings).toBeDefined();
    expect(result.timings!.tlsMs).toBeNull();
  });

  it('returns timings even on failed status code', async () => {
    const mockHttps = createMockHttpModule(500, 'Server Error');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com');
    expect(result.ok).toBe(false);
    expect(result.timings).toBeDefined();
    expect(result.timings!.ttfbMs).not.toBeNull();
  });

  it('timings object has all required fields', async () => {
    const mockHttps = createMockHttpModule(200, 'OK');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com');
    expect(result.timings).toMatchObject({
      dnsMs: expect.anything(),
      tcpMs: expect.anything(),
      ttfbMs: expect.anything(),
      downloadMs: expect.anything(),
    });
    // tlsMs is present as a key (may be null for HTTPS without secureConnect in mock)
    expect('tlsMs' in (result.timings ?? {})).toBe(true);
  });

  it('timings are absent on network error (no connection)', async () => {
    const mockHttps = createMockHttpModule(0, '', {}, 0, new Error('ECONNREFUSED'));
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com');
    expect(result.ok).toBe(false);
    // On error, timings are not captured in the error catch path
    expect(result.timings).toBeUndefined();
  });

  it('timing values are non-negative numbers when present', async () => {
    const mockHttps = createMockHttpModule(200, 'OK');
    vi.doMock('https', () => mockHttps);
    const { runHttpCheck: run } = await import('./http.runner');
    const result = await run('https://example.com');
    const t = result.timings!;
    if (t.dnsMs !== null) expect(t.dnsMs).toBeGreaterThanOrEqual(0);
    if (t.tcpMs !== null) expect(t.tcpMs).toBeGreaterThanOrEqual(0);
    if (t.ttfbMs !== null) expect(t.ttfbMs).toBeGreaterThanOrEqual(0);
    if (t.downloadMs !== null) expect(t.downloadMs).toBeGreaterThanOrEqual(0);
  });
});
