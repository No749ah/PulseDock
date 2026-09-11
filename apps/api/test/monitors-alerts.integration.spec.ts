/**
 * Integration tests: Monitor alert channel assignment endpoints.
 *
 * Covers:
 *   GET    /v1/monitors/:id/alerts              — list assigned channels
 *   POST   /v1/monitors/:id/alerts/:channelId   — assign channel
 *   PATCH  /v1/monitors/:id/alerts/:channelId   — update notifyOn / repeatIntervalMin
 *   DELETE /v1/monitors/:id/alerts/:channelId   — unassign channel
 *   POST   /v1/monitors/:id/simulate-alerts     — simulate alert rules
 *   GET    /v1/monitors/:id/deliveries          — delivery history
 *
 * Validates: auth guard (401), user isolation, assign/unassign lifecycle,
 *            notifyOn update, repeatIntervalMin, simulate-alerts basic shape,
 *            deliveries empty list, cross-user 404 isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Monitor Alerts (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  // User A
  let tokenA: string;
  let userIdA: string;
  let monitorIdA: string;
  let channelIdA: string;

  // User B (isolation)
  let tokenB: string;
  let userIdB: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const userA = await createTestUser(prisma, module);
    tokenA = userA.token;
    userIdA = userA.user.id;

    const userB = await createTestUser(prisma, module);
    tokenB = userB.token;
    userIdB = userB.user.id;

    // Create a monitor for user A
    const monRes = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Alerts Test Monitor', target: 'https://example.com', type: 'HTTP', intervalSec: 60 });
    monitorIdA = monRes.body.id;

    // Create an alert channel for user A
    const chRes = await request(app.getHttpServer())
      .post('/v1/alert-channels')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Test Webhook', type: 'webhook', config: { url: 'https://example.com/hook' } });
    channelIdA = chRes.body.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userIdA);
    await cleanupTestUser(prisma, userIdB);
    await destroyTestApp(app);
  }, 15000);

  // ─── Auth guards ─────────────────────────────────────────────────────

  it('GET /v1/monitors/:id/alerts → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorIdA}/alerts`)
      .expect(401);
  });

  it('POST /v1/monitors/:id/alerts/:channelId → 401/403 unauthenticated', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorIdA}/alerts/${channelIdA}`)
      .send({});
    expect([401, 403]).toContain(res.status);
  });

  it('GET /v1/monitors/:id/deliveries → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorIdA}/deliveries`)
      .expect(401);
  });

  // ─── Initial state: empty alert list ─────────────────────────────────

  it('GET /v1/monitors/:id/alerts → returns empty array initially', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorIdA}/alerts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  // ─── Assign channel ───────────────────────────────────────────────────

  it('POST /v1/monitors/:id/alerts/:channelId → assigns channel with default notifyOn', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorIdA}/alerts/${channelIdA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({})
      .expect(200);

    // returns the assignment or the monitor — either way it should not error
    expect(res.body).toBeDefined();
  });

  it('GET /v1/monitors/:id/alerts → channel now appears in list', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorIdA}/alerts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const found = res.body.find((c: { id: string }) => c.id === channelIdA);
    expect(found).toBeDefined();
  });

  // ─── Update assignment ────────────────────────────────────────────────

  it('PATCH /v1/monitors/:id/alerts/:channelId → updates notifyOn', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/monitors/${monitorIdA}/alerts/${channelIdA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ notifyOn: 'ALWAYS' })
      .expect(200);

    expect(res.body).toMatchObject({ ok: true });
  });

  it('PATCH /v1/monitors/:id/alerts/:channelId → updates repeatIntervalMin', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/monitors/${monitorIdA}/alerts/${channelIdA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ repeatIntervalMin: 30 })
      .expect(200);

    expect(res.body).toMatchObject({ ok: true });
  });

  it('PATCH /v1/monitors/:id/alerts/:channelId → clears escalationPolicyId with null', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/monitors/${monitorIdA}/alerts/${channelIdA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ escalationPolicyId: null })
      .expect(200);

    expect(res.body).toMatchObject({ ok: true });
  });

  // ─── Simulate alerts ──────────────────────────────────────────────────

  it('POST /v1/monitors/:id/simulate-alerts → returns simulation result shape', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorIdA}/simulate-alerts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ confirmations: 1 })
      .expect(200);

    // Response spreads simulateAlertRules result + currentConfig
    expect(typeof res.body.alertsFired).toBe('number');
    expect(Array.isArray(res.body.timeline)).toBe(true);
    expect(res.body.currentConfig).toBeDefined();
  });

  // ─── Delivery history ─────────────────────────────────────────────────

  it('GET /v1/monitors/:id/deliveries → returns empty delivery list shape', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorIdA}/deliveries`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(typeof res.body.total).toBe('number');
    expect(typeof res.body.successCount).toBe('number');
    expect(typeof res.body.failedCount).toBe('number');
    expect(Array.isArray(res.body.deliveries)).toBe(true);
  });

  // ─── User isolation ───────────────────────────────────────────────────

  it('GET /v1/monitors/:id/alerts → user B cannot access user A monitor (404)', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorIdA}/alerts`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('POST /v1/monitors/:id/alerts/:channelId → user B cannot assign to user A monitor (404)', async () => {
    // user B has no channel matching channelIdA — should get 404 on monitor lookup
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorIdA}/alerts/${channelIdA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({})
      .expect(404);
  });

  it('GET /v1/monitors/:id/deliveries → user B cannot access user A monitor deliveries (404)', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorIdA}/deliveries`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  // ─── Unassign channel ─────────────────────────────────────────────────

  it('DELETE /v1/monitors/:id/alerts/:channelId → unassigns channel', async () => {
    await request(app.getHttpServer())
      .delete(`/v1/monitors/${monitorIdA}/alerts/${channelIdA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
  });

  it('GET /v1/monitors/:id/alerts → channel gone after unassign', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorIdA}/alerts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const found = res.body.find((c: { id: string }) => c.id === channelIdA);
    expect(found).toBeUndefined();
  });

  // ─── 404 on unknown monitor ───────────────────────────────────────────

  it('GET /v1/monitors/nonexistent/alerts → 404', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id-xyz/alerts')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });
});
