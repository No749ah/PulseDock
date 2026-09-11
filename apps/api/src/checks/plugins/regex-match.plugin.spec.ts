import { describe, it, expect, vi, beforeEach } from 'vitest';
import { regexMatchPlugin } from './regex-match.plugin';
import type { PluginExecutionContext } from '../plugin.contracts';

const ctx = (config: Record<string, unknown> = {}): PluginExecutionContext => ({
  monitor: { id: 'm1', name: 'Test', type: 'HTTP', target: 'https://example.com', timeoutMs: 5000 },
  config,
  nowIso: new Date().toISOString(),
});

describe('regex-match plugin', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns red when pattern is empty', async () => {
    const r = await regexMatchPlugin.run(ctx({ pattern: '' }));
    expect(r.level).toBe('red');
    expect(r.ok).toBe(false);
  });

  it('returns red for invalid regex', async () => {
    const r = await regexMatchPlugin.run(ctx({ pattern: '[invalid' }));
    expect(r.level).toBe('red');
    expect(r.message).toMatch(/Invalid regex/);
  });

  it('returns green when pattern matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'Server version: 2.3.1',
    }));
    const r = await regexMatchPlugin.run(ctx({ pattern: '\\d+\\.\\d+\\.\\d+' }));
    expect(r.level).toBe('green');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('2.3.1');
  });

  it('returns red when pattern does not match', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'Hello world',
    }));
    const r = await regexMatchPlugin.run(ctx({ pattern: '\\d+\\.\\d+\\.\\d+' }));
    expect(r.level).toBe('red');
    expect(r.message).toMatch(/not found/);
  });

  it('returns red when expectedMatch does not match captured group', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'version 1.2.3',
    }));
    const r = await regexMatchPlugin.run(ctx({ pattern: '\\d+\\.\\d+\\.\\d+', expectedMatch: '9.9.9' }));
    expect(r.level).toBe('red');
    expect(r.message).toContain('1.2.3');
    expect(r.message).toContain('9.9.9');
  });

  it('returns green when expectedMatch equals captured value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'version 1.2.3',
    }));
    const r = await regexMatchPlugin.run(ctx({ pattern: '\\d+\\.\\d+\\.\\d+', expectedMatch: '1.2.3' }));
    expect(r.level).toBe('green');
    expect(r.ok).toBe(true);
  });

  it('returns red on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')));
    const r = await regexMatchPlugin.run(ctx({ pattern: 'ok' }));
    expect(r.level).toBe('red');
    expect(r.message).toContain('network failure');
  });
});
