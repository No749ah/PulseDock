/**
 * Integration tests: Backup & Restore endpoints against a real PostgreSQL database.
 *
 * Covers:
 *   GET  /v1/settings/backup         → export full account as JSON
 *   POST /v1/settings/backup/restore → restore from a backup document
 *
 * Validates: auth guard, backup shape, idempotent restore (skip duplicates),
 * cross-user isolation, invalid document rejection, user isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Backup & Restore (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  let token: string;
  let userId: string;
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
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app);
  }, 15000);

  // ─── Auth guards ─────────────────────────────────────────────────────────

  describe('Auth guard', () => {
    it('GET /v1/settings/backup → 403 without token (CSRF blocks unauthenticated)', async () => {
      await request(app.getHttpServer())
        .get('/v1/settings/backup')
        .expect((res) => {
          expect([401, 403]).toContain(res.status);
        });
    });

    it('POST /v1/settings/backup/restore → 403 without token', async () => {
      await request(app.getHttpServer())
        .post('/v1/settings/backup/restore')
        .send({ version: '2', exportedAt: new Date().toISOString(), monitors: [] })
        .expect((res) => {
          expect([401, 403]).toContain(res.status);
        });
    });
  });

  // ─── Export backup ─────────────────────────────────────────────────────────

  describe('GET /v1/settings/backup', () => {
    it('returns a valid backup document with correct shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/settings/backup')
        .set(auth())
        .expect(200);

      const doc = res.body;
      expect(doc.version).toBe('2');
      expect(doc.exportedAt).toBeDefined();
      expect(new Date(doc.exportedAt).getTime()).not.toBeNaN();
      expect(doc.pulsedockVersion).toBeDefined();
      expect(Array.isArray(doc.monitors)).toBe(true);
      expect(Array.isArray(doc.folders)).toBe(true);
      expect(Array.isArray(doc.tags)).toBe(true);
      expect(Array.isArray(doc.alertChannels)).toBe(true);
      expect(Array.isArray(doc.statusPages)).toBe(true);
      expect(doc.settings).toBeDefined();
      expect(typeof doc.settings.retentionDays).toBe('number');
    });

    it('backup is empty for a fresh user (no monitors/folders/channels)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/settings/backup')
        .set(auth())
        .expect(200);

      expect(res.body.monitors).toHaveLength(0);
      expect(res.body.folders).toHaveLength(0);
      expect(res.body.alertChannels).toHaveLength(0);
    });

    it('backup includes created data', async () => {
      // Create a monitor and channel
      const monitorRes = await request(app.getHttpServer())
        .post('/v1/monitors')
        .set(auth())
        .send({ name: 'Backup Test Monitor', type: 'HTTP', target: 'https://example.com', intervalSec: 60 });
      expect(monitorRes.status).toBe(201);

      const channelRes = await request(app.getHttpServer())
        .post('/v1/alert-channels')
        .set(auth())
        .send({ name: 'Backup Test Channel', type: 'webhook', config: { url: 'https://example.com/hook' } });
      expect(channelRes.status).toBe(201);

      const res = await request(app.getHttpServer())
        .get('/v1/settings/backup')
        .set(auth())
        .expect(200);

      expect(res.body.monitors.length).toBeGreaterThanOrEqual(1);
      expect(res.body.monitors.some((m: { name: string }) => m.name === 'Backup Test Monitor')).toBe(true);
      expect(res.body.alertChannels.length).toBeGreaterThanOrEqual(1);
      expect(res.body.alertChannels.some((c: { name: string }) => c.name === 'Backup Test Channel')).toBe(true);
    });

    it('backup monitor includes required fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/settings/backup')
        .set(auth())
        .expect(200);

      const monitor = res.body.monitors.find((m: { name: string }) => m.name === 'Backup Test Monitor');
      expect(monitor).toBeDefined();
      expect(monitor.type).toBe('HTTP');
      expect(monitor.target).toBe('https://example.com');
      expect(monitor.intervalSec).toBe(60);
      expect(typeof monitor.enabled).toBe('boolean');
      expect(Array.isArray(monitor.tagNames)).toBe(true);
    });
  });

  // ─── Restore backup ─────────────────────────────────────────────────────────

  describe('POST /v1/settings/backup/restore', () => {
    const makeBackup = (overrides: Partial<{
      version: string;
      exportedAt: string;
      monitors: unknown[];
      folders: unknown[];
      tags: unknown[];
      alertChannels: unknown[];
      statusPages: unknown[];
      settings: unknown;
    }> = {}) => ({
      version: '2',
      exportedAt: new Date().toISOString(),
      pulsedockVersion: '1.7.0',
      monitors: [],
      folders: [],
      tags: [],
      alertChannels: [],
      statusPages: [],
      settings: { retentionDays: 90 },
      ...overrides,
    });

    it('returns restore result with counts', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/settings/backup/restore')
        .set(auth2())
        .send(makeBackup())
        .expect(200);

      expect(res.body.monitors).toBeDefined();
      expect(typeof res.body.monitors.created).toBe('number');
      expect(typeof res.body.monitors.skipped).toBe('number');
      expect(res.body.folders).toBeDefined();
      expect(res.body.tags).toBeDefined();
      expect(res.body.alertChannels).toBeDefined();
    });

    it('restores monitors from backup document', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/settings/backup/restore')
        .set(auth2())
        .send(makeBackup({
          monitors: [
            {
              name: 'Restored HTTP Monitor',
              type: 'HTTP',
              target: 'https://restored.example.com',
              intervalSec: 120,
              timeoutMs: 10000,
              confirmations: 1,
              enabled: true,
              config: {},
              tagNames: [],
            },
          ],
        }))
        .expect(200);

      expect(res.body.monitors.created).toBe(1);
      expect(res.body.monitors.skipped).toBe(0);

      // Verify monitor actually exists for this user
      const listRes = await request(app.getHttpServer())
        .get('/v1/monitors')
        .set(auth2())
        .expect(200);
      const names = listRes.body.map((m: { name: string }) => m.name);
      expect(names).toContain('Restored HTTP Monitor');
    });

    it('idempotent restore — re-importing same data skips duplicates', async () => {
      const backup = makeBackup({
        monitors: [
          {
            name: 'Idempotent Monitor',
            type: 'HTTP',
            target: 'https://idempotent.example.com',
            intervalSec: 60,
            timeoutMs: 10000,
            confirmations: 1,
            enabled: true,
            config: {},
            tagNames: [],
          },
        ],
      });

      // First restore
      const r1 = await request(app.getHttpServer())
        .post('/v1/settings/backup/restore')
        .set(auth2())
        .send(backup)
        .expect(200);
      expect(r1.body.monitors.created).toBeGreaterThanOrEqual(1);

      // Second restore — same data should be skipped
      const r2 = await request(app.getHttpServer())
        .post('/v1/settings/backup/restore')
        .set(auth2())
        .send(backup)
        .expect(200);
      expect(r2.body.monitors.created).toBe(0);
      expect(r2.body.monitors.skipped).toBeGreaterThanOrEqual(1);
    });

    it('restores alert channels from backup', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/settings/backup/restore')
        .set(auth2())
        .send(makeBackup({
          alertChannels: [
            {
              name: 'Restored Webhook Channel',
              type: 'webhook',
              config: { url: 'https://example.com/restored-hook' },
            },
          ],
        }))
        .expect(200);

      expect(res.body.alertChannels.created).toBeGreaterThanOrEqual(1);
    });

    it('restores folders from backup', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/settings/backup/restore')
        .set(auth2())
        .send(makeBackup({
          folders: [{ name: 'Restored Folder' }],
        }))
        .expect(200);

      expect(res.body.folders.created).toBeGreaterThanOrEqual(1);
    });

    it('restores tags from backup', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/settings/backup/restore')
        .set(auth2())
        .send(makeBackup({
          tags: [{ name: 'restored-tag', color: '#3b82f6' }],
        }))
        .expect(200);

      expect(res.body.tags.created).toBeGreaterThanOrEqual(1);
    });

    it('rejects invalid backup document (missing version)', async () => {
      await request(app.getHttpServer())
        .post('/v1/settings/backup/restore')
        .set(auth())
        .send({ exportedAt: new Date().toISOString() })
        .expect(400);
    });

    it('rejects backup with monitors not an array', async () => {
      await request(app.getHttpServer())
        .post('/v1/settings/backup/restore')
        .set(auth())
        .send({ version: '2', exportedAt: new Date().toISOString(), monitors: 'invalid' })
        .expect(400);
    });

    it('user isolation — user A restore does not affect user B data', async () => {
      // User 1 restores a unique monitor
      await request(app.getHttpServer())
        .post('/v1/settings/backup/restore')
        .set(auth())
        .send(makeBackup({
          monitors: [{
            name: 'Isolation Test Monitor User1',
            type: 'HTTP',
            target: 'https://user1-isolation.example.com',
            intervalSec: 60,
            timeoutMs: 10000,
            confirmations: 1,
            enabled: true,
            config: {},
            tagNames: [],
          }],
        }))
        .expect(200);

      // User 2 should NOT see user 1's monitors
      const listRes = await request(app.getHttpServer())
        .get('/v1/monitors')
        .set(auth2())
        .expect(200);
      const names = listRes.body.map((m: { name: string }) => m.name);
      expect(names).not.toContain('Isolation Test Monitor User1');
    });
  });

  // ─── Round-trip: export then restore ─────────────────────────────────────

  describe('Full round-trip: export + restore into new account', () => {
    it('exports and restores data into user2 with correct counts', async () => {
      // Ensure user1 has a monitor
      const createRes = await request(app.getHttpServer())
        .post('/v1/monitors')
        .set(auth())
        .send({ name: 'Round Trip Monitor', type: 'HTTP', target: 'https://round-trip-test.example.com', intervalSec: 300 });
      expect(createRes.status).toBe(201);

      // Export from user1
      const exportRes = await request(app.getHttpServer())
        .get('/v1/settings/backup')
        .set(auth())
        .expect(200);

      const backup = exportRes.body;
      expect(backup.monitors.length).toBeGreaterThan(0);

      // Restore into user2 (with a fresh unique name to avoid the idempotency skip)
      const uniqueBackup = {
        ...backup,
        monitors: backup.monitors.map((m: { name: string }) => ({
          ...m,
          name: `${m.name} (from user1 round-trip)`,
          target: `https://round-trip-${Date.now()}.example.com`,
        })),
      };

      const restoreRes = await request(app.getHttpServer())
        .post('/v1/settings/backup/restore')
        .set(auth2())
        .send(uniqueBackup)
        .expect(200);

      expect(restoreRes.body.monitors.created).toBeGreaterThanOrEqual(1);
    });
  });
});
