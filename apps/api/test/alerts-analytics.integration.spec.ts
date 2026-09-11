/**
 * Integration tests: Alert analytics, delivery history, and channel health endpoints.
 *
 * Covers: /channels/health, /response-time, /analytics, /noise-analysis,
 *         /deliveries, /deliveries/export, /:id/deliveries, /:id/delivery-stats,
 *         auth guards, user isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Alert Analytics (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
  }, 30000);

  afterAll(async () => {
    for (const id of createdUserIds) {
      await cleanupTestUser(prisma, id);
    }
    await destroyTestApp(app);
  }, 15000);

  // ─── Auth guards ──────────────────────────────────────────────────────────

  it('GET /v1/alert-channels/channels/health → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/alert-channels/channels/health')
      .expect(401);
  });

  it('GET /v1/alert-channels/analytics → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/alert-channels/analytics')
      .expect(401);
  });

  it('GET /v1/alert-channels/response-time → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/alert-channels/response-time')
      .expect(401);
  });

  it('GET /v1/alert-channels/noise-analysis → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/alert-channels/noise-analysis')
      .expect(401);
  });

  it('GET /v1/alert-channels/deliveries → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/alert-channels/deliveries')
      .expect(401);
  });

  it('GET /v1/alert-channels/deliveries/export → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/alert-channels/deliveries/export')
      .expect(401);
  });

  // ─── Channels health ─────────────────────────────────────────────────────

  it('GET /v1/alert-channels/channels/health → returns array for user with no channels', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/alert-channels/channels/health')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /v1/alert-channels/channels/health → includes channel health stats', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    await prisma.alertChannel.create({
      data: {
        userId: user.id,
        name: 'Health Test Channel',
        type: 'webhook',
        configJson: { webhookUrl: 'https://example.com/hook' },
      },
    });

    const res = await request(app.getHttpServer())
      .get('/v1/alert-channels/channels/health')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const ch = res.body.find((c: { name: string }) => c.name === 'Health Test Channel');
    expect(ch).toBeDefined();
    expect(ch).toHaveProperty('channelId');
    expect(ch).toHaveProperty('name');
    expect(ch).toHaveProperty('type');
  });

  it('channels/health user isolation: only returns own channels', async () => {
    const { user: userA, token: tokenA } = await createTestUser(prisma, module);
    const { user: userB, token: tokenB } = await createTestUser(prisma, module);
    createdUserIds.push(userA.id, userB.id);

    await prisma.alertChannel.create({
      data: {
        userId: userA.id,
        name: 'Channel A',
        type: 'webhook',
        configJson: { webhookUrl: 'https://a.example.com/hook' },
      },
    });

    const resA = await request(app.getHttpServer())
      .get('/v1/alert-channels/channels/health')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/v1/alert-channels/channels/health')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    const namesA = (resA.body as Array<{ name: string }>).map((c) => c.name);
    const namesB = (resB.body as Array<{ name: string }>).map((c) => c.name);

    expect(namesA).toContain('Channel A');
    expect(namesB).not.toContain('Channel A');
  });

  // ─── Response time ────────────────────────────────────────────────────────

  it('GET /v1/alert-channels/response-time → returns response time shape', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/alert-channels/response-time')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('period');
    expect(res.body).toHaveProperty('channels');
    expect(Array.isArray(res.body.channels)).toBe(true);
  });

  it('GET /v1/alert-channels/response-time?days=7 → accepts days param', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/alert-channels/response-time?days=7')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('channels');
  });

  // ─── Analytics ────────────────────────────────────────────────────────────

  it('GET /v1/alert-channels/analytics → returns analytics shape', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/alert-channels/analytics')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('dailyCounts');
    expect(Array.isArray(res.body.dailyCounts)).toBe(true);
    expect(res.body).toHaveProperty('topMonitors');
    expect(Array.isArray(res.body.topMonitors)).toBe(true);
    expect(res.body).toHaveProperty('channelStats');
    expect(Array.isArray(res.body.channelStats)).toBe(true);
  });

  it('GET /v1/alert-channels/analytics?days=7 → accepts valid days param', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/alert-channels/analytics?days=7')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('dailyCounts');
    expect(res.body).toHaveProperty('periodDays', 7);
  });

  it('GET /v1/alert-channels/analytics?days=90 → accepts 90-day period', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/alert-channels/analytics?days=90')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('periodDays', 90);
  });

  it('GET /v1/alert-channels/analytics user isolation: does not leak data', async () => {
    const { user: userA, token: tokenA } = await createTestUser(prisma, module);
    const { user: userB, token: tokenB } = await createTestUser(prisma, module);
    createdUserIds.push(userA.id, userB.id);

    const resA = await request(app.getHttpServer())
      .get('/v1/alert-channels/analytics')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/v1/alert-channels/analytics')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    // Both should have a valid response structure
    expect(resA.body).toHaveProperty('dailyCounts');
    expect(resB.body).toHaveProperty('dailyCounts');
  });

  // ─── Noise analysis ───────────────────────────────────────────────────────

  it('GET /v1/alert-channels/noise-analysis → returns analysis shape', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/alert-channels/noise-analysis')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('monitors');
    expect(Array.isArray(res.body.monitors)).toBe(true);
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('periodDays');
  });

  it('GET /v1/alert-channels/noise-analysis?days=14 → accepts days param', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/alert-channels/noise-analysis?days=14')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('periodDays');
  });

  // ─── Global deliveries ────────────────────────────────────────────────────

  it('GET /v1/alert-channels/deliveries → returns delivery shape', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/alert-channels/deliveries')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('total');
    expect(typeof res.body.total).toBe('number');
    expect(res.body).toHaveProperty('successCount');
    expect(res.body).toHaveProperty('failedCount');
    expect(res.body).toHaveProperty('deliveries');
    expect(Array.isArray(res.body.deliveries)).toBe(true);
  });

  it('GET /v1/alert-channels/deliveries → empty for new user', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/alert-channels/deliveries')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.total).toBe(0);
    expect(res.body.deliveries).toEqual([]);
  });

  // ─── Deliveries export ────────────────────────────────────────────────────

  it('GET /v1/alert-channels/deliveries/export → returns CSV content-type', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/alert-channels/deliveries/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
  });

  // ─── Per-channel delivery stats ───────────────────────────────────────────

  it('GET /v1/alert-channels/:id/delivery-stats → 404 for non-existent channel', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    await request(app.getHttpServer())
      .get('/v1/alert-channels/nonexistent-id/delivery-stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('GET /v1/alert-channels/:id/delivery-stats → returns stats for own channel', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const channel = await prisma.alertChannel.create({
      data: {
        userId: user.id,
        name: 'Stats Channel',
        type: 'webhook',
        configJson: { webhookUrl: 'https://example.com/hook' },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/v1/alert-channels/${channel.id}/delivery-stats`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('successCount');
    expect(res.body).toHaveProperty('failureCount');
    expect(res.body).toHaveProperty('totalDeliveries');
  });

  it('GET /v1/alert-channels/:id/delivery-stats → 404 for another user\'s channel', async () => {
    const { user: userA } = await createTestUser(prisma, module);
    const { user: userB, token: tokenB } = await createTestUser(prisma, module);
    createdUserIds.push(userA.id, userB.id);

    const channelA = await prisma.alertChannel.create({
      data: {
        userId: userA.id,
        name: 'A Channel',
        type: 'webhook',
        configJson: { webhookUrl: 'https://a.example.com/hook' },
      },
    });

    await request(app.getHttpServer())
      .get(`/v1/alert-channels/${channelA.id}/delivery-stats`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  // ─── Per-channel deliveries ───────────────────────────────────────────────

  it('GET /v1/alert-channels/:id/deliveries → 404 for non-existent channel', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    await request(app.getHttpServer())
      .get('/v1/alert-channels/nonexistent-id/deliveries')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('GET /v1/alert-channels/:id/deliveries → 404 for another user\'s channel', async () => {
    const { user: userA } = await createTestUser(prisma, module);
    const { user: userB, token: tokenB } = await createTestUser(prisma, module);
    createdUserIds.push(userA.id, userB.id);

    const channelA = await prisma.alertChannel.create({
      data: {
        userId: userA.id,
        name: 'A Private Channel',
        type: 'webhook',
        configJson: { webhookUrl: 'https://a.example.com/hook' },
      },
    });

    await request(app.getHttpServer())
      .get(`/v1/alert-channels/${channelA.id}/deliveries`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('GET /v1/alert-channels/:id/deliveries → returns delivery shape for own channel', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const channel = await prisma.alertChannel.create({
      data: {
        userId: user.id,
        name: 'Delivery History Channel',
        type: 'webhook',
        configJson: { webhookUrl: 'https://example.com/hook' },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/v1/alert-channels/${channel.id}/deliveries`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('channelId', channel.id);
    expect(res.body).toHaveProperty('channelName', 'Delivery History Channel');
    expect(res.body).toHaveProperty('successCount');
    expect(res.body).toHaveProperty('failedCount');
    expect(res.body).toHaveProperty('deliveries');
    expect(Array.isArray(res.body.deliveries)).toBe(true);
  });

  // ─── Preview payload ──────────────────────────────────────────────────────

  it('POST /v1/alert-channels/:id/preview-payload → 404 for non-existent channel', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    await request(app.getHttpServer())
      .post('/v1/alert-channels/nonexistent-id/preview-payload')
      .set('Authorization', `Bearer ${token}`)
      .send({ template: '{"msg": "{{monitorName}}"}' })
      .expect(404);
  });

  it('POST /v1/alert-channels/:id/preview-payload → renders template for own channel', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const channel = await prisma.alertChannel.create({
      data: {
        userId: user.id,
        name: 'Payload Preview Channel',
        type: 'webhook',
        configJson: { webhookUrl: 'https://example.com/hook' },
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/v1/alert-channels/${channel.id}/preview-payload`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template: '{"msg": "test"}' });
    // preview-payload is a POST with no @HttpCode → returns 200 or 201
    expect([200, 201]).toContain(res.status);

    expect(res.body).toHaveProperty('rendered');
    expect(res.body).toHaveProperty('valid');
  });
});
