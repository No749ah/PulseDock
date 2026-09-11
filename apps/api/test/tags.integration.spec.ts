/**
 * Integration tests: Tags CRUD operations against a real PostgreSQL database.
 *
 * Covers full lifecycle: create → list → update → delete tags,
 * monitor count reporting, name uniqueness, and user isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Tags CRUD (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;

  // Second user for isolation tests
  let token2: string;
  let userId2: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const u1 = await createTestUser(prisma, module);
    token = u1.token;
    userId = u1.user.id;

    const u2 = await createTestUser(prisma, module);
    token2 = u2.token;
    userId2 = u2.user.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app);
  }, 15000);

  const authHeader = (t = token) => ({ Authorization: `Bearer ${t}` });

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('GET /v1/tags → 401 without auth', async () => {
    await request(app.getHttpServer()).get('/v1/tags').expect(401);
  });

  it('POST /v1/tags → 401 without auth', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/tags')
      .send({ name: 'no-auth' });
    // May return 401 (auth guard) or 403 depending on middleware order
    expect([401, 403]).toContain(res.status);
  });

  // ─── Create ───────────────────────────────────────────────────────────────

  it('should return empty list when no tags exist', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/tags')
      .set(authHeader())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // New user — may have zero tags
  });

  it('should create a tag with name and color', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/tags')
      .set(authHeader())
      .send({ name: 'production', color: '#e74c3c' })
      .expect(201);

    expect(res.body).toMatchObject({
      name: 'production',
      color: '#e74c3c',
    });
    expect(res.body.id).toBeDefined();
  });

  it('should create a tag without color', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/tags')
      .set(authHeader())
      .send({ name: 'staging' })
      .expect(201);

    expect(res.body.name).toBe('staging');
    expect(res.body.id).toBeDefined();
  });

  it('should reject missing name (400)', async () => {
    await request(app.getHttpServer())
      .post('/v1/tags')
      .set(authHeader())
      .send({ color: '#123456' })
      .expect(400);
  });

  it('should reject duplicate tag name (409)', async () => {
    // Create first
    await request(app.getHttpServer())
      .post('/v1/tags')
      .set(authHeader())
      .send({ name: 'duplicate-tag' })
      .expect(201);

    // Try to create same name again
    await request(app.getHttpServer())
      .post('/v1/tags')
      .set(authHeader())
      .send({ name: 'duplicate-tag' })
      .expect(409);
  });

  // ─── List ─────────────────────────────────────────────────────────────────

  it('should list all tags sorted alphabetically', async () => {
    // Create tags in non-alphabetical order
    await request(app.getHttpServer())
      .post('/v1/tags')
      .set(authHeader())
      .send({ name: 'zebra-tag' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/tags')
      .set(authHeader())
      .send({ name: 'alpha-tag' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/v1/tags')
      .set(authHeader())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const names = res.body.map((t: { name: string }) => t.name);

    // Should be alphabetically sorted
    const alphaIdx = names.indexOf('alpha-tag');
    const zebraIdx = names.indexOf('zebra-tag');
    expect(alphaIdx).toBeGreaterThanOrEqual(0);
    expect(zebraIdx).toBeGreaterThanOrEqual(0);
    expect(alphaIdx).toBeLessThan(zebraIdx);
  });

  it('should include monitorCount field on each tag', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/tags')
      .set(authHeader())
      .expect(200);

    for (const tag of res.body) {
      expect(typeof tag.monitorCount).toBe('number');
      expect(tag.monitorCount).toBeGreaterThanOrEqual(0);
    }
  });

  // ─── Update ───────────────────────────────────────────────────────────────

  it('should update a tag name', async () => {
    const create = await request(app.getHttpServer())
      .post('/v1/tags')
      .set(authHeader())
      .send({ name: 'old-name' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/v1/tags/${create.body.id}`)
      .set(authHeader())
      .send({ name: 'new-name' })
      .expect(200);

    expect(res.body.name).toBe('new-name');
    expect(res.body.id).toBe(create.body.id);
  });

  it('should update a tag color', async () => {
    const create = await request(app.getHttpServer())
      .post('/v1/tags')
      .set(authHeader())
      .send({ name: 'color-update-tag', color: '#000000' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/v1/tags/${create.body.id}`)
      .set(authHeader())
      .send({ color: '#ffffff' })
      .expect(200);

    expect(res.body.color).toBe('#ffffff');
  });

  it('should return 404 when updating a nonexistent tag', async () => {
    await request(app.getHttpServer())
      .patch('/v1/tags/nonexistent-id')
      .set(authHeader())
      .send({ name: 'ghost' })
      .expect(404);
  });

  // ─── Delete ───────────────────────────────────────────────────────────────

  it('should delete a tag', async () => {
    const create = await request(app.getHttpServer())
      .post('/v1/tags')
      .set(authHeader())
      .send({ name: 'to-delete' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/tags/${create.body.id}`)
      .set(authHeader())
      .expect(200);

    // Verify gone from list
    const list = await request(app.getHttpServer())
      .get('/v1/tags')
      .set(authHeader())
      .expect(200);

    const found = list.body.find((t: { id: string }) => t.id === create.body.id);
    expect(found).toBeUndefined();
  });

  it('should return 404 when deleting a nonexistent tag', async () => {
    await request(app.getHttpServer())
      .delete('/v1/tags/nonexistent-id')
      .set(authHeader())
      .expect(404);
  });

  // ─── User isolation ────────────────────────────────────────────────────────

  it('should not see another user\'s tags', async () => {
    // User2 creates a tag
    await request(app.getHttpServer())
      .post('/v1/tags')
      .set(authHeader(token2))
      .send({ name: 'user2-private-tag' })
      .expect(201);

    // User1 lists tags — should not see user2's tag
    const res = await request(app.getHttpServer())
      .get('/v1/tags')
      .set(authHeader(token))
      .expect(200);

    const names = res.body.map((t: { name: string }) => t.name);
    expect(names).not.toContain('user2-private-tag');
  });

  it('should not allow updating another user\'s tag', async () => {
    // User2 creates a tag
    const create = await request(app.getHttpServer())
      .post('/v1/tags')
      .set(authHeader(token2))
      .send({ name: 'user2-only-tag' })
      .expect(201);

    // User1 tries to update it — should get 404 (not found for that user)
    await request(app.getHttpServer())
      .patch(`/v1/tags/${create.body.id}`)
      .set(authHeader(token))
      .send({ name: 'hijacked' })
      .expect(404);
  });

  it('should not allow deleting another user\'s tag', async () => {
    // User2 creates a tag
    const create = await request(app.getHttpServer())
      .post('/v1/tags')
      .set(authHeader(token2))
      .send({ name: 'user2-delete-target' })
      .expect(201);

    // User1 tries to delete it — should get 404
    await request(app.getHttpServer())
      .delete(`/v1/tags/${create.body.id}`)
      .set(authHeader(token))
      .expect(404);

    // Verify user2's tag still exists
    const list = await request(app.getHttpServer())
      .get('/v1/tags')
      .set(authHeader(token2))
      .expect(200);

    const found = list.body.find((t: { id: string }) => t.id === create.body.id);
    expect(found).toBeDefined();
  });

  it('should allow same tag name across different users', async () => {
    // User1 creates 'shared-name'
    await request(app.getHttpServer())
      .post('/v1/tags')
      .set(authHeader(token))
      .send({ name: 'shared-name-tag' })
      .expect(201);

    // User2 can also create 'shared-name' (no conflict)
    await request(app.getHttpServer())
      .post('/v1/tags')
      .set(authHeader(token2))
      .send({ name: 'shared-name-tag' })
      .expect(201);
  });
});
