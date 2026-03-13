import type { MonitorType } from '../types';
import type { MonitorCheckPlugin } from './plugin.contracts';

export class PluginRegistry {
  private readonly plugins = new Map<string, MonitorCheckPlugin>();

  register(plugin: MonitorCheckPlugin) {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin already registered: ${plugin.id}`);
    }
    this.plugins.set(plugin.id, plugin);
  }

  get(pluginId: string, monitorType: MonitorType) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return null;
    if (!plugin.supportedMonitorTypes.includes(monitorType)) return null;
    return plugin;
  }

  list() {
    return Array.from(this.plugins.values()).map((p) => ({
      id: p.id,
      displayName: p.displayName,
      supportedMonitorTypes: p.supportedMonitorTypes,
    }));
  }
}
