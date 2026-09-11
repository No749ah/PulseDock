import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorsAnalyticsService } from './monitors-analytics.service';

// Minimal mock for PrismaService
function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    monitor: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    monitorRun: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    monitorDependency: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    alertDeliveryLog: { findMany: vi.fn(), count: vi.fn() },
    alertChannel: { findMany: vi.fn() },
    folder: { findMany: vi.fn() },
    tag: { findMany: vi.fn() },
    monitorTag: { findMany: vi.fn() },
    ...overrides,
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}): MonitorsAnalyticsService {
  const prisma = makePrisma(prismaOverrides);
  return new (MonitorsAnalyticsService as unknown as new (...args: unknown[]) => MonitorsAnalyticsService)(prisma as never);
}

describe('MonitorsService.dependencyGraph', () => {
  it('returns empty graph when no monitors exist', async () => {
    const svc = makeService();
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitor.findMany.mockResolvedValue([]);
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitorRun.findMany.mockResolvedValue([]);
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitorDependency.findMany.mockResolvedValue([]);

    const result = await svc.dependencyGraph('user-1');
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.summary.totalMonitors).toBe(0);
    expect(result.summary.totalEdges).toBe(0);
  });

  it('returns isolated nodes with correct status when no dependencies exist', async () => {
    const now = new Date();
    const monitor = {
      id: 'm1',
      name: 'API Health',
      type: 'HTTP',
      enabled: true,
      folderId: null,
      folder: null,
      mutedUntil: null,
      pinned: false,
      createdAt: now,
    };

    const svc = makeService();
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitor.findMany.mockResolvedValue([monitor]);
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitorRun.findMany.mockImplementation((args: { orderBy?: { checkedAt?: string } }) => {
      // Return latest run for the "distinct monitorId" query (no gte filter)
      if (!args?.orderBy?.checkedAt) return Promise.resolve([]);
      return Promise.resolve([{
        monitorId: 'm1',
        ok: true,
        level: 'green',
        latencyMs: 42,
        checkedAt: now,
      }]);
    });
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitorDependency.findMany.mockResolvedValue([]);

    const result = await svc.dependencyGraph('user-1');
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].status).toBe('up');
    expect(result.nodes[0].latencyMs).toBe(42);
    expect(result.edges).toHaveLength(0);
    expect(result.summary.isolatedNodes).toBe(1);
    expect(result.summary.monitorsByStatus.up).toBe(1);
  });

  it('sets status=down when latest run level is red', async () => {
    const now = new Date();
    const monitor = {
      id: 'm1', name: 'DB', type: 'TCP', enabled: true, folderId: null, folder: null, mutedUntil: null, pinned: false, createdAt: now,
    };
    const svc = makeService();
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitor.findMany.mockResolvedValue([monitor]);
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitorRun.findMany.mockImplementation(() =>
      Promise.resolve([{ monitorId: 'm1', ok: false, level: 'red', latencyMs: null, checkedAt: now }])
    );
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitorDependency.findMany.mockResolvedValue([]);

    const result = await svc.dependencyGraph('user-1');
    expect(result.nodes[0].status).toBe('down');
    expect(result.summary.monitorsByStatus.down).toBe(1);
  });

  it('sets status=paused for disabled monitors', async () => {
    const now = new Date();
    const monitor = {
      id: 'm1', name: 'Paused', type: 'HTTP', enabled: false, folderId: null, folder: null, mutedUntil: null, pinned: false, createdAt: now,
    };
    const svc = makeService();
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitor.findMany.mockResolvedValue([monitor]);
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitorRun.findMany.mockResolvedValue([]);
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitorDependency.findMany.mockResolvedValue([]);

    const result = await svc.dependencyGraph('user-1');
    expect(result.nodes[0].status).toBe('paused');
    expect(result.summary.monitorsByStatus.paused).toBe(1);
  });

  it('computes inDegree and outDegree from edges', async () => {
    const now = new Date();
    const monitors = [
      { id: 'app', name: 'App', type: 'HTTP', enabled: true, folderId: null, folder: null, mutedUntil: null, pinned: false, createdAt: now },
      { id: 'db', name: 'DB', type: 'TCP', enabled: true, folderId: null, folder: null, mutedUntil: null, pinned: false, createdAt: now },
    ];
    // app depends on db: edge { source: app, target: db }
    const deps = [{ monitorId: 'app', dependsOnId: 'db' }];

    const svc = makeService();
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitor.findMany.mockResolvedValue(monitors);
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitorRun.findMany.mockResolvedValue([]);
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitorDependency.findMany.mockResolvedValue(deps);

    const result = await svc.dependencyGraph('user-1');

    const appNode = result.nodes.find(n => n.id === 'app')!;
    const dbNode = result.nodes.find(n => n.id === 'db')!;

    // app depends on db → app.outDegree = 1, db.inDegree = 1
    expect(appNode.outDegree).toBe(1);
    expect(appNode.inDegree).toBe(0);
    expect(dbNode.inDegree).toBe(1); // blast radius = 1
    expect(dbNode.outDegree).toBe(0);

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toEqual({ source: 'app', target: 'db' });
    expect(result.summary.totalEdges).toBe(1);
    expect(result.summary.isolatedNodes).toBe(0);
  });

  it('marks isMuted=true when mutedUntil is in the future', async () => {
    const now = new Date();
    const future = new Date(now.getTime() + 60 * 60 * 1000);
    const monitor = {
      id: 'm1', name: 'Muted', type: 'HTTP', enabled: true, folderId: null, folder: null, mutedUntil: future, pinned: false, createdAt: now,
    };
    const svc = makeService();
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitor.findMany.mockResolvedValue([monitor]);
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitorRun.findMany.mockResolvedValue([]);
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitorDependency.findMany.mockResolvedValue([]);

    const result = await svc.dependencyGraph('user-1');
    expect(result.nodes[0].isMuted).toBe(true);
  });

  it('includes folderName when monitor has a folder', async () => {
    const now = new Date();
    const monitor = {
      id: 'm1', name: 'App', type: 'HTTP', enabled: true, folderId: 'f1', folder: { name: 'Production' }, mutedUntil: null, pinned: false, createdAt: now,
    };
    const svc = makeService();
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitor.findMany.mockResolvedValue([monitor]);
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitorRun.findMany.mockResolvedValue([]);
    ((svc as unknown as { prisma: ReturnType<typeof makePrisma> }).prisma).monitorDependency.findMany.mockResolvedValue([]);

    const result = await svc.dependencyGraph('user-1');
    expect(result.nodes[0].folderName).toBe('Production');
    expect(result.nodes[0].folderId).toBe('f1');
  });
});
