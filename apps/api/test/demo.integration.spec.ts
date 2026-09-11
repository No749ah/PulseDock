/**
 * Integration tests: Demo seed endpoint against a real PostgreSQL database.
 *
 * Covers: seeding demo data, idempotency (already-seeded check), auth guard.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Demo Seed (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
  }, 30000);

  afterAll(async () => {
    for (const id of createdUserIds) {
      await cleanupTestUser(prisma, id);
    }
    await destroyTestApp(app);
  }, 15000);

  it('rejects unauthenticated requests (401/403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/demo/seed');
    expect([401, 403]).toContain(res.status);
  });

  it('seeds demo data for a new user', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .post('/v1/demo/seed')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({
      alreadySeeded: false,
    });
    expect(Array.isArray(res.body.monitors)).toBe(true);
    expect(res.body.monitors.length).toBeGreaterThan(0);
    expect(typeof res.body.alertChannelId).toBe('string');
    expect(typeof res.body.statusPageId).toBe('string');
    expect(typeof res.body.statusPageSlug).toBe('string');
  });

  it('returns alreadySeeded: true when called again for same user', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    // First seed
    await request(app.getHttpServer())
      .post('/v1/demo/seed')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Second call — should be idempotent
    const res2 = await request(app.getHttpServer())
      .post('/v1/demo/seed')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res2.body.alreadySeeded).toBe(true);
    expect(res2.body.monitors).toEqual([]);
    expect(res2.body.alertChannelId).toBeNull();
  });

  it('creates actual DB records for monitors', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .post('/v1/demo/seed')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const monitorCount = await prisma.monitor.count({ where: { userId: user.id } });
    expect(monitorCount).toBeGreaterThanOrEqual(res.body.monitors.length);
  });

  it('creates an alert channel in the database', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .post('/v1/demo/seed')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const channel = await prisma.alertChannel.findUnique({
      where: { id: res.body.alertChannelId },
    });
    expect(channel).not.toBeNull();
    expect(channel?.userId).toBe(user.id);
  });

  it('creates a status page in the database', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .post('/v1/demo/seed')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const statusPage = await prisma.publicStatusPage.findUnique({
      where: { id: res.body.statusPageId },
    });
    expect(statusPage).not.toBeNull();
    expect(statusPage?.userId).toBe(user.id);
    expect(statusPage?.slug).toBe(res.body.statusPageSlug);
  });

  it('user isolation: seeding one user does not affect another', async () => {
    const { user: userA, token: tokenA } = await createTestUser(prisma, module);
    const { user: userB, token: tokenB } = await createTestUser(prisma, module);
    createdUserIds.push(userA.id, userB.id);

    // Seed user A
    await request(app.getHttpServer())
      .post('/v1/demo/seed')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    // User B should still not be seeded (alreadySeeded: false)
    const resB = await request(app.getHttpServer())
      .post('/v1/demo/seed')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(resB.body.alreadySeeded).toBe(false);
    expect(resB.body.monitors.length).toBeGreaterThan(0);
  });
});
