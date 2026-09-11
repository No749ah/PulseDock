/**
 * Integration tests: Notification preferences against a real PostgreSQL database.
 *
 * Covers: get (auto-create default), update individual fields, patch quiet hours,
 * patch frequency, patch storm protection, invalid field rejection (400),
 * auth guard (401), digest-queue endpoint, and user isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Notification preferences (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  let tokenA: string;
  let userIdA: string;
  let tokenB: string;
  let userIdB: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const userA = await createTestUser(prisma, module);
    tokenA = userA.token;
    userIdA = userA.user.id;

    const userB = await createTestUser(prisma, module);
    tokenB = userB.token;
    userIdB = userB.user.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userIdA);
    await cleanupTestUser(prisma, userIdB);
    await destroyTestApp(app);
  }, 15000);

  const authA = () => ({ Authorization: `Bearer ${tokenA}` });
  const authB = () => ({ Authorization: `Bearer ${tokenB}` });

  // ─── Auth guard ───

  it('should reject unauthenticated GET (401)', async () => {
    await request(app.getHttpServer())
      .get('/v1/notification-preferences')
      .expect(401);
  });

  it('should reject unauthenticated PATCH (401 or 403)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/notification-preferences')
      .send({ notifyOnDown: false });
    // Auth guard returns 401; CSRF guard may return 403 first
    expect([401, 403]).toContain(res.status);
  });

  // ─── Get / auto-create defaults ───

  it('should create and return default preferences on first GET', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/notification-preferences')
      .set(authA())
      .expect(200);

    expect(res.body.id).toBeDefined();
    expect(res.body.notifyOnDown).toBe(true);
    expect(res.body.notifyOnRecovery).toBe(true);
    expect(res.body.notifyOnDegraded).toBe(true);
    expect(res.body.quietHoursEnabled).toBe(false);
    expect(res.body.frequency).toBe('instant');
    expect(res.body.alertStormProtection).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.updatedAt).toBeDefined();
  });

  it('should return same record on subsequent GET (idempotent)', async () => {
    const res1 = await request(app.getHttpServer())
      .get('/v1/notification-preferences')
      .set(authA())
      .expect(200);

    const res2 = await request(app.getHttpServer())
      .get('/v1/notification-preferences')
      .set(authA())
      .expect(200);

    expect(res1.body.id).toBe(res2.body.id);
  });

  // ─── Update fields ───

  it('should update notifyOnDown to false', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/notification-preferences')
      .set(authA())
      .send({ notifyOnDown: false })
      .expect(200);

    expect(res.body.notifyOnDown).toBe(false);
    // Other fields unchanged
    expect(res.body.notifyOnRecovery).toBe(true);
  });

  it('should update notifyOnRecovery and notifyOnDegraded together', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/notification-preferences')
      .set(authA())
      .send({ notifyOnRecovery: false, notifyOnDegraded: false })
      .expect(200);

    expect(res.body.notifyOnRecovery).toBe(false);
    expect(res.body.notifyOnDegraded).toBe(false);
  });

  it('should update quiet hours settings', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/notification-preferences')
      .set(authA())
      .send({ quietHoursEnabled: true, quietHoursStart: 22, quietHoursEnd: 7 })
      .expect(200);

    expect(res.body.quietHoursEnabled).toBe(true);
    expect(res.body.quietHoursStart).toBe(22);
    expect(res.body.quietHoursEnd).toBe(7);
  });

  it('should reject quiet hours out of range (400)', async () => {
    await request(app.getHttpServer())
      .patch('/v1/notification-preferences')
      .set(authA())
      .send({ quietHoursStart: 25 })
      .expect(400);
  });

  it('should update frequency to hourly_digest', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/notification-preferences')
      .set(authA())
      .send({ frequency: 'hourly_digest' })
      .expect(200);

    expect(res.body.frequency).toBe('hourly_digest');
  });

  it('should update frequency to daily_digest', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/notification-preferences')
      .set(authA())
      .send({ frequency: 'daily_digest' })
      .expect(200);

    expect(res.body.frequency).toBe('daily_digest');
  });

  it('should reject invalid frequency value (400)', async () => {
    await request(app.getHttpServer())
      .patch('/v1/notification-preferences')
      .set(authA())
      .send({ frequency: 'weekly' })
      .expect(400);
  });

  it('should update alert storm protection settings', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/notification-preferences')
      .set(authA())
      .send({ alertStormProtection: true, alertStormThreshold: 20 })
      .expect(200);

    expect(res.body.alertStormProtection).toBe(true);
    expect(res.body.alertStormThreshold).toBe(20);
  });

  it('should reject alertStormThreshold out of range (400)', async () => {
    await request(app.getHttpServer())
      .patch('/v1/notification-preferences')
      .set(authA())
      .send({ alertStormThreshold: 0 })
      .expect(400);
  });

  it('should reject alertStormThreshold over max (400)', async () => {
    await request(app.getHttpServer())
      .patch('/v1/notification-preferences')
      .set(authA())
      .send({ alertStormThreshold: 101 })
      .expect(400);
  });

  // ─── User isolation ───

  it('should maintain separate preferences per user', async () => {
    // User A set notifyOnDown to false above; user B should get defaults
    const resA = await request(app.getHttpServer())
      .get('/v1/notification-preferences')
      .set(authA())
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/v1/notification-preferences')
      .set(authB())
      .expect(200);

    // A has modified preferences
    expect(resA.body.notifyOnDown).toBe(false);
    // B has defaults (untouched)
    expect(resB.body.notifyOnDown).toBe(true);
    // Different IDs
    expect(resA.body.id).not.toBe(resB.body.id);
  });

  // ─── Digest queue ───

  it('should return digest queue (authenticated)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/notification-preferences/digest-queue')
      .set(authA())
      .expect(200);

    expect(res.body).toHaveProperty('pending');
    expect(res.body).toHaveProperty('sent');
    expect(Array.isArray(res.body.pending)).toBe(true);
    expect(Array.isArray(res.body.sent)).toBe(true);
  });

  it('should return empty digest queue for new user', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/notification-preferences/digest-queue')
      .set(authB())
      .expect(200);

    expect(res.body.pending).toHaveLength(0);
  });

  it('should reject digest queue without auth (401)', async () => {
    await request(app.getHttpServer())
      .get('/v1/notification-preferences/digest-queue')
      .expect(401);
  });
});
