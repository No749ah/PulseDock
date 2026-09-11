/**
 * Integration tests: V2 Incidents & Deployments endpoints.
 *
 * Covers:
 *   GET /v2/incidents    — paginated list with status/severity/search/sort filtering
 *   GET /v2/deployments  — paginated list with service/environment/status/search filtering
 *
 * Validates: auth guard, pagination meta, user isolation, filter narrowing,
 * sortDir, response shape including derived fields (updateCount, monitorCount).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('V2 Incidents & Deployments (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let token2: string;
  let userId2: string;

  let incidentHighId: string;
  let incidentLowId: string;
  let deployApiId: string;
  let deployWebId: string;

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

    // Create incidents for user 1 via Prisma (avoid throttle)
    const inc1 = await prisma.incident.create({
      data: {
        userId,
        title: 'Critical DB outage',
        status: 'INVESTIGATING',
        severity: 'CRITICAL',
        autoCreated: false,
      },
    });
    incidentHighId = inc1.id;

    const inc2 = await prisma.incident.create({
      data: {
        userId,
        title: 'Minor UI glitch',
        status: 'RESOLVED',
        severity: 'LOW',
        resolvedAt: new Date(),
        autoCreated: false,
      },
    });
    incidentLowId = inc2.id;

    // Add update to inc1 so updateCount is non-zero
    await prisma.incidentUpdate.create({
      data: {
        incidentId: inc1.id,
        body: 'Initial investigation',
        status: 'INVESTIGATING',
      },
    });

    // Create incident for user 2 (isolation)
    await prisma.incident.create({
      data: {
        userId: userId2,
        title: 'User2 Incident',
        status: 'INVESTIGATING',
        severity: 'HIGH',
        autoCreated: false,
      },
    });

    // Create deployments for user 1
    const dep1 = await prisma.deploymentEvent.create({
      data: {
        userId,
        service: 'pulsedock-api',
        environment: 'production',
        version: 'v2.5.0',
        status: 'SUCCESS',
        deployedBy: 'ci-bot',
        commitSha: 'abc123',
        commitMessage: 'feat: add v2 endpoints',
        branch: 'main',
        monitorIds: [],
      },
    });
    deployApiId = dep1.id;

    const dep2 = await prisma.deploymentEvent.create({
      data: {
        userId,
        service: 'pulsedock-web',
        environment: 'staging',
        version: 'v2.5.0-rc1',
        status: 'FAILED',
        deployedBy: 'ci-bot',
        branch: 'dev',
        monitorIds: [],
      },
    });
    deployWebId = dep2.id;

    // User 2 deployment (isolation)
    await prisma.deploymentEvent.create({
      data: {
        userId: userId2,
        service: 'other-service',
        environment: 'production',
        status: 'SUCCESS',
        monitorIds: [],
      },
    });
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app);
  }, 15000);

  // ─── Incidents ───

  describe('GET /v2/incidents', () => {
    it('should require auth', async () => {
      await request(app.getHttpServer())
        .get('/v2/incidents')
        .expect(401);
    });

    it('should return paginated incident list', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/incidents')
        .set(auth())
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      const meta = res.body.meta;
      expect(meta).toMatchObject({
        page: 1,
        limit: expect.any(Number),
        total: expect.any(Number),
        pages: expect.any(Number),
      });
    });

    it('should include derived fields (updateCount, monitorCount, latestUpdateStatus)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v2/incidents?search=Critical+DB`)
        .set(auth())
        .expect(200);

      const inc = res.body.data.find((i: { id: string }) => i.id === incidentHighId);
      expect(inc).toBeDefined();
      expect(inc).toMatchObject({
        id: incidentHighId,
        title: 'Critical DB outage',
        status: 'INVESTIGATING',
        severity: 'CRITICAL',
        updateCount: 1,
        latestUpdateStatus: 'INVESTIGATING',
        monitorCount: 0,
      });
      expect(inc.createdAt).toBeDefined();
      expect(inc.updatedAt).toBeDefined();
    });

    it('should filter by status=RESOLVED', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/incidents?status=RESOLVED')
        .set(auth())
        .expect(200);

      expect(res.body.data.every((i: { status: string }) => i.status === 'RESOLVED')).toBe(true);
      const found = res.body.data.find((i: { id: string }) => i.id === incidentLowId);
      expect(found).toBeDefined();
    });

    it('should filter by severity=CRITICAL', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/incidents?severity=CRITICAL')
        .set(auth())
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.every((i: { severity: string }) => i.severity === 'CRITICAL')).toBe(true);
    });

    it('should filter by severity=LOW', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/incidents?severity=LOW')
        .set(auth())
        .expect(200);

      expect(res.body.data.every((i: { severity: string }) => i.severity === 'LOW')).toBe(true);
      const found = res.body.data.find((i: { id: string }) => i.id === incidentLowId);
      expect(found).toBeDefined();
    });

    it('should search by title', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/incidents?search=UI+glitch')
        .set(auth())
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const found = res.body.data.find((i: { id: string }) => i.id === incidentLowId);
      expect(found).toBeDefined();
    });

    it('should return empty when search has no matches', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/incidents?search=zzznomatch9999xyz')
        .set(auth())
        .expect(200);

      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta.total).toBe(0);
    });

    it('should sort by severity asc', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/incidents?sortBy=severity&sortDir=asc')
        .set(auth())
        .expect(200);

      const severities = res.body.data.map((i: { severity: string }) => i.severity);
      // Prisma sorts enum as string: CRITICAL < HIGH < LOW < MEDIUM alphabetically
      for (let i = 1; i < severities.length; i++) {
        expect(severities[i] >= severities[i - 1]).toBe(true);
      }
    });

    it('should paginate with limit=1', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/incidents?limit=1&page=1')
        .set(auth())
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.limit).toBe(1);
      expect(res.body.meta.pages).toBeGreaterThanOrEqual(2);
    });

    it('should not show user2 incidents to user1', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/incidents?search=User2+Incident')
        .set(auth())
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });

    it('should not show user1 incidents to user2', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/incidents?search=Critical+DB')
        .set(auth2())
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });

    it('should reject invalid status filter', async () => {
      await request(app.getHttpServer())
        .get('/v2/incidents?status=INVALID')
        .set(auth())
        .expect(400);
    });

    it('should reject invalid severity filter', async () => {
      await request(app.getHttpServer())
        .get('/v2/incidents?severity=EXTREME')
        .set(auth())
        .expect(400);
    });

    it('should reject invalid sortBy field', async () => {
      await request(app.getHttpServer())
        .get('/v2/incidents?sortBy=hackField')
        .set(auth())
        .expect(400);
    });
  });

  // ─── Deployments ───

  describe('GET /v2/deployments', () => {
    it('should require auth', async () => {
      await request(app.getHttpServer())
        .get('/v2/deployments')
        .expect(401);
    });

    it('should return paginated deployment list', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/deployments')
        .set(auth())
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      const meta = res.body.meta;
      expect(meta.page).toBe(1);
      expect(meta.total).toBeGreaterThanOrEqual(2);
    });

    it('should include all expected fields', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v2/deployments?service=pulsedock-api`)
        .set(auth())
        .expect(200);

      const dep = res.body.data.find((d: { id: string }) => d.id === deployApiId);
      expect(dep).toBeDefined();
      expect(dep).toMatchObject({
        id: deployApiId,
        service: 'pulsedock-api',
        environment: 'production',
        version: 'v2.5.0',
        status: 'SUCCESS',
        deployedBy: 'ci-bot',
        commitSha: 'abc123',
        commitMessage: 'feat: add v2 endpoints',
        branch: 'main',
        suppressAlerts: false,
        monitorCount: 0,
      });
      expect(dep.createdAt).toBeDefined();
      expect(dep.updatedAt).toBeDefined();
    });

    it('should filter by service', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/deployments?service=pulsedock-api')
        .set(auth())
        .expect(200);

      expect(res.body.data.every((d: { service: string }) => d.service === 'pulsedock-api')).toBe(true);
      expect(res.body.data.find((d: { id: string }) => d.id === deployApiId)).toBeDefined();
    });

    it('should filter by environment=staging', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/deployments?environment=staging')
        .set(auth())
        .expect(200);

      expect(res.body.data.every((d: { environment: string }) => d.environment === 'staging')).toBe(true);
      const found = res.body.data.find((d: { id: string }) => d.id === deployWebId);
      expect(found).toBeDefined();
    });

    it('should filter by status=FAILED', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/deployments?status=FAILED')
        .set(auth())
        .expect(200);

      expect(res.body.data.every((d: { status: string }) => d.status === 'FAILED')).toBe(true);
      expect(res.body.data.find((d: { id: string }) => d.id === deployWebId)).toBeDefined();
    });

    it('should filter by status=SUCCESS', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/deployments?status=SUCCESS')
        .set(auth())
        .expect(200);

      expect(res.body.data.every((d: { status: string }) => d.status === 'SUCCESS')).toBe(true);
      expect(res.body.data.find((d: { id: string }) => d.id === deployApiId)).toBeDefined();
    });

    it('should search by version', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/deployments?search=v2.5.0')
        .set(auth())
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should search by commitMessage', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/deployments?search=add+v2+endpoints')
        .set(auth())
        .expect(200);

      const found = res.body.data.find((d: { id: string }) => d.id === deployApiId);
      expect(found).toBeDefined();
    });

    it('should return empty for unmatched search', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/deployments?search=zzznomatch9999abc')
        .set(auth())
        .expect(200);

      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta.total).toBe(0);
    });

    it('should sort by service asc', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/deployments?sortBy=service&sortDir=asc')
        .set(auth())
        .expect(200);

      const services = res.body.data.map((d: { service: string }) => d.service);
      for (let i = 1; i < services.length; i++) {
        expect(services[i] >= services[i - 1]).toBe(true);
      }
    });

    it('should paginate with limit=1', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/deployments?limit=1&page=1')
        .set(auth())
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.pages).toBeGreaterThanOrEqual(2);
    });

    it('should not expose user2 deployments to user1', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/deployments?service=other-service')
        .set(auth())
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });

    it('should not expose user1 deployments to user2', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/deployments?service=pulsedock-api')
        .set(auth2())
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });

    it('should reject invalid status filter', async () => {
      await request(app.getHttpServer())
        .get('/v2/deployments?status=BROKEN')
        .set(auth())
        .expect(400);
    });

    it('should reject invalid sortBy field', async () => {
      await request(app.getHttpServer())
        .get('/v2/deployments?sortBy=__proto__')
        .set(auth())
        .expect(400);
    });
  });
});
