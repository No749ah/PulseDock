import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ApiKeysService } from './apikeys.service';

const KEY_PREFIX = 'pdck_';

function makeApiKey(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key-1',
    userId: 'user-1',
    name: 'My Key',
    keyHash: 'hashed-value',
    prefix: 'pdck_abcd1234',
    scope: 'WRITE',
    usageCount: 0,
    lastUsedAt: null,
    expiresAt: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    role: 'user',
    isActive: true,
    lockedUntil: null,
    ...overrides,
  };
}

function makeListKey(overrides: Record<string, unknown> = {}) {
  // Reflects what Prisma's `select` would return (no keyHash)
  return {
    id: 'key-1',
    name: 'My Key',
    prefix: 'pdck_abcd1234',
    scope: 'WRITE',
    usageCount: 0,
    lastUsedAt: null,
    expiresAt: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makePrisma(keyOverride?: ReturnType<typeof makeApiKey> | null) {
  const key = keyOverride !== undefined ? keyOverride : makeApiKey();
  return {
    apiKey: {
      findMany: vi.fn().mockResolvedValue(key ? [makeListKey()] : []),
      findFirst: vi.fn().mockResolvedValue(key),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...makeApiKey(),
          userId: data.userId,
          name: data.name,
          prefix: data.prefix,
          keyHash: data.keyHash,
          expiresAt: data.expiresAt ?? null,
        }),
      ),
      delete: vi.fn().mockResolvedValue(makeApiKey()),
      update: vi.fn().mockResolvedValue(makeApiKey()),
    },
  };
}

function makeService(prismaOverride?: ReturnType<typeof makePrisma>) {
  return new ApiKeysService((prismaOverride ?? makePrisma()) as never);
}

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  // ─── list() ────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns keys for the user', async () => {
      const result = await service.list('user-1');
      expect(prisma.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(result).toHaveLength(1);
    });

    it('does not include keyHash in the returned list', async () => {
      const result = await service.list('user-1');
      expect(result[0]).not.toHaveProperty('keyHash');
    });

    it('returns empty array when user has no keys', async () => {
      const p = makePrisma(null);
      const svc = makeService(p);
      const result = await svc.list('user-1');
      expect(result).toHaveLength(0);
    });
  });

  // ─── create() ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates a key and returns it with the full key once', async () => {
      const result = await service.create('user-1', { name: 'CI Key' });
      expect(result).toHaveProperty('key');
      expect(result.key).toMatch(new RegExp(`^${KEY_PREFIX}`));
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('prefix');
    });

    it('stores a hash, not the plaintext key', async () => {
      await service.create('user-1', { name: 'CI Key' });
      const createCall = prisma.apiKey.create.mock.calls[0];
      const data = (createCall as [{ data: Record<string, unknown> }])[0].data;
      expect(data).toHaveProperty('keyHash');
      expect(data.keyHash).not.toContain(KEY_PREFIX);
    });

    it('stores a short prefix in the record', async () => {
      await service.create('user-1', { name: 'CI Key' });
      const createCall = prisma.apiKey.create.mock.calls[0];
      const data = (createCall as [{ data: Record<string, unknown> }])[0].data;
      expect(typeof data.prefix).toBe('string');
      expect(String(data.prefix)).toMatch(new RegExp(`^${KEY_PREFIX}`));
    });

    it('passes expiresAt when provided', async () => {
      const expiresAt = '2027-01-01T00:00:00.000Z';
      await service.create('user-1', { name: 'Expiring Key', expiresAt });
      const createCall = prisma.apiKey.create.mock.calls[0];
      const data = (createCall as [{ data: Record<string, unknown> }])[0].data;
      expect(data.expiresAt).toEqual(new Date(expiresAt));
    });
  });

  // ─── delete() ──────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('deletes the key and returns { ok: true }', async () => {
      const result = await service.delete('user-1', 'key-1');
      expect(prisma.apiKey.delete).toHaveBeenCalledWith({ where: { id: 'key-1' } });
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when key not found or wrong user', async () => {
      const p = makePrisma(null);
      const svc = makeService(p);
      await expect(svc.delete('user-1', 'non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── validateKey() ─────────────────────────────────────────────────────────

  describe('validateKey()', () => {
    it('returns null for keys that do not start with the prefix', async () => {
      const result = await service.validateKey('invalid-key-without-prefix');
      expect(result).toBeNull();
      expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
    });

    it('returns null when key is not found in DB', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);
      const result = await service.validateKey(`${KEY_PREFIX}${'a'.repeat(64)}`);
      expect(result).toBeNull();
    });

    it('returns user info for a valid key', async () => {
      const { createHash } = await import('node:crypto');
      // Build a valid key from scratch
      const raw = 'a'.repeat(64);
      const plaintext = `${KEY_PREFIX}${raw}`;
      const hash = createHash('sha256').update(plaintext).digest('hex');
      const prefix = plaintext.slice(0, KEY_PREFIX.length + 8);

      const user = makeUser();
      prisma.apiKey.findFirst.mockResolvedValue({
        ...makeApiKey({ keyHash: hash, prefix }),
        user,
      });

      const result = await service.validateKey(plaintext);
      expect(result).not.toBeNull();
      expect(result).toMatchObject({ id: 'user-1', email: 'test@example.com', role: 'user', apiKeyScope: 'WRITE' });
    });

    it('returns null for an inactive user', async () => {
      const { createHash } = await import('node:crypto');
      const raw = 'b'.repeat(64);
      const plaintext = `${KEY_PREFIX}${raw}`;
      const hash = createHash('sha256').update(plaintext).digest('hex');
      const prefix = plaintext.slice(0, KEY_PREFIX.length + 8);

      const inactiveUser = makeUser({ isActive: false });
      prisma.apiKey.findFirst.mockResolvedValue({
        ...makeApiKey({ keyHash: hash, prefix }),
        user: inactiveUser,
      });

      const result = await service.validateKey(plaintext);
      expect(result).toBeNull();
    });

    it('returns null for a locked user', async () => {
      const { createHash } = await import('node:crypto');
      const raw = 'c'.repeat(64);
      const plaintext = `${KEY_PREFIX}${raw}`;
      const hash = createHash('sha256').update(plaintext).digest('hex');
      const prefix = plaintext.slice(0, KEY_PREFIX.length + 8);

      const lockedUser = makeUser({ lockedUntil: new Date(Date.now() + 60_000) });
      prisma.apiKey.findFirst.mockResolvedValue({
        ...makeApiKey({ keyHash: hash, prefix }),
        user: lockedUser,
      });

      const result = await service.validateKey(plaintext);
      expect(result).toBeNull();
    });
  });
});
