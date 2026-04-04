/**
 * Integration tests: V2 Folders endpoint.
 *
 * Covers:
 *   GET /v2/folders — flat paginated list with depth, path, stats, search, sort
 *
 * Validates: auth guard, pagination meta, user isolation, search filter,
 * sort by name/createdAt/monitorCount, parentId filter ("root" + specific id),
 * nested folder depth + path derivation, and stats aggregation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('V2 Folders (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let token2: string;
  let userId2: string;

  // Folder IDs
  let rootAlphaId: string;
  let rootBetaId: string;
  let childId: string;      // child of rootAlpha
  let grandchildId: string; // child of childId
  let user2FolderId: string;

  // Monitor IDs (to populate stats)
  let monitorInAlphaId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());

    const u1 = await createTestUser(prisma, module);
    token = u1.token;
    userId = u1.user.id;

    const u2 = await createTestUser(prisma, module);
    token2 = u2.token;
    userId2 = u2.user.id;

    // ── Seed user 1 folder hierarchy ────────────────────────────────────────
    const alpha = await prisma.folder.create({
      data: { userId, name: 'alpha-folder', position: 0 },
    });
    rootAlphaId = alpha.id;

    await new Promise((r) => setTimeout(r, 5));
    const beta = await prisma.folder.create({
      data: { userId, name: 'beta-folder', position: 1 },
    });
    rootBetaId = beta.id;

    const child = await prisma.folder.create({
      data: { userId, name: 'child-folder', parentId: rootAlphaId, position: 0 },
    });
    childId = child.id;

    const grandchild = await prisma.folder.create({
      data: { userId, name: 'grandchild-folder', parentId: childId, position: 0 },
    });
    grandchildId = grandchild.id;

    // ── Seed user 1 monitor assigned to alpha-folder ─────────────────────────
    const monitor = await prisma.monitor.create({
      data: {
        userId,
        name: 'Test Monitor in Alpha',
        type: 'HTTP',
        target: 'https://example.com',
        enabled: true,
        folderId: rootAlphaId,
      },
    });
    monitorInAlphaId = monitor.id;

    // ── Seed user 2 folder (must not appear for user 1) ───────────────────────
    const u2folder = await prisma.folder.create({
      data: { userId: userId2, name: 'user2-only-folder', position: 0 },
    });
    user2FolderId = u2folder.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app, module);
  }, 30000);

  // ── Auth guard ─────────────────────────────────────────────────────────────

  it('returns 401 without auth token', async () => {
    await request(app.getHttpServer())
      .get('/v2/folders')
      .expect(401);
  });

  it('returns 401 with invalid auth token', async () => {
    await request(app.getHttpServer())
      .get('/v2/folders')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  // ── Basic response shape ───────────────────────────────────────────────────

  it('returns 200 with auth', async () => {
    await request(app.getHttpServer())
      .get('/v2/folders')
      .set(auth())
      .expect(200);
  });

  it('response has data array and meta object', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.total).toBe('number');
    expect(typeof res.body.meta.page).toBe('number');
    expect(typeof res.body.meta.limit).toBe('number');
    expect(typeof res.body.meta.pages).toBe('number');
  });

  it('meta.total equals number of user folders', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders')
      .set(auth())
      .expect(200);

    // user 1 has 4 folders: rootAlpha, rootBeta, child, grandchild
    expect(res.body.meta.total).toBe(4);
  });

  it('meta defaults: page=1, limit=50', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders')
      .set(auth())
      .expect(200);

    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(50);
  });

  // ── Folder item shape ──────────────────────────────────────────────────────

  it('each folder item has required fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders')
      .set(auth())
      .expect(200);

    const item = res.body.data[0];
    expect(typeof item.id).toBe('string');
    expect(typeof item.name).toBe('string');
    expect(typeof item.depth).toBe('number');
    expect(Array.isArray(item.path)).toBe(true);
    expect(typeof item.monitorCount).toBe('number');
    expect(item.stats).toBeDefined();
    expect(typeof item.stats.healthy).toBe('number');
    expect(typeof item.stats.degraded).toBe('number');
    expect(typeof item.stats.down).toBe('number');
    expect(typeof item.stats.overallStatus).toBe('string');
    expect(typeof item.createdAt).toBe('string');
  });

  // ── User isolation ─────────────────────────────────────────────────────────

  it('does not return folders belonging to other users', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders')
      .set(auth())
      .expect(200);

    const ids = res.body.data.map((f: { id: string }) => f.id);
    expect(ids).not.toContain(user2FolderId);
  });

  it('user 2 only sees their own folders', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders')
      .set({ Authorization: `Bearer ${token2}` })
      .expect(200);

    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].id).toBe(user2FolderId);
  });

  // ── Depth + path ──────────────────────────────────────────────────────────

  it('root folders have depth=0 and empty path', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders')
      .set(auth())
      .expect(200);

    const alpha = res.body.data.find((f: { id: string }) => f.id === rootAlphaId);
    expect(alpha).toBeDefined();
    expect(alpha.depth).toBe(0);
    expect(alpha.path).toEqual([]);
  });

  it('child folder has depth=1 and path includes parent name', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders')
      .set(auth())
      .expect(200);

    const child = res.body.data.find((f: { id: string }) => f.id === childId);
    expect(child).toBeDefined();
    expect(child.depth).toBe(1);
    expect(Array.isArray(child.path)).toBe(true);
    expect(child.path.length).toBeGreaterThan(0);
    expect(child.path).toContain('alpha-folder');
  });

  it('grandchild folder has depth=2 and path includes both ancestors', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders')
      .set(auth())
      .expect(200);

    const grandchild = res.body.data.find((f: { id: string }) => f.id === grandchildId);
    expect(grandchild).toBeDefined();
    expect(grandchild.depth).toBe(2);
    expect(grandchild.path).toContain('alpha-folder');
    expect(grandchild.path).toContain('child-folder');
  });

  // ── parentId filter ────────────────────────────────────────────────────────

  it('parentId=root returns only top-level folders', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders?parentId=root')
      .set(auth())
      .expect(200);

    const ids = res.body.data.map((f: { id: string }) => f.id);
    expect(ids).toContain(rootAlphaId);
    expect(ids).toContain(rootBetaId);
    expect(ids).not.toContain(childId);
    expect(ids).not.toContain(grandchildId);
  });

  it('parentId=<id> returns only direct children of that folder', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v2/folders?parentId=${rootAlphaId}`)
      .set(auth())
      .expect(200);

    const ids = res.body.data.map((f: { id: string }) => f.id);
    expect(ids).toContain(childId);
    expect(ids).not.toContain(rootBetaId);
    expect(ids).not.toContain(grandchildId); // grandchild is child of childId, not alpha
  });

  // ── Search ─────────────────────────────────────────────────────────────────

  it('search=alpha returns only matching folders', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders?search=alpha')
      .set(auth())
      .expect(200);

    expect(res.body.data.length).toBeGreaterThan(0);
    for (const f of res.body.data) {
      expect(f.name.toLowerCase()).toContain('alpha');
    }
  });

  it('search is case-insensitive', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders?search=ALPHA')
      .set(auth())
      .expect(200);

    expect(res.body.meta.total).toBeGreaterThan(0);
  });

  it('search with no matches returns empty data', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders?search=zzznonexistentfolder999')
      .set(auth())
      .expect(200);

    expect(res.body.meta.total).toBe(0);
    expect(res.body.data).toHaveLength(0);
  });

  // ── Sorting ────────────────────────────────────────────────────────────────

  it('sortBy=name&sortDir=asc returns folders alphabetically', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders?sortBy=name&sortDir=asc')
      .set(auth())
      .expect(200);

    const names: string[] = res.body.data.map((f: { name: string }) => f.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('sortBy=name&sortDir=desc returns folders reverse-alphabetically', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders?sortBy=name&sortDir=desc')
      .set(auth())
      .expect(200);

    const names: string[] = res.body.data.map((f: { name: string }) => f.name);
    const sorted = [...names].sort((a, b) => b.localeCompare(a));
    expect(names).toEqual(sorted);
  });

  it('sortBy=createdAt&sortDir=asc returns oldest first', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders?sortBy=createdAt&sortDir=asc')
      .set(auth())
      .expect(200);

    const timestamps = res.body.data.map((f: { createdAt: string }) => new Date(f.createdAt).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }
  });

  it('sortBy=monitorCount&sortDir=asc returns smallest first', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders?sortBy=monitorCount&sortDir=asc')
      .set(auth())
      .expect(200);

    const counts: number[] = res.body.data.map((f: { monitorCount: number }) => f.monitorCount);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });

  it('sortBy=monitorCount&sortDir=desc returns largest first', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders?sortBy=monitorCount&sortDir=desc')
      .set(auth())
      .expect(200);

    const counts: number[] = res.body.data.map((f: { monitorCount: number }) => f.monitorCount);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });

  // ── Pagination ─────────────────────────────────────────────────────────────

  it('limit=2 returns at most 2 items', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders?limit=2')
      .set(auth())
      .expect(200);

    expect(res.body.data.length).toBeLessThanOrEqual(2);
    expect(res.body.meta.limit).toBe(2);
    expect(res.body.meta.pages).toBe(Math.ceil(4 / 2)); // 4 folders, limit 2
  });

  it('page=2&limit=2 returns second page', async () => {
    const page1 = await request(app.getHttpServer())
      .get('/v2/folders?page=1&limit=2&sortBy=name&sortDir=asc')
      .set(auth())
      .expect(200);

    const page2 = await request(app.getHttpServer())
      .get('/v2/folders?page=2&limit=2&sortBy=name&sortDir=asc')
      .set(auth())
      .expect(200);

    const ids1 = page1.body.data.map((f: { id: string }) => f.id);
    const ids2 = page2.body.data.map((f: { id: string }) => f.id);

    // No overlap between pages
    for (const id of ids1) {
      expect(ids2).not.toContain(id);
    }
  });

  // ── monitorCount field ─────────────────────────────────────────────────────

  it('alpha-folder monitorCount reflects seeded monitor', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders')
      .set(auth())
      .expect(200);

    const alpha = res.body.data.find((f: { id: string }) => f.id === rootAlphaId);
    expect(alpha).toBeDefined();
    expect(alpha.monitorCount).toBeGreaterThanOrEqual(1);
  });

  it('beta-folder monitorCount is 0 (no monitors assigned)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders')
      .set(auth())
      .expect(200);

    const beta = res.body.data.find((f: { id: string }) => f.id === rootBetaId);
    expect(beta).toBeDefined();
    expect(beta.monitorCount).toBe(0);
  });

  // ── Stats overallStatus ────────────────────────────────────────────────────

  it('beta-folder stats.overallStatus is "empty" with no monitors', async () => {
    const res = await request(app.getHttpServer())
      .get('/v2/folders')
      .set(auth())
      .expect(200);

    const beta = res.body.data.find((f: { id: string }) => f.id === rootBetaId);
    expect(beta).toBeDefined();
    expect(beta.stats.overallStatus).toBe('empty');
  });

  // ── Invalid query params ───────────────────────────────────────────────────

  it('invalid sortBy returns 400', async () => {
    await request(app.getHttpServer())
      .get('/v2/folders?sortBy=invalid')
      .set(auth())
      .expect(400);
  });

  it('invalid sortDir returns 400', async () => {
    await request(app.getHttpServer())
      .get('/v2/folders?sortDir=random')
      .set(auth())
      .expect(400);
  });

  it('limit=0 returns 400', async () => {
    await request(app.getHttpServer())
      .get('/v2/folders?limit=0')
      .set(auth())
      .expect(400);
  });

  it('page=0 returns 400', async () => {
    await request(app.getHttpServer())
      .get('/v2/folders?page=0')
      .set(auth())
      .expect(400);
  });
});
