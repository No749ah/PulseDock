/**
 * Integration tests: Check Plugins endpoint.
 *
 * Covers:
 *   GET /v1/plugins — list all registered check plugins
 *
 * Validates: auth guard (401), response shape, built-in plugins present.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Plugins (integration)', () => {
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

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('GET /v1/plugins → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/plugins')
      .expect(401);
  });

  // ─── List plugins ─────────────────────────────────────────────────────────

  it('GET /v1/plugins → returns array of plugins for authenticated user', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/plugins')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /v1/plugins → each plugin has id, displayName, and supportedMonitorTypes', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/plugins')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    for (const plugin of res.body) {
      expect(plugin).toHaveProperty('id');
      expect(plugin).toHaveProperty('displayName');
      expect(plugin).toHaveProperty('supportedMonitorTypes');
      expect(typeof plugin.id).toBe('string');
      expect(typeof plugin.displayName).toBe('string');
      expect(Array.isArray(plugin.supportedMonitorTypes)).toBe(true);
    }
  });

  it('GET /v1/plugins → includes built-in http.response-match plugin', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/plugins')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids: string[] = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain('http.response-match');
  });

  it('GET /v1/plugins → includes built-in http.cert-expiry plugin', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const res = await request(app.getHttpServer())
      .get('/v1/plugins')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids: string[] = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain('http.cert-expiry');
  });

  it('GET /v1/plugins → result is consistent across calls (same list)', async () => {
    const { user, token } = await createTestUser(prisma, module);
    createdUserIds.push(user.id);

    const [res1, res2] = await Promise.all([
      request(app.getHttpServer()).get('/v1/plugins').set('Authorization', `Bearer ${token}`),
      request(app.getHttpServer()).get('/v1/plugins').set('Authorization', `Bearer ${token}`),
    ]);

    expect(res1.body.map((p: { id: string }) => p.id)).toEqual(
      res2.body.map((p: { id: string }) => p.id),
    );
  });
});
