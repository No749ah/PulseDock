/**
 * Unit tests for MonitorsService.slaComplianceReport()
 *
 * Tests per-monitor SLA compliance report generation:
 * - Month boundary clamping (1–12)
 * - Per-monitor uptime/compliance computation
 * - Error budget calculation
 * - Summary stats (compliant/breached/noData/fleetUptime)
 * - Empty case (no monitors with SLA targets)
 */
import { describe, it, expect, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { MonitorsSlaService } from './monitors-sla.service';
import { VersionDetectionService } from './version-detection.service';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPrisma(opts: {
  monitors?: Array<{
    id: string;
    name: string;
    type: string;
    folderId: string | null;
    slaTarget: number | null;
    description: string | null;
    target: string;
  }>;
  runsByMonitor?: Record<string, Array<{ ok: boolean }>>;
  incidentCountByMonitor?: Record<string, number>;
  intervalSec?: number;
}) {
  const monitors = opts.monitors ?? [];
  const runsByMonitor = opts.runsByMonitor ?? {};
  const incidentCountByMonitor = opts.incidentCountByMonitor ?? {};
  const intervalSec = opts.intervalSec ?? 60;

  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitors),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(monitors.find((m) => m.id === where.id)
          ? { ...monitors.find((m) => m.id === where.id), intervalSec }
          : null),
      ),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    monitorRun: {
      findMany: vi.fn().mockImplementation(
        ({ where }: { where: { monitorId: string } }) =>
          Promise.resolve((runsByMonitor[where.monitorId] ?? []).map((r) => ({ ok: r.ok }))),
      ),
      count: vi.fn().mockImplementation(
        ({ where }: { where: { monitorId: string; ok: boolean } }) => {
          const runs = runsByMonitor[where.monitorId] ?? [];
          return Promise.resolve(runs.filter((r) => r.ok === where.ok).length);
        },
      ),
      findFirst: vi.fn().mockResolvedValue(null),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    incident: {
      count: vi.fn().mockImplementation(
        ({ where }: { where: { monitors: { some: { monitorId: string } } } }) => {
          const monId = where.monitors.some.monitorId;
          return Promise.resolve(incidentCountByMonitor[monId] ?? 0);
        },
      ),
    },
    monitorAlert: { findMany: vi.fn().mockResolvedValue([]) },
    monitorTag: { findMany: vi.fn().mockResolvedValue([]) },
    monitorDependency: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

async function buildService(prisma: object): Promise<MonitorsService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MonitorsSlaService,
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
  return module.get<MonitorsSlaService>(MonitorsSlaService);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MonitorsService.slaComplianceReport()', () => {
  it('returns empty monitors array and null fleet uptime when no monitors have SLA targets', async () => {
    const prisma = buildPrisma({ monitors: [] });
    const svc = await buildService(prisma);

    const result = await svc.slaComplianceReport('user-1', 3);

    expect(result.summary.totalMonitors).toBe(0);
    expect(result.summary.compliant).toBe(0);
    expect(result.summary.breached).toBe(0);
    expect(result.summary.fleetUptimePct).toBeNull();
    expect(result.summary.complianceRate).toBeNull();
    expect(result.monitors).toHaveLength(0);
    expect(result.reportPeriod.months).toBe(3);
    expect(result.reportPeriod.monthLabels).toHaveLength(3);
  });

  it('marks monitor as compliant when uptime >= slaTarget', async () => {
    const runs = Array.from({ length: 100 }, (_, i) => ({ ok: i < 99 })); // 99% uptime
    const prisma = buildPrisma({
      monitors: [{ id: 'm1', name: 'API', type: 'HTTP', folderId: null, slaTarget: 99, description: null, target: 'https://api.example.com' }],
      runsByMonitor: { m1: runs },
    });
    const svc = await buildService(prisma);

    const result = await svc.slaComplianceReport('user-1', 1);

    expect(result.summary.compliant).toBe(1);
    expect(result.summary.breached).toBe(0);
    expect(result.monitors[0].period.compliant).toBe(true);
    expect(result.monitors[0].period.uptimePct).toBe(99);
    expect(result.summary.complianceRate).toBe(100);
  });

  it('marks monitor as breached when uptime < slaTarget', async () => {
    const runs = Array.from({ length: 100 }, (_, i) => ({ ok: i < 95 })); // 95% uptime
    const prisma = buildPrisma({
      monitors: [{ id: 'm1', name: 'DB', type: 'TCP', folderId: null, slaTarget: 99.9, description: null, target: 'db.example.com:5432' }],
      runsByMonitor: { m1: runs },
    });
    const svc = await buildService(prisma);

    const result = await svc.slaComplianceReport('user-1', 1);

    expect(result.summary.breached).toBe(1);
    expect(result.summary.compliant).toBe(0);
    expect(result.monitors[0].period.compliant).toBe(false);
    // Error budget: (100-95) / (100-99.9) = 5 / 0.1 = 50 → capped at 100
    expect(result.monitors[0].period.errorBudgetUsedPct).toBe(100);
  });

  it('returns noData=1 and compliant=null when monitor has no runs', async () => {
    const prisma = buildPrisma({
      monitors: [{ id: 'm1', name: 'Ghost', type: 'HTTP', folderId: null, slaTarget: 99.5, description: null, target: 'https://ghost.local' }],
      runsByMonitor: { m1: [] },
    });
    const svc = await buildService(prisma);

    const result = await svc.slaComplianceReport('user-1', 1);

    expect(result.summary.noData).toBe(1);
    expect(result.monitors[0].period.compliant).toBeNull();
    expect(result.monitors[0].period.uptimePct).toBeNull();
    expect(result.monitors[0].period.errorBudgetUsedPct).toBeNull();
  });

  it('clamps months to valid range (0 → 1, 99 → 12)', async () => {
    const prisma = buildPrisma({ monitors: [] });
    const svc = await buildService(prisma);

    const r1 = await svc.slaComplianceReport('user-1', 0);
    expect(r1.reportPeriod.months).toBe(1);
    expect(r1.reportPeriod.monthLabels).toHaveLength(1);

    const r2 = await svc.slaComplianceReport('user-1', 99);
    expect(r2.reportPeriod.months).toBe(12);
    expect(r2.reportPeriod.monthLabels).toHaveLength(12);
  });

  it('computes fleetUptimePct as weighted average across all monitors', async () => {
    // m1: 100 checks, 0 failures = 100%
    // m2: 100 checks, 10 failures = 90%
    // fleet: 190 / 200 = 95%
    const prisma = buildPrisma({
      monitors: [
        { id: 'm1', name: 'A', type: 'HTTP', folderId: null, slaTarget: 99, description: null, target: 'a.com' },
        { id: 'm2', name: 'B', type: 'HTTP', folderId: null, slaTarget: 99, description: null, target: 'b.com' },
      ],
      runsByMonitor: {
        m1: Array.from({ length: 100 }, () => ({ ok: true })),
        m2: Array.from({ length: 100 }, (_, i) => ({ ok: i >= 10 })),
      },
    });
    const svc = await buildService(prisma);

    const result = await svc.slaComplianceReport('user-1', 1);

    expect(result.summary.fleetUptimePct).toBe(95);
    // m1 compliant (100% >= 99%), m2 breached (90% < 99%)
    expect(result.summary.compliant).toBe(1);
    expect(result.summary.breached).toBe(1);
  });
});
