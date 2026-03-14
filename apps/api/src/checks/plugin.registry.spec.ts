import { describe, it, expect } from 'vitest';
import { PluginRegistry } from './plugin.registry';

function makePlugin(id: string, types: string[] = ['HTTP']) {
  return {
    id,
    displayName: `${id} Plugin`,
    description: `Test plugin: ${id}`,
    supportedMonitorTypes: types as import('../types').MonitorType[],
    configFields: [{ key: 'timeout', label: 'Timeout', type: 'number' as const }],
    run: async () => ({ ok: true, statusCode: 200, latencyMs: 50, message: 'OK', level: 'green' as const }),
  };
}

describe('PluginRegistry', () => {
  it('registers and retrieves a plugin', () => {
    const registry = new PluginRegistry();
    const plugin = makePlugin('http-check', ['HTTP']);
    registry.register(plugin);

    const found = registry.get('http-check', 'HTTP');
    expect(found).toBe(plugin);
  });

  it('returns null for unknown plugin id', () => {
    const registry = new PluginRegistry();
    expect(registry.get('nonexistent', 'HTTP')).toBeNull();
  });

  it('returns null when plugin type mismatch', () => {
    const registry = new PluginRegistry();
    registry.register(makePlugin('http-only', ['HTTP']));
    expect(registry.get('http-only', 'GIT_RELEASE')).toBeNull();
  });

  it('throws when registering duplicate plugin id', () => {
    const registry = new PluginRegistry();
    registry.register(makePlugin('dup'));
    expect(() => registry.register(makePlugin('dup'))).toThrow('Plugin already registered: dup');
  });

  it('list() returns metadata for all plugins', () => {
    const registry = new PluginRegistry();
    registry.register(makePlugin('p1', ['HTTP']));
    registry.register(makePlugin('p2', ['HTTP', 'GIT_RELEASE']));

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 'p1', displayName: 'p1 Plugin', supportedMonitorTypes: ['HTTP'] });
    expect(list[1]).toMatchObject({ id: 'p2', supportedMonitorTypes: ['HTTP', 'GIT_RELEASE'] });
  });

  it('list() returns empty array when no plugins registered', () => {
    const registry = new PluginRegistry();
    expect(registry.list()).toHaveLength(0);
  });

  it('list() includes configFields in output', () => {
    const registry = new PluginRegistry();
    registry.register(makePlugin('with-fields'));
    const [item] = registry.list();
    expect(item?.configFields).toHaveLength(1);
    expect(item?.configFields[0]).toMatchObject({ key: 'timeout' });
  });

  it('list() defaults to empty configFields when plugin has none', () => {
    const registry = new PluginRegistry();
    const plugin = makePlugin('no-fields');
    delete (plugin as Record<string, unknown>)['configFields'];
    registry.register(plugin);

    const [item] = registry.list();
    expect(item?.configFields).toEqual([]);
  });

  it('supports plugins with multiple monitor types', () => {
    const registry = new PluginRegistry();
    registry.register(makePlugin('multi', ['HTTP', 'DOCKER_IMAGE', 'GIT_RELEASE']));

    expect(registry.get('multi', 'HTTP')).not.toBeNull();
    expect(registry.get('multi', 'DOCKER_IMAGE')).not.toBeNull();
    expect(registry.get('multi', 'GIT_RELEASE')).not.toBeNull();
  });
});
