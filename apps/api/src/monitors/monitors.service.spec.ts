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
    monitorTags: [],
    ...overrides,
  };
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    userId: 'user-1',
    monitorId: 'monitor-1',
    checkedAt: new Date('2026-01-01T12:00:00Z'),
    ok: true,
    status: 200,
    latencyMs: 42,
    message: 'up to date',
    level: 'green',
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
          monitorTags: [],
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
    monitorAlert: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    monitorTag: {
      deleteMany: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    tag: {
      upsert: vi.fn().mockResolvedValue({ id: 'tag-1', name: 'v8', color: '#6366f1' }),
    },
    alertChannel: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'ch-1',
        name: 'Slack',
        type: 'SLACK',
        configJson: { webhookUrl: 'https://hooks.slack.com/x' },
        createdAt: new Date('2026-01-01'),
      }),
    },
  };
}

function makeChecksService() {
  return {
    run: vi.fn().mockResolvedValue({ ok: true, message: 'ok', level: 'green', statusCode: 200, latencyMs: 50 }),
    runMonitor: vi.fn().mockResolvedValue({ ok: true }),
    listPlugins: vi.fn().mockReturnValue([]),
  };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function makeRealtime() {
  return {
    monitorCreated: vi.fn(),
    monitorUpdated: vi.fn(),
    monitorDeleted: vi.fn(),
  };
}

function makeService(prismaOverride?: ReturnType<typeof makePrisma>) {
  return new MonitorsService(
    (prismaOverride ?? makePrisma()) as never,
    makeChecksService() as never,
    makeAudit() as never,
    makeRealtime() as never,
  );
}

describe('MonitorsService', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  // ─── list() ────────────────────────────────────────────────────────────────

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

    it('sanitizes appToken from config', async () => {
      const monitor = makeMonitor({ configJson: { appToken: 'super-secret', appUrl: 'https://app.example.com' } });
      const p = makePrisma(monitor);
      const svc = makeService(p);

      const result = await svc.list('user-1');
      expect(result[0].config).not.toHaveProperty('appToken');
      expect(result[0].config).toHaveProperty('hasAppToken', true);
    });

    it('sanitizes openvpnPassword from config', async () => {
      const monitor = makeMonitor({ configJson: { openvpnPassword: 'vpn-secret', openvpnUsername: 'admin' } });
      const p = makePrisma(monitor);
      const svc = makeService(p);

      const result = await svc.list('user-1');
      expect(result[0].config).not.toHaveProperty('openvpnPassword');
      expect(result[0].config).toHaveProperty('hasOpenvpnPassword', true);
    });

    it('sets hasRepoToken=false when no token present', async () => {
      const monitor = makeMonitor({ configJson: {} });
      const p = makePrisma(monitor);
      const svc = makeService(p);

      const result = await svc.list('user-1');
      expect(result[0].config).toHaveProperty('hasRepoToken', false);
    });

    it('passes tagFilter to prisma query when provided', async () => {
      await service.list('user-1', 'production');
      expect(prisma.monitor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            monitorTags: expect.objectContaining({ some: expect.any(Object) }),
          }),
        }),
      );
    });
  });

  // ─── create() ──────────────────────────────────────────────────────────────

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

    it('passes alertChannelIds to create data', async () => {
      await service.create('user-1', {
        name: 'Alerted Monitor',
        target: 'nestjs/nest',
        type: 'GIT_RELEASE',
        alertChannelIds: ['ch-1', 'ch-2'],
      });

      expect(prisma.monitor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            monitorAlerts: {
              create: [{ alertChannelId: 'ch-1' }, { alertChannelId: 'ch-2' }],
            },
          }),
        }),
      );
    });

    it('passes config as configJson', async () => {
      await service.create('user-1', {
        name: 'Config Monitor',
        target: 'nestjs/nest',
        type: 'GIT_RELEASE',
        config: { currentVersion: '1.0.0' },
      });

      expect(prisma.monitor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ configJson: { currentVersion: '1.0.0' } }),
        }),
      );
    });

    it('passes folderId to create data', async () => {
      await service.create('user-1', {
        name: 'Folder Monitor',
        target: 'nestjs/nest',
        type: 'GIT_RELEASE',
        folderId: 'folder-42',
      });

      expect(prisma.monitor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ folderId: 'folder-42' }),
        }),
      );
    });

    it('fires realtime.monitorCreated after creation', async () => {
      const realtime = makeRealtime();
      const svc = new MonitorsService(prisma as never, makeChecksService() as never, makeAudit() as never, realtime as never);
      await svc.create('user-1', { name: 'RT Monitor', target: 'nestjs/nest', type: 'GIT_RELEASE' });
      expect(realtime.monitorCreated).toHaveBeenCalledWith('user-1', expect.objectContaining({ id: expect.any(String) }));
    });
  });

  // ─── update() ──────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('throws NotFoundException when monitor not found', async () => {
      const p = makePrisma(null);
      const svc = makeService(p);
      await expect(svc.update('user-1', 'non-existent', { name: 'New Name' })).rejects.toThrow(NotFoundException);
    });

    it('updates name only', async () => {
      await service.update('user-1', 'monitor-1', { name: 'Renamed' });
      expect(prisma.monitor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Renamed' }),
        }),
      );
    });

    it('deep-merges config', async () => {
      const monitor = makeMonitor({ configJson: { currentVersion: '1.0.0', someKey: 'keep' } });
      const p = makePrisma(monitor);
      const svc = makeService(p);

      await svc.update('user-1', 'monitor-1', { config: { currentVersion: '2.0.0' } });

      expect(p.monitor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            configJson: { currentVersion: '2.0.0', someKey: 'keep' },
          }),
        }),
      );
    });

    it('replaces alertChannelIds', async () => {
      await service.update('user-1', 'monitor-1', { alertChannelIds: ['ch-new'] });

      expect(prisma.monitorAlert.deleteMany).toHaveBeenCalledWith({ where: { monitorId: 'monitor-1' } });
      expect(prisma.monitorAlert.createMany).toHaveBeenCalledWith({
        data: [{ monitorId: 'monitor-1', alertChannelId: 'ch-new' }],
      });
    });

    it('toggles enabled flag', async () => {
      await service.update('user-1', 'monitor-1', { enabled: false });
      expect(prisma.monitor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ enabled: false }),
        }),
      );
    });

    it('changes folderId', async () => {
      await service.update('user-1', 'monitor-1', { folderId: 'folder-99' });
      expect(prisma.monitor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ folderId: 'folder-99' }),
        }),
      );
    });

    it('fires realtime.monitorUpdated after update', async () => {
      const realtime = makeRealtime();
      const svc = new MonitorsService(prisma as never, makeChecksService() as never, makeAudit() as never, realtime as never);
      await svc.update('user-1', 'monitor-1', { name: 'Updated' });
      expect(realtime.monitorUpdated).toHaveBeenCalled();
    });
  });

  // ─── remove() ──────────────────────────────────────────────────────────────

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

    it('fires realtime.monitorDeleted with the id', async () => {
      const realtime = makeRealtime();
      const svc = new MonitorsService(prisma as never, makeChecksService() as never, makeAudit() as never, realtime as never);
      await svc.remove('user-1', 'monitor-1');
      expect(realtime.monitorDeleted).toHaveBeenCalledWith('user-1', { id: 'monitor-1' });
    });

    it('returns { ok: true } on success', async () => {
      const result = await service.remove('user-1', 'monitor-1');
      expect(result).toEqual({ ok: true });
    });
  });

  // ─── getRecentRuns() ────────────────────────────────────────────────────────

  describe('getRecentRuns()', () => {
    it('returns mapped runs correctly', async () => {
      const run = makeRun();
      prisma.monitorRun.findMany.mockResolvedValue([run]);

      const result = await service.getRecentRuns('user-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'run-1',
        monitorId: 'monitor-1',
        ok: true,
        statusCode: 200,
        latencyMs: 42,
        message: 'up to date',
        level: 'green',
      });
      expect(typeof result[0].checkedAt).toBe('string');
    });

    it('passes limit to prisma', async () => {
      await service.getRecentRuns('user-1', 5);
      expect(prisma.monitorRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });

    it('returns empty array when no runs', async () => {
      prisma.monitorRun.findMany.mockResolvedValue([]);
      const result = await service.getRecentRuns('user-1');
      expect(result).toHaveLength(0);
    });
  });

  // ─── runs() ────────────────────────────────────────────────────────────────

  describe('runs()', () => {
    it('returns up to 200 runs', async () => {
      await service.runs('user-1');
      expect(prisma.monitorRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });

    it('maps runs to correct shape', async () => {
      const run = makeRun();
      prisma.monitorRun.findMany.mockResolvedValue([run]);

      const result = await service.runs('user-1');
      expect(result[0]).toMatchObject({
        id: 'run-1',
        userId: 'user-1',
        monitorId: 'monitor-1',
        ok: true,
        statusCode: 200,
        latencyMs: 42,
        level: 'green',
      });
    });
  });

  // ─── monitorRuns() ──────────────────────────────────────────────────────────

  describe('monitorRuns()', () => {
    it('throws NotFoundException when monitor not found', async () => {
      const p = makePrisma(null);
      const svc = makeService(p);
      await expect(svc.monitorRuns('user-1', 'non-existent')).rejects.toThrow(NotFoundException);
    });

    it('returns runs for the monitor', async () => {
      const run = makeRun();
      prisma.monitorRun.findMany.mockResolvedValue([run]);

      const result = await service.monitorRuns('user-1', 'monitor-1');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'run-1',
        monitorId: 'monitor-1',
        ok: true,
      });
    });

    it('queries with correct monitorId and userId', async () => {
      await service.monitorRuns('user-1', 'monitor-1');
      expect(prisma.monitorRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', monitorId: 'monitor-1' },
          take: 200,
        }),
      );
    });
  });

  // ─── exportMonitors() ───────────────────────────────────────────────────────

  describe('exportMonitors()', () => {
    it('returns correct shape with version and exportedAt', async () => {
      const result = await service.exportMonitors('user-1');
      expect(result).toHaveProperty('version', '1');
      expect(result).toHaveProperty('exportedAt');
      expect(typeof result.exportedAt).toBe('string');
      expect(result).toHaveProperty('monitors');
    });

    it('includes monitor fields in export', async () => {
      const result = await service.exportMonitors('user-1');
      expect(result.monitors).toHaveLength(1);
      expect(result.monitors[0]).toHaveProperty('name', 'Test Monitor');
      expect(result.monitors[0]).toHaveProperty('type', 'GIT_RELEASE');
      expect(result.monitors[0]).toHaveProperty('target', 'nestjs/nest');
      expect(result.monitors[0]).not.toHaveProperty('id');
      expect(result.monitors[0]).not.toHaveProperty('userId');
    });

    it('returns empty monitors array when user has none', async () => {
      const p = makePrisma(null);
      const svc = makeService(p);
      const result = await svc.exportMonitors('user-1');
      expect(result.monitors).toHaveLength(0);
    });
  });

  // ─── importMonitors() ───────────────────────────────────────────────────────

  describe('importMonitors()', () => {
    it('imports successfully and returns count', async () => {
      const result = await service.importMonitors('user-1', [
        { name: 'Imported 1', target: 'nestjs/nest', type: 'GIT_RELEASE' },
        { name: 'Imported 2', target: 'docker/nginx', type: 'DOCKER_IMAGE' },
      ]);

      expect(result.imported).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('reports partial errors and still imports valid items', async () => {
      let callCount = 0;
      prisma.monitor.create.mockImplementation(() => {
        callCount++;
        if (callCount === 2) throw new Error('duplicate name');
        return Promise.resolve({ ...makeMonitor(), monitorAlerts: [], monitorTags: [] });
      });

      const result = await service.importMonitors('user-1', [
        { name: 'Good Monitor', target: 'nestjs/nest', type: 'GIT_RELEASE' },
        { name: 'Bad Monitor', target: 'nestjs/nest', type: 'GIT_RELEASE' },
        { name: 'Good Monitor 2', target: 'nestjs/nest', type: 'GIT_RELEASE' },
      ]);

      expect(result.imported).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ index: 1, name: 'Bad Monitor', error: 'duplicate name' });
    });

    it('returns all errors when all imports fail', async () => {
      prisma.monitor.create.mockRejectedValue(new Error('DB error'));

      const result = await service.importMonitors('user-1', [
        { name: 'Fail 1', target: 'nestjs/nest', type: 'GIT_RELEASE' },
        { name: 'Fail 2', target: 'nestjs/nest', type: 'GIT_RELEASE' },
      ]);

      expect(result.imported).toBe(0);
      expect(result.errors).toHaveLength(2);
    });

    it('disables monitor after import when enabled=false', async () => {
      await service.importMonitors('user-1', [
        { name: 'Disabled Monitor', target: 'nestjs/nest', type: 'GIT_RELEASE', enabled: false },
      ]);

      expect(prisma.monitor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ enabled: false }),
        }),
      );
    });
  });

  // ─── listMonitorAlerts() ────────────────────────────────────────────────────

  describe('listMonitorAlerts()', () => {
    it('throws NotFoundException when monitor not found', async () => {
      const p = makePrisma(null);
      const svc = makeService(p);
      await expect(svc.listMonitorAlerts('user-1', 'non-existent')).rejects.toThrow(NotFoundException);
    });

    it('returns mapped alert channels', async () => {
      prisma.monitorAlert.findMany.mockResolvedValue([
        {
          alertChannel: {
            id: 'ch-1',
            name: 'Slack',
            type: 'SLACK',
            configJson: { webhookUrl: 'https://hooks.slack.com/x' },
            createdAt: new Date('2026-01-01'),
          },
        },
      ]);

      const result = await service.listMonitorAlerts('user-1', 'monitor-1');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'ch-1',
        name: 'Slack',
        type: 'SLACK',
      });
      expect(typeof result[0].createdAt).toBe('string');
    });

    it('returns empty array when no channels assigned', async () => {
      prisma.monitorAlert.findMany.mockResolvedValue([]);
      const result = await service.listMonitorAlerts('user-1', 'monitor-1');
      expect(result).toHaveLength(0);
    });
  });
});
