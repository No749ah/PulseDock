import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { FoldersController } from './folders.controller';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeFolder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'folder-1',
    userId: 'user-1',
    name: 'Production',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mon-1',
    name: 'API Monitor',
    enabled: true,
    mutedUntil: null,
    folderId: 'folder-1',
    ...overrides,
  };
}

function makePrisma(opts: {
  folder?: ReturnType<typeof makeFolder> | null;
  folders?: ReturnType<typeof makeFolder>[];
  monitors?: ReturnType<typeof makeMonitor>[];
  updateManyCount?: number;
} = {}) {
  const folder = opts.folder !== undefined ? opts.folder : makeFolder();
  const folders = opts.folders ?? [makeFolder()];
  const monitors = opts.monitors ?? [];
  const updateManyCount = opts.updateManyCount ?? monitors.length;

  return {
    folder: {
      findMany: vi.fn().mockResolvedValue(folders),
      findFirst: vi.fn().mockResolvedValue(folder),
      create: vi.fn().mockResolvedValue(folder),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...makeFolder(), ...data }),
      ),
      delete: vi.fn().mockResolvedValue(folder),
    },
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitors),
      updateMany: vi.fn().mockResolvedValue({ count: updateManyCount }),
    },
  };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function makeController(opts: Parameters<typeof makePrisma>[0] = {}) {
  const prisma = makePrisma(opts);
  const audit = makeAudit();
  const controller = new FoldersController(prisma as never, audit as never);
  return { controller, prisma, audit };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('FoldersController', () => {
  const req = { user: { id: 'user-1' } };

  // ── list() ─────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns folders for the authenticated user', async () => {
      const { controller, prisma } = makeController();
      const result = await controller.list(req);
      expect(prisma.folder.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('createdAt');
    });

    it('returns empty array when user has no folders', async () => {
      const { controller } = makeController({ folders: [] });
      const result = await controller.list(req);
      expect(result).toEqual([]);
    });

    it('counts down monitors (red) in stats', async () => {
      const { controller, prisma } = makeController();
      const folder = makeFolder();
      (prisma.folder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([folder]);
      // Monitor with a failed latest run → down
      (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'mon-1', folderId: folder.id, enabled: true,
          runs: [{ ok: false }],
        },
      ]);
      const result = await controller.list(req);
      const stats = (result[0] as { stats: { down: number; overallStatus: string } }).stats;
      expect(stats.down).toBe(1);
      expect(stats.overallStatus).toBe('outage');
    });

    it('counts degraded monitors (2+ recent failures while last run ok)', async () => {
      const { controller, prisma } = makeController();
      const folder = makeFolder();
      (prisma.folder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([folder]);
      (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'mon-1', folderId: folder.id, enabled: true,
          runs: [
            { ok: true }, // latest OK
            { ok: false }, { ok: false }, // 2 recent failures → degraded
          ],
        },
      ]);
      const result = await controller.list(req);
      const stats = (result[0] as { stats: { degraded: number; overallStatus: string } }).stats;
      expect(stats.degraded).toBe(1);
      expect(stats.overallStatus).toBe('degraded');
    });

    it('counts healthy monitors (ok, < 2 recent failures)', async () => {
      const { controller, prisma } = makeController();
      const folder = makeFolder();
      (prisma.folder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([folder]);
      (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'mon-1', folderId: folder.id, enabled: true,
          runs: [{ ok: true }, { ok: true }],
        },
      ]);
      const result = await controller.list(req);
      const stats = (result[0] as { stats: { healthy: number; overallStatus: string } }).stats;
      expect(stats.healthy).toBe(1);
      expect(stats.overallStatus).toBe('operational');
    });

    it('counts degraded when monitor has no runs', async () => {
      const { controller, prisma } = makeController();
      const folder = makeFolder();
      (prisma.folder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([folder]);
      (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'mon-1', folderId: folder.id, enabled: true, runs: [] },
      ]);
      const result = await controller.list(req);
      const stats = (result[0] as { stats: { degraded: number } }).stats;
      expect(stats.degraded).toBe(1);
    });
  });

  // ── create() ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates a folder and logs audit', async () => {
      const { controller, prisma, audit } = makeController();
      const result = await controller.create(req, { name: 'New Folder' });
      expect(prisma.folder.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', name: 'New Folder' },
      });
      expect(audit.log).toHaveBeenCalledWith('folder.create', 'user-1', 'user-1', expect.any(Object));
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
    });
  });

  // ── update() ───────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('updates a folder name', async () => {
      const { controller, prisma } = makeController();
      const result = await controller.update(req, 'folder-1', { name: 'Updated Name' });
      expect(prisma.folder.update).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
        data: { name: 'Updated Name' },
      });
      expect(result).toHaveProperty('id');
    });

    it('throws NotFoundException when folder not found', async () => {
      const { controller } = makeController({ folder: null });
      await expect(controller.update(req, 'missing', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('keeps existing name when name not provided', async () => {
      const { controller, prisma } = makeController();
      await controller.update(req, 'folder-1', {});
      const callArgs = prisma.folder.update.mock.calls[0][0];
      expect(callArgs.data.name).toBe('Production'); // original folder name
    });
  });

  // ── remove() ───────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('deletes the folder and returns { ok: true }', async () => {
      const { controller, prisma } = makeController();
      const result = await controller.remove(req, 'folder-1');
      expect(prisma.folder.delete).toHaveBeenCalledWith({ where: { id: 'folder-1' } });
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when folder not found', async () => {
      const { controller } = makeController({ folder: null });
      await expect(controller.remove(req, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── muteFolder() ───────────────────────────────────────────────────────────

  describe('muteFolder()', () => {
    it('mutes all monitors in the folder and returns count + mutedUntil', async () => {
      const { controller, prisma } = makeController({ updateManyCount: 3 });
      const before = Date.now();
      const result = await controller.muteFolder(req, 'folder-1', { minutes: 30 }) as { ok: boolean; monitorCount: number; mutedUntil: string };
      expect(result.ok).toBe(true);
      expect(result.monitorCount).toBe(3);
      const mutedUntil = new Date(result.mutedUntil).getTime();
      // Should be ~30 minutes from now (within 5 seconds tolerance)
      expect(mutedUntil - before).toBeGreaterThanOrEqual(29 * 60_000);
      expect(mutedUntil - before).toBeLessThanOrEqual(31 * 60_000);
      expect(prisma.monitor.updateMany).toHaveBeenCalledWith({
        where: { folderId: 'folder-1', userId: 'user-1' },
        data: { mutedUntil: expect.any(Date) },
      });
    });

    it('mutes with maximum duration (1440 min = 24h)', async () => {
      const { controller } = makeController({ updateManyCount: 1 });
      const result = await controller.muteFolder(req, 'folder-1', { minutes: 1440 }) as { ok: boolean; mutedUntil: string };
      const mutedUntil = new Date(result.mutedUntil).getTime();
      expect(mutedUntil - Date.now()).toBeGreaterThanOrEqual(23 * 60 * 60_000);
    });

    it('throws NotFoundException when folder not found', async () => {
      const { controller } = makeController({ folder: null });
      await expect(controller.muteFolder(req, 'missing', { minutes: 30 })).rejects.toThrow(NotFoundException);
    });

    it('logs audit event with folder name and monitor count', async () => {
      const { controller, audit } = makeController({ updateManyCount: 2 });
      await controller.muteFolder(req, 'folder-1', { minutes: 60 });
      expect(audit.log).toHaveBeenCalledWith('folder.mute', 'user-1', 'user-1', {
        folderId: 'folder-1',
        folderName: 'Production',
        minutes: 60,
        monitorCount: 2,
      });
    });
  });

  // ── unmuteFolder() ─────────────────────────────────────────────────────────

  describe('unmuteFolder()', () => {
    it('clears mute on all monitors in the folder', async () => {
      const { controller, prisma } = makeController({ updateManyCount: 2 });
      const result = await controller.unmuteFolder(req, 'folder-1') as { ok: boolean; monitorCount: number };
      expect(result.ok).toBe(true);
      expect(result.monitorCount).toBe(2);
      expect(prisma.monitor.updateMany).toHaveBeenCalledWith({
        where: { folderId: 'folder-1', userId: 'user-1' },
        data: { mutedUntil: null },
      });
    });

    it('throws NotFoundException when folder not found', async () => {
      const { controller } = makeController({ folder: null });
      await expect(controller.unmuteFolder(req, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('logs audit event on unmute', async () => {
      const { controller, audit } = makeController({ updateManyCount: 1 });
      await controller.unmuteFolder(req, 'folder-1');
      expect(audit.log).toHaveBeenCalledWith('folder.unmute', 'user-1', 'user-1', {
        folderId: 'folder-1',
        folderName: 'Production',
        monitorCount: 1,
      });
    });
  });

  // ── getFolderMuteStatus() ──────────────────────────────────────────────────

  describe('getFolderMuteStatus()', () => {
    it('returns mute status for all monitors in the folder', async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 30 * 60_000);
      const { controller } = makeController({
        monitors: [
          makeMonitor({ id: 'mon-1', name: 'API', mutedUntil: future }),
          makeMonitor({ id: 'mon-2', name: 'Web', mutedUntil: null }),
        ],
      });
      const result = await controller.getFolderMuteStatus(req, 'folder-1') as {
        totalMonitors: number;
        mutedCount: number;
        allMuted: boolean;
        anyMuted: boolean;
        monitors: Array<{ id: string; isMuted: boolean }>;
      };
      expect(result.totalMonitors).toBe(2);
      expect(result.mutedCount).toBe(1);
      expect(result.allMuted).toBe(false);
      expect(result.anyMuted).toBe(true);
      expect(result.monitors.find((m) => m.id === 'mon-1')?.isMuted).toBe(true);
      expect(result.monitors.find((m) => m.id === 'mon-2')?.isMuted).toBe(false);
    });

    it('reports allMuted=true when every monitor in folder is muted', async () => {
      const future = new Date(Date.now() + 60_000);
      const { controller } = makeController({
        monitors: [
          makeMonitor({ id: 'mon-1', mutedUntil: future }),
          makeMonitor({ id: 'mon-2', mutedUntil: future }),
        ],
      });
      const result = await controller.getFolderMuteStatus(req, 'folder-1') as { allMuted: boolean; mutedCount: number };
      expect(result.allMuted).toBe(true);
      expect(result.mutedCount).toBe(2);
    });

    it('reports expired mute as not muted', async () => {
      const past = new Date(Date.now() - 60_000);
      const { controller } = makeController({
        monitors: [makeMonitor({ id: 'mon-1', mutedUntil: past })],
      });
      const result = await controller.getFolderMuteStatus(req, 'folder-1') as { mutedCount: number; anyMuted: boolean };
      expect(result.mutedCount).toBe(0);
      expect(result.anyMuted).toBe(false);
    });

    it('throws NotFoundException when folder not found', async () => {
      const { controller } = makeController({ folder: null });
      await expect(controller.getFolderMuteStatus(req, 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
