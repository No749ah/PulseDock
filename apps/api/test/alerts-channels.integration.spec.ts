/**
 * Integration tests: Alert Channel CRUD operations against a real PostgreSQL database.
 *
 * Tests the full HTTP lifecycle: create → read → update → delete alert channels,
 * plus ownership isolation between users.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Alert Channels CRUD (integration)', () => {
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

  it('should create a webhook alert channel', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/alert-channels')
      .set(authHeader())
      .send({
        name: 'Test Webhook',
        type: 'webhook',
        config: { url: 'https://example.com/webhook' },
      })
      .expect(201);

    expect(res.body).toMatchObject({
      name: 'Test Webhook',
      type: 'webhook',
      config: { url: 'https://example.com/webhook' },
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.userId).toBe(userId);
    expect(res.body.createdAt).toBeDefined();
  });

  it('should create a discord alert channel', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/alert-channels')
      .set(authHeader())
      .send({
        name: 'Test Discord',
        type: 'discord',
        config: { webhookUrl: 'https://discord.com/api/webhooks/123/abc' },
      })
      .expect(201);

    expect(res.body.type).toBe('discord');
    expect(res.body.name).toBe('Test Discord');
  });

  it('should reject invalid channel type', async () => {
    await request(app.getHttpServer())
      .post('/v1/alert-channels')
      .set(authHeader())
      .send({
        name: 'Bad Channel',
        type: 'invalid_type',
        config: {},
      })
      .expect(400);
  });

  it('should reject missing required fields', async () => {
    await request(app.getHttpServer())
      .post('/v1/alert-channels')
      .set(authHeader())
      .send({ name: 'No Type' })
      .expect(400);
  });

  // ─── Read ───

  it('should list alert channels for the user', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/alert-channels')
      .set(authHeader())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('name');
    expect(res.body[0]).toHaveProperty('type');
    expect(res.body[0]).toHaveProperty('config');
  });

  // ─── Update ───

  it('should update alert channel name and config', async () => {
    // Create one first
    const created = await request(app.getHttpServer())
      .post('/v1/alert-channels')
      .set(authHeader())
      .send({
        name: 'Before Update',
        type: 'webhook',
        config: { url: 'https://example.com/old' },
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/v1/alert-channels/${created.body.id}`)
      .set(authHeader())
      .send({
        name: 'After Update',
        config: { url: 'https://example.com/new' },
      })
      .expect(200);

    expect(res.body.name).toBe('After Update');
    expect(res.body.config).toEqual({ url: 'https://example.com/new' });
  });

  it('should return 404 when updating non-existent channel', async () => {
    await request(app.getHttpServer())
      .patch('/v1/alert-channels/nonexistent-id-12345')
      .set(authHeader())
      .send({ name: 'Updated' })
      .expect(404);
  });

  // ─── Delete ───

  it('should delete an alert channel', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/alert-channels')
      .set(authHeader())
      .send({
        name: 'To Delete',
        type: 'webhook',
        config: { url: 'https://example.com/delete-me' },
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .delete(`/v1/alert-channels/${created.body.id}`)
      .set(authHeader())
      .expect(200);

    expect(res.body).toEqual({ ok: true });

    // Verify it's gone from the list
    const list = await request(app.getHttpServer())
      .get('/v1/alert-channels')
      .set(authHeader())
      .expect(200);

    const found = list.body.find((ch: { id: string }) => ch.id === created.body.id);
    expect(found).toBeUndefined();
  });

  it('should return 404 when deleting non-existent channel', async () => {
    await request(app.getHttpServer())
      .delete('/v1/alert-channels/nonexistent-id-12345')
      .set(authHeader())
      .expect(404);
  });

  // ─── Grouping options ───

  it('should create channel with alert grouping options', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/alert-channels')
      .set(authHeader())
      .send({
        name: 'Grouped Webhook',
        type: 'webhook',
        config: { url: 'https://example.com/grouped' },
        alertGrouping: true,
        groupWindowSec: 600,
        groupByFolder: true,
        groupByTag: true,
      })
      .expect(201);

    expect(res.body.alertGrouping).toBe(true);
    expect(res.body.groupWindowSec).toBe(600);
    expect(res.body.groupByFolder).toBe(true);
    expect(res.body.groupByTag).toBe(true);
  });

  // ─── Ownership isolation ───

  it('should not allow user2 to see user1 channels', async () => {
    // Create channel as user 1
    const created = await request(app.getHttpServer())
      .post('/v1/alert-channels')
      .set(authHeader())
      .send({
        name: 'User1 Private Channel',
        type: 'webhook',
        config: { url: 'https://example.com/private' },
      })
      .expect(201);

    // Create a second user
    const user2 = await createTestUser(prisma, module, { email: `alert-user2-${Date.now()}@integration.test` });

    // User2 should not see user1's channels
    const list = await request(app.getHttpServer())
      .get('/v1/alert-channels')
      .set({ Authorization: `Bearer ${user2.token}` })
      .expect(200);

    const found = list.body.find((ch: { id: string }) => ch.id === created.body.id);
    expect(found).toBeUndefined();

    // User2 should not be able to update user1's channel
    await request(app.getHttpServer())
      .patch(`/v1/alert-channels/${created.body.id}`)
      .set({ Authorization: `Bearer ${user2.token}` })
      .send({ name: 'Hacked' })
      .expect(404);

    // User2 should not be able to delete user1's channel
    await request(app.getHttpServer())
      .delete(`/v1/alert-channels/${created.body.id}`)
      .set({ Authorization: `Bearer ${user2.token}` })
      .expect(404);

    await cleanupTestUser(prisma, user2.user.id);
  });

  // ─── Auth ───

  it('should reject unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .get('/v1/alert-channels')
      .expect(401);
  });
});
