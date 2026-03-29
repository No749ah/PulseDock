import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ServiceGroupsService } from './service-groups.service';
import type { PrismaService } from '../common/prisma.service';

const makePrisma = () =>
  ({
    monitorServiceGroup: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    monitor: {
      findMany: vi.fn(),
    },
    monitorRun: {
      findFirst: vi.fn(),
    },
  }) as unknown as PrismaService;

describe('ServiceGroupsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: ServiceGroupsService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new ServiceGroupsService(prisma);
    vi.clearAllMocks();
  });

  describe('list()', () => {
    it('returns groups with monitorCount', async () => {
      (prisma.monitorServiceGroup.findMany as any).mockResolvedValue([
        { id: 'g1', name: 'Production', monitorIds: ['m1', 'm2'] },
        { id: 'g2', name: 'Staging', monitorIds: [] },
      ]);
      const result = await svc.list('u1');
      expect(result).toHaveLength(2);
      expect(result[0].monitorCount).toBe(2);
      expect(result[1].monitorCount).toBe(0);
    });
  });

  describe('create()', () => {
    it('creates a new service group', async () => {
      const created = { id: 'g1', name: 'Production', monitorIds: ['m1'] };
      (prisma.monitorServiceGroup.create as any).mockResolvedValue(created);
      const result = await svc.create('u1', { name: 'Production', monitorIds: ['m1'] } as any);
      expect(result).toEqual(created);
    });
  });

  describe('update()', () => {
    it('updates existing group', async () => {
      (prisma.monitorServiceGroup.findFirst as any).mockResolvedValue({ id: 'g1' });
      const updated = { id: 'g1', name: 'Updated' };
      (prisma.monitorServiceGroup.update as any).mockResolvedValue(updated);
      const result = await svc.update('u1', 'g1', { name: 'Updated' } as any);
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when not found', async () => {
      (prisma.monitorServiceGroup.findFirst as any).mockResolvedValue(null);
      await expect(svc.update('u1', 'missing', { name: 'x' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove()', () => {
    it('deletes existing group', async () => {
      (prisma.monitorServiceGroup.findFirst as any).mockResolvedValue({ id: 'g1' });
      (prisma.monitorServiceGroup.delete as any).mockResolvedValue({});
      await svc.remove('u1', 'g1');
      expect(prisma.monitorServiceGroup.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
    });

    it('throws NotFoundException when not found', async () => {
      (prisma.monitorServiceGroup.findFirst as any).mockResolvedValue(null);
      await expect(svc.remove('u1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStatus()', () => {
    it('throws NotFoundException when group not found', async () => {
      (prisma.monitorServiceGroup.findFirst as any).mockResolvedValue(null);
      await expect(svc.getStatus('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('returns unknown status for empty monitors', async () => {
      (prisma.monitorServiceGroup.findFirst as any).mockResolvedValue({
        id: 'g1',
        name: 'Empty',
        description: 'No monitors',
        monitorIds: [],
      });
      const result = await svc.getStatus('u1', 'g1');
      expect(result.status).toBe('unknown');
      expect(result.monitors).toEqual([]);
    });

    it('returns operational when all green', async () => {
      (prisma.monitorServiceGroup.findFirst as any).mockResolvedValue({
        id: 'g1',
        name: 'Prod',
        description: null,
        monitorIds: ['m1', 'm2'],
      });
      (prisma.monitor.findMany as any).mockResolvedValue([
        { id: 'm1', name: 'API', target: 'https://api.test', type: 'HTTP', enabled: true },
        { id: 'm2', name: 'DB', target: 'db:5432', type: 'TCP', enabled: true },
      ]);
      (prisma.monitorRun.findFirst as any)
        .mockResolvedValueOnce({ level: 'green', latencyMs: 42, checkedAt: new Date() })
        .mockResolvedValueOnce({ level: 'green', latencyMs: 10, checkedAt: new Date() });

      const result = await svc.getStatus('u1', 'g1');
      expect(result.status).toBe('operational');
      expect(result.monitors).toHaveLength(2);
    });

    it('returns degraded when yellow present', async () => {
      (prisma.monitorServiceGroup.findFirst as any).mockResolvedValue({
        id: 'g1',
        name: 'Prod',
        description: null,
        monitorIds: ['m1'],
      });
      (prisma.monitor.findMany as any).mockResolvedValue([
        { id: 'm1', name: 'API', target: 'https://api.test', type: 'HTTP', enabled: true },
      ]);
      (prisma.monitorRun.findFirst as any).mockResolvedValue({
        level: 'yellow',
        latencyMs: 500,
        checkedAt: new Date(),
      });

      const result = await svc.getStatus('u1', 'g1');
      expect(result.status).toBe('degraded');
    });

    it('returns outage when red present', async () => {
      (prisma.monitorServiceGroup.findFirst as any).mockResolvedValue({
        id: 'g1',
        name: 'Prod',
        description: null,
        monitorIds: ['m1', 'm2'],
      });
      (prisma.monitor.findMany as any).mockResolvedValue([
        { id: 'm1', name: 'API', target: 'https://api.test', type: 'HTTP', enabled: true },
        { id: 'm2', name: 'DB', target: 'db:5432', type: 'TCP', enabled: true },
      ]);
      (prisma.monitorRun.findFirst as any)
        .mockResolvedValueOnce({ level: 'red', latencyMs: 0, checkedAt: new Date() })
        .mockResolvedValueOnce({ level: 'green', latencyMs: 10, checkedAt: new Date() });

      const result = await svc.getStatus('u1', 'g1');
      expect(result.status).toBe('outage');
    });
  });
});
