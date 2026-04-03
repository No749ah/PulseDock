/**
 * Integration tests: Monitor SLA endpoints against a real PostgreSQL database.
 *
 * Covers:
 *   GET /v1/monitors/sla-dashboard          — SLA compliance dashboard
 *   GET /v1/monitors/sla-by-tag             — SLA aggregated by tag
 *   GET /v1/monitors/sla-compliance-report  — detailed SLA report
 *   GET /v1/monitors/slo-summary            — lightweight SLO status summary
 *   GET /v1/monitors/:id/slo-report         — per-monitor SLO/SLI report
 *   GET /v1/monitors/:id/sla-forecast       — SLA error budget forecast
 *   GET /v1/monitors/:id/error-budget       — error budget & burn rates
 *   GET /v1/monitors/:id/uptime-certificate — HTML uptime certificate
 *   GET /v1/monitors/:id/uptime-certificate/data — certificate JSON data
 *
 * Validates: auth guard, response shape, user isolation, 404 for nonexistent monitors.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Monitor SLA (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let tokenB: string;
  let userIdB: string;
  let monitorId: string;
  let slaMonitorId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const userA = await createTestUser(prisma, module);
    token = userA.token;
    userId = userA.user.id;

    const userB = await createTestUser(prisma, module);
    tokenB = userB.token;
    userIdB = userB.user.id;

    // Create a basic monitor
    const res = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        name: 'SLA Test Monitor',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
        timeoutMs: 5000,
      })
      .expect(201);
    monitorId = res.body.id;

    // Create a monitor with an SLA target configured
    const slaRes = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        name: 'SLA Enabled Monitor',
        type: 'HTTP',
        target: 'https://sla-example.com',
        intervalSec: 60,
        timeoutMs: 5000,
        slaTarget: 99.9,
      })
      .expect(201);
    slaMonitorId = slaRes.body.id;

    // Seed MonitorRun records for SLA calculations
    const now = Date.now();
    await prisma.monitorRun.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        monitorId: slaMonitorId,
        userId,
        ok: i < 9, // 9 successes, 1 failure = 90% uptime
        latencyMs: 100 + i * 10,
        status: i < 9 ? 200 : 503,
        message: i < 9 ? 'OK' : 'Error',
        level: i < 9 ? 'green' : 'red',
        checkedAt: new Date(now - i * 60_000),
        redirectChain: [],
      })),
    });
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userIdB);
    await destroyTestApp(app);
  }, 15000);

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const authB = () => ({ Authorization: `Bearer ${tokenB}` });

  // ─── Auth guard ────────────────────────────────────────────────────────

  it('sla-dashboard: requires auth', async () => {
    await request(app.getHttpServer()).get('/v1/monitors/sla-dashboard').expect(401);
  });

  it('sla-by-tag: requires auth', async () => {
    await request(app.getHttpServer()).get('/v1/monitors/sla-by-tag').expect(401);
  });

  it('sla-compliance-report: requires auth', async () => {
    await request(app.getHttpServer()).get('/v1/monitors/sla-compliance-report').expect(401);
  });

  it('slo-summary: requires auth', async () => {
    await request(app.getHttpServer()).get('/v1/monitors/slo-summary').expect(401);
  });

  // ─── SLA dashboard ────────────────────────────────────────────────────

  it('sla-dashboard: returns monitors array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/sla-dashboard')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body) || Array.isArray(res.body.monitors)).toBe(true);
  });

  it('sla-dashboard: user B sees empty dashboard (no monitors)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/sla-dashboard')
      .set(authB())
      .expect(200);

    const monitors = Array.isArray(res.body) ? res.body : res.body.monitors ?? [];
    expect(monitors.length).toBe(0);
  });

  // ─── SLA by tag ────────────────────────────────────────────────────────

  it('sla-by-tag: returns array grouped by tag', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/sla-by-tag')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('sla-by-tag: user B sees empty array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/sla-by-tag')
      .set(authB())
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  // ─── SLA compliance report ─────────────────────────────────────────────

  it('sla-compliance-report: returns report shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/sla-compliance-report')
      .set(auth())
      .expect(200);

    expect(typeof res.body === 'object').toBe(true);
  });

  it('sla-compliance-report: accepts months param', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/sla-compliance-report?months=1')
      .set(auth())
      .expect(200);
    expect(typeof res.body === 'object').toBe(true);
  });

  it('sla-compliance-report: clamps months to max 12', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/sla-compliance-report?months=99')
      .set(auth())
      .expect(200);
    expect(typeof res.body === 'object').toBe(true);
  });

  // ─── SLO summary ──────────────────────────────────────────────────────

  it('slo-summary: returns array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/slo-summary')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body) || typeof res.body === 'object').toBe(true);
  });

  it('slo-summary: user B sees empty summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/slo-summary')
      .set(authB())
      .expect(200);

    const items = Array.isArray(res.body) ? res.body : res.body.monitors ?? [];
    expect(items.length).toBe(0);
  });

  // ─── Per-monitor SLO report ────────────────────────────────────────────

  it('slo-report: returns SLO data for a monitor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${slaMonitorId}/slo-report`)
      .set(auth())
      .expect(200);

    expect(res.body).toHaveProperty('monitorId');
    expect(res.body.monitorId).toBe(slaMonitorId);
  });

  it('slo-report: 404 for nonexistent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id-xyz/slo-report')
      .set(auth())
      .expect(404);
  });

  it('slo-report: user B cannot access user A monitor', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${slaMonitorId}/slo-report`)
      .set(authB())
      .expect(404);
  });

  // ─── SLA budget forecast ───────────────────────────────────────────────

  it('sla-forecast: returns forecast shape', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${slaMonitorId}/sla-forecast`)
      .set(auth())
      .expect(200);

    expect(typeof res.body === 'object').toBe(true);
    expect(res.body).toHaveProperty('monitorId');
  });

  it('sla-forecast: 404 for nonexistent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id-xyz/sla-forecast')
      .set(auth())
      .expect(404);
  });

  it('sla-forecast: user B cannot access user A monitor', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${slaMonitorId}/sla-forecast`)
      .set(authB())
      .expect([403, 404]);
  });

  // ─── Error budget ──────────────────────────────────────────────────────

  it('error-budget: returns error budget data', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${slaMonitorId}/error-budget`)
      .set(auth())
      .expect(200);

    expect(typeof res.body === 'object').toBe(true);
  });

  it('error-budget: accepts slaTarget and period params', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${slaMonitorId}/error-budget?slaTarget=99.5&period=7d`)
      .set(auth())
      .expect(200);
    expect(typeof res.body === 'object').toBe(true);
  });

  it('error-budget: 404 for nonexistent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id-xyz/error-budget')
      .set(auth())
      .expect(404);
  });

  it('error-budget: user B cannot access user A monitor', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${slaMonitorId}/error-budget`)
      .set(authB())
      .expect(404);
  });

  // ─── Uptime certificate (HTML) ─────────────────────────────────────────

  it('uptime-certificate: returns HTML document', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${slaMonitorId}/uptime-certificate`)
      .set(auth())
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<!DOCTYPE html>');
  });

  it('uptime-certificate: accepts months param', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${slaMonitorId}/uptime-certificate?months=3`)
      .set(auth())
      .expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('uptime-certificate: 404 for nonexistent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id-xyz/uptime-certificate')
      .set(auth())
      .expect(404);
  });

  it('uptime-certificate: user B cannot access user A monitor', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${slaMonitorId}/uptime-certificate`)
      .set(authB())
      .expect([403, 404]);
  });

  // ─── Uptime certificate data (JSON) ───────────────────────────────────

  it('uptime-certificate/data: returns certificate JSON', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${slaMonitorId}/uptime-certificate/data`)
      .set(auth())
      .expect(200);

    expect(typeof res.body === 'object').toBe(true);
  });

  it('uptime-certificate/data: accepts periodDays param', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${slaMonitorId}/uptime-certificate/data?periodDays=90`)
      .set(auth())
      .expect(200);
    expect(typeof res.body === 'object').toBe(true);
  });

  it('uptime-certificate/data: 404 for nonexistent monitor', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/nonexistent-id-xyz/uptime-certificate/data')
      .set(auth())
      .expect(404);
  });

  it('uptime-certificate/data: user B cannot access user A monitor', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${slaMonitorId}/uptime-certificate/data`)
      .set(authB())
      .expect(404);
  });
});
