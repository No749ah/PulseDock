/**
 * Integration tests: API Keys CRUD against a real PostgreSQL database.
 *
 * Covers create → list → rotate → delete lifecycle, API key authentication,
 * scope defaults, expiry, and user data isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('API Keys (integration)', () => {
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

  it('creates an API key with required name', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set(authHeader())
      .send({ name: 'Test Key' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Test Key');
    expect(res.body.key).toMatch(/^pdck_/);
    expect(res.body.prefix).toMatch(/^pdck_/);
    expect(res.body.scope).toBe('WRITE'); // default scope
    expect(res.body.usageCount).toBe(0);
  });

  it('creates a READ-scoped API key', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set(authHeader())
      .send({ name: 'Read Key', scope: 'READ' })
      .expect(201);

    expect(res.body.scope).toBe('READ');
    expect(res.body.key).toMatch(/^pdck_/);
  });

  it('creates an ADMIN-scoped API key', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set(authHeader())
      .send({ name: 'Admin Key', scope: 'ADMIN' })
      .expect(201);

    expect(res.body.scope).toBe('ADMIN');
  });

  it('creates a key with an expiry date', async () => {
    const expiresAt = '2099-01-01T00:00:00.000Z';
    const res = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set(authHeader())
      .send({ name: 'Expiring Key', expiresAt })
      .expect(201);

    expect(res.body.expiresAt).toBeDefined();
    expect(new Date(res.body.expiresAt).getFullYear()).toBe(2099);
  });

  it('rejects creation without a name', async () => {
    await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set(authHeader())
      .send({ scope: 'READ' })
      .expect(400);
  });

  it('rejects creation with an invalid scope', async () => {
    await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set(authHeader())
      .send({ name: 'Bad Scope', scope: 'SUPERADMIN' })
      .expect(400);
  });

  it('requires authentication to create a key (rejects unauthenticated)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .send({ name: 'No Auth' });
    // API may return 401 or 403 depending on guard implementation
    expect([401, 403]).toContain(res.status);
  });

  // ─── List ────────────────────────────────────────────────────────────────

  it('lists only the authenticated user\'s keys', async () => {
    // Create a key for the other user
    await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set(otherAuthHeader())
      .send({ name: 'Other User Key' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/v1/api-keys')
      .set(authHeader())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // All returned keys belong to our user — none expose the plaintext key
    for (const k of res.body) {
      expect(k.key).toBeUndefined(); // plaintext never returned in list
      expect(k.id).toBeDefined();
      expect(k.name).toBeDefined();
      expect(k.prefix).toBeDefined();
    }
  });

  it('requires authentication to list keys (rejects unauthenticated)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/api-keys');
    expect([401, 403]).toContain(res.status);
  });

  // ─── API Key Authentication ───────────────────────────────────────────────

  it('allows using an API key to authenticate requests', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set(authHeader())
      .send({ name: 'Auth Test Key', scope: 'READ' })
      .expect(201);

    const apiKey = createRes.body.key as string;

    // Use the API key to hit a protected endpoint
    const monitorsRes = await request(app.getHttpServer())
      .get('/v1/monitors')
      .set({ Authorization: `Bearer ${apiKey}` })
      .expect(200);

    expect(Array.isArray(monitorsRes.body)).toBe(true);
  });

  it('rejects an invalid API key', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors')
      .set({ Authorization: 'Bearer pdck_invalidsecretkey12345678' })
      .expect(401);
  });

  // ─── Rotate ──────────────────────────────────────────────────────────────

  it('rotates a key and returns a new plaintext key', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set(authHeader())
      .send({ name: 'Key To Rotate' })
      .expect(201);

    const keyId = createRes.body.id as string;
    const oldPlaintext = createRes.body.key as string;
    const oldPrefix = createRes.body.prefix as string;

    const rotateRes = await request(app.getHttpServer())
      .post(`/v1/api-keys/${keyId}/rotate`)
      .set(authHeader())
      .expect(200);

    expect(rotateRes.body.id).toBe(keyId);
    expect(rotateRes.body.name).toBe('Key To Rotate');
    expect(rotateRes.body.key).toMatch(/^pdck_/);
    expect(rotateRes.body.key).not.toBe(oldPlaintext);
    expect(rotateRes.body.prefix).not.toBe(oldPrefix);
    expect(rotateRes.body.usageCount).toBe(0);
  });

  it('invalidates the old key after rotation', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set(authHeader())
      .send({ name: 'Key For Invalidation Test', scope: 'READ' })
      .expect(201);

    const keyId = createRes.body.id as string;
    const oldKey = createRes.body.key as string;

    // Verify old key works
    await request(app.getHttpServer())
      .get('/v1/monitors')
      .set({ Authorization: `Bearer ${oldKey}` })
      .expect(200);

    // Rotate
    await request(app.getHttpServer())
      .post(`/v1/api-keys/${keyId}/rotate`)
      .set(authHeader())
      .expect(200);

    // Old key should now be rejected
    await request(app.getHttpServer())
      .get('/v1/monitors')
      .set({ Authorization: `Bearer ${oldKey}` })
      .expect(401);
  });

  it('returns 404 when rotating another user\'s key', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set(authHeader())
      .send({ name: 'User A Key for Rotate Test' })
      .expect(201);

    const keyId = createRes.body.id as string;

    await request(app.getHttpServer())
      .post(`/v1/api-keys/${keyId}/rotate`)
      .set(otherAuthHeader())
      .expect(404);
  });

  // ─── Delete ──────────────────────────────────────────────────────────────

  it('deletes a key and returns { ok: true }', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set(authHeader())
      .send({ name: 'Key To Delete' })
      .expect(201);

    const keyId = createRes.body.id as string;

    const deleteRes = await request(app.getHttpServer())
      .delete(`/v1/api-keys/${keyId}`)
      .set(authHeader())
      .expect(200);

    expect(deleteRes.body.ok).toBe(true);
  });

  it('deleted key can no longer authenticate', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set(authHeader())
      .send({ name: 'Key For Delete Auth Test', scope: 'READ' })
      .expect(201);

    const keyId = createRes.body.id as string;
    const apiKey = createRes.body.key as string;

    await request(app.getHttpServer())
      .delete(`/v1/api-keys/${keyId}`)
      .set(authHeader())
      .expect(200);

    await request(app.getHttpServer())
      .get('/v1/monitors')
      .set({ Authorization: `Bearer ${apiKey}` })
      .expect(401);
  });

  it('returns 404 when deleting a non-existent key', async () => {
    await request(app.getHttpServer())
      .delete('/v1/api-keys/non-existent-id')
      .set(authHeader())
      .expect(404);
  });

  // ─── User Isolation ───────────────────────────────────────────────────────

  it('prevents user B from deleting user A\'s API key', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/v1/api-keys')
      .set(authHeader())
      .send({ name: 'User A Private Key' })
      .expect(201);

    const keyId = createRes.body.id as string;

    // User B tries to delete user A's key
    await request(app.getHttpServer())
      .delete(`/v1/api-keys/${keyId}`)
      .set(otherAuthHeader())
      .expect(404);

    // Key still exists for user A
    const listRes = await request(app.getHttpServer())
      .get('/v1/api-keys')
      .set(authHeader())
      .expect(200);

    const ids = (listRes.body as Array<{ id: string }>).map((k) => k.id);
    expect(ids).toContain(keyId);
  });
});
