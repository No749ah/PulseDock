import { Test, TestingModule } from '@nestjs/testing';
import { MonitorsService } from './monitors.service';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { VersionDetectionService } from './version-detection.service';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const NOW = new Date('2026-03-28T19:00:00Z');

function makeMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    name: 'Test Monitor',
    type: 'HTTP',
    enabled: true,
    slaTarget: 99.9,
    description: 'A test monitor',
    monitorAlerts: [{ monitorId: 'm1' }],
    ...overrides,
  };
}

function makeRuns(monitorId: string, total: number, failCount: number) {
  const runs = [];
  for (let i = 0; i < total; i++) {
    runs.push({
      monitorId,
      ok: i >= failCount,
      checkedAt: new Date(NOW.getTime() - (total - i) * 60_000),
      latencyMs: 150,
    });
  }
  return runs;
}

function buildPrisma(overrides: {
  monitors?: object[];
  runs?: object[];
  incidents?: object[];
}) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(overrides.monitors ?? []),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue(overrides.runs ?? []),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    incident: {
      findMany: vi.fn().mockResolvedValue(overrides.incidents ?? []),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    monitorAlert: { findMany: vi.fn().mockResolvedValue([]) },
    alertChannel: { findMany: vi.fn().mockResolvedValue([]) },
    folder: { findMany: vi.fn().mockResolvedValue([]) },
    tag: { findMany: vi.fn().mockResolvedValue([]) },
    monitorTag: { findMany: vi.fn().mockResolvedValue([]) },
    monitorAnnotation: { findMany: vi.fn().mockResolvedValue([]) },
    maintenanceWindow: { findMany: vi.fn().mockResolvedValue([]) },
    monitorRunRollup: { findMany: vi.fn().mockResolvedValue([]) },
    monitorDependency: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

async function buildService(prisma: object): Promise<MonitorsService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MonitorsService,
      { provide: PrismaService, useValue: prisma },
      { provide: ChecksService, useValue: { listPlugins: vi.fn().mockReturnValue([]), runCheck: vi.fn() } },
      { provide: AuditService, useValue: { log: vi.fn() } },
      { provide: RealtimeEvents, useValue: { emit: vi.fn() } },
      { provide: VersionDetectionService, useValue: {} },
    ],
  }).compile();
  return module.get<MonitorsService>(MonitorsService);
}

describe('MonitorsService.fleetHealthReport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it('returns grade A with fleet score 100 when no monitors', async () => {
    const svc = await buildService(buildPrisma({}));
    const result = await svc.fleetHealthReport('user1');
    expect(result.fleetScore).toBe(100);
    expect(result.fleetGrade).toBe('A');
    expect(result.summary.total).toBe(0);
    expect(result.atRisk).toHaveLength(0);
    expect(result.typeDistribution).toHaveLength(0);
    expect(result.reliabilityTiers).toHaveLength(5);
  });

  it('puts 100% uptime monitor in elite tier', async () => {
    const prisma = buildPrisma({
      monitors: [makeMonitor({ id: 'm1' })],
      runs: makeRuns('m1', 60, 0),
    });
    const svc = await buildService(prisma);
    const result = await svc.fleetHealthReport('user1');
    const elite = result.reliabilityTiers.find(t => t.tier === 'elite');
    expect(elite?.count).toBe(1);
    expect(result.summary.total).toBe(1);
  });

  it('identifies at-risk monitor with 50% uptime', async () => {
    const prisma = buildPrisma({
      monitors: [makeMonitor({ id: 'm1', name: 'Bad Monitor' })],
      runs: makeRuns('m1', 100, 50),
    });
    const svc = await buildService(prisma);
    const result = await svc.fleetHealthReport('user1');
    expect(result.atRisk.length).toBeGreaterThan(0);
    expect(result.atRisk[0].id).toBe('m1');
    expect(result.atRisk[0].uptimePct).toBe(50);
    expect(result.atRisk[0].severity).toBe('high');
  });

  it('counts all coverage gaps correctly', async () => {
    const prisma = buildPrisma({
      monitors: [
        makeMonitor({ id: 'm1', monitorAlerts: [], slaTarget: null, description: null }),
        makeMonitor({ id: 'm2', name: 'Good Monitor' }), // fully configured
      ],
      runs: [...makeRuns('m1', 10, 0), ...makeRuns('m2', 10, 0)],
    });
    const svc = await buildService(prisma);
    const result = await svc.fleetHealthReport('user1');
    expect(result.coverageGaps.noAlertChannel).toBe(1);
    expect(result.coverageGaps.noSlaTarget).toBe(1);
    expect(result.coverageGaps.noDescription).toBe(1);
    expect(result.coverageGaps.totalGapScore).toBeGreaterThan(0);
  });

  it('computes worsening incident trend when last 7d has more incidents than prior 7d', async () => {
    const last3d = new Date(NOW.getTime() - 3 * 86_400_000);
    const prior10d = new Date(NOW.getTime() - 10 * 86_400_000);
    const prisma = buildPrisma({
      monitors: [makeMonitor()],
      runs: makeRuns('m1', 50, 0),
      incidents: [
        { createdAt: last3d }, { createdAt: last3d }, { createdAt: last3d },
        { createdAt: last3d }, { createdAt: last3d },
        { createdAt: prior10d }, // 1 prior → 5 vs 1 = worsening
      ],
    });
    const svc = await buildService(prisma);
    const result = await svc.fleetHealthReport('user1');
    expect(result.incidentVelocity.last7d).toBe(5);
    expect(result.incidentVelocity.last30d).toBe(6);
    expect(result.incidentVelocity.trend).toBe('worsening');
    expect(result.incidentVelocity.weeklyBreakdown).toHaveLength(4);
  });

  it('groups type distribution with correct counts and sorts by count desc', async () => {
    const prisma = buildPrisma({
      monitors: [
        makeMonitor({ id: 'm1', type: 'HTTP' }),
        makeMonitor({ id: 'm2', type: 'HTTP', name: 'Monitor 2' }),
        makeMonitor({ id: 'm3', type: 'TCP', name: 'Monitor 3' }),
      ],
      runs: [...makeRuns('m1', 20, 0), ...makeRuns('m2', 20, 0), ...makeRuns('m3', 20, 0)],
    });
    const svc = await buildService(prisma);
    const result = await svc.fleetHealthReport('user1');
    expect(result.typeDistribution).toHaveLength(2);
    expect(result.typeDistribution[0].type).toBe('HTTP');
    expect(result.typeDistribution[0].count).toBe(2);
    expect(result.typeDistribution[1].type).toBe('TCP');
    expect(result.typeDistribution[1].count).toBe(1);
    expect(result.topPerformers.length).toBeGreaterThan(0);
  });

  it('excludes disabled monitors from stats', async () => {
    const prisma = buildPrisma({
      monitors: [
        makeMonitor({ id: 'm1', enabled: true }),
        makeMonitor({ id: 'm2', enabled: false, name: 'Disabled' }),
      ],
      runs: makeRuns('m1', 20, 0),
    });
    const svc = await buildService(prisma);
    const result = await svc.fleetHealthReport('user1');
    // total includes both, but enabled only counts enabled
    expect(result.summary.total).toBe(2);
    expect(result.summary.enabled).toBe(1);
    // disabled monitor should not appear in tiers
    const tieredCount = result.reliabilityTiers.reduce((a, t) => a + t.count, 0);
    expect(tieredCount).toBe(1);
  });
});
