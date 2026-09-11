/**
 * Integration tests: Folder CRUD operations against a real PostgreSQL database.
 *
 * Tests the full HTTP lifecycle: create → read → update → move → delete folders,
 * plus hierarchy, cycle detection, auth isolation, mute/unmute, and flat listing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';

describe('Folders (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;
  let tokenB: string;
  let userIdB: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const userA = await createTestUser(prisma, module);
    token = userA.token;
    userId = userA.user.id;
    const userB = await createTestUser(prisma, module);
    tokenB = userB.token;
    userIdB = userB.user.id;
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userIdB);
    await destroyTestApp(app);
  }, 15000);

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const authB = () => ({ Authorization: `Bearer ${tokenB}` });

  // ─── Create ──────────────────────────────────────────────────────────────

  it('should create a root folder', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/folders')
      .set(auth())
      .send({ name: 'Root Folder A' })
      .expect(201);

    expect(res.body).toMatchObject({
      name: 'Root Folder A',
      parentId: null,
      depth: 0,
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.stats.totalMonitors).toBe(0);
    expect(res.body.stats.overallStatus).toBe('empty');
  });

  it('should create a nested child folder', async () => {
    // Create parent first
    const parentRes = await request(app.getHttpServer())
      .post('/v1/folders')
      .set(auth())
      .send({ name: 'Parent Folder' })
      .expect(201);

    const parentId = parentRes.body.id;

    const childRes = await request(app.getHttpServer())
      .post('/v1/folders')
      .set(auth())
      .send({ name: 'Child Folder', parentId })
      .expect(201);

    expect(childRes.body.parentId).toBe(parentId);
    expect(childRes.body.name).toBe('Child Folder');
  });

  it('should reject unknown parentId', async () => {
    await request(app.getHttpServer())
      .post('/v1/folders')
      .set(auth())
      .send({ name: 'Orphan', parentId: 'nonexistent-id-xxxx' })
      .expect(404);
  });

  it('should require auth to create folder (401 or 403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/folders')
      .send({ name: 'No Auth Folder' });
    expect([401, 403]).toContain(res.status);
  });

  // ─── List ────────────────────────────────────────────────────────────────

  it('should list folders as tree', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/folders')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    // Each root node should have children array and stats
    for (const node of res.body) {
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('children');
      expect(node).toHaveProperty('stats');
      expect(Array.isArray(node.children)).toBe(true);
    }
  });

  it('should list folders as flat list', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/folders/flat')
      .set(auth())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    for (const item of res.body) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('depth');
      expect(item).toHaveProperty('path');
      expect(item).toHaveProperty('pathString');
      expect(item).toHaveProperty('monitorCount');
    }
  });

  it('should isolate folders between users', async () => {
    // Create a folder as user A
    const res = await request(app.getHttpServer())
      .post('/v1/folders')
      .set(auth())
      .send({ name: 'User A Folder' })
      .expect(201);
    const folderAId = res.body.id;

    // User B should not see user A's folders
    const listRes = await request(app.getHttpServer())
      .get('/v1/folders')
      .set(authB())
      .expect(200);

    const folderIds = (listRes.body as Array<{ id: string }>).map((f) => f.id);
    expect(folderIds).not.toContain(folderAId);
  });

  // ─── Update ──────────────────────────────────────────────────────────────

  it('should rename a folder', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/v1/folders')
      .set(auth())
      .send({ name: 'Old Name' })
      .expect(201);
    const folderId = createRes.body.id;

    const updateRes = await request(app.getHttpServer())
      .patch(`/v1/folders/${folderId}`)
      .set(auth())
      .send({ name: 'New Name' })
      .expect(200);

    expect(updateRes.body.name).toBe('New Name');
  });

  it('should return 404 when updating non-existent folder', async () => {
    await request(app.getHttpServer())
      .patch('/v1/folders/nonexistent-id')
      .set(auth())
      .send({ name: 'Ghost' })
      .expect(404);
  });

  it('should prevent cross-user folder update (403/404)', async () => {
    // User A creates a folder
    const createRes = await request(app.getHttpServer())
      .post('/v1/folders')
      .set(auth())
      .send({ name: 'A Private Folder' })
      .expect(201);
    const folderId = createRes.body.id;

    // User B tries to update it — should get 404 (not found for user B)
    await request(app.getHttpServer())
      .patch(`/v1/folders/${folderId}`)
      .set(authB())
      .send({ name: 'Stolen Name' })
      .expect(404);
  });

  // ─── Move ────────────────────────────────────────────────────────────────

  it('should move a folder to a new parent', async () => {
    const [folderA, folderB] = await Promise.all([
      request(app.getHttpServer()).post('/v1/folders').set(auth()).send({ name: 'Move Source' }).then((r) => r.body),
      request(app.getHttpServer()).post('/v1/folders').set(auth()).send({ name: 'Move Target' }).then((r) => r.body),
    ]);

    const moveRes = await request(app.getHttpServer())
      .post(`/v1/folders/${folderA.id}/move`)
      .set(auth())
      .send({ parentId: folderB.id })
      .expect(201);

    expect(moveRes.body.parentId).toBe(folderB.id);
  });

  it('should move a folder to root (parentId: null)', async () => {
    // Create parent and child
    const parentRes = await request(app.getHttpServer()).post('/v1/folders').set(auth()).send({ name: 'Parent To Root' }).then((r) => r.body);
    const childRes = await request(app.getHttpServer()).post('/v1/folders').set(auth()).send({ name: 'Child To Root', parentId: parentRes.id }).then((r) => r.body);

    // Move child to root
    const moveRes = await request(app.getHttpServer())
      .post(`/v1/folders/${childRes.id}/move`)
      .set(auth())
      .send({ parentId: null })
      .expect(201);

    expect(moveRes.body.parentId).toBeNull();
  });

  it('should reject circular move (folder into itself)', async () => {
    const folderRes = await request(app.getHttpServer()).post('/v1/folders').set(auth()).send({ name: 'Cycle Self' }).then((r) => r.body);

    await request(app.getHttpServer())
      .post(`/v1/folders/${folderRes.id}/move`)
      .set(auth())
      .send({ parentId: folderRes.id })
      .expect(400);
  });

  it('should reject circular move (folder into descendant)', async () => {
    const parentRes = await request(app.getHttpServer()).post('/v1/folders').set(auth()).send({ name: 'Cycle Parent' }).then((r) => r.body);
    const childRes = await request(app.getHttpServer()).post('/v1/folders').set(auth()).send({ name: 'Cycle Child', parentId: parentRes.id }).then((r) => r.body);

    // Move parent into child — would be circular
    await request(app.getHttpServer())
      .post(`/v1/folders/${parentRes.id}/move`)
      .set(auth())
      .send({ parentId: childRes.id })
      .expect(400);
  });

  // ─── Delete ──────────────────────────────────────────────────────────────

  it('should delete a folder', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/v1/folders')
      .set(auth())
      .send({ name: 'To Delete' })
      .expect(201);
    const folderId = createRes.body.id;

    const deleteRes = await request(app.getHttpServer())
      .delete(`/v1/folders/${folderId}`)
      .set(auth())
      .expect(200);

    expect(deleteRes.body.ok).toBe(true);

    // Folder should no longer exist
    const folders = await prisma.folder.findFirst({ where: { id: folderId } });
    expect(folders).toBeNull();
  });

  it('should unfile monitors when folder is deleted', async () => {
    // Create folder then a monitor in it
    const folderRes = await request(app.getHttpServer()).post('/v1/folders').set(auth()).send({ name: 'Folder With Monitor' }).then((r) => r.body);
    const folderId = folderRes.id;

    const monitorRes = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(auth())
      .send({ name: 'Monitored In Folder', type: 'HTTP', target: 'https://example.com', intervalSec: 300, timeoutMs: 5000 })
      .expect(201);
    const monitorId = monitorRes.body.id;

    // Assign monitor to folder
    await prisma.monitor.update({ where: { id: monitorId }, data: { folderId } });

    // Delete folder
    await request(app.getHttpServer())
      .delete(`/v1/folders/${folderId}`)
      .set(auth())
      .expect(200);

    // Monitor should still exist but folderId should be null
    const monitor = await prisma.monitor.findFirst({ where: { id: monitorId } });
    expect(monitor).not.toBeNull();
    expect(monitor!.folderId).toBeNull();

    // Cleanup monitor
    await prisma.monitor.delete({ where: { id: monitorId } });
  });

  it('should return 404 when deleting non-existent folder', async () => {
    await request(app.getHttpServer())
      .delete('/v1/folders/nonexistent-id')
      .set(auth())
      .expect(404);
  });

  // ─── Mute / Unmute ───────────────────────────────────────────────────────

  it('should mute all monitors in a folder', async () => {
    const folderRes = await request(app.getHttpServer()).post('/v1/folders').set(auth()).send({ name: 'Mute Folder' }).then((r) => r.body);
    const folderId = folderRes.id;

    // Create a monitor in the folder
    const monitorRes = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(auth())
      .send({ name: 'Mutable Monitor', type: 'HTTP', target: 'https://example.com', intervalSec: 300, timeoutMs: 5000 })
      .expect(201);
    const monitorId = monitorRes.body.id;
    await prisma.monitor.update({ where: { id: monitorId }, data: { folderId } });

    const muteRes = await request(app.getHttpServer())
      .post(`/v1/folders/${folderId}/mute`)
      .set(auth())
      .send({ minutes: 60 })
      .expect(201);

    expect(muteRes.body.ok).toBe(true);
    expect(muteRes.body.monitorCount).toBeGreaterThanOrEqual(1);
    expect(muteRes.body.mutedUntil).toBeDefined();

    // Verify DB state
    const monitor = await prisma.monitor.findFirst({ where: { id: monitorId } });
    expect(monitor!.mutedUntil).not.toBeNull();
    const mutedUntil = new Date(monitor!.mutedUntil!);
    expect(mutedUntil.getTime()).toBeGreaterThan(Date.now());

    // Cleanup
    await prisma.monitor.delete({ where: { id: monitorId } });
    await prisma.folder.delete({ where: { id: folderId } });
  });

  it('should unmute all monitors in a folder', async () => {
    const folderRes = await request(app.getHttpServer()).post('/v1/folders').set(auth()).send({ name: 'Unmute Folder' }).then((r) => r.body);
    const folderId = folderRes.id;

    const monitorRes = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(auth())
      .send({ name: 'Unmutable Monitor', type: 'HTTP', target: 'https://example.com', intervalSec: 300, timeoutMs: 5000 })
      .expect(201);
    const monitorId = monitorRes.body.id;

    // Put monitor in folder and pre-mute it
    const mutedUntil = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.monitor.update({ where: { id: monitorId }, data: { folderId, mutedUntil } });

    const unmuteRes = await request(app.getHttpServer())
      .delete(`/v1/folders/${folderId}/mute`)
      .set(auth())
      .expect(200);

    expect(unmuteRes.body.ok).toBe(true);

    const monitor = await prisma.monitor.findFirst({ where: { id: monitorId } });
    expect(monitor!.mutedUntil).toBeNull();

    // Cleanup
    await prisma.monitor.delete({ where: { id: monitorId } });
    await prisma.folder.delete({ where: { id: folderId } });
  });

  it('should return mute status for folder tree', async () => {
    const folderRes = await request(app.getHttpServer()).post('/v1/folders').set(auth()).send({ name: 'Status Folder' }).then((r) => r.body);
    const folderId = folderRes.id;

    const muteStatusRes = await request(app.getHttpServer())
      .get(`/v1/folders/${folderId}/mute-status`)
      .set(auth())
      .expect(200);

    expect(muteStatusRes.body).toMatchObject({
      folderId,
      totalMonitors: 0,
      mutedCount: 0,
      allMuted: false,
      anyMuted: false,
    });
    expect(Array.isArray(muteStatusRes.body.monitors)).toBe(true);

    // Cleanup
    await prisma.folder.delete({ where: { id: folderId } });
  });

  it('should reject mute with invalid minutes', async () => {
    const folderRes = await request(app.getHttpServer()).post('/v1/folders').set(auth()).send({ name: 'Mute Validate' }).then((r) => r.body);

    await request(app.getHttpServer())
      .post(`/v1/folders/${folderRes.id}/mute`)
      .set(auth())
      .send({ minutes: 0 }) // below minimum (1)
      .expect(400);

    await request(app.getHttpServer())
      .post(`/v1/folders/${folderRes.id}/mute`)
      .set(auth())
      .send({ minutes: 9999 }) // above max (1440)
      .expect(400);

    // Cleanup
    await prisma.folder.delete({ where: { id: folderRes.id } });
  });
});
