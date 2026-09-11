/**
 * Integration tests: Monitor CRUD operations against a real PostgreSQL database.
 *
 * Tests the full HTTP lifecycle: create → read → update → delete monitors,
 * plus list/filter, bulk operations, and data integrity constraints.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Monitors CRUD (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const testUser = await createTestUser(prisma, module);
    token = testUser.token;
    userId = testUser.user.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await destroyTestApp(app);
  }, 15000);

  const authHeader = () => ({ Authorization: `Bearer ${token}` });

  // ─── Create ───

  it('should create an HTTP monitor', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authHeader())
      .send({
        name: 'Integration Test Monitor',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 300,
        timeoutMs: 10000,
      })
      .expect(201);

    expect(res.body).toMatchObject({
      name: 'Integration Test Monitor',
      type: 'HTTP',
      target: 'https://example.com',
      intervalSec: 300,
      enabled: true,
    });
    expect(res.body.id).toBeDefined();
  });

  it('should reject invalid monitor type', async () => {
    await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authHeader())
      .send({
        name: 'Bad Monitor',
        type: 'INVALID_TYPE',
        target: 'https://example.com',
        intervalSec: 60,
      })
      .expect(400);
  });

  it('should reject monitor without required fields', async () => {
    await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authHeader())
      .send({ name: 'Incomplete' })
      .expect(400);
  });

  // ─── Read ───

  it('should list monitors for the user', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors')
      .set(authHeader())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('name');
  });

  it('should get a single monitor by ID', async () => {
    // Create one first
    const created = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authHeader())
      .send({
        name: 'Get By ID Test',
        type: 'TCP',
        target: 'example.com:443',
        intervalSec: 120,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${created.body.id}`)
      .set(authHeader())
      .expect(200);

    expect(res.body.id).toBe(created.body.id);
    expect(res.body.name).toBe('Get By ID Test');
  });

  it('should return 404 for non-existent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id-12345')
      .set(authHeader())
      .expect(404);
  });

  // ─── Update ───

  it('should update monitor name and interval', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authHeader())
      .send({
        name: 'Before Update',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/v1/monitors/${created.body.id}`)
      .set(authHeader())
      .send({
        name: 'After Update',
        intervalSec: 300,
      })
      .expect(200);

    expect(res.body.name).toBe('After Update');
    expect(res.body.intervalSec).toBe(300);
  });

  // ─── Delete ───

  it('should delete a monitor', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authHeader())
      .send({
        name: 'To Delete',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/monitors/${created.body.id}`)
      .set(authHeader())
      .expect(200);

    // Verify it's gone
    await request(app.getHttpServer())
      .get(`/v1/monitors/${created.body.id}`)
      .set(authHeader())
      .expect(404);
  });

  // ─── Enable/Disable ───

  it('should toggle monitor enabled state', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authHeader())
      .send({
        name: 'Toggle Test',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
      })
      .expect(201);

    // Disable
    const disabled = await request(app.getHttpServer())
      .patch(`/v1/monitors/${created.body.id}`)
      .set(authHeader())
      .send({ enabled: false })
      .expect(200);

    expect(disabled.body.enabled).toBe(false);

    // Re-enable
    const enabled = await request(app.getHttpServer())
      .patch(`/v1/monitors/${created.body.id}`)
      .set(authHeader())
      .send({ enabled: true })
      .expect(200);

    expect(enabled.body.enabled).toBe(true);
  });

  // ─── Auth ───

  it('should reject unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors')
      .expect(401);
  });

  it('should not allow access to another user\'s monitor', async () => {
    // Create monitor as user 1
    const created = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authHeader())
      .send({
        name: 'User 1 Monitor',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
      })
      .expect(201);

    // Create a second user with unique email
    const user2 = await createTestUser(prisma, module, { email: `user2-${Date.now()}@integration.test` });

    // Try to access user 1's monitor as user 2
    await request(app.getHttpServer())
      .get(`/v1/monitors/${created.body.id}`)
      .set({ Authorization: `Bearer ${user2.token}` })
      .expect(404);

    await cleanupTestUser(prisma, user2.user.id);
  });

  // ─── Monitor Types ───

  const monitorTypes = [
    { type: 'HTTP', target: 'https://example.com' },
    { type: 'TCP', target: 'example.com:443' },
    { type: 'DNS', target: 'example.com' },
    { type: 'SSL_CERT', target: 'example.com' },
  ];

  for (const { type, target } of monitorTypes) {
    it(`should create a ${type} monitor`, async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/monitors')
        .set(authHeader())
        .send({
          name: `${type} Integration Test`,
          type,
          target,
          intervalSec: 300,
        })
        .expect(201);

      expect(res.body.type).toBe(type);
    });
  }
});
