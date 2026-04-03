/**
 * Integration tests: Public endpoints (unauthenticated) — badges, embeds,
 * public status overview, and status-page embeds.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Public Endpoints (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let monitorId: string;
  let shareToken: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const user = await createTestUser(prisma, module);
    token = user.token;
    userId = user.user.id;

    // Create a monitor with a share token
    const monRes = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        name: 'Public Test Monitor',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
        timeoutMs: 5000,
      })
      .expect(201);
    monitorId = monRes.body.id;

    // Generate a share token
    const stRes = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorId}/share-token`)
      .set({ Authorization: `Bearer ${token}` });
    shareToken = stRes.body.shareToken ?? stRes.body.token;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await destroyTestApp(app);
  }, 15000);

  // ─── Public monitor overview ──────────────────────────────────────────

  it('returns 404 for unknown userId overview', async () => {
    await request(app.getHttpServer())
      .get('/v1/public/overview/unknown-user-id')
      .expect(404);
  });

  it('returns user public overview for own userId', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/public/overview/${userId}`)
      .expect(200);

    expect(res.body).toHaveProperty('monitors');
    expect(Array.isArray(res.body.monitors)).toBe(true);
  });

  // ─── SVG status badge (fully public, no auth required) ──────────────

  it('returns SVG badge for a valid monitor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/public/badge/${monitorId}.svg`)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/svg/);
    // SVG badge is a string body
    const body = res.text ?? String(res.body ?? '');
    expect(body).toContain('<svg');
  });

  it('returns 404 for SVG badge with unknown monitorId', async () => {
    await request(app.getHttpServer())
      .get('/v1/public/badge/nonexistent-monitor-id.svg')
      .expect(404);
  });

  // ─── Embed data (fully public, no auth required) ──────────────────────

  it('returns embed data for a valid monitor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/public/embed/${monitorId}`)
      .expect(200);

    expect(res.body).toHaveProperty('monitorId', monitorId);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('uptimePct');
  });

  it('returns 404 for embed data with unknown monitorId', async () => {
    await request(app.getHttpServer())
      .get('/v1/public/embed/nonexistent-monitor-id')
      .expect(404);
  });

  // ─── Public status JSON (requires share token) ────────────────────────

  it('returns public status JSON for valid share token', async () => {
    if (!shareToken) return;
    const res = await request(app.getHttpServer())
      .get(`/v1/public/monitor/${shareToken}/status.json`)
      .expect(200);

    expect(res.body).toHaveProperty('status');
  });

  it('returns 404 for status.json with invalid token', async () => {
    await request(app.getHttpServer())
      .get('/v1/public/monitor/invalid-token-xyz/status.json')
      .expect(404);
  });
});
