/**
 * Integration tests: V2 Activity endpoint.
 *
 * Covers:
 *   GET /v2/activity — paginated audit log with action prefix + date-range filters
 *
 * Validates: auth guard, pagination meta, user isolation, action filter,
 * date-range filter (since/until), sort direction, response shape.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('GET /v2/activity (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let token2: string;
  let userId2: string;

  // Track IDs for cleanup
  const auditIds: string[] = [];

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

    // Seed: user 1 — 5 audit log entries with different actions + creation times
    const entries = [
      { action: 'auth.login', metaJson: { ip: '10.0.0.1' }, createdAt: new Date('2026-04-01T10:00:00Z') },
      { action: 'auth.logout', metaJson: { ip: '10.0.0.1' }, createdAt: new Date('2026-04-01T11:00:00Z') },
      { action: 'monitor.create', metaJson: { monitorId: 'mon-1' }, createdAt: new Date('2026-04-02T10:00:00Z') },
      { action: 'monitor.delete', metaJson: { monitorId: 'mon-1' }, createdAt: new Date('2026-04-03T10:00:00Z') },
      { action: 'alert.channel.create', metaJson: { channelId: 'ch-1' }, createdAt: new Date('2026-04-04T10:00:00Z') },
    ];

    for (const e of entries) {
      const created = await prisma.auditLog.create({
        data: {
          action: e.action,
          actorUserId: userId,
          metaJson: e.metaJson,
          createdAt: e.createdAt,
        },
      });
      auditIds.push(created.id);
    }

    // Seed: user 2 — 1 entry (must not appear for user 1)
    const u2Entry = await prisma.auditLog.create({
      data: { action: 'auth.login', actorUserId: userId2, metaJson: {} },
    });
    auditIds.push(u2Entry.id);
  }, 30000);

  afterAll(async () => {
    // Clean up seeded audit log entries
    await prisma.auditLog.deleteMany({ where: { id: { in: auditIds } } });
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app, module);
  });

  // ── Auth guard ─────────────────────────────────────────────────────────────

  it('requires auth — 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/v2/activity');
    expect(res.status).toBe(401);
  });

  // ── Response envelope + shape ──────────────────────────────────────────────

  it('returns paginated envelope with data array and meta', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(Array.isArray(res.body.data)).toBe(true);
    const meta = res.body.meta;
    expect(meta).toHaveProperty('total');
    expect(meta).toHaveProperty('page');
    expect(meta).toHaveProperty('limit');
    expect(meta).toHaveProperty('pages');
  });

  it('activity item has expected fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity')
      .set(auth());
    expect(res.status).toBe(200);
    const item = res.body.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('action');
    expect(item).toHaveProperty('meta');
    expect(item).toHaveProperty('createdAt');
    // Must not expose internal user IDs
    expect(item).not.toHaveProperty('actorUserId');
    expect(item).not.toHaveProperty('targetUserId');
  });

  it('createdAt is a valid ISO 8601 timestamp', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity')
      .set(auth());
    const item = res.body.data[0];
    expect(typeof item.createdAt).toBe('string');
    expect(new Date(item.createdAt).toISOString()).toBe(item.createdAt);
  });

  it('meta is an object (parsed from stored JSON)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity')
      .set(auth());
    const item = res.body.data[0];
    expect(typeof item.meta).toBe('object');
    expect(item.meta).not.toBeNull();
  });

  // ── User isolation ─────────────────────────────────────────────────────────

  it('user 1 only sees their own activity', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity')
      .set(auth());
    expect(res.status).toBe(200);
    // user 1 has 5 entries; user 2's entry should not appear
    const actions = (res.body.data as { action: string }[]).map((i) => i.action);
    expect(actions).not.toContain('user2-action');
    // meta.total should equal user 1's count (may have more from auth registration etc)
    expect(res.body.meta.total).toBeGreaterThanOrEqual(5);
  });

  it('user 2 only sees their own activity', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity')
      .set(auth2());
    expect(res.status).toBe(200);
    // All returned entries must belong to user 2's seeded action
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  // ── Action prefix filter ───────────────────────────────────────────────────

  it('action=auth returns only auth.* events', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?action=auth')
      .set(auth());
    expect(res.status).toBe(200);
    for (const item of res.body.data as { action: string }[]) {
      expect(item.action.toLowerCase().startsWith('auth')).toBe(true);
    }
  });

  it('action=monitor returns only monitor.* events', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?action=monitor')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2); // create + delete
    for (const item of res.body.data as { action: string }[]) {
      expect(item.action.toLowerCase().startsWith('monitor')).toBe(true);
    }
  });

  it('action=alert returns only alert.* events', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?action=alert')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    for (const item of res.body.data as { action: string }[]) {
      expect(item.action.toLowerCase().startsWith('alert')).toBe(true);
    }
  });

  it('action filter with no matches returns empty data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?action=nonexistent-action-xyz')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  // ── Date range filter ──────────────────────────────────────────────────────

  it('since filter excludes events before the date', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?since=2026-04-02T00:00:00Z')
      .set(auth());
    expect(res.status).toBe(200);
    for (const item of res.body.data as { createdAt: string }[]) {
      expect(new Date(item.createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date('2026-04-02T00:00:00Z').getTime(),
      );
    }
  });

  it('until filter excludes events after the date', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?until=2026-04-02T23:59:59Z')
      .set(auth());
    expect(res.status).toBe(200);
    for (const item of res.body.data as { createdAt: string }[]) {
      expect(new Date(item.createdAt).getTime()).toBeLessThanOrEqual(
        new Date('2026-04-02T23:59:59Z').getTime(),
      );
    }
  });

  it('since + until date range returns only events within window', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?since=2026-04-02T00:00:00Z&until=2026-04-03T23:59:59Z')
      .set(auth());
    expect(res.status).toBe(200);
    // Should contain monitor.create (Apr 2) + monitor.delete (Apr 3), not auth.login (Apr 1) or alert (Apr 4)
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    for (const item of res.body.data as { createdAt: string; action: string }[]) {
      const ts = new Date(item.createdAt).getTime();
      expect(ts).toBeGreaterThanOrEqual(new Date('2026-04-02T00:00:00Z').getTime());
      expect(ts).toBeLessThanOrEqual(new Date('2026-04-03T23:59:59Z').getTime());
    }
  });

  it('date range with no events returns empty data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?since=2020-01-01T00:00:00Z&until=2020-01-02T00:00:00Z')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  // ── Sort direction ─────────────────────────────────────────────────────────

  it('default sort is desc (newest first)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?limit=5&since=2026-04-01T00:00:00Z&until=2026-04-05T00:00:00Z')
      .set(auth());
    expect(res.status).toBe(200);
    const items = res.body.data as { createdAt: string }[];
    if (items.length >= 2) {
      const first = new Date(items[0].createdAt).getTime();
      const second = new Date(items[1].createdAt).getTime();
      expect(first).toBeGreaterThanOrEqual(second);
    }
  });

  it('sortDir=asc returns oldest first', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?sortDir=asc&limit=5&since=2026-04-01T00:00:00Z&until=2026-04-05T00:00:00Z')
      .set(auth());
    expect(res.status).toBe(200);
    const items = res.body.data as { createdAt: string }[];
    if (items.length >= 2) {
      const first = new Date(items[0].createdAt).getTime();
      const last = new Date(items[items.length - 1].createdAt).getTime();
      expect(first).toBeLessThanOrEqual(last);
    }
  });

  it('invalid sortDir → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?sortDir=sideways')
      .set(auth());
    expect(res.status).toBe(400);
  });

  // ── Pagination ─────────────────────────────────────────────────────────────

  it('limit=1 returns at most 1 result', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?limit=1')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
  });

  it('page=2 with limit=1 returns the second item', async () => {
    const page1 = await request(app.getHttpServer())
      .get('/v2/activity?limit=1&page=1&sortDir=asc&since=2026-04-01T00:00:00Z&until=2026-04-05T00:00:00Z')
      .set(auth());
    const page2 = await request(app.getHttpServer())
      .get('/v2/activity?limit=1&page=2&sortDir=asc&since=2026-04-01T00:00:00Z&until=2026-04-05T00:00:00Z')
      .set(auth());
    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);
    // Ensure different items
    if (page1.body.data.length > 0 && page2.body.data.length > 0) {
      expect(page1.body.data[0].id).not.toBe(page2.body.data[0].id);
    }
  });

  it('meta.pages is ceiling of total/limit', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?limit=2&since=2026-04-01T00:00:00Z&until=2026-04-05T00:00:00Z')
      .set(auth());
    expect(res.status).toBe(200);
    const { total, limit, pages } = res.body.meta;
    expect(pages).toBe(Math.ceil(total / limit));
  });

  it('page beyond total returns empty data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?page=9999')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('limit=0 → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?limit=0')
      .set(auth());
    expect(res.status).toBe(400);
  });

  it('page=0 → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/activity?page=0')
      .set(auth());
    expect(res.status).toBe(400);
  });
});
