import { describe, it, expect, vi } from 'vitest';
import { MonitorsService } from './monitors.service';

type MockMonitor = {
  id: string; name: string; type: string; intervalSec: number | null; cronExpression: string | null;
  createdAt: Date; pinned: boolean; folder: null;
};
type MockRun = { monitorId: string; ok: boolean; checkedAt: Date };
type MockIncident = { id: string; createdAt: Date; monitors: Array<{ monitorId: string }> };

function buildService(monitors: MockMonitor[], runs: MockRun[] = [], incidents: MockIncident[] = []): MonitorsService {
  const prisma = {
    monitor: { findMany: vi.fn().mockResolvedValue(monitors) },
    monitorRun: { findMany: vi.fn().mockResolvedValue(runs) },
    incident: { findMany: vi.fn().mockResolvedValue(incidents) },
  };
  return new MonitorsService(prisma as never, {} as never, {} as never, {} as never, {} as never);
}

function makeDate(daysAgo: number, minutesAgo = 0): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - minutesAgo * 60 * 1000);
}

const OLD_MONITOR: MockMonitor = {
  id: 'm1', name: 'API', type: 'HTTP', intervalSec: 60, cronExpression: null,
  createdAt: makeDate(30), pinned: false, folder: null,
};

describe('MonitorsService.intervalOptimizer', () => {
  it('returns empty result for no monitors', async () => {
    const svc = buildService([]);
    const r = await svc.intervalOptimizer('user-1');
    expect(r.monitors).toHaveLength(0);
    expect(r.summary.totalMonitors).toBe(0);
  });

  it('marks new monitors (< 7 days old)', async () => {
    const newMonitor: MockMonitor = {
      id: 'n1', name: 'New', type: 'HTTP', intervalSec: 60, cronExpression: null,
      createdAt: makeDate(2), pinned: false, folder: null,
    };
    const svc = buildService([newMonitor]);
    const r = await svc.intervalOptimizer('user-1');
    expect(r.monitors[0].recommendation).toBe('new');
  });

  it('recommends decrease for over-monitored stable monitors', async () => {
    const monitor: MockMonitor = { ...OLD_MONITOR, intervalSec: 30 }; // 30s interval, 0 incidents
    const svc = buildService([monitor]);
    const r = await svc.intervalOptimizer('user-1');
    expect(r.monitors[0].recommendation).toBe('decrease');
    expect(r.monitors[0].suggestedIntervalSec).toBe(300);
    expect(r.summary.tooFrequent).toBe(1);
  });

  it('recommends increase when detection time is high', async () => {
    const monitor: MockMonitor = { ...OLD_MONITOR, intervalSec: 300 };
    // Incident at T, first fail 15 min before = detection 15min
    const incidentDate = makeDate(5);
    const firstFail = makeDate(5, -15); // 15 min before incident (fails.checkedAt < incidentDate)
    const incidents: MockIncident[] = [{ id: 'i1', createdAt: incidentDate, monitors: [{ monitorId: 'm1' }] }];
    const runs: MockRun[] = [{ monitorId: 'm1', ok: false, checkedAt: new Date(incidentDate.getTime() - 15 * 60 * 1000) }];
    const svc = buildService([monitor], runs, incidents);
    const r = await svc.intervalOptimizer('user-1');
    expect(r.monitors[0].recommendation).toBe('increase');
    expect(r.monitors[0].suggestedIntervalSec).toBeLessThanOrEqual(60);
    expect(r.summary.tooInfrequent).toBe(1);
  });

  it('marks optimal for well-calibrated monitors', async () => {
    const monitor: MockMonitor = { ...OLD_MONITOR, intervalSec: 60 };
    // 1 incident, detected quickly (2 min detection)
    const incidentDate = makeDate(10);
    const runs: MockRun[] = [{ monitorId: 'm1', ok: false, checkedAt: new Date(incidentDate.getTime() - 2 * 60 * 1000) }];
    const incidents: MockIncident[] = [{ id: 'i1', createdAt: incidentDate, monitors: [{ monitorId: 'm1' }] }];
    const svc = buildService([monitor], runs, incidents);
    const r = await svc.intervalOptimizer('user-1');
    expect(r.monitors[0].recommendation).toBe('optimal');
    expect(r.summary.optimal).toBe(1);
  });

  it('handles monitors with cron expression as optimal', async () => {
    const cronMonitor: MockMonitor = { ...OLD_MONITOR, intervalSec: null, cronExpression: '*/5 * * * *' };
    const svc = buildService([cronMonitor]);
    const r = await svc.intervalOptimizer('user-1');
    expect(r.monitors[0].recommendation).toBe('optimal');
    expect(r.monitors[0].cronExpression).toBe('*/5 * * * *');
  });
});
