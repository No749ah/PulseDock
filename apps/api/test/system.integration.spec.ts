/**
 * Integration tests: Health checks, metrics, and v2 system info endpoints.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('System / Health (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const user = await createTestUser(prisma, module);
    token = user.token;
    userId = user.user.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await destroyTestApp(app);
  }, 15000);

  // ─── Health endpoints ─────────────────────────────────────────────────

  it('GET /health returns ok:true with db and redis checks', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('pulsedock-api');
    expect(res.body).toHaveProperty('version');
    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks.database.status).toBe('ok');
    expect(res.body.checks).toHaveProperty('redis');
  });

  it('GET /health/live returns 200 (liveness probe)', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);

    expect(res.body.ok).toBe(true);
  });

  it('GET /health/ready returns 200 (readiness probe)', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty('ready');
  });

  // ─── Metrics endpoint ─────────────────────────────────────────────────

  it('GET /metrics returns Prometheus-compatible text', async () => {
    const res = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);

    // Metrics endpoint returns JSON with counters
    expect(res.body).toHaveProperty('requestsTotal');
  });

  // ─── v2 System info ───────────────────────────────────────────────────

  it('GET /v2/system/info returns API metadata', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/system/info')
      .expect(200);

    expect(res.body).toHaveProperty('service', 'pulsedock-api');
    expect(res.body).toHaveProperty('version');
    expect(res.body.apiVersions.supported).toContain('v1');
    expect(res.body.apiVersions.supported).toContain('v2');
    expect(res.body).toHaveProperty('features');
    expect(res.body).toHaveProperty('links');
  });

  it('GET /v2/system/versions returns compatibility matrix', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/system/versions')
      .expect(200);

    expect(res.body).toHaveProperty('versions');
    expect(Array.isArray(res.body.versions)).toBe(true);
    expect(res.body.versions.length).toBeGreaterThan(0);
    // Each version entry has version identifier
    const v = res.body.versions[0];
    expect(v).toHaveProperty('version');
    expect(v).toHaveProperty('status');
  });
});
