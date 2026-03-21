import { describe, it, expect, vi, beforeEach } from 'vitest';
import { responseTimePlugin } from './response-time.plugin';
import type { PluginExecutionContext } from '../plugin.contracts';

const ctx = (config: Record<string, unknown> = {}): PluginExecutionContext => ({
  monitor: { id: 'm1', name: 'Test', type: 'HTTP', target: 'https://example.com', timeoutMs: 5000 },
  config,
  nowIso: new Date().toISOString(),
});

describe('response-time plugin', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns red when no thresholds configured', async () => {
    const r = await responseTimePlugin.run(ctx({}));
    expect(r.level).toBe('red');
    expect(r.ok).toBe(false);
  });

  it('returns green when response is fast', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const r = await responseTimePlugin.run(ctx({ criticalMs: 5000 }));
    expect(r.level).toBe('green');
    expect(r.ok).toBe(true);
  });

  it('returns yellow when response exceeds warnMs but not criticalMs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      await new Promise(res => setTimeout(res, 50));
      return { ok: true, status: 200 };
    }));
    const r = await responseTimePlugin.run(ctx({ warnMs: 1, criticalMs: 60000 }));
    expect(r.level).toBe('yellow');
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/exceeds warning/);
  });

  it('returns red when response exceeds criticalMs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      await new Promise(res => setTimeout(res, 50));
      return { ok: true, status: 200 };
    }));
    const r = await responseTimePlugin.run(ctx({ criticalMs: 1 }));
    expect(r.level).toBe('red');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/exceeds critical/);
  });

  it('returns red on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    const r = await responseTimePlugin.run(ctx({ criticalMs: 3000 }));
    expect(r.level).toBe('red');
    expect(r.message).toContain('timeout');
  });
});
