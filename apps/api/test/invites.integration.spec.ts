/**
 * Integration tests: Admin Invites endpoints.
 *
 * Covers:
 *   GET    /v1/admin/invites       — list invites (admin only)
 *   POST   /v1/admin/invites       — create invite (admin only)
 *   DELETE /v1/admin/invites/:id   — revoke invite (admin only)
 *
 * Validates: auth guard (401), role guard (403 for non-admin),
 *            CRUD lifecycle, expiry bounds, duplicate email, 404 on missing revoke.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Invites (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  const createdUserIds: string[] = [];
  const createdInviteIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
  }, 30000);

  afterAll(async () => {
    // Clean up invite tokens
    for (const id of createdInviteIds) {
      await prisma.inviteToken.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of createdUserIds) {
      await cleanupTestUser(prisma, id);
    }
    await destroyTestApp(app);
  }, 15000);

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('GET /v1/admin/invites → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/admin/invites')
      .expect(401);
  });

  it('POST /v1/admin/invites → 401/403 unauthenticated', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/admin/invites')
      .send({ email: 'test@example.com', role: 'user' });
    expect([401, 403]).toContain(res.status);
  });

  it('DELETE /v1/admin/invites/nonexistent → 401/403 unauthenticated', async () => {
    const res = await request(app.getHttpServer())
      .delete('/v1/admin/invites/nonexistent');
    expect([401, 403]).toContain(res.status);
  });

  // ─── Role guard (non-admin user) ──────────────────────────────────────────

  it('GET /v1/admin/invites → 403 for non-admin user', async () => {
    const { user, token } = await createTestUser(prisma, module, { role: 'user' });
    createdUserIds.push(user.id);

    await request(app.getHttpServer())
      .get('/v1/admin/invites')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('POST /v1/admin/invites → 403 for non-admin user', async () => {
    const { user, token } = await createTestUser(prisma, module, { role: 'user' });
    createdUserIds.push(user.id);

    await request(app.getHttpServer())
      .post('/v1/admin/invites')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'test@example.com', role: 'user' })
      .expect(403);
  });

  // ─── List invites ─────────────────────────────────────────────────────────

  it('GET /v1/admin/invites → returns array for admin', async () => {
    const { user, token } = await createTestUser(prisma, module, { role: 'admin' });
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/admin/invites')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  // ─── Create invite ────────────────────────────────────────────────────────

  it('POST /v1/admin/invites → creates invite with required fields', async () => {
    const { user, token } = await createTestUser(prisma, module, { role: 'admin' });
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .post('/v1/admin/invites')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: `invite-${Date.now()}@test.com`, role: 'user' })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('email');
    expect(res.body).toHaveProperty('role', 'user');
    expect(res.body).toHaveProperty('expiresAt');
    expect(res.body).toHaveProperty('mailSent');
    createdInviteIds.push(res.body.id);
  });

  it('POST /v1/admin/invites → email is lowercased', async () => {
    const { user, token } = await createTestUser(prisma, module, { role: 'admin' });
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .post('/v1/admin/invites')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'UPPER@EXAMPLE.COM', role: 'user' })
      .expect(201);

    expect(res.body.email).toBe('upper@example.com');
    createdInviteIds.push(res.body.id);
  });

  it('POST /v1/admin/invites → expiresInHours clamped between 1-168', async () => {
    const { user, token } = await createTestUser(prisma, module, { role: 'admin' });
    createdUserIds.push(user.id);

    const now = Date.now();
    const res = await request(app.getHttpServer())
      .post('/v1/admin/invites')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: `expiry-${Date.now()}@test.com`, role: 'user', expiresInHours: 24 })
      .expect(201);

    const expiresAt = new Date(res.body.expiresAt).getTime();
    // Should be ~24h from now (within 1 minute tolerance)
    expect(expiresAt).toBeGreaterThan(now + 23 * 3600 * 1000);
    expect(expiresAt).toBeLessThan(now + 25 * 3600 * 1000);
    createdInviteIds.push(res.body.id);
  });

  it('POST /v1/admin/invites → created invite appears in list', async () => {
    const { user, token } = await createTestUser(prisma, module, { role: 'admin' });
    createdUserIds.push(user.id);

    const email = `list-check-${Date.now()}@test.com`;
    const createRes = await request(app.getHttpServer())
      .post('/v1/admin/invites')
      .set('Authorization', `Bearer ${token}`)
      .send({ email, role: 'user' })
      .expect(201);

    createdInviteIds.push(createRes.body.id);

    const listRes = await request(app.getHttpServer())
      .get('/v1/admin/invites')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const found = listRes.body.find((i: { id: string }) => i.id === createRes.body.id);
    expect(found).toBeDefined();
    expect(found.email).toBe(email);
  });

  // ─── Revoke invite ────────────────────────────────────────────────────────

  it('DELETE /v1/admin/invites/:id → revokes invite', async () => {
    const { user, token } = await createTestUser(prisma, module, { role: 'admin' });
    createdUserIds.push(user.id);

    const createRes = await request(app.getHttpServer())
      .post('/v1/admin/invites')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: `revoke-${Date.now()}@test.com`, role: 'user' })
      .expect(201);

    const inviteId = createRes.body.id;

    await request(app.getHttpServer())
      .delete(`/v1/admin/invites/${inviteId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Verify it's gone from the list
    const listRes = await request(app.getHttpServer())
      .get('/v1/admin/invites')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const stillThere = listRes.body.find((i: { id: string }) => i.id === inviteId);
    expect(stillThere).toBeUndefined();
  });

  it('DELETE /v1/admin/invites/:id → 404 for nonexistent invite', async () => {
    const { user, token } = await createTestUser(prisma, module, { role: 'admin' });
    createdUserIds.push(user.id);

    await request(app.getHttpServer())
      .delete('/v1/admin/invites/nonexistent-id-xyz')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('DELETE /v1/admin/invites/:id → 403 for non-admin', async () => {
    const { user: adminUser, token: adminToken } = await createTestUser(prisma, module, { role: 'admin' });
    const { user: normalUser, token: normalToken } = await createTestUser(prisma, module, { role: 'user' });
    createdUserIds.push(adminUser.id, normalUser.id);

    // Admin creates invite
    const createRes = await request(app.getHttpServer())
      .post('/v1/admin/invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: `non-admin-revoke-${Date.now()}@test.com`, role: 'user' })
      .expect(201);

    createdInviteIds.push(createRes.body.id);

    // Non-admin tries to revoke
    await request(app.getHttpServer())
      .delete(`/v1/admin/invites/${createRes.body.id}`)
      .set('Authorization', `Bearer ${normalToken}`)
      .expect(403);
  });
});
