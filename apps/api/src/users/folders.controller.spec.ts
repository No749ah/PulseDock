import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FoldersController } from './folders.controller';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeFolder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'folder-1',
    userId: 'user-1',
    parentId: null as string | null,
    name: 'Production',
    position: 0,
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

  // ── list() — tree ──────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns folder tree for the authenticated user', async () => {
      const { controller, prisma } = makeController();
      const result = await controller.list(req);
      expect(prisma.folder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('children');
      expect(result[0]).toHaveProperty('depth', 0);
    });

    it('returns empty array when user has no folders', async () => {
      const { controller } = makeController({ folders: [] });
      const result = await controller.list(req);
      expect(result).toEqual([]);
    });

    it('nests child folders under parent', async () => {
      const parent = makeFolder({ id: 'parent', name: 'Parent', parentId: null });
      const child = makeFolder({ id: 'child', name: 'Child', parentId: 'parent' });
      const { controller } = makeController({ folders: [parent, child] });
      const result = await controller.list(req);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('parent');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].id).toBe('child');
      expect(result[0].children[0].depth).toBe(1);
    });

    it('bubbles up child stats to parent', async () => {
      const parent = makeFolder({ id: 'parent', name: 'Parent', parentId: null });
      const child = makeFolder({ id: 'child', name: 'Child', parentId: 'parent' });
      const { controller, prisma } = makeController({ folders: [parent, child] });
      // Child folder has a monitor
      (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'mon-1', folderId: 'child', enabled: true, runs: [{ ok: true }] },
      ]);
      const result = await controller.list(req);
      // Parent should aggregate child stats
      expect(result[0].stats.totalMonitors).toBe(1);
      expect(result[0].stats.healthy).toBe(1);
    });

    it('counts down monitors (red) in stats', async () => {
      const { controller, prisma } = makeController();
      (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'mon-1', folderId: 'folder-1', enabled: true, runs: [{ ok: false }] },
      ]);
      const result = await controller.list(req);
      expect(result[0].stats.down).toBe(1);
      expect(result[0].stats.overallStatus).toBe('outage');
    });

    it('counts degraded monitors (2+ recent failures while last run ok)', async () => {
      const { controller, prisma } = makeController();
      (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'mon-1', folderId: 'folder-1', enabled: true,
          runs: [{ ok: true }, { ok: false }, { ok: false }],
        },
      ]);
      const result = await controller.list(req);
      expect(result[0].stats.degraded).toBe(1);
      expect(result[0].stats.overallStatus).toBe('degraded');
    });

    it('sorts children by position then name', async () => {
      const parent = makeFolder({ id: 'parent', name: 'P', parentId: null });
      const a = makeFolder({ id: 'a', name: 'Bravo', parentId: 'parent', position: 1 });
      const b = makeFolder({ id: 'b', name: 'Alpha', parentId: 'parent', position: 0 });
      const { controller } = makeController({ folders: [parent, a, b] });
      const result = await controller.list(req);
      expect(result[0].children[0].name).toBe('Alpha');
      expect(result[0].children[1].name).toBe('Bravo');
    });
  });

  // ── listFlat() ─────────────────────────────────────────────────────────────

  describe('listFlat()', () => {
    it('returns flat list with depth and path', async () => {
      const parent = makeFolder({ id: 'parent', name: 'Infra', parentId: null });
      const child = makeFolder({ id: 'child', name: 'Prod', parentId: 'parent' });
      const prisma = makePrisma({ folders: [parent, child] });
      // Override findMany to include _count
      (prisma.folder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { ...parent, _count: { monitors: 3 } },
        { ...child, _count: { monitors: 1 } },
      ]);
      const audit = makeAudit();
      const controller = new FoldersController(prisma as never, audit as never);
      const result = await controller.listFlat(req);
      expect(result).toHaveLength(2);
      const childResult = result.find((f: { id: string }) => f.id === 'child')!;
      expect(childResult.depth).toBe(1);
      expect(childResult.pathString).toBe('Infra / Prod');
      expect(childResult.monitorCount).toBe(1);
    });
  });

  // ── create() ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates a root folder and logs audit', async () => {
      const { controller, prisma, audit } = makeController();
      const result = await controller.create(req, { name: 'New Folder' });
      expect(prisma.folder.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', name: 'New Folder', parentId: null },
      });
      expect(audit.log).toHaveBeenCalledWith('folder.create', 'user-1', 'user-1', expect.any(Object));
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('children');
    });

    it('creates a nested folder under parent', async () => {
      const parent = makeFolder({ id: 'parent' });
      const { controller, prisma } = makeController({ folder: parent, folders: [parent] });
      // findFirst returns parent, findMany returns [parent] for depth check
      await controller.create(req, { name: 'Child', parentId: 'parent' });
      expect(prisma.folder.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', name: 'Child', parentId: 'parent' },
      });
    });

    it('rejects when parent does not exist', async () => {
      const { controller } = makeController({ folder: null });
      await expect(controller.create(req, { name: 'Child', parentId: 'missing' }))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ── update() ───────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('updates folder name', async () => {
      const { controller, prisma } = makeController();
      const result = await controller.update(req, 'folder-1', { name: 'Updated' });
      expect(prisma.folder.update).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
        data: { name: 'Updated' },
      });
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('parentId');
    });

    it('throws NotFoundException when folder not found', async () => {
      const { controller } = makeController({ folder: null });
      await expect(controller.update(req, 'missing', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('updates position', async () => {
      const { controller, prisma } = makeController();
      await controller.update(req, 'folder-1', { position: 5 });
      expect(prisma.folder.update).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
        data: { position: 5 },
      });
    });
  });

  // ── move() ─────────────────────────────────────────────────────────────────

  describe('move()', () => {
    it('moves folder to new parent', async () => {
      const folder = makeFolder({ id: 'folder-1' });
      const parent = makeFolder({ id: 'new-parent', name: 'NewParent' });
      const prisma = makePrisma({ folder, folders: [folder, parent] });
      // findFirst needs to return folder first, then parent
      let findFirstCall = 0;
      (prisma.folder.findFirst as ReturnType<typeof vi.fn>).mockImplementation(() => {
        findFirstCall++;
        return Promise.resolve(findFirstCall === 1 ? folder : parent);
      });
      const audit = makeAudit();
      const controller = new FoldersController(prisma as never, audit as never);

      const result = await controller.move(req, 'folder-1', { parentId: 'new-parent' });
      expect(prisma.folder.update).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
        data: expect.objectContaining({ parentId: 'new-parent' }),
      });
      expect(result).toHaveProperty('parentId');
    });

    it('moves folder to root', async () => {
      const folder = makeFolder({ id: 'folder-1', parentId: 'old-parent' });
      const { controller, prisma } = makeController({ folder });
      const result = await controller.move(req, 'folder-1', { parentId: null });
      expect(prisma.folder.update).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
        data: { parentId: null },
      });
      expect(result).toHaveProperty('parentId');
    });

    it('throws NotFoundException when folder not found', async () => {
      const { controller } = makeController({ folder: null });
      await expect(controller.move(req, 'missing', { parentId: null })).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove() ───────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('deletes the folder, unlinks monitors, returns { ok: true }', async () => {
      const { controller, prisma } = makeController();
      // No children
      (prisma.folder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const result = await controller.remove(req, 'folder-1');
      expect(prisma.monitor.updateMany).toHaveBeenCalled(); // unlink monitors
      expect(prisma.folder.delete).toHaveBeenCalledWith({ where: { id: 'folder-1' } });
      expect(result).toEqual({ ok: true, unfiledMonitors: true });
    });

    it('throws NotFoundException when folder not found', async () => {
      const { controller } = makeController({ folder: null });
      await expect(controller.remove(req, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── muteFolder() ───────────────────────────────────────────────────────────

  describe('muteFolder()', () => {
    it('mutes all monitors in the folder tree', async () => {
      const { controller, prisma } = makeController({ updateManyCount: 3 });
      // No children
      (prisma.folder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const result = await controller.muteFolder(req, 'folder-1', { minutes: 30 }) as {
        ok: boolean; monitorCount: number; mutedUntil: string;
      };
      expect(result.ok).toBe(true);
      expect(result.monitorCount).toBe(3);
      const mutedUntil = new Date(result.mutedUntil).getTime();
      expect(mutedUntil - Date.now()).toBeGreaterThanOrEqual(29 * 60_000);
    });

    it('throws NotFoundException when folder not found', async () => {
      const { controller } = makeController({ folder: null });
      await expect(controller.muteFolder(req, 'missing', { minutes: 30 })).rejects.toThrow(NotFoundException);
    });
  });

  // ── unmuteFolder() ─────────────────────────────────────────────────────────

  describe('unmuteFolder()', () => {
    it('clears mute on all monitors in folder tree', async () => {
      const { controller, prisma } = makeController({ updateManyCount: 2 });
      (prisma.folder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const result = await controller.unmuteFolder(req, 'folder-1') as { ok: boolean; monitorCount: number };
      expect(result.ok).toBe(true);
      expect(result.monitorCount).toBe(2);
    });

    it('throws NotFoundException when folder not found', async () => {
      const { controller } = makeController({ folder: null });
      await expect(controller.unmuteFolder(req, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getFolderMuteStatus() ──────────────────────────────────────────────────

  describe('getFolderMuteStatus()', () => {
    it('returns mute status for all monitors in folder tree', async () => {
      const future = new Date(Date.now() + 30 * 60_000);
      const { controller, prisma } = makeController({
        monitors: [
          makeMonitor({ id: 'mon-1', name: 'API', mutedUntil: future }),
          makeMonitor({ id: 'mon-2', name: 'Web', mutedUntil: null }),
        ],
      });
      // No children
      (prisma.folder.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const result = await controller.getFolderMuteStatus(req, 'folder-1') as {
        totalMonitors: number; mutedCount: number; allMuted: boolean; anyMuted: boolean;
        includedSubfolders: number;
      };
      expect(result.totalMonitors).toBe(2);
      expect(result.mutedCount).toBe(1);
      expect(result.allMuted).toBe(false);
      expect(result.anyMuted).toBe(true);
      expect(result.includedSubfolders).toBe(0);
    });

    it('throws NotFoundException when folder not found', async () => {
      const { controller } = makeController({ folder: null });
      await expect(controller.getFolderMuteStatus(req, 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
