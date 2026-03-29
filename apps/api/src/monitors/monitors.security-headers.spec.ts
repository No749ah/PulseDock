/**
 * Unit tests for MonitorsService.getSecurityHeadersSummary()
 *
 * Tests fleet-wide security header audit aggregation:
 * grade distribution, per-header coverage, noData count,
 * avgScore, and sort order (worst first).
 */

import { describe, it, expect, vi } from 'vitest';
import { MonitorsService } from './monitors.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { VersionDetectionService } from './version-detection.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAuditJson(grade: string, score: number, headers: Array<{ name: string; present: boolean; severity: string }>) {
  return { grade, score, headers };
}

function makeMonitorRow(
  id: string,
  name: string,
  auditJson?: ReturnType<typeof makeAuditJson> | null,
) {
  return {
    id,
    name,
    target: `https://${name.toLowerCase()}.example.com`,
    enabled: true,
    folderId: null,
    folder: null,
    runs: auditJson
      ? [{ securityAuditJson: auditJson, checkedAt: new Date('2026-03-28T10:00:00Z') }]
      : [],
  };
}

function makePrisma(monitors: ReturnType<typeof makeMonitorRow>[]) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitors),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new MonitorsService(
    prisma as never,
    { listPlugins: vi.fn().mockReturnValue([]), runMonitor: vi.fn() } as unknown as ChecksService,
    { log: vi.fn() } as unknown as AuditService,
    { emitMonitorUpdate: vi.fn(), emitCheckResult: vi.fn() } as unknown as RealtimeEvents,
    {} as unknown as VersionDetectionService,
  );
}

// ─── Standard header set used in tests ────────────────────────────────────────

const GOOD_HEADERS = [
  { name: 'Strict-Transport-Security', present: true, severity: 'critical' },
  { name: 'X-Frame-Options', present: true, severity: 'warning' },
  { name: 'X-Content-Type-Options', present: true, severity: 'warning' },
  { name: 'Content-Security-Policy', present: true, severity: 'critical' },
];

const BAD_HEADERS = GOOD_HEADERS.map(h => ({ ...h, present: false }));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MonitorsService.getSecurityHeadersSummary()', () => {
  it('returns all zeros when there are no HTTP/BROWSER monitors', async () => {
    const prisma = makePrisma([]);
    const svc = makeService(prisma);
    const result = await svc.getSecurityHeadersSummary('user-1');

    expect(result.total).toBe(0);
    expect(result.gradeA).toBe(0);
    expect(result.noData).toBe(0);
    expect(result.avgScore).toBeNull();
    expect(result.headerCoverage).toHaveLength(0);
    expect(result.monitors).toHaveLength(0);
  });

  it('counts noData monitors when run has no security audit', async () => {
    const prisma = makePrisma([
      makeMonitorRow('m1', 'NoAudit'), // no run
      makeMonitorRow('m2', 'WithAudit', makeAuditJson('A', 95, GOOD_HEADERS)),
    ]);
    const svc = makeService(prisma);
    const result = await svc.getSecurityHeadersSummary('user-1');

    expect(result.total).toBe(2);
    expect(result.noData).toBe(1);
    expect(result.gradeA).toBe(1);
  });

  it('correctly counts grade distribution', async () => {
    const prisma = makePrisma([
      makeMonitorRow('m1', 'GradeA', makeAuditJson('A', 95, GOOD_HEADERS)),
      makeMonitorRow('m2', 'GradeB', makeAuditJson('B', 80, GOOD_HEADERS)),
      makeMonitorRow('m3', 'GradeC', makeAuditJson('C', 65, GOOD_HEADERS)),
      makeMonitorRow('m4', 'GradeD', makeAuditJson('D', 50, GOOD_HEADERS)),
      makeMonitorRow('m5', 'GradeF', makeAuditJson('F', 20, GOOD_HEADERS)),
    ]);
    const svc = makeService(prisma);
    const result = await svc.getSecurityHeadersSummary('user-1');

    expect(result.gradeA).toBe(1);
    expect(result.gradeB).toBe(1);
    expect(result.gradeC).toBe(1);
    expect(result.gradeD).toBe(1);
    expect(result.gradeF).toBe(1);
    expect(result.noData).toBe(0);
  });

  it('computes avgScore correctly', async () => {
    const prisma = makePrisma([
      makeMonitorRow('m1', 'A', makeAuditJson('A', 90, GOOD_HEADERS)),
      makeMonitorRow('m2', 'B', makeAuditJson('B', 70, GOOD_HEADERS)),
    ]);
    const svc = makeService(prisma);
    const result = await svc.getSecurityHeadersSummary('user-1');

    // avg = (90 + 70) / 2 = 80
    expect(result.avgScore).toBe(80);
  });

  it('returns null avgScore when all monitors have no data', async () => {
    const prisma = makePrisma([
      makeMonitorRow('m1', 'NoData'),
      makeMonitorRow('m2', 'NoData2'),
    ]);
    const svc = makeService(prisma);
    const result = await svc.getSecurityHeadersSummary('user-1');

    expect(result.avgScore).toBeNull();
    expect(result.noData).toBe(2);
  });

  it('aggregates header coverage across monitors', async () => {
    const headers1 = [
      { name: 'Strict-Transport-Security', present: true, severity: 'critical' },
      { name: 'X-Frame-Options', present: false, severity: 'warning' },
    ];
    const headers2 = [
      { name: 'Strict-Transport-Security', present: true, severity: 'critical' },
      { name: 'X-Frame-Options', present: true, severity: 'warning' },
    ];
    const prisma = makePrisma([
      makeMonitorRow('m1', 'A', makeAuditJson('B', 75, headers1)),
      makeMonitorRow('m2', 'B', makeAuditJson('A', 90, headers2)),
    ]);
    const svc = makeService(prisma);
    const result = await svc.getSecurityHeadersSummary('user-1');

    const hsts = result.headerCoverage.find(h => h.name === 'Strict-Transport-Security');
    expect(hsts?.presentCount).toBe(2);
    expect(hsts?.totalCount).toBe(2);
    expect(hsts?.coveragePct).toBe(100);

    const xFrame = result.headerCoverage.find(h => h.name === 'X-Frame-Options');
    expect(xFrame?.presentCount).toBe(1);
    expect(xFrame?.totalCount).toBe(2);
    expect(xFrame?.coveragePct).toBe(50);
  });

  it('sorts monitors worst-first (lowest score first)', async () => {
    const prisma = makePrisma([
      makeMonitorRow('m1', 'Good', makeAuditJson('A', 95, GOOD_HEADERS)),
      makeMonitorRow('m2', 'Bad', makeAuditJson('F', 20, BAD_HEADERS)),
      makeMonitorRow('m3', 'Medium', makeAuditJson('C', 60, GOOD_HEADERS)),
    ]);
    const svc = makeService(prisma);
    const result = await svc.getSecurityHeadersSummary('user-1');

    expect(result.monitors[0].score).toBe(20); // F grade, lowest score first
    expect(result.monitors[1].score).toBe(60);
    expect(result.monitors[2].score).toBe(95);
  });

  it('places noData monitors after scored monitors in sort', async () => {
    const prisma = makePrisma([
      makeMonitorRow('m1', 'NoData'),
      makeMonitorRow('m2', 'Scored', makeAuditJson('A', 95, GOOD_HEADERS)),
    ]);
    const svc = makeService(prisma);
    const result = await svc.getSecurityHeadersSummary('user-1');

    expect(result.monitors[0].score).toBe(95); // scored first
    expect(result.monitors[1].score).toBeNull(); // no data last
  });

  it('sorts headerCoverage critical-severity first', async () => {
    const headers = [
      { name: 'X-Frame-Options', present: true, severity: 'warning' },
      { name: 'Strict-Transport-Security', present: false, severity: 'critical' },
      { name: 'Referrer-Policy', present: true, severity: 'info' },
    ];
    const prisma = makePrisma([
      makeMonitorRow('m1', 'Test', makeAuditJson('C', 60, headers)),
    ]);
    const svc = makeService(prisma);
    const result = await svc.getSecurityHeadersSummary('user-1');

    // Critical should come first regardless of coverage
    expect(result.headerCoverage[0].severity).toBe('critical');
    expect(result.headerCoverage[0].name).toBe('Strict-Transport-Security');
  });

  it('includes checkedAt in monitor rows', async () => {
    const prisma = makePrisma([
      makeMonitorRow('m1', 'Timed', makeAuditJson('A', 95, GOOD_HEADERS)),
    ]);
    const svc = makeService(prisma);
    const result = await svc.getSecurityHeadersSummary('user-1');

    expect(result.monitors[0].checkedAt).toBe('2026-03-28T10:00:00.000Z');
  });

  it('returns null checkedAt for monitors without audit data', async () => {
    const prisma = makePrisma([
      makeMonitorRow('m1', 'NoRun'),
    ]);
    const svc = makeService(prisma);
    const result = await svc.getSecurityHeadersSummary('user-1');

    expect(result.monitors[0].checkedAt).toBeNull();
    expect(result.monitors[0].headers).toHaveLength(0);
  });
});
