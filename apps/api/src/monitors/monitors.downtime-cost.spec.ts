/**
 * Unit tests for downtimeCostReport and downtimeCostHistory service methods.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { MonitorsAnalyticsService } from './monitors-analytics.service';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { VersionDetectionService } from './version-detection.service';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MonitorsService } from './monitors.service';

const NOW = new Date('2026-03-29T10:00:00Z');

function buildRun(ok: boolean, minutesAgo: number): { ok: boolean; checkedAt: Date } {
  return { ok, checkedAt: new Date(NOW.getTime() - minutesAgo * 60_000) };
}

function buildPrisma(monitorFindMany: object[], runFindMany?: object[], monitorFindFirst?: object) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitorFindMany),
      findFirst: vi.fn().mockResolvedValue(monitorFindFirst ?? null),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue(runFindMany ?? []),
    },
  };
}

async function buildService(prismaMock: object): Promise<MonitorsAnalyticsService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MonitorsAnalyticsService,
      { provide: PrismaService, useValue: prismaMock },
      { provide: ChecksService, useValue: {} },
      { provide: AuditService, useValue: { log: vi.fn() } },
      { provide: RealtimeEvents, useValue: { monitorCreated: vi.fn(), monitorUpdated: vi.fn() } },
      { provide: VersionDetectionService, useValue: {} },
    ],
  }).compile();
  return module.get(MonitorsAnalyticsService);
}

describe('MonitorsService.downtimeCostReport', () => {
  it('1. empty fleet (no monitors with cost set) → returns zeros', async () => {
    const prisma = buildPrisma([]);
    const service = await buildService(prisma);
    const result = await service.downtimeCostReport('user1');
    expect(result.totalEstimatedCost).toBe(0);
    expect(result.totalDowntimeMinutes).toBe(0);
    expect(result.monitorCount).toBe(0);
    expect(result.monitors).toHaveLength(0);
    expect(result.currency).toBe('USD');
    expect(result.periodDays).toBe(30);
  });

  it('2. monitor with no downtime → cost = 0', async () => {
    const prisma = buildPrisma([
      {
        id: 'm1',
        name: 'Test Monitor',
        downtimeCostPerHour: 100,
        intervalSec: 60,
        runs: [
          buildRun(true, 60),
          buildRun(true, 120),
          buildRun(true, 180),
        ],
      },
    ]);
    const service = await buildService(prisma);
    const result = await service.downtimeCostReport('user1');
    expect(result.totalEstimatedCost).toBe(0);
    expect(result.monitors[0].estimatedCost).toBe(0);
    expect(result.monitors[0].downtimeMinutes).toBe(0);
    expect(result.monitors[0].incidentCount).toBe(0);
  });

  it('3. monitor with downtime → correct cost calculation', async () => {
    // intervalSec=60, 2 failed checks → downtime = 2 min = 0.0333h
    // cost = 0.0333 * $300/h = $10
    const prisma = buildPrisma([
      {
        id: 'm1',
        name: 'API Monitor',
        downtimeCostPerHour: 300,
        intervalSec: 60,
        runs: [
          buildRun(false, 100),
          buildRun(false, 160),
          buildRun(true, 220),
        ],
      },
    ]);
    const service = await buildService(prisma);
    const result = await service.downtimeCostReport('user1');
    const m = result.monitors[0];
    // 2 failed checks * 60s = 120s = 2 minutes
    expect(m.downtimeMinutes).toBe(2);
    // 2min / 60 * 300 = 10
    expect(m.estimatedCost).toBe(10);
    expect(result.totalEstimatedCost).toBe(10);
  });

  it('4. multiple monitors → correct fleet totals', async () => {
    const prisma = buildPrisma([
      {
        id: 'm1',
        name: 'Monitor A',
        downtimeCostPerHour: 60,
        intervalSec: 60,
        runs: [buildRun(false, 100), buildRun(false, 160)], // 2 min downtime → $2
      },
      {
        id: 'm2',
        name: 'Monitor B',
        downtimeCostPerHour: 120,
        intervalSec: 60,
        runs: [buildRun(false, 100)], // 1 min downtime → $2
      },
    ]);
    const service = await buildService(prisma);
    const result = await service.downtimeCostReport('user1');
    expect(result.monitorCount).toBe(2);
    // Monitor A: 2 min / 60 * 60 = $2
    // Monitor B: 1 min / 60 * 120 = $2
    expect(result.totalEstimatedCost).toBe(4);
    expect(result.totalDowntimeMinutes).toBe(3);
  });

  it('5. incident counting logic (>5 min gap = new incident)', async () => {
    // Two clusters of failures separated by >5 min → 2 incidents
    const prisma = buildPrisma([
      {
        id: 'm1',
        name: 'Flaky Monitor',
        downtimeCostPerHour: 60,
        intervalSec: 60,
        runs: [
          // Incident 1: 3 consecutive failures
          buildRun(false, 200),
          buildRun(false, 140),
          buildRun(false, 80),
          // Gap: 70+ min between last fail and next fail
          buildRun(true, 30),
          // Incident 2: 2 failures after recovery
          buildRun(false, 15),
          buildRun(false, 10),
        ],
      },
    ]);
    const service = await buildService(prisma);
    const result = await service.downtimeCostReport('user1');
    expect(result.monitors[0].incidentCount).toBe(2);
  });

  it('6. worst incident cost calculation', async () => {
    // Two incidents: 1 fail (1 min) vs 3 fails (3 min)
    // Worst = 3 min / 60 * 120 = $6
    const prisma = buildPrisma([
      {
        id: 'm1',
        name: 'Monitor',
        downtimeCostPerHour: 120,
        intervalSec: 60,
        runs: [
          buildRun(false, 300), // incident 1: 1 fail
          buildRun(true, 250),
          buildRun(false, 200), // incident 2: 3 consecutive fails
          buildRun(false, 140),
          buildRun(false, 80),
          buildRun(true, 20),
        ],
      },
    ]);
    const service = await buildService(prisma);
    const result = await service.downtimeCostReport('user1');
    const m = result.monitors[0];
    expect(m.incidentCount).toBe(2);
    // Worst incident: 3 fails * 60s = 3min → 3/60 * 120 = $6
    expect(m.worstIncidentCost).toBe(6);
  });

  it('7. periodDays clamping (1-90)', async () => {
    const monitor = {
      id: 'm1',
      name: 'M',
      downtimeCostPerHour: 100,
      intervalSec: 60,
      runs: [],
    };
    const prisma = buildPrisma([], [], monitor);
    (prisma.monitor.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(monitor);
    const service = await buildService(prisma);

    // Test within range
    const r30 = await service.downtimeCostHistory('m1', 'u1', 30);
    expect(r30.days).toHaveLength(30);

    // Test clamping at max 90
    const r100 = await service.downtimeCostHistory('m1', 'u1', 100);
    expect(r100.days).toHaveLength(90);

    // Test clamping at min 1
    const r0 = await service.downtimeCostHistory('m1', 'u1', 0);
    expect(r0.days).toHaveLength(1);
  });
});

describe('MonitorsService.downtimeCostHistory', () => {
  it('8. daily breakdown returns correct structure and sums', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const monitor = {
      id: 'm1',
      name: 'API',
      intervalSec: 60,
      downtimeCostPerHour: 60,
    };
    // 3 failed checks on the same day (today)
    const today = new Date(NOW);
    const runs = [
      { ok: false, checkedAt: new Date(today.getTime() - 10 * 60_000) },
      { ok: false, checkedAt: new Date(today.getTime() - 20 * 60_000) },
      { ok: false, checkedAt: new Date(today.getTime() - 30 * 60_000) },
      { ok: true, checkedAt: new Date(today.getTime() - 40 * 60_000) },
    ];
    const prisma = buildPrisma([], runs, monitor);
    const service = await buildService(prisma);

    const result = await service.downtimeCostHistory('m1', 'user1', 7);
    expect(result.days).toHaveLength(7);

    // Find today's entry
    const todayStr = NOW.toISOString().split('T')[0];
    const todayEntry = result.days.find((d) => d.date === todayStr);
    expect(todayEntry).toBeDefined();
    expect(todayEntry!.failedChecks).toBe(3);
    expect(todayEntry!.checks).toBe(4);
    // 3 fails * 60s = 3min = 0.05h → cost = 0.05 * 60 = $3
    expect(todayEntry!.downtimeMinutes).toBe(3);
    expect(todayEntry!.estimatedCost).toBe(3);
    vi.useRealTimers();
  });
});
