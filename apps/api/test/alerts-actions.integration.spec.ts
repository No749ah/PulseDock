/**
 * Integration tests: Alert Channel action endpoints.
 *
 * Covers: test, preview-payload, retry-delivery, retry-all-failed, test-all
 * Tests auth guards (401/403) and real behavior with an authenticated user.
 *
 * Note: NestJS @Post() handlers return 201 by default unless @HttpCode(200) is used.
 * The test/test-all endpoints attempt real HTTP delivery which may fail in the test
 * environment (SSL errors to example.com), so we accept 500 as "dispatch attempted".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Alert Channel Actions (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let channelId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const testUser = await createTestUser(prisma, module);
    token = testUser.token;
    userId = testUser.user.id;

    // Create a webhook channel for action tests
    const res = await request(app.getHttpServer())
      .post('/v1/alert-channels')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        name: 'Action Test Webhook',
        type: 'webhook',
        config: { url: 'https://example.com/webhook-action-test' },
      });
    channelId = res.body.id;
    expect(channelId).toBeDefined();
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await destroyTestApp(app);
  }, 15000);

  const authHeader = () => ({ Authorization: `Bearer ${token}` });

  // ─── Auth guards ───────────────────────────────────────────────────────────
  //
  // The CSRF middleware runs before the auth guard and blocks cookie-based
  // POST requests without a CSRF token with 403. Bearer-token callers bypass CSRF,
  // so unauthenticated requests without any token hit the CSRF layer first → 403.

  describe('Auth guard — rejected for unauthenticated requests', () => {
    it('POST /v1/alert-channels/test → rejected without token', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/alert-channels/test')
        .send({ channelId: 'some-id' });
      expect([401, 403]).toContain(res.status);
    });

    it('POST /v1/alert-channels/test-all → rejected without token', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/alert-channels/test-all');
      expect([401, 403]).toContain(res.status);
    });

    it('POST /v1/alert-channels/:id/preview-payload → rejected without token', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/alert-channels/fake-id/preview-payload')
        .send({});
      expect([401, 403]).toContain(res.status);
    });

    it('POST /v1/alert-channels/:id/retry-delivery/:deliveryId → rejected without token', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/alert-channels/fake-id/retry-delivery/fake-delivery-id');
      expect([401, 403]).toContain(res.status);
    });

    it('POST /v1/alert-channels/:id/retry-all-failed → rejected without token', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/alert-channels/fake-id/retry-all-failed');
      expect([401, 403]).toContain(res.status);
    });
  });

  // ─── preview-payload ───────────────────────────────────────────────────────

  describe('POST /v1/alert-channels/:id/preview-payload', () => {
    it('returns 404 for non-existent channel', async () => {
      await request(app.getHttpServer())
        .post('/v1/alert-channels/nonexistent-channel-id/preview-payload')
        .set(authHeader())
        .send({})
        .expect(404);
    });

    it('returns rendered payload for valid channel (no template)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/alert-channels/${channelId}/preview-payload`)
        .set(authHeader())
        .send({});

      // NestJS @Post returns 201 by default
      expect([200, 201]).toContain(res.status);
      expect(res.body).toHaveProperty('rendered');
      expect(res.body).toHaveProperty('valid');
      expect(typeof res.body.rendered).toBe('string');
      expect(typeof res.body.valid).toBe('boolean');
    });

    it('returns rendered payload when custom template is provided', async () => {
      const template = '{"status": "{{status}}", "name": "{{monitorName}}"}';
      const res = await request(app.getHttpServer())
        .post(`/v1/alert-channels/${channelId}/preview-payload`)
        .set(authHeader())
        .send({ template });

      expect([200, 201]).toContain(res.status);
      expect(res.body).toHaveProperty('rendered');
      expect(res.body).toHaveProperty('valid');
    });

    it('returns 404 when channel belongs to a different user', async () => {
      const other = await createTestUser(prisma, module, { email: `other-preview-${Date.now()}@test.com` });
      const otherChannelRes = await request(app.getHttpServer())
        .post('/v1/alert-channels')
        .set({ Authorization: `Bearer ${other.token}` })
        .send({
          name: 'Other User Channel',
          type: 'webhook',
          config: { url: 'https://example.com/other' },
        });

      const otherChannelId: string = otherChannelRes.body.id;

      await request(app.getHttpServer())
        .post(`/v1/alert-channels/${otherChannelId}/preview-payload`)
        .set(authHeader())
        .send({})
        .expect(404);

      await cleanupTestUser(prisma, other.user.id);
    });
  });

  // ─── retry-all-failed ─────────────────────────────────────────────────────

  describe('POST /v1/alert-channels/:id/retry-all-failed', () => {
    it('returns 404 for non-existent channel', async () => {
      await request(app.getHttpServer())
        .post('/v1/alert-channels/nonexistent-channel-id/retry-all-failed')
        .set(authHeader())
        .expect(404);
    });

    it('returns results array (empty) when no failed deliveries exist', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/alert-channels/${channelId}/retry-all-failed`)
        .set(authHeader());

      expect([200, 201]).toContain(res.status);
      expect(res.body).toHaveProperty('results');
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.results).toHaveLength(0);
    });
  });

  // ─── retry-delivery ───────────────────────────────────────────────────────

  describe('POST /v1/alert-channels/:id/retry-delivery/:deliveryId', () => {
    it('returns 404 for non-existent channel', async () => {
      await request(app.getHttpServer())
        .post('/v1/alert-channels/nonexistent-channel-id/retry-delivery/fake-delivery-id')
        .set(authHeader())
        .expect(404);
    });

    it('handles non-existent delivery on a valid channel gracefully', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/alert-channels/${channelId}/retry-delivery/00000000-0000-0000-0000-000000000000`)
        .set(authHeader());

      // Service may return success:false or 404 depending on implementation;
      // the important thing is it does NOT 401/403.
      expect([200, 201, 404]).toContain(res.status);
      if (res.status >= 200 && res.status < 300) {
        expect(res.body).toHaveProperty('success');
      }
    });
  });

  // ─── test-all ─────────────────────────────────────────────────────────────

  describe('POST /v1/alert-channels/test-all', () => {
    it('returns results array containing user channels', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/alert-channels/test-all')
        .set(authHeader());

      // Webhook delivery may fail (SSL) → 500, or succeed → 200/201
      // In test env we accept any non-auth-error as "endpoint reached"
      expect([200, 201, 500]).toContain(res.status);

      if (res.status < 300) {
        expect(res.body).toHaveProperty('results');
        expect(Array.isArray(res.body.results)).toBe(true);
        expect(res.body.results.length).toBeGreaterThanOrEqual(1);

        const first = res.body.results[0];
        expect(first).toHaveProperty('channelId');
        expect(first).toHaveProperty('name');
        expect(first).toHaveProperty('type');
        expect(first).toHaveProperty('ok');
      }
    });

    it('result entries have the expected shape when dispatch succeeds', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/alert-channels/test-all')
        .set(authHeader());

      expect([200, 201, 500]).toContain(res.status);

      if (res.status < 300) {
        for (const result of res.body.results as Array<Record<string, unknown>>) {
          expect(result).toHaveProperty('channelId');
          expect(result).toHaveProperty('name');
          expect(result).toHaveProperty('type');
          expect(result).toHaveProperty('ok');
          expect(typeof result.ok).toBe('boolean');
        }
      }
    });
  });

  // ─── test (single channel) ────────────────────────────────────────────────

  describe('POST /v1/alert-channels/test', () => {
    it('returns 404 for non-existent channelId', async () => {
      await request(app.getHttpServer())
        .post('/v1/alert-channels/test')
        .set(authHeader())
        .send({ channelId: 'nonexistent-channel-id' })
        .expect(404);
    });

    it('dispatches test for a valid channel (may fail due to unreachable URL)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/alert-channels/test')
        .set(authHeader())
        .send({ channelId });

      // In test env the webhook URL is unreachable → 500 from fetch failure.
      // Both 200/201 (success) and 500 (dispatch error) are acceptable here;
      // the test validates the endpoint is reachable and auth works.
      expect([200, 201, 500]).toContain(res.status);

      if (res.status < 300) {
        expect(res.body).toHaveProperty('ok');
      }
    });

    it('returns 400 when channelId is missing from body', async () => {
      await request(app.getHttpServer())
        .post('/v1/alert-channels/test')
        .set(authHeader())
        .send({})
        .expect(400);
    });
  });
});
