/**
 * Integration tests: Dashboard endpoints against a real PostgreSQL database.
 *
 * Covers: overview, health-timeline, activity feed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Dashboard (integration)', () => {
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

  // ─── Auth Guard ───

  it('GET /v1/dashboard/overview requires auth', async () => {
    await request(app.getHttpServer())
      .get('/v1/dashboard/overview')
      .expect(401);
  });

  it('GET /v1/dashboard/health-timeline requires auth', async () => {
    await request(app.getHttpServer())
      .get('/v1/dashboard/health-timeline')
      .expect(401);
  });

  it('GET /v1/dashboard/activity requires auth', async () => {
    await request(app.getHttpServer())
      .get('/v1/dashboard/activity')
      .expect(401);
  });

  // ─── Overview ───

  it('returns empty overview for new user', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/dashboard/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.totalMonitors).toBe(0);
    expect(res.body.stats.uptimeMonitors).toBe(0);
    expect(res.body.stats.versionMonitors).toBe(0);
    expect(res.body.stats.uptimePct).toBe(100); // 0 monitors → 100%
    expect(res.body.activeIncidents).toEqual([]);
    expect(res.body.latestRuns).toEqual([]);
  });

  it('overview includes uptime monitor stats', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    // Create an HTTP monitor
    const monitor = await prisma.monitor.create({
      data: {
        userId: user.id,
        name: 'Test HTTP',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
        enabled: true,
      },
    });

    // Create a green run
    await prisma.monitorRun.create({
      data: {
        monitorId: monitor.id,
        userId: user.id,
        ok: true,
        status: 200,
        latencyMs: 50,
        level: 'green',
        checkedAt: new Date(),
        redirectChain: [],
        message: 'OK',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/v1/dashboard/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.stats.totalMonitors).toBe(1);
    expect(res.body.stats.uptimeMonitors).toBe(1);
    expect(res.body.stats.uptimeGreen).toBe(1);
    expect(res.body.stats.uptimeRed).toBe(0);
    expect(res.body.stats.uptimePct).toBe(100);
    expect(res.body.latestRuns.length).toBe(1);
    expect(res.body.latestRuns[0].ok).toBe(true);
  });

  it('overview separates version monitors from uptime monitors', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    // Create a version monitor (GIT_RELEASE)
    await prisma.monitor.create({
      data: {
        userId: user.id,
        name: 'Test Version',
        type: 'GIT_RELEASE',
        target: 'https://github.com/test/repo',
        intervalSec: 3600,
        enabled: true,
      },
    });

    // Create an HTTP monitor
    await prisma.monitor.create({
      data: {
        userId: user.id,
        name: 'Test HTTP 2',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
        enabled: true,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/v1/dashboard/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.stats.totalMonitors).toBe(2);
    expect(res.body.stats.uptimeMonitors).toBe(1);
    expect(res.body.stats.versionMonitors).toBe(1);
  });

  it('overview includes active incidents', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    await prisma.incident.create({
      data: {
        userId: user.id,
        title: 'Test outage',
        status: 'INVESTIGATING',
        severity: 'MAJOR',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/v1/dashboard/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.activeIncidents.length).toBe(1);
    expect(res.body.activeIncidents[0].title).toBe('Test outage');
    expect(res.body.activeIncidents[0].status).toBe('INVESTIGATING');
  });

  it('overview excludes resolved incidents', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    await prisma.incident.create({
      data: {
        userId: user.id,
        title: 'Resolved outage',
        status: 'RESOLVED',
        severity: 'MINOR',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/v1/dashboard/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.activeIncidents.length).toBe(0);
  });

  // ─── User Isolation ───

  it('overview data is isolated between users', async () => {
    const { user: userA, token: tokenA } = await createTestUser(prisma, module);
    const { user: userB, token: tokenB } = await createTestUser(prisma, module);
    createdUserIds.push(userA.id, userB.id);

    // Create a monitor for user A only
    await prisma.monitor.create({
      data: {
        userId: userA.id,
        name: 'User A Monitor',
        type: 'TCP',
        target: 'tcp://example.com:443',
        intervalSec: 60,
        enabled: true,
      },
    });

    const resA = await request(app.getHttpServer())
      .get('/v1/dashboard/overview')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/v1/dashboard/overview')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(resA.body.stats.totalMonitors).toBe(1);
    expect(resB.body.stats.totalMonitors).toBe(0);
  });

  // ─── Health Timeline ───

  it('returns health timeline with default 30 days', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/dashboard/health-timeline')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.timeline)).toBe(true);
    expect(res.body.timeline.length).toBe(30);
    // Each day entry should have date and healthScore (null when no monitors)
    for (const entry of res.body.timeline) {
      expect(entry.date).toBeDefined();
      expect(entry).toHaveProperty('healthScore');
    }
  });

  it('health timeline respects days param', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/dashboard/health-timeline?days=7')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.timeline.length).toBe(7);
  });

  it('health timeline shows score based on monitor runs', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const monitor = await prisma.monitor.create({
      data: {
        userId: user.id,
        name: 'Timeline Test',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
        enabled: true,
      },
    });

    // Create a green run for today
    await prisma.monitorRun.create({
      data: {
        monitorId: monitor.id,
        userId: user.id,
        ok: true,
        status: 200,
        latencyMs: 30,
        level: 'green',
        checkedAt: new Date(),
        redirectChain: [],
        message: 'OK',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/v1/dashboard/health-timeline?days=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.timeline.length).toBe(1);
    // Today should have a healthScore of 100 (all green)
    expect(res.body.timeline[0].healthScore).toBe(100);
  });

  // ─── Activity Feed ───

  it('returns empty activity feed for new user', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/dashboard/activity')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(0);
  });

  it('activity feed includes failed monitor runs', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const monitor = await prisma.monitor.create({
      data: {
        userId: user.id,
        name: 'Activity Test',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
        enabled: true,
      },
    });

    // Activity feed defaults to red/yellow only
    await prisma.monitorRun.create({
      data: {
        monitorId: monitor.id,
        userId: user.id,
        ok: false,
        status: 500,
        latencyMs: 1500,
        level: 'red',
        checkedAt: new Date(),
        redirectChain: [],
        message: 'OK',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/v1/dashboard/activity')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].kind).toBe('check');
    expect(res.body.items[0].level).toBe('red');
  });

  it('activity feed can filter by level=green to include green runs', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const monitor = await prisma.monitor.create({
      data: {
        userId: user.id,
        name: 'Green Activity Test',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
        enabled: true,
      },
    });

    await prisma.monitorRun.create({
      data: {
        monitorId: monitor.id,
        userId: user.id,
        ok: true,
        status: 200,
        latencyMs: 42,
        level: 'green',
        checkedAt: new Date(),
        redirectChain: [],
        message: 'OK',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/v1/dashboard/activity?level=green')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].level).toBe('green');
  });

  it('activity feed respects limit param', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const monitor = await prisma.monitor.create({
      data: {
        userId: user.id,
        name: 'Limit Test',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
        enabled: true,
      },
    });

    // Create 5 failed runs (activity feed defaults to red/yellow)
    for (let i = 0; i < 5; i++) {
      await prisma.monitorRun.create({
        data: {
          monitorId: monitor.id,
          userId: user.id,
          ok: false,
          status: 500,
          latencyMs: 10 + i,
          level: 'red',
          checkedAt: new Date(Date.now() - i * 60000),
          redirectChain: [],
        message: 'OK',
        },
      });
    }

    const res = await request(app.getHttpServer())
      .get('/v1/dashboard/activity?limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.items.length).toBeLessThanOrEqual(2);
  });
});
