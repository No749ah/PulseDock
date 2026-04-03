/**
 * Integration tests: Tool Registry endpoints against a real NestJS app.
 *
 * The tool registry is a public, read-only endpoint (no auth required).
 * Covers: list/search, get by id, variants, category filtering.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, destroyTestApp } from './setup';

describe('Tool Registry (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  }, 30000);

  afterAll(async () => {
    await destroyTestApp(app);
  }, 15000);

  // ─── List / Search ───

  it('GET /v1/tool-registry returns paginated tool list', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/tool-registry')
      .expect(200);

    expect(Array.isArray(res.body.tools)).toBe(true);
    expect(res.body.tools.length).toBeGreaterThan(0);
    expect(res.body.total).toBeGreaterThan(0);

    // Each tool should have required fields
    const tool = res.body.tools[0];
    expect(tool.id).toBeDefined();
    expect(tool.name).toBeDefined();
    expect(tool.category).toBeDefined();
  });

  it('GET /v1/tool-registry supports search query', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/tool-registry?q=nginx')
      .expect(200);

    expect(Array.isArray(res.body.tools)).toBe(true);
    // At least one result should match nginx
    if (res.body.tools.length > 0) {
      const names = res.body.tools.map((t: { name: string }) => t.name.toLowerCase());
      expect(names.some((n: string) => n.includes('nginx'))).toBe(true);
    }
  });

  it('GET /v1/tool-registry supports category filter', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/tool-registry?category=database')
      .expect(200);

    expect(Array.isArray(res.body.tools)).toBe(true);
    for (const tool of res.body.tools) {
      expect(tool.category.toLowerCase()).toBe('database');
    }
  });

  it('search returns fewer results than unfiltered list', async () => {
    const all = await request(app.getHttpServer())
      .get('/v1/tool-registry')
      .expect(200);

    const filtered = await request(app.getHttpServer())
      .get('/v1/tool-registry?q=nginx')
      .expect(200);

    // Filtered results should be a subset
    expect(filtered.body.total).toBeLessThanOrEqual(all.body.total);
  });

  it('supports withVariants flag', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/tool-registry?withVariants=true&q=nginx')
      .expect(200);

    if (res.body.tools.length > 0) {
      // When withVariants=true, each tool should have a variants array
      expect(res.body.tools[0]).toHaveProperty('variants');
      expect(Array.isArray(res.body.tools[0].variants)).toBe(true);
    }
  });

  it('returns categories list', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/tool-registry')
      .expect(200);

    if (res.body.categories) {
      expect(Array.isArray(res.body.categories)).toBe(true);
      expect(res.body.categories.length).toBeGreaterThan(0);
    }
  });

  // ─── Get by ID ───

  it('GET /v1/tool-registry/:id returns tool details', async () => {
    // First get a valid tool ID
    const list = await request(app.getHttpServer())
      .get('/v1/tool-registry')
      .expect(200);

    const toolId = list.body.tools[0]?.id;
    if (!toolId) return; // skip if empty registry

    const res = await request(app.getHttpServer())
      .get(`/v1/tool-registry/${toolId}`)
      .expect(200);

    expect(res.body.id).toBe(toolId);
    expect(res.body.name).toBeDefined();
    expect(res.body.category).toBeDefined();
  });

  it('GET /v1/tool-registry/:id returns 404 for unknown tool', async () => {
    await request(app.getHttpServer())
      .get('/v1/tool-registry/nonexistent-tool-xyz-999')
      .expect(404);
  });

  // ─── Variants ───

  it('GET /v1/tool-registry/:id/variants returns variant list', async () => {
    // First find a tool
    const list = await request(app.getHttpServer())
      .get('/v1/tool-registry')
      .expect(200);

    const toolId = list.body.tools[0]?.id;
    if (!toolId) return;

    const res = await request(app.getHttpServer())
      .get(`/v1/tool-registry/${toolId}/variants`)
      .expect(200);

    expect(res.body.toolId).toBe(toolId);
    expect(res.body).toHaveProperty('variants');
    expect(Array.isArray(res.body.variants)).toBe(true);
  });

  it('GET /v1/tool-registry/:id/variants returns 404 for unknown tool', async () => {
    await request(app.getHttpServer())
      .get('/v1/tool-registry/nonexistent-tool-xyz-999/variants')
      .expect(404);
  });

  // ─── No Auth Required ───

  it('tool registry endpoints do not require authentication', async () => {
    // All three endpoints should work without Authorization header
    const listRes = await request(app.getHttpServer()).get('/v1/tool-registry');
    expect(listRes.status).not.toBe(401);

    // Get a tool ID for detail/variant check
    if (listRes.body.tools?.length > 0) {
      const toolId = listRes.body.tools[0].id;

      const detailRes = await request(app.getHttpServer()).get(`/v1/tool-registry/${toolId}`);
      expect(detailRes.status).not.toBe(401);

      const variantRes = await request(app.getHttpServer()).get(`/v1/tool-registry/${toolId}/variants`);
      expect(variantRes.status).not.toBe(401);
    }
  });
});
