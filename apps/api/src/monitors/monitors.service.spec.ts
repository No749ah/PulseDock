import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsService } from './monitors.service';

function makeMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'monitor-1',
    userId: 'user-1',
    name: 'Test Monitor',
    type: 'GIT_RELEASE',
    target: 'nestjs/nest',
    intervalSec: 60,
    timeoutMs: 5000,
    configJson: {},
    folderId: null,
    enabled: true,
    createdAt: new Date('2026-01-01'),
    monitorAlerts: [],
    ...overrides,
  };
}

function makePrisma(monitorOverride?: ReturnType<typeof makeMonitor> | null) {
  const monitor = monitorOverride !== undefined ? monitorOverride : makeMonitor();
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitor ? [monitor] : []),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...makeMonitor(),
          userId: data.userId,
          name: data.name,
          target: data.target,
          type: data.type,
          monitorAlerts: [],
        }),
      ),
      findFirst: vi.fn().mockResolvedValue(monitor),
      delete: vi.fn().mockResolvedValue(makeMonitor()),
      update: vi.fn().mockResolvedValue(makeMonitor()),
      count: vi.fn().mockResolvedValue(0),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

function makeChecksService() {
  return { run: vi.fn().mockResolvedValue({ ok: true, message: 'ok', level: 'green', statusCode: 200, latencyMs: 50 }) };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function makeService(prismaOverride?: ReturnType<typeof makePrisma>) {
  return new MonitorsService(
    (prismaOverride ?? makePrisma()) as never,
    makeChecksService() as never,
    makeAudit() as never,
  );
}

describe('MonitorsService', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  describe('list()', () => {
    it('returns monitors for the given userId', async () => {
      const result = await service.list('user-1');
      expect(prisma.monitor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('monitor-1');
    });

    it('does not expose token in config', async () => {
      const monitorWithToken = makeMonitor({ configJson: { token: 'secret-token', someKey: 'value' } });
      const p = makePrisma(monitorWithToken);
      const svc = makeService(p);

      const result = await svc.list('user-1');
      expect(result[0].config).not.toHaveProperty('token');
      expect(result[0].config).toHaveProperty('hasRepoToken', true);
    });

    it('returns empty array when no monitors found', async () => {
      const p = makePrisma(null);
      const svc = makeService(p);
      const result = await svc.list('user-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('create()', () => {
    it('creates a monitor with the correct userId', async () => {
      const result = await service.create('user-1', {
        name: 'My Monitor',
        target: 'nestjs/nest',
        type: 'GIT_RELEASE',
      });

      expect(prisma.monitor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1', name: 'My Monitor' }),
        }),
      );
      expect(result).toHaveProperty('id');
    });

    it('uses default intervalSec and timeoutMs when not provided', async () => {
      await service.create('user-1', {
        name: 'Default Monitor',
        target: 'nestjs/nest',
        type: 'GIT_RELEASE',
      });

      expect(prisma.monitor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ intervalSec: 60, timeoutMs: 5000 }),
        }),
      );
    });
  });

  describe('remove()', () => {
    it('throws NotFoundException when monitor not found', async () => {
      const p = makePrisma(null);
      const svc = makeService(p);

      await expect(svc.remove('user-1', 'non-existent-id')).rejects.toThrow(NotFoundException);
    });

    it('calls prisma delete when monitor belongs to user', async () => {
      const monitor = makeMonitor({ id: 'monitor-1', userId: 'user-1' });
      const p = makePrisma(monitor);
      const svc = makeService(p);

      await svc.remove('user-1', 'monitor-1');
      expect(p.monitor.delete).toHaveBeenCalled();
    });
  });
});
