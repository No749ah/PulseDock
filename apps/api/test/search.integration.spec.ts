/**
 * Integration tests: Global search endpoint.
 *
 * Tests the /v1/search endpoint against a real PostgreSQL database
 * with live monitors, incidents, and status pages.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Global Search (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const testUser = await createTestUser(prisma, module);
    token = testUser.token;
    userId = testUser.user.id;

    // Create a monitor so search has something to find
    await request(app.getHttpServer())
      .post('/v1/monitors')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        name: 'Searchable Monitor XYZ',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 300,
        timeoutMs: 10000,
      });

    // Create an incident
    const incidentRes = await request(app.getHttpServer())
      .post('/v1/incidents')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        title: 'Searchable Incident XYZ',
        severity: 'HIGH',
        description: 'Integration test incident for search',
      });
    // Fail fast if incident creation fails so we can diagnose
    if (incidentRes.status !== 201 && incidentRes.status !== 200) {
      throw new Error(`Incident creation failed: ${incidentRes.status} ${JSON.stringify(incidentRes.body)}`);
    }
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await destroyTestApp(app);
  }, 15000);

  it('should reject unauthenticated search requests', async () => {
    await request(app.getHttpServer())
      .get('/v1/search?q=test')
      .expect(401);
  });

  it('should return empty results for short query (< 2 chars)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/search?q=a')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    // Service returns empty when query < 2 chars
    expect(res.body).toMatchObject({
      query: 'a',
      total: 0,
      monitors: [],
      incidents: [],
      status_pages: [],
      versions: [],
    });
  });

  it('should return results structure with empty query results', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/search?q=zzznotexistent9999abc')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(res.body).toMatchObject({
      query: 'zzznotexistent9999abc',
      total: 0,
      monitors: [],
      incidents: [],
      status_pages: [],
      versions: [],
    });
  });

  it('should find monitors by name', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/search?q=Searchable+Monitor')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(res.body.monitors.length).toBeGreaterThan(0);
    const found = res.body.monitors.find((m: { title: string }) =>
      m.title.includes('Searchable Monitor XYZ'),
    );
    expect(found).toBeDefined();
    expect(found).toMatchObject({
      id: expect.any(String),
      type: 'monitor',
      title: expect.stringContaining('Searchable Monitor XYZ'),
      url: expect.stringContaining('/monitors/'),
    });
  });

  it('should find incidents by title', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/search?q=Searchable+Incident')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(res.body.incidents.length).toBeGreaterThan(0);
    const found = res.body.incidents.find((i: { title: string }) =>
      i.title.includes('Searchable Incident XYZ'),
    );
    expect(found).toBeDefined();
    expect(found).toMatchObject({
      id: expect.any(String),
      type: 'incident',
      title: expect.stringContaining('Searchable Incident XYZ'),
    });
  });

  it('should respect limit parameter', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/search?q=Searchable&limit=1')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    // Each category should have at most 1 result
    expect(res.body.monitors.length).toBeLessThanOrEqual(1);
    expect(res.body.incidents.length).toBeLessThanOrEqual(1);
  });

  it('should not leak other users data', async () => {
    // Create a second user
    const other = await createTestUser(prisma, module);

    try {
      const res = await request(app.getHttpServer())
        .get('/v1/search?q=Searchable+Monitor')
        .set({ Authorization: `Bearer ${other.token}` })
        .expect(200);

      // The other user should not see the first user's monitors
      const found = res.body.monitors.find((m: { title: string }) =>
        m.title.includes('Searchable Monitor XYZ'),
      );
      expect(found).toBeUndefined();
    } finally {
      await cleanupTestUser(prisma, other.user.id);
    }
  });
});
