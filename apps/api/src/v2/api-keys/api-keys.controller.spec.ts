import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2ApiKeysController } from './api-keys.controller';
import { PrismaService } from '../../common/prisma.service';

const NOW = new Date('2026-04-04T12:00:00Z');

function makeKey(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'key-1',
    name: 'My Key',
    prefix: 'pk_live',
    scope: 'WRITE',
    usageCount: 42,
    lastUsedAt: new Date('2026-04-01T10:00:00Z'),
    expiresAt: null,
    createdAt: new Date('2026-03-01T00:00:00Z'),
    ...overrides,
  };
}

function makePrisma(keys: ReturnType<typeof makeKey>[] = [makeKey()], total = 1) {
  return {
    apiKey: {
      findMany: vi.fn().mockResolvedValue(keys),
      count: vi.fn().mockResolvedValue(total),
    },
  } as unknown as PrismaService;
}

function makeReq(userId = 'user-1') {
  return { user: { id: userId } } as Parameters<V2ApiKeysController['list']>[0];
}

describe('V2ApiKeysController', () => {
  let controller: V2ApiKeysController;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prisma = makePrisma();
    controller = new V2ApiKeysController(prisma);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('GET /v2/api-keys', () => {
    it('returns paginated envelope with data and meta', async () => {
      const result = await controller.list(makeReq(), {});
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('meta includes total, page, limit, pages', async () => {
      prisma = makePrisma([makeKey()], 1);
      controller = new V2ApiKeysController(prisma);
      const result = await controller.list(makeReq(), { limit: 20 });
      expect(result.meta).toMatchObject({ total: 1, page: 1, limit: 20, pages: 1 });
    });

    it('each key includes expected fields', async () => {
      const result = await controller.list(makeReq(), {});
      const key = result.data[0] as Record<string, unknown>;
      expect(key).toHaveProperty('id');
      expect(key).toHaveProperty('name');
      expect(key).toHaveProperty('prefix');
      expect(key).toHaveProperty('scope');
      expect(key).toHaveProperty('usageCount');
      expect(key).toHaveProperty('lastUsedAt');
      expect(key).toHaveProperty('expiresAt');
      expect(key).toHaveProperty('createdAt');
      expect(key).toHaveProperty('isExpired');
      expect(key).toHaveProperty('daysSinceLastUsed');
    });

    it('does not expose keyHash', async () => {
      const result = await controller.list(makeReq(), {});
      const key = result.data[0] as Record<string, unknown>;
      expect(key).not.toHaveProperty('keyHash');
    });

    it('isExpired is false for non-expired key (expiresAt null)', async () => {
      prisma = makePrisma([makeKey({ expiresAt: null })]);
      controller = new V2ApiKeysController(prisma);
      const result = await controller.list(makeReq(), {});
      const key = result.data[0] as Record<string, unknown>;
      expect(key.isExpired).toBe(false);
    });

    it('isExpired is false for key expiring in the future', async () => {
      const future = new Date('2027-01-01T00:00:00Z');
      prisma = makePrisma([makeKey({ expiresAt: future })]);
      controller = new V2ApiKeysController(prisma);
      const result = await controller.list(makeReq(), {});
      const key = result.data[0] as Record<string, unknown>;
      expect(key.isExpired).toBe(false);
    });

    it('isExpired is true for key with past expiresAt', async () => {
      const past = new Date('2025-01-01T00:00:00Z');
      prisma = makePrisma([makeKey({ expiresAt: past })]);
      controller = new V2ApiKeysController(prisma);
      const result = await controller.list(makeReq(), {});
      const key = result.data[0] as Record<string, unknown>;
      expect(key.isExpired).toBe(true);
    });

    it('daysSinceLastUsed is computed correctly', async () => {
      // NOW is 2026-04-04T12:00:00Z, lastUsedAt is 2026-04-01T10:00:00Z → 3 days ago
      const result = await controller.list(makeReq(), {});
      const key = result.data[0] as Record<string, unknown>;
      expect(key.daysSinceLastUsed).toBe(3);
    });

    it('daysSinceLastUsed is null when lastUsedAt is null', async () => {
      prisma = makePrisma([makeKey({ lastUsedAt: null })]);
      controller = new V2ApiKeysController(prisma);
      const result = await controller.list(makeReq(), {});
      const key = result.data[0] as Record<string, unknown>;
      expect(key.daysSinceLastUsed).toBeNull();
    });

    it('filters by scope — passes scope to prisma where', async () => {
      await controller.list(makeReq(), { scope: 'READ' });
      const whereArg = (prisma.apiKey.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
      expect(whereArg.scope).toBe('READ');
    });

    it('filters by status=expired — sets expiresAt lt now', async () => {
      await controller.list(makeReq(), { status: 'expired' });
      const whereArg = (prisma.apiKey.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
      expect(whereArg.expiresAt).toMatchObject({ lt: NOW });
    });

    it('filters by status=active — sets OR clause with expiresAt null or gte now', async () => {
      await controller.list(makeReq(), { status: 'active' });
      const whereArg = (prisma.apiKey.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
      expect(whereArg.OR).toBeDefined();
      expect(Array.isArray(whereArg.OR)).toBe(true);
      expect(whereArg.OR).toHaveLength(2);
      expect(whereArg.OR[0]).toMatchObject({ expiresAt: null });
      expect(whereArg.OR[1].expiresAt).toBeDefined();
    });

    it('search — passes name startsWith to prisma', async () => {
      await controller.list(makeReq(), { search: 'My' });
      const whereArg = (prisma.apiKey.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
      expect(whereArg.name).toMatchObject({ startsWith: 'My', mode: 'insensitive' });
    });

    it('uses userId from request for isolation', async () => {
      await controller.list(makeReq('user-xyz'), {});
      const whereArg = (prisma.apiKey.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
      expect(whereArg.userId).toBe('user-xyz');
    });

    it('uses default limit of 20', async () => {
      await controller.list(makeReq(), {});
      const takeArg = (prisma.apiKey.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].take;
      expect(takeArg).toBe(20);
    });

    it('sorts by createdAt desc by default', async () => {
      await controller.list(makeReq(), {});
      const orderByArg = (prisma.apiKey.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].orderBy;
      expect(orderByArg).toMatchObject({ createdAt: 'desc' });
    });

    it('sorts by name asc when specified', async () => {
      await controller.list(makeReq(), { sortBy: 'name', sortDir: 'asc' });
      const orderByArg = (prisma.apiKey.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].orderBy;
      expect(orderByArg).toMatchObject({ name: 'asc' });
    });

    it('sorts by usageCount in-memory — fetches all then slices', async () => {
      const keys = [
        makeKey({ id: 'k1', usageCount: 10 }),
        makeKey({ id: 'k2', usageCount: 50 }),
        makeKey({ id: 'k3', usageCount: 1 }),
      ];
      prisma = makePrisma(keys, 3);
      controller = new V2ApiKeysController(prisma);
      const result = await controller.list(makeReq(), { sortBy: 'usageCount', sortDir: 'desc', limit: 3 });
      const ids = (result.data as Array<Record<string, unknown>>).map((k) => k.id);
      expect(ids).toEqual(['k2', 'k1', 'k3']);
    });

    it('sorts by usageCount asc', async () => {
      const keys = [
        makeKey({ id: 'k1', usageCount: 10 }),
        makeKey({ id: 'k2', usageCount: 50 }),
        makeKey({ id: 'k3', usageCount: 1 }),
      ];
      prisma = makePrisma(keys, 3);
      controller = new V2ApiKeysController(prisma);
      const result = await controller.list(makeReq(), { sortBy: 'usageCount', sortDir: 'asc', limit: 3 });
      const ids = (result.data as Array<Record<string, unknown>>).map((k) => k.id);
      expect(ids).toEqual(['k3', 'k1', 'k2']);
    });

    it('meta.pages is ceil(total / limit)', async () => {
      prisma = makePrisma([makeKey()], 5);
      controller = new V2ApiKeysController(prisma);
      const result = await controller.list(makeReq(), { limit: 2 });
      expect(result.meta.pages).toBe(3);
    });
  });
});
