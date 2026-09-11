/**
 * Integration tests: Grafana SimpleJSON datasource endpoints against a real PostgreSQL database.
 *
 * Covers:
 *   - GET /v1/grafana → health check (no auth)
 *   - POST /v1/grafana/search → metric target discovery
 *   - POST /v1/grafana/query → timeseries (latency, status, uptime, flap), table
 *   - POST /v1/grafana/annotations → incident annotations
 *   - POST /v1/grafana/tag-keys → returns static keys
 *   - POST /v1/grafana/tag-values → monitor names, type list, status list
 *   - Auth guard: 401 on unauthenticated requests
 *   - User isolation: each user only sees their own data
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Grafana SimpleJSON (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  let tokenA: string;
  let userAId: string;
  let tokenB: string;
  let userBId: string;

  // Monitor IDs created for userA
  let monitorAId: string;
  const monitorAName = 'grafana-test-http';

  const now = new Date();
  const rangeFrom = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(); // -3 days
  const rangeTo = new Date(now.getTime() + 60 * 1000).toISOString(); // +1 min

  const queryBody = (target: string, type?: string) => ({
    range: { from: rangeFrom, to: rangeTo },
    intervalMs: 60000,
    maxDataPoints: 100,
    targets: [{ target, type }],
  });

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const a = await createTestUser(prisma, module);
    tokenA = a.token;
    userAId = a.user.id;

    const b = await createTestUser(prisma, module);
    tokenB = b.token;
    userBId = b.user.id;

    // Create a monitor for user A
    const monitor = await prisma.monitor.create({
      data: {
        userId: userAId,
        name: monitorAName,
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
        enabled: true,
        isFlapping: false,
      },
    });
    monitorAId = monitor.id;

    // Seed some MonitorRun records
    const base = now.getTime() - 2 * 60 * 60 * 1000; // 2h ago
    const runs = Array.from({ length: 10 }, (_, i) => ({
      monitorId: monitorAId,
      userId: userAId,
      ok: i % 3 !== 2, // 2 failures out of 10
      level: i % 3 !== 2 ? 'up' : 'down',
      status: i % 3 !== 2 ? 200 : 0,
      message: i % 3 !== 2 ? 'OK' : 'Connection refused',
      latencyMs: 50 + i * 5,
      checkedAt: new Date(base + i * 600_000),
      geoRegion: 'us-east-1',
      redirectChain: [],
    }));
    await prisma.monitorRun.createMany({ data: runs });

    // Seed an incident for annotations
    await prisma.incident.create({
      data: {
        userId: userAId,
        title: 'Grafana test incident',
        severity: 'HIGH',
        status: 'INVESTIGATING',
        createdAt: new Date(base + 300_000),
      },
    });
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userAId);
    await cleanupTestUser(prisma, userBId);
    await destroyTestApp(app);
  }, 15000);

  // ── Health check ──────────────────────────────────────────────────────────

  it('GET /v1/grafana returns 200 without auth', async () => {
    const res = await request(app.getHttpServer()).get('/v1/grafana').expect(200);
    expect(res.text).toBe('OK');
  });

  // ── Auth guard ────────────────────────────────────────────────────────────

  it('POST /v1/grafana/search returns 403 without token', async () => {
    await request(app.getHttpServer()).post('/v1/grafana/search').send({ target: '' }).expect(403);
  });

  it('POST /v1/grafana/query returns 403 without token', async () => {
    await request(app.getHttpServer()).post('/v1/grafana/query').send(queryBody('nonexistent.latency')).expect(403);
  });

  it('POST /v1/grafana/annotations returns 403 without token', async () => {
    await request(app.getHttpServer())
      .post('/v1/grafana/annotations')
      .send({ annotation: { name: 'test', enable: true }, range: { from: rangeFrom, to: rangeTo } })
      .expect(403);
  });

  // ── Search ────────────────────────────────────────────────────────────────

  it('POST /v1/grafana/search returns metric targets for user monitors', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ target: '' })
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // Should have 4 metrics for our one monitor
    const expected = ['grafana-test-http.uptime', 'grafana-test-http.latency', 'grafana-test-http.status', 'grafana-test-http.flap'];
    for (const target of expected) {
      expect(res.body).toContain(target);
    }
  });

  it('POST /v1/grafana/search filters by query string', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/search')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ target: 'latency' })
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every((t: string) => t.includes('latency'))).toBe(true);
  });

  it('POST /v1/grafana/search returns empty for user with no monitors', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/search')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ target: '' })
      .expect(200);

    expect(res.body).toEqual([]);
  });

  // ── Query: latency timeseries ─────────────────────────────────────────────

  it('POST /v1/grafana/query returns latency timeseries', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/query')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(queryBody('grafana-test-http.latency'))
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    const ts = res.body[0];
    expect(ts.target).toBe('grafana-test-http.latency');
    expect(Array.isArray(ts.datapoints)).toBe(true);
    expect(ts.datapoints.length).toBeGreaterThan(0);
    // Each datapoint: [latencyMs, timestampMs]
    expect(ts.datapoints[0]).toHaveLength(2);
    expect(typeof ts.datapoints[0][0]).toBe('number');
    expect(typeof ts.datapoints[0][1]).toBe('number');
  });

  // ── Query: status timeseries ──────────────────────────────────────────────

  it('POST /v1/grafana/query returns status timeseries (1=up, 0=down)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/query')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(queryBody('grafana-test-http.status'))
      .expect(200);

    const ts = res.body[0];
    expect(ts.target).toBe('grafana-test-http.status');
    expect(ts.datapoints.every(([v]: [number]) => v === 0 || v === 1)).toBe(true);
  });

  // ── Query: uptime timeseries ──────────────────────────────────────────────

  it('POST /v1/grafana/query returns uptime timeseries (daily buckets)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/query')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(queryBody('grafana-test-http.uptime'))
      .expect(200);

    const ts = res.body[0];
    expect(ts.target).toBe('grafana-test-http.uptime');
    // Uptime values should be percentages 0–100
    for (const [val] of ts.datapoints) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    }
  });

  // ── Query: flap timeseries ────────────────────────────────────────────────

  it('POST /v1/grafana/query returns flap timeseries (1=flapping, 0=stable)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/query')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(queryBody('grafana-test-http.flap'))
      .expect(200);

    const ts = res.body[0];
    expect(ts.target).toBe('grafana-test-http.flap');
    expect(ts.datapoints.every(([v]: [number]) => v === 0 || v === 1)).toBe(true);
  });

  // ── Query: all_monitors table ─────────────────────────────────────────────

  it('POST /v1/grafana/query returns all_monitors table result', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/query')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        ...queryBody('all_monitors.table', 'table'),
        targets: [{ target: 'all_monitors.table', type: 'table' }],
      })
      .expect(200);

    expect(res.body).toHaveLength(1);
    const table = res.body[0];
    expect(table.type).toBe('table');
    expect(Array.isArray(table.columns)).toBe(true);
    expect(table.columns[0]).toHaveProperty('text', 'Monitor');
    expect(Array.isArray(table.rows)).toBe(true);
    expect(table.rows).toHaveLength(1); // only user A's monitor
    expect(table.rows[0][0]).toBe(monitorAName);
  });

  // ── Query: unknown monitor returns empty ──────────────────────────────────

  it('POST /v1/grafana/query returns empty array for unknown monitor', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/query')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(queryBody('nonexistent_monitor.latency'))
      .expect(200);

    expect(res.body).toEqual([]);
  });

  // ── Query: user isolation ─────────────────────────────────────────────────

  it("POST /v1/grafana/query user B cannot see user A's monitor", async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/query')
      .set('Authorization', `Bearer ${tokenB}`)
      .send(queryBody('grafana-test-http.latency'))
      .expect(200);

    expect(res.body).toEqual([]);
  });

  // ── Annotations ───────────────────────────────────────────────────────────

  it('POST /v1/grafana/annotations returns incident annotations', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/annotations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        annotation: { name: 'Incidents', enable: true, iconColor: 'red' },
        range: { from: rangeFrom, to: rangeTo },
      })
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    const annotation = res.body[0];
    expect(annotation).toHaveProperty('time');
    expect(annotation).toHaveProperty('title');
    expect(annotation.title).toContain('Incident');
    expect(annotation).toHaveProperty('tags');
    expect(Array.isArray(annotation.tags)).toBe(true);
    expect(annotation.tags).toContain('incident');
  });

  it('POST /v1/grafana/annotations returns empty for user B (no incidents)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/annotations')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        annotation: { name: 'Incidents', enable: true },
        range: { from: rangeFrom, to: rangeTo },
      })
      .expect(200);

    expect(res.body).toEqual([]);
  });

  // ── Tag keys ──────────────────────────────────────────────────────────────

  it('POST /v1/grafana/tag-keys returns static tag keys', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/tag-keys')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({})
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const keys = res.body.map((k: { text: string }) => k.text);
    expect(keys).toContain('monitor');
    expect(keys).toContain('type');
    expect(keys).toContain('status');
  });

  // ── Tag values ────────────────────────────────────────────────────────────

  it('POST /v1/grafana/tag-values?key=monitor returns monitor names', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/tag-values')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ key: 'monitor' })
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const names = res.body.map((v: { text: string }) => v.text);
    expect(names).toContain(monitorAName);
  });

  it('POST /v1/grafana/tag-values?key=type returns known monitor types', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/tag-values')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ key: 'type' })
      .expect(200);

    const types = res.body.map((v: { text: string }) => v.text);
    expect(types).toContain('HTTP');
    expect(types).toContain('TCP');
  });

  it('POST /v1/grafana/tag-values?key=status returns status list', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/tag-values')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ key: 'status' })
      .expect(200);

    const statuses = res.body.map((v: { text: string }) => v.text);
    expect(statuses).toContain('up');
    expect(statuses).toContain('down');
    expect(statuses).toContain('degraded');
  });

  it('POST /v1/grafana/tag-values with unknown key returns empty array', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/grafana/tag-values')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ key: 'unknown_key' })
      .expect(200);

    expect(res.body).toEqual([]);
  });
});
