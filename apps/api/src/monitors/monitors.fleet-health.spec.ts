/**
 * Unit tests for MonitorsService.fleetHealthReport()
 *
 * Tests fleet-level health aggregation: reliability tiers, at-risk monitors,
 * fleet score/grade, coverage gaps, and top/worst performers.
 */

import { describe, it, expect, vi } from 'vitest';
import { MonitorsAnalyticsService } from './monitors-analytics.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { VersionDetectionService } from './version-detection.service';

// ─── Factory helpers ─────────────────────────────────────────────────────────

function makeMonitorRow(overrides: {
  id: string;
  name: string;
  type?: string;
  enabled?: boolean;
  slaTarget?: number | null;
  description?: string | null;
  monitorAlerts?: Array<{ monitorId: string }>;
}) {
  return {
    id: overrides.id,
    name: overrides.name,
    type: overrides.type ?? 'HTTP',
    enabled: overrides.enabled ?? true,
    slaTarget: overrides.slaTarget ?? null,
    description: overrides.description ?? null,
    monitorAlerts: overrides.monitorAlerts ?? [],
    userId: 'user-1',
  };
}

function makeRun(monitorId: string, ok: boolean, daysAgo: number, latencyMs = 100) {
  return {
    monitorId,
    ok,
    checkedAt: new Date(Date.now() - daysAgo * 86_400_000),
    latencyMs,
  };
}

function makePrisma(
  monitors: ReturnType<typeof makeMonitorRow>[],
  runs: ReturnType<typeof makeRun>[],
  incidents: Array<{ createdAt: Date }> = [],
) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitors),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue(runs),
    },
    incident: {
      findMany: vi.fn().mockResolvedValue(incidents),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new (MonitorsAnalyticsService as unknown as new (...args: unknown[]) => MonitorsAnalyticsService)(prisma as never);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MonitorsService.fleetHealthReport()', () => {
  it('returns fleet score 100 when no enabled monitors exist', async () => {
    const prisma = makePrisma([], []);
    const svc = makeService(prisma);
    const result = await svc.fleetHealthReport('user-1');

    expect(result.fleetScore).toBe(100);
    expect(result.fleetGrade).toBe('A');
    expect(result.summary.total).toBe(0);
    expect(result.summary.enabled).toBe(0);
    expect(result.generatedAt).toBeDefined();
  });

  it('reports summary counts correctly', async () => {
    const monitors = [
      makeMonitorRow({ id: 'm1', name: 'Up' }),
      makeMonitorRow({ id: 'm2', name: 'Down' }),
      makeMonitorRow({ id: 'm3', name: 'NoData' }),
      makeMonitorRow({ id: 'm4', name: 'Disabled', enabled: false }),
    ];
    // m1: last run ok, m2: last run failed, m3: no runs
    const runs = [
      makeRun('m1', true, 0),
      makeRun('m2', false, 0),
    ];
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.fleetHealthReport('user-1');

    expect(result.summary.total).toBe(4);
    expect(result.summary.enabled).toBe(3);
    expect(result.summary.up).toBe(1);
    expect(result.summary.down).toBe(1);
    expect(result.summary.noData).toBe(1);
  });

  it('places a 100% uptime monitor in elite tier', async () => {
    const monitors = [makeMonitorRow({ id: 'm1', name: 'Perfect' })];
    const runs = Array.from({ length: 100 }, (_, i) => makeRun('m1', true, i % 30));
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.fleetHealthReport('user-1');

    const eliteTier = result.reliabilityTiers.find(t => t.tier === 'elite');
    expect(eliteTier?.count).toBe(1);
    expect(eliteTier?.monitors[0].id).toBe('m1');
  });

  it('places a monitor with <90% uptime in critical tier', async () => {
    const monitors = [makeMonitorRow({ id: 'm1', name: 'BadMonitor' })];
    // 10 ok, 90 failed → 10% uptime
    const runs = [
      ...Array.from({ length: 10 }, () => makeRun('m1', true, 5)),
      ...Array.from({ length: 90 }, () => makeRun('m1', false, 5)),
    ];
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.fleetHealthReport('user-1');

    const criticalTier = result.reliabilityTiers.find(t => t.tier === 'critical');
    expect(criticalTier?.count).toBe(1);
  });

  it('flags currently-down monitor as at-risk with critical severity', async () => {
    const monitors = [makeMonitorRow({ id: 'm1', name: 'Failing' })];
    // All recent runs failed
    const runs = Array.from({ length: 10 }, () => makeRun('m1', false, 1));
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.fleetHealthReport('user-1');

    const risk = result.atRisk.find(r => r.id === 'm1');
    expect(risk).toBeDefined();
    expect(risk?.severity).toBe('critical');
    expect(risk?.reason).toContain('down');
  });

  it('computes coverage gaps correctly', async () => {
    const monitors = [
      makeMonitorRow({ id: 'm1', name: 'Good', monitorAlerts: [{ monitorId: 'm1' }], slaTarget: 99.9, description: 'My monitor' }),
      makeMonitorRow({ id: 'm2', name: 'NoCoverage' }), // no channel, no SLA, no description
    ];
    const prisma = makePrisma(monitors, []);
    const svc = makeService(prisma);
    const result = await svc.fleetHealthReport('user-1');

    expect(result.coverageGaps.noAlertChannel).toBe(1); // m2
    expect(result.coverageGaps.noSlaTarget).toBe(1); // m2
    expect(result.coverageGaps.noDescription).toBe(1); // m2
  });

  it('returns top performers sorted by uptimePct descending', async () => {
    const monitors = [
      makeMonitorRow({ id: 'm1', name: 'Good' }),
      makeMonitorRow({ id: 'm2', name: 'Better' }),
      makeMonitorRow({ id: 'm3', name: 'Best' }),
    ];
    const runs = [
      // m1: 90% uptime
      ...Array.from({ length: 9 }, () => makeRun('m1', true, 5)),
      makeRun('m1', false, 5),
      // m2: 95% uptime
      ...Array.from({ length: 19 }, () => makeRun('m2', true, 5)),
      makeRun('m2', false, 5),
      // m3: 100% uptime
      ...Array.from({ length: 20 }, () => makeRun('m3', true, 5)),
    ];
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.fleetHealthReport('user-1');

    expect(result.topPerformers.length).toBeGreaterThan(0);
    expect(result.topPerformers[0].id).toBe('m3'); // 100% is top
  });

  it('returns worst performers sorted by uptimePct ascending', async () => {
    const monitors = [
      makeMonitorRow({ id: 'm1', name: 'Worst' }),
      makeMonitorRow({ id: 'm2', name: 'Middle' }),
    ];
    const runs = [
      // m1: 50% uptime
      ...Array.from({ length: 5 }, () => makeRun('m1', true, 5)),
      ...Array.from({ length: 5 }, () => makeRun('m1', false, 5)),
      // m2: 80% uptime
      ...Array.from({ length: 8 }, () => makeRun('m2', true, 5)),
      ...Array.from({ length: 2 }, () => makeRun('m2', false, 5)),
    ];
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.fleetHealthReport('user-1');

    expect(result.worstPerformers.length).toBeGreaterThan(0);
    expect(result.worstPerformers[0].id).toBe('m1'); // 50% is worst
  });

  it('returns type distribution with correct counts', async () => {
    const monitors = [
      makeMonitorRow({ id: 'm1', name: 'A', type: 'HTTP' }),
      makeMonitorRow({ id: 'm2', name: 'B', type: 'HTTP' }),
      makeMonitorRow({ id: 'm3', name: 'C', type: 'TCP' }),
    ];
    const prisma = makePrisma(monitors, []);
    const svc = makeService(prisma);
    const result = await svc.fleetHealthReport('user-1');

    const http = result.typeDistribution.find(t => t.type === 'HTTP');
    const tcp = result.typeDistribution.find(t => t.type === 'TCP');
    expect(http?.count).toBe(2);
    expect(tcp?.count).toBe(1);
  });

  it('assigns grade A to fleet with high fleet score', async () => {
    const monitors = [makeMonitorRow({ id: 'm1', name: 'Perfect' })];
    const runs = Array.from({ length: 200 }, () => makeRun('m1', true, 5));
    const prisma = makePrisma(monitors, runs);
    const svc = makeService(prisma);
    const result = await svc.fleetHealthReport('user-1');

    expect(result.fleetGrade).toBe('A');
    expect(result.fleetScore).toBeGreaterThanOrEqual(95);
  });

  it('disabled monitors are not counted in enabled but appear in total', async () => {
    const monitors = [
      makeMonitorRow({ id: 'm1', name: 'Active' }),
      makeMonitorRow({ id: 'm2', name: 'Paused', enabled: false }),
    ];
    const prisma = makePrisma(monitors, []);
    const svc = makeService(prisma);
    const result = await svc.fleetHealthReport('user-1');

    expect(result.summary.total).toBe(2);
    expect(result.summary.enabled).toBe(1);
  });
});
