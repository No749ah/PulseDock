/**
 * Integration tests: GET /v2/alert-deliveries
 *
 * Covers:
 *   - Auth guard (401 without token)
 *   - Paginated envelope shape (data + meta)
 *   - Field shape for a delivery record (all expected fields)
 *   - User isolation (user B cannot see user A's deliveries)
 *   - Filter by status=success / status=failed
 *   - Filter by channelId
 *   - Filter by monitorId
 *   - Date range filter: since / until / both
 *   - Sort by createdAt asc/desc (default desc)
 *   - Sort by status asc/desc
 *   - Pagination: limit / page / cross-page
 *   - Page beyond total → empty data, correct total
 *   - Invalid sortBy → 400
 *   - Invalid sortDir → 400
 *   - Invalid status enum → 400
 *   - limit=0 → 400
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('GET /v2/alert-deliveries (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  // User A
  let token: string;
  let userId: string;
  let channelAId: string;
  let channelBId: string;
  let monitorId: string;

  // User B
  let token2: string;
  let userId2: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const auth2 = () => ({ Authorization: `Bearer ${token2}` });

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const u1 = await createTestUser(prisma, module);
    token = u1.token;
    userId = u1.user.id;

    const u2 = await createTestUser(prisma, module);
    token2 = u2.token;
    userId2 = u2.user.id;

    // Create a monitor for user A (to populate monitorId/monitorName)
    const monitorRes = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(auth())
      .send({ name: 'Delivery Test Monitor', type: 'HTTP', target: 'https://example.com', intervalSec: 300, timeoutMs: 10000 })
      .expect(201);
    monitorId = monitorRes.body.id;

    // Create two channels for user A
    const ch1 = await prisma.alertChannel.create({
      data: { userId, name: 'Slack A', type: 'slack', configJson: { webhookUrl: 'https://hooks.slack.com/token' } },
    });
    channelAId = ch1.id;

    const ch2 = await prisma.alertChannel.create({
      data: { userId, name: 'Email A', type: 'email', configJson: { email: 'test@example.com' } },
    });
    channelBId = ch2.id;

    // Create a channel for user B
    const chB = await prisma.alertChannel.create({
      data: { userId: userId2, name: 'Slack B', type: 'slack', configJson: { webhookUrl: 'https://hooks.slack.com/b' } },
    });

    // Seed delivery logs for user A channel 1 (3 records)
    await prisma.alertDeliveryLog.createMany({
      data: [
        {
          alertChannelId: channelAId,
          monitorId,
          monitorName: 'Delivery Test Monitor',
          status: 'success',
          trigger: 'monitor_failure',
          durationMs: 100,
          isGrouped: false,
          groupedCount: 0,
          createdAt: new Date('2026-04-01T10:00:00Z'),
        },
        {
          alertChannelId: channelAId,
          monitorId,
          monitorName: 'Delivery Test Monitor',
          status: 'failed',
          trigger: 'monitor_recovery',
          errorMessage: 'Connection refused',
          durationMs: null,
          isGrouped: false,
          groupedCount: 0,
          createdAt: new Date('2026-04-02T10:00:00Z'),
        },
        {
          alertChannelId: channelAId,
          monitorId: null,
          monitorName: null,
          status: 'success',
          trigger: 'test',
          durationMs: 200,
          isGrouped: true,
          groupedCount: 3,
          createdAt: new Date('2026-04-03T10:00:00Z'),
        },
      ],
    });

    // Seed 1 delivery log for user A channel 2
    await prisma.alertDeliveryLog.create({
      data: {
        alertChannelId: channelBId,
        monitorId: null,
        monitorName: null,
        status: 'success',
        trigger: 'test',
        durationMs: 50,
        isGrouped: false,
        groupedCount: 0,
        createdAt: new Date('2026-04-04T10:00:00Z'),
      },
    });

    // Seed 1 delivery log for user B (should NOT appear for user A)
    await prisma.alertDeliveryLog.create({
      data: {
        alertChannelId: chB.id,
        monitorId: null,
        monitorName: null,
        status: 'success',
        trigger: 'test',
        durationMs: 75,
        isGrouped: false,
        groupedCount: 0,
        createdAt: new Date('2026-04-05T10:00:00Z'),
      },
    });
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app);
  }, 15000);

  // ── Auth guard ─────────────────────────────────────────────────────────────

  it('returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/v2/alert-deliveries');
    expect(res.status).toBe(401);
  });

  // ── Envelope shape ─────────────────────────────────────────────────────────

  it('returns paginated envelope with data + meta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20 });
  });

  it('returns all 4 records for user A (total)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(4);
  });

  // ── Field shape ────────────────────────────────────────────────────────────

  it('record has all expected fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?limit=1&sortBy=createdAt&sortDir=asc')
      .set(auth());
    expect(res.status).toBe(200);
    const item = res.body.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('alertChannelId');
    expect(item).toHaveProperty('channelName');
    expect(item).toHaveProperty('channelType');
    expect(item).toHaveProperty('monitorId');
    expect(item).toHaveProperty('monitorName');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('trigger');
    expect(item).toHaveProperty('errorMessage');
    expect(item).toHaveProperty('durationMs');
    expect(item).toHaveProperty('isGrouped');
    expect(item).toHaveProperty('groupedCount');
    expect(item).toHaveProperty('createdAt');
  });

  it('channel name + type are populated', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v2/alert-deliveries?channelId=${channelAId}&sortBy=createdAt&sortDir=asc&limit=1`)
      .set(auth());
    expect(res.status).toBe(200);
    const item = res.body.data[0];
    expect(item.channelName).toBe('Slack A');
    expect(item.channelType).toBe('slack');
  });

  it('errorMessage is non-null for failed deliveries', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?status=failed')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data[0].errorMessage).toBe('Connection refused');
  });

  it('isGrouped and groupedCount are set on grouped record', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v2/alert-deliveries?channelId=${channelAId}&sortBy=createdAt&sortDir=desc&limit=1`)
      .set(auth());
    expect(res.status).toBe(200);
    const item = res.body.data[0];
    expect(item.isGrouped).toBe(true);
    expect(item.groupedCount).toBe(3);
  });

  // ── User isolation ─────────────────────────────────────────────────────────

  it('user B only sees their own deliveries (1 record)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries')
      .set(auth2());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
  });

  it('user B cannot see user A channel deliveries via channelId filter', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v2/alert-deliveries?channelId=${channelAId}`)
      .set(auth2());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(0);
  });

  // ── Status filter ──────────────────────────────────────────────────────────

  it('status=success returns only successful deliveries', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?status=success')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(3);
    for (const item of res.body.data) {
      expect(item.status).toBe('success');
    }
  });

  it('status=failed returns only failed deliveries', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?status=failed')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].status).toBe('failed');
  });

  // ── channelId filter ───────────────────────────────────────────────────────

  it('channelId filter returns only that channel\'s deliveries', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v2/alert-deliveries?channelId=${channelBId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].alertChannelId).toBe(channelBId);
  });

  // ── monitorId filter ───────────────────────────────────────────────────────

  it('monitorId filter returns only that monitor\'s deliveries', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v2/alert-deliveries?monitorId=${monitorId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    for (const item of res.body.data) {
      expect(item.monitorId).toBe(monitorId);
    }
  });

  it('unknown monitorId returns 0 results', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?monitorId=nonexistent-id')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(0);
  });

  // ── Date range filters ─────────────────────────────────────────────────────

  it('since filter excludes earlier deliveries', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?since=2026-04-03T00:00:00Z')
      .set(auth());
    expect(res.status).toBe(200);
    // Only Apr 3 + Apr 4 records (2 records)
    expect(res.body.meta.total).toBe(2);
  });

  it('until filter excludes later deliveries', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?until=2026-04-02T23:59:59Z')
      .set(auth());
    expect(res.status).toBe(200);
    // Only Apr 1 + Apr 2 records (2 records)
    expect(res.body.meta.total).toBe(2);
  });

  it('since+until range filter', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?since=2026-04-02T00:00:00Z&until=2026-04-02T23:59:59Z')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].status).toBe('failed');
  });

  // ── Sort ───────────────────────────────────────────────────────────────────

  it('default sort is createdAt desc (newest first)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries')
      .set(auth());
    expect(res.status).toBe(200);
    const dates = res.body.data.map((d: { createdAt: string }) => new Date(d.createdAt).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
    }
  });

  it('sortBy=createdAt&sortDir=asc returns oldest first', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?sortBy=createdAt&sortDir=asc')
      .set(auth());
    expect(res.status).toBe(200);
    const dates = res.body.data.map((d: { createdAt: string }) => new Date(d.createdAt).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeLessThanOrEqual(dates[i + 1]);
    }
  });

  it('sortBy=status&sortDir=asc orders failed before success alphabetically', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?sortBy=status&sortDir=asc')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data[0].status).toBe('failed');
    expect(res.body.data[res.body.data.length - 1].status).toBe('success');
  });

  // ── Pagination ─────────────────────────────────────────────────────────────

  it('limit=1 returns 1 record with correct meta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?limit=1')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(4);
    expect(res.body.meta.pages).toBe(4);
    expect(res.body.meta.limit).toBe(1);
  });

  it('cross-page pagination returns different records', async () => {
    const p1 = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?limit=2&page=1&sortBy=createdAt&sortDir=asc')
      .set(auth());
    const p2 = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?limit=2&page=2&sortBy=createdAt&sortDir=asc')
      .set(auth());
    expect(p1.body.data).toHaveLength(2);
    expect(p2.body.data).toHaveLength(2);
    const ids1 = p1.body.data.map((d: { id: string }) => d.id);
    const ids2 = p2.body.data.map((d: { id: string }) => d.id);
    expect(ids1).not.toEqual(ids2);
    // No overlap
    expect(ids1.some((id: string) => ids2.includes(id))).toBe(false);
  });

  it('page beyond total returns empty data but correct total', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?page=999')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(4);
  });

  // ── Invalid params ─────────────────────────────────────────────────────────

  it('invalid sortBy → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?sortBy=invalid')
      .set(auth());
    expect(res.status).toBe(400);
  });

  it('invalid sortDir → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?sortDir=sideways')
      .set(auth());
    expect(res.status).toBe(400);
  });

  it('invalid status enum → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?status=unknown')
      .set(auth());
    expect(res.status).toBe(400);
  });

  it('limit=0 → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?limit=0')
      .set(auth());
    expect(res.status).toBe(400);
  });

  it('limit=101 → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/alert-deliveries?limit=101')
      .set(auth());
    expect(res.status).toBe(400);
  });
});
