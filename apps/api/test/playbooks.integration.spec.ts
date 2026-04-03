/**
 * Integration tests: Incident Playbooks against a real PostgreSQL database.
 *
 * Covers: CRUD lifecycle, step marking, monitor attachment, incident playbook
 * retrieval (snapshot vs live), auth guard (401), user isolation (404/403).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Playbooks (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  let userA: { id: string; email: string };
  let tokenA: string;
  let userB: { id: string; email: string };
  let tokenB: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    ({ user: userA, token: tokenA } = await createTestUser(prisma, module));
    ({ user: userB, token: tokenB } = await createTestUser(prisma, module));
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userA.id);
    await cleanupTestUser(prisma, userB.id);
    await destroyTestApp(app);
  }, 15000);

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('GET /v1/playbooks → 401 without token', async () => {
    await request(app.getHttpServer()).get('/v1/playbooks').expect(401);
  });

  it('POST /v1/playbooks → 401/403 without token', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/playbooks')
      .send({ name: 'test', steps: [{ id: 's1', title: 'Step 1', type: 'check' }] });
    expect([401, 403]).toContain(res.status);
  });

  // ─── Empty list ──────────────────────────────────────────────────────────

  it('GET /v1/playbooks → returns empty array for new user', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/playbooks')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  // ─── Create ──────────────────────────────────────────────────────────────

  let playbookId: string;

  it('POST /v1/playbooks → creates playbook with steps', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/playbooks')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Database Outage Response',
        description: 'Steps to handle a DB outage',
        steps: [
          { id: 'step-1', title: 'Check DB health', description: 'Run health query', type: 'check' },
          { id: 'step-2', title: 'Notify team', description: 'Ping on-call', type: 'notify' },
          { id: 'step-3', title: 'Failover', description: 'Switch to replica', type: 'runbook' },
        ],
        forSeverities: ['CRITICAL', 'HIGH'],
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Database Outage Response');
    expect(res.body.description).toBe('Steps to handle a DB outage');
    expect(Array.isArray(res.body.steps)).toBe(true);
    expect(res.body.steps).toHaveLength(3);
    expect(res.body.forSeverities).toEqual(['CRITICAL', 'HIGH']);
    playbookId = res.body.id;
  });

  it('POST /v1/playbooks → rejects playbook with 0 steps', async () => {
    await request(app.getHttpServer())
      .post('/v1/playbooks')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Empty', steps: [] })
      .expect(400);
  });

  // ─── List ────────────────────────────────────────────────────────────────

  it('GET /v1/playbooks → lists created playbook', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/playbooks')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const found = res.body.find((p: { id: string }) => p.id === playbookId);
    expect(found).toBeDefined();
    expect(found._count?.monitors).toBe(0);
  });

  // ─── Get single ──────────────────────────────────────────────────────────

  it('GET /v1/playbooks/:id → returns full playbook', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/playbooks/${playbookId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body.id).toBe(playbookId);
    expect(res.body.steps).toHaveLength(3);
    expect(Array.isArray(res.body.monitors)).toBe(true);
  });

  it('GET /v1/playbooks/:id → 404 for non-existent id', async () => {
    await request(app.getHttpServer())
      .get('/v1/playbooks/does-not-exist')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });

  // ─── Update ──────────────────────────────────────────────────────────────

  it('PATCH /v1/playbooks/:id → updates name and steps', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/playbooks/${playbookId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'DB Outage Response (Updated)',
        steps: [
          { id: 'step-1', title: 'Check DB health', type: 'check' },
          { id: 'step-2', title: 'Notify team', type: 'notify' },
          { id: 'step-3', title: 'Failover', type: 'runbook' },
          { id: 'step-4', title: 'Post-mortem', type: 'check' },
        ],
        forSeverities: ['CRITICAL'],
      })
      .expect(200);
    expect(res.body.name).toBe('DB Outage Response (Updated)');
    expect(res.body.steps).toHaveLength(4);
    expect(res.body.forSeverities).toEqual(['CRITICAL']);
  });

  // ─── User isolation ──────────────────────────────────────────────────────

  it('GET /v1/playbooks/:id → user B cannot see user A playbook (404)', async () => {
    await request(app.getHttpServer())
      .get(`/v1/playbooks/${playbookId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('PATCH /v1/playbooks/:id → user B cannot update user A playbook (404)', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/playbooks/${playbookId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Hijacked', steps: [{ id: 's1', title: 'x', type: 'check' }] })
      .expect(404);
  });

  it('DELETE /v1/playbooks/:id → user B cannot delete user A playbook (404)', async () => {
    await request(app.getHttpServer())
      .delete(`/v1/playbooks/${playbookId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  // ─── Monitor attachment ──────────────────────────────────────────────────

  let monitorId: string;

  it('POST /v1/monitors/:id/playbook → attaches playbook to monitor', async () => {
    // Create a monitor for user A
    const monRes = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Playbook Test Monitor', type: 'HTTP', target: 'https://example.com', intervalSec: 300 })
      .expect(201);
    monitorId = monRes.body.id;

    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/playbook`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ playbookId });
    expect([200, 201]).toContain(res.status);
    expect(res.body.playbookId).toBe(playbookId);
  });

  it('GET /v1/playbooks/:id → shows 1 attached monitor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/playbooks/${playbookId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body._count.monitors).toBe(1);
    expect(res.body.monitors[0].id).toBe(monitorId);
  });

  it('POST /v1/monitors/:id/playbook → detaches playbook (null playbookId)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/playbook`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ playbookId: null });
    expect([200, 201]).toContain(res.status);
    expect(res.body.playbookId).toBeNull();
  });

  it('POST /v1/monitors/:id/playbook → 404 for non-existent monitor', async () => {
    await request(app.getHttpServer())
      .post('/v1/monitors/does-not-exist/playbook')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ playbookId })
      .expect(404);
  });

  // ─── Incident playbook retrieval ─────────────────────────────────────────

  it('GET /v1/incidents/:id/playbook → returns none when no playbook attached', async () => {
    // Create incident with no playbook
    const incRes = await request(app.getHttpServer())
      .post('/v1/incidents')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Test Incident', severity: 'LOW' })
      .expect(201);
    const incidentId = incRes.body.id;

    const res = await request(app.getHttpServer())
      .get(`/v1/incidents/${incidentId}/playbook`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body.source).toBe('none');
    expect(res.body.steps).toEqual([]);
    expect(res.body.playbookId).toBeNull();

    // Cleanup
    await request(app.getHttpServer())
      .delete(`/v1/incidents/${incidentId}`)
      .set('Authorization', `Bearer ${tokenA}`);
  });

  // ─── Delete ──────────────────────────────────────────────────────────────

  it('DELETE /v1/playbooks/:id → deletes playbook', async () => {
    await request(app.getHttpServer())
      .delete(`/v1/playbooks/${playbookId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    // Verify gone
    await request(app.getHttpServer())
      .get(`/v1/playbooks/${playbookId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });

  it('DELETE /v1/playbooks/:id → 404 for already-deleted playbook', async () => {
    await request(app.getHttpServer())
      .delete(`/v1/playbooks/${playbookId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });
});
