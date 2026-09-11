/**
 * Integration tests: Feedback & plugin endpoints.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Feedback (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const user = await createTestUser(prisma, module);
    token = user.token;
    userId = user.user.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await destroyTestApp(app);
  }, 15000);

  const auth = () => ({ Authorization: `Bearer ${token}` });

  // ─── POST /v1/feedback/template-report ───────────────────────────────

  it('accepts a feedback report with toolId only', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/feedback/template-report')
      .set(auth())
      .send({ toolId: 'nginx' })
      .expect(200);

    expect(res.body.received).toBe(true);
  });

  it('accepts a full feedback report', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/feedback/template-report')
      .set(auth())
      .send({
        toolId: 'traefik',
        endpoint: 'https://example.com/api',
        statusCode: 404,
        error: 'Not found',
        note: 'Template endpoint is wrong',
      })
      .expect(200);

    expect(res.body.received).toBe(true);
  });

  it('rejects a report missing toolId (400)', async () => {
    await request(app.getHttpServer())
      .post('/v1/feedback/template-report')
      .set(auth())
      .send({ note: 'no toolId' })
      .expect(400);
  });

  it('requires auth for template-report', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/feedback/template-report')
      .send({ toolId: 'nginx' });
    expect([401, 403]).toContain(res.status);
  });

  // ─── GET /v1/feedback/template-reports ───────────────────────────────

  it('lists own feedback reports', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/feedback/template-reports')
      .set(auth())
      .expect(200);

    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('reports');
    expect(Array.isArray(res.body.reports)).toBe(true);
    // Should contain the reports submitted above
    expect(res.body.total).toBeGreaterThanOrEqual(2);
  });

  it('lists own feedback after submitting', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/feedback/template-reports')
      .set(auth())
      .expect(200);

    // We submitted 2 reports in prior tests — own reports visible
    const toolIds = res.body.reports.map((r: { toolId: string }) => r.toolId);
    expect(toolIds).toContain('nginx');
    expect(toolIds).toContain('traefik');
  });

  it('requires auth for list endpoint', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/feedback/template-reports');
    expect([401, 403]).toContain(res.status);
  });
});

describe('Plugins (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const user = await createTestUser(prisma, module);
    token = user.token;
    userId = user.user.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await destroyTestApp(app);
  }, 15000);

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('returns a list of plugins', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/plugins')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // Each plugin has a name/type identifier
    const plugin = res.body[0];
    expect(plugin).toHaveProperty('id');
  });

  it('requires auth for plugins list (401)', async () => {
    await request(app.getHttpServer())
      .get('/v1/plugins')
      .expect(401);
  });
});
