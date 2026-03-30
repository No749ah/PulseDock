import { describe, it, expect, vi } from 'vitest';
import { MonitorsDiagnosticsService } from './monitors-diagnostics.service';

function makeService(findManyResult: unknown[]) {
  const prisma = {
    monitor: {
      findMany: vi.fn().mockResolvedValue(findManyResult),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const service = new (MonitorsDiagnosticsService as unknown as new (...args: unknown[]) => MonitorsDiagnosticsService)(prisma as never);
  return { service, prisma };
}

function makeMonitor(overrides: Partial<{
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  description: string | null;
  runbookUrl: string | null;
  slaTarget: number | null;
  alertCount: number;
  tagCount: number;
}> = {}) {
  const {
    id = 'mon-1',
    name = 'My Monitor',
    type = 'HTTP',
    enabled = true,
    description = null,
    runbookUrl = null,
    slaTarget = null,
    alertCount = 0,
    tagCount = 0,
  } = overrides;
  return {
    id, name, type, enabled, description, runbookUrl, slaTarget,
    _count: { monitorAlerts: alertCount, monitorTags: tagCount },
  };
}

describe('MonitorsService.monitorCoverage', () => {
  it('returns coverageScore 100 and empty gaps when no monitors', async () => {
    const { service } = makeService([]);
    const result = await service.monitorCoverage('user-1');

    expect(result.coverageScore).toBe(100);
    expect(result.totalMonitors).toBe(0);
    expect(result.gaps).toHaveLength(0);
  });

  it('returns coverageScore 0 for a monitor missing all coverage criteria', async () => {
    const { service } = makeService([makeMonitor()]);
    const result = await service.monitorCoverage('user-1');

    expect(result.totalMonitors).toBe(1);
    expect(result.monitorsWithAlerts).toBe(0);
    expect(result.monitorsWithSla).toBe(0);
    expect(result.monitorsWithDescription).toBe(0);
    expect(result.monitorsWithRunbook).toBe(0);
    expect(result.gaps[0].coverageScore).toBe(0);
    expect(result.gaps[0].missingAlerts).toBe(true);
    expect(result.gaps[0].missingSla).toBe(true);
  });

  it('returns coverageScore 100 for a fully configured monitor', async () => {
    const { service } = makeService([makeMonitor({
      description: 'Monitors the API',
      runbookUrl: 'https://wiki.example.com/runbook',
      slaTarget: 99.9,
      alertCount: 2,
      tagCount: 1,
    })]);
    const result = await service.monitorCoverage('user-1');

    expect(result.gaps[0].coverageScore).toBe(100);
    expect(result.gaps[0].missingAlerts).toBe(false);
    expect(result.gaps[0].missingSla).toBe(false);
    expect(result.gaps[0].missingDescription).toBe(false);
    expect(result.gaps[0].missingRunbook).toBe(false);
    expect(result.coverageScore).toBe(100);
  });

  it('calculates correct aggregate counts across multiple monitors', async () => {
    const { service } = makeService([
      makeMonitor({ id: 'mon-1', alertCount: 1, slaTarget: 99.9, description: 'ok', runbookUrl: 'https://r.co' }),
      makeMonitor({ id: 'mon-2' }), // missing everything
      makeMonitor({ id: 'mon-3', alertCount: 1, description: 'ok' }),
    ]);
    const result = await service.monitorCoverage('user-1');

    expect(result.totalMonitors).toBe(3);
    expect(result.monitorsWithAlerts).toBe(2);
    expect(result.monitorsWithSla).toBe(1);
    expect(result.monitorsWithDescription).toBe(2);
    expect(result.monitorsWithRunbook).toBe(1);
  });

  it('sorts gaps by coverageScore ascending (worst first)', async () => {
    const { service } = makeService([
      makeMonitor({ id: 'mon-full', description: 'ok', runbookUrl: 'https://r.co', slaTarget: 99.9, alertCount: 1 }),
      makeMonitor({ id: 'mon-empty' }), // 0%
      makeMonitor({ id: 'mon-partial', alertCount: 1 }), // 40% (alerts = 2pts of 5)
    ]);
    const result = await service.monitorCoverage('user-1');

    // Gaps sorted worst first
    expect(result.gaps[0].id).toBe('mon-empty');
    expect(result.gaps[0].coverageScore).toBe(0);
    expect(result.gaps[result.gaps.length - 1].id).toBe('mon-full');
    expect(result.gaps[result.gaps.length - 1].coverageScore).toBe(100);
  });
});
