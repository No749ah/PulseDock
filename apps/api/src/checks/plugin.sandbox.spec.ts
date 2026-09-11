import { describe, expect, it } from 'vitest';
import { executePluginSafely } from './plugin.sandbox';
import type { MonitorCheckPlugin } from './plugin.contracts';

const baseContext = {
  monitor: {
    id: 'm1',
    name: 'Plugin monitor',
    type: 'HTTP' as const,
    target: 'https://example.com',
    timeoutMs: 1000,
  },
  config: {},
  nowIso: new Date().toISOString(),
};

describe('executePluginSafely', () => {
  it('returns sanitized output', async () => {
    const plugin: MonitorCheckPlugin = {
      id: 'test.plugin',
      displayName: 'Test Plugin',
      supportedMonitorTypes: ['HTTP'],
      run: async () => ({
        ok: true,
        statusCode: 200.99,
        latencyMs: 12.8,
        message: 'a'.repeat(900),
        level: 'green',
      }),
    };

    const result = await executePluginSafely(plugin, baseContext, 1000);
    expect(result.statusCode).toBe(200);
    expect(result.latencyMs).toBe(12);
    expect(result.message.length).toBeLessThanOrEqual(500);
    expect(result.level).toBe('green');
  });

  it('sanitizes latencyMs: null → null', async () => {
    const plugin: MonitorCheckPlugin = {
      id: 'test.null-latency',
      displayName: 'Null Latency',
      supportedMonitorTypes: ['HTTP'],
      run: async () => ({ ok: true, statusCode: 200, latencyMs: null as unknown as number, message: 'ok', level: 'green' }),
    };
    const result = await executePluginSafely(plugin, baseContext, 1000);
    expect(result.latencyMs).toBeNull();
  });

  it('sanitizes latencyMs: Infinity → null', async () => {
    const plugin: MonitorCheckPlugin = {
      id: 'test.inf-latency',
      displayName: 'Inf Latency',
      supportedMonitorTypes: ['HTTP'],
      run: async () => ({ ok: true, statusCode: 200, latencyMs: Infinity, message: 'ok', level: 'green' }),
    };
    const result = await executePluginSafely(plugin, baseContext, 1000);
    expect(result.latencyMs).toBeNull();
  });

  it('sanitizes latencyMs: -5 → 0 (Math.max)', async () => {
    const plugin: MonitorCheckPlugin = {
      id: 'test.neg-latency',
      displayName: 'Neg Latency',
      supportedMonitorTypes: ['HTTP'],
      run: async () => ({ ok: true, statusCode: 200, latencyMs: -5, message: 'ok', level: 'green' }),
    };
    const result = await executePluginSafely(plugin, baseContext, 1000);
    expect(result.latencyMs).toBe(0);
  });

  it('sanitizes invalid level to red', async () => {
    const plugin: MonitorCheckPlugin = {
      id: 'test.bad-level',
      displayName: 'Bad Level',
      supportedMonitorTypes: ['HTTP'],
      run: async () => ({ ok: true, statusCode: 200, latencyMs: 10, message: 'ok', level: 'orange' as 'green' }),
    };
    const result = await executePluginSafely(plugin, baseContext, 1000);
    expect(result.level).toBe('red');
  });

  it('sanitizes empty message to default', async () => {
    const plugin: MonitorCheckPlugin = {
      id: 'test.empty-msg',
      displayName: 'Empty Msg',
      supportedMonitorTypes: ['HTTP'],
      run: async () => ({ ok: true, statusCode: 200, latencyMs: 10, message: '', level: 'green' }),
    };
    const result = await executePluginSafely(plugin, baseContext, 1000);
    expect(result.message).toBe('Plugin produced empty message');
  });

  it('handles plugin throwing a non-Error value', async () => {
    const plugin: MonitorCheckPlugin = {
      id: 'test.throw-string',
      displayName: 'Throw String',
      supportedMonitorTypes: ['HTTP'],
      run: async () => { throw 'string error'; },
    };
    const result = await executePluginSafely(plugin, baseContext, 1000);
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Plugin failed: Unknown error');
    expect(result.level).toBe('red');
  });

  it('handles plugin throwing an Error instance (uses error.message)', async () => {
    const plugin: MonitorCheckPlugin = {
      id: 'test.throw-error',
      displayName: 'Throw Error',
      supportedMonitorTypes: ['HTTP'],
      run: async () => { throw new Error('connection refused'); },
    };
    const result = await executePluginSafely(plugin, baseContext, 1000);
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Plugin failed: connection refused');
    expect(result.level).toBe('red');
  });

  it('sanitizes null message to empty string', async () => {
    const plugin: MonitorCheckPlugin = {
      id: 'test.null-message',
      displayName: 'Null Message',
      supportedMonitorTypes: ['HTTP'],
      run: async () => ({ ok: true, statusCode: 200, latencyMs: 10, message: null as unknown as string, level: 'green' as const }),
    };
    const result = await executePluginSafely(plugin, baseContext, 1000);
    expect(result.message).toBe('');
  });

  it('sanitizes non-finite statusCode to 0', async () => {
    const plugin: MonitorCheckPlugin = {
      id: 'test.nan-status',
      displayName: 'NaN Status',
      supportedMonitorTypes: ['HTTP'],
      run: async () => ({ ok: false, statusCode: NaN, latencyMs: 10, message: 'bad', level: 'red' as const }),
    };
    const result = await executePluginSafely(plugin, baseContext, 1000);
    expect(result.statusCode).toBe(0);
  });

  it('deep-freezes nested context objects', async () => {
    let capturedContext: typeof baseContext | null = null;
    const plugin: MonitorCheckPlugin = {
      id: 'test.freeze',
      displayName: 'Freeze Test',
      supportedMonitorTypes: ['HTTP'],
      run: async (ctx) => {
        capturedContext = ctx as typeof baseContext;
        return { ok: true, statusCode: 200, latencyMs: 10, message: 'ok', level: 'green' };
      },
    };
    await executePluginSafely(plugin, { ...baseContext, config: { nested: { deep: true } } }, 1000);
    expect(capturedContext).not.toBeNull();
    expect(Object.isFrozen(capturedContext!)).toBe(true);
    expect(Object.isFrozen((capturedContext as unknown as Record<string, unknown>).monitor)).toBe(true);
    expect(Object.isFrozen((capturedContext as unknown as Record<string, unknown>).config)).toBe(true);
  });

  it('times out long-running plugins', async () => {
    const plugin: MonitorCheckPlugin = {
      id: 'test.slow',
      displayName: 'Slow Plugin',
      supportedMonitorTypes: ['HTTP'],
      run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return {
          ok: true,
          statusCode: 200,
          latencyMs: 10,
          message: 'ok',
          level: 'green',
        };
      },
    };

    const result = await executePluginSafely(plugin, baseContext, 50);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('timed out');
    expect(result.level).toBe('red');
  });
});
