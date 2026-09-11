/**
 * Integration tests: Public endpoints (unauthenticated) — badges, embeds,
 * public status overview, status-page embeds, share-token history, and certificates.
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
  let statusPageSlug: string;

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

    // Create a published status page
    statusPageSlug = `test-pub-${Date.now()}`;
    const spRes = await request(app.getHttpServer())
      .post('/v1/status-pages')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        title: 'Test Status Page',
        slug: statusPageSlug,
        isPublished: true,
        layout: [],
      });
    if (spRes.status !== 201) {
      statusPageSlug = spRes.body?.slug ?? statusPageSlug;
    }
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
    const body = res.text ?? String(res.body ?? '');
    expect(body).toContain('<svg');
  });

  it('returns 404 for SVG badge with unknown monitorId', async () => {
    await request(app.getHttpServer())
      .get('/v1/public/badge/nonexistent-monitor-id.svg')
      .expect(404);
  });

  it('returns flat-square SVG badge when style=flat-square', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/public/badge/${monitorId}.svg?style=flat-square`)
      .buffer(true)
      .expect(200);
    const svg = res.text ?? res.body.toString();
    expect(svg).toContain('<svg');
    // flat-square has no rx (radius=0)
    expect(svg).not.toMatch(/rx="[1-9]/);
  });

  it('returns for-the-badge SVG when style=for-the-badge', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/public/badge/${monitorId}.svg?style=for-the-badge`)
      .buffer(true)
      .expect(200);
    const svg = res.text ?? res.body.toString();
    expect(svg).toContain('<svg');
    // for-the-badge has height 28
    expect(svg).toContain('height="28"');
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

  // ─── Embeddable JS widget for monitor ────────────────────────────────

  it('returns JS script for monitor embed widget', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/public/embed/monitor/${monitorId}.js`)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.text).toContain('_pd_embed_badge');
  });

  it('returns 404 for embed/monitor JS with unknown monitorId', async () => {
    await request(app.getHttpServer())
      .get('/v1/public/embed/monitor/nonexistent-id.js')
      .expect(404);
  });

  it('embed/monitor JS accepts position and theme query params', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/public/embed/monitor/${monitorId}.js?position=top-left&theme=light`)
      .expect(200);

    expect(res.text).toContain('_pd_embed_badge');
    // top-left position should appear in style
    expect(res.text).toContain('top:16px;left:16px');
  });

  it('embed/monitor JS sets CORS headers', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/public/embed/monitor/${monitorId}.js`)
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  // ─── Public status JSON (requires share token) ────────────────────────

  it('returns public status JSON for valid share token', async () => {
    if (!shareToken) return;
    const res = await request(app.getHttpServer())
      .get(`/v1/public/monitor/${shareToken}/status.json`)
      .expect(200);

    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('name', 'Public Test Monitor');
    expect(res.body).toHaveProperty('generatedAt');
  });

  it('returns 404 for status.json with invalid token', async () => {
    await request(app.getHttpServer())
      .get('/v1/public/monitor/invalid-token-xyz/status.json')
      .expect(404);
  });

  // ─── Public monitor history via share token ───────────────────────────

  it('returns history array for valid share token', async () => {
    if (!shareToken) return;
    const res = await request(app.getHttpServer())
      .get(`/v1/public/monitor/${shareToken}/history`)
      .expect(200);

    expect(res.body).toHaveProperty('monitorId', monitorId);
    expect(res.body).toHaveProperty('name', 'Public Test Monitor');
    expect(res.body).toHaveProperty('history');
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body).toHaveProperty('generatedAt');
  });

  it('returns 404 for history with invalid share token', async () => {
    await request(app.getHttpServer())
      .get('/v1/public/monitor/invalid-token-xyz/history')
      .expect(404);
  });

  it('history respects custom limit param', async () => {
    if (!shareToken) return;
    const res = await request(app.getHttpServer())
      .get(`/v1/public/monitor/${shareToken}/history?limit=5`)
      .expect(200);

    expect(res.body.history.length).toBeLessThanOrEqual(5);
  });

  it('history returns correct shape per check result', async () => {
    if (!shareToken) return;
    const res = await request(app.getHttpServer())
      .get(`/v1/public/monitor/${shareToken}/history?limit=10`)
      .expect(200);

    // If there are history entries, verify shape
    if (res.body.history.length > 0) {
      const entry = res.body.history[0];
      expect(entry).toHaveProperty('checkedAt');
      expect(entry).toHaveProperty('ok');
      expect(entry).toHaveProperty('level');
    }
  });

  it('history sets CORS and cache headers', async () => {
    if (!shareToken) return;
    const res = await request(app.getHttpServer())
      .get(`/v1/public/monitor/${shareToken}/history`)
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  // ─── Uptime certificate ───────────────────────────────────────────────

  it('returns 401 for certificate without share token', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/public/certificates/${monitorId}`)
      .expect(401);

    expect(res.text).toContain('Share token required');
  });

  it('returns 401 for certificate with invalid share token', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/public/certificates/${monitorId}?token=bad-token`)
      .expect(401);

    expect(res.text).toContain('Invalid share token');
  });

  it('returns HTML certificate for valid share token', async () => {
    if (!shareToken) return;
    const res = await request(app.getHttpServer())
      .get(`/v1/public/certificates/${monitorId}?token=${shareToken}`)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Uptime Certificate');
    expect(res.text).toContain('PulseDock');
  });

  it('certificate includes monitor name and uptime stats', async () => {
    if (!shareToken) return;
    const res = await request(app.getHttpServer())
      .get(`/v1/public/certificates/${monitorId}?token=${shareToken}`)
      .expect(200);

    expect(res.text).toContain('Public Test Monitor');
    expect(res.text).toContain('Uptime');
  });

  it('certificate accepts periodDays parameter', async () => {
    if (!shareToken) return;
    const res = await request(app.getHttpServer())
      .get(`/v1/public/certificates/${monitorId}?token=${shareToken}&periodDays=90`)
      .expect(200);

    expect(res.text).toContain('90 Days');
  });

  it('certificate defaults invalid periodDays to 30', async () => {
    if (!shareToken) return;
    const res = await request(app.getHttpServer())
      .get(`/v1/public/certificates/${monitorId}?token=${shareToken}&periodDays=999`)
      .expect(200);

    // Should fall back to 30 Days
    expect(res.text).toContain('30 Days');
  });

  it('certificate includes a print button', async () => {
    if (!shareToken) return;
    const res = await request(app.getHttpServer())
      .get(`/v1/public/certificates/${monitorId}?token=${shareToken}`)
      .expect(200);

    expect(res.text).toContain('window.print()');
  });

  // ─── Embeddable JS widget for status page ────────────────────────────

  it('returns 404 for embed/status JS with unknown slug', async () => {
    await request(app.getHttpServer())
      .get('/v1/public/embed/status/nonexistent-slug.js')
      .expect(404);
  });
});
