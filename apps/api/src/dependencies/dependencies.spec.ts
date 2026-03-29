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
});
