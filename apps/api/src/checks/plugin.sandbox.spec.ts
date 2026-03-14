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
