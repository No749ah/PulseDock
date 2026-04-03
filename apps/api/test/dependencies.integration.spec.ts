/**
 * Integration tests: Monitor Dependencies CRUD against a real PostgreSQL database.
 *
 * Covers: set dependencies, get dependencies per monitor, get full graph,
 * remove single dependency, impact analysis, circular dependency rejection,
 * user isolation, auth guard.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Dependencies (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  let token: string;
  let userId: string;
  let otherToken: string;
  let otherUserId: string;

  // Three monitors owned by user: A depends on B and C; C depends on D
  let monitorA: string;
  let monitorB: string;
  let monitorC: string;
  let monitorD: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const user = await createTestUser(prisma, module);
    token = user.token;
    userId = user.user.id;

    const other = await createTestUser(prisma, module);
    otherToken = other.token;
    otherUserId = other.user.id;

    // Create test monitors
    const [a, b, c, d] = await Promise.all([
      prisma.monitor.create({ data: { userId, name: 'Monitor A', type: 'HTTP', target: 'https://a.test', intervalSec: 60, enabled: true } }),
      prisma.monitor.create({ data: { userId, name: 'Monitor B', type: 'HTTP', target: 'https://b.test', intervalSec: 60, enabled: true } }),
      prisma.monitor.create({ data: { userId, name: 'Monitor C', type: 'HTTP', target: 'https://c.test', intervalSec: 60, enabled: true } }),
      prisma.monitor.create({ data: { userId, name: 'Monitor D', type: 'HTTP', target: 'https://d.test', intervalSec: 60, enabled: true } }),
    ]);

    monitorA = a.id;
    monitorB = b.id;
    monitorC = c.id;
    monitorD = d.id;
  }, 30000);

  afterAll(async () => {
    // Clean up dependencies first
    await prisma.monitorDependency.deleteMany({ where: { userId } });
    await prisma.monitorRun.deleteMany({ where: { userId } });
    await prisma.monitor.deleteMany({ where: { userId } });
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, otherUserId);
    await destroyTestApp(app);
  }, 15000);

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const otherAuth = () => ({ Authorization: `Bearer ${otherToken}` });

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('rejects unauthenticated request on GET /v1/dependencies/graph (401)', async () => {
    await request(app.getHttpServer())
      .get('/v1/dependencies/graph')
      .expect(401);
  });

  it('rejects unauthenticated request on GET /v1/monitors/:id/dependencies (401)', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorA}/dependencies`)
      .expect(401);
  });

  // ─── Empty state ──────────────────────────────────────────────────────────

  it('returns empty graph when no dependencies exist', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/dependencies/graph')
      .set(auth())
      .expect(200);

    expect(res.body.nodes).toEqual([]);
    expect(res.body.edges).toEqual([]);
  });

  it('returns empty array when monitor has no dependencies', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorA}/dependencies`)
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  // ─── Set dependencies ─────────────────────────────────────────────────────

  it('sets dependencies for monitor A → B and C', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA}/dependencies`)
      .set(auth())
      .send({ dependsOnIds: [monitorB, monitorC] })
      .expect(201);

    // Returns void / 201 with no body, or empty body
    expect(res.status).toBe(201);
  });

  it('retrieves dependencies for monitor A', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorA}/dependencies`)
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);

    const depIds = res.body.map((d: { dependsOnId: string }) => d.dependsOnId);
    expect(depIds).toContain(monitorB);
    expect(depIds).toContain(monitorC);

    // Check shape
    const dep = res.body[0];
    expect(dep.dependsOn).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      type: expect.any(String),
    });
  });

  it('sets dependencies for C → D (chain)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorC}/dependencies`)
      .set(auth())
      .send({ dependsOnIds: [monitorD] })
      .expect(201);
  });

  // ─── Dependency graph ─────────────────────────────────────────────────────

  it('returns full dependency graph with nodes and edges', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/dependencies/graph')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(Array.isArray(res.body.edges)).toBe(true);

    // Should have 4 nodes (A, B, C, D all appear in edges)
    expect(res.body.nodes.length).toBeGreaterThanOrEqual(4);

    // Check node shape
    const nodeA = res.body.nodes.find((n: { id: string }) => n.id === monitorA);
    expect(nodeA).toBeDefined();
    expect(nodeA).toMatchObject({
      id: monitorA,
      name: 'Monitor A',
      type: 'HTTP',
      dependencies: expect.arrayContaining([monitorB, monitorC]),
      dependents: [],
    });

    // Edges: A→B, A→C, C→D (direction: from=dependsOn, to=monitor)
    expect(res.body.edges.length).toBeGreaterThanOrEqual(3);
    const hasAB = res.body.edges.some((e: { from: string; to: string }) => e.from === monitorB && e.to === monitorA);
    const hasAC = res.body.edges.some((e: { from: string; to: string }) => e.from === monitorC && e.to === monitorA);
    const hasCD = res.body.edges.some((e: { from: string; to: string }) => e.from === monitorD && e.to === monitorC);
    expect(hasAB).toBe(true);
    expect(hasAC).toBe(true);
    expect(hasCD).toBe(true);
  });

  it('other user gets empty graph (isolation)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/dependencies/graph')
      .set(otherAuth())
      .expect(200);

    expect(res.body.nodes).toEqual([]);
    expect(res.body.edges).toEqual([]);
  });

  // ─── Impact analysis ──────────────────────────────────────────────────────

  it('returns impact analysis for monitor D (root cause)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorD}/impact`)
      .set(auth())
      .expect(200);

    expect(res.body.monitor.id).toBe(monitorD);
    expect(Array.isArray(res.body.affectedDownstream)).toBe(true);
    expect(Array.isArray(res.body.rootCauses)).toBe(true);

    // D is depended on by C, which is depended on by A → downstream: C, A
    const downstreamIds = res.body.affectedDownstream.map((m: { id: string }) => m.id);
    expect(downstreamIds).toContain(monitorC);
    expect(downstreamIds).toContain(monitorA);
  });

  it('returns impact analysis for monitor B (leaf node)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorB}/impact`)
      .set(auth())
      .expect(200);

    expect(res.body.monitor.id).toBe(monitorB);
    // B is depended on by A
    const downstreamIds = res.body.affectedDownstream.map((m: { id: string }) => m.id);
    expect(downstreamIds).toContain(monitorA);
  });

  it('returns 404 for impact analysis on non-existent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/non-existent-id/impact')
      .set(auth())
      .expect(404);
  });

  it('other user cannot see impact for first user\'s monitor (404)', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorA}/impact`)
      .set(otherAuth())
      .expect(404);
  });

  // ─── Self-dependency rejection ────────────────────────────────────────────

  it('rejects circular dependency (monitor depending on itself)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorB}/dependencies`)
      .set(auth())
      .send({ dependsOnIds: [monitorB] })
      .expect(400);
  });

  // ─── Remove single dependency ─────────────────────────────────────────────

  it('removes a single dependency (A → B)', async () => {
    await request(app.getHttpServer())
      .delete(`/v1/monitors/${monitorA}/dependencies/${monitorB}`)
      .set(auth())
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorA}/dependencies`)
      .set(auth())
      .expect(200);

    const depIds = res.body.map((d: { dependsOnId: string }) => d.dependsOnId);
    expect(depIds).not.toContain(monitorB);
    expect(depIds).toContain(monitorC); // C still present
  });

  it('returns 200 (idempotent) when removing non-existent dependency', async () => {
    // deleteMany is idempotent — no-op if dep doesn't exist, returns ok:true
    await request(app.getHttpServer())
      .delete(`/v1/monitors/${monitorA}/dependencies/non-existent-id`)
      .set(auth())
      .expect(200);
  });

  // ─── Replace dependencies (set again) ────────────────────────────────────

  it('replaces all dependencies when set is called again', async () => {
    // A currently depends on C only (B was removed above)
    // Set to depend only on D
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA}/dependencies`)
      .set(auth())
      .send({ dependsOnIds: [monitorD] })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorA}/dependencies`)
      .set(auth())
      .expect(200);

    const depIds = res.body.map((d: { dependsOnId: string }) => d.dependsOnId);
    expect(depIds).not.toContain(monitorB);
    expect(depIds).not.toContain(monitorC);
    expect(depIds).toContain(monitorD);
  });

  it('clears all dependencies when set with empty array', async () => {
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA}/dependencies`)
      .set(auth())
      .send({ dependsOnIds: [] })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorA}/dependencies`)
      .set(auth())
      .expect(200);

    expect(res.body).toHaveLength(0);
  });

  // ─── Non-existent monitor handling ───────────────────────────────────────

  it('returns 404 when setting dependencies for non-existent monitor', async () => {
    await request(app.getHttpServer())
      .post('/v1/monitors/non-existent-id/dependencies')
      .set(auth())
      .send({ dependsOnIds: [] })
      .expect(404);
  });

  it('returns 404 when getting dependencies for non-existent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/non-existent-id/dependencies')
      .set(auth())
      .expect(404);
  });

  it('returns 404 when setting dependencies with non-existent dependsOnId', async () => {
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA}/dependencies`)
      .set(auth())
      .send({ dependsOnIds: ['non-existent-dep-id'] })
      .expect(404);
  });
});
