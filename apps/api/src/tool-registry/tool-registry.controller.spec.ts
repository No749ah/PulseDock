import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistryController } from './tool-registry.controller';

// Mock the tool-registry package
vi.mock('../../../../packages/tool-registry/src', () => ({
  TOOL_REGISTRY: [
    { id: 'grafana', name: 'Grafana', category: 'Observability', description: 'Analytics platform', tags: ['monitoring'], verified: true, versionSource: { type: 'json-path' } },
    { id: 'prometheus', name: 'Prometheus', category: 'Observability', description: 'Metrics system', tags: ['monitoring', 'metrics'], verified: true, versionSource: { type: 'github-releases' } },
    { id: 'gitea', name: 'Gitea', category: 'Dev Tools', description: 'Git service', tags: ['git', 'vcs'], verified: false, versionSource: { type: 'json-path' } },
  ],
  TOOL_CATEGORIES: ['Observability', 'Dev Tools', 'Container'],
  searchTools: vi.fn((q: string, category?: string) => {
    const all = [
      { id: 'grafana', name: 'Grafana', category: 'Observability', description: 'Analytics platform', tags: ['monitoring'], verified: true },
      { id: 'prometheus', name: 'Prometheus', category: 'Observability', description: 'Metrics system', tags: ['monitoring', 'metrics'], verified: true },
      { id: 'gitea', name: 'Gitea', category: 'Dev Tools', description: 'Git service', tags: ['git', 'vcs'], verified: false },
    ];
    let results = all;
    if (q) results = results.filter(t => t.name.toLowerCase().includes(q.toLowerCase()) || t.tags.some((tag: string) => tag.includes(q.toLowerCase())));
    if (category) results = results.filter(t => t.category === category);
    return results;
  }),
  getToolById: vi.fn((id: string) => {
    const tools: Record<string, unknown> = {
      grafana: { id: 'grafana', name: 'Grafana', category: 'Observability' },
      prometheus: { id: 'prometheus', name: 'Prometheus', category: 'Observability' },
    };
    return tools[id] ?? null;
  }),
  getToolVariants: vi.fn((id: string) => {
    if (id === 'grafana') return [{ id: 'oss', label: 'Open Source' }, { id: 'cloud', label: 'Grafana Cloud' }];
    return [];
  }),
}));

describe('ToolRegistryController', () => {
  let controller: ToolRegistryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ToolRegistryController],
    }).compile();

    controller = module.get<ToolRegistryController>(ToolRegistryController);
  });

  describe('list()', () => {
    it('returns all tools when no query params', () => {
      const result = controller.list();
      expect(result.total).toBe(3);
      expect(result.categories).toContain('Observability');
      expect(Array.isArray(result.tools)).toBe(true);
    });

    it('filters by search query', () => {
      const result = controller.list('grafana');
      expect(result.total).toBe(1);
      expect(result.tools[0].name).toBe('Grafana');
    });

    it('filters by category', () => {
      const result = controller.list(undefined, 'Dev Tools');
      expect(result.tools.every((t) => t.category === 'Dev Tools')).toBe(true);
    });

    it('filters by both query and category', () => {
      const result = controller.list('metrics', 'Observability');
      expect(result.tools[0].id).toBe('prometheus');
    });

    it('includes variants when withVariants=true', () => {
      const result = controller.list(undefined, undefined, 'true');
      const grafana = result.tools.find((t) => t.id === 'grafana') as Record<string, unknown>;
      expect(Array.isArray(grafana?.variants)).toBe(true);
      expect((grafana.variants as unknown[]).length).toBe(2);
    });

    it('includes variants when withVariants=1', () => {
      const result = controller.list(undefined, undefined, '1');
      const grafana = result.tools.find((t) => t.id === 'grafana') as Record<string, unknown>;
      expect(Array.isArray(grafana?.variants)).toBe(true);
    });

    it('does not include variants by default', () => {
      const result = controller.list();
      const tool = result.tools[0] as Record<string, unknown>;
      expect(tool.variants).toBeUndefined();
    });

    it('returns empty results for unknown query', () => {
      const result = controller.list('zzznomatch');
      expect(result.total).toBe(0);
    });
  });

  describe('getById()', () => {
    it('returns tool with variants when found', () => {
      const result = controller.getById('grafana') as Record<string, unknown>;
      expect(result.id).toBe('grafana');
      expect(result.name).toBe('Grafana');
      expect(Array.isArray(result.variants)).toBe(true);
      expect((result.variants as unknown[]).length).toBe(2);
    });

    it('returns tool with empty variants array when no variants exist', () => {
      const result = controller.getById('prometheus') as Record<string, unknown>;
      expect(result.id).toBe('prometheus');
      expect(Array.isArray(result.variants)).toBe(true);
      expect((result.variants as unknown[]).length).toBe(0);
    });

    it('throws NotFoundException for unknown tool ID', () => {
      expect(() => controller.getById('nonexistent-tool')).toThrow(NotFoundException);
    });

    it('includes correct tool metadata in response', () => {
      const result = controller.getById('grafana') as Record<string, unknown>;
      expect(result.category).toBe('Observability');
    });
  });

  describe('getVariants()', () => {
    it('returns variants for tool with variants', () => {
      const result = controller.getVariants('grafana');
      expect(result.toolId).toBe('grafana');
      expect(result.toolName).toBe('Grafana');
      expect(result.hasVariants).toBe(true);
      expect(result.variants.length).toBe(2);
    });

    it('returns empty variants array for tool without variants', () => {
      const result = controller.getVariants('prometheus');
      expect(result.hasVariants).toBe(false);
      expect(result.variants).toHaveLength(0);
    });

    it('throws NotFoundException for unknown tool ID', () => {
      expect(() => controller.getVariants('does-not-exist')).toThrow(NotFoundException);
    });
  });
});
