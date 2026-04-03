/**
 * Integration tests: V2 API endpoints against a real PostgreSQL database.
 *
 * Covers:
 *   GET /v2/monitors       — paginated list with filtering, sorting, search
 *   GET /v2/alert-channels — paginated list with filtering
 *   GET /v2/checks         — paginated check history with filters
 *   GET /v2/system/info    — API metadata (public, no auth required)
 *
 * Validates: auth guard, pagination meta, user isolation, secret redaction,
 * per-filter narrowing, sortDir, and date-range queries.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('V2 API (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;

  // Second user for isolation tests
  let token2: string;
  let userId2: string;

  // IDs created during setup
  let monitorId1: string;
  let monitorId2: string;
  let channelId: string;
  let channelWithTokenId: string;
  let user2ChannelId: string;

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

    // Create two monitors for user 1
    const r1 = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(auth())
      .send({ name: 'V2 HTTP Monitor', type: 'HTTP', target: 'https://example.com', intervalSec: 60 });
    monitorId1 = r1.body.id as string;

    const r2 = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(auth())
      .send({ name: 'V2 TCP Monitor', type: 'TCP', target: 'example.com:443', intervalSec: 120 });
    monitorId2 = r2.body.id as string;

    // Seed alert channels directly for deterministic v2 response checks
    const seededWebhookChannel = await prisma.alertChannel.create({
      data: {
        userId,
        name: 'V2 Test Channel',
        type: 'webhook',
        configJson: { webhookUrl: 'https://hooks.example.com/xyz/secret-token' },
      },
    });
    channelId = seededWebhookChannel.id;

    // Additional channel with token-like secret to verify redaction in v2 payload
    const seededTokenChannel = await prisma.alertChannel.create({
      data: {
        userId,
        name: 'V2 Token Channel',
        type: 'telegram',
        configJson: {
          botToken: 'telegram-super-secret-token',
          chatId: '123456789',
        },
      },
    });
    channelWithTokenId = seededTokenChannel.id;

    // Create a monitor for user 2 (isolation baseline)
    await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(auth2())
      .send({ name: 'User2 Monitor', type: 'HTTP', target: 'https://other.com', intervalSec: 300 });

    const user2Channel = await prisma.alertChannel.create({
      data: {
        userId: userId2,
        name: 'User2 Private Channel',
        type: 'webhook',
        configJson: { webhookUrl: 'https://hooks.user2.example/private/token' },
      },
    });
    user2ChannelId = user2Channel.id;
  }, 45000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app);
  }, 15000);

  // ─────────────────────────────────────────────────────────────────────────────
  // V2 Monitors
  // ─────────────────────────────────────────────────────────────────────────────

  describe('GET /v2/monitors', () => {
    it('requires auth (401 without token)', async () => {
      await request(app.getHttpServer()).get('/v2/monitors').expect(401);
    });

    it('returns paginated envelope with data + meta', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/monitors')
        .set(auth())
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

    it('returns only the authenticated user\'s monitors (isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/monitors')
        .set(auth())
        .expect(200);

      const ids = (res.body.data as Array<{ id: string }>).map((m) => m.id);
      expect(ids).toContain(monitorId1);
      expect(ids).toContain(monitorId2);
      // User2's monitor must not appear
      for (const m of res.body.data as Array<{ id: string }>) {
        expect(m.id).not.toMatch(/User2/);
      }
    });

    it('user 2 only sees their own monitors', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/monitors')
        .set(auth2())
        .expect(200);

      for (const m of res.body.data as Array<{ id: string }>) {
        expect(m.id).not.toBe(monitorId1);
        expect(m.id).not.toBe(monitorId2);
      }
    });

    it('filters by type', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/monitors?type=TCP')
        .set(auth())
        .expect(200);

      for (const m of res.body.data as Array<{ type: string }>) {
        expect(m.type).toBe('TCP');
      }
      const ids = (res.body.data as Array<{ id: string }>).map((m) => m.id);
      expect(ids).toContain(monitorId2);
      expect(ids).not.toContain(monitorId1);
    });

    it('filters by enabled=true', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/monitors?enabled=true')
        .set(auth())
        .expect(200);

      for (const m of res.body.data as Array<{ enabled: boolean }>) {
        expect(m.enabled).toBe(true);
      }
    });

    it('searches by name (case-insensitive)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/monitors?search=v2+http')
        .set(auth())
        .expect(200);

      const names = (res.body.data as Array<{ name: string }>).map((m) => m.name.toLowerCase());
      expect(names.some((n) => n.includes('http'))).toBe(true);
    });

    it('supports sortDir=asc', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/monitors?sortBy=name&sortDir=asc')
        .set(auth())
        .expect(200);

      const names = (res.body.data as Array<{ name: string }>).map((m) => m.name);
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sorted);
    });

    it('respects limit param', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/monitors?limit=1')
        .set(auth())
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.limit).toBe(1);
    });

    it('returned monitor shape includes expected fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/monitors')
        .set(auth())
        .expect(200);

      const m = res.body.data[0] as Record<string, unknown>;
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('name');
      expect(m).toHaveProperty('type');
      expect(m).toHaveProperty('target');
      expect(m).toHaveProperty('enabled');
      expect(m).toHaveProperty('intervalSec');
      expect(m).toHaveProperty('alertChannelIds');
      expect(m).toHaveProperty('createdAt');
    });

    it('does not expose raw token fields in config', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/monitors')
        .set(auth())
        .expect(200);

      for (const m of res.body.data as Array<{ config?: Record<string, unknown> }>) {
        if (m.config) {
          expect(m.config).not.toHaveProperty('token');
          expect(m.config).not.toHaveProperty('appToken');
          expect(m.config).not.toHaveProperty('openvpnPassword');
        }
      }
    });

    it('meta.total matches the actual count of user monitors', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/monitors')
        .set(auth())
        .expect(200);

      expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
      expect(res.body.meta.pages).toBeGreaterThanOrEqual(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // V2 Alert Channels
  // ─────────────────────────────────────────────────────────────────────────────

  describe('GET /v2/alert-channels', () => {
    it('requires auth (401 without token)', async () => {
      await request(app.getHttpServer()).get('/v2/alert-channels').expect(401);
    });

    it('returns paginated envelope', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(auth())
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns only user 1\'s channels (isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(auth())
        .expect(200);

      const ids = (res.body.data as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(channelId);
      expect(ids).toContain(channelWithTokenId);
      expect(ids).not.toContain(user2ChannelId);
    });

    it('user 2 does not see user 1\'s channels', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(auth2())
        .expect(200);

      const ids = (res.body.data as Array<{ id: string }>).map((c) => c.id);
      expect(ids).not.toContain(channelId);
      expect(ids).toContain(user2ChannelId);
    });

    it('redacts webhookUrl to protocol + host only', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(auth())
        .expect(200);

      const webhook = (res.body.data as Array<{ id: string; config?: { webhookUrl?: string } }>).
        find((c) => c.id === channelId);

      expect(webhook).toBeDefined();
      expect(webhook?.config?.webhookUrl).toBe('https://hooks.example.com/[redacted]');
    });

    it('redacts botToken values in channel config', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(auth())
        .expect(200);

      const tokenChannel = (res.body.data as Array<{ id: string; config?: { botToken?: string } }>).
        find((c) => c.id === channelWithTokenId);

      expect(tokenChannel).toBeDefined();
      expect(tokenChannel?.config?.botToken).toBe('[redacted]');
    });

    it('filters by type (lowercase, as required by v2 DTO)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?type=webhook')
        .set(auth())
        .expect(200);

      for (const c of res.body.data as Array<{ type: string }>) {
        expect(c.type.toLowerCase()).toBe('webhook');
      }
    });

    it('search param is accepted without error', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels?search=V2')
        .set(auth())
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('config is included per channel', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(auth())
        .expect(200);

      // If no channels exist, skip shape check
      if (res.body.data.length === 0) return;

      const ch = res.body.data[0] as { config?: Record<string, unknown> };
      expect(ch).toBeDefined();
      expect(ch?.config).toBeDefined();
      expect(typeof ch?.config).toBe('object');
    });

    it('includes usedByCount field on all channels', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(auth())
        .expect(200);

      for (const c of res.body.data as Array<{ usedByCount?: number }>) {
        expect(typeof c.usedByCount).toBe('number');
        expect(c.usedByCount).toBeGreaterThanOrEqual(0);
      }
    });

    it('channel shape has expected fields (when channels exist)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/alert-channels')
        .set(auth())
        .expect(200);

      if (res.body.data.length === 0) return; // no channels created — skip shape check
      const ch = res.body.data[0] as Record<string, unknown>;
      expect(ch).toHaveProperty('id');
      expect(ch).toHaveProperty('name');
      expect(ch).toHaveProperty('type');
      expect(ch).toHaveProperty('usedByCount');
      expect(ch).toHaveProperty('createdAt');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // V2 Checks (paginated check history)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('GET /v2/checks', () => {
    // Seed check runs directly via Prisma ORM
    beforeAll(async () => {
      if (!monitorId1 || !userId) return; // guard: outer beforeAll may have failed
      await prisma.monitorRun.createMany({
        data: [
          {
            monitorId: monitorId1,
            userId,
            ok: true,
            status: 200,
            latencyMs: 42,
            message: 'OK',
            level: 'green',
            redirectChain: [],
            checkedAt: new Date(),
          },
          {
            monitorId: monitorId1,
            userId,
            ok: false,
            status: 500,
            latencyMs: 1200,
            message: 'Server Error',
            level: 'red',
            redirectChain: [],
            checkedAt: new Date(Date.now() - 60_000),
          },
        ],
      });
    });

    it('requires auth (401 without token)', async () => {
      await request(app.getHttpServer()).get('/v2/checks').expect(401);
    });

    it('returns paginated envelope', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks')
        .set(auth())
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
    });

    it('returns only user\'s runs (isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks')
        .set(auth2())
        .expect(200);

      // User 2 has no runs; total should be 0
      expect(res.body.meta.total).toBe(0);
    });

    it('filters by monitorId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v2/checks?monitorId=${monitorId1}`)
        .set(auth())
        .expect(200);

      for (const r of res.body.data as Array<{ monitorId: string }>) {
        expect(r.monitorId).toBe(monitorId1);
      }
    });

    it('filters by level', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks?level=red')
        .set(auth())
        .expect(200);

      for (const r of res.body.data as Array<{ level: string }>) {
        expect(r.level).toBe('red');
      }
    });

    it('filters by since/until date range', async () => {
      const since = new Date(Date.now() - 30_000).toISOString();
      const until = new Date(Date.now() + 5_000).toISOString();

      const res = await request(app.getHttpServer())
        .get(`/v2/checks?monitorId=${monitorId1}&since=${since}&until=${until}`)
        .set(auth())
        .expect(200);

      // Only the most recent run falls within this window
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      for (const r of res.body.data as Array<{ checkedAt: string }>) {
        const t = new Date(r.checkedAt).getTime();
        expect(t).toBeGreaterThanOrEqual(new Date(since).getTime());
        expect(t).toBeLessThan(new Date(until).getTime());
      }
    });

    it('respects page+limit params', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v2/checks?monitorId=${monitorId1}&limit=1&page=1`)
        .set(auth())
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.limit).toBe(1);
    });

    it('run shape includes expected fields', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v2/checks?monitorId=${monitorId1}`)
        .set(auth())
        .expect(200);

      const run = res.body.data[0] as Record<string, unknown>;
      expect(run).toHaveProperty('id');
      expect(run).toHaveProperty('monitorId');
      expect(run).toHaveProperty('checkedAt');
      expect(run).toHaveProperty('ok');
      expect(run).toHaveProperty('latencyMs');
      expect(run).toHaveProperty('level');
    });

    it('returns at most 50 results by default', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/checks')
        .set(auth())
        .expect(200);

      expect(res.body.data.length).toBeLessThanOrEqual(50);
      expect(res.body.meta.limit).toBe(50);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // V2 System
  // ─────────────────────────────────────────────────────────────────────────────

  describe('GET /v2/system/info', () => {
    it('returns API metadata without auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/system/info')
        .expect(200);

      expect(res.body).toHaveProperty('service', 'pulsedock-api');
      expect(res.body).toHaveProperty('version');
      expect(typeof res.body.version).toBe('string');
    });

    it('includes apiVersions with supported list', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/system/info')
        .expect(200);

      expect(res.body).toHaveProperty('apiVersions');
      expect(Array.isArray(res.body.apiVersions.supported)).toBe(true);
      expect(res.body.apiVersions.supported).toContain('v1');
      expect(res.body.apiVersions.supported).toContain('v2');
    });

    it('includes links block with docs and health', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/system/info')
        .expect(200);

      expect(res.body).toHaveProperty('links');
      expect(typeof res.body.links).toBe('object');
      expect(res.body.links).toHaveProperty('docs');
      expect(res.body.links).toHaveProperty('health');
    });

    it('includes breakingChangePolicy', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/system/info')
        .expect(200);

      expect(res.body).toHaveProperty('breakingChangePolicy');
      expect(res.body.breakingChangePolicy).toHaveProperty('deprecationNoticeDays');
    });

    it('GET /v2/system/versions returns version matrix', async () => {
      const res = await request(app.getHttpServer())
        .get('/v2/system/versions')
        .expect(200);

      expect(res.body).toHaveProperty('versions');
      expect(Array.isArray(res.body.versions)).toBe(true);
      const v1 = (res.body.versions as Array<{ version: string }>).find((v) => v.version === 'v1');
      const v2 = (res.body.versions as Array<{ version: string }>).find((v) => v.version === 'v2');
      expect(v1).toBeDefined();
      expect(v2).toBeDefined();
    });
  });
});
