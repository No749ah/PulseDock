/**
 * Integration tests: V2 Checks and V2 Alert-Channels endpoints.
 *
 * Covers:
 *   GET /v2/checks — paginated check history with monitorId, level, since/until filters
 *   GET /v2/alert-channels — paginated alert channels with type, search, sort, secret redaction
 *
 * Validates: auth guard, pagination meta, field shapes, user isolation, all filter combos,
 * all sort combos, secret redaction, usedByCount, date-range filtering, page+limit params.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('V2 Checks + Alert-Channels (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  let tokenA: string;
  let userIdA: string;
  let tokenB: string;
  let userIdB: string;

  let monitorIdA: string;
  let monitorIdA2: string;
  let channelIdA: string;
  let channelIdA2: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const userA = await createTestUser(prisma, module);
    tokenA = userA.token;
    userIdA = userA.user.id;

    const userB = await createTestUser(prisma, module);
    tokenB = userB.token;
    userIdB = userB.user.id;

    // Create monitors for user A
    const monA = await prisma.monitor.create({
      data: {
        userId: userIdA,
        name: 'Monitor Alpha',
        type: 'HTTP',
        target: 'https://alpha.example.com',
        intervalSec: 60,
        enabled: true,
        configJson: {},
      },
    });
    monitorIdA = monA.id;

    const monA2 = await prisma.monitor.create({
      data: {
        userId: userIdA,
        name: 'Monitor Beta',
        type: 'TCP',
        target: 'beta.example.com:443',
        intervalSec: 120,
        enabled: true,
        configJson: {},
      },
    });
    monitorIdA2 = monA2.id;

    // Seed monitor runs for user A (various levels, times)
    const now = new Date();
    const msAgo = (ms: number) => new Date(now.getTime() - ms);

    await prisma.monitorRun.createMany({
      data: [
        // Monitor A: green runs
        { userId: userIdA, monitorId: monitorIdA, ok: true, status: 200, latencyMs: 45, level: 'green', message: 'OK', checkedAt: msAgo(1000 * 60 * 5), redirectChain: [] },
        { userId: userIdA, monitorId: monitorIdA, ok: true, status: 200, latencyMs: 52, level: 'green', message: 'OK', checkedAt: msAgo(1000 * 60 * 10), redirectChain: [] },
        // Monitor A: red runs
        { userId: userIdA, monitorId: monitorIdA, ok: false, status: 503, latencyMs: 0, level: 'red', message: 'Service Unavailable', checkedAt: msAgo(1000 * 60 * 15), redirectChain: [] },
        // Monitor A: yellow run
        { userId: userIdA, monitorId: monitorIdA, ok: true, status: 200, latencyMs: 3200, level: 'yellow', message: 'Degraded', checkedAt: msAgo(1000 * 60 * 20), redirectChain: [] },
        // Monitor A2: green runs
        { userId: userIdA, monitorId: monitorIdA2, ok: true, status: 0, latencyMs: 22, level: 'green', message: 'TCP OK', checkedAt: msAgo(1000 * 60 * 3), redirectChain: [] },
        { userId: userIdA, monitorId: monitorIdA2, ok: false, status: 0, latencyMs: 0, level: 'red', message: 'Connection refused', checkedAt: msAgo(1000 * 60 * 30), redirectChain: [] },
      ],
    });

    // Monitor B: create monitor + run (must not appear in user A responses)
    const monB = await prisma.monitor.create({
      data: {
        userId: userIdB,
        name: 'Monitor B-Only',
        type: 'HTTP',
        target: 'https://b.example.com',
        intervalSec: 60,
        enabled: true,
        configJson: {},
      },
    });
    await prisma.monitorRun.createMany({
      data: [
        { userId: userIdB, monitorId: monB.id, ok: true, status: 200, latencyMs: 100, level: 'green', message: 'OK', checkedAt: msAgo(1000 * 60), redirectChain: [] },
      ],
    });

    // Create alert channels for user A
    const chA = await prisma.alertChannel.create({
      data: {
        userId: userIdA,
        name: 'Slack Alerts',
        type: 'slack',
        configJson: { webhookUrl: 'https://hooks.slack.com/services/T123/B456/SECRETTOKEN' },
      },
    });
    channelIdA = chA.id;

    const chA2 = await prisma.alertChannel.create({
      data: {
        userId: userIdA,
        name: 'Discord Bot',
        type: 'discord',
        configJson: { botToken: 'Bot.SUPERSECRET.TOKEN', webhookUrl: 'https://discord.com/api/webhooks/123/ABCDEFGHIJ' },
      },
    });
    channelIdA2 = chA2.id;

    // Link channel to monitor A (usedByCount test)
    await prisma.monitorAlert.create({
      data: { monitorId: monitorIdA, alertChannelId: channelIdA },
    });

    // Create alert channel for user B (must not appear in user A responses)
    await prisma.alertChannel.create({
      data: {
        userId: userIdB,
        name: 'B-Only Channel',
        type: 'email',
        configJson: { to: 'b@example.com' },
      },
    });
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userIdA);
    await cleanupTestUser(prisma, userIdB);
    await destroyTestApp(app);
  }, 15000);

  const authA = () => ({ Authorization: `Bearer ${tokenA}` });
  const authB = () => ({ Authorization: `Bearer ${tokenB}` });

  // ─── V2 CHECKS ──────────────────────────────────────────────────────────────

  describe('GET /v2/checks', () => {

    it('requires auth — 401 without token', async () => {
      const res = await request(app.getHttpServer()).get('/v2/checks');
      expect([401, 403]).toContain(res.status);
    });

    it('returns paginated envelope with data + meta', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks')
        .set(authA())
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('page');
      expect(res.body.meta).toHaveProperty('limit');
      expect(res.body.meta).toHaveProperty('pages');
    });

    it('returns only authenticated user runs — not user B runs', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks')
        .set(authA())
        .expect(200);

      const monitorIds = res.body.data.map((r: { monitorId: string }) => r.monitorId);
      expect(monitorIds).not.toContain('b-monitor-id');
      // All returned runs belong to user A monitors
      for (const run of res.body.data) {
        expect([monitorIdA, monitorIdA2]).toContain(run.monitorId);
      }
    });

    it('user B only sees their own runs (isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks')
        .set(authB())
        .expect(200);

      for (const run of res.body.data) {
        expect(run.monitorId).not.toBe(monitorIdA);
        expect(run.monitorId).not.toBe(monitorIdA2);
      }
    });

    it('meta.total matches all user A runs', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks?limit=200')
        .set(authA())
        .expect(200);

      expect(res.body.meta.total).toBe(6);
      expect(res.body.data.length).toBe(6);
    });

    it('filters by monitorId — returns only that monitor runs', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v2/checks?monitorId=${monitorIdA}`)
        .set(authA())
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      for (const run of res.body.data) {
        expect(run.monitorId).toBe(monitorIdA);
      }
      // Should be 4 runs seeded for monitorIdA
      expect(res.body.meta.total).toBe(4);
    });

    it('filters by monitorId — returns only monitorA2 runs', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v2/checks?monitorId=${monitorIdA2}`)
        .set(authA())
        .expect(200);

      expect(res.body.meta.total).toBe(2);
      for (const run of res.body.data) {
        expect(run.monitorId).toBe(monitorIdA2);
      }
    });

    it('filters by level=green', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks?level=green')
        .set(authA())
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      for (const run of res.body.data) {
        expect(run.level).toBe('green');
      }
    });

    it('filters by level=red', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks?level=red')
        .set(authA())
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      for (const run of res.body.data) {
        expect(run.level).toBe('red');
      }
      // 2 red runs seeded (monitorA + monitorA2)
      expect(res.body.meta.total).toBe(2);
    });

    it('filters by level=yellow', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks?level=yellow')
        .set(authA())
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].level).toBe('yellow');
    });

    it('filters by monitorId + level combined', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v2/checks?monitorId=${monitorIdA}&level=red`)
        .set(authA())
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].monitorId).toBe(monitorIdA);
      expect(res.body.data[0].level).toBe('red');
    });

    it('filters by since (returns only runs after the timestamp)', async () => {
      // since = 12 minutes ago; should exclude the 15min, 20min, 30min runs
      const since = new Date(Date.now() - 1000 * 60 * 12).toISOString();
      const res = await request(app.getHttpServer())
        .get(`/v2/checks?since=${encodeURIComponent(since)}`)
        .set(authA())
        .expect(200);

      // 5min, 10min, 3min runs = 3 runs within last 12 minutes
      expect(res.body.meta.total).toBe(3);
    });

    it('filters by until (returns only runs before the timestamp)', async () => {
      // until = 12 minutes ago; should return runs older than 12 minutes
      const until = new Date(Date.now() - 1000 * 60 * 12).toISOString();
      const res = await request(app.getHttpServer())
        .get(`/v2/checks?until=${encodeURIComponent(until)}`)
        .set(authA())
        .expect(200);

      // 15min, 20min, 30min runs = 3 runs
      expect(res.body.meta.total).toBe(3);
    });

    it('filters by since + until (date range)', async () => {
      const since = new Date(Date.now() - 1000 * 60 * 25).toISOString();
      const until = new Date(Date.now() - 1000 * 60 * 8).toISOString();
      const res = await request(app.getHttpServer())
        .get(`/v2/checks?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`)
        .set(authA())
        .expect(200);

      // Runs between 8min and 25min ago: 10min, 15min, 20min = 3 runs
      expect(res.body.meta.total).toBe(3);
    });

    it('respects limit param (page size)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks?limit=2')
        .set(authA())
        .expect(200);

      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.limit).toBe(2);
      expect(res.body.meta.pages).toBe(3); // 6 total / 2 per page
    });

    it('respects page param (offset pagination)', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/v2/checks?limit=3&page=1')
        .set(authA())
        .expect(200);

      const page2 = await request(app.getHttpServer())
        .get('/v2/checks?limit=3&page=2')
        .set(authA())
        .expect(200);

      expect(page1.body.data.length).toBe(3);
      expect(page2.body.data.length).toBe(3);

      // No overlap between pages
      const ids1 = page1.body.data.map((r: { id: string }) => r.id);
      const ids2 = page2.body.data.map((r: { id: string }) => r.id);
      expect(ids1.some((id: string) => ids2.includes(id))).toBe(false);
    });

    it('returns ordered by checkedAt desc by default', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks?limit=200')
        .set(authA())
        .expect(200);

      const times = res.body.data.map((r: { checkedAt: string }) => new Date(r.checkedAt).getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
      }
    });

    it('run shape includes all expected fields', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v2/checks?monitorId=${monitorIdA}&limit=1`)
        .set(authA())
        .expect(200);

      const run = res.body.data[0];
      expect(run).toHaveProperty('id');
      expect(run).toHaveProperty('monitorId');
      expect(run).toHaveProperty('checkedAt');
      expect(run).toHaveProperty('ok');
      expect(run).toHaveProperty('statusCode');
      expect(run).toHaveProperty('latencyMs');
      expect(run).toHaveProperty('message');
      expect(run).toHaveProperty('level');
      // checkedAt must be ISO string
      expect(() => new Date(run.checkedAt)).not.toThrow();
      expect(typeof run.ok).toBe('boolean');
    });

    it('returns empty data + total:0 for unknown monitorId', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks?monitorId=nonexistent-id-xyz')
        .set(authA())
        .expect(200);

      expect(res.body.meta.total).toBe(0);
      expect(res.body.data).toEqual([]);
    });

    it('defaults to limit 50 when not specified', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks')
        .set(authA())
        .expect(200);

      expect(res.body.meta.limit).toBe(50);
    });

    it('meta.pages is ceil(total / limit)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks?limit=4')
        .set(authA())
        .expect(200);

      const expectedPages = Math.ceil(res.body.meta.total / 4);
      expect(res.body.meta.pages).toBe(expectedPages);
    });
  });

  // ─── V2 ALERT CHANNELS ──────────────────────────────────────────────────────

  describe('GET /v2/alert-channels', () => {

    it('requires auth — 401 without token', async () => {
      const res = await request(app.getHttpServer()).get('/v2/alert-channels');
      expect([401, 403]).toContain(res.status);
    });

    it('returns paginated envelope with data + meta', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(authA())
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('page');
      expect(res.body.meta).toHaveProperty('limit');
      expect(res.body.meta).toHaveProperty('pages');
    });

    it('returns only user A channels — not user B channels', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(authA())
        .expect(200);

      const names = res.body.data.map((c: { name: string }) => c.name);
      expect(names).not.toContain('B-Only Channel');
      expect(res.body.meta.total).toBe(2);
    });

    it('user B does not see user A channels (isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(authB())
        .expect(200);

      const ids = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(channelIdA);
      expect(ids).not.toContain(channelIdA2);
    });

    it('channel shape includes all expected fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(authA())
        .expect(200);

      const channel = res.body.data.find((c: { id: string }) => c.id === channelIdA);
      expect(channel).toBeDefined();
      expect(channel).toHaveProperty('id');
      expect(channel).toHaveProperty('name');
      expect(channel).toHaveProperty('type');
      expect(channel).toHaveProperty('config');
      expect(channel).toHaveProperty('usedByCount');
      expect(channel).toHaveProperty('createdAt');
      expect(() => new Date(channel.createdAt)).not.toThrow();
    });

    it('redacts webhookUrl to protocol+host only (Slack)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(authA())
        .expect(200);

      const slack = res.body.data.find((c: { id: string }) => c.id === channelIdA);
      expect(slack).toBeDefined();
      expect(slack.config.webhookUrl).toBe('https://hooks.slack.com/[redacted]');
      expect(slack.config.webhookUrl).not.toContain('SECRETTOKEN');
    });

    it('redacts webhookUrl to protocol+host only (Discord)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(authA())
        .expect(200);

      const discord = res.body.data.find((c: { id: string }) => c.id === channelIdA2);
      expect(discord).toBeDefined();
      expect(discord.config.webhookUrl).toBe('https://discord.com/[redacted]');
      expect(discord.config.webhookUrl).not.toContain('ABCDEFGHIJ');
    });

    it('redacts botToken as [redacted]', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(authA())
        .expect(200);

      const discord = res.body.data.find((c: { id: string }) => c.id === channelIdA2);
      expect(discord.config.botToken).toBe('[redacted]');
      expect(discord.config.botToken).not.toContain('SUPERSECRET');
    });

    it('usedByCount = 1 for channel linked to monitor A', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(authA())
        .expect(200);

      const slack = res.body.data.find((c: { id: string }) => c.id === channelIdA);
      expect(slack.usedByCount).toBe(1);
    });

    it('usedByCount = 0 for channel not linked to any monitor', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(authA())
        .expect(200);

      const discord = res.body.data.find((c: { id: string }) => c.id === channelIdA2);
      expect(discord.usedByCount).toBe(0);
    });

    it('filters by type=slack', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?type=slack')
        .set(authA())
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].type).toBe('slack');
    });

    it('filters by type=discord', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?type=discord')
        .set(authA())
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].type).toBe('discord');
    });

    it('filters by type with no matches returns empty (pagerduty — no channels of that type seeded)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?type=pagerduty')
        .set(authA())
        .expect(200);

      expect(res.body.meta.total).toBe(0);
      expect(res.body.data).toEqual([]);
    });

    it('searches by name (case-insensitive partial match)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?search=slack')
        .set(authA())
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].name.toLowerCase()).toContain('slack');
    });

    it('search=DISCORD (uppercase) matches Discord Bot', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?search=DISCORD')
        .set(authA())
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].id).toBe(channelIdA2);
    });

    it('search with no matches returns empty', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?search=nonexistent-channel-xyz')
        .set(authA())
        .expect(200);

      expect(res.body.meta.total).toBe(0);
      expect(res.body.data).toEqual([]);
    });

    it('sorts by name asc', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?sortBy=name&sortDir=asc')
        .set(authA())
        .expect(200);

      const names = res.body.data.map((c: { name: string }) => c.name);
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sorted);
    });

    it('sorts by name desc', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?sortBy=name&sortDir=desc')
        .set(authA())
        .expect(200);

      const names = res.body.data.map((c: { name: string }) => c.name);
      const sorted = [...names].sort((a, b) => b.localeCompare(a));
      expect(names).toEqual(sorted);
    });

    it('sorts by createdAt desc (default)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(authA())
        .expect(200);

      const times = res.body.data.map((c: { createdAt: string }) => new Date(c.createdAt).getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
      }
    });

    it('sorts by createdAt asc', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?sortBy=createdAt&sortDir=asc')
        .set(authA())
        .expect(200);

      const times = res.body.data.map((c: { createdAt: string }) => new Date(c.createdAt).getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i - 1]).toBeLessThanOrEqual(times[i]);
      }
    });

    it('respects limit param', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?limit=1')
        .set(authA())
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.meta.limit).toBe(1);
      expect(res.body.meta.pages).toBe(2);
    });

    it('page 2 returns remaining channel', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?limit=1&page=2')
        .set(authA())
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.meta.page).toBe(2);
    });

    it('page beyond total returns empty data', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?limit=10&page=99')
        .set(authA())
        .expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(2);
    });

    it('type filter + search combined (both filters applied)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?type=slack&search=Slack')
        .set(authA())
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].type).toBe('slack');
    });

    it('type filter + search no-match combination returns empty', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?type=slack&search=Discord')
        .set(authA())
        .expect(200);

      expect(res.body.meta.total).toBe(0);
    });
  });
});
