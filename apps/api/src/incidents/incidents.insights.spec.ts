import { describe, it, expect, vi } from 'vitest';
import { IncidentsService } from './incidents.service';

type MockIncident = {
  id: string;
  status: string;
  severity: string;
  createdAt: Date;
  resolvedAt: Date | null;
  monitors: Array<{ monitor: { id: string; name: string } }>;
};

function buildService(incidents: MockIncident[]): IncidentsService {
  const prisma = {
    incident: { findMany: vi.fn().mockResolvedValue(incidents) },
  };
  return new IncidentsService(prisma as never, {} as never, {} as never);
}

function makeDate(daysAgo: number, hour = 12): Date {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

describe('IncidentsService.incidentInsights', () => {
  it('returns zeroed totals for empty incident list', async () => {
    const svc = buildService([]);
    const r = await svc.incidentInsights('user-1', 30);
    expect(r.totals.total).toBe(0);
    expect(r.totals.open).toBe(0);
    expect(r.totals.resolved).toBe(0);
    expect(r.totals.avgResolutionMinutes).toBeNull();
    expect(r.severityBreakdown).toHaveLength(0);
    expect(r.topMonitors).toHaveLength(0);
  });

  it('clamps days to 7-365 range', async () => {
    const svc = buildService([]);
    const r1 = await svc.incidentInsights('user-1', 1000);
    expect(r1.period.days).toBe(365);
    const r2 = await svc.incidentInsights('user-1', 1);
    expect(r2.period.days).toBe(7);
  });

  it('computes correct totals and MTTR', async () => {
    const open: MockIncident = { id: '1', status: 'INVESTIGATING', severity: 'HIGH', createdAt: makeDate(5), resolvedAt: null, monitors: [] };
    const res: MockIncident = { id: '2', status: 'RESOLVED', severity: 'MEDIUM', createdAt: makeDate(10), resolvedAt: new Date(makeDate(10).getTime() + 2 * 60 * 60 * 1000), monitors: [] };
    const svc = buildService([open, res]);
    const r = await svc.incidentInsights('user-1', 30);
    expect(r.totals.total).toBe(2);
    expect(r.totals.open).toBe(1);
    expect(r.totals.resolved).toBe(1);
    expect(r.totals.avgResolutionMinutes).toBe(120); // 2h = 120min
  });

  it('builds severity breakdown correctly', async () => {
    const incidents: MockIncident[] = [
      { id: '1', status: 'RESOLVED', severity: 'CRITICAL', createdAt: makeDate(2), resolvedAt: makeDate(1), monitors: [] },
      { id: '2', status: 'RESOLVED', severity: 'CRITICAL', createdAt: makeDate(3), resolvedAt: makeDate(2), monitors: [] },
      { id: '3', status: 'RESOLVED', severity: 'HIGH', createdAt: makeDate(4), resolvedAt: makeDate(3), monitors: [] },
    ];
    const svc = buildService(incidents);
    const r = await svc.incidentInsights('user-1', 30);
    expect(r.severityBreakdown[0].severity).toBe('CRITICAL');
    expect(r.severityBreakdown[0].count).toBe(2);
    expect(r.severityBreakdown[0].pct).toBe(67);
    expect(r.severityBreakdown[1].severity).toBe('HIGH');
  });

  it('identifies top affected monitors', async () => {
    const incidents: MockIncident[] = [
      { id: '1', status: 'RESOLVED', severity: 'HIGH', createdAt: makeDate(3), resolvedAt: makeDate(2), monitors: [{ monitor: { id: 'm1', name: 'API' } }] },
      { id: '2', status: 'RESOLVED', severity: 'MEDIUM', createdAt: makeDate(5), resolvedAt: makeDate(4), monitors: [{ monitor: { id: 'm1', name: 'API' } }] },
      { id: '3', status: 'RESOLVED', severity: 'LOW', createdAt: makeDate(7), resolvedAt: makeDate(6), monitors: [{ monitor: { id: 'm2', name: 'DB' } }] },
    ];
    const svc = buildService(incidents);
    const r = await svc.incidentInsights('user-1', 30);
    expect(r.topMonitors[0].monitorId).toBe('m1');
    expect(r.topMonitors[0].count).toBe(2);
    expect(r.topMonitors[1].monitorId).toBe('m2');
  });

  it('builds heatmap entries only for hours with incidents', async () => {
    const d = new Date();
    d.setUTCHours(14, 0, 0, 0);
    const incidents: MockIncident[] = [
      { id: '1', status: 'INVESTIGATING', severity: 'HIGH', createdAt: d, resolvedAt: null, monitors: [] },
    ];
    const svc = buildService(incidents);
    const r = await svc.incidentInsights('user-1', 30);
    expect(r.hourHeatmap.length).toBeGreaterThan(0);
    const cell = r.hourHeatmap.find(c => c.hour === 14);
    expect(cell).toBeDefined();
    expect(cell!.count).toBe(1);
  });
});
