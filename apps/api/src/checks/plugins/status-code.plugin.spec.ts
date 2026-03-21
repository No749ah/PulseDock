import { describe, it, expect, vi, beforeEach } from 'vitest';
import { statusCodePlugin } from './status-code.plugin';
import type { PluginExecutionContext } from '../plugin.contracts';

const ctx = (config: Record<string, unknown> = {}): PluginExecutionContext => ({
  monitor: { id: 'm1', name: 'Test', type: 'HTTP', target: 'https://example.com', timeoutMs: 5000 },
  config,
  nowIso: new Date().toISOString(),
});

describe('status-code plugin', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns red when allowedCodes is empty', async () => {
    const r = await statusCodePlugin.run(ctx({}));
    expect(r.level).toBe('red');
    expect(r.message).toMatch(/required/);
  });

  it('returns green when status code is in allowed list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const r = await statusCodePlugin.run(ctx({ allowedCodes: '200,204' }));
    expect(r.level).toBe('green');
    expect(r.ok).toBe(true);
  });

  it('returns green for 204 no-content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 }));
    const r = await statusCodePlugin.run(ctx({ allowedCodes: '200,204' }));
    expect(r.level).toBe('green');
  });

  it('returns red when status code not in allowed list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const r = await statusCodePlugin.run(ctx({ allowedCodes: '200' }));
    expect(r.level).toBe('red');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('500');
  });

  it('returns yellow when status matches warnCodes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 301 }));
    const r = await statusCodePlugin.run(ctx({ allowedCodes: '200', warnCodes: '301,302' }));
    expect(r.level).toBe('yellow');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/warning/);
  });

  it('returns red on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('refused')));
    const r = await statusCodePlugin.run(ctx({ allowedCodes: '200' }));
    expect(r.level).toBe('red');
    expect(r.message).toContain('refused');
  });
});
