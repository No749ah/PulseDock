/**
 * Integration tests: V2 Status Pages endpoint.
 *
 * Covers:
 *   GET /v2/status-pages — paginated list with isPublished/search/sort filtering
 *
 * Validates: auth guard, pagination meta, user isolation, filter narrowing,
 * sortDir, response shape including derived fields (subscriberCount, widgetCount, hasPassword).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('V2 Status Pages (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let token2: string;
  let userId2: string;

  // Seeded status page IDs for assertions
  let publishedId: string;
  let draftId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const u1 = await createTestUser(prisma, module);
    token = u1.token;
    userId = u1.user.id;

    const u2 = await createTestUser(prisma, module);
    token2 = u2.token;
    userId2 = u2.user.id;

    // Seed: user 1 — one published page with widgets, one draft
    const published = await prisma.publicStatusPage.create({
      data: {
        userId,
        slug: `int-test-pub-${Date.now()}`,
        title: 'Published Alpha Page',
        isPublished: true,
        layout: { widgets: [{}, {}, {}] },
        viewCount: 100,
      },
    });
    publishedId = published.id;

    const draft = await prisma.publicStatusPage.create({
      data: {
        userId,
        slug: `int-test-draft-${Date.now()}`,
        title: 'Draft Beta Page',
        isPublished: false,
        layout: { widgets: [{}] },
        viewCount: 0,
      },
    });
    draftId = draft.id;

    // Seed: user 2 — one page (should not appear for user 1)
    await prisma.publicStatusPage.create({
      data: {
        userId: userId2,
        slug: `int-test-u2-${Date.now()}`,
        title: 'User2 Gamma Page',
        isPublished: true,
        layout: { widgets: [] },
      },
    });
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app);
  }, 15000);

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('requires auth (401 without token)', async () => {
    const res = await request(app.getHttpServer()).get('/v2/status-pages');
    expect([401, 403]).toContain(res.status);
  });

  // ─── Pagination envelope ──────────────────────────────────────────────────

  it('returns paginated envelope with data + meta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/status-pages')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({
      total: expect.any(Number),
      page: expect.any(Number),
      limit: expect.any(Number),
      pages: expect.any(Number),
    });
  });

  it('meta.total reflects user page count (at least 2 seeded)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/status-pages')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
  });

  // ─── User isolation ───────────────────────────────────────────────────────

  it('only returns the authenticated users status pages', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/status-pages')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids = res.body.data.map((p: { id: string }) => p.id);
    // Should include own pages
    expect(ids).toContain(publishedId);
    expect(ids).toContain(draftId);
    // Should NOT include user2's page
    expect(ids).not.toContain('User2 Gamma Page');
  });

  it('user 2 only sees their own pages', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/status-pages')
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);

    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(publishedId);
    expect(ids).not.toContain(draftId);
  });

  // ─── Response shape ───────────────────────────────────────────────────────

  it('status page item has expected fields', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v2/status-pages?search=Alpha`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const item = res.body.data.find((p: { id: string }) => p.id === publishedId);
    expect(item).toBeDefined();
    expect(item).toMatchObject({
      id: publishedId,
      title: 'Published Alpha Page',
      isPublished: true,
      viewCount: 100,
      widgetCount: 3,
      subscriberCount: expect.any(Number),
      hasPassword: false,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('does not expose passwordHash in response', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/status-pages')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    for (const item of res.body.data) {
      expect(item).not.toHaveProperty('passwordHash');
    }
  });

  it('widgetCount reflects widget count from layout.widgets', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v2/status-pages?search=Alpha`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const item = res.body.data.find((p: { id: string }) => p.id === publishedId);
    expect(item?.widgetCount).toBe(3);
  });

  it('draft page has widgetCount 1', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v2/status-pages?search=Beta`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const item = res.body.data.find((p: { id: string }) => p.id === draftId);
    expect(item?.widgetCount).toBe(1);
  });

  // ─── isPublished filter ───────────────────────────────────────────────────

  it('filters by isPublished=true — returns only published pages', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/status-pages?isPublished=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    for (const item of res.body.data) {
      expect(item.isPublished).toBe(true);
    }
    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(publishedId);
    expect(ids).not.toContain(draftId);
  });

  it('filters by isPublished=false — returns only draft pages', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/status-pages?isPublished=false')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    for (const item of res.body.data) {
      expect(item.isPublished).toBe(false);
    }
    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(draftId);
    expect(ids).not.toContain(publishedId);
  });

  // ─── Search ───────────────────────────────────────────────────────────────

  it('search narrows results by title', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/status-pages?search=Alpha')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(publishedId);
    expect(ids).not.toContain(draftId);
  });

  it('search returns empty when query matches nothing', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/status-pages?search=zzznotexistent9999')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.length).toBe(0);
    expect(res.body.meta.total).toBe(0);
  });

  // ─── Sort ─────────────────────────────────────────────────────────────────

  it('sortDir=asc orders by createdAt ascending', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/status-pages?sortBy=createdAt&sortDir=asc')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const dates = res.body.data.map((p: { createdAt: string }) => new Date(p.createdAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
    }
  });

  // ─── Pagination ───────────────────────────────────────────────────────────

  it('limit=1 returns at most 1 result', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/status-pages?limit=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.length).toBeLessThanOrEqual(1);
    expect(res.body.meta.limit).toBe(1);
  });

  it('page 2 with limit 1 returns the next page', async () => {
    const page1 = await request(app.getHttpServer())
      .get('/v2/status-pages?limit=1&page=1&sortBy=createdAt&sortDir=asc')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const page2 = await request(app.getHttpServer())
      .get('/v2/status-pages?limit=1&page=2&sortBy=createdAt&sortDir=asc')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Pages should be different items
    if (page1.body.data.length > 0 && page2.body.data.length > 0) {
      expect(page1.body.data[0].id).not.toBe(page2.body.data[0].id);
    }
  });
});
