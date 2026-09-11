/**
 * Integration tests: monitor comparison endpoints
 * (/v1/monitors/compare, /latency-distribution, /period-comparison, /status-transitions)
 * against real PostgreSQL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Monitor Comparison (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  let tokenA: string;
  let userIdA: string;
  let tokenB: string;
  let userIdB: string;

  let monitorHttpA1: string;
  let monitorHttpA2: string;
  let monitorPingA3: string;
  let monitorNoRunsA4: string;
  let monitorB1: string;

  const authA = () => ({ Authorization: `Bearer ${tokenA}` });
  const authB = () => ({ Authorization: `Bearer ${tokenB}` });

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const userA = await createTestUser(prisma, module);
    tokenA = userA.token;
    userIdA = userA.user.id;

    const userB = await createTestUser(prisma, module);
    tokenB = userB.token;
    userIdB = userB.user.id;

    // User A monitors
    const m1 = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authA())
      .send({
        name: 'Compare A1 HTTP',
        type: 'HTTP',
        target: 'https://a1.example.com',
        intervalSec: 60,
        timeoutMs: 5000,
      })
      .expect(201);
    monitorHttpA1 = m1.body.id;

    const m2 = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authA())
      .send({
        name: 'Compare A2 HTTP',
        type: 'HTTP',
        target: 'https://a2.example.com',
        intervalSec: 60,
        timeoutMs: 5000,
      })
      .expect(201);
    monitorHttpA2 = m2.body.id;

    const m3 = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authA())
      .send({
        name: 'Compare A3 Ping',
        type: 'PING',
        target: '1.1.1.1',
        intervalSec: 60,
        timeoutMs: 5000,
      })
      .expect(201);
    monitorPingA3 = m3.body.id;

    const m4 = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authA())
      .send({
        name: 'Compare A4 Empty',
        type: 'HTTP',
        target: 'https://empty.example.com',
        intervalSec: 60,
        timeoutMs: 5000,
      })
      .expect(201);
    monitorNoRunsA4 = m4.body.id;

    // User B monitor
    const mB = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authB())
      .send({
        name: 'Compare B1 HTTP',
        type: 'HTTP',
        target: 'https://b1.example.com',
        intervalSec: 60,
        timeoutMs: 5000,
      })
      .expect(201);
    monitorB1 = mB.body.id;

    const now = Date.now();
    // Seed monitor runs for A monitors with mixed levels/latencies and one transition cycle
    await prisma.monitorRun.createMany({
      data: [
        {
          monitorId: monitorHttpA1,
          userId: userIdA,
          ok: true,
          latencyMs: 110,
          status: 200,
          message: 'OK',
          level: 'green',
          checkedAt: new Date(now - 6 * 60 * 60 * 1000),
          redirectChain: [],
        },
        {
          monitorId: monitorHttpA1,
          userId: userIdA,
          ok: false,
          latencyMs: 2100,
          status: 503,
          message: 'Service Unavailable',
          level: 'red',
          checkedAt: new Date(now - 5 * 60 * 60 * 1000),
          redirectChain: [],
        },
        {
          monitorId: monitorHttpA1,
          userId: userIdA,
          ok: true,
          latencyMs: 180,
          status: 200,
          message: 'Recovered',
          level: 'green',
          checkedAt: new Date(now - 4 * 60 * 60 * 1000),
          redirectChain: [],
        },
        {
          monitorId: monitorHttpA2,
          userId: userIdA,
          ok: true,
          latencyMs: 90,
          status: 200,
          message: 'OK',
          level: 'green',
          checkedAt: new Date(now - 3 * 60 * 60 * 1000),
          redirectChain: [],
        },
        {
          monitorId: monitorHttpA2,
          userId: userIdA,
          ok: true,
          latencyMs: 95,
          status: 200,
          message: 'OK',
          level: 'green',
          checkedAt: new Date(now - 2 * 60 * 60 * 1000),
          redirectChain: [],
        },
        {
          monitorId: monitorPingA3,
          userId: userIdA,
          ok: true,
          latencyMs: 40,
          status: 0,
          message: 'Ping OK',
          level: 'green',
          checkedAt: new Date(now - 90 * 60 * 1000),
          redirectChain: [],
        },
      ],
    });
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userIdA);
    await cleanupTestUser(prisma, userIdB);
    await destroyTestApp(app);
  }, 15000);

  it('should require auth for compare endpoint', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/compare?ids=${monitorHttpA1},${monitorHttpA2}`);
    expect([401, 403]).toContain(res.status);
  });

  it('should reject compare with fewer than 2 monitor ids', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/compare?ids=${monitorHttpA1}`)
      .set(authA())
      .expect(400);
  });

  it('should reject compare with more than 4 monitor ids', async () => {
    const ids = [monitorHttpA1, monitorHttpA2, monitorPingA3, monitorNoRunsA4, monitorB1].join(',');
    await request(app.getHttpServer())
      .get(`/v1/monitors/compare?ids=${ids}`)
      .set(authA())
      .expect(400);
  });

  it('should reject compare when one monitor is not owned by requester', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/compare?ids=${monitorHttpA1},${monitorB1}`)
      .set(authA())
      .expect(400);
  });

  it('should return comparison for valid monitor ids and clamp days to 90', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/compare?ids=${monitorHttpA1},${monitorHttpA2},${monitorPingA3}&days=999`)
      .set(authA())
      .expect(200);

    expect(Array.isArray(res.body.monitors)).toBe(true);
    expect(res.body.monitors).toHaveLength(3);
    expect(res.body.comparison).toBeDefined();
    expect(res.body.comparison.bestUptime).toBeDefined();
    expect(res.body.comparison.mostReliable).toBeDefined();
    expect(Array.isArray(res.body.comparison.correlations)).toBe(true);
    expect(res.body.period.days).toBe(90);
  });

  it('should return latency distribution and default invalid period to 7d', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorHttpA1}/latency-distribution?period=invalid`)
      .set(authA())
      .expect(200);

    expect(Array.isArray(res.body.buckets)).toBe(true);
    expect(res.body.buckets.length).toBeGreaterThan(0);
    expect(res.body.percentiles).toBeDefined();
    expect(Array.isArray(res.body.hourlyAvg)).toBe(true);
    expect(res.body.hourlyAvg).toHaveLength(24);
    expect(res.body.checkedRange).toBe('Last 7 days');
  });

  it('should enforce monitor ownership for latency distribution', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorB1}/latency-distribution`)
      .set(authA())
      .expect(404);
  });

  it('should return period comparison payload for monitor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorHttpA1}/period-comparison?period=24h`)
      .set(authA())
      .expect(200);

    expect(res.body.period).toBe('24h');
    expect(res.body.current).toBeDefined();
    expect(res.body.prior).toBeDefined();
    expect(res.body.delta).toBeDefined();
    expect(res.body.current).toHaveProperty('uptime');
    expect(res.body.current).toHaveProperty('avgMs');
  });

  it('should default invalid period to 7d for period comparison', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorHttpA1}/period-comparison?period=not-a-period`)
      .set(authA())
      .expect(200);

    expect(res.body.period).toBe('7d');
  });

  it('should enforce monitor ownership for period comparison', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorB1}/period-comparison`)
      .set(authA())
      .expect(404);
  });

  it('should return status transitions + summary for monitor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorHttpA1}/status-transitions?period=24h`)
      .set(authA())
      .expect(200);

    expect(Array.isArray(res.body.transitions)).toBe(true);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary).toHaveProperty('totalOutages');
    expect(res.body.totalRuns).toBeGreaterThan(0);
    expect(res.body.currentStatus).toBeDefined();
  });

  it('should return empty transitions for monitor with no runs', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorNoRunsA4}/status-transitions?period=24h`)
      .set(authA())
      .expect(200);

    expect(res.body.transitions).toEqual([]);
    expect(res.body.summary.totalOutages).toBe(0);
    expect(res.body.totalRuns).toBe(0);
  });

  it('should enforce monitor ownership for status transitions', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorB1}/status-transitions`)
      .set(authA())
      .expect(404);
  });
});
