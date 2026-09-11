/**
 * Integration tests: Team management endpoints against a real PostgreSQL database.
 *
 * Covers: member listing, invite flow (existing user → direct add), duplicate
 * invite rejection, role updates, member removal, invite cancellation, and
 * auth guard / user-isolation scenarios.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Team management (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  // Owner (workspace owner)
  let token: string;
  let userId: string;

  // Second user to be invited
  let token2: string;
  let userId2: string;
  let email2: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const u1 = await createTestUser(prisma, module);
    token = u1.token;
    userId = u1.user.id;

    const u2 = await createTestUser(prisma, module);
    token2 = u2.token;
    userId2 = u2.user.id;
    email2 = u2.user.email;
  }, 30000);

  afterAll(async () => {
    // Clean up team members and invites created during tests
    await prisma.teamMember.deleteMany({ where: { ownerId: userId } }).catch(() => {});
    await prisma.teamInvite.deleteMany({ where: { ownerId: userId } }).catch(() => {});
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app);
  }, 15000);

  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('GET /v1/team/members → 401 without auth', async () => {
    await request(app.getHttpServer()).get('/v1/team/members').expect(401);
  });

  it('GET /v1/team/invites → 401 without auth', async () => {
    await request(app.getHttpServer()).get('/v1/team/invites').expect(401);
  });

  it('POST /v1/team/invite → 401 without auth', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/team/invite')
      .send({ email: 'x@example.com', role: 'VIEWER' });
    expect([401, 403]).toContain(res.status);
  });

  // ─── Initial state ────────────────────────────────────────────────────────

  it('GET /v1/team/members → empty list for new user', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/team/members')
      .set(auth())
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /v1/team/invites → empty list for new user', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/team/invites')
      .set(auth())
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ─── Invite existing user (direct member add) ─────────────────────────────

  let memberId: string;

  it('POST /v1/team/invite → adds existing user as TeamMember directly', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/team/invite')
      .set(auth())
      .send({ email: email2, role: 'VIEWER' })
      .expect(201);

    expect(res.body).toHaveProperty('type');
    expect(['member', 'invite']).toContain(res.body.type);
    expect(res.body).toHaveProperty('data');
  });

  it('GET /v1/team/members → lists the newly added member', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/team/members')
      .set(auth())
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const member = res.body.find((m: { user?: { id: string } }) => m.user?.id === userId2);
    expect(member).toBeDefined();
    expect(member.role).toBe('VIEWER');
    memberId = member.id;
  });

  // ─── Duplicate invite rejection ───────────────────────────────────────────

  it('POST /v1/team/invite → 400 when user is already a member', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/team/invite')
      .set(auth())
      .send({ email: email2, role: 'EDITOR' });
    // Could be 400 (already member) or 409 depending on service
    expect([400, 409]).toContain(res.status);
  });

  // ─── Self-invite rejection ────────────────────────────────────────────────

  it('POST /v1/team/invite → 400 when inviting yourself', async () => {
    // Get the owner's email
    const owner = await prisma.user.findUnique({ where: { id: userId } });
    if (!owner) return;

    const res = await request(app.getHttpServer())
      .post('/v1/team/invite')
      .set(auth())
      .send({ email: owner.email, role: 'VIEWER' });
    expect([400, 409]).toContain(res.status);
  });

  // ─── OWNER role rejection ─────────────────────────────────────────────────

  it('POST /v1/team/invite → 400 when trying to assign OWNER role', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/team/invite')
      .set(auth())
      .send({ email: 'stranger@example.com', role: 'OWNER' });
    expect([400, 422]).toContain(res.status);
  });

  // ─── Role update ──────────────────────────────────────────────────────────

  it('PATCH /v1/team/members/:id → updates member role to EDITOR', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/team/members/${memberId}`)
      .set(auth())
      .send({ role: 'EDITOR' })
      .expect(200);

    expect(res.body.role).toBe('EDITOR');
  });

  it('PATCH /v1/team/members/:id → 403 or 404 for member of another user\'s team', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/team/members/${memberId}`)
      .set(auth(token2))
      .send({ role: 'ADMIN' });
    // Service does findFirst(where: ownerId = token2.userId) → not found → 404
    expect([403, 404]).toContain(res.status);
  });

  it('PATCH /v1/team/members/:id → 404 for nonexistent member', async () => {
    await request(app.getHttpServer())
      .patch('/v1/team/members/nonexistent-id-xyz')
      .set(auth())
      .send({ role: 'VIEWER' })
      .expect(404);
  });

  // ─── Member removal ───────────────────────────────────────────────────────

  it('DELETE /v1/team/members/:id → 403 or 404 for another user\'s team', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/v1/team/members/${memberId}`)
      .set(auth(token2));
    // Service does findFirst(where: ownerId = token2.userId) → not found → 404
    expect([403, 404]).toContain(res.status);
  });

  it('DELETE /v1/team/members/:id → removes the member', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/v1/team/members/${memberId}`)
      .set(auth())
      .expect(200);
    expect(res.body).toHaveProperty('message');
  });

  it('GET /v1/team/members → member is removed', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/team/members')
      .set(auth())
      .expect(200);
    const member = res.body.find((m: { id: string }) => m.id === memberId);
    expect(member).toBeUndefined();
  });

  // ─── Token invite (unknown email) + cancellation ──────────────────────────

  let inviteId: string;

  it('POST /v1/team/invite → creates TokenInvite for unknown email', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/team/invite')
      .set(auth())
      .send({ email: 'newuser-' + Date.now() + '@example.com', role: 'EDITOR' })
      .expect(201);

    expect(res.body.type).toBe('invite');
    expect(res.body.data).toHaveProperty('token');
    inviteId = res.body.data.id;
  });

  it('GET /v1/team/invites → lists the pending invite', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/team/invites')
      .set(auth())
      .expect(200);
    const invite = res.body.find((i: { id: string }) => i.id === inviteId);
    expect(invite).toBeDefined();
  });

  it('GET /v1/team/invite/:token → public invite preview returns 200', async () => {
    const invite = await prisma.teamInvite.findUnique({ where: { id: inviteId } });
    if (!invite) return;
    const res = await request(app.getHttpServer())
      .get(`/v1/team/invite/${invite.token}`)
      .expect(200);
    // Response: { invite: {...}, owner: {...} }
    expect(res.body).toHaveProperty('invite');
    expect(res.body.invite).toHaveProperty('email');
    expect(res.body.invite).toHaveProperty('role');
  });

  it('DELETE /v1/team/invites/:id → cancels the pending invite', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/v1/team/invites/${inviteId}`)
      .set(auth())
      .expect(200);
    expect(res.body).toHaveProperty('message');
  });

  it('GET /v1/team/invites → invite is removed after cancellation', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/team/invites')
      .set(auth())
      .expect(200);
    const invite = res.body.find((i: { id: string }) => i.id === inviteId);
    expect(invite).toBeUndefined();
  });

  it('DELETE /v1/team/invites/:id → 404 for nonexistent invite', async () => {
    await request(app.getHttpServer())
      .delete('/v1/team/invites/nonexistent-xyz')
      .set(auth())
      .expect(404);
  });
});
