/**
 * Integration tests: V2 API Keys endpoint.
 *
 * Covers:
 *   GET /v2/api-keys — paginated API keys with scope/status/search/sort filters
 *
 * Validates: auth guard, pagination meta, user isolation, scope filter,
 * status (active/expired), search, sort (name/createdAt/usageCount),
 * isExpired flag, daysSinceLastUsed, no keyHash exposure.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('GET /v2/api-keys (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let token2: string;
  let userId2: string;

  // Track created key IDs for cleanup
  const keyIds: string[] = [];

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const u1 = await createTestUser(prisma, module);
    token = u1.token;
    userId = u1.user.id;

    const u2 = await createTestUser(prisma, module);
    token2 = u2.token;
    userId2 = u2.user.id;

    // Seed: user 1 — 3 API keys with different scopes/expiry
    const past = new Date('2025-01-01T00:00:00Z');
    const future = new Date('2027-01-01T00:00:00Z');

    const keys = await Promise.all([
      prisma.apiKey.create({
        data: {
          userId,
          name: 'Alpha Key',
          keyHash: `hash-alpha-${userId}`,
          prefix: 'pk_a',
          scope: 'READ',
          usageCount: 5,
          expiresAt: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      }),
      prisma.apiKey.create({
        data: {
          userId,
          name: 'Beta Key',
          keyHash: `hash-beta-${userId}`,
          prefix: 'pk_b',
          scope: 'WRITE',
          usageCount: 100,
          expiresAt: future,
          createdAt: new Date('2026-02-01T00:00:00Z'),
        },
      }),
      prisma.apiKey.create({
        data: {
          userId,
          name: 'Gamma Key',
          keyHash: `hash-gamma-${userId}`,
          prefix: 'pk_c',
          scope: 'ADMIN',
          usageCount: 1,
          expiresAt: past, // expired
          createdAt: new Date('2026-03-01T00:00:00Z'),
        },
      }),
    ]);
    keyIds.push(...keys.map((k) => k.id));

    // Seed: user 2 — 1 key (must not appear for user 1)
    const u2Key = await prisma.apiKey.create({
      data: {
        userId: userId2,
        name: 'User2 Key',
        keyHash: `hash-u2-${userId2}`,
        prefix: 'pk_u2',
        scope: 'READ',
        usageCount: 0,
      },
    });
    keyIds.push(u2Key.id);
  }, 30000);

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { id: { in: keyIds } } });
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app, module);
  });

  // ── Auth guard ─────────────────────────────────────────────────────────────

  it('requires auth — 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/v2/api-keys');
    expect(res.status).toBe(401);
  });

  // ── Basic shape ────────────────────────────────────────────────────────────

  it('returns paginated envelope with data array and meta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('meta includes total, page, limit, pages', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .set(auth());
    expect(res.body.meta).toMatchObject({
      total: 3,
      page: 1,
      limit: 20,
      pages: 1,
    });
  });

  it('key entry has expected shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .set(auth());
    const key = res.body.data[0];
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

  it('keyHash is never exposed', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .set(auth());
    for (const key of res.body.data) {
      expect(key).not.toHaveProperty('keyHash');
    }
  });

  // ── User isolation ─────────────────────────────────────────────────────────

  it('user 1 does not see user 2 keys', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .set(auth());
    const ids = res.body.data.map((k: { id: string }) => k.id);
    expect(ids).not.toContain(keyIds[3]); // user2's key
    expect(res.body.meta.total).toBe(3); // only user1's keys
  });

  it('user 2 sees only their own key', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .set({ Authorization: `Bearer ${token2}` });
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].name).toBe('User2 Key');
  });

  // ── isExpired flag ─────────────────────────────────────────────────────────

  it('isExpired is false for key with null expiresAt', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ search: 'Alpha' })
      .set(auth());
    expect(res.body.data[0].isExpired).toBe(false);
    expect(res.body.data[0].expiresAt).toBeNull();
  });

  it('isExpired is false for key with future expiresAt', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ search: 'Beta' })
      .set(auth());
    expect(res.body.data[0].isExpired).toBe(false);
  });

  it('isExpired is true for key with past expiresAt', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ search: 'Gamma' })
      .set(auth());
    expect(res.body.data[0].isExpired).toBe(true);
  });

  // ── Scope filter ───────────────────────────────────────────────────────────

  it('scope=READ returns only READ keys', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ scope: 'READ' })
      .set(auth());
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].scope).toBe('READ');
  });

  it('scope=ADMIN returns only ADMIN keys', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ scope: 'ADMIN' })
      .set(auth());
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].scope).toBe('ADMIN');
  });

  it('scope=WRITE returns only WRITE keys', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ scope: 'WRITE' })
      .set(auth());
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].scope).toBe('WRITE');
  });

  // ── Status filter ──────────────────────────────────────────────────────────

  it('status=expired returns only expired keys', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ status: 'expired' })
      .set(auth());
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].isExpired).toBe(true);
  });

  it('status=active returns non-expired keys', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ status: 'active' })
      .set(auth());
    expect(res.body.meta.total).toBe(2); // Alpha (null) + Beta (future)
    for (const key of res.body.data) {
      expect(key.isExpired).toBe(false);
    }
  });

  // ── Search ─────────────────────────────────────────────────────────────────

  it('search is case-insensitive prefix match', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ search: 'alpha' })
      .set(auth());
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].name).toBe('Alpha Key');
  });

  it('search with no matches returns empty data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ search: 'zzz-nonexistent' })
      .set(auth());
    expect(res.body.meta.total).toBe(0);
    expect(res.body.data).toHaveLength(0);
  });

  // ── Sort ───────────────────────────────────────────────────────────────────

  it('sort by name asc', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ sortBy: 'name', sortDir: 'asc' })
      .set(auth());
    const names = res.body.data.map((k: { name: string }) => k.name);
    expect(names).toEqual(['Alpha Key', 'Beta Key', 'Gamma Key']);
  });

  it('sort by name desc', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ sortBy: 'name', sortDir: 'desc' })
      .set(auth());
    const names = res.body.data.map((k: { name: string }) => k.name);
    expect(names).toEqual(['Gamma Key', 'Beta Key', 'Alpha Key']);
  });

  it('sort by usageCount desc — Beta(100) > Alpha(5) > Gamma(1)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ sortBy: 'usageCount', sortDir: 'desc' })
      .set(auth());
    const usages = res.body.data.map((k: { usageCount: number }) => k.usageCount);
    expect(usages[0]).toBeGreaterThan(usages[1]);
    expect(usages[1]).toBeGreaterThan(usages[2]);
  });

  it('sort by usageCount asc — Gamma(1) < Alpha(5) < Beta(100)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ sortBy: 'usageCount', sortDir: 'asc' })
      .set(auth());
    const usages = res.body.data.map((k: { usageCount: number }) => k.usageCount);
    expect(usages[0]).toBeLessThan(usages[1]);
    expect(usages[1]).toBeLessThan(usages[2]);
  });

  // ── Pagination ─────────────────────────────────────────────────────────────

  it('limit=1 returns at most 1 result', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ limit: 1 })
      .set(auth());
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(3);
    expect(res.body.meta.pages).toBe(3);
  });

  it('page=2 with limit=1 returns second item', async () => {
    const resP1 = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ limit: 1, page: 1, sortBy: 'name', sortDir: 'asc' })
      .set(auth());
    const resP2 = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ limit: 1, page: 2, sortBy: 'name', sortDir: 'asc' })
      .set(auth());
    expect(resP1.body.data[0].id).not.toBe(resP2.body.data[0].id);
  });

  it('page beyond total returns empty data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ page: 999, limit: 20 })
      .set(auth());
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(3);
  });

  // ── Invalid params ─────────────────────────────────────────────────────────

  it('invalid scope value → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ scope: 'SUPERUSER' })
      .set(auth());
    expect(res.status).toBe(400);
  });

  it('limit=0 → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ limit: 0 })
      .set(auth());
    expect(res.status).toBe(400);
  });

  it('invalid status value → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/api-keys')
      .query({ status: 'invalid' })
      .set(auth());
    expect(res.status).toBe(400);
  });
});
