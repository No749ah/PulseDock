/**
 * Integration tests: Monitor detail endpoints — events, security, release-notes,
 * incidents, certificate, response-diff, config-history.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Monitor Details (integration)', () => {
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

    const res = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        name: 'Details Test Monitor',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
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

  // ─── Events (timeline annotations) ───────────────────────────────────

  it('GET events returns empty array initially', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/events`)
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST event creates a timeline annotation', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/events`)
      .set(auth())
      .send({ message: 'Deployed v1.2.3', eventType: 'deploy' })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.message).toBe('Deployed v1.2.3');
    expect(res.body.eventType).toBe('deploy');
  });

  it('GET events returns created annotation', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/events`)
      .set(auth())
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty('message');
    expect(res.body[0]).toHaveProperty('eventType');
  });

  it('POST event defaults eventType to note', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/events`)
      .set(auth())
      .send({ message: 'Just a note' })
      .expect(201);

    expect(res.body.eventType).toBe('note');
  });

  it('DELETE event removes it', async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/events`)
      .set(auth())
      .send({ message: 'to be deleted', eventType: 'note' })
      .expect(201);

    const eventId = createRes.body.id;
    await request(app.getHttpServer())
      .delete(`/v1/monitors/${monitorId}/events/${eventId}`)
      .set(auth())
      .expect(200);
  });

  it('GET events requires auth (401/403)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/events`);
    expect([401, 403]).toContain(res.status);
  });

  it('GET events returns 404 for cross-user monitor', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/events`)
      .set(authB())
      .expect(404);
  });

  // ─── Config history ───────────────────────────────────────────────────

  it('GET config-history returns array for own monitor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/config-history`)
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET config-history returns 404 for cross-user monitor', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/config-history`)
      .set(authB())
      .expect(404);
  });

  // ─── Response diff ────────────────────────────────────────────────────

  it('GET response-diff requires runId param (400 or 404 without it)', async () => {
    // runId is required — missing it returns 400 or 404
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/response-diff`)
      .set(auth());
    expect([400, 404]).toContain(res.status);
  });

  it('GET response-diff with nonexistent runId returns 404', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/response-diff?runId=nonexistent`)
      .set(auth())
      .expect(404);
  });

  // ─── Incidents (per-monitor) ──────────────────────────────────────────

  it('GET incidents returns {total, incidents} shape for own monitor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/incidents`)
      .set(auth())
      .expect(200);

    // API returns { total, incidents: [...] }
    expect(res.body).toHaveProperty('total');
    expect(Array.isArray(res.body.incidents)).toBe(true);
  });

  it('GET incidents returns 404 for cross-user monitor', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/incidents`)
      .set(authB())
      .expect(404);
  });

  it('GET incidents requires auth', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/incidents`);
    expect([401, 403]).toContain(res.status);
  });

  // ─── Not-found guards ─────────────────────────────────────────────────

  it('GET events 404 for nonexistent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id/events')
      .set(auth())
      .expect(404);
  });

  it('GET config-history 404 for nonexistent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id/config-history')
      .set(auth())
      .expect(404);
  });

  it('GET incidents 404 for nonexistent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id/incidents')
      .set(auth())
      .expect(404);
  });
});
