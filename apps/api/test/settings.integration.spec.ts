/**
 * Integration tests: Settings endpoints against a real PostgreSQL database.
 *
 * Covers: retention settings (GET defaults, PUT update, valid/invalid values),
 * storage stats, workspace settings (GET/PUT), auth guards, and user isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Settings endpoints (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  let token: string;
  let userId: string;

  let token2: string;
  let userId2: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const u1 = await createTestUser(prisma, module);
    token = u1.token;
    userId = u1.user.id;

    const u2 = await createTestUser(prisma, module);
    token2 = u2.token;
    userId2 = u2.user.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app);
  }, 15000);

  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('GET /v1/settings/retention → 401 without auth', async () => {
    await request(app.getHttpServer()).get('/v1/settings/retention').expect(401);
  });

  it('PUT /v1/settings/retention → 401 without auth', async () => {
    const res = await request(app.getHttpServer())
      .put('/v1/settings/retention')
      .send({ retentionDays: 30 });
    expect([401, 403]).toContain(res.status);
  });

  it('GET /v1/settings/storage → 401 without auth', async () => {
    await request(app.getHttpServer()).get('/v1/settings/storage').expect(401);
  });

  it('GET /v1/settings/workspace → 401 without auth', async () => {
    await request(app.getHttpServer()).get('/v1/settings/workspace').expect(401);
  });

  // ─── Retention defaults ───────────────────────────────────────────────────

  it('GET /v1/settings/retention → returns defaults for new user', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/settings/retention')
      .set(auth())
      .expect(200);

    expect(res.body).toHaveProperty('retentionDays');
    expect(res.body).toHaveProperty('rollupEnabled');
    expect(typeof res.body.retentionDays).toBe('number');
    expect(typeof res.body.rollupEnabled).toBe('boolean');
  });

  // ─── Retention update ─────────────────────────────────────────────────────

  it('PUT /v1/settings/retention → updates retentionDays to 30', async () => {
    const res = await request(app.getHttpServer())
      .put('/v1/settings/retention')
      .set(auth())
      .send({ retentionDays: 30 })
      .expect(200);

    expect(res.body.retentionDays).toBe(30);
    expect(res.body).toHaveProperty('message');
  });

  it('GET /v1/settings/retention → reflects updated value', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/settings/retention')
      .set(auth())
      .expect(200);
    expect(res.body.retentionDays).toBe(30);
  });

  it('PUT /v1/settings/retention → updates rollupEnabled to false', async () => {
    const res = await request(app.getHttpServer())
      .put('/v1/settings/retention')
      .set(auth())
      .send({ retentionDays: 90, rollupEnabled: false })
      .expect(200);
    expect(res.body.rollupEnabled).toBe(false);
    expect(res.body.retentionDays).toBe(90);
  });

  it('PUT /v1/settings/retention → 400 for invalid retentionDays value', async () => {
    const res = await request(app.getHttpServer())
      .put('/v1/settings/retention')
      .set(auth())
      .send({ retentionDays: 45 }); // not in [7, 30, 90, 365]
    expect([400, 422]).toContain(res.status);
  });

  it('PUT /v1/settings/retention → 400 for missing retentionDays', async () => {
    const res = await request(app.getHttpServer())
      .put('/v1/settings/retention')
      .set(auth())
      .send({});
    expect([400, 422]).toContain(res.status);
  });

  // ─── User isolation ───────────────────────────────────────────────────────

  it('PUT /v1/settings/retention → user B changes do not affect user A', async () => {
    // Set A to 365
    await request(app.getHttpServer())
      .put('/v1/settings/retention')
      .set(auth())
      .send({ retentionDays: 365 })
      .expect(200);

    // Set B to 7
    await request(app.getHttpServer())
      .put('/v1/settings/retention')
      .set(auth(token2))
      .send({ retentionDays: 7 })
      .expect(200);

    // A should still be 365
    const resA = await request(app.getHttpServer())
      .get('/v1/settings/retention')
      .set(auth())
      .expect(200);
    expect(resA.body.retentionDays).toBe(365);

    // B should be 7
    const resB = await request(app.getHttpServer())
      .get('/v1/settings/retention')
      .set(auth(token2))
      .expect(200);
    expect(resB.body.retentionDays).toBe(7);
  });

  // ─── Storage stats ────────────────────────────────────────────────────────

  it('GET /v1/settings/storage → returns storage stats', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/settings/storage')
      .set(auth())
      .expect(200);

    expect(res.body).toHaveProperty('rawRunsTotal');
    expect(res.body).toHaveProperty('rollupBucketsTotal');
    expect(typeof res.body.rawRunsTotal).toBe('number');
    expect(typeof res.body.rollupBucketsTotal).toBe('number');
  });

  // ─── Workspace settings ───────────────────────────────────────────────────

  it('GET /v1/settings/workspace → returns workspace settings', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/settings/workspace')
      .set(auth())
      .expect(200);

    // Should return at least an object (fields may be null for new users)
    expect(typeof res.body).toBe('object');
  });

  it('PUT /v1/settings/workspace → updates workspace name', async () => {
    const res = await request(app.getHttpServer())
      .put('/v1/settings/workspace')
      .set(auth())
      .send({ workspaceName: 'Acme Corp' })
      .expect(200);

    expect(res.body).toHaveProperty('workspaceName', 'Acme Corp');
  });

  it('GET /v1/settings/workspace → reflects updated workspace name', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/settings/workspace')
      .set(auth())
      .expect(200);
    expect(res.body.workspaceName).toBe('Acme Corp');
  });

  it('PUT /v1/settings/workspace → updates slug and website', async () => {
    const res = await request(app.getHttpServer())
      .put('/v1/settings/workspace')
      .set(auth())
      .send({
        workspaceSlug: 'acme-corp',
        workspaceWebsite: 'https://acme.example.com',
      })
      .expect(200);

    expect(res.body).toMatchObject({
      workspaceSlug: 'acme-corp',
      workspaceWebsite: 'https://acme.example.com',
    });
  });

  it('PUT /v1/settings/workspace → 400 for name exceeding maxLength', async () => {
    const res = await request(app.getHttpServer())
      .put('/v1/settings/workspace')
      .set(auth())
      .send({ workspaceName: 'A'.repeat(200) }); // > 100 char limit
    expect([400, 422]).toContain(res.status);
  });

  it('PUT /v1/settings/workspace → user isolation (B cannot see A\'s workspace name)', async () => {
    const resB = await request(app.getHttpServer())
      .get('/v1/settings/workspace')
      .set(auth(token2))
      .expect(200);
    // B should not see A's workspace name
    expect(resB.body.workspaceName).not.toBe('Acme Corp');
  });
});
