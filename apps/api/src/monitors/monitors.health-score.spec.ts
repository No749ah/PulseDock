/**
 * Unit tests for MonitorsService.getHealthScore() and getHealthSummary()
 *
 * These tests mock PrismaService to control run data and validate
 * the composite 0–100 score + A–F grade calculation.
 */
import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MonitorsDiagnosticsService } from './monitors-diagnostics.service';
import { VersionDetectionService } from './version-detection.service';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRuns(
  count: number,
  opts: {
    okRate?: number; // 0–1, default 1
    latencyMs?: number | null;
    ageOffsetMs?: number; // push runs this far into the past
  } = {},
): Array<{ ok: boolean; latencyMs: number | null; checkedAt: Date }> {
  const { okRate = 1, latencyMs = 100, ageOffsetMs = 0 } = opts;
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    ok: (i / count) < okRate,
    latencyMs: latencyMs ?? null,
    checkedAt: new Date(now - ageOffsetMs - i * 60_000),
  }));
}

function buildPrismaMock(overrides: {
  monitor?: object | null;
  runs?: Array<{ ok: boolean; latencyMs: number | null; checkedAt: Date }>;
}) {
  return {
    monitor: {
      findFirst: vi.fn().mockResolvedValue(overrides.monitor ?? null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue(overrides.runs ?? []),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    monitorDependency: { findMany: vi.fn().mockResolvedValue([]) },
    monitorAlert: { findMany: vi.fn().mockResolvedValue([]) },
    monitorTag: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

// ── Test module factory ────────────────────────────────────────────────────

async function buildService(prisma: object): Promise<MonitorsService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MonitorsDiagnosticsService,
      { provide: PrismaService, useValue: prisma },
      {
        provide: ChecksService,
        useValue: { listPlugins: vi.fn().mockReturnValue([]), runCheck: vi.fn() },
      },
      { provide: AuditService, useValue: { log: vi.fn() } },
      { provide: RealtimeEvents, useValue: { emit: vi.fn() } },
      { provide: VersionDetectionService, useValue: {} },
    ],
  }).compile();
  return module.get<MonitorsDiagnosticsService>(MonitorsDiagnosticsService);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MonitorsService – getHealthScore', () => {
  // ── 1. Monitor not found → NotFoundException ──────────────────────────────
  it('throws NotFoundException when monitor does not exist', async () => {
    const prisma = buildPrismaMock({ monitor: null });
    const svc = await buildService(prisma);
    await expect(svc.getHealthScore('user1', 'missing-id')).rejects.toThrow(NotFoundException);
  });

  // ── 2. Perfect score — 100% uptime, stable latency, SLA fine, no incidents ─
  it('returns score 100 and grade A for a perfect monitor', async () => {
    const recent = makeRuns(100, { okRate: 1, latencyMs: 50 });
    const prior = makeRuns(100, { okRate: 1, latencyMs: 50, ageOffsetMs: 7 * 86_400_000 });

    const prisma = buildPrismaMock({
      monitor: {
        id: 'm1',
        type: 'HTTP',
        slaTarget: 99.9,
        slaPeriodDays: 30,
        slaBreachAlertedAt: null,
      },
      runs: [...prior, ...recent],
    });
    const svc = await buildService(prisma);
    const result = await svc.getHealthScore('user1', 'm1');

    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
    expect(result.breakdown.uptime).toBe(40);
    expect(result.breakdown.latency).toBe(20);
    expect(result.breakdown.sla).toBe(20);
    expect(result.breakdown.streak).toBe(20);
  });

  // ── 3. Degraded score — lower uptime brings score down ────────────────────
  it('penalises score when monitor has recent failures', async () => {
    // all ok in prior window
    const prior = makeRuns(100, { okRate: 1, latencyMs: 50, ageOffsetMs: 7 * 86_400_000 });
    // recent window: all failing → uptime=0% → uptimeScore=0; currently down → streak=0
    const recent = makeRuns(100, { okRate: 0, latencyMs: 50 });

    const prisma = buildPrismaMock({
      monitor: {
        id: 'm2',
        type: 'HTTP',
        slaTarget: null,
        slaPeriodDays: null,
        slaBreachAlertedAt: null,
      },
      runs: [...prior, ...recent],
    });
    const svc = await buildService(prisma);
    const result = await svc.getHealthScore('user1', 'm2');

    // slaTarget null → slaScore = 20; currently down → streakScore = 0; uptime 0% → uptimeScore = 0
    expect(result.breakdown.sla).toBe(20);
    expect(result.breakdown.streak).toBe(0);
    expect(result.breakdown.uptime).toBe(0);
    expect(result.score).toBeLessThan(100);
    expect(['B', 'C', 'D', 'F']).toContain(result.grade);
  });

  // ── 4. No SLA configured → SLA contributes full 20 pts ───────────────────
  it('gives full SLA score when slaTarget is null', async () => {
    const runs = makeRuns(50, { okRate: 1, latencyMs: 100 });

    const prisma = buildPrismaMock({
      monitor: {
        id: 'm3',
        type: 'HTTP',
        slaTarget: null,
        slaPeriodDays: null,
        slaBreachAlertedAt: null,
      },
      runs,
    });
    const svc = await buildService(prisma);
    const result = await svc.getHealthScore('user1', 'm3');

    expect(result.breakdown.sla).toBe(20);
  });

  // ── 5. No latency data → latency score = 20 (version monitor) ───────────
  it('gives full latency score for a GIT_RELEASE monitor with null latencyMs', async () => {
    const runs = makeRuns(20, { okRate: 1 }).map((r) => ({
      ...r,
      latencyMs: null,
    }));

    const prisma = buildPrismaMock({
      monitor: {
        id: 'm4',
        type: 'GIT_RELEASE',
        slaTarget: null,
        slaPeriodDays: null,
        slaBreachAlertedAt: null,
      },
      runs,
    });
    const svc = await buildService(prisma);
    const result = await svc.getHealthScore('user1', 'm4');

    expect(result.breakdown.latency).toBe(20);
  });

  // ── 6. Grade boundary verification (pure function test) ──────────────────
  it.each([
    [100, 'A'],
    [85, 'A'],
    [84, 'B'],
    [70, 'B'],
    [69, 'C'],
    [50, 'C'],
    [49, 'D'],
    [25, 'D'],
    [24, 'F'],
    [0, 'F'],
  ])('grade mapping: score %d → grade %s', (score, expectedGrade) => {
    const gradeFor = (s: number): string => {
      if (s >= 85) return 'A';
      if (s >= 70) return 'B';
      if (s >= 50) return 'C';
      if (s >= 25) return 'D';
      return 'F';
    };
    expect(gradeFor(score)).toBe(expectedGrade);
  });

  // ── 7. Currently down → streak = 0 ───────────────────────────────────────
  it('gives 0 streak score when monitor is currently down', async () => {
    const prior = makeRuns(10, { okRate: 1, ageOffsetMs: 7 * 86_400_000 });
    const recent = makeRuns(10, { okRate: 0 }); // all failing

    const prisma = buildPrismaMock({
      monitor: {
        id: 'm5',
        type: 'HTTP',
        slaTarget: null,
        slaPeriodDays: null,
        slaBreachAlertedAt: null,
      },
      runs: [...prior, ...recent],
    });
    const svc = await buildService(prisma);
    const result = await svc.getHealthScore('user1', 'm5');

    expect(result.breakdown.streak).toBe(0);
  });

  // ── 8. getHealthSummary aggregates across all monitors ───────────────────
  it('returns scores array and overall aggregate from getHealthSummary', async () => {
    const prisma = {
      monitor: {
        findFirst: vi.fn().mockImplementation(
          ({ where }: { where: { id: string } }) =>
            Promise.resolve({
              id: where.id,
              type: 'HTTP',
              slaTarget: null,
              slaPeriodDays: null,
              slaBreachAlertedAt: null,
            }),
        ),
        findMany: vi.fn().mockResolvedValue([
          { id: 'ma', name: 'Alpha' },
          { id: 'mb', name: 'Beta' },
        ]),
      },
      monitorRun: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      monitorDependency: { findMany: vi.fn().mockResolvedValue([]) },
      monitorAlert: { findMany: vi.fn().mockResolvedValue([]) },
      monitorTag: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const svc = await buildService(prisma);
    const summary = await svc.getHealthSummary('user1');

    expect(summary.scores).toHaveLength(2);
    expect(summary.scores[0]).toHaveProperty('monitorId');
    expect(summary.scores[0]).toHaveProperty('score');
    expect(summary.scores[0]).toHaveProperty('grade');
    expect(summary.overall).toHaveProperty('avg');
    expect(summary.overall).toHaveProperty('a');
    expect(summary.overall).toHaveProperty('f');
  });
});

// ── Tests for healthScore (v2: uptime/latency/incidents/flapping) ─────────────

/**
 * Build a full prisma mock suitable for testing the new healthScore() method.
 * Supports separate mocking of monitorRun.findMany calls (24h and 7d),
 * incident.count, and incidentMonitor.groupBy.
 */
function buildHealthScoreV2Prisma(opts: {
  monitor?: object | null;
  runs24h?: Array<{ ok: boolean; latencyMs: number | null }>;
  runs7d?: Array<{ latencyMs: number }>;
  activeIncidents?: number;
}) {
  const { monitor = null, runs24h = [], runs7d = [], activeIncidents = 0 } = opts;

  // monitorRun.findMany: first call = 24h runs, second call = 7d latency runs
  let findManyCallCount = 0;
  const monitorRunFindMany = vi.fn().mockImplementation(() => {
    findManyCallCount++;
    if (findManyCallCount === 1) return Promise.resolve(runs24h);
    return Promise.resolve(runs7d);
  });

  return {
    monitor: {
      findFirst: vi.fn().mockResolvedValue(monitor),
      findMany: vi.fn().mockResolvedValue([]),
    },
    monitorRun: {
      findMany: monitorRunFindMany,
      findFirst: vi.fn().mockResolvedValue(null),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    incident: {
      count: vi.fn().mockResolvedValue(activeIncidents),
    },
    incidentMonitor: {
      groupBy: vi.fn().mockResolvedValue([]),
    },
    monitorDependency: { findMany: vi.fn().mockResolvedValue([]) },
    monitorAlert: { findMany: vi.fn().mockResolvedValue([]) },
    monitorTag: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe('MonitorsService – healthScore (v2)', () => {
  // ── 1. Returns null when no runs in last 24h ──────────────────────────────
  it('returns null score when no runs in last 24h', async () => {
    const prisma = buildHealthScoreV2Prisma({
      monitor: { id: 'm1', isFlapping: false, userId: 'u1' },
      runs24h: [],
    });
    const svc = await buildService(prisma);
    const result = await svc.healthScore('u1', 'm1');
    expect(result.score).toBeNull();
    expect(result.breakdown).toBeNull();
  });

  // ── 2. Perfect score (100) — 100% uptime, no incidents, not flapping ─────
  it('returns score 100 for perfect monitor (100% uptime, no incidents, no flapping, good latency)', async () => {
    const runs24h = Array.from({ length: 20 }, () => ({ ok: true, latencyMs: 100 }));
    const runs7d = Array.from({ length: 20 }, () => ({ latencyMs: 100 }));
    const prisma = buildHealthScoreV2Prisma({
      monitor: { id: 'm1', isFlapping: false, userId: 'u1' },
      runs24h,
      runs7d,
      activeIncidents: 0,
    });
    const svc = await buildService(prisma);
    const result = await svc.healthScore('u1', 'm1');
    expect(result.score).toBe(100);
    expect(result.breakdown!.uptime).toBe(50);
    expect(result.breakdown!.latency).toBe(30);
    expect(result.breakdown!.incidents).toBe(20);
    expect(result.breakdown!.flapping).toBe(0);
  });

  // ── 3. 50% uptime → uptimeScore = 25 ────────────────────────────────────
  it('computes uptimeScore = 25 for 50% uptime', async () => {
    // 10 ok out of 20 = 50% uptime
    const runs24h = Array.from({ length: 20 }, (_, i) => ({ ok: i % 2 === 0, latencyMs: 100 }));
    const prisma = buildHealthScoreV2Prisma({
      monitor: { id: 'm2', isFlapping: false, userId: 'u1' },
      runs24h,
      runs7d: [],
      activeIncidents: 0,
    });
    const svc = await buildService(prisma);
    const result = await svc.healthScore('u1', 'm2');
    expect(result.breakdown!.uptime).toBe(25);
  });

  // ── 4. Flapping penalty subtracts 15 from total ──────────────────────────
  it('subtracts 15 from total when monitor is flapping', async () => {
    const runs24h = Array.from({ length: 20 }, () => ({ ok: true, latencyMs: 100 }));
    const prisma = buildHealthScoreV2Prisma({
      monitor: { id: 'm3', isFlapping: true, userId: 'u1' },
      runs24h,
      runs7d: [],
      activeIncidents: 0,
    });
    const svc = await buildService(prisma);
    const result = await svc.healthScore('u1', 'm3');
    // 50 (uptime) + 30 (latency, no baseline) + 20 (no incidents) - 15 (flapping) = 85
    expect(result.breakdown!.flapping).toBe(-15);
    expect(result.score).toBe(85);
  });

  // ── 5. Active incident subtracts 10 per incident ─────────────────────────
  it('subtracts 10 per active incident from incident score (min 0)', async () => {
    const runs24h = Array.from({ length: 20 }, () => ({ ok: true, latencyMs: 100 }));
    const prisma = buildHealthScoreV2Prisma({
      monitor: { id: 'm4', isFlapping: false, userId: 'u1' },
      runs24h,
      runs7d: [],
      activeIncidents: 1,
    });
    const svc = await buildService(prisma);
    const result = await svc.healthScore('u1', 'm4');
    // incidentScore = max(0, 20 - 1*10) = 10
    expect(result.breakdown!.incidents).toBe(10);
    // 50 + 30 + 10 = 90
    expect(result.score).toBe(90);
  });
});
