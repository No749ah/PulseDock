/**
 * Integration tests: V2 Search endpoint.
 *
 * Covers:
 *   GET /v2/search — paginated flat search with types filter + sortBy/sortDir
 *
 * Validates: auth guard, envelope shape, pagination meta, entityType field,
 *   types filter (single + multi + invalid), sort by updatedAt + title,
 *   user isolation, empty results, page-beyond-total.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('GET /v2/search (integration)', () => {
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

    // Seed a monitor
    await request(app.getHttpServer())
      .post('/v1/monitors')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        name: 'V2Search Monitor Alpha',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 300,
        timeoutMs: 10000,
      })
      .expect(201);

    // Seed an incident
    await request(app.getHttpServer())
      .post('/v1/incidents')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        title: 'V2Search Incident Beta',
        severity: 'MEDIUM',
        description: 'Search integration test incident',
      })
      .expect(201);
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await destroyTestApp(app);
  }, 15000);

  // ─── Auth guard ─────────────────────────────────────────────────────────

  it('rejects unauthenticated requests with 401', async () => {
    await request(app.getHttpServer())
      .get('/v2/search?q=test')
      .expect(401);
  });

  // ─── Envelope shape ──────────────────────────────────────────────────────

  it('returns { data, meta } envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/search?q=V2Search')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

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

  it('each result item has required fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/search?q=V2Search')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(res.body.data.length).toBeGreaterThan(0);
    const item = res.body.data[0] as Record<string, unknown>;
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('type');
    expect(item).toHaveProperty('entityType');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('subtitle');
    expect(item).toHaveProperty('url');
  });

  it('finds both monitor and incident in flat list', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/search?q=V2Search')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    const entityTypes = (res.body.data as { entityType: string }[]).map(d => d.entityType);
    expect(entityTypes).toContain('monitor');
    expect(entityTypes).toContain('incident');
  });

  // ─── Empty / short query ─────────────────────────────────────────────────

  it('returns empty data for query shorter than 2 chars', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/search?q=x')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });

  it('returns empty data for non-matching query', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/search?q=zzznomatch9999xyz')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });

  // ─── types filter ────────────────────────────────────────────────────────

  it('types=monitors only returns monitors', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/search?q=V2Search&types=monitors')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    const entityTypes = (res.body.data as { entityType: string }[]).map(d => d.entityType);
    expect(entityTypes.every(t => t === 'monitor')).toBe(true);
  });

  it('types=incidents only returns incidents', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/search?q=V2Search&types=incidents')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    const entityTypes = (res.body.data as { entityType: string }[]).map(d => d.entityType);
    expect(entityTypes.every(t => t === 'incident')).toBe(true);
  });

  it('types=monitors,incidents returns both entity types only', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/search?q=V2Search&types=monitors,incidents')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    const entityTypes = new Set((res.body.data as { entityType: string }[]).map(d => d.entityType));
    expect(entityTypes.has('monitor')).toBe(true);
    expect(entityTypes.has('incident')).toBe(true);
    expect(entityTypes.has('status_page')).toBe(false);
    expect(entityTypes.has('version')).toBe(false);
  });

  it('returns 400 for invalid type value', async () => {
    await request(app.getHttpServer())
      .get('/v2/search?q=test&types=monitors,badtype')
      .set({ Authorization: `Bearer ${token}` })
      .expect(400);
  });

  // ─── Pagination ──────────────────────────────────────────────────────────

  it('meta.page defaults to 1', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/search?q=V2Search')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(res.body.meta.page).toBe(1);
  });

  it('meta.limit defaults to 20', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/search?q=V2Search')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(res.body.meta.limit).toBe(20);
  });

  it('page beyond total returns empty data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/search?q=V2Search&page=999&limit=20')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.page).toBe(999);
  });

  it('limit=1 returns at most 1 result', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/search?q=V2Search&limit=1')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(res.body.data.length).toBeLessThanOrEqual(1);
  });

  // ─── Sort ────────────────────────────────────────────────────────────────

  it('sortBy=title&sortDir=asc returns results in alphabetical order', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/search?q=V2Search&sortBy=title&sortDir=asc')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    const titles = (res.body.data as { title: string }[]).map(d => d.title);
    if (titles.length > 1) {
      expect(titles[0].localeCompare(titles[1])).toBeLessThanOrEqual(0);
    }
  });

  it('sortBy=title&sortDir=desc returns results in reverse alphabetical order', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/search?q=V2Search&sortBy=title&sortDir=desc')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    const titles = (res.body.data as { title: string }[]).map(d => d.title);
    if (titles.length > 1) {
      expect(titles[0].localeCompare(titles[1])).toBeGreaterThanOrEqual(0);
    }
  });

  // ─── User isolation ──────────────────────────────────────────────────────

  it('does not leak results to other users', async () => {
    const other = await createTestUser(prisma, module);
    try {
      const res = await request(app.getHttpServer())
        .get('/v2/search?q=V2Search')
        .set({ Authorization: `Bearer ${other.token}` })
        .expect(200);

      const titles = (res.body.data as { title: string }[]).map(d => d.title);
      expect(titles.some(t => t.includes('V2Search Monitor Alpha'))).toBe(false);
      expect(titles.some(t => t.includes('V2Search Incident Beta'))).toBe(false);
    } finally {
      await cleanupTestUser(prisma, other.user.id);
    }
  });
});
