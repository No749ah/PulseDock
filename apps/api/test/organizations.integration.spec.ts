/**
 * Integration tests: Organizations lifecycle against a real PostgreSQL database.
 *
 * Covers: create, list, get, update, delete, switch, slug-check,
 * invite existing user, list members, update member role, remove member,
 * auth guard (401), and ownership isolation (403).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Organizations lifecycle (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  // Owner user
  let ownerToken: string;
  let ownerId: string;

  // Second user (to be invited)
  let memberToken: string;
  let memberId: string;

  // Created org
  let orgId: string;
  const slug = `test-org-${Date.now()}`;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const owner = await createTestUser(prisma, module);
    ownerToken = owner.token;
    ownerId = owner.user.id;

    const member = await createTestUser(prisma, module);
    memberToken = member.token;
    memberId = member.user.id;
  }, 30000);

  afterAll(async () => {
    // Clean up org if it still exists
    if (orgId) {
      await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
    }
    await cleanupTestUser(prisma, ownerId);
    await cleanupTestUser(prisma, memberId);
    await destroyTestApp(app);
  }, 15000);

  const ownerAuth = () => ({ Authorization: `Bearer ${ownerToken}` });
  const memberAuth = () => ({ Authorization: `Bearer ${memberToken}` });

  // ─── Auth guard ───

  it('should reject unauthenticated requests (401)', async () => {
    await request(app.getHttpServer()).get('/v1/organizations').expect(401);
  });

  // ─── Slug check ───

  it('should report slug as available before creation', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/organizations/slug-check?slug=${slug}`)
      .set(ownerAuth())
      .expect(200);

    expect(res.body.available).toBe(true);
  });

  // ─── Create ───

  it('should create an organization and set creator as OWNER', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set(ownerAuth())
      .send({ name: 'Test Org', slug })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Test Org');
    expect(res.body.slug).toBe(slug);
    orgId = res.body.id;
  });

  it('should reject duplicate slug (409)', async () => {
    await request(app.getHttpServer())
      .post('/v1/organizations')
      .set(ownerAuth())
      .send({ name: 'Dupe Org', slug })
      .expect(409);
  });

  it('should report slug as unavailable after creation', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/organizations/slug-check?slug=${slug}`)
      .set(ownerAuth())
      .expect(200);

    expect(res.body.available).toBe(false);
  });

  // ─── List ───

  it('should list organizations the user belongs to', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/organizations')
      .set(ownerAuth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((o: { id: string }) => o.id === orgId);
    expect(found).toBeDefined();
    expect(found.name).toBe('Test Org');
  });

  it('should not list the org for a user who is not a member', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/organizations')
      .set(memberAuth())
      .expect(200);

    const found = res.body.find((o: { id: string }) => o.id === orgId);
    expect(found).toBeUndefined();
  });

  // ─── Get single ───

  it('should get the organization with members list', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/organizations/${orgId}`)
      .set(ownerAuth())
      .expect(200);

    expect(res.body.id).toBe(orgId);
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(res.body.members.length).toBeGreaterThanOrEqual(1);
  });

  it('should return 404 when non-member tries to get org', async () => {
    await request(app.getHttpServer())
      .get(`/v1/organizations/${orgId}`)
      .set(memberAuth())
      .expect(404);
  });

  // ─── Update ───

  it('should update the organization name', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/organizations/${orgId}`)
      .set(ownerAuth())
      .send({ name: 'Updated Org Name' })
      .expect(200);

    expect(res.body.name).toBe('Updated Org Name');
  });

  // ─── Members ───

  it('should list members (OWNER can see all)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/organizations/${orgId}/members`)
      .set(ownerAuth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const ownerMember = res.body.find((m: { user: { id: string }; role: string }) => m.user.id === ownerId);
    expect(ownerMember).toBeDefined();
    expect(ownerMember.role).toBe('OWNER');
  });

  it('should invite an existing user directly (adds as member)', async () => {
    // Get member's email
    const memberUser = await prisma.user.findUnique({ where: { id: memberId } });
    expect(memberUser).toBeDefined();

    const res = await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/members/invite`)
      .set(ownerAuth())
      .send({ email: memberUser!.email, role: 'MEMBER' })
      .expect(201);

    // token is empty string when user already exists (direct add)
    expect(res.body).toHaveProperty('token');
  });

  it('should reject double-invite for same user (400)', async () => {
    const memberUser = await prisma.user.findUnique({ where: { id: memberId } });
    await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/members/invite`)
      .set(ownerAuth())
      .send({ email: memberUser!.email, role: 'MEMBER' })
      .expect(400);
  });

  it('should show invited user in members list', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/organizations/${orgId}/members`)
      .set(ownerAuth())
      .expect(200);

    const invitedMember = res.body.find((m: { user: { id: string } }) => m.user.id === memberId);
    expect(invitedMember).toBeDefined();
    expect(invitedMember.role).toBe('MEMBER');
  });

  it('should reject member role update by non-owner (403)', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/organizations/${orgId}/members/${memberId}`)
      .set(memberAuth())
      .send({ role: 'ADMIN' })
      .expect(403);
  });

  it('should update member role to ADMIN (OWNER only)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/organizations/${orgId}/members/${memberId}`)
      .set(ownerAuth())
      .send({ role: 'ADMIN' })
      .expect(200);

    expect(res.body.role).toBe('ADMIN');
  });

  it('should prevent changing OWNER role (403)', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/organizations/${orgId}/members/${ownerId}`)
      .set(ownerAuth())
      .send({ role: 'ADMIN' })
      .expect(403);
  });

  it('should remove member from organization', async () => {
    await request(app.getHttpServer())
      .delete(`/v1/organizations/${orgId}/members/${memberId}`)
      .set(ownerAuth())
      .expect(204);

    const res = await request(app.getHttpServer())
      .get(`/v1/organizations/${orgId}/members`)
      .set(ownerAuth())
      .expect(200);

    const removed = res.body.find((m: { user: { id: string } }) => m.user.id === memberId);
    expect(removed).toBeUndefined();
  });

  // ─── Switch ───

  it('should switch active organization', async () => {
    await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/switch`)
      .set(ownerAuth())
      .expect(204);
  });

  it('should reject switch for non-member (404)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/switch`)
      .set(memberAuth())
      .expect(404);
  });

  // ─── Delete ───

  it('should reject delete by non-owner (403)', async () => {
    // Re-add member so we can test this
    const memberUser = await prisma.user.findUnique({ where: { id: memberId } });
    await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/members/invite`)
      .set(ownerAuth())
      .send({ email: memberUser!.email, role: 'MEMBER' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/organizations/${orgId}`)
      .set(memberAuth())
      .expect(403);

    // Clean up membership
    await prisma.orgMember.deleteMany({
      where: { userId: memberId, organizationId: orgId },
    });
  });

  it('should delete the organization (OWNER only)', async () => {
    await request(app.getHttpServer())
      .delete(`/v1/organizations/${orgId}`)
      .set(ownerAuth())
      .expect(204);

    // Verify gone
    await request(app.getHttpServer())
      .get(`/v1/organizations/${orgId}`)
      .set(ownerAuth())
      .expect(404);

    orgId = ''; // Mark as deleted so afterAll doesn't try again
  });
});
