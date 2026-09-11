import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExternalPluginLoader } from './external-plugin-loader';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises');
const mockedFs = vi.mocked(fs);

function makeValidPlugin(overrides: Record<string, unknown> = {}) {
  return {
    id: 'my-custom-plugin',
    displayName: 'My Custom Plugin',
    supportedMonitorTypes: ['HTTP'],
    run: async () => ({ ok: true, statusCode: 200, latencyMs: 50, message: 'OK', level: 'green' as const }),
    ...overrides,
  };
}

describe('ExternalPluginLoader', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── 1. Returns empty array when directory doesn't exist ───────────────────
  it('returns empty array when directory does not exist', async () => {
    mockedFs.access.mockRejectedValue(new Error('ENOENT'));

    const loader = new ExternalPluginLoader('/nonexistent/plugins');
    const result = await loader.loadPlugins();

    expect(result).toEqual([]);
  });

  // ── 2. Loads valid plugin from directory ──────────────────────────────────
  it('loads a valid plugin from directory', async () => {
    const plugin = makeValidPlugin();
    const requireFn = vi.fn().mockReturnValue(plugin);

    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readdir.mockResolvedValue(['my-custom.plugin.js'] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const loader = new ExternalPluginLoader('/plugins', requireFn);
    const result = await loader.loadPlugins();

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('my-custom-plugin');
    expect(result[0]?.displayName).toBe('My Custom Plugin');
  });

  // ── 3. Skips file with missing required fields ────────────────────────────
  it('skips file with missing id field', async () => {
    const plugin = makeValidPlugin({ id: '' });
    const requireFn = vi.fn().mockReturnValue(plugin);

    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readdir.mockResolvedValue(['bad.plugin.js'] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const loader = new ExternalPluginLoader('/plugins', requireFn);
    const result = await loader.loadPlugins();

    expect(result).toHaveLength(0);
  });

  it('skips file with missing displayName field', async () => {
    const plugin = makeValidPlugin({ displayName: 42 }); // wrong type
    const requireFn = vi.fn().mockReturnValue(plugin);

    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readdir.mockResolvedValue(['bad.plugin.js'] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const loader = new ExternalPluginLoader('/plugins', requireFn);
    const result = await loader.loadPlugins();

    expect(result).toHaveLength(0);
  });

  it('skips file with empty supportedMonitorTypes', async () => {
    const plugin = makeValidPlugin({ supportedMonitorTypes: [] });
    const requireFn = vi.fn().mockReturnValue(plugin);

    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readdir.mockResolvedValue(['bad.plugin.js'] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const loader = new ExternalPluginLoader('/plugins', requireFn);
    const result = await loader.loadPlugins();

    expect(result).toHaveLength(0);
  });

  // ── 4. Skips file with non-function run ───────────────────────────────────
  it('skips file with non-function run property', async () => {
    const plugin = makeValidPlugin({ run: 'not-a-function' });
    const requireFn = vi.fn().mockReturnValue(plugin);

    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readdir.mockResolvedValue(['bad.plugin.js'] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const loader = new ExternalPluginLoader('/plugins', requireFn);
    const result = await loader.loadPlugins();

    expect(result).toHaveLength(0);
  });

  // ── 5. Skips file that throws on require ──────────────────────────────────
  it('skips file that throws on require', async () => {
    const requireFn = vi.fn().mockImplementation(() => {
      throw new SyntaxError('Unexpected token');
    });

    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readdir.mockResolvedValue(['throws.plugin.js'] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const loader = new ExternalPluginLoader('/plugins', requireFn);
    const result = await loader.loadPlugins();

    expect(result).toHaveLength(0);
  });

  // ── 6. Filters out non-plugin.js files ───────────────────────────────────
  it('only loads *.plugin.js files', async () => {
    const plugin = makeValidPlugin();
    const requireFn = vi.fn().mockReturnValue(plugin);

    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readdir.mockResolvedValue([
      'my-custom.plugin.js',
      'README.md',
      'my-custom.plugin.ts',
      'helper.js',
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const loader = new ExternalPluginLoader('/plugins', requireFn);
    const result = await loader.loadPlugins();

    expect(requireFn).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });

  // ── 7. Loads multiple valid plugins ──────────────────────────────────────
  it('loads multiple valid plugins from directory', async () => {
    const plugin1 = makeValidPlugin({ id: 'plugin-one', displayName: 'Plugin One' });
    const plugin2 = makeValidPlugin({ id: 'plugin-two', displayName: 'Plugin Two' });
    let callCount = 0;
    const requireFn = vi.fn().mockImplementation(() => {
      callCount++;
      return callCount === 1 ? plugin1 : plugin2;
    });

    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readdir.mockResolvedValue([
      'plugin-one.plugin.js',
      'plugin-two.plugin.js',
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const loader = new ExternalPluginLoader('/plugins', requireFn);
    const result = await loader.loadPlugins();

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('plugin-one');
    expect(result[1]?.id).toBe('plugin-two');
  });

  // ── 8. Skips null/non-object exports ─────────────────────────────────────
  it('skips file that exports null', async () => {
    const requireFn = vi.fn().mockReturnValue(null);

    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readdir.mockResolvedValue(['null.plugin.js'] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const loader = new ExternalPluginLoader('/plugins', requireFn);
    const result = await loader.loadPlugins();

    expect(result).toHaveLength(0);
  });

  // ── 9. Returns empty array when dir is empty ─────────────────────────────
  it('returns empty array when directory contains no plugin files', async () => {
    const requireFn = vi.fn();

    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readdir.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const loader = new ExternalPluginLoader('/plugins', requireFn);
    const result = await loader.loadPlugins();

    expect(requireFn).not.toHaveBeenCalled();
    expect(result).toHaveLength(0);
  });

  // ── 10. getPluginDir returns correct dir ─────────────────────────────────
  it('exposes the configured plugin directory via getPluginDir()', () => {
    const loader = new ExternalPluginLoader('/custom/path/plugins');
    expect(loader.getPluginDir()).toBe('/custom/path/plugins');
  });
});
