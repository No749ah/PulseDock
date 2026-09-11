/**
 * Integration tests: Alert Routing Rules CRUD + simulate endpoint.
 *
 * Covers full lifecycle: create → list → update → toggle → reorder → delete,
 * plus simulation with monitor matching, auth guard, and user isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import { MonitorType } from '@prisma/client';
import type { PrismaService } from '../src/common/prisma.service';

describe('Alert Routing Rules (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let token: string;
  let userId: string;

  // Second user for isolation tests
  let token2: string;
  let userId2: string;

  // Shared resources created in beforeAll
  let monitorId: string;
  let channelId: string;
  let channel2Id: string; // for user2

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const u1 = await createTestUser(prisma, module);
    token = u1.token;
    userId = u1.user.id;

    const u2 = await createTestUser(prisma, module);
    token2 = u2.token;
    userId2 = u2.user.id;

    // Create a minimal HTTP monitor for simulate tests (user1)
    const monitor = await prisma.monitor.create({
      data: {
        userId,
        name: 'Routing Test Monitor',
        type: MonitorType.HTTP,
        target: 'https://example.com',
        enabled: true,
      },
    });
    monitorId = monitor.id;

    // Create a webhook alert channel for user1 (routing rules require min 1 channelId)
    const channel = await prisma.alertChannel.create({
      data: {
        userId,
        name: 'Test Webhook Channel',
        type: 'webhook',
        configJson: { url: 'https://example.com/wh' },
      },
    });
    channelId = channel.id;

    // Create a channel for user2 (isolation tests)
    const ch2 = await prisma.alertChannel.create({
      data: {
        userId: userId2,
        name: 'User2 Webhook Channel',
        type: 'webhook',
        configJson: { url: 'https://example.com/wh2' },
      },
    });
    channel2Id = ch2.id;
  }, 30000);

  afterAll(async () => {
    await prisma.alertChannel.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.alertChannel.deleteMany({ where: { userId: userId2 } }).catch(() => undefined);
    await prisma.monitor.deleteMany({ where: { userId } }).catch(() => undefined);
    await cleanupTestUser(prisma, userId);
    await cleanupTestUser(prisma, userId2);
    await destroyTestApp(app);
  }, 15000);

  const authHeader = (t = token) => ({ Authorization: `Bearer ${t}` });
  const ch = () => [channelId]; // shorthand for valid channelIds

  // ─── Auth guard ───────────────────────────────────────────────────────────

  it('GET /v1/alert-routing-rules → 401 without auth', async () => {
    await request(app.getHttpServer()).get('/v1/alert-routing-rules').expect(401);
  });

  it('POST /v1/alert-routing-rules → 401/403 without auth', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .send({ name: 'no-auth', channelIds: ch() });
    expect([401, 403]).toContain(res.status);
  });

  // ─── Create ───────────────────────────────────────────────────────────────

  it('should return empty list when no rules exist', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/alert-routing-rules')
      .set(authHeader())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should create a minimal routing rule (name + channelIds)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({ name: 'Catch-all rule', channelIds: ch() })
      .expect(201);

    expect(res.body).toMatchObject({
      name: 'Catch-all rule',
      channelIds: ch(),
      enabled: true,
      priority: 0,
      matchTags: [],
      matchTypes: [],
      matchFolderIds: [],
      matchLevels: [],
      matchMonitorIds: [],
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.userId).toBe(userId);
  });

  it('should create a rule with all match conditions', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({
        name: 'Production critical rule',
        description: 'Route production errors to PD',
        priority: 10,
        enabled: true,
        matchTags: ['production'],
        matchTypes: ['http', 'ssl'],
        matchLevels: ['red'],
        channelIds: ch(),
      })
      .expect(201);

    expect(res.body).toMatchObject({
      name: 'Production critical rule',
      description: 'Route production errors to PD',
      priority: 10,
      enabled: true,
      matchTags: ['production'],
      matchTypes: ['http', 'ssl'],
      matchLevels: ['red'],
    });
  });

  it('should reject missing name (400)', async () => {
    await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({ channelIds: ch() })
      .expect(400);
  });

  it('should reject empty channelIds (400)', async () => {
    await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({ name: 'No channels', channelIds: [] })
      .expect(400);
  });

  // ─── List (ordered by priority) ───────────────────────────────────────────

  it('should list rules ordered by priority ascending', async () => {
    await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({ name: 'Low priority rule', priority: 100, channelIds: ch() })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({ name: 'High priority rule', priority: 1, channelIds: ch() })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/v1/alert-routing-rules')
      .set(authHeader())
      .expect(200);

    const priorities = res.body.map((r: { priority: number }) => r.priority);
    for (let i = 1; i < priorities.length; i++) {
      expect(priorities[i]).toBeGreaterThanOrEqual(priorities[i - 1]);
    }
  });

  // ─── Update ───────────────────────────────────────────────────────────────

  it('should update a routing rule', async () => {
    const create = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({ name: 'Rule to update', channelIds: ch() })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/v1/alert-routing-rules/${create.body.id}`)
      .set(authHeader())
      .send({ name: 'Updated rule name', description: 'Added description', matchLevels: ['red', 'yellow'] })
      .expect(200);

    expect(res.body.name).toBe('Updated rule name');
    expect(res.body.description).toBe('Added description');
    expect(res.body.matchLevels).toEqual(['red', 'yellow']);
  });

  it('should return 404 when updating a nonexistent rule', async () => {
    await request(app.getHttpServer())
      .patch('/v1/alert-routing-rules/nonexistent-id')
      .set(authHeader())
      .send({ name: 'ghost' })
      .expect(404);
  });

  // ─── Toggle ───────────────────────────────────────────────────────────────

  it('should toggle a routing rule enabled/disabled', async () => {
    const create = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({ name: 'Toggle test rule', enabled: true, channelIds: ch() })
      .expect(201);

    expect(create.body.enabled).toBe(true);

    // Toggle off
    const toggled = await request(app.getHttpServer())
      .patch(`/v1/alert-routing-rules/${create.body.id}/toggle`)
      .set(authHeader())
      .expect(200);

    expect(toggled.body.enabled).toBe(false);

    // Toggle back on
    const reToggled = await request(app.getHttpServer())
      .patch(`/v1/alert-routing-rules/${create.body.id}/toggle`)
      .set(authHeader())
      .expect(200);

    expect(reToggled.body.enabled).toBe(true);
  });

  it('should return 404 when toggling a nonexistent rule', async () => {
    await request(app.getHttpServer())
      .patch('/v1/alert-routing-rules/nonexistent-id/toggle')
      .set(authHeader())
      .expect(404);
  });

  // ─── Reorder ──────────────────────────────────────────────────────────────

  it('should reorder rules by assigning priority based on array position', async () => {
    const r1 = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({ name: 'Reorder rule A', priority: 5, channelIds: ch() })
      .expect(201);

    const r2 = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({ name: 'Reorder rule B', priority: 10, channelIds: ch() })
      .expect(201);

    const r3 = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({ name: 'Reorder rule C', priority: 15, channelIds: ch() })
      .expect(201);

    // Reorder: C → A → B
    const res = await request(app.getHttpServer())
      .patch('/v1/alert-routing-rules/reorder')
      .set(authHeader())
      .send({ ids: [r3.body.id, r1.body.id, r2.body.id] })
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const updated = res.body as Array<{ id: string; priority: number }>;
    const c = updated.find((r) => r.id === r3.body.id);
    const a = updated.find((r) => r.id === r1.body.id);
    const b = updated.find((r) => r.id === r2.body.id);
    expect(c!.priority).toBe(0);
    expect(a!.priority).toBe(1);
    expect(b!.priority).toBe(2);
  });

  it('should reject reorder with another user\'s rule id (403)', async () => {
    // User2 creates a rule with their own channel
    const r2 = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader(token2))
      .send({ name: 'User2 rule for reorder', channelIds: [channel2Id] })
      .expect(201);

    // User1 creates a rule
    const r1 = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({ name: 'User1 reorder rule', channelIds: ch() })
      .expect(201);

    // User1 tries to reorder including user2's rule ID
    await request(app.getHttpServer())
      .patch('/v1/alert-routing-rules/reorder')
      .set(authHeader())
      .send({ ids: [r1.body.id, r2.body.id] })
      .expect(403);
  });

  // ─── Delete ───────────────────────────────────────────────────────────────

  it('should delete a routing rule', async () => {
    const create = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({ name: 'Rule to delete', channelIds: ch() })
      .expect(201);

    const res = await request(app.getHttpServer())
      .delete(`/v1/alert-routing-rules/${create.body.id}`)
      .set(authHeader())
      .expect(200);

    expect(res.body.success).toBe(true);

    // Verify gone
    const list = await request(app.getHttpServer())
      .get('/v1/alert-routing-rules')
      .set(authHeader())
      .expect(200);

    const found = list.body.find((r: { id: string }) => r.id === create.body.id);
    expect(found).toBeUndefined();
  });

  it('should return 404 when deleting a nonexistent rule', async () => {
    await request(app.getHttpServer())
      .delete('/v1/alert-routing-rules/nonexistent-id')
      .set(authHeader())
      .expect(404);
  });

  // ─── Simulate ─────────────────────────────────────────────────────────────

  it('should simulate routing with no rules → fallback active', async () => {
    // Clean all rules for user1 first
    const rules = await request(app.getHttpServer())
      .get('/v1/alert-routing-rules')
      .set(authHeader())
      .expect(200);

    for (const rule of rules.body as Array<{ id: string }>) {
      await request(app.getHttpServer())
        .delete(`/v1/alert-routing-rules/${rule.id}`)
        .set(authHeader());
    }

    const res = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules/simulate')
      .set(authHeader())
      .send({ monitorId, level: 'red' })
      .expect(201);

    expect(res.body.monitor.id).toBe(monitorId);
    expect(res.body.simulatedLevel).toBe('red');
    expect(res.body.totalRules).toBe(0);
    expect(res.body.matchedRulesCount).toBe(0);
    expect(res.body.fallback).not.toBeNull();
    expect(res.body.fallback.active).toBe(true);
  });

  it('should simulate routing with a catch-all rule (no conditions)', async () => {
    const rule = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({ name: 'Simulate catch-all', channelIds: ch(), enabled: true })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules/simulate')
      .set(authHeader())
      .send({ monitorId, level: 'red' })
      .expect(201);

    expect(res.body.totalRules).toBeGreaterThanOrEqual(1);
    const matchedRule = res.body.routing.find((r: { ruleId: string }) => r.ruleId === rule.body.id);
    expect(matchedRule).toBeDefined();
    expect(matchedRule.matched).toBe(true);
    expect(res.body.fallback).toBeNull(); // Rules matched — no fallback
  });

  it('should simulate routing with a level-specific rule that doesn\'t match', async () => {
    // Create a rule that only matches 'yellow' level
    await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({ name: 'Yellow only rule', matchLevels: ['yellow'], channelIds: ch(), enabled: true })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules/simulate')
      .set(authHeader())
      .send({ monitorId, level: 'red' })
      .expect(201);

    const yellowRule = res.body.routing.find((r: { ruleName: string }) => r.ruleName === 'Yellow only rule');
    expect(yellowRule?.matched).toBe(false);
    const check = yellowRule?.checks.find((c: { condition: string }) => c.condition === 'matchLevels');
    expect(check?.passed).toBe(false);
  });

  it('should simulate routing with a monitor-id specific rule that matches', async () => {
    await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader())
      .send({ name: 'Specific monitor rule', matchMonitorIds: [monitorId], channelIds: ch(), enabled: true })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules/simulate')
      .set(authHeader())
      .send({ monitorId, level: 'red' })
      .expect(201);

    const specificRule = res.body.routing.find((r: { ruleName: string }) => r.ruleName === 'Specific monitor rule');
    expect(specificRule?.matched).toBe(true);
    const check = specificRule?.checks.find((c: { condition: string }) => c.condition === 'matchMonitorIds');
    expect(check?.passed).toBe(true);
  });

  it('should return 404 when simulating with a nonexistent monitor', async () => {
    await request(app.getHttpServer())
      .post('/v1/alert-routing-rules/simulate')
      .set(authHeader())
      .send({ monitorId: 'nonexistent-monitor-id', level: 'red' })
      .expect(404);
  });

  it('should return 400 when simulating with an invalid level', async () => {
    await request(app.getHttpServer())
      .post('/v1/alert-routing-rules/simulate')
      .set(authHeader())
      .send({ monitorId, level: 'invalid-level' })
      .expect(400);
  });

  // ─── User isolation ────────────────────────────────────────────────────────

  it('should not see another user\'s routing rules', async () => {
    await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader(token2))
      .send({ name: 'User2 private rule', channelIds: [channel2Id] })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/v1/alert-routing-rules')
      .set(authHeader())
      .expect(200);

    const names = res.body.map((r: { name: string }) => r.name);
    expect(names).not.toContain('User2 private rule');
  });

  it('should not allow updating another user\'s rule (403)', async () => {
    const r2 = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader(token2))
      .send({ name: 'User2 update target', channelIds: [channel2Id] })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/alert-routing-rules/${r2.body.id}`)
      .set(authHeader())
      .send({ name: 'hijacked' })
      .expect(403);
  });

  it('should not allow deleting another user\'s rule (403)', async () => {
    const r2 = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader(token2))
      .send({ name: 'User2 delete target', channelIds: [channel2Id] })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/alert-routing-rules/${r2.body.id}`)
      .set(authHeader())
      .expect(403);
  });

  it('should not allow toggling another user\'s rule (403)', async () => {
    const r2 = await request(app.getHttpServer())
      .post('/v1/alert-routing-rules')
      .set(authHeader(token2))
      .send({ name: 'User2 toggle target', channelIds: [channel2Id] })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/alert-routing-rules/${r2.body.id}/toggle`)
      .set(authHeader())
      .expect(403);
  });
});
