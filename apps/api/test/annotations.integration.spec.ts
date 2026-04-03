/**
 * Integration tests: Monitor Annotations against a real PostgreSQL database.
 *
 * Covers: full CRUD lifecycle (list/create/update/delete), color validation,
 * auth guard (401), user isolation (monitor ownership check), text length
 * validation, and ordering by annotatedAt desc.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Monitor Annotations (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;

  let userA: { id: string; email: string };
  let tokenA: string;
  let userB: { id: string; email: string };
  let tokenB: string;

  let monitorA: { id: string };

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    ({ user: userA, token: tokenA } = await createTestUser(prisma, module));
    ({ user: userB, token: tokenB } = await createTestUser(prisma, module));

    // Create a monitor for userA
    monitorA = await prisma.monitor.create({
      data: {
        userId: userA.id,
        name: 'Annotation Test Monitor',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 60,
        enabled: true,
      },
    });
  }, 30000);

  afterAll(async () => {
    await prisma.monitorAnnotation.deleteMany({ where: { monitorId: monitorA.id } });
    await prisma.monitor.deleteMany({ where: { id: monitorA.id } });
    await cleanupTestUser(prisma, userA.id);
    await cleanupTestUser(prisma, userB.id);
    await destroyTestApp(app);
  }, 15000);

  // ─── auth guard ────────────────────────────────────────────────────────────

  it('GET /v1/monitors/:id/annotations → 401 without token', async () => {
    await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorA.id}/annotations`)
      .expect(401);
  });

  it('POST /v1/monitors/:id/annotations → 401 or 403 without token', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA.id}/annotations`)
      .send({ text: 'Deploy', annotatedAt: new Date().toISOString() });
    expect([401, 403]).toContain(res.status);
  });

  // ─── list (empty) ──────────────────────────────────────────────────────────

  it('lists empty annotations for a fresh monitor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(res.body.annotations).toEqual([]);
  });

  it('returns error for monitor not belonging to user', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    // Controller returns 200 with error object (no exception thrown)
    expect(res.body.error).toBeDefined();
    expect(res.body.statusCode).toBe(404);
  });

  // ─── create ────────────────────────────────────────────────────────────────

  it('creates an annotation with default color', async () => {
    const annotatedAt = new Date('2026-04-01T10:00:00Z').toISOString();
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'Deployed v2.0', annotatedAt })
      .expect(201);

    expect(res.body.annotation).toBeDefined();
    expect(res.body.annotation.text).toBe('Deployed v2.0');
    expect(res.body.annotation.color).toBe('blue'); // default
    expect(res.body.annotation.monitorId).toBe(monitorA.id);
    expect(res.body.annotation.userId).toBe(userA.id);
  });

  it('creates annotation with explicit color', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'Incident started', color: 'red', annotatedAt: new Date('2026-04-01T12:00:00Z').toISOString() })
      .expect(201);

    expect(res.body.annotation.color).toBe('red');
    expect(res.body.annotation.text).toBe('Incident started');
  });

  it('rejects invalid color', async () => {
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'Bad color', color: 'magenta', annotatedAt: new Date().toISOString() })
      .expect(400);
  });

  it('rejects empty text', async () => {
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: '', annotatedAt: new Date().toISOString() })
      .expect(400);
  });

  it('rejects text > 200 chars', async () => {
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'x'.repeat(201), annotatedAt: new Date().toISOString() })
      .expect(400);
  });

  it('returns error when creating annotation on another user\'s monitor', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ text: 'Cross-user annotation', annotatedAt: new Date().toISOString() })
      .expect(201);

    // Controller returns 200/201 with error object (no exception thrown)
    expect(res.body.error).toBeDefined();
    expect(res.body.statusCode).toBe(404);
  });

  // ─── list ordering ─────────────────────────────────────────────────────────

  it('lists annotations ordered by annotatedAt desc', async () => {
    // Create annotations in non-chronological order
    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'Earlier', annotatedAt: new Date('2026-03-01T08:00:00Z').toISOString() })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'Latest', annotatedAt: new Date('2026-04-03T06:00:00Z').toISOString() })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const texts = res.body.annotations.map((a: { text: string }) => a.text);
    const latestIdx = texts.indexOf('Latest');
    const earlierIdx = texts.indexOf('Earlier');
    expect(latestIdx).toBeLessThan(earlierIdx);
  });

  // ─── update ────────────────────────────────────────────────────────────────

  it('updates annotation text', async () => {
    const created = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'Original text', annotatedAt: new Date().toISOString() })
      .expect(201);

    const annotationId = created.body.annotation.id;

    const res = await request(app.getHttpServer())
      .patch(`/v1/monitors/${monitorA.id}/annotations/${annotationId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'Updated text' })
      .expect(200);

    expect(res.body.annotation.text).toBe('Updated text');
  });

  it('updates annotation color', async () => {
    const created = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'Color test', color: 'blue', annotatedAt: new Date().toISOString() })
      .expect(201);

    const annotationId = created.body.annotation.id;

    const res = await request(app.getHttpServer())
      .patch(`/v1/monitors/${monitorA.id}/annotations/${annotationId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ color: 'green' })
      .expect(200);

    expect(res.body.annotation.color).toBe('green');
  });

  it('returns 404 when updating nonexistent annotation', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/monitors/${monitorA.id}/annotations/nonexistent-xyz`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'No-op' })
      .expect(200);

    // Controller returns error object for not found
    expect(res.body.error).toBeDefined();
    expect(res.body.statusCode).toBe(404);
  });

  it('returns 404 when updating annotation of another user', async () => {
    const created = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'Private annotation', annotatedAt: new Date().toISOString() })
      .expect(201);

    const annotationId = created.body.annotation.id;

    const res = await request(app.getHttpServer())
      .patch(`/v1/monitors/${monitorA.id}/annotations/${annotationId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ text: 'Hijacked' })
      .expect(200);

    // Controller returns error object (not an HTTP exception)
    expect(res.body.error).toBeDefined();
    expect(res.body.statusCode).toBe(404);
  });

  // ─── delete ────────────────────────────────────────────────────────────────

  it('deletes an annotation and returns 204', async () => {
    const created = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'To be deleted', annotatedAt: new Date().toISOString() })
      .expect(201);

    const annotationId = created.body.annotation.id;

    await request(app.getHttpServer())
      .delete(`/v1/monitors/${monitorA.id}/annotations/${annotationId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);

    // Verify it's gone from DB
    const inDb = await prisma.monitorAnnotation.findFirst({ where: { id: annotationId } });
    expect(inDb).toBeNull();
  });

  it('silently ignores delete of nonexistent annotation', async () => {
    // Controller returns 204 even if not found (no guard on delete)
    await request(app.getHttpServer())
      .delete(`/v1/monitors/${monitorA.id}/annotations/nonexistent-abc`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);
  });

  // ─── full lifecycle ────────────────────────────────────────────────────────

  it('full lifecycle: create → list → update → delete', async () => {
    const annotatedAt = new Date('2026-04-02T14:00:00Z').toISOString();

    // Create
    const created = await request(app.getHttpServer())
      .post(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'Lifecycle test', color: 'purple', annotatedAt })
      .expect(201);

    const id = created.body.annotation.id;
    expect(id).toBeDefined();

    // List — should include it
    const list = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(list.body.annotations.some((a: { id: string }) => a.id === id)).toBe(true);

    // Update
    await request(app.getHttpServer())
      .patch(`/v1/monitors/${monitorA.id}/annotations/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'Lifecycle updated', color: 'yellow' })
      .expect(200);

    // Delete
    await request(app.getHttpServer())
      .delete(`/v1/monitors/${monitorA.id}/annotations/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);

    // Confirm gone
    const after = await request(app.getHttpServer())
      .get(`/v1/monitors/${monitorA.id}/annotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(after.body.annotations.some((a: { id: string }) => a.id === id)).toBe(false);
  });
});
