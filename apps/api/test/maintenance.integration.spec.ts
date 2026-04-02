/**
 * Integration tests: Maintenance Windows CRUD against a real PostgreSQL database.
 *
 * Covers create → read → update → delete lifecycle, recurrence fields,
 * active window detection, user data isolation, and auth guard enforcement.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Maintenance Windows (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let otherToken: string;
  let otherUserId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const testUser = await createTestUser(prisma, module);
    token = testUser.token;
    userId = testUser.user.id;
    const other = await createTestUser(prisma, module);
    otherToken = other.token;
    otherUserId = other.user.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, otherUserId);
    await destroyTestApp(app);
  }, 15000);

  const authHeader = () => ({ Authorization: `Bearer ${token}` });
  const otherAuthHeader = () => ({ Authorization: `Bearer ${otherToken}` });

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('returns 401 on list without auth', async () => {
    const res = await request(app.getHttpServer()).get('/v1/maintenance');
    expect(res.status).toBe(401);
  });

  it('returns 401 or 403 on create without auth', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .send({ name: 'test', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString() });
    expect([401, 403]).toContain(res.status);
  });

  // ─── Create ───────────────────────────────────────────────────────────────

  it('creates a maintenance window', async () => {
    const startsAt = new Date(Date.now() + 3600_000).toISOString();
    const endsAt = new Date(Date.now() + 7200_000).toISOString();

    const res = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({
        name: 'DB Migration',
        description: 'Upgrading PostgreSQL',
        startsAt,
        endsAt,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'DB Migration',
      description: 'Upgrading PostgreSQL',
      recurrence: 'NONE',
    });
    expect(res.body.id).toBeTruthy();
    expect(res.body.startsAt).toBeTruthy();
    expect(res.body.endsAt).toBeTruthy();
    expect(Array.isArray(res.body.monitorIds)).toBe(true);
  });

  it('rejects create when endsAt is before startsAt', async () => {
    const now = Date.now();
    const res = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({
        name: 'Bad Window',
        startsAt: new Date(now + 7200_000).toISOString(),
        endsAt: new Date(now + 3600_000).toISOString(),
      });

    expect(res.status).toBe(400);
  });

  it('rejects create when name is empty', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({
        name: '',
        startsAt: new Date(Date.now() + 3600_000).toISOString(),
        endsAt: new Date(Date.now() + 7200_000).toISOString(),
      });

    expect(res.status).toBe(400);
  });

  // ─── List ─────────────────────────────────────────────────────────────────

  it('lists maintenance windows for the authenticated user', async () => {
    const startsAt = new Date(Date.now() + 3600_000).toISOString();
    const endsAt = new Date(Date.now() + 7200_000).toISOString();

    // Create two windows
    await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({ name: 'Window A', startsAt, endsAt });

    await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({ name: 'Window B', startsAt, endsAt });

    const res = await request(app.getHttpServer())
      .get('/v1/maintenance')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const names = res.body.map((w: { name: string }) => w.name);
    expect(names).toContain('Window A');
    expect(names).toContain('Window B');
  });

  // ─── Get one ──────────────────────────────────────────────────────────────

  it('fetches a single maintenance window by id', async () => {
    const startsAt = new Date(Date.now() + 3600_000).toISOString();
    const endsAt = new Date(Date.now() + 7200_000).toISOString();

    const created = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({ name: 'Fetch Me', startsAt, endsAt });

    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const res = await request(app.getHttpServer())
      .get(`/v1/maintenance/${id}`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.name).toBe('Fetch Me');
  });

  it('returns 403 when fetching another user\'s window', async () => {
    const startsAt = new Date(Date.now() + 3600_000).toISOString();
    const endsAt = new Date(Date.now() + 7200_000).toISOString();

    const created = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({ name: 'Private Window', startsAt, endsAt });

    const id = created.body.id as string;

    const res = await request(app.getHttpServer())
      .get(`/v1/maintenance/${id}`)
      .set(otherAuthHeader());

    expect(res.status).toBe(403);
  });

  // ─── Update ───────────────────────────────────────────────────────────────

  it('updates a maintenance window name and description', async () => {
    const startsAt = new Date(Date.now() + 3600_000).toISOString();
    const endsAt = new Date(Date.now() + 7200_000).toISOString();

    const created = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({ name: 'Original Name', startsAt, endsAt });

    const id = created.body.id as string;

    const res = await request(app.getHttpServer())
      .patch(`/v1/maintenance/${id}`)
      .set(authHeader())
      .send({ name: 'Updated Name', description: 'New desc' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
    expect(res.body.description).toBe('New desc');
  });

  it('returns 403 when updating another user\'s window', async () => {
    const startsAt = new Date(Date.now() + 3600_000).toISOString();
    const endsAt = new Date(Date.now() + 7200_000).toISOString();

    const created = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({ name: 'Not Yours', startsAt, endsAt });

    const id = created.body.id as string;

    const res = await request(app.getHttpServer())
      .patch(`/v1/maintenance/${id}`)
      .set(otherAuthHeader())
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(403);
  });

  // ─── Delete ───────────────────────────────────────────────────────────────

  it('deletes a maintenance window', async () => {
    const startsAt = new Date(Date.now() + 3600_000).toISOString();
    const endsAt = new Date(Date.now() + 7200_000).toISOString();

    const created = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({ name: 'Delete Me', startsAt, endsAt });

    const id = created.body.id as string;

    const del = await request(app.getHttpServer())
      .delete(`/v1/maintenance/${id}`)
      .set(authHeader());

    expect(del.status).toBe(200);

    // Verify it's gone
    const get = await request(app.getHttpServer())
      .get(`/v1/maintenance/${id}`)
      .set(authHeader());

    expect(get.status).toBe(404);
  });

  it('returns 403 when deleting another user\'s window', async () => {
    const startsAt = new Date(Date.now() + 3600_000).toISOString();
    const endsAt = new Date(Date.now() + 7200_000).toISOString();

    const created = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({ name: 'Not For You', startsAt, endsAt });

    const id = created.body.id as string;

    const res = await request(app.getHttpServer())
      .delete(`/v1/maintenance/${id}`)
      .set(otherAuthHeader());

    expect(res.status).toBe(403);
  });

  // ─── Active windows ───────────────────────────────────────────────────────

  it('active endpoint lists currently running windows', async () => {
    // Create one active window (starts in the past, ends in the future)
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 3600_000).toISOString();

    const created = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({ name: 'Currently Active', startsAt, endsAt });

    expect(created.status).toBe(201);

    const res = await request(app.getHttpServer())
      .get('/v1/maintenance/active')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const names = res.body.map((w: { name: string }) => w.name);
    expect(names).toContain('Currently Active');
  });

  it('active endpoint does not include future windows', async () => {
    // Create a future window
    const startsAt = new Date(Date.now() + 7200_000).toISOString();
    const endsAt = new Date(Date.now() + 10800_000).toISOString();

    await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({ name: 'Future Window Unique 7239', startsAt, endsAt });

    const res = await request(app.getHttpServer())
      .get('/v1/maintenance/active')
      .set(authHeader());

    expect(res.status).toBe(200);
    const names = res.body.map((w: { name: string }) => w.name);
    expect(names).not.toContain('Future Window Unique 7239');
  });

  // ─── Recurrence ───────────────────────────────────────────────────────────

  it('creates a weekly recurring maintenance window', async () => {
    const startsAt = new Date(Date.now() + 3600_000).toISOString();
    const endsAt = new Date(Date.now() + 7200_000).toISOString();

    const res = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({
        name: 'Weekly Maintenance',
        startsAt,
        endsAt,
        recurrence: 'WEEKLY',
        recurrenceDays: '0,6',
        durationMinutes: 60,
      });

    expect(res.status).toBe(201);
    expect(res.body.recurrence).toBe('WEEKLY');
    expect(res.body.recurrenceDays).toBe('0,6');
    expect(res.body.durationMinutes).toBe(60);
  });

  it('creates a daily recurring maintenance window', async () => {
    const startsAt = new Date(Date.now() + 3600_000).toISOString();
    const endsAt = new Date(Date.now() + 7200_000).toISOString();

    const res = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({
        name: 'Daily Backup Window',
        startsAt,
        endsAt,
        recurrence: 'DAILY',
        durationMinutes: 30,
      });

    expect(res.status).toBe(201);
    expect(res.body.recurrence).toBe('DAILY');
    expect(res.body.durationMinutes).toBe(30);
  });

  // ─── User isolation ───────────────────────────────────────────────────────

  it('list does not return other user\'s windows', async () => {
    const startsAt = new Date(Date.now() + 3600_000).toISOString();
    const endsAt = new Date(Date.now() + 7200_000).toISOString();

    // User A creates a window
    await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({ name: 'User A Exclusive Window', startsAt, endsAt });

    // User B's list should NOT include it
    const res = await request(app.getHttpServer())
      .get('/v1/maintenance')
      .set(otherAuthHeader());

    expect(res.status).toBe(200);
    const names = res.body.map((w: { name: string }) => w.name);
    expect(names).not.toContain('User A Exclusive Window');
  });

  // ─── isActive flag ────────────────────────────────────────────────────────

  it('list returns isActive=true for a currently running window', async () => {
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 3600_000).toISOString();

    const created = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({ name: 'Running Now', startsAt, endsAt });

    const id = created.body.id as string;

    const res = await request(app.getHttpServer())
      .get('/v1/maintenance')
      .set(authHeader());

    const win = res.body.find((w: { id: string }) => w.id === id);
    expect(win).toBeDefined();
    expect(win.isActive).toBe(true);
  });

  it('list returns isActive=false for a future window', async () => {
    const startsAt = new Date(Date.now() + 7200_000).toISOString();
    const endsAt = new Date(Date.now() + 10800_000).toISOString();

    const created = await request(app.getHttpServer())
      .post('/v1/maintenance')
      .set(authHeader())
      .send({ name: 'Not Yet', startsAt, endsAt });

    const id = created.body.id as string;

    const res = await request(app.getHttpServer())
      .get('/v1/maintenance')
      .set(authHeader());

    const win = res.body.find((w: { id: string }) => w.id === id);
    expect(win).toBeDefined();
    expect(win.isActive).toBe(false);
  });
});
