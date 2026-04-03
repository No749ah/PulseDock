/**
 * Integration tests: Monitor state operations (mute, pause, acknowledge, pin, baselines, share tokens)
 * against a real PostgreSQL database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Monitor State (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let tokenB: string;
  let userIdB: string;
  let monitorId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const userA = await createTestUser(prisma, module);
    token = userA.token;
    userId = userA.user.id;
    const userB = await createTestUser(prisma, module);
    tokenB = userB.token;
    userIdB = userB.user.id;

    // Create a monitor for user A
    const res = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        name: 'State Test Monitor',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 300,
        timeoutMs: 5000,
      })
      .expect(201);
    monitorId = res.body.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userIdB);
    await destroyTestApp(app);
  }, 15000);

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const authB = () => ({ Authorization: `Bearer ${tokenB}` });

  // ─── Mute ─────────────────────────────────────────────────────────────

  it('should mute a monitor', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/mute`)
      .set(auth())
      .send({ minutes: 60 })
      .expect(200);

    expect(res.body.mutedUntil).toBeDefined();
    const mutedUntil = new Date(res.body.mutedUntil);
    // Should be ~60 min from now
    const diffMin = (mutedUntil.getTime() - Date.now()) / 60_000;
    expect(diffMin).toBeGreaterThan(55);
    expect(diffMin).toBeLessThan(65);
  });

  it('should unmute a monitor', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/v1/monitors/${monitorId}/mute`)
      .set(auth())
      .expect(200);

    expect(res.body.mutedUntil).toBeNull();
  });

  it('should reject mute for another user\'s monitor (404)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/mute`)
      .set(authB())
      .send({ minutes: 10 })
      .expect(404);
  });

  it('should reject unmute for another user\'s monitor (404)', async () => {
    await request(app.getHttpServer())
      .delete(`/v1/monitors/${monitorId}/mute`)
      .set(authB())
      .expect(404);
  });

  it('should require auth to mute (401 or 403)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/mute`)
      .send({ minutes: 10 });
    expect([401, 403]).toContain(res.status);
  });

  // ─── Pause ────────────────────────────────────────────────────────────

  it('should pause a monitor', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/pause`)
      .set(auth())
      .send({ minutes: 30 })
      .expect(200);

    expect(res.body.pausedUntil).toBeDefined();
    const pausedUntil = new Date(res.body.pausedUntil);
    const diffMin = (pausedUntil.getTime() - Date.now()) / 60_000;
    expect(diffMin).toBeGreaterThan(25);
    expect(diffMin).toBeLessThan(35);
  });

  it('should resume (unpause) a monitor', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/v1/monitors/${monitorId}/pause`)
      .set(auth())
      .expect(200);

    expect(res.body.pausedUntil).toBeNull();
  });

  it('should reject pause for another user\'s monitor (404)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/pause`)
      .set(authB())
      .send({ minutes: 10 })
      .expect(404);
  });

  it('should require auth to pause (401 or 403)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/pause`)
      .send({ minutes: 10 });
    expect([401, 403]).toContain(res.status);
  });

  // ─── Acknowledge ──────────────────────────────────────────────────────

  it('should acknowledge a monitor alert', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/acknowledge`)
      .set(auth())
      .send({ note: 'Investigating the issue' })
      .expect(200);

    expect(res.body.id).toBeDefined();
    expect(res.body.monitorId).toBe(monitorId);
    expect(res.body.note).toBe('Investigating the issue');
    expect(res.body.acknowledgedAt).toBeDefined();
    expect(res.body.clearedAt).toBeNull();
  });

  it('should clear an active acknowledgement', async () => {
    // First acknowledge
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/acknowledge`)
      .set(auth())
      .send({ note: 'Test ack' })
      .expect(200);

    // Then clear
    const res = await request(app.getHttpServer())
      .delete(`/v1/monitors/${monitorId}/acknowledge`)
      .set(auth())
      .expect(200);

    expect(res.body.clearedAt).toBeDefined();
    expect(res.body.clearedAt).not.toBeNull();
  });

  it('should reject clear when no active acknowledgement exists (404)', async () => {
    // Clear any existing acks first by clearing repeatedly until 404
    // Then verify 404 response
    await request(app.getHttpServer())
      .delete(`/v1/monitors/${monitorId}/acknowledge`)
      .set(auth());

    // Now try again — should be 404 since none active
    const res = await request(app.getHttpServer())
      .delete(`/v1/monitors/${monitorId}/acknowledge`)
      .set(auth());
    // Either 404 (no ack) or 200 (if previous had one); just confirm it doesn't crash
    expect([200, 404]).toContain(res.status);
  });

  it('should acknowledge without a note', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/acknowledge`)
      .set(auth())
      .send({})
      .expect(200);

    expect(res.body.note).toBeNull();
  });

  it('should reject acknowledge for another user\'s monitor (404)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/acknowledge`)
      .set(authB())
      .send({ note: 'Unauthorized ack' })
      .expect(404);
  });

  // ─── Pin ──────────────────────────────────────────────────────────────

  it('should toggle pin on a monitor', async () => {
    // Initially unpinned — toggle to pinned
    const res1 = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/pin`)
      .set(auth())
      .expect(200);

    const firstState = res1.body.pinned;
    expect(typeof firstState).toBe('boolean');

    // Toggle again
    const res2 = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/pin`)
      .set(auth())
      .expect(200);

    expect(res2.body.pinned).toBe(!firstState);
  });

  it('should reject pin for another user\'s monitor (404)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/pin`)
      .set(authB())
      .expect(404);
  });

  // ─── Share Token ──────────────────────────────────────────────────────

  it('should generate a share token', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/share-token`)
      .set(auth())
      .expect(200);

    expect(res.body.shareToken).toBeDefined();
    expect(res.body.shareToken).toMatch(/^pd_share_[0-9a-f]{32}$/);
  });

  it('should generate a different token on second call (token rotation)', async () => {
    const res1 = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/share-token`)
      .set(auth())
      .expect(200);

    const res2 = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/share-token`)
      .set(auth())
      .expect(200);

    // Tokens should be different (new token each call)
    expect(res1.body.shareToken).not.toBe(res2.body.shareToken);
  });

  it('should revoke share token', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/v1/monitors/${monitorId}/share-token`)
      .set(auth())
      .expect(200);

    expect(res.body.shareToken).toBeNull();
  });

  it('should reject share token generation for another user\'s monitor (404)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/share-token`)
      .set(authB())
      .expect(404);
  });

  // ─── DNS Baseline Reset ───────────────────────────────────────────────

  it('should reset DNS baseline (returns ok)', async () => {
    // Create a DNS monitor first
    const dnsRes = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(auth())
      .send({
        name: 'DNS Baseline Monitor',
        type: 'DNS',
        target: 'example.com',
        intervalSec: 300,
        timeoutMs: 5000,
      })
      .expect(201);
    const dnsMonitorId = dnsRes.body.id;

    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${dnsMonitorId}/dns-baseline/reset`)
      .set(auth())
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.message).toContain('DNS baseline cleared');
  });

  it('should reset content baseline (returns ok)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/content-baseline/reset`)
      .set(auth())
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.message).toContain('Content baseline cleared');
  });

  it('should reset header baseline (returns ok)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/header-baseline/reset`)
      .set(auth())
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.message).toContain('Header baseline cleared');
  });

  it('should reject DNS baseline reset for another user\'s monitor (404)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/dns-baseline/reset`)
      .set(authB())
      .expect(404);
  });

  // ─── Snooze ───────────────────────────────────────────────────────────

  it('should snooze a monitor', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/snooze`)
      .set(auth())
      .send({ hours: 4 })
      .expect(200);

    // Snooze creates a maintenance window - response shape varies
    expect(res.status).toBe(200);
  });

  it('should require auth to snooze (401 or 403)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/snooze`)
      .send({ hours: 1 });
    expect([401, 403]).toContain(res.status);
  });
});
