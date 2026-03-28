import { describe, it, expect, vi } from 'vitest';
import { MonitorsService } from './monitors.service';

function makeService(findManyResult: unknown[]) {
  const prisma = {
    monitor: {
      findMany: vi.fn().mockResolvedValue(findManyResult),
    },
  };
  const service = new MonitorsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma };
}

function makeAudit(grade: string, score: number, headers: Array<{ name: string; present: boolean; severity: string }>) {
  return { grade, score, headers };
}

function makeMonitor(overrides: Partial<{
  id: string;
  name: string;
  target: string;
  type: string;
  enabled: boolean;
  folderId: string | null;
  folder: { name: string } | null;
  runs: Array<{ securityAuditJson: unknown; checkedAt: Date }>;
}> = {}) {
  return {
    id: 'mon-1',
    name: 'My Monitor',
    target: 'https://example.com',
    type: 'HTTP',
    enabled: true,
    folderId: null,
    folder: null,
    runs: [],
    ...overrides,
  };
}

describe('MonitorsService.getSecurityHeadersSummary', () => {
  it('returns empty result when no monitors', async () => {
    const { service } = makeService([]);
    const result = await service.getSecurityHeadersSummary('user-1');
    expect(result.total).toBe(0);
    expect(result.monitors).toHaveLength(0);
    expect(result.avgScore).toBeNull();
    expect(result.headerCoverage).toHaveLength(0);
    expect(result.gradeA).toBe(0);
    expect(result.gradeF).toBe(0);
    expect(result.noData).toBe(0);
  });

  it('counts grade distribution correctly', async () => {
    const headers = [
      { name: 'Strict-Transport-Security', present: true, severity: 'critical' },
      { name: 'Content-Security-Policy', present: true, severity: 'critical' },
    ];
    const { service } = makeService([
      makeMonitor({ id: 'a', name: 'A Monitor', runs: [{ securityAuditJson: makeAudit('A', 100, headers), checkedAt: new Date() }] }),
      makeMonitor({ id: 'b', name: 'B Monitor', runs: [{ securityAuditJson: makeAudit('F', 0, headers), checkedAt: new Date() }] }),
      makeMonitor({ id: 'c', name: 'C Monitor', runs: [] }),
    ]);
    const result = await service.getSecurityHeadersSummary('user-1');
    expect(result.total).toBe(3);
    expect(result.gradeA).toBe(1);
    expect(result.gradeF).toBe(1);
    expect(result.noData).toBe(1);
  });

  it('computes avgScore from scored monitors only', async () => {
    const headers = [{ name: 'HSTS', present: true, severity: 'critical' }];
    const { service } = makeService([
      makeMonitor({ id: 'a', runs: [{ securityAuditJson: makeAudit('A', 80, headers), checkedAt: new Date() }] }),
      makeMonitor({ id: 'b', runs: [{ securityAuditJson: makeAudit('C', 60, headers), checkedAt: new Date() }] }),
      makeMonitor({ id: 'c', runs: [] }), // no data — excluded from avg
    ]);
    const result = await service.getSecurityHeadersSummary('user-1');
    // avg of 80 + 60 = 70
    expect(result.avgScore).toBe(70);
  });

  it('returns avgScore null when no monitors have audit data', async () => {
    const { service } = makeService([
      makeMonitor({ id: 'a', runs: [] }),
      makeMonitor({ id: 'b', runs: [] }),
    ]);
    const result = await service.getSecurityHeadersSummary('user-1');
    expect(result.avgScore).toBeNull();
  });

  it('sorts monitors worst-first (lowest score first)', async () => {
    const headers = [{ name: 'HSTS', present: false, severity: 'critical' }];
    const { service } = makeService([
      makeMonitor({ id: 'good', name: 'Good', runs: [{ securityAuditJson: makeAudit('A', 95, headers), checkedAt: new Date() }] }),
      makeMonitor({ id: 'bad', name: 'Bad', runs: [{ securityAuditJson: makeAudit('F', 10, headers), checkedAt: new Date() }] }),
      makeMonitor({ id: 'mid', name: 'Mid', runs: [{ securityAuditJson: makeAudit('C', 55, headers), checkedAt: new Date() }] }),
    ]);
    const result = await service.getSecurityHeadersSummary('user-1');
    expect(result.monitors[0].monitorId).toBe('bad');
    expect(result.monitors[1].monitorId).toBe('mid');
    expect(result.monitors[2].monitorId).toBe('good');
  });

  it('puts no-data monitors at the end', async () => {
    const headers = [{ name: 'HSTS', present: true, severity: 'critical' }];
    const { service } = makeService([
      makeMonitor({ id: 'no-data', name: 'No Data', runs: [] }),
      makeMonitor({ id: 'has-data', name: 'Has Data', runs: [{ securityAuditJson: makeAudit('A', 90, headers), checkedAt: new Date() }] }),
    ]);
    const result = await service.getSecurityHeadersSummary('user-1');
    expect(result.monitors[0].monitorId).toBe('has-data');
    expect(result.monitors[1].monitorId).toBe('no-data');
  });

  it('computes headerCoverage across monitors', async () => {
    const { service } = makeService([
      makeMonitor({
        id: 'a',
        runs: [{
          securityAuditJson: makeAudit('A', 90, [
            { name: 'HSTS', present: true, severity: 'critical' },
            { name: 'CSP', present: false, severity: 'critical' },
          ]),
          checkedAt: new Date(),
        }],
      }),
      makeMonitor({
        id: 'b',
        runs: [{
          securityAuditJson: makeAudit('B', 70, [
            { name: 'HSTS', present: true, severity: 'critical' },
            { name: 'CSP', present: true, severity: 'critical' },
          ]),
          checkedAt: new Date(),
        }],
      }),
    ]);
    const result = await service.getSecurityHeadersSummary('user-1');
    const hsts = result.headerCoverage.find((h) => h.name === 'HSTS');
    const csp = result.headerCoverage.find((h) => h.name === 'CSP');
    expect(hsts?.presentCount).toBe(2);
    expect(hsts?.totalCount).toBe(2);
    expect(hsts?.coveragePct).toBe(100);
    expect(csp?.presentCount).toBe(1);
    expect(csp?.totalCount).toBe(2);
    expect(csp?.coveragePct).toBe(50);
  });

  it('handles missing or null securityAuditJson gracefully', async () => {
    const { service } = makeService([
      makeMonitor({ id: 'a', runs: [{ securityAuditJson: null, checkedAt: new Date() }] }),
      makeMonitor({ id: 'b', runs: [{ securityAuditJson: undefined, checkedAt: new Date() }] }),
    ]);
    const result = await service.getSecurityHeadersSummary('user-1');
    expect(result.noData).toBe(2);
    expect(result.avgScore).toBeNull();
    expect(result.monitors.every((m) => m.grade === null)).toBe(true);
  });

  it('includes folder name when present', async () => {
    const { service } = makeService([
      makeMonitor({
        id: 'a',
        folderId: 'folder-1',
        folder: { name: 'Production' },
        runs: [],
      }),
    ]);
    const result = await service.getSecurityHeadersSummary('user-1');
    expect(result.monitors[0].folderName).toBe('Production');
    expect(result.monitors[0].folderId).toBe('folder-1');
  });
});
