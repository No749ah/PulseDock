/**
 * Integration tests: Agent endpoint against a real PostgreSQL database.
 *
 * Covers:
 *   - POST /v1/agent/report — submit version report via monitorId, via toolId
 *   - GET  /v1/agent/status — list agent-managed monitors
 *   - Validation (missing toolId, missing version, invalid version)
 *   - User isolation (can't report to another user's monitor)
 *   - Auth guard (401 without token)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Agent endpoints (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  let token: string;
  let userId: string;

  let token2: string;
  let userId2: string;

  let monitorId: string;
  let monitorIdWithToolId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const u1 = await createTestUser(prisma, module);
    token = u1.token;
    userId = u1.user.id;

    const u2 = await createTestUser(prisma, module);
    token2 = u2.token;
    userId2 = u2.user.id;

    // Create a version-check monitor for user1 (explicit monitorId path)
    const m1 = await prisma.monitor.create({
      data: {
        userId,
        name: 'node-version-monitor',
        type: 'GIT_RELEASE',
        target: 'nodejs/node',
        intervalSec: 60,
        enabled: true,
        configJson: { toolId: 'nodejs', provider: 'github', currentVersion: '20.0.0' },
      },
    });
    monitorId = m1.id;

    // Another monitor with toolId in config (toolId lookup path)
    const m2 = await prisma.monitor.create({
      data: {
        userId,
        name: 'redis-version-monitor',
        type: 'GIT_RELEASE',
        target: 'redis/redis',
        intervalSec: 60,
        enabled: true,
        configJson: { toolId: 'redis', provider: 'github' },
      },
    });
    monitorIdWithToolId = m2.id;
  }, 30000);

  afterAll(async () => {
    await prisma.monitorRun.deleteMany({ where: { userId } });
    await prisma.monitor.deleteMany({ where: { userId } });
    await prisma.monitor.deleteMany({ where: { userId: userId2 } });
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app);
  }, 15000);

  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('POST /v1/agent/report → 401/403 without auth', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/agent/report')
      .send({ toolId: 'nodejs', version: '20.0.0' });
    expect([401, 403]).toContain(res.status);
  });

  it('GET /v1/agent/status → 401 without auth', async () => {
    await request(app.getHttpServer()).get('/v1/agent/status').expect(401);
  });

  // ─── POST /v1/agent/report (monitorId path) ───────────────────────────────

  it('reports a version via explicit monitorId', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/agent/report')
      .set(auth())
      .send({ toolId: 'nodejs', version: 'v20.11.0', monitorId })
      .expect(201);

    expect(res.body).toMatchObject({
      ok: true,
      monitorId,
      version: '20.11.0', // v-prefix stripped
    });

    // Monitor config should be updated
    const updated = await prisma.monitor.findUnique({ where: { id: monitorId } });
    const config = updated?.configJson as Record<string, unknown>;
    expect(config.currentVersion).toBe('20.11.0');
    expect(config.agentToolId).toBe('nodejs');
    expect(config.agentLastReport).toBeTruthy();

    // MonitorRun created
    const run = await prisma.monitorRun.findFirst({
      where: { monitorId },
      orderBy: { checkedAt: 'desc' },
    });
    expect(run?.level).toBe('green');
    expect(run?.ok).toBe(true);
    expect(run?.message).toContain('20.11.0');
  });

  it('includes hostname in MonitorRun message when provided', async () => {
    await request(app.getHttpServer())
      .post('/v1/agent/report')
      .set(auth())
      .send({ toolId: 'nodejs', version: '20.12.0', monitorId, hostname: 'prod-server-01' })
      .expect(201);

    const run = await prisma.monitorRun.findFirst({
      where: { monitorId },
      orderBy: { checkedAt: 'desc' },
    });
    expect(run?.message).toContain('prod-server-01');

    // Hostname stored in config
    const updated = await prisma.monitor.findUnique({ where: { id: monitorId } });
    const config = updated?.configJson as Record<string, unknown>;
    expect(config.agentHostname).toBe('prod-server-01');
  });

  // ─── POST /v1/agent/report (toolId lookup path) ──────────────────────────

  it('reports a version via toolId lookup in configJson', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/agent/report')
      .set(auth())
      .send({ toolId: 'redis', version: '7.2.4' })
      .expect(201);

    expect(res.body).toMatchObject({
      ok: true,
      monitorId: monitorIdWithToolId,
      version: '7.2.4',
    });
  });

  it('strips leading v prefix from version', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/agent/report')
      .set(auth())
      .send({ toolId: 'nodejs', version: 'v21.0.0', monitorId })
      .expect(201);

    expect(res.body.version).toBe('21.0.0');
  });

  // ─── Validation ───────────────────────────────────────────────────────────

  it('rejects report with missing toolId', async () => {
    await request(app.getHttpServer())
      .post('/v1/agent/report')
      .set(auth())
      .send({ version: '1.0.0' })
      .expect(400);
  });

  it('rejects report with missing version', async () => {
    await request(app.getHttpServer())
      .post('/v1/agent/report')
      .set(auth())
      .send({ toolId: 'nodejs', monitorId })
      .expect(400);
  });

  it('returns 404 when monitorId does not exist', async () => {
    await request(app.getHttpServer())
      .post('/v1/agent/report')
      .set(auth())
      .send({ toolId: 'nodejs', version: '20.0.0', monitorId: 'non-existent-id' })
      .expect(404);
  });

  it('returns 404 when toolId has no matching monitor', async () => {
    await request(app.getHttpServer())
      .post('/v1/agent/report')
      .set(auth())
      .send({ toolId: 'unknown-tool-xyz', version: '1.0.0' })
      .expect(404);
  });

  // ─── User isolation ───────────────────────────────────────────────────────

  it('user2 cannot report to user1 monitor via monitorId', async () => {
    await request(app.getHttpServer())
      .post('/v1/agent/report')
      .set(auth(token2))
      .send({ toolId: 'nodejs', version: '20.0.0', monitorId })
      .expect(404);
  });

  // ─── GET /v1/agent/status ─────────────────────────────────────────────────

  it('returns agent-managed monitors for user', async () => {
    // monitorId has been updated by prior tests so has agentLastReport
    const res = await request(app.getHttpServer())
      .get('/v1/agent/status')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const monitor = res.body.find((m: { monitorId: string }) => m.monitorId === monitorId);
    expect(monitor).toBeDefined();
    expect(monitor).toMatchObject({
      monitorId,
      monitorName: 'node-version-monitor',
      toolId: 'nodejs',
    });
    expect(monitor.version).toBeTruthy();
    expect(monitor.reportedAt).toBeTruthy();
  });

  it('user2 sees empty agent status (no monitors)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/agent/status')
      .set(auth(token2))
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });
});
