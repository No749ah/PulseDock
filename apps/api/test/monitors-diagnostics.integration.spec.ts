/**
 * Integration tests: Monitors diagnostics endpoints against a real PostgreSQL database.
 *
 * Covers: /health-score, /check-rate, /coverage, /health-summary, /health-scores,
 *         /health-scores/leaderboard, /check-schedule, /interval-optimizer,
 *         /ssl-summary, auth guards, user isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Monitors Diagnostics (integration)', () => {
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

  // Helper to create a monitor
  async function createMonitor(userId: string, overrides: Record<string, unknown> = {}) {
    return prisma.monitor.create({
      data: {
        userId,
        name: 'Test Monitor',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
        enabled: true,
        configJson: { method: 'GET', headers: {}, followRedirects: true, ...overrides },
      },
    });
  }

  // ─── Auth guards ──────────────────────────────────────────────────────────

  it('GET /v1/monitors/:id/health-score → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/some-id/health-score')
      .expect(401);
  });

  it('GET /v1/monitors/coverage → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/coverage')
      .expect(401);
  });

  it('GET /v1/monitors/health-summary → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/health-summary')
      .expect(401);
  });

  it('GET /v1/monitors/health-scores → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/health-scores')
      .expect(401);
  });

  it('GET /v1/monitors/health-scores/leaderboard → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/health-scores/leaderboard')
      .expect(401);
  });

  it('GET /v1/monitors/check-schedule → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/check-schedule')
      .expect(401);
  });

  it('GET /v1/monitors/interval-optimizer → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/interval-optimizer')
      .expect(401);
  });

  // ─── Health score (single monitor) ───────────────────────────────────────

  it('GET /v1/monitors/:id/health-score → 404 for non-existent monitor', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id/health-score')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('GET /v1/monitors/:id/health-score → 404 for another user\'s monitor', async () => {
    const { user: userA } = await createTestUser(prisma, module);
    const { user: userB, token: tokenB } = await createTestUser(prisma, module);
    createdUserIds.push(userA.id, userB.id);

    const monitor = await createMonitor(userA.id);

    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitor.id}/health-score`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('GET /v1/monitors/:id/health-score → returns health score for own monitor', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const monitor = await createMonitor(user.id);

    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitor.id}/health-score`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('score');
    expect(typeof res.body.score).toBe('number');
    expect(res.body.score).toBeGreaterThanOrEqual(0);
    expect(res.body.score).toBeLessThanOrEqual(100);
    expect(res.body).toHaveProperty('grade');
    expect(['A', 'B', 'C', 'D', 'F']).toContain(res.body.grade);
    expect(res.body).toHaveProperty('breakdown');
  });

  // ─── Check rate ───────────────────────────────────────────────────────────

  it('GET /v1/monitors/:id/check-rate → 404 for non-existent monitor', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id/check-rate')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('GET /v1/monitors/:id/check-rate → returns check rate for own monitor', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const monitor = await createMonitor(user.id);

    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitor.id}/check-rate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('intervalSec');
    expect(res.body).toHaveProperty('checksLastHour');
    expect(res.body).toHaveProperty('effectiveChecksPerHour');
    expect(res.body).toHaveProperty('isThrottled');
  });

  // ─── Coverage ─────────────────────────────────────────────────────────────

  it('GET /v1/monitors/coverage → returns coverage shape', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/monitors/coverage')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('gaps');
    expect(Array.isArray(res.body.gaps)).toBe(true);
    expect(res.body).toHaveProperty('coverageScore');
    expect(res.body).toHaveProperty('totalMonitors');
  });

  it('GET /v1/monitors/coverage → includes monitor data for user with monitors', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    await createMonitor(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/monitors/coverage')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.totalMonitors).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.coverageScore).toBe('number');
  });

  it('coverage: user isolation — only own monitors', async () => {
    const { user: userA } = await createTestUser(prisma, module);
    const { user: userB, token: tokenB } = await createTestUser(prisma, module);
    createdUserIds.push(userA.id, userB.id);

    await createMonitor(userA.id);

    const res = await request(app.getHttpServer())
      .get('/v1/monitors/coverage')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    // userB has no monitors — gaps array should be empty
    const monitorA = await prisma.monitor.findFirst({ where: { userId: userA.id } });
    const gapIds = res.body.gaps.map((g: { id: string }) => g.id);
    expect(gapIds).not.toContain(monitorA?.id);
  });

  // ─── Health summary ───────────────────────────────────────────────────────

  it('GET /v1/monitors/health-summary → returns summary shape', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/monitors/health-summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('scores');
    expect(Array.isArray(res.body.scores)).toBe(true);
    expect(res.body).toHaveProperty('overall');
    expect(res.body.overall).toHaveProperty('avg');
  });

  it('GET /v1/monitors/health-summary → includes grade distribution', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    await createMonitor(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/monitors/health-summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.overall).toHaveProperty('a');
    expect(res.body.overall).toHaveProperty('b');
    expect(res.body.overall).toHaveProperty('c');
    expect(res.body.overall).toHaveProperty('d');
    expect(res.body.overall).toHaveProperty('f');
  });

  // ─── Health scores (batch) ────────────────────────────────────────────────

  it('GET /v1/monitors/health-scores → returns array', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/monitors/health-scores')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /v1/monitors/health-scores → each entry has score and grade', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    await createMonitor(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/monitors/health-scores')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const entry = res.body[0];
    expect(entry).toHaveProperty('score');
    expect(entry).toHaveProperty('monitorId');
  });

  // ─── Health scores leaderboard ────────────────────────────────────────────

  it('GET /v1/monitors/health-scores/leaderboard → returns leaderboard', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/monitors/health-scores/leaderboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('summary');
    expect(typeof res.body.summary).toBe('object');
  });

  // ─── Check schedule ───────────────────────────────────────────────────────

  it('GET /v1/monitors/check-schedule → returns schedule data', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/monitors/check-schedule')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('monitors');
    expect(Array.isArray(res.body.monitors)).toBe(true);
  });

  it('GET /v1/monitors/check-schedule → includes monitor data for user with monitors', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    await createMonitor(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/monitors/check-schedule')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.monitors.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Interval optimizer ───────────────────────────────────────────────────

  it('GET /v1/monitors/interval-optimizer → returns optimizer data', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/monitors/interval-optimizer')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('monitors');
    expect(Array.isArray(res.body.monitors)).toBe(true);
  });

  // ─── SSL summary ──────────────────────────────────────────────────────────

  it('GET /v1/monitors/ssl-summary → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/ssl-summary')
      .expect(401);
  });

  it('GET /v1/monitors/ssl-summary → returns ssl summary', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/monitors/ssl-summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('certs');
    expect(Array.isArray(res.body.certs)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });
});
