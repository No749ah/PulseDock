import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonAssertionPlugin } from './json-assertion.plugin';
import type { PluginExecutionContext } from '../plugin.contracts';

const ctx = (config: Record<string, unknown> = {}): PluginExecutionContext => ({
  monitor: { id: 'm1', name: 'Test', type: 'HTTP', target: 'https://api.example.com/health', timeoutMs: 5000 },
  config,
  nowIso: new Date().toISOString(),
});

const mockFetch = (body: unknown, status = 200, ok = true) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  }));
};

describe('json-assertion plugin', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns red when path is missing', async () => {
    const r = await jsonAssertionPlugin.run(ctx({ expected: 'ok' }));
    expect(r.level).toBe('red');
    expect(r.message).toMatch(/required/);
  });

  it('returns red when expected is missing', async () => {
    const r = await jsonAssertionPlugin.run(ctx({ path: 'status' }));
    expect(r.level).toBe('red');
    expect(r.message).toMatch(/required/);
  });

  it('returns red when response is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error('not json'); },
    }));
    const r = await jsonAssertionPlugin.run(ctx({ path: 'status', expected: 'ok' }));
    expect(r.level).toBe('red');
    expect(r.message).toMatch(/not valid JSON/);
  });

  it('returns green when field matches expected', async () => {
    mockFetch({ status: 'ok', version: '1.2.3' });
    const r = await jsonAssertionPlugin.run(ctx({ path: 'status', expected: 'ok' }));
    expect(r.level).toBe('green');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('"status" = "ok"');
  });

  it('returns red when field value does not match', async () => {
    mockFetch({ status: 'degraded' });
    const r = await jsonAssertionPlugin.run(ctx({ path: 'status', expected: 'ok' }));
    expect(r.level).toBe('red');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('degraded');
    expect(r.message).toContain('ok');
  });

  it('returns yellow when field matches warnOn value', async () => {
    mockFetch({ status: 'degraded' });
    const r = await jsonAssertionPlugin.run(ctx({ path: 'status', expected: 'ok', warnOn: 'degraded' }));
    expect(r.level).toBe('yellow');
    expect(r.ok).toBe(false);
  });

  it('returns red when path not found', async () => {
    mockFetch({ other: 'field' });
    const r = await jsonAssertionPlugin.run(ctx({ path: 'status', expected: 'ok' }));
    expect(r.level).toBe('red');
    expect(r.message).toMatch(/not found/);
  });

  it('supports nested paths', async () => {
    mockFetch({ data: { health: { status: 'ok' } } });
    const r = await jsonAssertionPlugin.run(ctx({ path: 'data.health.status', expected: 'ok' }));
    expect(r.level).toBe('green');
  });

  it('returns red on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const r = await jsonAssertionPlugin.run(ctx({ path: 'status', expected: 'ok' }));
    expect(r.level).toBe('red');
    expect(r.message).toContain('network error');
  });
});
