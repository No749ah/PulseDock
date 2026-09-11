/**
 * Integration tests: Incident lifecycle against a real PostgreSQL database.
 *
 * Tests create → read → update → timeline updates → delete,
 * plus ownership isolation and insights endpoint.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Incidents lifecycle (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;

  // Keep track of a monitor to link to incidents
  let monitorId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const testUser = await createTestUser(prisma, module);
    token = testUser.token;
    userId = testUser.user.id;

    // Create a monitor to link to incidents
    const monitorRes = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        name: 'Incident Test Monitor',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 300,
      })
      .expect(201);

    monitorId = monitorRes.body.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await destroyTestApp(app);
  }, 15000);

  const authHeader = () => ({ Authorization: `Bearer ${token}` });

  // ─── Create ───

  it('should create an incident', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/incidents')
      .set(authHeader())
      .send({
        title: 'Test Incident',
        description: 'Something went wrong',
        severity: 'HIGH',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      title: 'Test Incident',
      description: 'Something went wrong',
      severity: 'HIGH',
      status: 'INVESTIGATING',
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.userId).toBe(userId);
  });

  it('should create an incident with linked monitors', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/incidents')
      .set(authHeader())
      .send({
        title: 'Incident With Monitor',
        severity: 'CRITICAL',
        monitorIds: [monitorId],
      })
      .expect(201);

    expect(res.body.title).toBe('Incident With Monitor');
    expect(res.body.monitors).toBeDefined();
    expect(res.body.monitors.length).toBe(1);
    expect(res.body.monitors[0].monitorId).toBe(monitorId);
  });

  it('should reject incident without title', async () => {
    await request(app.getHttpServer())
      .post('/v1/incidents')
      .set(authHeader())
      .send({ description: 'No title provided' })
      .expect(400);
  });

  // ─── List ───

  it('should list incidents for the user', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/incidents')
      .set(authHeader())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);

    // Should have standard fields
    const incident = res.body[0];
    expect(incident).toHaveProperty('id');
    expect(incident).toHaveProperty('title');
    expect(incident).toHaveProperty('status');
    expect(incident).toHaveProperty('severity');
  });

  // ─── Get single ───

  it('should get a single incident by ID', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/incidents')
      .set(authHeader())
      .send({ title: 'Get By ID Test' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/v1/incidents/${created.body.id}`)
      .set(authHeader())
      .expect(200);

    expect(res.body.id).toBe(created.body.id);
    expect(res.body.title).toBe('Get By ID Test');
    expect(res.body.updates).toBeDefined();
    expect(Array.isArray(res.body.updates)).toBe(true);
  });

  it('should return 404 for non-existent incident', async () => {
    await request(app.getHttpServer())
      .get('/v1/incidents/nonexistent-id-12345')
      .set(authHeader())
      .expect(404);
  });

  // ─── Update ───

  it('should update incident status and severity', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/incidents')
      .set(authHeader())
      .send({ title: 'Update Test', severity: 'LOW' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/v1/incidents/${created.body.id}`)
      .set(authHeader())
      .send({
        status: 'IDENTIFIED',
        severity: 'HIGH',
      })
      .expect(200);

    expect(res.body.status).toBe('IDENTIFIED');
    expect(res.body.severity).toBe('HIGH');
  });

  it('should resolve an incident and set resolvedAt', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/incidents')
      .set(authHeader())
      .send({ title: 'Resolve Test' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/v1/incidents/${created.body.id}`)
      .set(authHeader())
      .send({ status: 'RESOLVED' })
      .expect(200);

    expect(res.body.status).toBe('RESOLVED');
    expect(res.body.resolvedAt).toBeDefined();
    expect(res.body.resolvedAt).not.toBeNull();
  });

  // ─── Timeline updates ───

  it('should add a timeline update to an incident', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/incidents')
      .set(authHeader())
      .send({ title: 'Timeline Test' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/v1/incidents/${created.body.id}/updates`)
      .set(authHeader())
      .send({
        body: 'We identified the root cause',
        status: 'IDENTIFIED',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      body: 'We identified the root cause',
      status: 'IDENTIFIED',
      incidentId: created.body.id,
    });
    expect(res.body.id).toBeDefined();

    // Verify the parent incident status was also updated
    const incident = await request(app.getHttpServer())
      .get(`/v1/incidents/${created.body.id}`)
      .set(authHeader())
      .expect(200);

    expect(incident.body.status).toBe('IDENTIFIED');
    expect(incident.body.updates.length).toBeGreaterThanOrEqual(2); // initial + our update
  });

  it('should add multiple timeline updates', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/incidents')
      .set(authHeader())
      .send({ title: 'Multi Update Test' })
      .expect(201);

    // Add progression of updates
    await request(app.getHttpServer())
      .post(`/v1/incidents/${created.body.id}/updates`)
      .set(authHeader())
      .send({ body: 'Investigating the issue', status: 'INVESTIGATING' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/incidents/${created.body.id}/updates`)
      .set(authHeader())
      .send({ body: 'Found the root cause', status: 'IDENTIFIED' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/incidents/${created.body.id}/updates`)
      .set(authHeader())
      .send({ body: 'Fix deployed, monitoring', status: 'MONITORING' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/incidents/${created.body.id}/updates`)
      .set(authHeader())
      .send({ body: 'All clear', status: 'RESOLVED' })
      .expect(201);

    // Verify full timeline
    const incident = await request(app.getHttpServer())
      .get(`/v1/incidents/${created.body.id}`)
      .set(authHeader())
      .expect(200);

    expect(incident.body.status).toBe('RESOLVED');
    expect(incident.body.resolvedAt).not.toBeNull();
    // initial "Incident created" + 4 updates
    expect(incident.body.updates.length).toBeGreaterThanOrEqual(5);
  });

  // ─── Delete ───

  it('should delete an incident', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/incidents')
      .set(authHeader())
      .send({ title: 'To Delete' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/incidents/${created.body.id}`)
      .set(authHeader())
      .expect(204);

    // Verify it's gone
    await request(app.getHttpServer())
      .get(`/v1/incidents/${created.body.id}`)
      .set(authHeader())
      .expect(404);
  });

  // ─── Ownership isolation ───

  it('should not allow user2 to access user1 incidents', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/incidents')
      .set(authHeader())
      .send({ title: 'User1 Private Incident' })
      .expect(201);

    const user2 = await createTestUser(prisma, module, { email: `incident-user2-${Date.now()}@integration.test` });

    // User2 should not see user1's incident in list
    const list = await request(app.getHttpServer())
      .get('/v1/incidents')
      .set({ Authorization: `Bearer ${user2.token}` })
      .expect(200);

    const found = list.body.find((inc: { id: string }) => inc.id === created.body.id);
    expect(found).toBeUndefined();

    // User2 should not access user1's incident directly
    await request(app.getHttpServer())
      .get(`/v1/incidents/${created.body.id}`)
      .set({ Authorization: `Bearer ${user2.token}` })
      .expect(404);

    // User2 should not update user1's incident
    const patchRes = await request(app.getHttpServer())
      .patch(`/v1/incidents/${created.body.id}`)
      .set({ Authorization: `Bearer ${user2.token}` })
      .send({ title: 'Hacked' });

    expect([403, 404]).toContain(patchRes.status);

    // User2 should not delete user1's incident
    const deleteRes = await request(app.getHttpServer())
      .delete(`/v1/incidents/${created.body.id}`)
      .set({ Authorization: `Bearer ${user2.token}` });

    expect([403, 404]).toContain(deleteRes.status);

    await cleanupTestUser(prisma, user2.user.id);
  });

  // ─── Insights ───

  it('should return incident insights', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/incidents/insights')
      .set(authHeader())
      .expect(200);

    // The insights endpoint should return analytics data
    expect(res.body).toBeDefined();
    expect(typeof res.body).toBe('object');
  });

  it('should return insights with custom period', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/incidents/insights?days=30')
      .set(authHeader())
      .expect(200);

    expect(res.body).toBeDefined();
  });

  // ─── Auth ───

  it('should reject unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .get('/v1/incidents')
      .expect(401);
  });
});
