import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirectCheckPlugin } from './redirect-check.plugin';

const makeCtx = (config: Record<string, unknown> = {}) => ({
  monitor: { id: 'm1', name: 'Test', type: 'HTTP' as const, target: 'http://example.com', timeoutMs: 5000 },
  config,
  nowIso: new Date().toISOString(),
});

/** Creates a redirect response mock */
function makeRedirect(location: string, status = 301) {
  return { ok: false, status, headers: new Map([['location', location]]) };
}
/** Creates a final 200 response mock */
function makeFinal(status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: new Map() };
}

describe('http.redirect-check plugin', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('passes when no redirects and no expected URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeFinal(200)));
    const result = await redirectCheckPlugin.run(makeCtx({}));
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toContain('No redirects');
  });

  it('follows redirect and passes when final URL matches expected', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(makeRedirect('https://example.com/'))
      .mockResolvedValueOnce(makeFinal(200)));
    const result = await redirectCheckPlugin.run(makeCtx({ expectedFinalUrl: 'https://example.com/' }));
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toContain('1 hop');
  });

  it('fails when final URL does not match expected', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(makeRedirect('https://other.com/'))
      .mockResolvedValueOnce(makeFinal(200)));
    const result = await redirectCheckPlugin.run(makeCtx({ expectedFinalUrl: 'https://example.com/' }));
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('does not match');
  });

  it('fails when requireHttps is true and final URL is HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeFinal(200)));
    const result = await redirectCheckPlugin.run(makeCtx({ requireHttps: true }));
    // monitor.target is http://example.com → should fail
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('HTTPS');
  });

  it('passes when requireHttps is true and final URL is HTTPS', async () => {
    const ctx = makeCtx({ requireHttps: true });
    ctx.monitor.target = 'https://example.com';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeFinal(200)));
    const result = await redirectCheckPlugin.run(ctx);
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
  });

  it('fails when redirect chain exceeds maxRedirects', async () => {
    const redirect = makeRedirect('http://example.com/loop');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(redirect));
    const result = await redirectCheckPlugin.run(makeCtx({ maxRedirects: 2 }));
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('exceeded 2 hops');
  });

  it('fails when redirect has no Location header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 301, headers: new Map() }));
    const result = await redirectCheckPlugin.run(makeCtx({}));
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('no Location header');
  });

  it('returns red on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await redirectCheckPlugin.run(makeCtx({}));
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('ECONNREFUSED');
  });
});
