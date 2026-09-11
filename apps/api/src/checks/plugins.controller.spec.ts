import { describe, it, expect, vi } from 'vitest';
import { PluginsController } from './plugins.controller';

describe('PluginsController', () => {
  const mockChecksService = {
    listPlugins: vi.fn().mockReturnValue([
      {
        id: 'http.test-plugin',
        displayName: 'Test Plugin',
        description: 'A test plugin',
        supportedMonitorTypes: ['HTTP'],
        configFields: [{ key: 'url', label: 'URL', type: 'text', required: true }],
      },
    ]),
  };

  const controller = new PluginsController(mockChecksService as never);

  it('returns plugin list from checksService', () => {
    const result = controller.listPlugins();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toMatchObject({ id: 'http.test-plugin', displayName: 'Test Plugin' });
  });

  it('returns empty array when no plugins registered', () => {
    mockChecksService.listPlugins.mockReturnValueOnce([]);
    const result = controller.listPlugins();
    expect(result).toEqual([]);
  });

  it('delegates to checksService.listPlugins()', () => {
    controller.listPlugins();
    expect(mockChecksService.listPlugins).toHaveBeenCalled();
  });
});
