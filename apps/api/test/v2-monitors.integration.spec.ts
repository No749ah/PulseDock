/**
 * Integration tests: GET /v2/monitors — extended coverage.
 *
 * Covers:
 *   - Auth guard (401 without token)
 *   - Paginated envelope shape (data + meta)
 *   - User isolation (user B cannot see user A's monitors)
 *   - All 17 monitor types accepted by the type filter (expanded from 6)
 *   - enabled=true/false filter
 *   - Full-text search on name and target
 *   - Sort by name/createdAt/type/intervalSec + sortDir asc/desc
 *   - Pagination (limit/page/meta.pages)
 *   - Response shape (all expected fields present, secrets redacted)
 *   - alertChannelIds populated when channel is linked
 *   - folderId field present (null or string)
 *   - meta.total matches count for user
 *   - Invalid type → 400
 *   - Invalid sortBy → 400
 *   - Invalid sortDir → 400
 *   - Invalid page/limit bounds → 400
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('GET /v2/monitors (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let token2: string;
  let userId2: string;

  // IDs for cleanup assertions
  let httpMonitorId: string;
  let dnsMonitorId: string;
  let disabledMonitorId: string;
  let channelId: string;
  let folderId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const u1 = await createTestUser(prisma, module);
    token = u1.token;
    userId = u1.user.id;

    const u2 = await createTestUser(prisma, module);
    token2 = u2.token;
    userId2 = u2.user.id;

    // Seed a folder for user 1
    const folder = await prisma.folder.create({
      data: { userId, name: 'Test Folder', position: 0 },
    });
    folderId = folder.id;

    // Seed an alert channel for user 1
    const channel = await prisma.alertChannel.create({
      data: { userId, name: 'Test Channel', type: 'webhook', configJson: { webhookUrl: 'https://hooks.example.com/token' } },
    });
    channelId = channel.id;

    // Seed monitors for user 1 across several types
    const httpMonitor = await prisma.monitor.create({
      data: {
        userId,
        name: 'HTTP Alpha',
        type: 'HTTP',
        target: 'https://alpha.example.com',
        enabled: true,
        intervalSec: 60,
        timeoutMs: 10000,
        folderId,
        configJson: {},
      },
    });
    httpMonitorId = httpMonitor.id;

    // Link the channel to the HTTP monitor
    await prisma.monitorAlert.create({
      data: { monitorId: httpMonitorId, alertChannelId: channelId, notifyOn: 'DOWN' },
    });

    const dnsMonitor = await prisma.monitor.create({
      data: {
        userId,
        name: 'DNS Beta',
        type: 'DNS',
        target: 'example.com',
        enabled: true,
        intervalSec: 300,
        timeoutMs: 5000,
        configJson: {},
      },
    });
    dnsMonitorId = dnsMonitor.id;

    // Disabled monitor
    const disabledMonitor = await prisma.monitor.create({
      data: {
        userId,
        name: 'Disabled Monitor',
        type: 'TCP',
        target: 'example.com:5432',
        enabled: false,
        intervalSec: 120,
        timeoutMs: 5000,
        configJson: {},
      },
    });
    disabledMonitorId = disabledMonitor.id;

    // Monitor with secrets in config (should be redacted)
    await prisma.monitor.create({
      data: {
        userId,
        name: 'Git Release Monitor',
        type: 'GIT_RELEASE',
        target: 'No749ah/PulseDock',
        enabled: true,
        intervalSec: 3600,
        timeoutMs: 10000,
        configJson: { token: 'ghp_supersecrettoken', appToken: 'another-secret' },
      },
    });

    // Monitor for user 2 (isolation check)
    await prisma.monitor.create({
      data: {
        userId: userId2,
        name: 'User2 Private Monitor',
        type: 'HTTP',
        target: 'https://private.user2.com',
        enabled: true,
        intervalSec: 60,
        timeoutMs: 10000,
        configJson: {},
      },
    });
  }, 45000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app);
  }, 15000);

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const auth2 = () => ({ Authorization: `Bearer ${token2}` });

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('requires auth — 401 without token', async () => {
    await request(app.getHttpServer()).get('/v2/monitors').expect(401);
  });

  // ─── Envelope shape ───────────────────────────────────────────────────────

  it('returns paginated envelope with data array and meta', async () => {
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

  // ─── Response shape ───────────────────────────────────────────────────────

  it('monitor item has all expected fields', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v2/monitors?search=HTTP+Alpha`)
      .set(auth())
      .expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const m = res.body.data[0];
    expect(m).toHaveProperty('id');
    expect(m).toHaveProperty('name');
    expect(m).toHaveProperty('type');
    expect(m).toHaveProperty('target');
    expect(m).toHaveProperty('enabled');
    expect(m).toHaveProperty('intervalSec');
    expect(m).toHaveProperty('timeoutMs');
    expect(m).toHaveProperty('folderId');
    expect(m).toHaveProperty('config');
    expect(m).toHaveProperty('alertChannelIds');
    expect(m).toHaveProperty('createdAt');
  });

  it('alertChannelIds includes linked channel ids', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v2/monitors?search=HTTP+Alpha`)
      .set(auth())
      .expect(200);
    const m = res.body.data[0];
    expect(Array.isArray(m.alertChannelIds)).toBe(true);
    expect(m.alertChannelIds).toContain(channelId);
  });

  it('folderId is set for monitors in a folder', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v2/monitors?search=HTTP+Alpha`)
      .set(auth())
      .expect(200);
    const m = res.body.data[0];
    expect(m.folderId).toBe(folderId);
  });

  it('folderId is null for monitors not in a folder', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v2/monitors?search=DNS+Beta`)
      .set(auth())
      .expect(200);
    const m = res.body.data.find((x: { name: string }) => x.name === 'DNS Beta');
    expect(m).toBeDefined();
    expect(m.folderId).toBeNull();
  });

  // ─── Secrets redaction ────────────────────────────────────────────────────

  it('redacts token from GIT_RELEASE config', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors?type=GIT_RELEASE')
      .set(auth())
      .expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const m = res.body.data[0];
    expect(m.config.token).toBeUndefined();
    expect(m.config.appToken).toBeUndefined();
    expect(m.config.hasRepoToken).toBe(true);
    expect(m.config.hasAppToken).toBe(true);
  });

  // ─── User isolation ───────────────────────────────────────────────────────

  it('user 1 cannot see user 2 monitors', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors')
      .set(auth())
      .expect(200);
    const names = res.body.data.map((m: { name: string }) => m.name);
    expect(names).not.toContain('User2 Private Monitor');
  });

  it('user 2 cannot see user 1 monitors', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors')
      .set(auth2())
      .expect(200);
    const names = res.body.data.map((m: { name: string }) => m.name);
    expect(names).not.toContain('HTTP Alpha');
    expect(names).not.toContain('DNS Beta');
  });

  // ─── Type filter (all 17 types) ───────────────────────────────────────────

  it.each([
    'HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'TCP', 'SSL_CERT', 'HEARTBEAT',
    'DNS', 'PING', 'SMTP', 'BROWSER', 'WHOIS', 'FTP', 'IMAP', 'POP3',
    'CT_LOG', 'GRAPHQL', 'TRANSACTION',
  ])('type=%s is accepted (200)', async (type) => {
    const res = await request(app.getHttpServer())
      .get(`/v2/monitors?type=${type}`)
      .set(auth())
      .expect(200);
    expect(res.body).toHaveProperty('data');
    // All returned items should match the requested type
    res.body.data.forEach((m: { type: string }) => {
      expect(m.type).toBe(type);
    });
  });

  it('invalid type → 400', async () => {
    await request(app.getHttpServer())
      .get('/v2/monitors?type=INVALID_TYPE')
      .set(auth())
      .expect(400);
  });

  it('type=DNS returns DNS monitors', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors?type=DNS')
      .set(auth())
      .expect(200);
    const names = res.body.data.map((m: { name: string }) => m.name);
    expect(names).toContain('DNS Beta');
  });

  it('type=HTTP returns only HTTP monitors', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors?type=HTTP')
      .set(auth())
      .expect(200);
    res.body.data.forEach((m: { type: string }) => {
      expect(m.type).toBe('HTTP');
    });
    expect(res.body.data.some((m: { name: string }) => m.name === 'HTTP Alpha')).toBe(true);
  });

  // ─── enabled filter ───────────────────────────────────────────────────────

  it('enabled=true returns only enabled monitors', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors?enabled=true')
      .set(auth())
      .expect(200);
    res.body.data.forEach((m: { enabled: boolean }) => {
      expect(m.enabled).toBe(true);
    });
    expect(res.body.data.some((m: { name: string }) => m.name === 'Disabled Monitor')).toBe(false);
  });

  it('enabled=false returns only disabled monitors', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors?enabled=false')
      .set(auth())
      .expect(200);
    res.body.data.forEach((m: { enabled: boolean }) => {
      expect(m.enabled).toBe(false);
    });
    expect(res.body.data.some((m: { name: string }) => m.name === 'Disabled Monitor')).toBe(true);
  });

  it('invalid enabled value → 400', async () => {
    await request(app.getHttpServer())
      .get('/v2/monitors?enabled=maybe')
      .set(auth())
      .expect(400);
  });

  // ─── Search ───────────────────────────────────────────────────────────────

  it('search narrows by name (case-insensitive)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors?search=dns+beta')
      .set(auth())
      .expect(200);
    expect(res.body.data.some((m: { name: string }) => m.name === 'DNS Beta')).toBe(true);
    expect(res.body.data.some((m: { name: string }) => m.name === 'HTTP Alpha')).toBe(false);
  });

  it('search narrows by target', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors?search=alpha.example.com')
      .set(auth())
      .expect(200);
    expect(res.body.data.some((m: { name: string }) => m.name === 'HTTP Alpha')).toBe(true);
  });

  it('search with no matches returns empty data array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors?search=zzznomatch_xyz_99')
      .set(auth())
      .expect(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });

  // ─── Sort ─────────────────────────────────────────────────────────────────

  it('sortBy=name&sortDir=asc returns monitors in ascending name order', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors?sortBy=name&sortDir=asc')
      .set(auth())
      .expect(200);
    const names = res.body.data.map((m: { name: string }) => m.name);
    // PostgreSQL sorts with ASCII/locale collation (case-sensitive: uppercase before lowercase)
    const sorted = [...names].sort((a: string, b: string) => a < b ? -1 : a > b ? 1 : 0);
    expect(names).toEqual(sorted);
  });

  it('sortBy=name&sortDir=desc returns monitors in descending name order', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors?sortBy=name&sortDir=desc')
      .set(auth())
      .expect(200);
    const names = res.body.data.map((m: { name: string }) => m.name);
    // PostgreSQL sorts with ASCII/locale collation (case-sensitive: uppercase before lowercase)
    const sorted = [...names].sort((a: string, b: string) => a > b ? -1 : a < b ? 1 : 0);
    expect(names).toEqual(sorted);
  });

  it('invalid sortBy → 400', async () => {
    await request(app.getHttpServer())
      .get('/v2/monitors?sortBy=hackedField')
      .set(auth())
      .expect(400);
  });

  it('invalid sortDir → 400', async () => {
    await request(app.getHttpServer())
      .get('/v2/monitors?sortDir=sideways')
      .set(auth())
      .expect(400);
  });

  // ─── Pagination ───────────────────────────────────────────────────────────

  it('limit=1 returns at most 1 result', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors?limit=1')
      .set(auth())
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.limit).toBe(1);
  });

  it('page=2 with limit=1 returns the second monitor', async () => {
    const p1 = await request(app.getHttpServer())
      .get('/v2/monitors?limit=1&page=1&sortBy=name&sortDir=asc')
      .set(auth())
      .expect(200);
    const p2 = await request(app.getHttpServer())
      .get('/v2/monitors?limit=1&page=2&sortBy=name&sortDir=asc')
      .set(auth())
      .expect(200);
    expect(p1.body.data[0].id).not.toBe(p2.body.data[0].id);
  });

  it('meta.pages is ceiling of total/limit', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors?limit=2')
      .set(auth())
      .expect(200);
    const { total, limit, pages } = res.body.meta;
    expect(pages).toBe(Math.ceil(total / limit));
  });

  it('page beyond total returns empty data array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors?limit=1&page=99999')
      .set(auth())
      .expect(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('limit=0 → 400', async () => {
    await request(app.getHttpServer())
      .get('/v2/monitors?limit=0')
      .set(auth())
      .expect(400);
  });

  it('page=0 → 400', async () => {
    await request(app.getHttpServer())
      .get('/v2/monitors?page=0')
      .set(auth())
      .expect(400);
  });

  it('limit=101 → 400 (exceeds max)', async () => {
    await request(app.getHttpServer())
      .get('/v2/monitors?limit=101')
      .set(auth())
      .expect(400);
  });

  // ─── meta.total ───────────────────────────────────────────────────────────

  it('meta.total reflects user 1 monitor count', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors?limit=100')
      .set(auth())
      .expect(200);
    expect(res.body.meta.total).toBe(res.body.data.length);
  });

  it('meta.total for user 2 reflects only their monitors', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/monitors')
      .set(auth2())
      .expect(200);
    // User 2 has one monitor seeded
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    res.body.data.forEach((m: { name: string }) => {
      expect(m.name).not.toBe('HTTP Alpha');
    });
  });
});
