/**
 * Integration tests: V2 Playbooks endpoint.
 *
 * Covers:
 *   GET /v2/playbooks — paginated list with search, severity filter, sortBy/sortDir
 *
 * Validates: auth guard, envelope shape, derived fields (stepCount/monitorCount),
 *   search (name/description case-insensitive), severity filter, all sortBy combos,
 *   sortDir asc/desc, pagination (total/limit=1/cross-page), user isolation,
 *   empty list, page-beyond-total, invalid params → 400.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('GET /v2/playbooks (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let token2: string;
  let userId2: string;

  // Playbook IDs for user 1
  let pbId1: string;
  let pbId2: string;
  let pbId3: string;
  // Monitor attached to pbId1
  let monitorId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const auth2 = () => ({ Authorization: `Bearer ${token2}` });

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const u1 = await createTestUser(prisma, module);
    token = u1.token;
    userId = u1.user.id;

    const u2 = await createTestUser(prisma, module);
    token2 = u2.token;
    userId2 = u2.user.id;

    // Create a monitor for user 1 (to test monitorCount)
    const monitorRes = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(auth())
      .send({ name: 'PB Test Monitor', type: 'HTTP', target: 'https://example.com', intervalSec: 60 });
    monitorId = monitorRes.body.id as string;

    // Playbook 1: 3 steps, CRITICAL + HIGH severity, attached to monitorId
    const pb1Res = await request(app.getHttpServer())
      .post('/v1/playbooks')
      .set(auth())
      .send({
        name: 'Alpha Incident Playbook',
        description: 'Handles alpha incidents',
        steps: [
          { id: 's1', title: 'Acknowledge alert', type: 'check' },
          { id: 's2', title: 'Notify team', type: 'notify' },
          { id: 's3', title: 'Resolve issue', type: 'runbook' },
        ],
        forSeverities: ['CRITICAL', 'HIGH'],
      });
    pbId1 = pb1Res.body.id as string;

    // Attach playbook to monitor
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/playbook`)
      .set(auth())
      .send({ playbookId: pbId1 });

    // Playbook 2: 1 step, LOW severity
    const pb2Res = await request(app.getHttpServer())
      .post('/v1/playbooks')
      .set(auth())
      .send({
        name: 'Beta Runbook',
        description: 'Low priority runbook for beta service',
        steps: [{ id: 's1', title: 'Check metrics', type: 'check' }],
        forSeverities: ['LOW'],
      });
    pbId2 = pb2Res.body.id as string;

    // Playbook 3: 2 steps, no severity (empty)
    const pb3Res = await request(app.getHttpServer())
      .post('/v1/playbooks')
      .set(auth())
      .send({
        name: 'Zeta Fallback',
        description: 'Fallback for uncategorized incidents',
        steps: [
          { id: 's1', title: 'Check status', type: 'check' },
          { id: 's2', title: 'Escalate', type: 'escalate' },
        ],
        forSeverities: [],
      });
    pbId3 = pb3Res.body.id as string;

    // User 2 gets one playbook (for isolation tests)
    await request(app.getHttpServer())
      .post('/v1/playbooks')
      .set(auth2())
      .send({
        name: 'User2 Playbook',
        description: null,
        steps: [{ id: 's1', title: 'User 2 step', type: 'check' }],
        forSeverities: [],
      });
  });

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app, module);
  });

  // ── Auth guard ─────────────────────────────────────────────────────────────

  it('GET /v2/playbooks → 401 without auth token', async () => {
    const res = await request(app.getHttpServer()).get('/v2/playbooks');
    expect(res.status).toBeOneOf([401, 403]);
  });

  // ── Envelope shape ─────────────────────────────────────────────────────────

  it('returns paginated envelope { data, meta }', async () => {
    const res = await request(app.getHttpServer()).get('/v2/playbooks').set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({
      total: expect.any(Number),
      page: expect.any(Number),
      limit: expect.any(Number),
      pages: expect.any(Number),
    });
  });

  // ── Field shape ────────────────────────────────────────────────────────────

  it('each playbook item has the correct field shape', async () => {
    const res = await request(app.getHttpServer()).get('/v2/playbooks').set(auth());
    expect(res.status).toBe(200);
    const item = res.body.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('description');
    expect(item).toHaveProperty('steps');
    expect(item).toHaveProperty('forSeverities');
    expect(item).toHaveProperty('stepCount');
    expect(item).toHaveProperty('monitorCount');
    expect(item).toHaveProperty('createdAt');
    expect(item).toHaveProperty('updatedAt');
  });

  it('derived stepCount matches steps array length', async () => {
    const res = await request(app.getHttpServer()).get('/v2/playbooks').set(auth());
    const pb1 = res.body.data.find((p: { id: string }) => p.id === pbId1);
    const pb2 = res.body.data.find((p: { id: string }) => p.id === pbId2);
    const pb3 = res.body.data.find((p: { id: string }) => p.id === pbId3);
    expect(pb1.stepCount).toBe(3);
    expect(pb2.stepCount).toBe(1);
    expect(pb3.stepCount).toBe(2);
  });

  it('derived monitorCount reflects number of monitors using this playbook', async () => {
    const res = await request(app.getHttpServer()).get('/v2/playbooks').set(auth());
    const pb1 = res.body.data.find((p: { id: string }) => p.id === pbId1);
    const pb2 = res.body.data.find((p: { id: string }) => p.id === pbId2);
    expect(pb1.monitorCount).toBe(1); // attached to monitorId
    expect(pb2.monitorCount).toBe(0); // not attached to any monitor
  });

  // ── User isolation ─────────────────────────────────────────────────────────

  it('user isolation: user 1 only sees own playbooks', async () => {
    const res = await request(app.getHttpServer()).get('/v2/playbooks').set(auth());
    const ids = res.body.data.map((p: { id: string }) => p.id) as string[];
    expect(ids).toContain(pbId1);
    expect(ids).toContain(pbId2);
    expect(ids).toContain(pbId3);
    // user 2's playbook name should not appear
    const names = res.body.data.map((p: { name: string }) => p.name) as string[];
    expect(names).not.toContain('User2 Playbook');
  });

  it('user isolation: user 2 only sees own playbooks', async () => {
    const res = await request(app.getHttpServer()).get('/v2/playbooks').set(auth2());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].name).toBe('User2 Playbook');
  });

  // ── Search ─────────────────────────────────────────────────────────────────

  it('search by name (case-insensitive)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?search=alpha')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    const names = res.body.data.map((p: { name: string }) => p.name) as string[];
    expect(names.some(n => n.toLowerCase().includes('alpha'))).toBe(true);
  });

  it('search by description (case-insensitive)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?search=runbook')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    const found = res.body.data.find((p: { id: string }) => p.id === pbId2);
    expect(found).toBeTruthy();
  });

  it('search with no match returns empty list', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?search=zzz-does-not-exist-xyz')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(0);
    expect(res.body.data).toHaveLength(0);
  });

  // ── Severity filter ────────────────────────────────────────────────────────

  it('severity=CRITICAL returns only playbooks with CRITICAL in forSeverities', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?severity=CRITICAL')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    const all = res.body.data as Array<{ forSeverities: string[] }>;
    all.forEach(p => expect(p.forSeverities.map(s => s.toUpperCase())).toContain('CRITICAL'));
  });

  it('severity filter is case-insensitive', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?severity=low')
      .set(auth());
    expect(res.status).toBe(200);
    const ids = res.body.data.map((p: { id: string }) => p.id) as string[];
    expect(ids).toContain(pbId2);
    expect(ids).not.toContain(pbId1); // pbId1 is CRITICAL/HIGH not LOW
  });

  it('severity filter returns empty when no match', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?severity=NONEXISTENT')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(0);
  });

  // ── Sort ───────────────────────────────────────────────────────────────────

  it('sortBy=name asc returns alphabetical order', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?sortBy=name&sortDir=asc')
      .set(auth());
    expect(res.status).toBe(200);
    const names = res.body.data.map((p: { name: string }) => p.name) as string[];
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('sortBy=name desc returns reverse alphabetical order', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?sortBy=name&sortDir=desc')
      .set(auth());
    expect(res.status).toBe(200);
    const names = res.body.data.map((p: { name: string }) => p.name) as string[];
    const sorted = [...names].sort((a, b) => b.localeCompare(a));
    expect(names).toEqual(sorted);
  });

  it('sortBy=stepCount asc puts fewer steps first', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?sortBy=stepCount&sortDir=asc')
      .set(auth());
    expect(res.status).toBe(200);
    const counts = res.body.data.map((p: { stepCount: number }) => p.stepCount) as number[];
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });

  it('sortBy=stepCount desc puts more steps first', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?sortBy=stepCount&sortDir=desc')
      .set(auth());
    expect(res.status).toBe(200);
    const counts = res.body.data.map((p: { stepCount: number }) => p.stepCount) as number[];
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });

  it('sortBy=monitorCount desc puts most-used first', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?sortBy=monitorCount&sortDir=desc')
      .set(auth());
    expect(res.status).toBe(200);
    const counts = res.body.data.map((p: { monitorCount: number }) => p.monitorCount) as number[];
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });

  it('sortBy=createdAt asc returns oldest first', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?sortBy=createdAt&sortDir=asc')
      .set(auth());
    expect(res.status).toBe(200);
    const dates = res.body.data.map((p: { createdAt: string }) => new Date(p.createdAt).getTime()) as number[];
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
    }
  });

  it('sortBy=updatedAt desc (default) returns most recently updated first', async () => {
    const res = await request(app.getHttpServer()).get('/v2/playbooks').set(auth());
    expect(res.status).toBe(200);
    const dates = res.body.data.map((p: { updatedAt: string }) => new Date(p.updatedAt).getTime()) as number[];
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
    }
  });

  // ── Pagination ─────────────────────────────────────────────────────────────

  it('pagination: meta.total equals total playbook count for user', async () => {
    const res = await request(app.getHttpServer()).get('/v2/playbooks').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(3);
  });

  it('pagination: limit=1 returns only one playbook', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?limit=1')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(3);
    expect(res.body.meta.limit).toBe(1);
    expect(res.body.meta.pages).toBe(3);
  });

  it('pagination: page=2 limit=2 returns last playbook', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?page=2&limit=2&sortBy=name&sortDir=asc')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.page).toBe(2);
  });

  it('pagination: page beyond total returns empty data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?page=99')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(3);
  });

  // ── Invalid params ─────────────────────────────────────────────────────────

  it('invalid sortBy → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?sortBy=invalid')
      .set(auth());
    expect(res.status).toBe(400);
  });

  it('invalid sortDir → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?sortDir=sideways')
      .set(auth());
    expect(res.status).toBe(400);
  });

  it('limit=0 → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/playbooks?limit=0')
      .set(auth());
    expect(res.status).toBe(400);
  });
});
