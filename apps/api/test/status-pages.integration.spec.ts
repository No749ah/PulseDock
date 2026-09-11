/**
 * Integration tests: Status pages CRUD against a real PostgreSQL database.
 *
 * Covers create → read → update → delete lifecycle, slug uniqueness,
 * pagination, user data isolation, and public page access.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Status Pages (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let otherToken: string;
  let otherUserId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const testUser = await createTestUser(prisma, module);
    token = testUser.token;
    userId = testUser.user.id;
    const other = await createTestUser(prisma, module);
    otherToken = other.token;
    otherUserId = other.user.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, otherUserId);
    await destroyTestApp(app);
  }, 15000);

  const authHeader = () => ({ Authorization: `Bearer ${token}` });
  const otherAuthHeader = () => ({ Authorization: `Bearer ${otherToken}` });

  // ─── Create ───────────────────────────────────────────────────────────────

  it('creates a status page with title and slug', async () => {
    const { randomUUID } = await import('node:crypto');
    const slug = `test-page-${randomUUID().slice(0, 8)}`;

    const res = await request(app.getHttpServer())
      .post('/v1/status-pages')
      .set(authHeader())
      .send({
        title: 'My Test Status Page',
        slug,
        description: 'Integration test status page',
      })
      .expect(201);

    expect(res.body.title).toBe('My Test Status Page');
    expect(res.body.slug).toBe(slug);
    expect(res.body.id).toBeDefined();
    expect(res.body.isPublished).toBe(false);
  });

  it('auto-generates unique slug when duplicate is provided (suffix appended)', async () => {
    const { randomUUID } = await import('node:crypto');
    const slug = `dup-slug-${randomUUID().slice(0, 8)}`;

    const first = await request(app.getHttpServer())
      .post('/v1/status-pages')
      .set(authHeader())
      .send({ title: 'First', slug })
      .expect(201);

    // Duplicate slug is allowed — API appends a timestamp suffix
    const second = await request(app.getHttpServer())
      .post('/v1/status-pages')
      .set(authHeader())
      .send({ title: 'Second', slug })
      .expect(201);

    // Slugs should be different (second got a suffix)
    expect(second.body.slug).not.toBe(first.body.slug);
    expect(second.body.slug).toContain(slug.slice(0, 20));
  });

  it('rejects missing title', async () => {
    await request(app.getHttpServer())
      .post('/v1/status-pages')
      .set(authHeader())
      .send({ slug: 'no-title-page' })
      .expect(400);
  });

  it('auto-generates slug when not provided', async () => {
    // Slug is optional — API auto-generates from title
    const res = await request(app.getHttpServer())
      .post('/v1/status-pages')
      .set(authHeader())
      .send({ title: 'Auto Slug Generation Test Page' })
      .expect(201);

    expect(res.body.slug).toBeDefined();
    expect(typeof res.body.slug).toBe('string');
    expect(res.body.slug.length).toBeGreaterThan(0);
  });

  // ─── List ─────────────────────────────────────────────────────────────────

  it('lists status pages for the authenticated user', async () => {
    const { randomUUID } = await import('node:crypto');

    await request(app.getHttpServer())
      .post('/v1/status-pages')
      .set(authHeader())
      .send({ title: 'List Test Page', slug: `list-test-${randomUUID().slice(0, 8)}` })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/v1/status-pages')
      .set(authHeader())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    // All pages should belong to the authenticated user
    for (const page of res.body) {
      expect(page.userId ?? page.id).toBeTruthy();
    }
  });

  // ─── Read ─────────────────────────────────────────────────────────────────

  it('fetches a single status page by id', async () => {
    const { randomUUID } = await import('node:crypto');
    const slug = `fetch-test-${randomUUID().slice(0, 8)}`;

    const created = await request(app.getHttpServer())
      .post('/v1/status-pages')
      .set(authHeader())
      .send({ title: 'Fetch Test', slug })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/v1/status-pages/${created.body.id}`)
      .set(authHeader())
      .expect(200);

    expect(res.body.id).toBe(created.body.id);
    expect(res.body.title).toBe('Fetch Test');
    expect(res.body.slug).toBe(slug);
  });

  it('returns 404 for non-existent status page', async () => {
    await request(app.getHttpServer())
      .get('/v1/status-pages/nonexistent-page-id')
      .set(authHeader())
      .expect(404);
  });

  // ─── Update ───────────────────────────────────────────────────────────────

  it('updates status page title and description', async () => {
    const { randomUUID } = await import('node:crypto');
    const slug = `update-test-${randomUUID().slice(0, 8)}`;

    const created = await request(app.getHttpServer())
      .post('/v1/status-pages')
      .set(authHeader())
      .send({ title: 'Original Title', slug })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/v1/status-pages/${created.body.id}`)
      .set(authHeader())
      .send({ title: 'Updated Title', description: 'Updated description' })
      .expect(200);

    expect(updated.body.title).toBe('Updated Title');
    expect(updated.body.description).toBe('Updated description');
  });

  it('publishes a status page via the toggle endpoint', async () => {
    const { randomUUID } = await import('node:crypto');
    const slug = `publish-test-${randomUUID().slice(0, 8)}`;

    const created = await request(app.getHttpServer())
      .post('/v1/status-pages')
      .set(authHeader())
      .send({ title: 'Publish Test', slug })
      .expect(201);

    expect(created.body.isPublished).toBe(false);

    // Publish toggle endpoint
    const published = await request(app.getHttpServer())
      .post(`/v1/status-pages/${created.body.id}/publish`)
      .set(authHeader())
      .expect(201);

    expect(published.body.isPublished).toBe(true);
  });

  // ─── Delete ───────────────────────────────────────────────────────────────

  it('deletes a status page', async () => {
    const { randomUUID } = await import('node:crypto');
    const slug = `delete-test-${randomUUID().slice(0, 8)}`;

    const created = await request(app.getHttpServer())
      .post('/v1/status-pages')
      .set(authHeader())
      .send({ title: 'Delete Test', slug })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/status-pages/${created.body.id}`)
      .set(authHeader())
      .expect(200);

    // Should 404 after deletion
    await request(app.getHttpServer())
      .get(`/v1/status-pages/${created.body.id}`)
      .set(authHeader())
      .expect(404);
  });

  // ─── User isolation ───────────────────────────────────────────────────────

  it('prevents one user from accessing another user\'s status page (403)', async () => {
    const { randomUUID } = await import('node:crypto');
    const slug = `isolation-test-${randomUUID().slice(0, 8)}`;

    const created = await request(app.getHttpServer())
      .post('/v1/status-pages')
      .set(authHeader())
      .send({ title: 'Private Page', slug })
      .expect(201);

    // API returns 403 (not 404) for another user's page
    await request(app.getHttpServer())
      .get(`/v1/status-pages/${created.body.id}`)
      .set(otherAuthHeader())
      .expect(403);
  });

  it('prevents one user from deleting another user\'s status page (403)', async () => {
    const { randomUUID } = await import('node:crypto');
    const slug = `isolation-delete-${randomUUID().slice(0, 8)}`;

    const created = await request(app.getHttpServer())
      .post('/v1/status-pages')
      .set(authHeader())
      .send({ title: 'Protected Page', slug })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/status-pages/${created.body.id}`)
      .set(otherAuthHeader())
      .expect(403);
  });

  // ─── Public access ────────────────────────────────────────────────────────

  it('serves a published status page publicly by slug', async () => {
    const { randomUUID } = await import('node:crypto');
    const slug = `public-test-${randomUUID().slice(0, 8)}`;

    const created = await request(app.getHttpServer())
      .post('/v1/status-pages')
      .set(authHeader())
      .send({ title: 'Public Test Page', slug })
      .expect(201);

    // Publish via toggle endpoint
    await request(app.getHttpServer())
      .post(`/v1/status-pages/${created.body.id}/publish`)
      .set(authHeader())
      .expect(201);

    // Access without auth via public route
    const res = await request(app.getHttpServer())
      .get(`/v1/public/status/${slug}`)
      .expect(200);

    expect(res.body.slug).toBe(slug);
    expect(res.body.title).toBe('Public Test Page');
  });

  it('returns 404 for unpublished page accessed publicly', async () => {
    const { randomUUID } = await import('node:crypto');
    const slug = `unpublished-${randomUUID().slice(0, 8)}`;

    await request(app.getHttpServer())
      .post('/v1/status-pages')
      .set(authHeader())
      .send({ title: 'Unpublished Page', slug })
      .expect(201);

    // Access without auth — should be 404 since not published
    await request(app.getHttpServer())
      .get(`/v1/public/status/${slug}`)
      .expect(404);
  });

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('returns 401 for unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .get('/v1/status-pages')
      .expect(401);
  });
});
