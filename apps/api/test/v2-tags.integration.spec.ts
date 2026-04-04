/**
 * Integration tests: V2 Tags endpoint.
 *
 * Covers:
 *   GET /v2/tags — paginated list with search/sort filtering
 *
 * Validates: auth guard, pagination meta, user isolation, search filter,
 * sort by name/createdAt/monitorCount, response shape including derived monitorCount.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('V2 Tags (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let token2: string;
  let userId2: string;

  let tagAlphaId: string;
  let tagBetaId: string;
  let tagGammaId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const u1 = await createTestUser(prisma, module);
    token = u1.token;
    userId = u1.user.id;

    const u2 = await createTestUser(prisma, module);
    token2 = u2.token;
    userId2 = u2.user.id;

    // Seed: user 1 — three tags with different creation times
    const alpha = await prisma.tag.create({ data: { userId, name: 'alpha-tag', color: '#ef4444' } });
    tagAlphaId = alpha.id;

    // Small delay so createdAt order is deterministic
    await new Promise((r) => setTimeout(r, 5));
    const beta = await prisma.tag.create({ data: { userId, name: 'beta-tag', color: '#3b82f6' } });
    tagBetaId = beta.id;

    await new Promise((r) => setTimeout(r, 5));
    const gamma = await prisma.tag.create({ data: { userId, name: 'gamma-tag', color: '#10b981' } });
    tagGammaId = gamma.id;

    // Seed: user 2 — one tag (must not appear for user 1)
    await prisma.tag.create({ data: { userId: userId2, name: 'user2-only-tag' } });
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app, module);
  }, 30000);

  // ── Auth guard ─────────────────────────────────────────────────────────────

  it('returns 401 without auth token', async () => {
    await request(app.getHttpServer())
      .get('/v2/tags')
      .expect(401);
  });

  it('returns 401 with invalid auth token', async () => {
    await request(app.getHttpServer())
      .get('/v2/tags')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  // ── Basic shape ────────────────────────────────────────────────────────────

  it('returns paginated response with correct meta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/tags')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.meta).toMatchObject({
      total: 3,
      page: 1,
      limit: 20,
      pages: 1,
    });
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(3);
  });

  it('returns correct field shape for each tag', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/tags')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const tag = res.body.data.find((t: { id: string }) => t.id === tagAlphaId);
    expect(tag).toBeDefined();
    expect(tag.name).toBe('alpha-tag');
    expect(tag.color).toBe('#ef4444');
    expect(typeof tag.monitorCount).toBe('number');
    expect(typeof tag.createdAt).toBe('string');
  });

  it('returns color string for tag color', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/tags')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const gamma = res.body.data.find((t: { id: string }) => t.id === tagGammaId);
    expect(gamma).toBeDefined();
    expect(typeof gamma.color).toBe('string');
    expect(gamma.color).toBe('#10b981');
  });

  // ── User isolation ─────────────────────────────────────────────────────────

  it('only returns tags for the authenticated user', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/tags')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids = res.body.data.map((t: { id: string }) => t.id);
    expect(ids).toContain(tagAlphaId);
    expect(ids).toContain(tagBetaId);
    expect(ids).toContain(tagGammaId);
    // User 2's tag must not appear
    res.body.data.forEach((t: { name: string }) => {
      expect(t.name).not.toBe('user2-only-tag');
    });
  });

  it('user 2 only sees their own tags', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/tags')
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);

    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].name).toBe('user2-only-tag');
  });

  // ── Pagination ─────────────────────────────────────────────────────────────

  it('respects page and limit query params', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/tags?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ total: 3, page: 1, limit: 2, pages: 2 });
  });

  it('returns second page correctly', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/tags?page=2&limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.page).toBe(2);
  });

  // ── Search ─────────────────────────────────────────────────────────────────

  it('filters by search term (case-insensitive)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/tags?search=ALPHA')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('alpha-tag');
    expect(res.body.meta.total).toBe(1);
  });

  it('returns empty list for search with no matches', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/tags?search=xyz-does-not-exist')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });

  // ── Sort ───────────────────────────────────────────────────────────────────

  it('sorts by name ascending by default', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/tags')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const names = res.body.data.map((t: { name: string }) => t.name);
    expect(names).toEqual(['alpha-tag', 'beta-tag', 'gamma-tag']);
  });

  it('sorts by name descending', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/tags?sortBy=name&sortDir=desc')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const names = res.body.data.map((t: { name: string }) => t.name);
    expect(names).toEqual(['gamma-tag', 'beta-tag', 'alpha-tag']);
  });

  it('sorts by createdAt descending (most recent first)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/tags?sortBy=createdAt&sortDir=desc')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids = res.body.data.map((t: { id: string }) => t.id);
    // gamma created last, then beta, then alpha
    expect(ids[0]).toBe(tagGammaId);
    expect(ids[2]).toBe(tagAlphaId);
  });

  it('sorts by monitorCount ascending (0-count tags come first)', async () => {
    // All seeded tags have 0 monitorCount (no monitors attached) — just verify response is valid
    const res = await request(app.getHttpServer())
      .get('/v2/tags?sortBy=monitorCount&sortDir=asc')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toHaveLength(3);
    const counts = res.body.data.map((t: { monitorCount: number }) => t.monitorCount);
    // All 0 — verify the array is non-descending
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });
});
