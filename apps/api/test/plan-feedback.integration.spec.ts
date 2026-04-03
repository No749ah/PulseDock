/**
 * Integration tests: Plan + Feedback endpoints against a real PostgreSQL database.
 *
 * Covers:
 *   Plan:
 *     - GET /v1/plan — returns plan name, limits, and usage counts
 *     - GET /v1/plan/check/:resource — validates each resource type
 *     - GET /v1/plan/check/:resource — unknown resource returns allowed=true
 *     - Auth guard (401)
 *
 *   Feedback:
 *     - POST /v1/feedback/template-report — create report
 *     - GET  /v1/feedback/template-reports — list own reports (user), all (admin)
 *     - Input validation (missing toolId)
 *     - Auth guard (401)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Plan + Feedback endpoints (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  let adminToken: string;
  let adminUserId: string;

  let userToken: string;
  let userId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const admin = await createTestUser(prisma, module, { role: 'admin' });
    adminToken = admin.token;
    adminUserId = admin.user.id;

    const user = await createTestUser(prisma, module, { role: 'user' });
    userToken = user.token;
    userId = user.user.id;
  }, 30000);

  afterAll(async () => {
    await prisma.toolTemplateFeedback.deleteMany({ where: { userId: adminUserId } });
    await prisma.toolTemplateFeedback.deleteMany({ where: { userId } });
    await cleanupTestUser(prisma, adminUserId);
    await cleanupTestUser(prisma, userId);
    await destroyTestApp(app);
  }, 15000);

  const auth = (t = adminToken) => ({ Authorization: `Bearer ${t}` });

  // ─── Plan: Auth guard ─────────────────────────────────────────────────────

  it('GET /v1/plan → 401 without auth', async () => {
    await request(app.getHttpServer()).get('/v1/plan').expect(401);
  });

  it('GET /v1/plan/check/monitors → 401 without auth', async () => {
    await request(app.getHttpServer()).get('/v1/plan/check/monitors').expect(401);
  });

  // ─── Plan: GET /v1/plan ───────────────────────────────────────────────────

  it('returns plan info with limits and usage', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/plan')
      .set(auth())
      .expect(200);

    expect(res.body).toHaveProperty('plan');
    expect(res.body).toHaveProperty('usage');

    const { plan, usage } = res.body;
    expect(plan).toHaveProperty('name');
    expect(typeof plan.name).toBe('string');
    expect(plan).toHaveProperty('limits');
    expect(plan.limits).toHaveProperty('monitors');
    expect(plan.limits).toHaveProperty('checksPerDay');
    expect(plan.limits).toHaveProperty('teamMembers');
    expect(plan.limits).toHaveProperty('statusPages');
    expect(plan.limits).toHaveProperty('alertChannels');

    expect(typeof usage.monitors).toBe('number');
    expect(typeof usage.checksToday).toBe('number');
    expect(typeof usage.teamMembers).toBe('number');
    expect(typeof usage.statusPages).toBe('number');
    expect(typeof usage.alertChannels).toBe('number');
  });

  it('usage counts are non-negative integers', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/plan')
      .set(auth())
      .expect(200);

    const { usage } = res.body;
    for (const key of ['monitors', 'checksToday', 'teamMembers', 'statusPages', 'alertChannels']) {
      expect(usage[key]).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(usage[key])).toBe(true);
    }
  });

  // ─── Plan: GET /v1/plan/check/:resource ──────────────────────────────────

  it('checks monitors resource limit', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/plan/check/monitors')
      .set(auth())
      .expect(200);

    expect(res.body).toHaveProperty('allowed');
    expect(res.body).toHaveProperty('current');
    expect(res.body).toHaveProperty('limit');
    expect(res.body).toHaveProperty('plan');
    expect(typeof res.body.allowed).toBe('boolean');
  });

  it.each(['monitors', 'checks', 'team', 'status-pages', 'alert-channels'])(
    'checks %s resource returns valid shape',
    async (resource) => {
      const res = await request(app.getHttpServer())
        .get(`/v1/plan/check/${resource}`)
        .set(auth())
        .expect(200);

      expect(res.body).toMatchObject({
        allowed: expect.any(Boolean),
        current: expect.any(Number),
        limit: expect.any(Number),
        plan: expect.any(String),
      });
    }
  );

  it('unknown resource returns allowed=true with limit=-1', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/plan/check/unknown-resource')
      .set(auth())
      .expect(200);

    expect(res.body.allowed).toBe(true);
    expect(res.body.limit).toBe(-1);
  });

  // ─── Feedback: Auth guard ─────────────────────────────────────────────────

  it('POST /v1/feedback/template-report → 401/403 without auth', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/feedback/template-report')
      .send({ toolId: 'nodejs' });
    expect([401, 403]).toContain(res.status);
  });

  it('GET /v1/feedback/template-reports → 401 without auth', async () => {
    await request(app.getHttpServer()).get('/v1/feedback/template-reports').expect(401);
  });

  // ─── Feedback: POST /v1/feedback/template-report ─────────────────────────

  it('creates a template feedback report', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/feedback/template-report')
      .set(auth())
      .send({
        toolId: 'nodejs',
        endpoint: 'https://api.github.com/repos/nodejs/node/releases/latest',
        statusCode: 404,
        error: 'Not Found',
        note: 'Template endpoint appears to have changed',
      })
      .expect(200);

    expect(res.body).toEqual({ received: true });

    // Verify persisted in DB
    const record = await prisma.toolTemplateFeedback.findFirst({
      where: { userId: adminUserId, toolId: 'nodejs' },
    });
    expect(record).toBeDefined();
    expect(record?.endpoint).toContain('github.com');
    expect(record?.statusCode).toBe(404);
    expect(record?.error).toBe('Not Found');
    expect(record?.note).toContain('endpoint appears');
  });

  it('creates a minimal feedback report (toolId only)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/feedback/template-report')
      .set(auth(userToken))
      .send({ toolId: 'redis' })
      .expect(200);

    expect(res.body.received).toBe(true);
  });

  it('rejects feedback with missing toolId', async () => {
    await request(app.getHttpServer())
      .post('/v1/feedback/template-report')
      .set(auth())
      .send({ note: 'Something is broken' })
      .expect(400);
  });

  it('truncates long error and note fields gracefully', async () => {
    const longString = 'x'.repeat(3000);
    const res = await request(app.getHttpServer())
      .post('/v1/feedback/template-report')
      .set(auth())
      .send({ toolId: 'long-test', error: longString, note: longString })
      .expect(200);

    expect(res.body.received).toBe(true);

    const record = await prisma.toolTemplateFeedback.findFirst({
      where: { userId: adminUserId, toolId: 'long-test' },
    });
    expect(record?.error?.length).toBeLessThanOrEqual(1000);
    expect(record?.note?.length).toBeLessThanOrEqual(2000);
  });

  // ─── Feedback: GET /v1/feedback/template-reports ─────────────────────────

  it('admin sees all reports', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/feedback/template-reports')
      .set(auth(adminToken))
      .expect(200);

    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('reports');
    expect(Array.isArray(res.body.reports)).toBe(true);
    expect(res.body.reports.length).toBeGreaterThan(0);

    // Includes reports from both users
    const adminReport = res.body.reports.find((r: { userId: string }) => r.userId === adminUserId);
    expect(adminReport).toBeDefined();
  });

  it('regular user sees only own reports', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/feedback/template-reports')
      .set(auth(userToken))
      .expect(200);

    expect(Array.isArray(res.body.reports)).toBe(true);
    // All reports belong to the requesting user
    for (const report of res.body.reports) {
      expect(report.userId).toBe(userId);
    }
  });

  it('report shape has expected fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/feedback/template-reports')
      .set(auth(adminToken))
      .expect(200);

    const report = res.body.reports[0];
    expect(report).toHaveProperty('id');
    expect(report).toHaveProperty('toolId');
    expect(report).toHaveProperty('createdAt');
    expect(report).toHaveProperty('userId');
  });
});
