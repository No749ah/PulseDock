/**
 * Integration tests: Plan & usage endpoints (/v1/plan).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Plan (integration)', () => {
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

  // ─── GET /v1/plan ─────────────────────────────────────────────────────

  it('returns plan and usage for authenticated user', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/plan')
      .set(auth())
      .expect(200);

    expect(res.body).toHaveProperty('plan');
    expect(res.body).toHaveProperty('usage');
    expect(res.body.plan).toHaveProperty('name');
    expect(res.body.plan).toHaveProperty('limits');
    expect(res.body.usage).toHaveProperty('monitors');
    expect(res.body.usage).toHaveProperty('checksToday');
  });

  it('plan limits include all resource types', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/plan')
      .set(auth())
      .expect(200);

    const limits = res.body.plan.limits;
    expect(limits).toHaveProperty('monitors');
    expect(limits).toHaveProperty('checksPerDay');
    expect(limits).toHaveProperty('teamMembers');
    expect(limits).toHaveProperty('statusPages');
    expect(limits).toHaveProperty('alertChannels');
  });

  it('requires auth (401/403)', async () => {
    const res = await request(app.getHttpServer()).get('/v1/plan');
    expect([401, 403]).toContain(res.status);
  });

  // ─── GET /v1/plan/check/:resource ─────────────────────────────────────

  it('check monitors returns allowed shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/plan/check/monitors')
      .set(auth())
      .expect(200);

    expect(res.body).toHaveProperty('allowed');
    expect(res.body).toHaveProperty('current');
    expect(res.body).toHaveProperty('limit');
    expect(typeof res.body.allowed).toBe('boolean');
  });

  it('check all valid resources return allowed shape', async () => {
    const resources = ['monitors', 'checks', 'team', 'status-pages', 'alert-channels'];
    for (const resource of resources) {
      const res = await request(app.getHttpServer())
        .get(`/v1/plan/check/${resource}`)
        .set(auth())
        .expect(200);
      expect(typeof res.body.allowed).toBe('boolean');
    }
  });

  it('check unknown resource returns allowed:true fallback', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/plan/check/unknown-resource')
      .set(auth())
      .expect(200);

    expect(res.body.allowed).toBe(true);
  });

  it('check requires auth (401/403)', async () => {
    const res = await request(app.getHttpServer()).get('/v1/plan/check/monitors');
    expect([401, 403]).toContain(res.status);
  });
});
