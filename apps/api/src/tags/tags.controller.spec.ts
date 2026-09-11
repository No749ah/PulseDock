import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

function makeTagsService(): TagsService {
  return {
    list: vi.fn().mockResolvedValue([{ id: 'tag-1', name: 'prod', color: '#ff0000' }]),
    create: vi.fn().mockResolvedValue({ id: 'tag-2', name: 'dev', color: '#00ff00' }),
    update: vi.fn().mockResolvedValue({ id: 'tag-1', name: 'production', color: '#ff0000' }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as TagsService;
}

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

describe('TagsController', () => {
  let controller: TagsController;
  let tagsService: TagsService;

  beforeEach(() => {
    tagsService = makeTagsService();
    controller = new TagsController(tagsService);
  });

  describe('list()', () => {
    it('returns tags for the authenticated user', async () => {
      const result = await controller.list(makeReq());
      expect(tagsService.list).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([{ id: 'tag-1', name: 'prod', color: '#ff0000' }]);
    });

    it('passes correct userId from request', async () => {
      await controller.list(makeReq('user-99'));
      expect(tagsService.list).toHaveBeenCalledWith('user-99');
    });
  });

  describe('create()', () => {
    it('creates a tag and returns it', async () => {
      const body = { name: 'dev', color: '#00ff00' };
      const result = await controller.create(makeReq(), body);
      expect(tagsService.create).toHaveBeenCalledWith('user-1', body);
      expect(result).toEqual({ id: 'tag-2', name: 'dev', color: '#00ff00' });
    });
  });

  describe('update()', () => {
    it('updates a tag and returns the updated tag', async () => {
      const body = { name: 'production' };
      const result = await controller.update(makeReq(), 'tag-1', body);
      expect(tagsService.update).toHaveBeenCalledWith('user-1', 'tag-1', body);
      expect(result).toEqual({ id: 'tag-1', name: 'production', color: '#ff0000' });
    });
  });

  describe('remove()', () => {
    it('removes a tag and returns ok', async () => {
      const result = await controller.remove(makeReq(), 'tag-1');
      expect(tagsService.remove).toHaveBeenCalledWith('user-1', 'tag-1');
      expect(result).toEqual({ ok: true });
    });
  });
});
