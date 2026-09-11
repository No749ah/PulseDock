import { describe, it, expect, vi, beforeEach } from 'vitest';
import { headerAssertionPlugin } from './header-assertion.plugin';

const makeCtx = (config: Record<string, unknown> = {}) => ({
  monitor: { id: 'm1', name: 'Test', type: 'HTTP' as const, target: 'https://example.com', timeoutMs: 5000 },
  config,
  nowIso: new Date().toISOString(),
});

describe('http.header-assertion plugin', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns red when headerName is missing from config', async () => {
    const result = await headerAssertionPlugin.run(makeCtx({ headerName: '' }));
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('headerName is required');
  });

  it('returns green when header is present and no expected value required', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['x-custom', 'hello world']]),
    }));
    const result = await headerAssertionPlugin.run(makeCtx({ headerName: 'x-custom' }));
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.message).toContain('x-custom');
  });

  it('returns green when header value contains expected substring', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-security-policy', "default-src 'self'; script-src 'nonce-abc'"]]),
    }));
    const result = await headerAssertionPlugin.run(makeCtx({
      headerName: 'content-security-policy',
      expectedValue: "default-src 'self'",
    }));
    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
  });

  it('returns red when header value does not contain expected substring', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['x-frame-options', 'SAMEORIGIN']]),
    }));
    const result = await headerAssertionPlugin.run(makeCtx({
      headerName: 'x-frame-options',
      expectedValue: 'DENY',
    }));
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('DENY');
  });

  it('returns yellow when header is absent and failOnMissing is false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map(),
    }));
    const result = await headerAssertionPlugin.run(makeCtx({
      headerName: 'strict-transport-security',
      failOnMissing: false,
    }));
    expect(result.ok).toBe(true);
    expect(result.level).toBe('yellow');
  });

  it('returns red when header is absent and failOnMissing is true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map(),
    }));
    const result = await headerAssertionPlugin.run(makeCtx({
      headerName: 'strict-transport-security',
      failOnMissing: true,
    }));
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
  });

  it('returns red on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await headerAssertionPlugin.run(makeCtx({ headerName: 'x-test' }));
    expect(result.ok).toBe(false);
    expect(result.level).toBe('red');
    expect(result.message).toContain('ECONNREFUSED');
  });
});
