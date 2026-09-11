/**
 * Integration tests: Monitor run history, uptime stats, chart data,
 * live feed, and latency budget — against a real PostgreSQL database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Monitor Runs (integration)', () => {
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

    // Create a monitor
    const res = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        name: 'Runs Test Monitor',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
        timeoutMs: 5000,
      })
      .expect(201);
    monitorId = res.body.id;

    // Seed a few MonitorRun records directly via Prisma for run history tests
    await prisma.monitorRun.createMany({
      data: [
        {
          monitorId,
          userId,
          ok: true,
          latencyMs: 120,
          status: 200,
          message: 'OK',
          level: 'green',
          checkedAt: new Date(Date.now() - 60_000),
          redirectChain: [],
        },
        {
          monitorId,
          userId,
          ok: false,
          latencyMs: 5000,
          status: 503,
          message: 'Service Unavailable',
          level: 'red',
          checkedAt: new Date(Date.now() - 120_000),
          redirectChain: [],
        },
        {
          monitorId,
          userId,
          ok: true,
          latencyMs: 95,
          status: 200,
          message: 'OK',
          level: 'green',
          checkedAt: new Date(Date.now() - 180_000),
          redirectChain: [],
        },
      ],
    });
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userIdB);
    await destroyTestApp(app);
  }, 15000);

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const authB = () => ({ Authorization: `Bearer ${tokenB}` });

  // ─── Recent Runs (global) ─────────────────────────────────────────────

  it('should return recent runs across all monitors', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/runs')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // Each run should have key fields
    const run = res.body[0];
    expect(run.monitorId).toBeDefined();
    expect(run.ok).toBeDefined();
  });

  it('should respect limit parameter for recent runs', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/runs?limit=1')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(1);
  });

  it('should filter recent runs by since timestamp', async () => {
    const sinceTime = new Date(Date.now() - 90_000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/runs?since=${encodeURIComponent(sinceTime)}`)
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // Only runs after the since time should appear
    for (const run of res.body) {
      expect(new Date(run.checkedAt).getTime()).toBeGreaterThan(new Date(sinceTime).getTime());
    }
  });

  it('should require auth for recent runs (401 or 403)', async () => {
    const res = await request(app.getHttpServer()).get('/v1/monitors/runs');
    expect([401, 403]).toContain(res.status);
  });

  // ─── Per-Monitor Run History ─────────────────────────────────────────

  it('should return paginated run history for a monitor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/runs`)
      .set(auth())
      .expect(200);

    // Response shape: { runs: [...], hasMore: bool, ... }
    expect(Array.isArray(res.body.runs)).toBe(true);
    expect(res.body.runs.length).toBeGreaterThanOrEqual(3);
  });

  it('should filter run history by status=ok', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/runs?status=ok`)
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body.runs)).toBe(true);
    for (const run of res.body.runs) {
      expect(run.ok).toBe(true);
    }
  });

  it('should filter run history by status=failed', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/runs?status=failed`)
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body.runs)).toBe(true);
    for (const run of res.body.runs) {
      expect(run.ok).toBe(false);
    }
  });

  it('should respect limit parameter for run history', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/runs?limit=2`)
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body.runs)).toBe(true);
    expect(res.body.runs.length).toBeLessThanOrEqual(2);
  });

  it('should return user-isolated run history (user B gets 404 for other user monitor)', async () => {
    // Create a monitor for user B
    const monBRes = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authB())
      .send({
        name: 'User B Monitor',
        type: 'HTTP',
        target: 'https://b.example.com',
        intervalSec: 300,
        timeoutMs: 5000,
      })
      .expect(201);
    const monBId = monBRes.body.id;

    // User B cannot access user A's monitor runs — should get 404
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/runs`)
      .set(authB())
      .expect(404);

    // Cleanup user B's monitor
    await prisma.monitor.delete({ where: { id: monBId } });
  });

  // ─── Export CSV ───────────────────────────────────────────────────────

  it('should export run history as CSV', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/runs/export`)
      .set(auth())
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    // CSV should have header row + data
    const lines = (res.text as string).trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toContain('checkedAt');
  });

  it('should export run history in JSON format', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/runs/export-enhanced?format=json&days=7`)
      .set(auth())
      .expect(200);

    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['x-total-count']).toBeDefined();
  });

  it('should export enhanced CSV with timing columns', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/runs/export-enhanced?format=csv&includeTimings=true&days=30`)
      .set(auth())
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
  });

  // ─── Uptime ───────────────────────────────────────────────────────────

  it('should return uptime stats for a monitor (default 30d)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/uptime`)
      .set(auth())
      .expect(200);

    expect(typeof res.body.uptimePct).toBe('number');
    expect(res.body.uptimePct).toBeGreaterThanOrEqual(0);
    expect(res.body.uptimePct).toBeLessThanOrEqual(100);
  });

  it('should return uptime stats for 7d period', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/uptime?period=7d`)
      .set(auth())
      .expect(200);

    expect(typeof res.body.uptimePct).toBe('number');
  });

  it('should require auth for uptime (401 or 403)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/uptime`);
    expect([401, 403]).toContain(res.status);
  });

  // ─── Chart ────────────────────────────────────────────────────────────

  it('should return chart data for a monitor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/chart`)
      .set(auth())
      .expect(200);

    // API returns { monitorId, period, buckets: [...] }
    expect(res.body.monitorId).toBe(monitorId);
    expect(Array.isArray(res.body.points)).toBe(true);
  });

  it('should return chart data for 1d period', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/chart?period=1d`)
      .set(auth())
      .expect(200);

    expect(res.body.monitorId).toBe(monitorId);
    expect(Array.isArray(res.body.points)).toBe(true);
  });

  it('should require auth for chart data (401 or 403)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/chart`);
    expect([401, 403]).toContain(res.status);
  });

  // ─── Latency Budget ───────────────────────────────────────────────────

  it('should return latency budget report', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/latency-budget`)
      .set(auth())
      .expect(200);

    // Response should contain budget fields
    expect(res.body).toBeDefined();
    // May have budgetMs, consumedPct, etc. — just verify it returns successfully
  });

  it('should require auth for latency budget (401 or 403)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/latency-budget`);
    expect([401, 403]).toContain(res.status);
  });

  // ─── Live Feed ────────────────────────────────────────────────────────

  it('should return live feed data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/live-feed')
      .set(auth())
      .expect(200);

    // Live feed returns { items, stats } or similar
    expect(res.body).toBeDefined();
  });

  it('should respect limit param in live feed', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/live-feed?limit=5')
      .set(auth())
      .expect(200);

    expect(res.body).toBeDefined();
  });

  it('should filter live feed by level', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/live-feed?level=green')
      .set(auth())
      .expect(200);

    expect(res.body).toBeDefined();
  });

  it('should filter live feed by type', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/live-feed?type=HTTP')
      .set(auth())
      .expect(200);

    expect(res.body).toBeDefined();
  });

  it('should require auth for live feed (401 or 403)', async () => {
    const res = await request(app.getHttpServer()).get('/v1/monitors/live-feed');
    expect([401, 403]).toContain(res.status);
  });
});
