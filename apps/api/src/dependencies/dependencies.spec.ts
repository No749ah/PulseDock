import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DependenciesService } from './dependencies.service';

function makePrisma() {
  return {
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
    $transaction: vi.fn(),
  };
}

describe('DependenciesService', () => {
  let service: DependenciesService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new DependenciesService(prisma as never);
  });

  // 1. getDependencyGraph returns empty nodes/edges when no dependencies exist
  it('getDependencyGraph returns empty nodes/edges when no dependencies exist', async () => {
    prisma.monitorDependency.findMany.mockResolvedValue([]);
    prisma.monitor.findMany.mockResolvedValue([]);

    const result = await service.getDependencyGraph('user-1');
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  // 2. setDependencies creates dependency records correctly
  it('setDependencies creates dependency records correctly', async () => {
    prisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', userId: 'user-1' });
    prisma.monitor.findMany.mockResolvedValue([{ id: 'mon-2' }, { id: 'mon-3' }]);
    prisma.$transaction.mockResolvedValue([]);

    await service.setDependencies('user-1', 'mon-1', { dependsOnIds: ['mon-2', 'mon-3'] });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    const txArgs = prisma.$transaction.mock.calls[0][0];
    // Should include deleteMany + 2 creates = 3 operations
    expect(txArgs).toHaveLength(3);
  });

  // 3. setDependencies throws BadRequestException if monitor depends on itself
  it('setDependencies throws BadRequestException if monitor depends on itself', async () => {
    prisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', userId: 'user-1' });

    await expect(
      service.setDependencies('user-1', 'mon-1', { dependsOnIds: ['mon-1'] }),
    ).rejects.toThrow(BadRequestException);
  });

  // 4. setDependencies throws NotFoundException if dependency monitor not found
  it('setDependencies throws NotFoundException if dependency monitor not found', async () => {
    prisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', userId: 'user-1' });
    // Only 1 found, but 2 requested
    prisma.monitor.findMany.mockResolvedValue([{ id: 'mon-2' }]);

    await expect(
      service.setDependencies('user-1', 'mon-1', { dependsOnIds: ['mon-2', 'mon-999'] }),
    ).rejects.toThrow(NotFoundException);
  });

  // 5. removeDependency throws NotFoundException if dependency not found
  it('removeDependency throws NotFoundException if dependency not found', async () => {
    prisma.monitorDependency.findFirst.mockResolvedValue(null);

    await expect(
      service.removeDependency('user-1', 'mon-1', 'mon-2'),
    ).rejects.toThrow(NotFoundException);
  });

  // 6. findDownstream correctly traverses multi-hop dependencies
  // A depends on B (monitorId=A, dependsOnId=B), B depends on C (monitorId=B, dependsOnId=C)
  // downstream of C should include B (depth 1) and A (depth 2)
  it('findDownstream correctly traverses multi-hop dependencies', () => {
    const edges = [
      { monitorId: 'A', dependsOnId: 'B' }, // A depends on B
      { monitorId: 'B', dependsOnId: 'C' }, // B depends on C
    ];

    const result = service.findDownstream('C', edges);
    expect(result).toHaveLength(2);

    const bEntry = result.find((r) => r.id === 'B');
    const aEntry = result.find((r) => r.id === 'A');
    expect(bEntry?.depth).toBe(1);
    expect(aEntry?.depth).toBe(2);
  });

  // 7. findUpstream correctly traverses multi-hop parents
  // A depends on B, B depends on C → upstream of A should include B and C
  it('findUpstream correctly traverses multi-hop parents', () => {
    const edges = [
      { monitorId: 'A', dependsOnId: 'B' },
      { monitorId: 'B', dependsOnId: 'C' },
    ];

    const result = service.findUpstream('A', edges);
    expect(result).toContain('B');
    expect(result).toContain('C');
    expect(result).toHaveLength(2);
  });

  // 8. getImpactAnalysis returns empty affectedDownstream when no dependents exist
  it('getImpactAnalysis returns empty affectedDownstream when no dependents exist', async () => {
    prisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1',
      name: 'Test Monitor',
      runs: [{ level: 'green' }],
    });
    prisma.monitorDependency.findMany.mockResolvedValue([]);
    prisma.monitor.findMany.mockResolvedValue([]);

    const result = await service.getImpactAnalysis('user-1', 'mon-1');
    expect(result.affectedDownstream).toEqual([]);
    expect(result.monitor.id).toBe('mon-1');
  });

  // 9. getImpactAnalysis throws NotFoundException for missing monitor
  it('getImpactAnalysis throws NotFoundException for missing monitor', async () => {
    prisma.monitor.findFirst.mockResolvedValue(null);
    await expect(service.getImpactAnalysis('user-1', 'missing')).rejects.toThrow(NotFoundException);
  });

  // 10. getImpactAnalysis identifies root causes (upstream with non-green status)
  it('getImpactAnalysis identifies root causes from upstream monitors', async () => {
    prisma.monitor.findFirst.mockResolvedValue({
      id: 'C', name: 'Service C', runs: [{ level: 'red' }],
    });
    prisma.monitorDependency.findMany.mockResolvedValue([
      { monitorId: 'C', dependsOnId: 'B' },
      { monitorId: 'B', dependsOnId: 'A' },
    ]);
    prisma.monitor.findMany.mockResolvedValue([
      { id: 'A', name: 'Root A', runs: [{ level: 'red' }] },
      { id: 'B', name: 'Mid B', runs: [{ level: 'green' }] },
    ]);

    const result = await service.getImpactAnalysis('user-1', 'C');
    expect(result.rootCauses).toHaveLength(1);
    expect(result.rootCauses[0].id).toBe('A');
    expect(result.rootCauses[0].level).toBe('red');
  });

  // 11. getImpactAnalysis returns downstream with depth
  it('getImpactAnalysis returns downstream with correct depth', async () => {
    prisma.monitor.findFirst.mockResolvedValue({
      id: 'A', name: 'Root', runs: [{ level: 'red' }],
    });
    prisma.monitorDependency.findMany.mockResolvedValue([
      { monitorId: 'B', dependsOnId: 'A' },
      { monitorId: 'C', dependsOnId: 'B' },
    ]);
    prisma.monitor.findMany.mockResolvedValue([
      { id: 'B', name: 'Child B', runs: [{ level: 'yellow' }] },
      { id: 'C', name: 'Grandchild C', runs: [{ level: 'green' }] },
    ]);

    const result = await service.getImpactAnalysis('user-1', 'A');
    expect(result.affectedDownstream).toHaveLength(2);
    const b = result.affectedDownstream.find((d) => d.id === 'B');
    const c = result.affectedDownstream.find((d) => d.id === 'C');
    expect(b?.depth).toBe(1);
    expect(c?.depth).toBe(2);
  });

  // 12. setDependencies with empty array clears all dependencies
  it('setDependencies with empty array clears all dependencies', async () => {
    prisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', userId: 'user-1' });
    prisma.$transaction.mockResolvedValue([]);

    await service.setDependencies('user-1', 'mon-1', { dependsOnIds: [] });
    const txArgs = prisma.$transaction.mock.calls[0][0];
    // Only deleteMany, no creates
    expect(txArgs).toHaveLength(1);
  });

  // 13. setDependencies throws NotFoundException for missing monitor
  it('setDependencies throws NotFoundException for missing monitor', async () => {
    prisma.monitor.findFirst.mockResolvedValue(null);
    await expect(service.setDependencies('user-1', 'bad', { dependsOnIds: [] })).rejects.toThrow(NotFoundException);
  });

  // 14. removeDependency deletes when found
  it('removeDependency deletes existing dependency', async () => {
    prisma.monitorDependency.findFirst.mockResolvedValue({ id: 'dep-1' });
    prisma.monitorDependency.delete.mockResolvedValue({});

    await service.removeDependency('user-1', 'mon-1', 'mon-2');
    expect(prisma.monitorDependency.delete).toHaveBeenCalledWith({ where: { id: 'dep-1' } });
  });

  // 15. getDependenciesForMonitor throws NotFoundException for missing monitor
  it('getDependenciesForMonitor throws NotFoundException for missing monitor', async () => {
    prisma.monitor.findFirst.mockResolvedValue(null);
    await expect(service.getDependenciesForMonitor('user-1', 'missing')).rejects.toThrow(NotFoundException);
  });

  // 16. getDependenciesForMonitor returns dependencies with status
  it('getDependenciesForMonitor returns dependencies for existing monitor', async () => {
    prisma.monitor.findFirst.mockResolvedValue({ id: 'mon-1', userId: 'user-1' });
    prisma.monitorDependency.findMany.mockResolvedValue([
      { id: 'dep-1', dependsOn: { id: 'mon-2', name: 'DB', type: 'HTTP', runs: [{ status: 'up' }] } },
    ]);
    const result = await service.getDependenciesForMonitor('user-1', 'mon-1');
    expect(result).toHaveLength(1);
    expect(result[0].dependsOn.name).toBe('DB');
  });

  // 17. getDependencyGraph builds correct nodes and edges
  it('getDependencyGraph builds correct nodes and edges from dependencies', async () => {
    prisma.monitorDependency.findMany.mockResolvedValue([
      { monitorId: 'A', dependsOnId: 'B', monitor: { name: 'App', type: 'HTTP' }, dependsOn: { name: 'DB', type: 'TCP' } },
    ]);
    prisma.monitor.findMany.mockResolvedValue([
      { id: 'A', name: 'App', type: 'HTTP', runs: [{ level: 'green' }] },
      { id: 'B', name: 'DB', type: 'TCP', runs: [{ level: 'green' }] },
    ]);

    const result = await service.getDependencyGraph('user-1');
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toEqual({ from: 'B', to: 'A' });
    const nodeA = result.nodes.find((n) => n.id === 'A')!;
    expect(nodeA.dependencies).toContain('B');
    const nodeB = result.nodes.find((n) => n.id === 'B')!;
    expect(nodeB.dependents).toContain('A');
  });

  // 18. findDownstream handles cycles without infinite loop
  it('findDownstream handles cycles without infinite loop', () => {
    const edges = [
      { monitorId: 'A', dependsOnId: 'B' },
      { monitorId: 'B', dependsOnId: 'A' }, // cycle: B depends on A, A depends on B
    ];
    // From A: A's downstream = monitors that depend on A = B (depth 1)
    // Then B's downstream = monitors that depend on B = A, but A is root so not in visited yet
    const result = service.findDownstream('A', edges);
    // Both B and A are reachable (cycle traversal stops via visited set)
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((r) => r.id === 'B')).toBe(true);
  });

  // 19. findUpstream handles cycles without infinite loop
  it('findUpstream handles cycles without infinite loop', () => {
    const edges = [
      { monitorId: 'A', dependsOnId: 'B' },
      { monitorId: 'B', dependsOnId: 'A' }, // cycle
    ];
    // From A: upstream = what A depends on = B, then B depends on A (visited), stop
    const result = service.findUpstream('A', edges);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result).toContain('B');
  });
});
