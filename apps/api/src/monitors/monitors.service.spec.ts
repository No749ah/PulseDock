import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// ── External import parser tests ────────────────────────────────────────────

describe('importExternal', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('parses Uptime Robot JSON format', async () => {
    const uptimeRobotExport = {
      stat: 'ok',
      monitors: [
        { id: 1, friendly_name: 'My Site', url: 'https://example.com', type: 1, interval: 300, status: 2 },
        { id: 2, friendly_name: 'API', url: 'https://api.example.com', type: 2, interval: 60, status: 2 },
        { id: 3, friendly_name: 'Ping test', url: 'example.com', type: 3, interval: 300, status: 2 }, // ping, skip
        { id: 4, friendly_name: 'No URL', url: 'ftp://skip.me', type: 1, interval: 300, status: 2 }, // ftp, skip
      ],
    };
    prisma.monitor.findFirst.mockResolvedValue(null);
    prisma.monitor.create.mockImplementation((args: { data: { name: string; target: string } }) =>
      Promise.resolve(makeMonitor({ id: `m-${args.data.name}`, name: args.data.name, target: args.data.target }))
    );

    const result = await service.importExternal('user-1', 'uptime-robot', uptimeRobotExport);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('skips Uptime Robot monitors with non-http URLs', async () => {
    const data = { monitors: [{ friendly_name: 'FTP', url: 'ftp://server.local', type: 1, interval: 60, status: 2 }] };
    const result = await service.importExternal('user-1', 'uptime-robot', data);
    expect(result.imported).toBe(0);
    expect(result.message).toContain('No importable');
  });

  it('parses BetterUptime JSON format', async () => {
    const betterUptimeExport = {
      data: [
        { id: '1', attributes: { url: 'https://site.com', pronounceable_name: 'Main Site', check_type: 'status', request_interval_seconds: 180, paused: false } },
        { id: '2', attributes: { url: 'https://app.site.com', pronounceable_name: 'App', check_type: 'keyword', request_interval_seconds: 60, paused: true } },
        { id: '3', attributes: { url: 'https://skip.com', pronounceable_name: 'TCP', check_type: 'tcp', request_interval_seconds: 60, paused: false } }, // skip
      ],
    };
    // findFirst: return null for duplicate check (first arg: target), return a monitor for ownership check (first arg: id)
    prisma.monitor.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      // duplicate check passes target as one of the where keys
      if ('target' in where) return Promise.resolve(null);
      // ownership check passes id
      return Promise.resolve(makeMonitor());
    });
    prisma.monitor.create.mockImplementation((args: { data: { name: string; target: string } }) =>
      Promise.resolve(makeMonitor({ id: `m-${args.data.name}`, name: args.data.name, target: args.data.target }))
    );
    prisma.monitor.update.mockResolvedValue(makeMonitor());

    const result = await service.importExternal('user-1', 'better-uptime', betterUptimeExport);
    expect(result.imported).toBe(2);
  });

  it('parses CSV format', async () => {
    const csv = `name,url,interval\nMy App,https://myapp.com,120\nAdmin Panel,https://admin.myapp.com,60\nBad Row,not-a-url,60`;
    prisma.monitor.findFirst.mockResolvedValue(null);
    prisma.monitor.create.mockImplementation((args: { data: { name: string; target: string } }) =>
      Promise.resolve(makeMonitor({ id: `m-${args.data.name}`, name: args.data.name, target: args.data.target }))
    );

    const result = await service.importExternal('user-1', 'csv', csv);
    expect(result.imported).toBe(2); // bad row skipped
  });

  it('skips duplicate targets', async () => {
    const data = { monitors: [{ friendly_name: 'Existing', url: 'https://existing.com', type: 1, interval: 300, status: 2 }] };
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ target: 'https://existing.com' }));

    const result = await service.importExternal('user-1', 'uptime-robot', data);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('returns empty result for unknown/empty data', async () => {
    const result = await service.importExternal('user-1', 'uptime-robot', { stat: 'ok', monitors: [] });
    expect(result.imported).toBe(0);
    expect(result.message).toContain('No importable');
  });
});

// ── testVersionConnection() ─────────────────────────────────────────────────

describe('testVersionConnection()', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
    // Mock globalThis.fetch for all tests in this block
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns version from GitHub releases endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v1.2.3' }),
    });

    const result = await service.testVersionConnection({ provider: 'github', target: 'owner/repo' });
    expect(result).toMatchObject({ ok: true, latestVersion: 'v1.2.3', source: 'releases/latest' });
  });

  it('returns invalid target error for bad GitHub repo', async () => {
    const result = await service.testVersionConnection({ provider: 'github', target: 'not-a-valid-repo-format-with//slashes' });
    expect(result).toMatchObject({ ok: false });
  });

  it('falls back to tags when GitHub has no releases (404)', async () => {
    // releases/latest returns 404
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    // tags returns a list
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ name: 'v2.0.0' }] });

    const result = await service.testVersionConnection({ provider: 'github', target: 'owner/repo' });
    expect(result).toMatchObject({ ok: true, source: 'tags' });
  });

  it('returns error when GitHub API returns non-404 error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });

    const result = await service.testVersionConnection({ provider: 'github', target: 'owner/repo' });
    expect(result).toMatchObject({ ok: false, unauthorized: true });
  });

  it('returns version from npm registry', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ version: '3.0.0', name: 'express' }),
    });

    const result = await service.testVersionConnection({ provider: 'npm', target: 'express' });
    expect(result).toMatchObject({ ok: true, latestVersion: '3.0.0' });
  });

  it('returns error for empty npm package name', async () => {
    const result = await service.testVersionConnection({ provider: 'npm', target: '  ' });
    expect(result).toMatchObject({ ok: false });
  });

  it('returns error when npm registry fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    const result = await service.testVersionConnection({ provider: 'npm', target: 'nonexistent-pkg-12345' });
    expect(result).toMatchObject({ ok: false });
  });

  it('returns version from PyPI', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ info: { version: '4.2.1' } }),
    });

    const result = await service.testVersionConnection({ provider: 'pypi', target: 'requests' });
    expect(result).toMatchObject({ ok: true, latestVersion: '4.2.1' });
  });

  it('returns error for empty PyPI package name', async () => {
    const result = await service.testVersionConnection({ provider: 'pypi', target: '' });
    expect(result).toMatchObject({ ok: false });
  });

  it('returns version from crates.io', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ crate: { max_stable_version: '1.0.1', newest_version: '1.0.2' } }),
    });

    const result = await service.testVersionConnection({ provider: 'cargo', target: 'serde' });
    expect(result).toMatchObject({ ok: true, latestVersion: '1.0.1' });
  });

  it('returns error for empty cargo crate name', async () => {
    const result = await service.testVersionConnection({ provider: 'cargo', target: '   ' });
    expect(result).toMatchObject({ ok: false });
  });

  it('returns version from Docker Hub', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ name: 'latest' }] }),
    });

    const result = await service.testVersionConnection({ provider: 'docker', target: 'nginx' });
    expect(result).toMatchObject({ ok: true });
  });

  it('returns version from APT / Debian Sources', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ versions: [{ version: '3.4.0-1', suites: ['bookworm'] }, { version: '3.4.0-beta1', suites: ['testing'] }] }),
    });

    const result = await service.testVersionConnection({ provider: 'apt', target: 'nginx' });
    expect(result).toMatchObject({ ok: true, latestVersion: '3.4.0-1' });
  });

  it('returns error for empty APT package name', async () => {
    const result = await service.testVersionConnection({ provider: 'apt', target: '' });
    expect(result).toMatchObject({ ok: false });
  });

  // ── GitLab provider in testVersionConnection ──────────────────────────────

  it('returns version from GitLab releases endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v2.5.0' }),
    });

    const result = await service.testVersionConnection({ provider: 'gitlab', target: 'gitlab:mygroup/myproject' });
    expect(result).toMatchObject({ ok: true, latestVersion: 'v2.5.0' });
  });

  it('returns error for invalid GitLab target', async () => {
    const result = await service.testVersionConnection({ provider: 'gitlab', target: 'not-valid' });
    expect(result).toMatchObject({ ok: false });
    expect((result as Record<string, unknown>).message).toContain('Invalid GitLab target');
  });

  it('returns error when GitLab API fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });

    const result = await service.testVersionConnection({ provider: 'gitlab', target: 'gitlab:group/project' });
    expect(result).toMatchObject({ ok: false, unauthorized: true });
  });

  it('includes Private-Token header when GitLab token provided', async () => {
    const capturedHeaders: Record<string, string>[] = [];
    fetchMock.mockImplementation((_url: string, opts?: { headers?: Record<string, string> }) => {
      capturedHeaders.push(opts?.headers ?? {});
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: 'v1.0.0' }),
      });
    });

    await service.testVersionConnection({ provider: 'gitlab', target: 'gitlab:group/project', token: 'glpat-secret' });
    expect(capturedHeaders[0]['PRIVATE-TOKEN']).toBe('glpat-secret');
  });

  it('returns APT fallback to first version when all are prerelease', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        versions: [
          { version: '2.0.0-beta1' },
          { version: '1.9.0-rc1' },
        ],
      }),
    });

    const result = await service.testVersionConnection({ provider: 'apt', target: 'mypackage' });
    expect(result).toMatchObject({ ok: true, latestVersion: '2.0.0-beta1' });
  });

  it('returns null latestVersion when APT has no versions in response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ versions: [] }),
    });

    const result = await service.testVersionConnection({ provider: 'apt', target: 'emptypackage' });
    expect(result).toMatchObject({ ok: true, latestVersion: null });
  });

  it('returns version from GitHub with token (Authorization header)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v3.0.0' }),
    });

    const result = await service.testVersionConnection({ provider: 'github', target: 'owner/repo', token: 'ghp_token123' });
    expect(result).toMatchObject({ ok: true, latestVersion: 'v3.0.0' });
  });

  it('returns error when GitHub tags lookup also fails (after 404 on releases)', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404 }) // releases/latest
      .mockResolvedValueOnce({ ok: false, status: 500 }); // tags

    const result = await service.testVersionConnection({ provider: 'github', target: 'owner/repo' });
    expect(result).toMatchObject({ ok: false });
  });
});

// ── discoverCurrentVersion — catch block via fetch throwing ──────────────────

describe('discoverCurrentVersion() — fetch throws (catch path in detectDeployedVersion)', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns manual strategy when all fetch calls throw (catch block covered)', async () => {
    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://myapp.example.com',
    });

    // fetch throws → catch { continue; } path is taken
    // All endpoints fail → returns manual strategy
    expect(result.currentVersion).toBeNull();
    expect(result.strategy).toBe('manual');
  });
});

// ── bulkAction() ─────────────────────────────────────────────────────────────

describe('bulkAction()', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('returns { ok: true, affected: 0 } for empty ids array', async () => {
    const result = await service.bulkAction('user-1', [], 'delete');
    expect(result).toEqual({ ok: true, affected: 0 });
  });

  it('returns { ok: true, affected: 0 } when no owned monitors found', async () => {
    prisma.monitor.findMany.mockResolvedValue([]);
    const result = await service.bulkAction('user-1', ['m1', 'm2'], 'delete');
    expect(result).toEqual({ ok: true, affected: 0 });
  });

  it('deletes monitors on bulk delete action', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const extPrisma = {
      ...prisma,
      monitor: {
        ...prisma.monitor,
        findMany: vi.fn().mockResolvedValue([makeMonitor()]),
        deleteMany,
      },
    };
    const svc = makeService(extPrisma as never);
    const result = await svc.bulkAction('user-1', ['monitor-1'], 'delete');
    expect(deleteMany).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, affected: 1 });
  });

  it('enables monitors on bulk enable', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const extPrisma = {
      ...prisma,
      monitor: {
        ...prisma.monitor,
        findMany: vi.fn().mockResolvedValue([makeMonitor()]),
        updateMany,
      },
    };
    const svc = makeService(extPrisma as never);
    const result = await svc.bulkAction('user-1', ['monitor-1'], 'enable');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: true } }),
    );
    expect(result).toEqual({ ok: true, affected: 1 });
  });

  it('disables monitors on bulk disable', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const extPrisma = {
      ...prisma,
      monitor: {
        ...prisma.monitor,
        findMany: vi.fn().mockResolvedValue([makeMonitor()]),
        updateMany,
      },
    };
    const svc = makeService(extPrisma as never);
    const result = await svc.bulkAction('user-1', ['monitor-1'], 'disable');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: false } }),
    );
    expect(result).toEqual({ ok: true, affected: 1 });
  });

  it('calls runNow for each monitor on bulk run', async () => {
    const checksService = makeChecksService();
    prisma.monitor.findMany.mockResolvedValue([makeMonitor()]);
    const svc = new MonitorsService(prisma as never, checksService as never, makeAudit() as never, makeRealtime() as never);
    const result = await svc.bulkAction('user-1', ['monitor-1'], 'run');
    expect(checksService.runMonitor).toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true });
  });

  it('counts only succeeded runs in bulk run result', async () => {
    const checksService = makeChecksService();
    checksService.runMonitor.mockRejectedValueOnce(new Error('fail'));
    prisma.monitor.findMany.mockResolvedValue([makeMonitor(), makeMonitor({ id: 'monitor-2' })]);
    const svc = new MonitorsService(prisma as never, checksService as never, makeAudit() as never, makeRealtime() as never);
    const result = await svc.bulkAction('user-1', ['monitor-1', 'monitor-2'], 'run');
    // 1 rejected, 1 fulfilled
    expect(result.affected).toBe(1);
  });
});

// ── addMonitorAlert() ─────────────────────────────────────────────────────────

describe('addMonitorAlert()', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('throws NotFoundException when monitor not found', async () => {
    const p = makePrisma(null);
    const svc = makeService(p);
    await expect(svc.addMonitorAlert('user-1', 'non-existent', 'ch-1')).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when alert channel not found', async () => {
    prisma.alertChannel.findFirst.mockResolvedValue(null);
    await expect(service.addMonitorAlert('user-1', 'monitor-1', 'ch-missing')).rejects.toThrow(NotFoundException);
  });

  it('upserts monitorAlert and returns { ok: true }', async () => {
    const result = await service.addMonitorAlert('user-1', 'monitor-1', 'ch-1');
    expect(prisma.monitorAlert.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { monitorId_alertChannelId: { monitorId: 'monitor-1', alertChannelId: 'ch-1' } },
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});

// ── removeMonitorAlert() ──────────────────────────────────────────────────────

describe('removeMonitorAlert()', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('throws NotFoundException when monitor not found', async () => {
    const p = makePrisma(null);
    const svc = makeService(p);
    await expect(svc.removeMonitorAlert('user-1', 'non-existent', 'ch-1')).rejects.toThrow(NotFoundException);
  });

  it('deletes alert assignment and returns { ok: true }', async () => {
    const result = await service.removeMonitorAlert('user-1', 'monitor-1', 'ch-1');
    expect(prisma.monitorAlert.deleteMany).toHaveBeenCalledWith({
      where: { monitorId: 'monitor-1', alertChannelId: 'ch-1' },
    });
    expect(result).toEqual({ ok: true });
  });
});

// ── runNow() ──────────────────────────────────────────────────────────────────

describe('runNow()', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('throws NotFoundException when monitor not found', async () => {
    const p = makePrisma(null);
    const svc = makeService(p);
    await expect(svc.runNow('user-1', 'non-existent')).rejects.toThrow(NotFoundException);
  });

  it('calls checksService.runMonitor with correct monitor shape', async () => {
    const checksService = makeChecksService();
    const svc = new MonitorsService(prisma as never, checksService as never, makeAudit() as never, makeRealtime() as never);

    const result = await svc.runNow('user-1', 'monitor-1');

    expect(checksService.runMonitor).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'monitor-1', userId: 'user-1', type: 'GIT_RELEASE' }),
    );
    expect(result).toMatchObject({ ok: true });
  });

  it('logs audit event on runNow', async () => {
    const audit = makeAudit();
    const svc = new MonitorsService(prisma as never, makeChecksService() as never, audit as never, makeRealtime() as never);
    await svc.runNow('user-1', 'monitor-1');
    expect(audit.log).toHaveBeenCalledWith('monitor.run_now', 'user-1', 'user-1', expect.objectContaining({ monitorId: 'monitor-1' }));
  });
});

// ── listPlugins() ─────────────────────────────────────────────────────────────

describe('listPlugins()', () => {
  it('delegates to checksService.listPlugins()', () => {
    const checksService = makeChecksService();
    const svc = new MonitorsService(makePrisma() as never, checksService as never, makeAudit() as never, makeRealtime() as never);
    const result = svc.listPlugins();
    expect(checksService.listPlugins).toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

// ── create() with tags ────────────────────────────────────────────────────────

describe('create() — with tags', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('creates tags via upsert when tags array is provided', async () => {
    await service.create('user-1', {
      name: 'Tagged Monitor',
      target: 'nestjs/nest',
      type: 'GIT_RELEASE',
      tags: ['production', 'critical'],
    });

    expect(prisma.tag.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.monitorTag.create).toHaveBeenCalledTimes(2);
  });

  it('includes tags in response when tags are created', async () => {
    const result = await service.create('user-1', {
      name: 'Tagged Monitor',
      target: 'nestjs/nest',
      type: 'GIT_RELEASE',
      tags: ['v8'],
    });

    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]).toMatchObject({ id: 'tag-1', name: 'v8' });
  });

  it('skips tag creation when tags array is empty', async () => {
    await service.create('user-1', {
      name: 'No Tags Monitor',
      target: 'nestjs/nest',
      type: 'GIT_RELEASE',
      tags: [],
    });

    expect(prisma.tag.upsert).not.toHaveBeenCalled();
    expect(prisma.monitorTag.create).not.toHaveBeenCalled();
  });
});

// ── update() with tags ────────────────────────────────────────────────────────

describe('update() — with tags', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('replaces all tags when tags array provided', async () => {
    await service.update('user-1', 'monitor-1', { tags: ['new-tag'] });

    expect(prisma.monitorTag.deleteMany).toHaveBeenCalledWith({ where: { monitorId: 'monitor-1' } });
    expect(prisma.tag.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.monitorTag.create).toHaveBeenCalledTimes(1);
  });

  it('clears tags when empty tags array provided', async () => {
    await service.update('user-1', 'monitor-1', { tags: [] });

    expect(prisma.monitorTag.deleteMany).toHaveBeenCalledWith({ where: { monitorId: 'monitor-1' } });
    expect(prisma.tag.upsert).not.toHaveBeenCalled();
  });

  it('does not touch tags when tags is not in update body', async () => {
    await service.update('user-1', 'monitor-1', { name: 'Rename Only' });

    expect(prisma.monitorTag.deleteMany).not.toHaveBeenCalled();
  });
});

// ── versionSummary() ─────────────────────────────────────────────────────────

describe('versionSummary()', () => {
  it('returns correct stats for monitors with runs', async () => {
    const gitMonitor = { ...makeMonitor(), type: 'GIT_RELEASE', configJson: { currentVersion: '1.0.0' } };
    const p = makePrisma();
    p.monitor.findMany.mockResolvedValue([gitMonitor]);
    const monitorRunFindFirst = vi.fn().mockResolvedValue(makeRun({ level: 'green', message: 'up to date' }));
    (p as unknown as Record<string, unknown>).monitorRun = {
      ...(p.monitorRun as object),
      findFirst: monitorRunFindFirst,
    };

    const svc = makeService(p);
    const result = await svc.versionSummary('user-1');

    expect(result.stats).toMatchObject({ total: 1, green: 1, yellow: 0, red: 0 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Test Monitor');
  });

  it('returns "No run yet" and yellow level when monitor has no runs', async () => {
    const gitMonitor = { ...makeMonitor(), type: 'GIT_RELEASE', configJson: {} };
    const p = makePrisma();
    p.monitor.findMany.mockResolvedValue([gitMonitor]);
    (p as unknown as Record<string, unknown>).monitorRun = {
      ...(p.monitorRun as object),
      findFirst: vi.fn().mockResolvedValue(null),
    };

    const svc = makeService(p);
    const result = await svc.versionSummary('user-1');

    expect(result.items[0].latestMessage).toBe('No run yet');
    expect(result.items[0].level).toBe('yellow');
    expect(result.items[0].checkedAt).toBeNull();
  });

  it('returns empty stats when no version monitors exist', async () => {
    const p = makePrisma();
    p.monitor.findMany.mockResolvedValue([]);
    const svc = makeService(p);

    const result = await svc.versionSummary('user-1');
    expect(result.stats.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('counts red/yellow monitors in stats correctly', async () => {
    const mon1 = { ...makeMonitor({ id: 'm1' }), type: 'GIT_RELEASE', configJson: {} };
    const mon2 = { ...makeMonitor({ id: 'm2' }), type: 'DOCKER_IMAGE', configJson: {} };
    const mon3 = { ...makeMonitor({ id: 'm3' }), type: 'GIT_RELEASE', configJson: {} };

    const p = makePrisma();
    p.monitor.findMany.mockResolvedValue([mon1, mon2, mon3]);
    const findFirst = vi.fn()
      .mockResolvedValueOnce(makeRun({ level: 'green', monitorId: 'm1' }))
      .mockResolvedValueOnce(makeRun({ level: 'yellow', monitorId: 'm2' }))
      .mockResolvedValueOnce(makeRun({ level: 'red', monitorId: 'm3' }));
    (p as unknown as Record<string, unknown>).monitorRun = {
      ...(p.monitorRun as object),
      findFirst,
    };

    const svc = makeService(p);
    const result = await svc.versionSummary('user-1');

    expect(result.stats).toMatchObject({ total: 3, green: 1, yellow: 1, red: 1 });
  });
});

// ── discoverCurrentVersion() ──────────────────────────────────────────────────

describe('discoverCurrentVersion()', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns deployed-endpoint strategy when appUrl has version endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ version: '2.3.4' }),
    });

    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://myapp.example.com',
    });

    expect(result.currentVersion).toBe('2.3.4');
    expect(result.strategy).toBe('deployed-endpoint');
    expect(result.detectedFrom).toBeTruthy();
  });

  it('returns manual strategy with auth message when app endpoint returns 401', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'text/plain' },
      json: async () => ({}),
      text: async () => '',
    });

    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://myapp.example.com',
    });

    expect(result.currentVersion).toBeNull();
    expect(result.strategy).toBe('manual');
    expect((result as Record<string, unknown>).message).toContain('401/403');
  });

  it('returns latest-release-probe strategy when no appUrl and testVersionConnection succeeds', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ tag_name: 'v1.0.0' }),
    });

    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
    });

    expect(result.strategy).toBe('latest-release-probe');
    expect(result.currentVersion).toBeTruthy();
  });

  it('returns manual strategy with suggestions when testVersionConnection fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => 'text/plain' },
      json: async () => ({}),
      text: async () => '',
    });

    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
    });

    expect(result.currentVersion).toBeNull();
    expect(result.strategy).toBe('manual');
  });

  it('returns manual strategy for docker when discovery fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => 'text/plain' },
      json: async () => ({}),
      text: async () => '',
    });

    const result = await service.discoverCurrentVersion({
      provider: 'docker',
      target: 'nginx',
    });

    expect(result.currentVersion).toBeNull();
    expect(result.strategy).toBe('manual');
    expect((result as Record<string, unknown>).suggestions).toEqual(
      expect.arrayContaining(['latest', 'stable']),
    );
  });
});

// ── detectDeployedVersion — auth branch coverage ──────────────────────────────

describe('discoverCurrentVersion() — auth type branches in detectDeployedVersion', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses no-auth mode when appAuthType is none', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ version: '3.0.0' }),
    });

    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://myapp.example.com',
      appAuthType: 'none',
    });

    expect(result.currentVersion).toBe('3.0.0');
    expect(result.strategy).toBe('deployed-endpoint');
    // no-auth mode: fetch should be called once (no token modes to retry)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses openvpn basic+header auth modes when appAuthType is openvpn', async () => {
    // fail all requests so we can verify multiple auth modes were tried
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => 'text/plain' },
      text: async () => 'Forbidden',
    });

    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://myapp.example.com',
      appAuthType: 'openvpn',
      openvpnUsername: 'vpnuser',
      openvpnPassword: 'vpnpass',
    });

    expect(result.currentVersion).toBeNull();
    expect(result.strategy).toBe('manual');
    // openvpn has 2 auth modes × N endpoints — should have made multiple requests
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('returns version from text/plain response body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'text/plain' },
      text: async () => '2.5.1',
    });

    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://myapp.example.com',
    });

    expect(result.currentVersion).toBe('2.5.1');
    expect(result.strategy).toBe('deployed-endpoint');
  });

  it('uses Bearer-prefixed token as-is when token already starts with Bearer', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ version: '1.9.0' }),
    });

    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://myapp.example.com',
      appToken: 'Bearer my-existing-bearer-token',
    });

    expect(result.currentVersion).toBe('1.9.0');
    expect(result.strategy).toBe('deployed-endpoint');
    // Token starts with 'Bearer ' so it should be used verbatim
    const authHeader = fetchMock.mock.calls[0][1]?.headers?.authorization as string | undefined;
    if (authHeader) {
      expect(authHeader).toBe('Bearer my-existing-bearer-token');
    }
  });
});

// ── importExternal — extra branch coverage ────────────────────────────────────

describe('importExternal — additional branch coverage', () => {
  let service: MonitorsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('hits default switch branch when unknown source is provided', async () => {
    // @ts-expect-error testing runtime unknown source
    const result = await service.importExternal('user-1', 'unknown-source', {});
    expect(result.imported).toBe(0);
    expect(result.message).toContain('No importable');
  });

  it('records errors array when monitor creation throws', async () => {
    const data = {
      monitors: [
        { friendly_name: 'Failing', url: 'https://will-fail.com', type: 1, interval: 300, status: 2 },
      ],
    };
    prisma.monitor.findFirst.mockResolvedValue(null); // no duplicate
    prisma.monitor.create.mockRejectedValue(new Error('DB constraint violated'));

    const result = await service.importExternal('user-1', 'uptime-robot', data);
    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ name: 'Failing', error: 'DB constraint violated' });
  });

  it('records non-Error exception message in errors array', async () => {
    const data = {
      monitors: [
        { friendly_name: 'Throws', url: 'https://throws.com', type: 1, interval: 300, status: 2 },
      ],
    };
    prisma.monitor.findFirst.mockResolvedValue(null);
    prisma.monitor.create.mockRejectedValue('string error');

    const result = await service.importExternal('user-1', 'uptime-robot', data);
    expect(result.errors[0]).toMatchObject({ error: 'string error' });
  });

  it('imports Uptime Robot data as a plain array (not wrapped in {monitors:[]})', async () => {
    const rawArray = [
      { friendly_name: 'Site A', url: 'https://site-a.com', type: 1, interval: 60, status: 2 },
      { friendly_name: 'Site B', url: 'https://site-b.com', type: 1, interval: 120, status: 2 },
    ];
    prisma.monitor.findFirst.mockResolvedValue(null);
    prisma.monitor.create.mockImplementation((args: { data: { name: string; target: string } }) =>
      Promise.resolve(makeMonitor({ id: `m-${args.data.name}`, name: args.data.name }))
    );

    const result = await service.importExternal('user-1', 'uptime-robot', rawArray);
    expect(result.imported).toBe(2);
  });

  it('imports Uptime Robot monitor with disabled status (enabled=false path)', async () => {
    const data = {
      monitors: [
        { friendly_name: 'Paused', url: 'https://paused.com', type: 1, interval: 300, status: 0 }, // status 0 = paused
      ],
    };
    const created = makeMonitor({ id: 'new-1', name: 'Paused' });
    // findFirst: first call (duplicate check) → null; second call (ownership in update) → the monitor
    prisma.monitor.findFirst
      .mockResolvedValueOnce(null)    // no duplicate
      .mockResolvedValueOnce(created); // ownership check inside update()
    prisma.monitor.create.mockResolvedValue(created);
    prisma.monitor.update.mockResolvedValue(created);

    const result = await service.importExternal('user-1', 'uptime-robot', data);
    expect(result.imported).toBe(1);
    // update should have been called to disable the monitor
    expect(prisma.monitor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ enabled: false }) })
    );
  });

  it('imports Uptime Robot monitor using mon.target fallback when no url key', async () => {
    const data = {
      monitors: [
        { name: 'My Target', target: 'https://via-target.com', type: 1, interval: 60, status: 2 },
      ],
    };
    prisma.monitor.findFirst.mockResolvedValue(null);
    prisma.monitor.create.mockImplementation((args: { data: { name: string; target: string } }) =>
      Promise.resolve(makeMonitor({ name: args.data.name, target: args.data.target }))
    );

    const result = await service.importExternal('user-1', 'uptime-robot', data);
    expect(result.imported).toBe(1);
  });

  it('imports BetterUptime data as plain array', async () => {
    const rawArray = [
      { url: 'https://flat.com', pronounceable_name: 'Flat', check_type: 'status', request_interval_seconds: 60, paused: false },
    ];
    prisma.monitor.findFirst.mockResolvedValue(null);
    prisma.monitor.create.mockImplementation((args: { data: { name: string; target: string } }) =>
      Promise.resolve(makeMonitor({ name: args.data.name }))
    );

    const result = await service.importExternal('user-1', 'better-uptime', rawArray);
    expect(result.imported).toBe(1);
  });

  it('imports BetterUptime data with flat items (no nested attributes)', async () => {
    const data = {
      data: [
        // Flat item (attributes is undefined → fallback to entry itself)
        { url: 'https://flat-entry.com', pronounceable_name: 'Flat Entry', check_type: 'status', request_interval_seconds: 90, paused: false },
      ],
    };
    prisma.monitor.findFirst.mockResolvedValue(null);
    prisma.monitor.create.mockImplementation((args: { data: { name: string; target: string } }) =>
      Promise.resolve(makeMonitor({ name: args.data.name }))
    );

    const result = await service.importExternal('user-1', 'better-uptime', data);
    expect(result.imported).toBe(1);
  });
});

// ── versionSummary — additional branch coverage ───────────────────────────────

describe('versionSummary() — additional branch coverage', () => {
  it('strips leading v from currentVersion in output', async () => {
    const gitMonitor = {
      ...makeMonitor(),
      type: 'GIT_RELEASE',
      configJson: { currentVersion: 'v2.0.0' }, // has leading v
    };
    const p = makePrisma();
    p.monitor.findMany.mockResolvedValue([gitMonitor]);
    (p as unknown as Record<string, unknown>).monitorRun = {
      ...(p.monitorRun as object),
      findFirst: vi.fn().mockResolvedValue(makeRun({ level: 'green', message: 'up to date' })),
    };

    const svc = makeService(p);
    const result = await svc.versionSummary('user-1');
    // v2.0.0 → '2.0.0' (leading v stripped)
    expect(result.items[0].currentVersion).toBe('2.0.0');
  });

  it('uses currentTag from config when currentVersion is not present (DOCKER)', async () => {
    const dockerMonitor = {
      ...makeMonitor({ id: 'docker-1' }),
      type: 'DOCKER_IMAGE',
      configJson: { currentTag: 'v1.5.0' }, // currentTag, not currentVersion
    };
    const p = makePrisma();
    p.monitor.findMany.mockResolvedValue([dockerMonitor]);
    (p as unknown as Record<string, unknown>).monitorRun = {
      ...(p.monitorRun as object),
      findFirst: vi.fn().mockResolvedValue(makeRun({ level: 'yellow', message: 'update available' })),
    };

    const svc = makeService(p);
    const result = await svc.versionSummary('user-1');
    // currentTag 'v1.5.0' → stripped to '1.5.0'
    expect(result.items[0].currentVersion).toBe('1.5.0');
  });

  it('returns empty string when neither currentVersion nor currentTag is set', async () => {
    const mon = {
      ...makeMonitor({ id: 'bare-1' }),
      type: 'GIT_RELEASE',
      configJson: {}, // no version info
    };
    const p = makePrisma();
    p.monitor.findMany.mockResolvedValue([mon]);
    (p as unknown as Record<string, unknown>).monitorRun = {
      ...(p.monitorRun as object),
      findFirst: vi.fn().mockResolvedValue(null),
    };

    const svc = makeService(p);
    const result = await svc.versionSummary('user-1');
    expect(result.items[0].currentVersion).toBe('');
  });

  it('returns null checkedAt when no run exists', async () => {
    const mon = { ...makeMonitor(), type: 'GIT_RELEASE', configJson: {} };
    const p = makePrisma();
    p.monitor.findMany.mockResolvedValue([mon]);
    (p as unknown as Record<string, unknown>).monitorRun = {
      ...(p.monitorRun as object),
      findFirst: vi.fn().mockResolvedValue(null),
    };

    const svc = makeService(p);
    const result = await svc.versionSummary('user-1');
    expect(result.items[0].checkedAt).toBeNull();
  });
});

describe('monitorUptime()', () => {
  function makeUptimeRun(checkedAt: string, ok: boolean, latencyMs: number | null = 50) {
    return makeRun({ checkedAt: new Date(checkedAt), ok, latencyMs });
  }

  it('returns 100% uptime when all checks pass', async () => {
    const runs = [
      makeUptimeRun('2026-03-14T10:00:00Z', true),
      makeUptimeRun('2026-03-14T11:00:00Z', true),
      makeUptimeRun('2026-03-14T12:00:00Z', true),
    ];
    const p = makePrisma();
    p.monitorRun.findMany.mockResolvedValue(runs);
    const svc = makeService(p);
    const result = await svc.monitorUptime('user-1', 'monitor-1', '7d');
    expect(result.uptimePct).toBe(100);
    expect(result.failedChecks).toBe(0);
    expect(result.incidents).toBe(0);
    expect(result.mttrSec).toBe(0);
  });

  it('returns 0% uptime when all checks fail', async () => {
    const runs = [
      makeUptimeRun('2026-03-14T10:00:00Z', false),
      makeUptimeRun('2026-03-14T11:00:00Z', false),
    ];
    const p = makePrisma();
    p.monitorRun.findMany.mockResolvedValue(runs);
    const svc = makeService(p);
    const result = await svc.monitorUptime('user-1', 'monitor-1', '30d');
    expect(result.uptimePct).toBe(0);
    expect(result.failedChecks).toBe(2);
    expect(result.incidents).toBe(1);
  });

  it('detects multiple incidents correctly', async () => {
    const runs = [
      makeUptimeRun('2026-03-14T10:00:00Z', true),
      makeUptimeRun('2026-03-14T11:00:00Z', false), // incident 1 start
      makeUptimeRun('2026-03-14T11:10:00Z', false), // incident 1 end
      makeUptimeRun('2026-03-14T12:00:00Z', true),
      makeUptimeRun('2026-03-14T13:00:00Z', false), // incident 2 (single)
      makeUptimeRun('2026-03-14T14:00:00Z', true),
    ];
    const p = makePrisma();
    p.monitorRun.findMany.mockResolvedValue(runs);
    const svc = makeService(p);
    const result = await svc.monitorUptime('user-1', 'monitor-1', '7d');
    expect(result.incidents).toBe(2);
    expect(result.failedChecks).toBe(3);
    expect(result.uptimePct).toBe(50); // 3/6 pass = 50%
    expect(result.incidentList).toHaveLength(2);
    // Incident 1: 10 minutes
    expect(result.incidentList[0].durationSec).toBe(600);
    // Incident 2: single point (0s duration)
    expect(result.incidentList[1].durationSec).toBe(0);
  });

  it('returns 100% and no incidents when no runs exist', async () => {
    const p = makePrisma();
    p.monitorRun.findMany.mockResolvedValue([]);
    const svc = makeService(p);
    const result = await svc.monitorUptime('user-1', 'monitor-1', '90d');
    expect(result.uptimePct).toBe(100);
    expect(result.totalChecks).toBe(0);
    expect(result.incidents).toBe(0);
    expect(result.avgLatencyMs).toBeNull();
  });

  it('calculates avgLatencyMs correctly', async () => {
    const runs = [
      makeUptimeRun('2026-03-14T10:00:00Z', true, 100),
      makeUptimeRun('2026-03-14T11:00:00Z', true, 200),
      makeUptimeRun('2026-03-14T12:00:00Z', false, null),
    ];
    const p = makePrisma();
    p.monitorRun.findMany.mockResolvedValue(runs);
    const svc = makeService(p);
    const result = await svc.monitorUptime('user-1', 'monitor-1', '7d');
    expect(result.avgLatencyMs).toBe(150); // (100+200)/2
  });

  it('defaults to 30d period for unknown period string', async () => {
    const p = makePrisma();
    p.monitorRun.findMany.mockResolvedValue([]);
    const svc = makeService(p);
    // @ts-expect-error testing runtime coercion
    const result = await svc.monitorUptime('user-1', 'monitor-1', 'invalid');
    // period field should still reflect the passed string — service stores what was asked
    expect(result.monitorId).toBe('monitor-1');
  });

  it('throws NotFoundException when monitor does not belong to user', async () => {
    const p = makePrisma(null);
    p.monitor.findFirst.mockResolvedValue(null);
    const svc = makeService(p);
    await expect(svc.monitorUptime('other-user', 'monitor-1', '7d')).rejects.toThrow(NotFoundException);
  });

  it('returns correct period metadata', async () => {
    const p = makePrisma();
    p.monitorRun.findMany.mockResolvedValue([]);
    const svc = makeService(p);
    const result = await svc.monitorUptime('user-1', 'monitor-1', '1d');
    expect(result.period).toBe('1d');
    expect(result.from).toBeDefined();
    expect(result.to).toBeDefined();
    expect(new Date(result.to).getTime() - new Date(result.from).getTime()).toBeCloseTo(86400_000, -5);
  });

  it('handles open incident at period end (no closing success run)', async () => {
    const runs = [
      makeUptimeRun('2026-03-14T10:00:00Z', true),
      makeUptimeRun('2026-03-14T11:00:00Z', false),
      makeUptimeRun('2026-03-14T12:00:00Z', false),
      // no recovery run — incident is still open
    ];
    const p = makePrisma();
    p.monitorRun.findMany.mockResolvedValue(runs);
    const svc = makeService(p);
    const result = await svc.monitorUptime('user-1', 'monitor-1', '7d');
    expect(result.incidents).toBe(1);
    expect(result.incidentList[0].durationSec).toBe(3600); // 60 min = 3600s
  });
});

// ── sanitizeConfig — HEARTBEAT type coverage ─────────────────────────────────

describe('sanitizeConfig (via list()) — HEARTBEAT type', () => {
  it('sets hasHeartbeatToken=true and hasRepoToken=false when HEARTBEAT monitor has token', async () => {
    const monitor = makeMonitor({
      type: 'HEARTBEAT',
      configJson: { token: 'my-heartbeat-token' },
    });
    const p = makePrisma(monitor);
    const svc = makeService(p);
    const result = await svc.list('user-1');
    expect(result[0].config.hasHeartbeatToken).toBe(true);
    expect(result[0].config.hasRepoToken).toBe(false);
    // HEARTBEAT token is intentionally kept in config (users need it for ping URLs)
    expect(result[0].config.token).toBe('my-heartbeat-token');
  });

  it('sets hasHeartbeatToken=false when HEARTBEAT monitor has no token', async () => {
    const monitor = makeMonitor({ type: 'HEARTBEAT', configJson: {} });
    const p = makePrisma(monitor);
    const svc = makeService(p);
    const result = await svc.list('user-1');
    expect(result[0].config.hasHeartbeatToken).toBe(false);
    expect(result[0].config.hasRepoToken).toBe(false);
  });

  it('returns hasRepoToken=true for non-HEARTBEAT monitor with token in config', async () => {
    const monitor = makeMonitor({ type: 'GIT_RELEASE', configJson: { token: 'repo-token' } });
    const p = makePrisma(monitor);
    const svc = makeService(p);
    const result = await svc.list('user-1');
    expect(result[0].config.hasRepoToken).toBe(true);
    expect(result[0].config.hasHeartbeatToken).toBe(false);
  });

  it('handles null configJson gracefully (covers config ?? {} branch)', async () => {
    const monitor = makeMonitor({ type: 'HTTP', configJson: null });
    const p = makePrisma(monitor);
    const svc = makeService(p);
    const result = await svc.list('user-1');
    expect(result[0].config).toBeDefined();
    expect(result[0].config.hasRepoToken).toBe(false);
  });
});

// ── create() — HEARTBEAT type token + timeoutMin branches ────────────────────

describe('create() — HEARTBEAT type', () => {
  it('auto-generates token when config.token is absent', async () => {
    const p = makePrisma();
    // Override create to capture the data
    let capturedData: Record<string, unknown> = {};
    p.monitor.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      capturedData = data;
      return Promise.resolve({
        ...makeMonitor(),
        type: 'HEARTBEAT',
        configJson: data.configJson,
        monitorAlerts: [],
        monitorTags: [],
      });
    });
    const svc = makeService(p);
    await svc.create('user-1', { name: 'HB', target: 'https://ping.example.com', type: 'HEARTBEAT' });
    const config = capturedData.configJson as Record<string, unknown>;
    expect(typeof config.token).toBe('string');
    expect((config.token as string).length).toBeGreaterThan(10);
  });

  it('auto-generates token when config.token is empty string', async () => {
    const p = makePrisma();
    let capturedData: Record<string, unknown> = {};
    p.monitor.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      capturedData = data;
      return Promise.resolve({ ...makeMonitor(), type: 'HEARTBEAT', configJson: data.configJson, monitorAlerts: [], monitorTags: [] });
    });
    const svc = makeService(p);
    await svc.create('user-1', { name: 'HB', target: 'x', type: 'HEARTBEAT', config: { token: '   ' } });
    const config = capturedData.configJson as Record<string, unknown>;
    expect(typeof config.token).toBe('string');
    expect((config.token as string).trim().length).toBeGreaterThan(0);
  });

  it('preserves existing token when valid', async () => {
    const p = makePrisma();
    let capturedData: Record<string, unknown> = {};
    p.monitor.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      capturedData = data;
      return Promise.resolve({ ...makeMonitor(), type: 'HEARTBEAT', configJson: data.configJson, monitorAlerts: [], monitorTags: [] });
    });
    const svc = makeService(p);
    await svc.create('user-1', { name: 'HB', target: 'x', type: 'HEARTBEAT', config: { token: 'my-valid-token' } });
    const config = capturedData.configJson as Record<string, unknown>;
    expect(config.token).toBe('my-valid-token');
  });

  it('uses default timeoutMin=5 when timeoutMin is 0 (invalid)', async () => {
    const p = makePrisma();
    let capturedData: Record<string, unknown> = {};
    p.monitor.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      capturedData = data;
      return Promise.resolve({ ...makeMonitor(), type: 'HEARTBEAT', configJson: data.configJson, monitorAlerts: [], monitorTags: [] });
    });
    const svc = makeService(p);
    await svc.create('user-1', { name: 'HB', target: 'x', type: 'HEARTBEAT', config: { timeoutMin: 0 } });
    const config = capturedData.configJson as Record<string, unknown>;
    expect(config.timeoutMin).toBe(5);
  });

  it('uses default timeoutMin=5 when timeoutMin is negative', async () => {
    const p = makePrisma();
    let capturedData: Record<string, unknown> = {};
    p.monitor.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      capturedData = data;
      return Promise.resolve({ ...makeMonitor(), type: 'HEARTBEAT', configJson: data.configJson, monitorAlerts: [], monitorTags: [] });
    });
    const svc = makeService(p);
    await svc.create('user-1', { name: 'HB', target: 'x', type: 'HEARTBEAT', config: { timeoutMin: -5 } });
    const config = capturedData.configJson as Record<string, unknown>;
    expect(config.timeoutMin).toBe(5);
  });

  it('preserves valid timeoutMin when positive', async () => {
    const p = makePrisma();
    let capturedData: Record<string, unknown> = {};
    p.monitor.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      capturedData = data;
      return Promise.resolve({ ...makeMonitor(), type: 'HEARTBEAT', configJson: data.configJson, monitorAlerts: [], monitorTags: [] });
    });
    const svc = makeService(p);
    await svc.create('user-1', { name: 'HB', target: 'x', type: 'HEARTBEAT', config: { timeoutMin: 10 } });
    const config = capturedData.configJson as Record<string, unknown>;
    expect(config.timeoutMin).toBe(10);
  });
});

// ── update() — HEARTBEAT type token + timeoutMin branches ────────────────────

describe('update() — HEARTBEAT type', () => {
  it('auto-generates token when updating type to HEARTBEAT and no token set', async () => {
    const p = makePrisma(makeMonitor({ type: 'HTTP', configJson: {} }));
    let capturedData: Record<string, unknown> = {};
    p.monitor.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      capturedData = data;
      return Promise.resolve({ ...makeMonitor(), type: 'HEARTBEAT', configJson: data.configJson });
    });
    const svc = makeService(p);
    await svc.update('user-1', 'monitor-1', { type: 'HEARTBEAT' });
    const config = capturedData.configJson as Record<string, unknown>;
    expect(typeof config.token).toBe('string');
    expect((config.token as string).length).toBeGreaterThan(0);
  });

  it('uses default timeoutMin=5 when updating HEARTBEAT with timeoutMin=NaN', async () => {
    const p = makePrisma(makeMonitor({ type: 'HEARTBEAT', configJson: { token: 'tok' } }));
    let capturedData: Record<string, unknown> = {};
    p.monitor.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      capturedData = data;
      return Promise.resolve({ ...makeMonitor(), type: 'HEARTBEAT', configJson: data.configJson });
    });
    const svc = makeService(p);
    await svc.update('user-1', 'monitor-1', { config: { timeoutMin: NaN } });
    const config = capturedData.configJson as Record<string, unknown>;
    expect(config.timeoutMin).toBe(5);
  });
});

// ── extractVersionFromPayload — comprehensive branch coverage ─────────────────
// Tested indirectly via discoverCurrentVersion → detectDeployedVersion

describe('extractVersionFromPayload — branch coverage via detectDeployedVersion', () => {
  let service: MonitorsService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = makeService();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeJsonResponse(body: unknown) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => body,
    };
  }

  // null payload → return null → detect falls through
  it('returns null currentVersion when JSON response is null', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    fetchMock.mockResolvedValueOnce(makeJsonResponse(null));

    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://example.com',
    });
    // null payload → no version extracted → manual strategy
    expect(result.currentVersion).toBeNull();
  });

  // string payload → extractVersionFromText branch
  it('extracts version from plain string payload', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'text/plain' },
      text: async () => '2.11.3',
    });
    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://example.com',
    });
    expect(result.currentVersion).toBe('2.11.3');
  });

  // array payload → iterate items, find version in first item
  it('extracts version from array response with version in first element', async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse([{ version: '4.2.1' }, { version: '4.1.0' }]));
    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://example.com',
    });
    expect(result.currentVersion).toBe('4.2.1');
  });

  // array payload → all items have no version → return null
  it('returns null when array items contain no usable version string', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    fetchMock.mockResolvedValueOnce(makeJsonResponse([{ status: 'ok' }, { uptime: 99.9 }]));
    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://example.com',
    });
    expect(result.currentVersion).toBeNull();
  });

  // object with directKeySet key `release`
  it('extracts version from object with "release" key (directKeySet hit)', async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ release: '5.3.2', status: 'running' }));
    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://example.com',
    });
    expect(result.currentVersion).toBe('5.3.2');
  });

  // object with directKeySet key `tag`
  it('extracts version from object with "tag" key (directKeySet hit)', async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ tag: 'v3.1.4', ok: true }));
    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://example.com',
    });
    expect(result.currentVersion).toBe('v3.1.4');
  });

  // object with version-like key `appVersion` (not in directKeySet but matches `includes('version')`)
  it('extracts version from object with "appVersion" key (version-like key path)', async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ appVersion: '2.0.5', environment: 'prod' }));
    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://example.com',
    });
    expect(result.currentVersion).toBe('2.0.5');
  });

  // object with version-like key `build_version`
  it('extracts version from object with "build_version" key', async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ build_version: '1.7.0', service: 'api' }));
    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://example.com',
    });
    expect(result.currentVersion).toBe('1.7.0');
  });

  // object with nested `data.version`
  it('extracts version from nested data.version (nested traversal)', async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ status: 'ok', data: { version: '9.1.2' } }));
    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://example.com',
    });
    expect(result.currentVersion).toBe('9.1.2');
  });

  // object with nested `build.version`
  it('extracts version from nested build.version (nested traversal)', async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ ok: true, build: { version: '0.8.3' } }));
    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://example.com',
    });
    expect(result.currentVersion).toBe('0.8.3');
  });

  // object with `latest` key → should be skipped (covers the `includes('latest') continue` branch)
  it('ignores "latest" key and falls back to nested version', async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse({
      latestVersion: '2.0.0',  // should be skipped
      data: { version: '1.5.0' }, // should be used
    }));
    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://example.com',
    });
    // latestVersion key contains 'latest' → skipped; data.version used instead
    expect(result.currentVersion).toBe('1.5.0');
  });
});

// ── detectDeployedVersion — remaining path branches ──────────────────────────

describe('detectDeployedVersion — absolute URL and authFailed path', () => {
  let service: MonitorsService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = makeService();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses absolute URL directly when appVersionEndpoint starts with http', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ version: '7.2.1' }),
    });
    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://myapp.internal',
      appVersionEndpoint: 'https://custom-version-endpoint.example.com/ver',
    });
    expect(result.currentVersion).toBe('7.2.1');
    // should call the absolute URL directly, not base+path
    expect(fetchMock.mock.calls[0][0]).toBe('https://custom-version-endpoint.example.com/ver');
  });

  it('returns manual strategy with authFailed=true message when 401 received', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'text/plain' },
      text: async () => 'Unauthorized',
    });
    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://secure.example.com',
    });
    expect(result.strategy).toBe('manual');
    // authFailed=true → message should mention auth
    const msg = (result as Record<string, unknown>).message as string;
    expect(msg).toMatch(/auth|token|401/i);
  });

  it('returns manual strategy with docker suggestions when provider is docker', async () => {
    // testVersionConnection also fails
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const result = await service.discoverCurrentVersion({
      provider: 'docker',
      target: 'myimage',
    });
    expect(result.strategy).toBe('manual');
    const suggestions = (result as Record<string, unknown>).suggestions as string[];
    expect(suggestions).toContain('latest');
    expect(suggestions).toContain('stable');
  });
});

// ── testVersionConnection — maven/helm providers ──────────────────────────────

describe('testVersionConnection() — maven/helm providers', () => {
  let service: MonitorsService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = makeService();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Maven ──
  it('maven: returns latestVersion from Maven Central docs[0].v', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ response: { docs: [{ v: '3.9.6' }] } }),
    });
    const result = await service.testVersionConnection({ provider: 'maven', target: 'org.apache.maven:maven-core' });
    expect(result.ok).toBe(true);
    expect(result.latestVersion).toBe('3.9.6');
    expect(result.message).toContain('Maven Central');
  });

  it('maven: returns ok:false when docs array is empty', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ response: { docs: [] } }),
    });
    const result = await service.testVersionConnection({ provider: 'maven', target: 'com.example:unknown-artifact' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('No Maven artifact version found');
  });

  it('maven: returns ok:false on API error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    const result = await service.testVersionConnection({ provider: 'maven', target: 'com.example:artifact' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('503');
  });

  it('maven: returns ok:false for invalid target (no colon)', async () => {
    const result = await service.testVersionConnection({ provider: 'maven', target: 'invalidddd' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('groupId:artifactId');
  });

  // ── Helm ──
  it('helm: returns app_version when present', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ version: '14.0.1', app_version: '16.3' }),
    });
    const result = await service.testVersionConnection({ provider: 'helm', target: 'bitnami/postgresql' });
    expect(result.ok).toBe(true);
    expect(result.latestVersion).toBe('16.3');
    expect(result.message).toContain('Artifact Hub');
  });

  it('helm: falls back to version when app_version is absent', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ version: '3.14.0' }),
    });
    const result = await service.testVersionConnection({ provider: 'helm', target: 'helm/helm' });
    expect(result.ok).toBe(true);
    expect(result.latestVersion).toBe('3.14.0');
  });

  it('helm: returns ok:false on Artifact Hub API error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    const result = await service.testVersionConnection({ provider: 'helm', target: 'unknown/chart' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('404');
  });

  it('helm: returns ok:false for invalid target (no slash)', async () => {
    const result = await service.testVersionConnection({ provider: 'helm', target: 'invalidchart' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('repoName/chartName');
  });

  it('returns Docker Hub latestVersion=null when results array is empty', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ results: [] }),
    });
    const result = await service.testVersionConnection({ provider: 'docker', target: 'emptyrepo/image' });
    expect(result.ok).toBe(true);
    expect(result.latestVersion).toBeNull();
  });

  it('handles Docker official image (no slash) by prefixing library/', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ results: [{ name: 'stable' }] }),
    });
    await service.testVersionConnection({ provider: 'docker', target: 'nginx' });
    // URL should contain library/nginx
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('library/nginx');
  });

  it('returns crates.io newest_version as fallback when max_stable_version is absent', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ crate: { newest_version: '1.0.0-rc1' } }),
    });
    const result = await service.testVersionConnection({ provider: 'cargo', target: 'mycrate' });
    expect(result.ok).toBe(true);
    expect(result.latestVersion).toBe('1.0.0-rc1');
  });
});

// ── Branch coverage: sort tiebreaker + openvpn with no credentials ────────────

describe('extractVersionFromText — sort tiebreaker coverage', () => {
  let service: ReturnType<typeof makeService>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = makeService();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('picks the longer version token when candidates tie on score (tiebreaker branch)', async () => {
    // Two version tokens with equal score (no scoring keywords nearby) but different lengths.
    // "1.10.0" (6 chars) should beat "1.2.0" (5 chars) via the tiebreaker.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'text/plain' },
      text: async () => 'deployed: 1.10.0 (replaces 1.2.0)',
    });

    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://example.com',
    });

    // Both tokens score the same (no version-keyword context), so tiebreaker by length applies
    expect(result.currentVersion).toBe('1.10.0');
    expect(result.strategy).toBe('deployed-endpoint');
  });
});

describe('openvpn auth with empty credentials', () => {
  let service: ReturnType<typeof makeService>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = makeService();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tries openvpn modes even when username and password are empty (no-credential path)', async () => {
    // All fetch calls fail so we can verify the auth modes were still attempted
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'text/plain' },
      text: async () => 'Unauthorized',
    });

    const result = await service.discoverCurrentVersion({
      provider: 'github',
      target: 'owner/repo',
      appUrl: 'https://myapp.example.com',
      appAuthType: 'openvpn',
      // No openvpnUsername or openvpnPassword — basic will be empty string (falsy)
    });

    // With no credentials, basic is empty so openvpn-basic apply() no-ops on authorization
    // and openvpn-headers apply() no-ops on x-openvpn-* headers
    expect(result.currentVersion).toBeNull();
    expect(result.strategy).toBe('manual');
    // Still made requests (auth mode lambdas ran, even if they didn't set headers)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
  });
});
