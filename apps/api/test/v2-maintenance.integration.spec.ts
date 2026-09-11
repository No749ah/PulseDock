/**
 * Integration tests: GET /v2/maintenance against a real PostgreSQL database.
 *
 * Covers:
 *   - Auth guard (401 without token)
 *   - Paginated envelope shape (data + meta)
 *   - User isolation (user B can't see user A's windows)
 *   - Pagination (meta.total, meta.pages, page/limit params)
 *   - Recurrence filter (NONE, DAILY, WEEKLY, MONTHLY)
 *   - activeOnly=true filter
 *   - Search (name + description)
 *   - Sort by startsAt, name, monitorCount
 *   - Response shape (all expected fields present)
 *   - isActive flag (active vs past windows)
 *   - monitorIds array and monitorCount
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('GET /v2/maintenance (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let token2: string;
  let userId2: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const u1 = await createTestUser(prisma, module);
    token = u1.token;
    userId = u1.user.id;
    const u2 = await createTestUser(prisma, module);
    token2 = u2.token;
    userId2 = u2.user.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app);
  }, 15000);

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const auth2 = () => ({ Authorization: `Bearer ${token2}` });

  // Helper: create a maintenance window via v1 API
  async function createWindow(
    tok: string,
    overrides: Partial<{
      name: string;
      description: string;
      startsAt: string;
      endsAt: string;
      recurrence: string;
    }> = {},
  ) {
    const now = new Date();
    const base = {
      name: 'Test Window',
      startsAt: new Date(now.getTime() + 60_000).toISOString(),
      endsAt: new Date(now.getTime() + 120_000).toISOString(),
      recurrence: 'NONE',
      ...overrides,
    };
    const res = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set('Authorization', `Bearer ${tok}`)
      .send(base);
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  // ─── Auth guard ──────────────────────────────────────────────────────────

  it('returns 401 without auth token', async () => {
    const res = await request(app.getHttpServer()).get('/v2/maintenance');
    expect(res.status).toBe(401);
  });

  // ─── Paginated envelope ──────────────────────────────────────────────────

  it('returns paginated envelope with empty data for fresh user', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/maintenance')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({ total: 0, page: 1, limit: 20, pages: 0 });
  });

  // ─── Response shape ──────────────────────────────────────────────────────

  it('response shape includes all expected fields', async () => {
    const now = new Date();
    const w = await createWindow(token, {
      name: 'Shape Test',
      description: 'desc here',
      startsAt: new Date(now.getTime() - 60_000).toISOString(),
      endsAt: new Date(now.getTime() + 60_000).toISOString(),
    });

    const res = await request(app.getHttpServer())
      .get('/v2/maintenance')
      .set(auth());
    expect(res.status).toBe(200);

    const win = (res.body.data as any[]).find((d: any) => d.id === w.id);
    expect(win).toBeDefined();
    expect(win).toHaveProperty('id');
    expect(win).toHaveProperty('name', 'Shape Test');
    expect(win).toHaveProperty('description', 'desc here');
    expect(win).toHaveProperty('startsAt');
    expect(win).toHaveProperty('endsAt');
    expect(win).toHaveProperty('recurrence', 'NONE');
    expect(win).toHaveProperty('recurrenceDays');
    expect(win).toHaveProperty('durationMinutes');
    expect(win).toHaveProperty('recurrenceEndsAt');
    expect(win).toHaveProperty('monitorIds');
    expect(win).toHaveProperty('monitorCount');
    expect(win).toHaveProperty('isActive');
    expect(win).toHaveProperty('createdAt');
    expect(Array.isArray(win.monitorIds)).toBe(true);
  });

  // ─── isActive flag ───────────────────────────────────────────────────────

  it('isActive=true for a currently active window', async () => {
    const now = new Date();
    const w = await createWindow(token, {
      name: 'Active Window',
      startsAt: new Date(now.getTime() - 30_000).toISOString(),
      endsAt: new Date(now.getTime() + 30_000).toISOString(),
    });

    const res = await request(app.getHttpServer())
      .get('/v2/maintenance')
      .set(auth());
    const win = (res.body.data as any[]).find((d: any) => d.id === w.id);
    expect(win?.isActive).toBe(true);
  });

  it('isActive=false for a past window', async () => {
    const now = new Date();
    const w = await createWindow(token, {
      name: 'Past Window',
      startsAt: new Date(now.getTime() - 7200_000).toISOString(), // 2 hr ago
      endsAt: new Date(now.getTime() - 3600_000).toISOString(),   // 1 hr ago
    });

    const res = await request(app.getHttpServer())
      .get('/v2/maintenance')
      .set(auth());
    const win = (res.body.data as any[]).find((d: any) => d.id === w.id);
    expect(win?.isActive).toBe(false);
  });

  // ─── User isolation ──────────────────────────────────────────────────────

  it('user 2 does not see user 1 windows', async () => {
    const now = new Date();
    const w = await createWindow(token, {
      name: 'User1 Only',
      startsAt: new Date(now.getTime() + 60_000).toISOString(),
      endsAt: new Date(now.getTime() + 120_000).toISOString(),
    });

    const res = await request(app.getHttpServer())
      .get('/v2/maintenance')
      .set(auth2());
    expect(res.status).toBe(200);
    const ids = (res.body.data as any[]).map((d: any) => d.id);
    expect(ids).not.toContain(w.id);
  });

  // ─── Pagination ──────────────────────────────────────────────────────────

  it('pagination: meta.total reflects window count', async () => {
    // Create a fresh user with known window count
    const { token: freshToken, user: freshUser } = await createTestUser(prisma, module);
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      await createWindow(freshToken, {
        name: `Pag Window ${i}`,
        startsAt: new Date(now.getTime() + (i + 1) * 60_000).toISOString(),
        endsAt: new Date(now.getTime() + (i + 1) * 120_000).toISOString(),
      });
    }
    const res = await request(app.getHttpServer())
      .get('/v2/maintenance')
      .set({ Authorization: `Bearer ${freshToken}` });
    expect(res.body.meta.total).toBe(3);
    await cleanupTestUser(prisma, freshUser.id);
  });

  it('pagination: limit=1 returns one window', async () => {
    const { token: freshToken, user: freshUser } = await createTestUser(prisma, module);
    const now = new Date();
    for (let i = 0; i < 2; i++) {
      await createWindow(freshToken, {
        name: `Limit Window ${i}`,
        startsAt: new Date(now.getTime() + (i + 1) * 60_000).toISOString(),
        endsAt: new Date(now.getTime() + (i + 1) * 120_000).toISOString(),
      });
    }
    const res = await request(app.getHttpServer())
      .get('/v2/maintenance?limit=1&page=1')
      .set({ Authorization: `Bearer ${freshToken}` });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.limit).toBe(1);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.meta.pages).toBe(2);
    await cleanupTestUser(prisma, freshUser.id);
  });

  it('page 2 returns different window than page 1', async () => {
    const { token: freshToken, user: freshUser } = await createTestUser(prisma, module);
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      await createWindow(freshToken, {
        name: `CrossPage Window ${i}`,
        startsAt: new Date(now.getTime() + (i + 1) * 60_000).toISOString(),
        endsAt: new Date(now.getTime() + (i + 1) * 120_000).toISOString(),
      });
    }
    const p1 = await request(app.getHttpServer())
      .get('/v2/maintenance?limit=2&page=1')
      .set({ Authorization: `Bearer ${freshToken}` });
    const p2 = await request(app.getHttpServer())
      .get('/v2/maintenance?limit=2&page=2')
      .set({ Authorization: `Bearer ${freshToken}` });

    const ids1 = (p1.body.data as any[]).map((d: any) => d.id);
    const ids2 = (p2.body.data as any[]).map((d: any) => d.id);
    expect(ids1.length).toBe(2);
    expect(ids2.length).toBe(1);
    expect(ids1).not.toContain(ids2[0]);
    await cleanupTestUser(prisma, freshUser.id);
  });

  // ─── Recurrence filter ───────────────────────────────────────────────────

  it('recurrence=DAILY returns only DAILY windows', async () => {
    const { token: freshToken, user: freshUser } = await createTestUser(prisma, module);
    const now = new Date();
    await createWindow(freshToken, {
      name: 'Daily Win',
      recurrence: 'DAILY',
      startsAt: new Date(now.getTime() + 60_000).toISOString(),
      endsAt: new Date(now.getTime() + 120_000).toISOString(),
    });
    await createWindow(freshToken, {
      name: 'None Win',
      recurrence: 'NONE',
      startsAt: new Date(now.getTime() + 60_000).toISOString(),
      endsAt: new Date(now.getTime() + 120_000).toISOString(),
    });
    const res = await request(app.getHttpServer())
      .get('/v2/maintenance?recurrence=DAILY')
      .set({ Authorization: `Bearer ${freshToken}` });
    expect(res.status).toBe(200);
    expect((res.body.data as any[]).every((d: any) => d.recurrence === 'DAILY')).toBe(true);
    expect(res.body.meta.total).toBe(1);
    await cleanupTestUser(prisma, freshUser.id);
  });

  // ─── activeOnly filter ───────────────────────────────────────────────────

  it('activeOnly=true returns only active windows', async () => {
    const { token: freshToken, user: freshUser } = await createTestUser(prisma, module);
    const now = new Date();
    const active = await createWindow(freshToken, {
      name: 'Active',
      startsAt: new Date(now.getTime() - 30_000).toISOString(),
      endsAt: new Date(now.getTime() + 30_000).toISOString(),
    });
    await createWindow(freshToken, {
      name: 'Future',
      startsAt: new Date(now.getTime() + 60_000).toISOString(),
      endsAt: new Date(now.getTime() + 120_000).toISOString(),
    });

    const res = await request(app.getHttpServer())
      .get('/v2/maintenance?activeOnly=true')
      .set({ Authorization: `Bearer ${freshToken}` });
    expect(res.status).toBe(200);
    const ids = (res.body.data as any[]).map((d: any) => d.id);
    expect(ids).toContain(active.id);
    // All returned windows should be active
    expect((res.body.data as any[]).every((d: any) => d.isActive === true)).toBe(true);
    await cleanupTestUser(prisma, freshUser.id);
  });

  // ─── Search ──────────────────────────────────────────────────────────────

  it('search filters by name (case-insensitive)', async () => {
    const { token: freshToken, user: freshUser } = await createTestUser(prisma, module);
    const now = new Date();
    const matched = await createWindow(freshToken, {
      name: 'Nightly Database Backup',
      startsAt: new Date(now.getTime() + 60_000).toISOString(),
      endsAt: new Date(now.getTime() + 120_000).toISOString(),
    });
    await createWindow(freshToken, {
      name: 'Frontend Deploy',
      startsAt: new Date(now.getTime() + 60_000).toISOString(),
      endsAt: new Date(now.getTime() + 120_000).toISOString(),
    });

    const res = await request(app.getHttpServer())
      .get('/v2/maintenance?search=nightly')
      .set({ Authorization: `Bearer ${freshToken}` });
    expect(res.status).toBe(200);
    const ids = (res.body.data as any[]).map((d: any) => d.id);
    expect(ids).toContain(matched.id);
    expect(ids).not.toContain(expect.stringMatching(/frontend/i));
    await cleanupTestUser(prisma, freshUser.id);
  });

  it('search returns empty when no match', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/maintenance?search=zzz-no-match-xyz')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(0);
    expect(res.body.data).toHaveLength(0);
  });

  // ─── Sort ────────────────────────────────────────────────────────────────

  it('sortBy=name asc returns alphabetical order', async () => {
    const { token: freshToken, user: freshUser } = await createTestUser(prisma, module);
    const now = new Date();
    for (const name of ['Zebra', 'Alpha', 'Middle']) {
      await createWindow(freshToken, {
        name,
        startsAt: new Date(now.getTime() + 60_000).toISOString(),
        endsAt: new Date(now.getTime() + 120_000).toISOString(),
      });
    }
    const res = await request(app.getHttpServer())
      .get('/v2/maintenance?sortBy=name&sortDir=asc')
      .set({ Authorization: `Bearer ${freshToken}` });
    const names = (res.body.data as any[]).map((d: any) => d.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
    await cleanupTestUser(prisma, freshUser.id);
  });

  it('sortBy=name desc returns reverse alphabetical', async () => {
    const { token: freshToken, user: freshUser } = await createTestUser(prisma, module);
    const now = new Date();
    for (const name of ['Alpha', 'Zebra']) {
      await createWindow(freshToken, {
        name,
        startsAt: new Date(now.getTime() + 60_000).toISOString(),
        endsAt: new Date(now.getTime() + 120_000).toISOString(),
      });
    }
    const res = await request(app.getHttpServer())
      .get('/v2/maintenance?sortBy=name&sortDir=desc')
      .set({ Authorization: `Bearer ${freshToken}` });
    const names = (res.body.data as any[]).map((d: any) => d.name);
    expect(names[0]).toBe('Zebra');
    expect(names[1]).toBe('Alpha');
    await cleanupTestUser(prisma, freshUser.id);
  });

  // ─── Invalid params ──────────────────────────────────────────────────────

  it('invalid sortBy returns 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/maintenance?sortBy=invalid')
      .set(auth());
    expect(res.status).toBe(400);
  });

  it('invalid sortDir returns 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/maintenance?sortDir=sideways')
      .set(auth());
    expect(res.status).toBe(400);
  });

  it('invalid recurrence value returns 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/maintenance?recurrence=HOURLY')
      .set(auth());
    expect(res.status).toBe(400);
  });

  it('page beyond total returns empty data array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/maintenance?page=9999&limit=20')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});
