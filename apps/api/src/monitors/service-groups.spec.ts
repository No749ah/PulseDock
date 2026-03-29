import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ServiceGroupsService } from './service-groups.service';

function makePrisma() {
  return {
    monitorServiceGroup: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    monitor: {
      findMany: vi.fn(),
    },
    monitorRun: {
      findFirst: vi.fn(),
    },
  };
}

describe('ServiceGroupsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ServiceGroupsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ServiceGroupsService(prisma as any);
  });

  it('list() returns groups with monitorCount for user', async () => {
    const groups = [
      { id: 'g1', userId: 'u1', name: 'Payment', description: null, monitorIds: ['m1', 'm2'], createdAt: new Date(), updatedAt: new Date() },
    ];
    prisma.monitorServiceGroup.findMany.mockResolvedValue(groups);
    const result = await service.list('u1');
    expect(result).toHaveLength(1);
    expect(result[0].monitorCount).toBe(2);
  });

  it('create() creates and returns group', async () => {
    const created = { id: 'g1', userId: 'u1', name: 'API Group', description: 'desc', monitorIds: ['m1'], createdAt: new Date(), updatedAt: new Date() };
    prisma.monitorServiceGroup.create.mockResolvedValue(created);
    const result = await service.create('u1', { name: 'API Group', description: 'desc', monitorIds: ['m1'] });
    expect(result.id).toBe('g1');
    expect(prisma.monitorServiceGroup.create).toHaveBeenCalledOnce();
  });

  it('update() throws NotFoundException when group not found', async () => {
    prisma.monitorServiceGroup.findFirst.mockResolvedValue(null);
    await expect(service.update('u1', 'missing', { name: 'New Name' })).rejects.toThrow(NotFoundException);
  });

  it('update() updates group fields', async () => {
    const group = { id: 'g1', userId: 'u1', name: 'Old', description: null, monitorIds: [], createdAt: new Date(), updatedAt: new Date() };
    const updated = { ...group, name: 'New' };
    prisma.monitorServiceGroup.findFirst.mockResolvedValue(group);
    prisma.monitorServiceGroup.update.mockResolvedValue(updated);
    const result = await service.update('u1', 'g1', { name: 'New' });
    expect(result.name).toBe('New');
  });

  it('remove() throws NotFoundException when group not found', async () => {
    prisma.monitorServiceGroup.findFirst.mockResolvedValue(null);
    await expect(service.remove('u1', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('getStatus() returns unknown when no monitors in group', async () => {
    const group = { id: 'g1', userId: 'u1', name: 'Empty', description: null, monitorIds: [], createdAt: new Date(), updatedAt: new Date() };
    prisma.monitorServiceGroup.findFirst.mockResolvedValue(group);
    const result = await service.getStatus('u1', 'g1');
    expect(result.status).toBe('unknown');
    expect(result.monitors).toHaveLength(0);
  });

  it('getStatus() returns outage when any monitor has red run', async () => {
    const group = { id: 'g1', userId: 'u1', name: 'Pay', description: null, monitorIds: ['m1', 'm2'], createdAt: new Date(), updatedAt: new Date() };
    prisma.monitorServiceGroup.findFirst.mockResolvedValue(group);
    prisma.monitor.findMany.mockResolvedValue([
      { id: 'm1', name: 'API', target: 'https://api', type: 'HTTP', enabled: true },
      { id: 'm2', name: 'DB', target: 'db:5432', type: 'TCP', enabled: true },
    ]);
    prisma.monitorRun.findFirst
      .mockResolvedValueOnce({ level: 'green', latencyMs: 120, checkedAt: new Date() })
      .mockResolvedValueOnce({ level: 'red', latencyMs: null, checkedAt: new Date() });
    const result = await service.getStatus('u1', 'g1');
    expect(result.status).toBe('outage');
  });

  it('getStatus() returns operational when all monitors have green runs', async () => {
    const group = { id: 'g1', userId: 'u1', name: 'Pay', description: null, monitorIds: ['m1', 'm2'], createdAt: new Date(), updatedAt: new Date() };
    prisma.monitorServiceGroup.findFirst.mockResolvedValue(group);
    prisma.monitor.findMany.mockResolvedValue([
      { id: 'm1', name: 'API', target: 'https://api', type: 'HTTP', enabled: true },
      { id: 'm2', name: 'DB', target: 'db:5432', type: 'TCP', enabled: true },
    ]);
    prisma.monitorRun.findFirst
      .mockResolvedValueOnce({ level: 'green', latencyMs: 100, checkedAt: new Date() })
      .mockResolvedValueOnce({ level: 'green', latencyMs: 50, checkedAt: new Date() });
    const result = await service.getStatus('u1', 'g1');
    expect(result.status).toBe('operational');
  });
});
