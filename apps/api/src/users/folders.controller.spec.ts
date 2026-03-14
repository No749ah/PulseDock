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

function makePrisma(opts: {
  folder?: ReturnType<typeof makeFolder> | null;
  folders?: ReturnType<typeof makeFolder>[];
} = {}) {
  const folder = opts.folder !== undefined ? opts.folder : makeFolder();
  const folders = opts.folders ?? [makeFolder()];

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
});
