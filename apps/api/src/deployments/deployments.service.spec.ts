import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeploymentsService } from './deployments.service';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';

function buildService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    deploymentEvent: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    monitorAnnotation: {
      create: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
  return { svc: new DeploymentsService(prisma as never), prisma };
}

describe('DeploymentsService', () => {
  describe('create', () => {
    it('creates a deployment event without linked monitors', async () => {
      const { svc, prisma } = buildService();
      const event = {
        id: 'ev1', userId: 'u1', service: 'api', environment: 'production',
        status: 'STARTED', version: '1.0.0', monitorIds: [], createdAt: new Date(),
      };
      (prisma.deploymentEvent.create as ReturnType<typeof vi.fn>).mockResolvedValue(event);

      const result = await svc.create('u1', { service: 'api', version: '1.0.0' });
      expect(result.service).toBe('api');
      expect(prisma.monitorAnnotation.create).not.toHaveBeenCalled();
    });

    it('auto-annotates linked monitors on create', async () => {
      const { svc, prisma } = buildService();
      const event = {
        id: 'ev1', userId: 'u1', service: 'web', environment: 'staging',
        status: 'SUCCESS', version: '2.0.0', monitorIds: ['m1', 'm2'], createdAt: new Date(),
      };
      (prisma.deploymentEvent.create as ReturnType<typeof vi.fn>).mockResolvedValue(event);

      await svc.create('u1', { service: 'web', version: '2.0.0', monitorIds: ['m1', 'm2'] });
      expect(prisma.monitorAnnotation.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('findOne', () => {
    it('returns event when found', async () => {
      const { svc, prisma } = buildService();
      const event = { id: 'ev1', userId: 'u1', service: 'api' };
      (prisma.deploymentEvent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(event);

      const result = await svc.findOne('u1', 'ev1');
      expect(result.id).toBe('ev1');
    });

    it('throws NotFoundException when event not found', async () => {
      const { svc, prisma } = buildService();
      (prisma.deploymentEvent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(svc.findOne('u1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('receiveWebhook', () => {
    it('throws UnauthorizedException for invalid token', async () => {
      const { svc, prisma } = buildService();
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(svc.receiveWebhook('bad_token', { service: 'api' })).rejects.toThrow(UnauthorizedException);
    });

    it('creates event for valid token', async () => {
      const { svc, prisma } = buildService();
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u1' });
      const event = { id: 'ev1', userId: 'u1', service: 'api', monitorIds: [], createdAt: new Date(), status: 'STARTED', environment: 'production' };
      (prisma.deploymentEvent.create as ReturnType<typeof vi.fn>).mockResolvedValue(event);

      const result = await svc.receiveWebhook('pd_deploy_xyz', { service: 'api' });
      expect(result.userId).toBe('u1');
    });
  });

  describe('generateDeployToken', () => {
    it('generates a token starting with pd_deploy_', async () => {
      const { svc, prisma } = buildService();
      (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await svc.generateDeployToken('u1');
      expect(result.token).toMatch(/^pd_deploy_/);
    });
  });

  describe('remove', () => {
    it('deletes event and returns deleted:true', async () => {
      const { svc, prisma } = buildService();
      (prisma.deploymentEvent.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'ev1', userId: 'u1' });
      (prisma.deploymentEvent.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await svc.remove('u1', 'ev1');
      expect(result.deleted).toBe(true);
    });
  });

  describe('listByMonitor', () => {
    it('filters events by monitorId in monitorIds array', async () => {
      const { svc, prisma } = buildService();
      (prisma.deploymentEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'dep-1', monitorIds: ['m1'] },
      ]);
      const result = await svc.listByMonitor('u1', 'm1');
      expect(prisma.deploymentEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ monitorIds: { has: 'm1' } }),
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('returns empty when no matching deployments', async () => {
      const { svc, prisma } = buildService();
      (prisma.deploymentEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const result = await svc.listByMonitor('u1', 'm99');
      expect(result).toHaveLength(0);
    });
  });

  describe('getSummary', () => {
    it('returns zero totals for empty event set', async () => {
      const { svc, prisma } = buildService();
      (prisma.deploymentEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const result = await svc.getSummary('u1');
      expect(result.total).toBe(0);
      expect(result.successRate).toBeNull();
      expect(result.topServices).toHaveLength(0);
    });

    it('computes success rate correctly', async () => {
      const { svc, prisma } = buildService();
      (prisma.deploymentEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { status: 'SUCCESS', environment: 'production', service: 'api', createdAt: new Date() },
        { status: 'SUCCESS', environment: 'production', service: 'api', createdAt: new Date() },
        { status: 'FAILED', environment: 'production', service: 'api', createdAt: new Date() },
        { status: 'FAILED', environment: 'staging', service: 'web', createdAt: new Date() },
      ]);
      const result = await svc.getSummary('u1');
      expect(result.total).toBe(4);
      expect(result.successRate).toBe(50);
      expect(result.byStatus.SUCCESS).toBe(2);
      expect(result.byStatus.FAILED).toBe(2);
    });

    it('returns top services sorted by deploy count', async () => {
      const { svc, prisma } = buildService();
      (prisma.deploymentEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { status: 'SUCCESS', environment: 'production', service: 'api', createdAt: new Date() },
        { status: 'SUCCESS', environment: 'production', service: 'api', createdAt: new Date() },
        { status: 'SUCCESS', environment: 'production', service: 'web', createdAt: new Date() },
      ]);
      const result = await svc.getSummary('u1');
      expect(result.topServices[0].service).toBe('api');
      expect(result.topServices[0].count).toBe(2);
    });
  });
});
