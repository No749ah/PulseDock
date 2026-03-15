import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TagsService } from './tags.service';

function makeTag(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tag-1',
    userId: 'user-1',
    name: 'production',
    color: '#6366f1',
    createdAt: new Date('2026-01-01'),
    _count: { monitorTags: 3 },
    ...overrides,
  };
}

function makePrisma(tagOverride?: ReturnType<typeof makeTag> | null) {
  const tag = tagOverride !== undefined ? tagOverride : makeTag();
  return {
    tag: {
      findMany: vi.fn().mockResolvedValue(tag ? [tag] : []),
      findFirst: vi.fn().mockResolvedValue(tag),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'tag-new',
          userId: data.userId,
          name: data.name,
          color: data.color ?? '#6366f1',
          createdAt: new Date('2026-01-01'),
        }),
      ),
      update: vi.fn().mockResolvedValue({
        ...makeTag(),
        name: 'updated-tag',
        color: '#ff0000',
      }),
      delete: vi.fn().mockResolvedValue(makeTag()),
    },
  };
}

function makeService(prismaOverride?: ReturnType<typeof makePrisma>) {
  return new TagsService((prismaOverride ?? makePrisma()) as never);
}

describe('TagsService', () => {
  let service: TagsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  // ─── list() ────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns tags for the given userId', async () => {
      const result = await service.list('user-1');
      expect(prisma.tag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('tag-1');
    });

    it('returns mapped shape with monitorCount', async () => {
      const result = await service.list('user-1');
      expect(result[0]).toMatchObject({
        id: 'tag-1',
        name: 'production',
        color: '#6366f1',
        monitorCount: 3,
      });
      expect(typeof result[0].createdAt).toBe('string');
    });

    it('returns empty array when user has no tags', async () => {
      const p = makePrisma(null);
      const svc = makeService(p);
      const result = await svc.list('user-1');
      expect(result).toHaveLength(0);
    });
  });

  // ─── create() ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates a tag with the given name and color', async () => {
      prisma.tag.findFirst.mockResolvedValue(null); // no existing tag

      const result = await service.create('user-1', { name: 'staging', color: '#ff0000' });
      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1', name: 'staging', color: '#ff0000' }),
        }),
      );
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('monitorCount', 0);
    });

    it('uses default color when none provided', async () => {
      prisma.tag.findFirst.mockResolvedValue(null);

      await service.create('user-1', { name: 'no-color-tag' });
      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ color: '#6366f1' }),
        }),
      );
    });

    it('throws ConflictException when tag name already exists', async () => {
      // findFirst returns existing tag → conflict
      prisma.tag.findFirst.mockResolvedValue(makeTag());

      await expect(service.create('user-1', { name: 'production' })).rejects.toThrow(ConflictException);
    });
  });

  // ─── update() ──────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('throws NotFoundException when tag not found', async () => {
      prisma.tag.findFirst.mockResolvedValue(null);
      await expect(service.update('user-1', 'non-existent', { name: 'new-name' })).rejects.toThrow(NotFoundException);
    });

    it('updates tag name and color', async () => {
      prisma.tag.findFirst.mockResolvedValueOnce(makeTag()).mockResolvedValueOnce(null); // existing + no conflict check

      const result = await service.update('user-1', 'tag-1', { name: 'updated-tag', color: '#ff0000' });
      expect(prisma.tag.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tag-1' },
          data: expect.objectContaining({ name: 'updated-tag', color: '#ff0000' }),
        }),
      );
      expect(result).toHaveProperty('id');
    });

    it('throws ConflictException when renaming to an existing tag name', async () => {
      // First call: find the tag itself; Second call: find conflicting tag with same name
      prisma.tag.findFirst
        .mockResolvedValueOnce(makeTag({ name: 'old-name' }))
        .mockResolvedValueOnce(makeTag({ id: 'tag-other', name: 'existing-name' }));

      await expect(service.update('user-1', 'tag-1', { name: 'existing-name' })).rejects.toThrow(ConflictException);
    });

    it('skips conflict check when body.name is not provided (falsy branch)', async () => {
      // Only updating color — body.name is undefined, so line 35 if-guard short-circuits
      prisma.tag.findFirst.mockResolvedValueOnce(makeTag());
      const result = await service.update('user-1', 'tag-1', { color: '#abcdef' });
      // Only one findFirst call (no conflict-check query)
      expect(prisma.tag.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.tag.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'production', color: '#abcdef' }),
        }),
      );
      expect(result).toHaveProperty('id');
    });

    it('skips conflict check when body.name equals current name (same-name branch)', async () => {
      // body.name === tag.name → second condition of line 35 if-guard is false → skip conflict check
      prisma.tag.findFirst.mockResolvedValueOnce(makeTag({ name: 'same-name' }));
      await service.update('user-1', 'tag-1', { name: 'same-name', color: '#111111' });
      // Only one findFirst call (no conflict-check query)
      expect(prisma.tag.findFirst).toHaveBeenCalledTimes(1);
    });

    it('falls back to tag.color when body.color is not provided', async () => {
      prisma.tag.findFirst.mockResolvedValueOnce(makeTag({ color: '#original' })).mockResolvedValueOnce(null);
      await service.update('user-1', 'tag-1', { name: 'new-name' });
      // color should fall back to the existing tag's color
      expect(prisma.tag.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ color: '#original' }),
        }),
      );
    });
  });

  // ─── remove() ──────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('throws NotFoundException when tag not found', async () => {
      prisma.tag.findFirst.mockResolvedValue(null);
      await expect(service.remove('user-1', 'non-existent')).rejects.toThrow(NotFoundException);
    });

    it('deletes the tag and returns { ok: true }', async () => {
      const result = await service.remove('user-1', 'tag-1');
      expect(prisma.tag.delete).toHaveBeenCalledWith({ where: { id: 'tag-1' } });
      expect(result).toEqual({ ok: true });
    });
  });
});
