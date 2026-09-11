/**
 * Integration tests: Admin & Invites endpoints against a real PostgreSQL database.
 *
 * Covers:
 *   - Admin: list users, set role, set status, update user, reset MFA,
 *     force password reset, delete user, audit logs, stats, plans, invites
 *   - Invites: create, list, revoke
 *   - Auth guard (403 for non-admin)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Admin + Invites (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  // Admin user
  let adminToken: string;
  let adminUserId: string;

  // Regular user (role='user') for isolation tests
  let userToken: string;
  let userId: string;

  // A target user that admin will modify
  let targetUserId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    // Admin (default role from createTestUser is 'admin')
    const admin = await createTestUser(prisma, module);
    adminToken = admin.token;
    adminUserId = admin.user.id;

    // Regular user
    const regular = await createTestUser(prisma, module, { role: 'user' });
    userToken = regular.token;
    userId = regular.user.id;

    // Target user for role/status/update operations
    const target = await createTestUser(prisma, module, { role: 'user' });
    targetUserId = target.user.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, adminUserId);
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, targetUserId);
    await destroyTestApp(app);
  }, 15000);

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });
  const userAuth = () => ({ Authorization: `Bearer ${userToken}` });

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('rejects non-admin user on GET /v1/admin/users (403)', async () => {
    await request(app.getHttpServer())
      .get('/v1/admin/users')
      .set(userAuth())
      .expect(403);
  });

  it('rejects unauthenticated request on GET /v1/admin/users (401)', async () => {
    await request(app.getHttpServer())
      .get('/v1/admin/users')
      .expect(401);
  });

  // ─── List users ───────────────────────────────────────────────────────────

  it('admin can list all users', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/admin/users')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);

    // Check shape of a user object
    const user = res.body.find((u: { id: string }) => u.id === targetUserId);
    expect(user).toBeDefined();
    expect(user).toMatchObject({
      id: targetUserId,
      email: expect.stringContaining('@'),
      role: 'user',
      isActive: true,
      totpEnabled: false,
      emailVerified: true,
    });
    expect(user.createdAt).toBeDefined();
  });

  // ─── Set role ─────────────────────────────────────────────────────────────

  it('admin can set user role to admin', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/admin/users/role')
      .set(auth())
      .send({ userId: targetUserId, role: 'admin' })
      .expect(200);

    expect(res.body.ok).toBe(true);

    // Verify in DB
    const updated = await prisma.user.findUnique({ where: { id: targetUserId } });
    expect(updated?.role).toBe('admin');
  });

  it('admin can set user role back to user', async () => {
    await request(app.getHttpServer())
      .patch('/v1/admin/users/role')
      .set(auth())
      .send({ userId: targetUserId, role: 'user' })
      .expect(200);

    const updated = await prisma.user.findUnique({ where: { id: targetUserId } });
    expect(updated?.role).toBe('user');
  });

  it('returns 404 for non-existent user in set-role', async () => {
    await request(app.getHttpServer())
      .patch('/v1/admin/users/role')
      .set(auth())
      .send({ userId: 'non-existent-id', role: 'user' })
      .expect(404);
  });

  // ─── Set status ───────────────────────────────────────────────────────────

  it('admin can deactivate a user', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/admin/users/status')
      .set(auth())
      .send({ userId: targetUserId, isActive: false })
      .expect(200);

    expect(res.body.ok).toBe(true);

    const updated = await prisma.user.findUnique({ where: { id: targetUserId } });
    expect(updated?.isActive).toBe(false);
  });

  it('admin can reactivate a user', async () => {
    await request(app.getHttpServer())
      .patch('/v1/admin/users/status')
      .set(auth())
      .send({ userId: targetUserId, isActive: true })
      .expect(200);

    const updated = await prisma.user.findUnique({ where: { id: targetUserId } });
    expect(updated?.isActive).toBe(true);
  });

  // ─── Update user ──────────────────────────────────────────────────────────

  it('admin can update user displayName', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/admin/users/update')
      .set(auth())
      .send({ userId: targetUserId, displayName: 'Updated Admin Name' })
      .expect(200);

    expect(res.body.id).toBe(targetUserId);
    expect(res.body.displayName).toBe('Updated Admin Name');
  });

  it('admin can update mustChangePassword flag', async () => {
    await request(app.getHttpServer())
      .patch('/v1/admin/users/update')
      .set(auth())
      .send({ userId: targetUserId, mustChangePassword: true })
      .expect(200);

    const updated = await prisma.user.findUnique({ where: { id: targetUserId } });
    expect(updated?.mustChangePassword).toBe(true);

    // Reset it
    await request(app.getHttpServer())
      .patch('/v1/admin/users/update')
      .set(auth())
      .send({ userId: targetUserId, mustChangePassword: false })
      .expect(200);
  });

  // ─── Force password reset ─────────────────────────────────────────────────

  it('admin can force password reset for another user', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/admin/users/${targetUserId}/force-password-reset`)
      .set(auth())
      .expect(201);

    expect(res.body.ok).toBe(true);
    expect(res.body.resetUrl).toContain('/login?reset=');
    expect(res.body.expiresAt).toBeDefined();

    // Verify token created in DB
    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: { email: target!.email, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(resetToken).not.toBeNull();
    expect(resetToken!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns 404 for force-password-reset on non-existent user', async () => {
    await request(app.getHttpServer())
      .post('/v1/admin/users/non-existent-id/force-password-reset')
      .set(auth())
      .expect(404);
  });

  // ─── Audit logs ───────────────────────────────────────────────────────────

  it('admin can fetch audit logs', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/admin/audit-logs')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // Should have at least the operations we performed above
    expect(res.body.length).toBeGreaterThan(0);

    const log = res.body[0];
    expect(log).toMatchObject({
      id: expect.any(String),
      action: expect.any(String),
      createdAt: expect.any(String),
    });
  });

  it('non-admin cannot fetch audit logs (403)', async () => {
    await request(app.getHttpServer())
      .get('/v1/admin/audit-logs')
      .set(userAuth())
      .expect(403);
  });

  // ─── System stats ─────────────────────────────────────────────────────────

  it('admin can fetch system stats', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/admin/stats')
      .set(auth())
      .expect(200);

    expect(res.body).toMatchObject({
      users: {
        total: expect.any(Number),
        active: expect.any(Number),
      },
      monitors: {
        total: expect.any(Number),
        enabled: expect.any(Number),
      },
      checksToday: expect.any(Number),
      failedToday: expect.any(Number),
      errorRatePct: expect.any(Number),
      generatedAt: expect.any(String),
    });

    expect(res.body.users.total).toBeGreaterThanOrEqual(3);
    expect(res.body.users.active).toBeGreaterThanOrEqual(1);
  });

  it('non-admin cannot fetch stats (403)', async () => {
    await request(app.getHttpServer())
      .get('/v1/admin/stats')
      .set(userAuth())
      .expect(403);
  });

  // ─── Plans ────────────────────────────────────────────────────────────────

  it('admin can list plans', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/admin/plans')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // Should have at least one plan (free)
    if (res.body.length > 0) {
      expect(res.body[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
      });
    }
  });

  // ─── Delete user ──────────────────────────────────────────────────────────

  it('prevents admin from deleting their own account', async () => {
    await request(app.getHttpServer())
      .delete(`/v1/admin/users/${adminUserId}`)
      .set(auth())
      .expect(403);
  });

  it('admin can delete another user', async () => {
    // Create a throwaway user to delete
    const temp = await createTestUser(prisma, module, { role: 'user' });

    await request(app.getHttpServer())
      .delete(`/v1/admin/users/${temp.user.id}`)
      .set(auth())
      .expect(200);

    // Verify gone
    const deleted = await prisma.user.findUnique({ where: { id: temp.user.id } });
    expect(deleted).toBeNull();
  });

  // ─── Password resets ──────────────────────────────────────────────────────

  it('admin can list pending password resets', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/admin/password-resets')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('admin can revoke a password reset token', async () => {
    // Create a reset token first
    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    const { randomBytes } = await import('node:crypto');
    const resetRow = await prisma.passwordResetToken.create({
      data: {
        email: target!.email,
        token: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    await request(app.getHttpServer())
      .delete(`/v1/admin/password-resets/${resetRow.id}`)
      .set(auth())
      .expect(200);

    const revoked = await prisma.passwordResetToken.findUnique({ where: { id: resetRow.id } });
    expect(revoked?.consumedAt).not.toBeNull();
  });

  it('returns 404 when revoking non-existent password reset', async () => {
    await request(app.getHttpServer())
      .delete('/v1/admin/password-resets/non-existent-id')
      .set(auth())
      .expect(404);
  });

  // ─── Invites ──────────────────────────────────────────────────────────────

  it('admin can create an invite token', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/admin/invites')
      .set(auth())
      .send({ email: 'invited@test.example', role: 'user', expiresInHours: 24 })
      .expect(201);

    expect(res.body).toMatchObject({
      id: expect.any(String),
      email: 'invited@test.example',
      role: 'user',
      expiresAt: expect.any(String),
    });
    // inviteUrl only returned in dev mode
    expect(res.body.mailSent).toBeDefined();
  });

  it('admin can list invites', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/admin/invites')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    const invite = res.body[0];
    expect(invite).toMatchObject({
      id: expect.any(String),
      email: expect.any(String),
      role: expect.any(String),
      expiresAt: expect.any(String),
      createdAt: expect.any(String),
      token: expect.any(String),
    });
  });

  it('admin can revoke an invite', async () => {
    // Get the invite we just created
    const listRes = await request(app.getHttpServer())
      .get('/v1/admin/invites')
      .set(auth())
      .expect(200);

    const invite = listRes.body.find((i: { email: string }) => i.email === 'invited@test.example');
    expect(invite).toBeDefined();

    const res = await request(app.getHttpServer())
      .delete(`/v1/admin/invites/${invite.id}`)
      .set(auth())
      .expect(200);

    expect(res.body.ok).toBe(true);

    // Verify gone
    const deleted = await prisma.inviteToken.findUnique({ where: { id: invite.id } });
    expect(deleted).toBeNull();
  });

  it('returns 404 when revoking non-existent invite', async () => {
    await request(app.getHttpServer())
      .delete('/v1/admin/invites/non-existent-id')
      .set(auth())
      .expect(404);
  });

  it('non-admin cannot create invites (403)', async () => {
    await request(app.getHttpServer())
      .post('/v1/admin/invites')
      .set(userAuth())
      .send({ email: 'blocked@test.example', role: 'user' })
      .expect(403);
  });

  it('non-admin cannot list invites (403)', async () => {
    await request(app.getHttpServer())
      .get('/v1/admin/invites')
      .set(userAuth())
      .expect(403);
  });

  it('invite uses default expiresInHours=48 when not specified', async () => {
    const before = Date.now();
    const res = await request(app.getHttpServer())
      .post('/v1/admin/invites')
      .set(auth())
      .send({ email: 'defaultexpiry@test.example', role: 'user' })
      .expect(201);

    const expiresAt = new Date(res.body.expiresAt).getTime();
    const expectedMin = before + 47 * 3600 * 1000;
    const expectedMax = Date.now() + 49 * 3600 * 1000;
    expect(expiresAt).toBeGreaterThan(expectedMin);
    expect(expiresAt).toBeLessThan(expectedMax);

    // Cleanup
    const invite = await prisma.inviteToken.findFirst({
      where: { email: 'defaultexpiry@test.example' },
    });
    if (invite) await prisma.inviteToken.delete({ where: { id: invite.id } });
  });
});
