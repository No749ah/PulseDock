/**
 * Integration tests: Check execution pipeline against a real PostgreSQL database.
 *
 * Tests the ChecksService.runMonitor() method directly — creates monitors via HTTP,
 * then triggers check runs via the service and verifies MonitorRun persistence
 * and monitor status updates.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { createTestApp, destroyTestApp, createTestUser, cleanupTestUser } from './setup';
import type { PrismaService } from '../src/common/prisma.service';
import { ChecksService } from '../src/checks/checks.service';
import type { Monitor } from '../src/types';

/**
 * Maps a Prisma monitor row + overrides to the Monitor interface expected by ChecksService.
 */
function mapPrismaMonitorToMonitor(row: Record<string, unknown>): Monitor {
  return {
    id: row.id as string,
    userId: row.userId as string,
    name: row.name as string,
    type: row.type as Monitor['type'],
    target: row.target as string,
    intervalSec: row.intervalSec as number,
    timeoutMs: row.timeoutMs as number,
    confirmations: (row.confirmations as number) ?? 1,
    retryCount: (row.retryCount as number) ?? 0,
    config: (row.configJson as Record<string, unknown>) ?? {},
    alertChannelIds: [],
    folderId: (row.folderId as string) ?? null,
    enabled: row.enabled as boolean,
    description: (row.description as string) ?? null,
    runbookUrl: (row.runbookUrl as string) ?? null,
    slaTarget: (row.slaTarget as number) ?? null,
    slaPeriodDays: (row.slaPeriodDays as number) ?? null,
    slaBreachAlertedAt: null,
    autoIncident: (row.autoIncident as boolean) ?? false,
    autoIncidentSeverity: (row.autoIncidentSeverity as string) ?? 'HIGH',
    activeAutoIncidentId: (row.activeAutoIncidentId as string) ?? null,
    isFlapping: false,
    flapDetectionEnabled: true,
    flapWindow: 10,
    flapThreshold: 0.5,
    flapAlertedAt: null,
    mutedUntil: null,
    latencyAlertMs: null,
    anomalyDetection: false,
    anomalyMultiplier: 2.0,
    sliLatencyTarget: null,
    sliLatencyWindow: 7,
    pausedUntil: null,
    scheduleEnabled: false,
    scheduleDays: '1,2,3,4,5',
    scheduleStartHour: 8,
    scheduleEndHour: 18,
    statusWebhookUrl: null,
    statusWebhookSecret: null,
    createdAt: row.createdAt instanceof Date ? (row.createdAt as Date).toISOString() : (row.createdAt as string) ?? new Date().toISOString(),
  };
}

describe('Check execution pipeline (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let module: TestingModule;
  let checksService: ChecksService;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    ({ app, prisma, module } = await createTestApp());
    const testUser = await createTestUser(prisma, module);
    token = testUser.token;
    userId = testUser.user.id;
    checksService = module.get(ChecksService);
  }, 30000);

  afterAll(async () => {
    await cleanupTestUser(prisma, userId);
    await destroyTestApp(app);
  }, 15000);

  const authHeader = () => ({ Authorization: `Bearer ${token}` });

  // ─── HTTP check produces a MonitorRun ───

  it('should persist a MonitorRun after running an HTTP check', async () => {
    // Create monitor via HTTP
    const created = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authHeader())
      .send({
        name: 'HTTP Check Test',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 300,
        timeoutMs: 10000,
      })
      .expect(201);

    // Fetch the full monitor row from DB
    const dbMonitor = await prisma.monitor.findUnique({ where: { id: created.body.id } });
    expect(dbMonitor).not.toBeNull();

    // Run check via ChecksService
    const monitorObj = mapPrismaMonitorToMonitor(dbMonitor as unknown as Record<string, unknown>);
    const result = await checksService.runMonitor(monitorObj);

    // Verify result shape
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('latencyMs');
    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('level');
    expect(typeof result.ok).toBe('boolean');

    // Verify MonitorRun was persisted in DB
    const runs = await prisma.monitorRun.findMany({
      where: { monitorId: created.body.id },
      orderBy: { checkedAt: 'desc' },
    });

    expect(runs.length).toBeGreaterThanOrEqual(1);
    const latestRun = runs[0];
    expect(latestRun.monitorId).toBe(created.body.id);
    expect(latestRun.userId).toBe(userId);
    expect(latestRun.ok).toBe(result.ok);
    expect(latestRun.latencyMs).toBe(result.latencyMs);
  }, 30000);

  // ─── Successful DNS check is ok=true ───

  it('should produce ok=true for a successful DNS check', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authHeader())
      .send({
        name: 'Reachable DNS',
        type: 'DNS',
        target: 'example.com',
        intervalSec: 300,
        timeoutMs: 10000,
      })
      .expect(201);

    const dbMonitor = await prisma.monitor.findUnique({ where: { id: created.body.id } });
    const monitorObj = mapPrismaMonitorToMonitor(dbMonitor as unknown as Record<string, unknown>);
    const result = await checksService.runMonitor(monitorObj);

    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');
    expect(result.latencyMs).toBeGreaterThan(0);
  }, 30000);

  // ─── Failing TCP check produces ok=false ───

  it('should produce ok=false for an unreachable TCP target', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authHeader())
      .send({
        name: 'Unreachable TCP',
        type: 'TCP',
        target: '192.0.2.1:12345', // RFC 5737 TEST-NET — guaranteed unreachable
        intervalSec: 300,
        timeoutMs: 3000,
      })
      .expect(201);

    const dbMonitor = await prisma.monitor.findUnique({ where: { id: created.body.id } });
    const monitorObj = mapPrismaMonitorToMonitor(dbMonitor as unknown as Record<string, unknown>);
    const result = await checksService.runMonitor(monitorObj);

    expect(result.ok).toBe(false);
    expect(['red', 'yellow']).toContain(result.level);

    // Verify the failed run was persisted
    const runs = await prisma.monitorRun.findMany({
      where: { monitorId: created.body.id },
      orderBy: { checkedAt: 'desc' },
    });
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs[0].ok).toBe(false);
  }, 30000);

  // ─── DNS check works ───

  it('should run a DNS check successfully', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authHeader())
      .send({
        name: 'DNS Check Test',
        type: 'DNS',
        target: 'example.com',
        intervalSec: 300,
        timeoutMs: 10000,
      })
      .expect(201);

    const dbMonitor = await prisma.monitor.findUnique({ where: { id: created.body.id } });
    const monitorObj = mapPrismaMonitorToMonitor(dbMonitor as unknown as Record<string, unknown>);
    const result = await checksService.runMonitor(monitorObj);

    expect(result.ok).toBe(true);
    expect(result.level).toBe('green');

    // Verify persisted
    const runs = await prisma.monitorRun.findMany({
      where: { monitorId: created.body.id },
    });
    expect(runs.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  // ─── Multiple runs accumulate ───

  it('should accumulate multiple MonitorRuns for the same monitor', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/monitors')
      .set(authHeader())
      .send({
        name: 'Multi Run Test',
        type: 'HTTP',
        target: 'https://example.com',
        intervalSec: 300,
        timeoutMs: 10000,
      })
      .expect(201);

    const dbMonitor = await prisma.monitor.findUnique({ where: { id: created.body.id } });
    const monitorObj = mapPrismaMonitorToMonitor(dbMonitor as unknown as Record<string, unknown>);

    // Run 3 checks
    await checksService.runMonitor(monitorObj);
    await checksService.runMonitor(monitorObj);
    await checksService.runMonitor(monitorObj);

    const runs = await prisma.monitorRun.findMany({
      where: { monitorId: created.body.id },
      orderBy: { checkedAt: 'desc' },
    });

    expect(runs.length).toBe(3);
    // All should have valid timestamps
    for (const run of runs) {
      expect(run.checkedAt).toBeDefined();
      expect(run.userId).toBe(userId);
    }
  }, 60000);

  // ─── Auto-incident on consecutive failures ───

  it('should create an auto-incident after consecutive failures when autoIncident is enabled', async () => {
    // Create a monitor with autoIncident enabled via Prisma directly
    // (the API may not expose autoIncident in the create DTO)
    const monitor = await prisma.monitor.create({
      data: {
        userId,
        name: 'Auto Incident Monitor',
        type: 'TCP',
        target: '192.0.2.1:12345', // unreachable
        intervalSec: 300,
        timeoutMs: 3000,
        confirmations: 1,
        autoIncident: true,
        autoIncidentSeverity: 'HIGH',
      },
    });

    const monitorObj = mapPrismaMonitorToMonitor(monitor as unknown as Record<string, unknown>);

    // Run multiple failing checks to trigger auto-incident
    // The confirmations=1 means after 1 consecutive failure it should trigger
    for (let i = 0; i < 3; i++) {
      await checksService.runMonitor(monitorObj);
    }

    // Check if an incident was auto-created for this monitor
    const incidents = await prisma.incident.findMany({
      where: {
        userId,
        autoCreated: true,
        monitors: { some: { monitorId: monitor.id } },
      },
    });

    // Auto-incident should have been created (at least 1)
    expect(incidents.length).toBeGreaterThanOrEqual(1);
    expect(incidents[0].autoCreated).toBe(true);
    expect(incidents[0].status).toBe('INVESTIGATING');
  }, 60000);
});
