import { Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { MonitorCheckPlugin } from './plugin.contracts';

type RequireFn = (id: string) => unknown;

/**
 * Loads external check plugins from the filesystem at startup.
 *
 * Users can drop CommonJS `.plugin.js` files into the directory configured
 * via the `PLUGIN_DIR` environment variable (default: `./plugins`).
 * Each file must export a valid `MonitorCheckPlugin` object via `module.exports`.
 *
 * Security: catch all errors, never crash the app, log warnings for invalid plugins.
 */
export class ExternalPluginLoader {
  private readonly logger = new Logger(ExternalPluginLoader.name);
  private readonly pluginDir: string;
  private readonly requireFn: RequireFn;

  constructor(pluginDir?: string, requireFn?: RequireFn) {
    this.pluginDir = pluginDir ?? process.env['PLUGIN_DIR'] ?? './plugins';
    // Wrapped so tests can inject a mock without touching global require
    this.requireFn = requireFn ?? ((id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(id);
    });
  }

  /** Returns the resolved plugin directory path (useful for logging). */
  getPluginDir(): string {
    return this.pluginDir;
  }

  /**
   * Scans the plugin directory for `*.plugin.js` files, loads each via
   * require(), validates its shape, and returns the valid plugins.
   *
   * Never throws — invalid/unreadable files are skipped with a warning.
   */
  async loadPlugins(): Promise<MonitorCheckPlugin[]> {
    // Check directory exists
    try {
      await fs.access(this.pluginDir);
    } catch {
      this.logger.log(`Plugin dir ${this.pluginDir} not found, skipping`);
      return [];
    }

    let filenames: string[];
    try {
      const entries = await fs.readdir(this.pluginDir);
      filenames = (entries as string[]).filter((f) => f.endsWith('.plugin.js'));
    } catch (err) {
      this.logger.warn(
        `Failed to read plugin dir ${this.pluginDir}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }

    if (filenames.length === 0) {
      return [];
    }

    const plugins: MonitorCheckPlugin[] = [];

    for (const filename of filenames) {
      const filePath = path.resolve(this.pluginDir, filename);
      let mod: unknown;

      try {
        mod = this.requireFn(filePath);
      } catch (err) {
        this.logger.warn(
          `Failed to require plugin ${filename}: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }

      const plugin = this.validatePlugin(mod, filename);
      if (plugin) {
        plugins.push(plugin);
        this.logger.log(`Loaded external plugin: ${plugin.id} (${filename})`);
      }
    }

    return plugins;
  }

  private validatePlugin(mod: unknown, filename: string): MonitorCheckPlugin | null {
    if (mod === null || mod === undefined || typeof mod !== 'object' || Array.isArray(mod)) {
      this.logger.warn(`Plugin ${filename}: module.exports must be a plain object`);
      return null;
    }

    const p = mod as Record<string, unknown>;

    if (typeof p['id'] !== 'string' || p['id'].trim() === '') {
      this.logger.warn(`Plugin ${filename}: missing or empty 'id' field`);
      return null;
    }

    if (typeof p['displayName'] !== 'string') {
      this.logger.warn(`Plugin ${filename}: 'displayName' must be a string`);
      return null;
    }

    if (!Array.isArray(p['supportedMonitorTypes']) || p['supportedMonitorTypes'].length === 0) {
      this.logger.warn(`Plugin ${filename}: 'supportedMonitorTypes' must be a non-empty array`);
      return null;
    }

    if (typeof p['run'] !== 'function') {
      this.logger.warn(`Plugin ${filename}: 'run' must be a function`);
      return null;
    }

    return mod as MonitorCheckPlugin;
  }
}
