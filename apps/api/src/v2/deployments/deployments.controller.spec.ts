import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2DeploymentsController } from './deployments.controller';
import { PrismaService } from '../../common/prisma.service';

function makeDeployment(overrides: Partial<{
  id: string;
  service: string;
  environment: string;
  version: string | null;
  status: string;
  deployedBy: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  branch: string | null;
  sourceUrl: string | null;
  durationMs: number | null;
  suppressAlerts: boolean;
  monitorIds: string[];
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: 'dep-1',
    service: 'api',
    environment: 'production',
    version: 'v1.2.3',
    status: 'SUCCESS',
    deployedBy: 'ci-bot',
    commitSha: 'abc123',
    commitMessage: 'fix: resolve memory leak',
    branch: 'main',
    sourceUrl: 'https://github.com/org/repo/commit/abc123',
    durationMs: 45000,
    suppressAlerts: false,
    monitorIds: ['m-1', 'm-2'],
    createdAt: new Date('2026-01-01T10:00:00Z'),
    updatedAt: new Date('2026-01-01T10:01:00Z'),
    ...overrides,
  };
}

function makePrisma(overrides: Partial<{
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    deploymentEvent: {
      findMany: overrides.findMany ?? vi.fn().mockResolvedValue([makeDeployment()]),
      count: overrides.count ?? vi.fn().mockResolvedValue(1),
    },
  } as unknown as PrismaService;
}

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

describe('V2DeploymentsController', () => {
  let controller: V2DeploymentsController;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = makePrisma();
    controller = new V2DeploymentsController(prisma);
  });

  describe('list()', () => {
    it('returns paginated envelope with data and meta', async () => {
      const result = await controller.list(makeReq(), {});
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toMatchObject({ page: 1, limit: 20, total: 1, pages: 1 });
    });

    it('returns correct deployment shape', async () => {
      const result = await controller.list(makeReq(), {});
      expect(result.data[0]).toMatchObject({
        id: 'dep-1',
        service: 'api',
        environment: 'production',
        version: 'v1.2.3',
        status: 'SUCCESS',
        deployedBy: 'ci-bot',
        commitSha: 'abc123',
        commitMessage: 'fix: resolve memory leak',
        branch: 'main',
        sourceUrl: 'https://github.com/org/repo/commit/abc123',
        durationMs: 45000,
        suppressAlerts: false,
        monitorCount: 2,
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:01:00.000Z',
      });
    });

    it('computes monitorCount from monitorIds array length', async () => {
      prisma = makePrisma({
        findMany: vi.fn().mockResolvedValue([makeDeployment({ monitorIds: ['m-1', 'm-2', 'm-3'] })]),
        count: vi.fn().mockResolvedValue(1),
      });
      controller = new V2DeploymentsController(prisma);
      const result = await controller.list(makeReq(), {});
      expect((result.data[0] as Record<string, unknown>).monitorCount).toBe(3);
    });

    it('returns monitorCount=0 for empty monitorIds', async () => {
      prisma = makePrisma({
        findMany: vi.fn().mockResolvedValue([makeDeployment({ monitorIds: [] })]),
        count: vi.fn().mockResolvedValue(1),
      });
      controller = new V2DeploymentsController(prisma);
      const result = await controller.list(makeReq(), {});
      expect((result.data[0] as Record<string, unknown>).monitorCount).toBe(0);
    });

    it('returns null for optional fields when absent', async () => {
      prisma = makePrisma({
        findMany: vi.fn().mockResolvedValue([makeDeployment({
          version: null,
          deployedBy: null,
          commitSha: null,
          commitMessage: null,
          branch: null,
          sourceUrl: null,
          durationMs: null,
        })]),
        count: vi.fn().mockResolvedValue(1),
      });
      controller = new V2DeploymentsController(prisma);
      const result = await controller.list(makeReq(), {});
      const dep = result.data[0] as Record<string, unknown>;
      expect(dep.version).toBeNull();
      expect(dep.deployedBy).toBeNull();
      expect(dep.commitSha).toBeNull();
      expect(dep.commitMessage).toBeNull();
      expect(dep.branch).toBeNull();
      expect(dep.sourceUrl).toBeNull();
      expect(dep.durationMs).toBeNull();
    });

    it('applies service filter to where clause', async () => {
      await controller.list(makeReq(), { service: 'web' });
      expect(prisma.deploymentEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ service: 'web' }) }),
      );
    });

    it('applies environment filter to where clause', async () => {
      await controller.list(makeReq(), { environment: 'staging' });
      expect(prisma.deploymentEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ environment: 'staging' }) }),
      );
    });

    it('applies status filter to where clause', async () => {
      await controller.list(makeReq(), { status: 'FAILED' });
      expect(prisma.deploymentEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });

    it('applies search filter across service, version, and commitMessage', async () => {
      await controller.list(makeReq(), { search: 'hotfix' });
      expect(prisma.deploymentEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { service: { contains: 'hotfix', mode: 'insensitive' } },
              { version: { contains: 'hotfix', mode: 'insensitive' } },
              { commitMessage: { contains: 'hotfix', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('does not apply search filter when search is omitted', async () => {
      await controller.list(makeReq(), {});
      const call = (prisma.deploymentEvent.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      const where = call.where as Record<string, unknown>;
      expect(where.OR).toBeUndefined();
    });

    it('uses default sortBy=createdAt and sortDir=desc', async () => {
      await controller.list(makeReq(), {});
      expect(prisma.deploymentEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('respects custom sortBy and sortDir', async () => {
      await controller.list(makeReq(), { sortBy: 'service', sortDir: 'asc' });
      expect(prisma.deploymentEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { service: 'asc' } }),
      );
    });

    it('uses default page=1 and limit=20', async () => {
      await controller.list(makeReq(), {});
      expect(prisma.deploymentEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('calculates correct skip for page 2', async () => {
      prisma = makePrisma({ count: vi.fn().mockResolvedValue(50) });
      controller = new V2DeploymentsController(prisma);
      await controller.list(makeReq(), { page: 2, limit: 10 });
      expect(prisma.deploymentEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('caps limit at 200', async () => {
      await controller.list(makeReq(), { limit: 999 });
      expect(prisma.deploymentEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });

    it('clamps page to minimum 1', async () => {
      await controller.list(makeReq(), { page: -5 });
      expect(prisma.deploymentEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0 }),
      );
    });

    it('calculates correct pages count for multi-page result', async () => {
      prisma = makePrisma({ count: vi.fn().mockResolvedValue(55) });
      controller = new V2DeploymentsController(prisma);
      const result = await controller.list(makeReq(), { limit: 20 });
      expect(result.meta.pages).toBe(3);
    });

    it('returns pages=0 when total is 0', async () => {
      prisma = makePrisma({
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      });
      controller = new V2DeploymentsController(prisma);
      const result = await controller.list(makeReq(), {});
      expect(result.meta).toMatchObject({ total: 0, pages: 0 });
      expect(result.data).toHaveLength(0);
    });

    it('scopes query to authenticated user id', async () => {
      await controller.list(makeReq('user-abc'), {});
      expect(prisma.deploymentEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-abc' }) }),
      );
    });

    it('scopes count query to authenticated user id', async () => {
      await controller.list(makeReq('user-xyz'), {});
      expect(prisma.deploymentEvent.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-xyz' }) }),
      );
    });
  });
});
