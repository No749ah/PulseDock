/**
 * Integration tests: Monitor export/import endpoints.
 *
 * Covers:
 *   GET  /v1/monitors/export                    — export JSON config
 *   GET  /v1/monitors/export?format=yaml        — export YAML config
 *   POST /v1/monitors/import                    — bulk import monitors
 *   POST /v1/monitors/import-config             — import JSON/YAML config
 *   POST /v1/monitors/import-external           — import from external service
 *   POST /v1/monitors/import-from-compose       — parse Docker Compose YAML
 *   POST /v1/monitors/import-from-openapi/preview — preview OpenAPI monitors
 *   POST /v1/monitors/import-from-openapi       — import from OpenAPI spec
 *
 * Validates: auth guard (401), export format, empty export, import lifecycle,
 *            ids filter, user isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Monitor Export/Import (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  let tokenA: string;
  let userIdA: string;
  let monitorIdA: string;

  let tokenB: string;
  let userIdB: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const userA = await createTestUser(prisma, module);
    tokenA = userA.token;
    userIdA = userA.user.id;

    const userB = await createTestUser(prisma, module);
    tokenB = userB.token;
    userIdB = userB.user.id;

    // Create a monitor for user A to export
    const monRes = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Export Test Monitor', target: 'https://example.com', type: 'HTTP', intervalSec: 60 });
    monitorIdA = monRes.body.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userIdA);
    await cleanupTestUser(prisma, userIdB);
    await destroyTestApp(app);
  }, 15000);

  // ─── Auth guards ─────────────────────────────────────────────────────

  it('GET /v1/monitors/export → 401 unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitors/export')
      .expect(401);
  });

  it('POST /v1/monitors/import → 401 unauthenticated', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import')
      .send({ monitors: [] });
    expect([401, 403]).toContain(res.status);
  });

  // ─── Export JSON ──────────────────────────────────────────────────────

  it('GET /v1/monitors/export → returns JSON attachment with monitors array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/export')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);

    const data = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
    expect(Array.isArray(data.monitors ?? data)).toBe(true);
  });

  it('GET /v1/monitors/export → user A export contains their monitor', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/export')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const data = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
    const monitors = data.monitors ?? data;
    expect(monitors.some((m: { id?: string; name?: string }) =>
      m.id === monitorIdA || m.name === 'Export Test Monitor'
    )).toBe(true);
  });

  it('GET /v1/monitors/export → user B export does NOT contain user A monitor', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/export')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    const data = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
    const monitors = data.monitors ?? data;
    expect(monitors.some((m: { id?: string }) => m.id === monitorIdA)).toBe(false);
  });

  it('GET /v1/monitors/export?ids=:id → exports only specified monitor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/export?ids=${monitorIdA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const data = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
    const monitors = data.monitors ?? data;
    expect(monitors).toHaveLength(1);
    expect(monitors[0].id === monitorIdA || monitors[0].name === 'Export Test Monitor').toBe(true);
  });

  // ─── Export YAML ──────────────────────────────────────────────────────

  it('GET /v1/monitors/export?format=yaml → returns YAML content-type', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/monitors/export?format=yaml')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/yaml|text/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    // YAML starts with monitors: or ---
    const body = res.text ?? res.body?.toString();
    expect(body).toBeTruthy();
  });

  // ─── Import (bulk) ────────────────────────────────────────────────────

  it('POST /v1/monitors/import → empty monitors array succeeds with zero imported', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ monitors: [] })
      .expect(200);

    expect(typeof res.body.imported).toBe('number');
    expect(res.body.imported).toBe(0);
  });

  it('POST /v1/monitors/import → imports a valid HTTP monitor', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        monitors: [
          { name: 'Imported Monitor', target: 'https://import-test.example.com', type: 'HTTP', intervalSec: 120 },
        ],
      })
      .expect(200);

    expect(res.body.imported).toBeGreaterThanOrEqual(1);
  });

  // ─── Import config (JSON/YAML) ────────────────────────────────────────

  it('POST /v1/monitors/import-config → 401 unauthenticated', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import-config')
      .send({ content: '{}', format: 'json' });
    expect([401, 403]).toContain(res.status);
  });

  it('POST /v1/monitors/import-config → invalid content returns 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/monitors/import-config')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'not-valid-json-or-yaml-monitors', format: 'json' })
      .expect(400);
  });

  it('POST /v1/monitors/import-config → valid JSON config with empty monitors returns result', async () => {
    const configJson = JSON.stringify({ version: '1.0', monitors: [] });
    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import-config')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: configJson, format: 'json', dryRun: true })
      .expect(200);

    // Response: { created, updated, skipped, errors, monitors }
    expect(typeof res.body.created).toBe('number');
    expect(Array.isArray(res.body.monitors)).toBe(true);
  });

  // ─── Import from Compose ──────────────────────────────────────────────

  it('POST /v1/monitors/import-from-compose → parses Docker Compose and returns suggestions', async () => {
    const compose = `version: "3"
services:
  web:
    image: nginx
    ports:
      - "80:80"
  api:
    image: node:18
    ports:
      - "3000:3000"
`;
    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import-from-compose')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ compose })
      .expect(200);

    // Returns array of SuggestedMonitor directly
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /v1/monitors/import-from-compose → 401 unauthenticated', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import-from-compose')
      .send({ content: 'version: "3"\nservices: {}' });
    expect([401, 403]).toContain(res.status);
  });

  // ─── Import from OpenAPI (preview) ────────────────────────────────────

  it('POST /v1/monitors/import-from-openapi/preview → returns preview monitor list', async () => {
    const openApiSpec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/health': { get: { summary: 'Health check', responses: { '200': { description: 'OK' } } } },
        '/users': { get: { summary: 'List users', responses: { '200': { description: 'OK' } } } },
      },
    });

    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import-from-openapi/preview')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ specJson: openApiSpec, baseUrl: 'https://api.example.com' })
      .expect(200);

    // Returns { suggestions: [...] }
    expect(Array.isArray(res.body.suggestions)).toBe(true);
  });

  // ─── Import from OpenAPI (actual import) ───────────────────────────────────

  it('POST /v1/monitors/import-from-openapi → 401 unauthenticated', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import-from-openapi')
      .send({ specJson: '{}', baseUrl: 'https://api.example.com', selectedPaths: [] });
    expect([401, 403]).toContain(res.status);
  });

  it('POST /v1/monitors/import-from-openapi → creates no monitors when selectedPaths is empty', async () => {
    const openApiSpec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/health': { get: { summary: 'Health check', responses: { '200': { description: 'OK' } } } },
      },
    });

    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import-from-openapi')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ specJson: openApiSpec, baseUrl: 'https://api.example.com', selectedPaths: [] })
      .expect(200);

    expect(res.body).toHaveProperty('created');
    expect(res.body.created).toBe(0);
    expect(Array.isArray(res.body.monitors)).toBe(true);
    expect(res.body.monitors).toHaveLength(0);
  });

  it('POST /v1/monitors/import-from-openapi → creates monitors for selected paths', async () => {
    const openApiSpec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/status': { get: { summary: 'Status check', responses: { '200': { description: 'OK' } } } },
        '/ping': { get: { summary: 'Ping', responses: { '200': { description: 'OK' } } } },
      },
    });

    // First preview to get available path keys
    const preview = await request(app.getHttpServer())
      .post('/v1/monitors/import-from-openapi/preview')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ specJson: openApiSpec, baseUrl: 'https://api.example.com' })
      .expect(200);

    expect(preview.body.suggestions.length).toBeGreaterThanOrEqual(1);
    const firstKey = preview.body.suggestions[0].key as string;

    // Import just the first path
    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import-from-openapi')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ specJson: openApiSpec, baseUrl: 'https://api.example.com', selectedPaths: [firstKey] })
      .expect(200);

    expect(res.body).toHaveProperty('created');
    expect(res.body.created).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.monitors)).toBe(true);
    expect(res.body.monitors.length).toBe(res.body.created);
  });

  // ─── Import from external service ──────────────────────────────────────────────

  it('POST /v1/monitors/import-external → 401 unauthenticated', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import-external')
      .send({ source: 'csv', payload: '' });
    expect([401, 403]).toContain(res.status);
  });

  it('POST /v1/monitors/import-external → empty CSV returns zero imported', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import-external')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ source: 'csv', payload: '' })
      .expect(200);

    expect(res.body).toHaveProperty('imported');
    expect(res.body.imported).toBe(0);
  });

  it('POST /v1/monitors/import-external → CSV with valid entry imports monitor', async () => {
    const csv = 'name,url\nMy Monitor,https://example.com/check';

    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import-external')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ source: 'csv', payload: csv })
      .expect(200);

    expect(res.body).toHaveProperty('imported');
    expect(res.body.imported).toBeGreaterThanOrEqual(1);
    expect(res.body).toHaveProperty('skipped');
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it('POST /v1/monitors/import-external → uptime-robot empty payload returns zero imported', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import-external')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ source: 'uptime-robot', payload: { monitors: [] } })
      .expect(200);

    expect(res.body.imported).toBe(0);
  });

  it('POST /v1/monitors/import-external → better-uptime empty payload returns zero imported', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/monitors/import-external')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ source: 'better-uptime', payload: { data: [] } })
      .expect(200);

    expect(res.body.imported).toBe(0);
  });
});
