/**
 * Integration tests: V2 Service Groups + Escalation Policies endpoints.
 *
 * Covers:
 *   GET /v2/service-groups:
 *   - Auth guard (401 without token)
 *   - Paginated envelope shape (data + meta)
 *   - User isolation (user B cannot see user A's service groups)
 *   - monitorCount derived field (length of monitorIds array)
 *   - search filter (name + description, case-insensitive)
 *   - sortBy name asc/desc
 *   - sortBy createdAt desc (default)
 *   - sortBy monitorCount asc/desc (in-memory)
 *   - pagination (limit/page/meta.pages)
 *   - Response field shape
 *
 *   GET /v2/escalation-policies:
 *   - Auth guard (401 without token)
 *   - Paginated envelope shape (data + meta)
 *   - User isolation
 *   - stepCount derived field (length of steps JSON array)
 *   - search filter (name, case-insensitive)
 *   - sortBy name asc/desc
 *   - sortBy createdAt desc (default)
 *   - sortBy stepCount asc/desc (in-memory)
 *   - pagination (limit/page/meta.pages)
 *   - Response field shape
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

// ─── V2 Service Groups ─────────────────────────────────────────────────────────

describe('GET /v2/service-groups (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let token2: string;
  let userId2: string;
  let sgFrontendId: string;
  let sgBackendId: string;
  let sgDbId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const u1 = await createTestUser(prisma, module);
    token = u1.token;
    userId = u1.user.id;

    const u2 = await createTestUser(prisma, module);
    token2 = u2.token;
    userId2 = u2.user.id;

    // Seed user 1 — three groups with different monitorId counts
    const frontend = await prisma.monitorServiceGroup.create({
      data: { userId, name: 'Frontend Services', description: 'Web and UI monitors', monitorIds: ['m1', 'm2', 'm3'] },
    });
    sgFrontendId = frontend.id;

    await new Promise((r) => setTimeout(r, 5));
    const backend = await prisma.monitorServiceGroup.create({
      data: { userId, name: 'Backend APIs', description: 'API and worker monitors', monitorIds: ['m4', 'm5'] },
    });
    sgBackendId = backend.id;

    await new Promise((r) => setTimeout(r, 5));
    const db = await prisma.monitorServiceGroup.create({
      data: { userId, name: 'Databases', description: null, monitorIds: [] },
    });
    sgDbId = db.id;

    // Seed user 2 — must not appear for user 1
    await prisma.monitorServiceGroup.create({
      data: { userId: userId2, name: 'User2 Group', monitorIds: [] },
    });
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app, module);
  });

  it('returns 401 without auth token', async () => {
    await request(app.getHttpServer()).get('/v2/service-groups').expect(401);
  });

  it('returns paginated envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/service-groups')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('meta.total matches user group count', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/service-groups')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.meta.total).toBe(3);
  });

  it('user isolation — user 2 sees only own groups', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/service-groups')
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].name).toBe('User2 Group');
  });

  it('response item has expected fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/service-groups')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const item = res.body.data[0] as Record<string, unknown>;
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('description');
    expect(item).toHaveProperty('monitorIds');
    expect(item).toHaveProperty('monitorCount');
    expect(item).toHaveProperty('createdAt');
    expect(item).toHaveProperty('updatedAt');
  });

  it('monitorCount matches monitorIds.length', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/service-groups')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const items = res.body.data as Array<{ id: string; monitorIds: string[]; monitorCount: number }>;
    for (const item of items) {
      expect(item.monitorCount).toBe(item.monitorIds.length);
    }
  });

  it('description is null when not set', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/service-groups')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const db = (res.body.data as Array<{ id: string; description: null }>).find((i) => i.id === sgDbId);
    expect(db?.description).toBeNull();
  });

  it('search filters by name (case-insensitive)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/service-groups?search=frontend')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].id).toBe(sgFrontendId);
  });

  it('search filters by description (case-insensitive)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/service-groups?search=API')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].id).toBe(sgBackendId);
  });

  it('search with no match returns empty data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/service-groups?search=no-such-group-xyz')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.meta.total).toBe(0);
    expect(res.body.data).toHaveLength(0);
  });

  it('sortBy name asc returns alphabetical order', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/service-groups?sortBy=name&sortDir=asc')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const names = (res.body.data as Array<{ name: string }>).map((i) => i.name);
    expect(names).toEqual([...names].sort());
  });

  it('sortBy name desc returns reverse alphabetical order', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/service-groups?sortBy=name&sortDir=desc')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const names = (res.body.data as Array<{ name: string }>).map((i) => i.name);
    expect(names).toEqual([...names].sort().reverse());
  });

  it('sortBy monitorCount asc returns ascending order', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/service-groups?sortBy=monitorCount&sortDir=asc')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const counts = (res.body.data as Array<{ monitorCount: number }>).map((i) => i.monitorCount);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('sortBy monitorCount desc returns descending order', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/service-groups?sortBy=monitorCount&sortDir=desc')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const counts = (res.body.data as Array<{ monitorCount: number }>).map((i) => i.monitorCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('pagination limit=1 returns 1 item with correct meta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/service-groups?limit=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 3, page: 1, limit: 1, pages: 3 });
  });

  it('page beyond total returns empty data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/service-groups?page=99')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('invalid sortBy returns 400', async () => {
    await request(app.getHttpServer())
      .get('/v2/service-groups?sortBy=invalid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('invalid sortDir returns 400', async () => {
    await request(app.getHttpServer())
      .get('/v2/service-groups?sortDir=random')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});

// ─── V2 Escalation Policies ───────────────────────────────────────────────────

describe('GET /v2/escalation-policies (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let token2: string;
  let userId2: string;
  let epCriticalId: string;
  let epModerateId: string;
  let epLowId: string;

  const step = (delay: number) => ({ delayMinutes: delay, channelId: 'chan1' });

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const u1 = await createTestUser(prisma, module);
    token = u1.token;
    userId = u1.user.id;

    const u2 = await createTestUser(prisma, module);
    token2 = u2.token;
    userId2 = u2.user.id;

    // Seed user 1 — three policies with different step counts
    const critical = await prisma.escalationPolicy.create({
      data: { userId, name: 'Critical Policy', steps: [step(5), step(10), step(15)] },
    });
    epCriticalId = critical.id;

    await new Promise((r) => setTimeout(r, 5));
    const moderate = await prisma.escalationPolicy.create({
      data: { userId, name: 'Moderate Policy', steps: [step(30)] },
    });
    epModerateId = moderate.id;

    await new Promise((r) => setTimeout(r, 5));
    const low = await prisma.escalationPolicy.create({
      data: { userId, name: 'Low Priority', steps: [] },
    });
    epLowId = low.id;

    // Seed user 2 — must not appear for user 1
    await prisma.escalationPolicy.create({
      data: { userId: userId2, name: 'User2 Policy', steps: [step(10)] },
    });
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app, module);
  });

  it('returns 401 without auth token', async () => {
    await request(app.getHttpServer()).get('/v2/escalation-policies').expect(401);
  });

  it('returns paginated envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/escalation-policies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('meta.total matches user policy count', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/escalation-policies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.meta.total).toBe(3);
  });

  it('user isolation — user 2 sees only own policies', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/escalation-policies')
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].name).toBe('User2 Policy');
  });

  it('response item has expected fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/escalation-policies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const item = res.body.data[0] as Record<string, unknown>;
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('steps');
    expect(item).toHaveProperty('stepCount');
    expect(item).toHaveProperty('createdAt');
    expect(item).toHaveProperty('updatedAt');
  });

  it('stepCount matches steps array length', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/escalation-policies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const items = res.body.data as Array<{ id: string; steps: unknown[]; stepCount: number }>;
    for (const item of items) {
      expect(item.stepCount).toBe(item.steps.length);
    }
  });

  it('stepCount is 0 for policy with no steps', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/escalation-policies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const low = (res.body.data as Array<{ id: string; stepCount: number }>).find((i) => i.id === epLowId);
    expect(low?.stepCount).toBe(0);
  });

  it('search by name (case-insensitive)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/escalation-policies?search=critical')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].id).toBe(epCriticalId);
  });

  it('search with no match returns empty', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/escalation-policies?search=notexistent-xyz')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.meta.total).toBe(0);
    expect(res.body.data).toHaveLength(0);
  });

  it('sortBy name asc returns alphabetical order', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/escalation-policies?sortBy=name&sortDir=asc')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const names = (res.body.data as Array<{ name: string }>).map((i) => i.name);
    expect(names).toEqual([...names].sort());
  });

  it('sortBy stepCount asc returns ascending order', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/escalation-policies?sortBy=stepCount&sortDir=asc')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const counts = (res.body.data as Array<{ stepCount: number }>).map((i) => i.stepCount);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('sortBy stepCount desc returns descending order', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/escalation-policies?sortBy=stepCount&sortDir=desc')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const counts = (res.body.data as Array<{ stepCount: number }>).map((i) => i.stepCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('pagination limit=1 returns 1 item with correct meta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/escalation-policies?limit=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 3, page: 1, limit: 1, pages: 3 });
  });

  it('page beyond total returns empty data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/escalation-policies?page=99')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('invalid sortBy returns 400', async () => {
    await request(app.getHttpServer())
      .get('/v2/escalation-policies?sortBy=invalid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('invalid sortDir returns 400', async () => {
    await request(app.getHttpServer())
      .get('/v2/escalation-policies?sortDir=badval')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
