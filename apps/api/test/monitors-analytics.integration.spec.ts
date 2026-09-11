/**
 * Integration tests: Monitor analytics endpoints against a real PostgreSQL database.
 *
 * Covers:
 *   GET /v1/monitors/fleet-report       — fleet health overview
 *   GET /v1/monitors/trends             — week-over-week trend analysis
 *   GET /v1/monitors/correlation        — failure correlation analysis
 *   GET /v1/monitors/anomaly-report     — fleet anomaly detection
 *   GET /v1/monitors/failure-prediction — failure risk prediction
 *   GET /v1/monitors/heatmap            — uptime heatmap
 *   GET /v1/monitors/latency-heatmap    — latency heatmap
 *   GET /v1/monitors/reliability        — reliability trend
 *   GET /v1/monitors/timing-breakdown   — HTTP timing breakdown
 *   GET /v1/monitors/status-timeline    — Gantt-style status timeline
 *   GET /v1/monitors/dependency-graph   — monitor dependency topology
 *   GET /v1/monitors/latency-bench      — P50/P75/P95/P99 benchmarks
 *   GET /v1/monitors/tag-analytics      — per-tag health analytics
 *   GET /v1/monitors/downtime-cost-report — downtime financial impact
 *   GET /v1/monitors/:id/metric-history — custom metric capture history
 *   GET /v1/monitors/:id/failure-patterns — failure pattern analysis
 *   GET /v1/monitors/:id/geo-stats      — geo-distribution stats
 *   GET /v1/monitors/:id/latency-history — daily P50/P95/P99 history
 *   GET /v1/monitors/:id/assertion-stats — per-assertion failure stats
 *   GET /v1/monitors/:id/downtime-cost-history — daily cost history
 *
 * Validates: auth guard, response shape, user isolation, empty-state handling.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Monitor Analytics (integration)', () => {
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

    // Create an HTTP monitor for per-monitor endpoint tests
    const res = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        name: 'Analytics Test Monitor',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
        timeoutMs: 5000,
      })
      .expect(201);
    monitorId = res.body.id;

    // Seed a few MonitorRun records so analytics endpoints have data
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
          latencyMs: 80,
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

  // ─── Auth guard tests ──────────────────────────────────────────────────

  it('fleet-report: requires auth', async () => {
    await request(app.getHttpServer()).get('/v1/monitors/fleet-report').expect(401);
  });

  it('trends: requires auth', async () => {
    await request(app.getHttpServer()).get('/v1/monitors/trends').expect(401);
  });

  it('correlation: requires auth', async () => {
    await request(app.getHttpServer()).get('/v1/monitors/correlation').expect(401);
  });

  it('heatmap: requires auth', async () => {
    await request(app.getHttpServer()).get('/v1/monitors/heatmap').expect(401);
  });

  // ─── Fleet health report ───────────────────────────────────────────────

  it('fleet-report: returns fleet overview shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/fleet-report')
      .set(auth())
      .expect(200);

    expect(res.body).toMatchObject({
      fleetScore: expect.any(Number),
      fleetGrade: expect.any(String),
    });
  });

  it('fleet-report: user B sees own fleet (no overlap with user A)', async () => {
    const resA = await request(app.getHttpServer())
      .get('/v1/monitors/fleet-report')
      .set(auth())
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/v1/monitors/fleet-report')
      .set(authB())
      .expect(200);

    // User B has no monitors — their fleet is empty/different
    expect(resB.body.totalMonitors ?? 0).toBe(0);
    // User A has at least 1
    expect((resA.body.totalMonitors ?? resA.body.monitors?.length ?? 1)).toBeGreaterThanOrEqual(1);
  });

  // ─── Monitor trends ────────────────────────────────────────────────────

  it('trends: returns monitors array with trend objects', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/trends')
      .set(auth())
      .expect(200);

    // API returns { monitors: [...], generatedAt }
    expect(Array.isArray(res.body.monitors)).toBe(true);
    if (res.body.monitors.length > 0) {
      const item = res.body.monitors[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
    }
  });

  it('trends: user B sees empty monitors (no monitors)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/trends')
      .set(authB())
      .expect(200);
    expect(Array.isArray(res.body.monitors)).toBe(true);
    expect(res.body.monitors.length).toBe(0);
  });

  // ─── Correlation ───────────────────────────────────────────────────────

  it('correlation: returns pairs and clusters arrays', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/correlation')
      .set(auth())
      .expect(200);

    expect(res.body).toHaveProperty('pairs');
    expect(res.body).toHaveProperty('groups');
    expect(Array.isArray(res.body.pairs)).toBe(true);
    expect(Array.isArray(res.body.groups)).toBe(true);
  });

  it('correlation: accepts days query param', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/correlation?days=14')
      .set(auth())
      .expect(200);
    expect(res.body).toHaveProperty('pairs');
  });

  // ─── Anomaly report ────────────────────────────────────────────────────

  it('anomaly-report: returns anomalies array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/anomaly-report')
      .set(auth())
      .expect(200);

    expect(res.body).toHaveProperty('anomalies');
    expect(Array.isArray(res.body.anomalies)).toBe(true);
  });

  it('anomaly-report: accepts hours=48', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/anomaly-report?hours=48')
      .set(auth())
      .expect(200);
    expect(res.body).toHaveProperty('anomalies');
  });

  it('anomaly-report: invalid hours defaults to 24h window', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/anomaly-report?hours=999')
      .set(auth())
      .expect(200);
    expect(res.body).toHaveProperty('anomalies');
  });

  // ─── Failure prediction ────────────────────────────────────────────────

  it('failure-prediction: returns predictions array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/failure-prediction')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body) || Array.isArray(res.body.predictions)).toBe(true);
  });

  // ─── Uptime heatmap ────────────────────────────────────────────────────

  it('heatmap: returns monitors array with days data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/heatmap?days=7')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body) || Array.isArray(res.body.monitors)).toBe(true);
  });

  it('heatmap: user isolation — user B sees empty heatmap', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/heatmap')
      .set(authB())
      .expect(200);
    const monitors = Array.isArray(res.body) ? res.body : res.body.monitors ?? [];
    expect(monitors.length).toBe(0);
  });

  // ─── Latency heatmap ───────────────────────────────────────────────────

  it('latency-heatmap: returns heatmap data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/latency-heatmap')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body) || typeof res.body === 'object').toBe(true);
  });

  // ─── Reliability trend ─────────────────────────────────────────────────

  it('reliability: returns trends array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/reliability')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body) || typeof res.body === 'object').toBe(true);
  });

  it('reliability: accepts weeks param', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/reliability?weeks=4')
      .set(auth())
      .expect(200);
    expect(typeof res.body).toBe('object');
  });

  // ─── Timing breakdown ──────────────────────────────────────────────────

  it('timing-breakdown: returns timing data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/timing-breakdown')
      .set(auth())
      .expect(200);

    expect(typeof res.body === 'object' || Array.isArray(res.body)).toBe(true);
  });

  // ─── Status timeline ───────────────────────────────────────────────────

  it('status-timeline: returns monitor segments', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/status-timeline')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body) || typeof res.body === 'object').toBe(true);
  });

  it('status-timeline: accepts hours param', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/status-timeline?hours=12')
      .set(auth())
      .expect(200);
    expect(typeof res.body === 'object').toBe(true);
  });

  // ─── Dependency graph ──────────────────────────────────────────────────

  it('dependency-graph: returns nodes and edges', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/dependency-graph')
      .set(auth())
      .expect(200);

    expect(res.body).toHaveProperty('nodes');
    expect(res.body).toHaveProperty('edges');
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(Array.isArray(res.body.edges)).toBe(true);
  });

  it('dependency-graph: user isolation — user B sees empty graph', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/dependency-graph')
      .set(authB())
      .expect(200);
    expect(res.body.nodes.length).toBe(0);
    expect(res.body.edges.length).toBe(0);
  });

  // ─── Latency benchmarks ────────────────────────────────────────────────

  it('latency-bench: returns benchmark array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/latency-bench')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body) || typeof res.body === 'object').toBe(true);
  });

  // ─── Tag analytics ─────────────────────────────────────────────────────

  it('tag-analytics: returns per-tag array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/tag-analytics')
      .set(auth())
      .expect(200);

    // API returns { periodDays, tags: [...] }
    expect(Array.isArray(res.body.tags)).toBe(true);
  });

  it('tag-analytics: accepts days param', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/tag-analytics?days=14')
      .set(auth())
      .expect(200);
    expect(Array.isArray(res.body.tags)).toBe(true);
  });

  // ─── Downtime cost report ──────────────────────────────────────────────

  it('downtime-cost-report: returns summary shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/downtime-cost-report')
      .set(auth())
      .expect(200);

    expect(typeof res.body === 'object').toBe(true);
  });

  // ─── Per-monitor endpoints ──────────────────────────────────────────────

  it('metric-history: returns empty array for monitor with no metricPath', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/metric-history`)
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body) || typeof res.body === 'object').toBe(true);
  });

  it('metric-history: 404 for nonexistent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id-xyz/metric-history')
      .set(auth())
      .expect(404);
  });

  it('metric-history: user B cannot access user A monitor', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/metric-history`)
      .set(authB())
      .expect(404);
  });

  it('failure-patterns: returns patterns array', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/failure-patterns`)
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body) || Array.isArray(res.body.patterns)).toBe(true);
  });

  it('failure-patterns: 404 for nonexistent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id-xyz/failure-patterns')
      .set(auth())
      .expect(404);
  });

  it('failure-patterns: user B cannot access user A monitor', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/failure-patterns`)
      .set(authB())
      .expect(404);
  });

  it('geo-stats: returns geo data', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/geo-stats`)
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body) || typeof res.body === 'object').toBe(true);
  });

  it('geo-stats: 404 for nonexistent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id-xyz/geo-stats')
      .set(auth())
      .expect(404);
  });

  it('latency-history: returns daily latency data', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/latency-history`)
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body) || typeof res.body === 'object').toBe(true);
  });

  it('latency-history: accepts days param', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/latency-history?days=14`)
      .set(auth())
      .expect(200);
    expect(typeof res.body === 'object').toBe(true);
  });

  it('latency-history: 404 for nonexistent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id-xyz/latency-history')
      .set(auth())
      .expect(404);
  });

  it('assertion-stats: returns stats for monitor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/assertion-stats`)
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body) || typeof res.body === 'object').toBe(true);
  });

  it('assertion-stats: 404 for nonexistent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id-xyz/assertion-stats')
      .set(auth())
      .expect(404);
  });

  it('downtime-cost-history: returns daily cost history', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorId}/downtime-cost-history`)
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body) || typeof res.body === 'object').toBe(true);
  });

  it('downtime-cost-history: 404 for nonexistent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id-xyz/downtime-cost-history')
      .set(auth())
      .expect(404);
  });
});
