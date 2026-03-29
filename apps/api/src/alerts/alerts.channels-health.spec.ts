import { describe, it, expect, vi } from 'vitest';
import { AlertsService } from './alerts.service';

function buildService(channels: unknown[], logs: unknown[]) {
  const prisma = {
    alertChannel: { findMany: vi.fn().mockResolvedValue(channels) },
    alertDeliveryLog: { findMany: vi.fn().mockResolvedValue(logs) },
  };
  return new AlertsService(prisma as never, {} as never, {} as never, {} as never);
}

function makeLog(channelId: string, status: 'success' | 'failed', minsAgo: number, errorMessage?: string) {
  return {
    alertChannelId: channelId,
    status,
    createdAt: new Date(Date.now() - minsAgo * 60 * 1000),
    errorMessage: errorMessage ?? null,
  };
}

describe('AlertsService.channelsHealth', () => {
  it('returns empty array for no channels', async () => {
    const svc = buildService([], []);
    const r = await svc.channelsHealth('u1');
    expect(r).toHaveLength(0);
  });

  it('marks channel as untested when no logs', async () => {
    const channels = [{ id: 'ch1', name: 'Slack', type: 'slack' }];
    const svc = buildService(channels, []);
    const r = await svc.channelsHealth('u1');
    expect(r[0].healthStatus).toBe('untested');
    expect(r[0].totalDeliveries).toBe(0);
    expect(r[0].successRate).toBe(100); // default 100 for untested
  });

  it('marks channel as healthy when success rate >= 95%', async () => {
    const channels = [{ id: 'ch1', name: 'Slack', type: 'slack' }];
    const logs = [
      makeLog('ch1', 'success', 10),
      makeLog('ch1', 'success', 20),
      makeLog('ch1', 'success', 30),
      makeLog('ch1', 'success', 40),
      makeLog('ch1', 'success', 50),
    ];
    const svc = buildService(channels, logs);
    const r = await svc.channelsHealth('u1');
    expect(r[0].healthStatus).toBe('healthy');
    expect(r[0].successRate).toBe(100);
  });

  it('marks channel as failing when success rate < 70%', async () => {
    const channels = [{ id: 'ch1', name: 'PD', type: 'pagerduty' }];
    const logs = [
      makeLog('ch1', 'failed', 10, 'Connection refused'),
      makeLog('ch1', 'failed', 20, 'Connection refused'),
      makeLog('ch1', 'failed', 30, 'Connection refused'),
      makeLog('ch1', 'success', 40),
    ];
    const svc = buildService(channels, logs);
    const r = await svc.channelsHealth('u1');
    expect(r[0].healthStatus).toBe('failing');
    expect(r[0].lastErrorMessage).toBe('Connection refused');
    expect(r[0].failedCount).toBe(3);
  });

  it('marks channel as degraded when success rate 70-94%', async () => {
    const channels = [{ id: 'ch1', name: 'Teams', type: 'teams' }];
    const logs = [
      makeLog('ch1', 'success', 10),
      makeLog('ch1', 'success', 20),
      makeLog('ch1', 'success', 30),
      makeLog('ch1', 'failed', 40, 'timeout'),
    ];
    const svc = buildService(channels, logs);
    const r = await svc.channelsHealth('u1');
    expect(r[0].healthStatus).toBe('degraded');
    expect(r[0].successRate).toBe(75);
  });

  it('correctly counts last 24h deliveries', async () => {
    const channels = [{ id: 'ch1', name: 'Webhook', type: 'webhook' }];
    const logs = [
      makeLog('ch1', 'success', 30),   // 30 min ago — within 24h
      makeLog('ch1', 'success', 60),   // 1 hour ago — within 24h
      makeLog('ch1', 'failed', 25 * 60, 'err'), // 25 hours ago — outside 24h
    ];
    const svc = buildService(channels, logs);
    const r = await svc.channelsHealth('u1');
    expect(r[0].last24hCount).toBe(2);
    expect(r[0].totalDeliveries).toBe(3);
  });
});
