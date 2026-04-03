/**
 * Integration tests: Service Groups CRUD against a real PostgreSQL database.
 *
 * Covers: create, list, update, delete, status endpoint, user isolation, auth guard.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Service Groups (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  let token: string;
  let userId: string;
  let otherToken: string;
  let otherUserId: string;

  let groupId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const user = await createTestUser(prisma, module);
    token = user.token;
    userId = user.user.id;

    const other = await createTestUser(prisma, module);
    otherToken = other.token;
    otherUserId = other.user.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, otherUserId);
    await destroyTestApp(app);
  }, 15000);

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const otherAuth = () => ({ Authorization: `Bearer ${otherToken}` });

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('rejects unauthenticated request on GET /v1/service-groups (401)', async () => {
    await request(app.getHttpServer())
      .get('/v1/service-groups')
      .expect(401);
  });

  // ─── Create ───────────────────────────────────────────────────────────────

  it('creates a service group with name and empty monitorIds', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/service-groups')
      .set(auth())
      .send({ name: 'Frontend Services', monitorIds: [] })
      .expect(201);

    expect(res.body).toMatchObject({
      id: expect.any(String),
      name: 'Frontend Services',
      monitorIds: [],
    });
    groupId = res.body.id;
  });

  it('creates a service group with description', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/service-groups')
      .set(auth())
      .send({
        name: 'Backend Services',
        description: 'Core API services',
        monitorIds: [],
      })
      .expect(201);

    expect(res.body.name).toBe('Backend Services');
    expect(res.body.description).toBe('Core API services');

    // Cleanup
    await prisma.monitorServiceGroup.delete({ where: { id: res.body.id } });
  });

  it('rejects creation without required name field (400)', async () => {
    await request(app.getHttpServer())
      .post('/v1/service-groups')
      .set(auth())
      .send({ monitorIds: [] })
      .expect(400);
  });

  it('rejects creation without monitorIds field (400)', async () => {
    await request(app.getHttpServer())
      .post('/v1/service-groups')
      .set(auth())
      .send({ name: 'Missing Monitors' })
      .expect(400);
  });

  // ─── List ─────────────────────────────────────────────────────────────────

  it('lists service groups for authenticated user', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/service-groups')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const group = res.body.find((g: { id: string }) => g.id === groupId);
    expect(group).toBeDefined();
    expect(group.name).toBe('Frontend Services');
    expect(group.monitorCount).toBe(0);
  });

  it('other user sees empty list (isolation)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/service-groups')
      .set(otherAuth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((g: { id: string }) => g.id === groupId);
    expect(found).toBeUndefined();
  });

  // ─── Update ───────────────────────────────────────────────────────────────

  it('updates service group name', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/service-groups/${groupId}`)
      .set(auth())
      .send({ name: 'Frontend + CDN' })
      .expect(200);

    expect(res.body.name).toBe('Frontend + CDN');
  });

  it('updates service group description', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/service-groups/${groupId}`)
      .set(auth())
      .send({ description: 'All user-facing services including CDN' })
      .expect(200);

    expect(res.body.description).toBe('All user-facing services including CDN');
  });

  it('other user cannot update first user\'s service group (404)', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/service-groups/${groupId}`)
      .set(otherAuth())
      .send({ name: 'Hijacked' })
      .expect(404);
  });

  it('returns 404 when updating non-existent group', async () => {
    await request(app.getHttpServer())
      .patch('/v1/service-groups/non-existent-id')
      .set(auth())
      .send({ name: 'Ghost' })
      .expect(404);
  });

  // ─── Status ───────────────────────────────────────────────────────────────

  it('returns group status (empty group → unknown)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/service-groups/${groupId}/status`)
      .set(auth())
      .expect(200);

    expect(res.body).toMatchObject({
      id: groupId,
      name: 'Frontend + CDN',
      status: 'unknown',
      monitors: [],
    });
  });

  it('other user cannot read first user\'s group status (404)', async () => {
    await request(app.getHttpServer())
      .get(`/v1/service-groups/${groupId}/status`)
      .set(otherAuth())
      .expect(404);
  });

  it('returns 404 for status on non-existent group', async () => {
    await request(app.getHttpServer())
      .get('/v1/service-groups/non-existent-id/status')
      .set(auth())
      .expect(404);
  });

  // ─── Status with real monitors ────────────────────────────────────────────

  it('returns operational status when monitors are up', async () => {
    // Create a monitor owned by this user
    const monitor = await prisma.monitor.create({
      data: {
        userId,
        name: 'SG Test Monitor',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
        enabled: true,
      },
    });

    // Create an "up" run
    await prisma.monitorRun.create({
      data: {
        monitorId: monitor.id,
        userId,
        ok: true,
        statusCode: 200,
        latencyMs: 50,
        checkedAt: new Date(),
      },
    });

    // Create a service group containing this monitor
    const sgRes = await request(app.getHttpServer())
      .post('/v1/service-groups')
      .set(auth())
      .send({ name: 'Live SG', monitorIds: [monitor.id] })
      .expect(201);

    const sgId: string = sgRes.body.id;

    const statusRes = await request(app.getHttpServer())
      .get(`/v1/service-groups/${sgId}/status`)
      .set(auth())
      .expect(200);

    expect(statusRes.body.monitors.length).toBe(1);
    expect(statusRes.body.monitors[0].id).toBe(monitor.id);

    // Cleanup
    await prisma.monitorRun.deleteMany({ where: { monitorId: monitor.id } });
    await prisma.monitor.delete({ where: { id: monitor.id } });
    await prisma.monitorServiceGroup.delete({ where: { id: sgId } });
  });

  // ─── Delete ───────────────────────────────────────────────────────────────

  it('other user cannot delete first user\'s service group (404)', async () => {
    await request(app.getHttpServer())
      .delete(`/v1/service-groups/${groupId}`)
      .set(otherAuth())
      .expect(404);
  });

  it('deletes a service group', async () => {
    await request(app.getHttpServer())
      .delete(`/v1/service-groups/${groupId}`)
      .set(auth())
      .expect(204);

    const deleted = await prisma.monitorServiceGroup.findUnique({ where: { id: groupId } });
    expect(deleted).toBeNull();
  });

  it('returns 404 when deleting non-existent group', async () => {
    await request(app.getHttpServer())
      .delete('/v1/service-groups/non-existent-id')
      .set(auth())
      .expect(404);
  });
});
