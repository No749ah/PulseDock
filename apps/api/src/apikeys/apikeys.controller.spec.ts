import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeysController } from './apikeys.controller';

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

function makeApiKeysService() {
  return {
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  };
}

describe('ApiKeysController', () => {
  let controller: ApiKeysController;
  let service: ReturnType<typeof makeApiKeysService>;

  beforeEach(() => {
    service = makeApiKeysService();
    controller = new ApiKeysController(service as never);
  });

  describe('list()', () => {
    it('delegates to service.list with userId', async () => {
      service.list.mockResolvedValue([{ id: 'k-1', prefix: 'pdck_abc' }]);
      const result = await controller.list(makeReq());
      expect(service.list).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([{ id: 'k-1', prefix: 'pdck_abc' }]);
    });

    it('returns empty array when no keys', async () => {
      service.list.mockResolvedValue([]);
      const result = await controller.list(makeReq('user-2'));
      expect(service.list).toHaveBeenCalledWith('user-2');
      expect(result).toEqual([]);
    });
  });

  describe('create()', () => {
    it('delegates to service.create with userId and dto', async () => {
      const dto = { name: 'CI Token' };
      const created = { id: 'k-1', name: 'CI Token', plaintext: 'pdck_abc123', prefix: 'pdck_abc1' };
      service.create.mockResolvedValue(created);
      const result = await controller.create(makeReq(), dto as never);
      expect(service.create).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(created);
    });

    it('passes expiresAt to service.create', async () => {
      const dto = { name: 'Expiring Key', expiresAt: '2026-12-31T00:00:00Z' };
      service.create.mockResolvedValue({ id: 'k-2', ...dto });
      await controller.create(makeReq(), dto as never);
      expect(service.create).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('delete()', () => {
    it('delegates to service.delete with userId and keyId', async () => {
      service.delete.mockResolvedValue({ deleted: true });
      const result = await controller.delete(makeReq(), 'k-1');
      expect(service.delete).toHaveBeenCalledWith('user-1', 'k-1');
      expect(result).toEqual({ deleted: true });
    });

    it('passes 404 through when service throws', async () => {
      service.delete.mockRejectedValue(new Error('Not found'));
      await expect(controller.delete(makeReq(), 'nonexistent')).rejects.toThrow('Not found');
    });
  });
});
