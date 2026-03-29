import { describe, it, expect, vi } from 'vitest';
import { AlertsService } from './alerts.service';

type MockLog = {
  id: string;
  status: string;
  sentAt: Date | null;
  createdAt: Date;
  channel: { id: string; name: string; type: string } | null;
};

function buildService(logs: MockLog[]): AlertsService {
  const prisma = {
    alertDeliveryLog: { findMany: vi.fn().mockResolvedValue(logs) },
    alertChannel: { findMany: vi.fn().mockResolvedValue([]) },
  };
  // AlertsService constructor: (prisma, metrics, mailer, notifications, realtime?)
  return new AlertsService(prisma as never, {} as never, {} as never, {} as never);
}

function makeDate(daysAgo: number, offsetMs = 0): Date {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 + offsetMs);
}

describe('AlertsService.deliveryResponseTime', () => {
  it('returns empty stats for no logs', async () => {
    const svc = buildService([]);
    const r = await svc.deliveryResponseTime('user-1', 30);
    expect(r.channels).toHaveLength(0);
    expect(r.fleetStats.totalDeliveries).toBe(0);
    expect(r.fleetStats.avgMs).toBeNull();
    expect(r.dailyTrend).toHaveLength(0);
  });

  it('computes avg delivery latency from sentAt - createdAt', async () => {
    const created = makeDate(1);
    const sent = new Date(created.getTime() + 500); // 500ms later
    const logs: MockLog[] = [{
      id: '1', status: 'SUCCESS', sentAt: sent, createdAt: created,
      channel: { id: 'ch1', name: 'Slack', type: 'slack' },
    }];
    const svc = buildService(logs);
    const r = await svc.deliveryResponseTime('user-1', 30);
    expect(r.fleetStats.avgMs).toBe(500);
    expect(r.channels[0].avgMs).toBe(500);
    expect(r.channels[0].channelName).toBe('Slack');
  });

  it('counts failed deliveries and excludes them from latency', async () => {
    const logs: MockLog[] = [
      { id: '1', status: 'SUCCESS', sentAt: new Date(makeDate(1).getTime() + 200), createdAt: makeDate(1), channel: { id: 'ch1', name: 'PD', type: 'pagerduty' } },
      { id: '2', status: 'FAILED', sentAt: null, createdAt: makeDate(2), channel: { id: 'ch1', name: 'PD', type: 'pagerduty' } },
    ];
    const svc = buildService(logs);
    const r = await svc.deliveryResponseTime('user-1', 30);
    expect(r.channels[0].successCount).toBe(1);
    expect(r.channels[0].failedCount).toBe(1);
    expect(r.channels[0].successRate).toBe(50);
    expect(r.channels[0].avgMs).toBe(200);
  });

  it('computes fleet-level success rate correctly', async () => {
    const logs: MockLog[] = [
      { id: '1', status: 'SUCCESS', sentAt: makeDate(1), createdAt: makeDate(1), channel: { id: 'c1', name: 'A', type: 'slack' } },
      { id: '2', status: 'SUCCESS', sentAt: makeDate(1), createdAt: makeDate(1), channel: { id: 'c1', name: 'A', type: 'slack' } },
      { id: '3', status: 'FAILED', sentAt: null, createdAt: makeDate(1), channel: { id: 'c1', name: 'A', type: 'slack' } },
      { id: '4', status: 'FAILED', sentAt: null, createdAt: makeDate(1), channel: { id: 'c1', name: 'A', type: 'slack' } },
    ];
    const svc = buildService(logs);
    const r = await svc.deliveryResponseTime('user-1', 30);
    expect(r.fleetStats.totalDeliveries).toBe(4);
    expect(r.fleetStats.successRate).toBe(50);
  });

  it('builds daily trend entries', async () => {
    const d = makeDate(0);
    const logs: MockLog[] = [
      { id: '1', status: 'SUCCESS', sentAt: new Date(d.getTime() + 100), createdAt: d, channel: { id: 'c1', name: 'A', type: 'slack' } },
      { id: '2', status: 'SUCCESS', sentAt: new Date(d.getTime() + 300), createdAt: d, channel: { id: 'c1', name: 'A', type: 'slack' } },
    ];
    const svc = buildService(logs);
    const r = await svc.deliveryResponseTime('user-1', 30);
    expect(r.dailyTrend.length).toBeGreaterThan(0);
    const today = r.dailyTrend.find(t => t.date === d.toISOString().slice(0, 10));
    expect(today?.count).toBe(2);
    expect(today?.avgMs).toBe(200); // (100+300)/2
  });
});
