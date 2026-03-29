import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DependenciesService } from './dependencies.service';
import type { PrismaService } from '../common/prisma.service';

const makePrisma = () =>
  ({
    monitorDependency: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    monitor: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((args: any[]) => Promise.resolve(args)),
  }) as unknown as PrismaService;

describe('DependenciesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: DependenciesService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new DependenciesService(prisma);
    vi.clearAllMocks();
  });

  describe('getDependencyGraph()', () => {
    it('returns empty graph when no dependencies', async () => {
      (prisma.monitorDependency.findMany as any).mockResolvedValue([]);
      (prisma.monitor.findMany as any).mockResolvedValue([]);
      const result = await svc.getDependencyGraph('u1');
      expect(result).toEqual({ nodes: [], edges: [] });
    });

    it('returns nodes and edges for existing deps', async () => {
      (prisma.monitorDependency.findMany as any).mockResolvedValue([
        {
          monitorId: 'm1',
          dependsOnId: 'm2',
          monitor: { id: 'm1', name: 'Frontend', type: 'HTTP' },
          dependsOn: { id: 'm2', name: 'API', type: 'HTTP' },
        },
      ]);
      (prisma.monitor.findMany as any).mockResolvedValue([
        { id: 'm1', name: 'Frontend', type: 'HTTP', runs: [{ level: 'green' }] },
        { id: 'm2', name: 'API', type: 'HTTP', runs: [{ level: 'red' }] },
      ]);

      const result = await svc.getDependencyGraph('u1');
      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toEqual([{ from: 'm2', to: 'm1' }]);
      const apiNode = result.nodes.find((n) => n.id === 'm2');
      expect(apiNode?.level).toBe('red');
      expect(apiNode?.dependents).toContain('m1');
    });
  });

  describe('getImpactAnalysis()', () => {
    it('throws NotFoundException when monitor not found', async () => {
      (prisma.monitor.findFirst as any).mockResolvedValue(null);
      await expect(svc.getImpactAnalysis('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('returns downstream and root causes', async () => {
      (prisma.monitor.findFirst as any).mockResolvedValue({
        id: 'm1',
        name: 'API',
        runs: [{ level: 'red' }],
      });
      // edges: m2 depends on m1, m3 depends on m1 (upstream of m1)
      (prisma.monitorDependency.findMany as any).mockResolvedValue([
        { monitorId: 'm2', dependsOnId: 'm1' },
        { monitorId: 'm1', dependsOnId: 'm3' },
      ]);
      (prisma.monitor.findMany as any).mockResolvedValue([
        { id: 'm2', name: 'Frontend', runs: [{ level: 'green' }] },
        { id: 'm3', name: 'Database', runs: [{ level: 'red' }] },
      ]);

      const result = await svc.getImpactAnalysis('u1', 'm1');
      expect(result.monitor.id).toBe('m1');
      expect(result.affectedDownstream).toHaveLength(1);
      expect(result.affectedDownstream[0].id).toBe('m2');
      expect(result.rootCauses).toHaveLength(1);
      expect(result.rootCauses[0].id).toBe('m3');
    });
  });

  describe('setDependencies()', () => {
    it('throws NotFoundException when monitor not found', async () => {
      (prisma.monitor.findFirst as any).mockResolvedValue(null);
      await expect(svc.setDependencies('u1', 'missing', { dependsOnIds: [] })).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for self-dependency', async () => {
      (prisma.monitor.findFirst as any).mockResolvedValue({ id: 'm1' });
      await expect(svc.setDependencies('u1', 'm1', { dependsOnIds: ['m1'] })).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when dep monitors not found', async () => {
      (prisma.monitor.findFirst as any).mockResolvedValue({ id: 'm1' });
      (prisma.monitor.findMany as any).mockResolvedValue([]); // none found
      await expect(svc.setDependencies('u1', 'm1', { dependsOnIds: ['m2'] })).rejects.toThrow(NotFoundException);
    });

    it('replaces dependencies on success', async () => {
      (prisma.monitor.findFirst as any).mockResolvedValue({ id: 'm1' });
      (prisma.monitor.findMany as any).mockResolvedValue([{ id: 'm2' }]);
      (prisma.monitorDependency.deleteMany as any).mockResolvedValue({});
      (prisma.monitorDependency.create as any).mockResolvedValue({});

      await svc.setDependencies('u1', 'm1', { dependsOnIds: ['m2'] });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('removeDependency()', () => {
    it('throws NotFoundException when dependency not found', async () => {
      (prisma.monitorDependency.findFirst as any).mockResolvedValue(null);
      await expect(svc.removeDependency('u1', 'm1', 'm2')).rejects.toThrow(NotFoundException);
    });

    it('deletes existing dependency', async () => {
      (prisma.monitorDependency.findFirst as any).mockResolvedValue({ id: 'dep1' });
      (prisma.monitorDependency.delete as any).mockResolvedValue({});
      await svc.removeDependency('u1', 'm1', 'm2');
      expect(prisma.monitorDependency.delete).toHaveBeenCalledWith({ where: { id: 'dep1' } });
    });
  });

  describe('getDependenciesForMonitor()', () => {
    it('throws NotFoundException when monitor not found', async () => {
      (prisma.monitor.findFirst as any).mockResolvedValue(null);
      await expect(svc.getDependenciesForMonitor('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('returns dependencies for existing monitor', async () => {
      (prisma.monitor.findFirst as any).mockResolvedValue({ id: 'm1' });
      const deps = [{ id: 'dep1', dependsOn: { id: 'm2', name: 'API', type: 'HTTP', runs: [] } }];
      (prisma.monitorDependency.findMany as any).mockResolvedValue(deps);
      const result = await svc.getDependenciesForMonitor('u1', 'm1');
      expect(result).toEqual(deps);
    });
  });

  describe('findDownstream()', () => {
    it('finds all transitive downstream monitors', () => {
      const edges = [
        { monitorId: 'm2', dependsOnId: 'm1' },
        { monitorId: 'm3', dependsOnId: 'm2' },
      ];
      const result = svc.findDownstream('m1', edges);
      expect(result).toEqual([
        { id: 'm2', depth: 1 },
        { id: 'm3', depth: 2 },
      ]);
    });

    it('returns empty for no downstream', () => {
      const edges = [{ monitorId: 'm1', dependsOnId: 'm2' }];
      const result = svc.findDownstream('m1', edges);
      expect(result).toEqual([]);
    });

    it('handles cycles without infinite loop', () => {
      const edges = [
        { monitorId: 'm2', dependsOnId: 'm1' },
        { monitorId: 'm1', dependsOnId: 'm2' },
      ];
      const result = svc.findDownstream('m1', edges);
      // m2 depends on m1 (depth 1), and m1 depends on m2 so m1 also appears (depth 2)
      // but it terminates (no infinite loop) thanks to visited set
      expect(result).toEqual([
        { id: 'm2', depth: 1 },
        { id: 'm1', depth: 2 },
      ]);
    });
  });

  describe('findUpstream()', () => {
    it('finds all transitive upstream monitors', () => {
      const edges = [
        { monitorId: 'm1', dependsOnId: 'm2' },
        { monitorId: 'm2', dependsOnId: 'm3' },
      ];
      const result = svc.findUpstream('m1', edges);
      expect(result).toEqual(['m2', 'm3']);
    });

    it('returns empty for no upstream', () => {
      const edges = [{ monitorId: 'm2', dependsOnId: 'm1' }];
      const result = svc.findUpstream('m1', edges);
      expect(result).toEqual([]);
    });
  });
});
