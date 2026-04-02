/**
 * Integration tests: Deployment Events lifecycle against a real PostgreSQL database.
 *
 * Tests create → list → get → update → delete lifecycle, token generation,
 * webhook receiver, summary, listByMonitor, and auth/user-isolation guards.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Deployments lifecycle (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let monitorId: string;
  let deploymentId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const testUser = await createTestUser(prisma, module);
    token = testUser.token;
    userId = testUser.user.id;

    // Create a monitor to link to deployments
    const monRes = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        name: 'Deployment Test Monitor',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 300,
      })
      .expect(201);
    monitorId = monRes.body.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await destroyTestApp(app);
  }, 15000);

  const authHeader = () => ({ Authorization: `Bearer ${token}` });

  // ─── Create ───

  it('should create a deployment event with defaults', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set(authHeader())
      .send({
        service: 'api-gateway',
        version: 'v1.2.3',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      service: 'api-gateway',
      version: 'v1.2.3',
      environment: 'production',
      status: 'STARTED',
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.userId).toBe(userId);
    deploymentId = res.body.id;
  });

  it('should create a deployment with all optional fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set(authHeader())
      .send({
        service: 'web-frontend',
        version: 'v2.0.0',
        environment: 'staging',
        status: 'SUCCESS',
        deployedBy: 'github-actions',
        commitSha: 'abc123def456',
        commitMessage: 'feat: new dashboard',
        branch: 'main',
        sourceUrl: 'https://github.com/org/repo/actions/runs/123',
        notes: 'Deployed via CI',
        durationMs: 45000,
        monitorIds: [monitorId],
        suppressAlerts: false,
      })
      .expect(201);

    expect(res.body).toMatchObject({
      service: 'web-frontend',
      version: 'v2.0.0',
      environment: 'staging',
      status: 'SUCCESS',
      deployedBy: 'github-actions',
      commitSha: 'abc123def456',
    });
    expect(res.body.monitorIds).toContain(monitorId);
  });

  it('should reject deployment without required service field', async () => {
    await request(app.getHttpServer())
      .post('/v1/deployments')
      .set(authHeader())
      .send({ version: 'v1.0.0' })
      .expect(400);
  });

  // ─── List ───

  it('should list deployments for authenticated user', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/deployments')
      .set(authHeader())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    // All belong to the current user
    for (const d of res.body) {
      expect(d.userId).toBe(userId);
    }
  });

  it('should filter deployments by service', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/deployments?service=api-gateway')
      .set(authHeader())
      .expect(200);

    expect(res.body.every((d: { service: string }) => d.service === 'api-gateway')).toBe(true);
  });

  it('should filter deployments by environment', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/deployments?environment=staging')
      .set(authHeader())
      .expect(200);

    expect(res.body.every((d: { environment: string }) => d.environment === 'staging')).toBe(true);
  });

  it('should filter deployments by status', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/deployments?status=SUCCESS')
      .set(authHeader())
      .expect(200);

    expect(res.body.every((d: { status: string }) => d.status === 'SUCCESS')).toBe(true);
  });

  it('should require auth to list deployments', async () => {
    await request(app.getHttpServer()).get('/v1/deployments').expect(401);
  });

  // ─── Get ───

  it('should get a single deployment by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/deployments/${deploymentId}`)
      .set(authHeader())
      .expect(200);

    expect(res.body).toMatchObject({
      id: deploymentId,
      service: 'api-gateway',
    });
  });

  it('should return 404 for non-existent deployment', async () => {
    await request(app.getHttpServer())
      .get('/v1/deployments/nonexistent-id-xyz')
      .set(authHeader())
      .expect(404);
  });

  // ─── Update ───

  it('should update a deployment status', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/deployments/${deploymentId}`)
      .set(authHeader())
      .send({ status: 'SUCCESS', durationMs: 60000 })
      .expect(200);

    expect(res.body).toMatchObject({
      id: deploymentId,
      status: 'SUCCESS',
      durationMs: 60000,
    });
  });

  it('should update deployment notes', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/deployments/${deploymentId}`)
      .set(authHeader())
      .send({ notes: 'Deployment successful, all checks green' })
      .expect(200);

    expect(res.body.notes).toBe('Deployment successful, all checks green');
  });

  // ─── Summary ───

  it('should return deployment summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/deployments/summary')
      .set(authHeader())
      .expect(200);

    expect(res.body).toMatchObject({
      days: 30,
      total: expect.any(Number),
      byStatus: expect.any(Object),
    });
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(typeof res.body.successRate === 'number' || res.body.successRate === null).toBe(true);
    expect(Array.isArray(res.body.topServices)).toBe(true);
    expect(Array.isArray(res.body.environments)).toBe(true);
  });

  it('should return summary with custom days parameter', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/deployments/summary?days=7')
      .set(authHeader())
      .expect(200);

    expect(res.body.days).toBe(7);
  });

  // ─── listByMonitor ───

  it('should list deployments linked to a monitor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/deployments/by-monitor/${monitorId}`)
      .set(authHeader())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // At least the deployment we created with the monitorId should appear
    expect(res.body.some((d: { monitorIds: string[] }) => d.monitorIds.includes(monitorId))).toBe(true);
  });

  it('should return empty array for monitor with no deployments', async () => {
    // Create another monitor not linked to any deployment
    const monRes = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authHeader())
      .send({ name: 'Unlinked Monitor', type: 'HTTP', target: 'https://example.org', intervalSec: 300 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/v1/deployments/by-monitor/${monRes.body.id}`)
      .set(authHeader())
      .expect(200);

    expect(res.body).toEqual([]);
  });

  // ─── Deploy Token ───

  it('should generate a deploy token', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/deployments/token/generate')
      .set(authHeader())
      .expect(201);

    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token).toMatch(/^pd_deploy_/);
  });

  it('should accept a deployment via webhook using deploy token', async () => {
    // Generate a token first
    const tokenRes = await request(app.getHttpServer())
      .post('/v1/deployments/token/generate')
      .set(authHeader())
      .expect(201);

    const deployToken = tokenRes.body.token;

    const res = await request(app.getHttpServer())
      .post('/v1/public/deployments/receive')
      .set({ 'x-deploy-token': deployToken })
      .send({
        service: 'webhook-service',
        version: 'v3.1.0',
        environment: 'production',
        status: 'SUCCESS',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      service: 'webhook-service',
      version: 'v3.1.0',
      status: 'SUCCESS',
      userId,
    });
  });

  it('should reject webhook with invalid deploy token', async () => {
    await request(app.getHttpServer())
      .post('/v1/public/deployments/receive')
      .set({ 'x-deploy-token': 'pd_deploy_invalid_token_xyz' })
      .send({ service: 'some-service' })
      .expect(401);
  });

  // ─── User Isolation ───

  it('should not expose deployments of another user', async () => {
    const otherUser = await createTestUser(prisma, module);

    // Create a deployment as the other user
    const otherDeploy = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set({ Authorization: `Bearer ${otherUser.token}` })
      .send({ service: 'other-users-service', version: 'v9.9.9' })
      .expect(201);

    // Original user should not see other user's deployment
    const listRes = await request(app.getHttpServer())
      .get('/v1/deployments')
      .set(authHeader())
      .expect(200);

    const ids = listRes.body.map((d: { id: string }) => d.id);
    expect(ids).not.toContain(otherDeploy.body.id);

    // Direct get should also fail
    await request(app.getHttpServer())
      .get(`/v1/deployments/${otherDeploy.body.id}`)
      .set(authHeader())
      .expect(404);

    await cleanupTestUser(prisma, otherUser.user.id);
  });

  it('should not allow patching another user deployment', async () => {
    const otherUser = await createTestUser(prisma, module);
    const otherDeploy = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set({ Authorization: `Bearer ${otherUser.token}` })
      .send({ service: 'protected-svc', version: 'v1.0.0' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/deployments/${otherDeploy.body.id}`)
      .set(authHeader())
      .send({ status: 'FAILED' })
      .expect(404);

    await cleanupTestUser(prisma, otherUser.user.id);
  });

  // ─── Delete ───

  it('should delete a deployment event', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set(authHeader())
      .send({ service: 'to-be-deleted', version: 'v0.0.1' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/deployments/${createRes.body.id}`)
      .set(authHeader())
      .expect(204);

    // Verify it's gone
    await request(app.getHttpServer())
      .get(`/v1/deployments/${createRes.body.id}`)
      .set(authHeader())
      .expect(404);
  });

  it('should not allow deleting another user deployment', async () => {
    const otherUser = await createTestUser(prisma, module);
    const otherDeploy = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set({ Authorization: `Bearer ${otherUser.token}` })
      .send({ service: 'other-delete-test', version: 'v1.0.0' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/deployments/${otherDeploy.body.id}`)
      .set(authHeader())
      .expect(404);

    await cleanupTestUser(prisma, otherUser.user.id);
  });
});
