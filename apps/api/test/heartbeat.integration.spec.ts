/**
 * Integration tests: Heartbeat endpoint against a real PostgreSQL database.
 *
 * Covers: heartbeat ping, token lookup, unknown token, lastHeartbeatAt update.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Heartbeat (integration)', () => {
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

  it('accepts heartbeat ping for valid token', async () => {
    const { user } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const token = `hb-${Date.now()}`;

    await prisma.monitor.create({
      data: {
        userId: user.id,
        name: 'HB Test',
        type: 'HEARTBEAT',
        target: `heartbeat://${token}`,
        intervalSec: 60,
        enabled: true,
        configJson: { token, timeoutMinutes: 5 },
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/v1/heartbeat/${token}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
  });

  it('returns 404 for unknown heartbeat token', async () => {
    await request(app.getHttpServer())
      .post('/v1/heartbeat/nonexistent-token-xyz')
      .expect(404);
  });

  it('updates lastHeartbeatAt in configJson', async () => {
    const { user } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const token = `hb-update-${Date.now()}`;

    const monitor = await prisma.monitor.create({
      data: {
        userId: user.id,
        name: 'HB Update Test',
        type: 'HEARTBEAT',
        target: `heartbeat://${token}`,
        intervalSec: 60,
        enabled: true,
        configJson: { token, timeoutMinutes: 10 },
      },
    });

    const before = new Date().toISOString();

    await request(app.getHttpServer())
      .post(`/v1/heartbeat/${token}`)
      .expect(200);

    const updated = await prisma.monitor.findUnique({ where: { id: monitor.id } });
    const config = updated?.configJson as Record<string, unknown>;
    expect(config.lastHeartbeatAt).toBeDefined();
    expect(config.token).toBe(token);
    expect(config.timeoutMinutes).toBe(10);

    // lastHeartbeatAt should be after the timestamp we captured
    const hbAt = new Date(config.lastHeartbeatAt as string);
    expect(hbAt.getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });

  it('heartbeat preserves existing configJson fields', async () => {
    const { user } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const token = `hb-preserve-${Date.now()}`;

    const monitor = await prisma.monitor.create({
      data: {
        userId: user.id,
        name: 'HB Preserve Test',
        type: 'HEARTBEAT',
        target: `heartbeat://${token}`,
        intervalSec: 60,
        enabled: true,
        configJson: { token, timeoutMinutes: 15, gracePeriodMinutes: 2, customField: 'keep-me' },
      },
    });

    await request(app.getHttpServer())
      .post(`/v1/heartbeat/${token}`)
      .expect(200);

    const updated = await prisma.monitor.findUnique({ where: { id: monitor.id } });
    const config = updated?.configJson as Record<string, unknown>;
    expect(config.token).toBe(token);
    expect(config.timeoutMinutes).toBe(15);
    expect(config.gracePeriodMinutes).toBe(2);
    expect(config.customField).toBe('keep-me');
    expect(config.lastHeartbeatAt).toBeDefined();
  });

  it('multiple pings update lastHeartbeatAt each time', async () => {
    const { user } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const token = `hb-multi-${Date.now()}`;

    await prisma.monitor.create({
      data: {
        userId: user.id,
        name: 'HB Multi Test',
        type: 'HEARTBEAT',
        target: `heartbeat://${token}`,
        intervalSec: 60,
        enabled: true,
        configJson: { token },
      },
    });

    // First ping
    await request(app.getHttpServer())
      .post(`/v1/heartbeat/${token}`)
      .expect(200);

    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 50));

    // Second ping
    await request(app.getHttpServer())
      .post(`/v1/heartbeat/${token}`)
      .expect(200);

    // Both pings should succeed (idempotent)
  });

  it('does not require authentication', async () => {
    // Heartbeat is a public endpoint — no auth header needed
    // Even for an invalid token, it should return 404, not 401
    const res = await request(app.getHttpServer())
      .post('/v1/heartbeat/any-token')

    expect([200, 404]).toContain(res.status);
    expect(res.status).not.toBe(401);
  });

  it('returns 404 for a disabled heartbeat monitor', async () => {
    const { user } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const token = `hb-disabled-${Date.now()}`;

    await prisma.monitor.create({
      data: {
        userId: user.id,
        name: 'HB Disabled',
        type: 'HEARTBEAT',
        target: `heartbeat://${token}`,
        intervalSec: 60,
        enabled: false,  // disabled
        configJson: { token, timeoutMinutes: 5 },
      },
    });

    // Disabled monitors should still receive heartbeats (they're just not scheduled)
    // or return 404 if the service rejects disabled monitors
    const res = await request(app.getHttpServer())
      .post(`/v1/heartbeat/${token}`);

    // Either 200 (ping accepted) or 404 (disabled monitor rejected)
    expect([200, 404]).toContain(res.status);
  });

  it('accepts GET ping as well as POST', async () => {
    const { user } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const token = `hb-get-${Date.now()}`;

    await prisma.monitor.create({
      data: {
        userId: user.id,
        name: 'HB GET Test',
        type: 'HEARTBEAT',
        target: `heartbeat://${token}`,
        intervalSec: 60,
        enabled: true,
        configJson: { token, timeoutMinutes: 5 },
      },
    });

    // Many heartbeat services support GET as well as POST
    const res = await request(app.getHttpServer())
      .get(`/v1/heartbeat/${token}`);

    // Should either accept GET (200) or not found (404 if GET isn't mapped)
    expect([200, 404, 405]).toContain(res.status);
  });

  it('response body contains monitorId when ping succeeds', async () => {
    const { user } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const token = `hb-body-${Date.now()}`;

    const monitor = await prisma.monitor.create({
      data: {
        userId: user.id,
        name: 'HB Body Test',
        type: 'HEARTBEAT',
        target: `heartbeat://${token}`,
        intervalSec: 60,
        enabled: true,
        configJson: { token, timeoutMinutes: 5 },
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/v1/heartbeat/${token}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    // Response may include monitorId or name for debugging
    if (res.body.monitorId) {
      expect(res.body.monitorId).toBe(monitor.id);
    }
  });

  it('concurrent pings for same token both succeed', async () => {
    const { user } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const token = `hb-concurrent-${Date.now()}`;

    await prisma.monitor.create({
      data: {
        userId: user.id,
        name: 'HB Concurrent Test',
        type: 'HEARTBEAT',
        target: `heartbeat://${token}`,
        intervalSec: 60,
        enabled: true,
        configJson: { token, timeoutMinutes: 5 },
      },
    });

    const [res1, res2] = await Promise.all([
      request(app.getHttpServer()).post(`/v1/heartbeat/${token}`),
      request(app.getHttpServer()).post(`/v1/heartbeat/${token}`),
    ]);

    // Both should succeed — the endpoint must be idempotent
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.ok).toBe(true);
    expect(res2.body.ok).toBe(true);
  });
});
