/**
 * Unit tests for AlertsAnalysisService.
 *
 * All Prisma interactions are mocked — no database required.
 * Tests cover:
 *   - noiseAnalysis: noise scoring, recommendations, summary stats, empty state
 *   - deliveryResponseTime: per-channel latency, percentiles, daily trend
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertsAnalysisService } from './alerts-analysis.service';

// ─── Mocked PrismaService ─────────────────────────────────────────────────────

const mockPrisma = {
  alertDeliveryLog: {
    findMany: vi.fn(),
  },
  monitor: {
    findMany: vi.fn(),
  },
};

function makeSvc(): AlertsAnalysisService {
  return new AlertsAnalysisService(mockPrisma as never);
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3_600_000);
}

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86_400_000);
}

// ─── noiseAnalysis ────────────────────────────────────────────────────────────

describe('AlertsAnalysisService.noiseAnalysis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty report when no delivery logs exist', async () => {
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue([]);

    const result = await makeSvc().noiseAnalysis('user-1', 7);

    expect(result.summary.totalAlerts).toBe(0);
    expect(result.monitors).toHaveLength(0);
    expect(result.periodDays).toBe(7);
  });

  it('clamps periodDays to 1–30 range', async () => {
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue([]);

    const result0 = await makeSvc().noiseAnalysis('user-1', 0);
    expect(result0.periodDays).toBe(1);

    const result99 = await makeSvc().noiseAnalysis('user-1', 99);
    expect(result99.periodDays).toBe(30);
  });

  it('classifies monitor as low noise when alerts per day <= 3', async () => {
    const logs = Array.from({ length: 3 }, (_, i) => ({
      id: `log-${i}`,
      monitorId: 'mon-1',
      monitorName: 'API Monitor',
      status: 'sent',
      createdAt: hoursAgo(i * 12),
    }));
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue(logs);
    mockPrisma.monitor.findMany.mockResolvedValue([{
      id: 'mon-1',
      name: 'API Monitor',
      type: 'HTTP',
      confirmations: 2,
      flapDetectionEnabled: true,
      intervalSec: 60,
      retryCount: 1,
    }]);

    const result = await makeSvc().noiseAnalysis('user-1', 7);

    expect(result.monitors[0].noiseScore).toBe('low');
  });

  it('classifies monitor as critical noise when alerts per day > 20', async () => {
    // 200 alerts over 7 days = ~28.6/day
    const logs = Array.from({ length: 200 }, (_, i) => ({
      id: `log-${i}`,
      monitorId: 'mon-1',
      monitorName: 'Noisy Monitor',
      status: 'sent',
      createdAt: hoursAgo(i),
    }));
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue(logs);
    mockPrisma.monitor.findMany.mockResolvedValue([{
      id: 'mon-1',
      name: 'Noisy Monitor',
      type: 'HTTP',
      confirmations: 1,
      flapDetectionEnabled: false,
      intervalSec: 30,
      retryCount: 0,
    }]);

    const result = await makeSvc().noiseAnalysis('user-1', 7);

    expect(result.monitors[0].noiseScore).toBe('critical');
    expect(result.summary.noisyMonitors).toBe(1);
  });

  it('recommends increasing confirmations when set to 1 and noisy', async () => {
    const logs = Array.from({ length: 50 }, (_, i) => ({
      id: `log-${i}`,
      monitorId: 'mon-1',
      monitorName: 'Monitor',
      status: 'sent',
      createdAt: hoursAgo(i * 3),
    }));
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue(logs);
    mockPrisma.monitor.findMany.mockResolvedValue([{
      id: 'mon-1',
      name: 'Monitor',
      type: 'HTTP',
      confirmations: 1,
      flapDetectionEnabled: true,
      intervalSec: 60,
      retryCount: 0,
    }]);

    const result = await makeSvc().noiseAnalysis('user-1', 7);

    const recommendations = result.monitors[0].recommendations;
    expect(recommendations.some((r) => r.toLowerCase().includes('confirmation'))).toBe(true);
  });

  it('recommends enabling flap detection when disabled and noisy', async () => {
    const logs = Array.from({ length: 50 }, (_, i) => ({
      id: `log-${i}`,
      monitorId: 'mon-1',
      monitorName: 'Monitor',
      status: 'sent',
      createdAt: hoursAgo(i * 2),
    }));
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue(logs);
    mockPrisma.monitor.findMany.mockResolvedValue([{
      id: 'mon-1',
      name: 'Monitor',
      type: 'HTTP',
      confirmations: 3,
      flapDetectionEnabled: false,
      intervalSec: 60,
      retryCount: 1,
    }]);

    const result = await makeSvc().noiseAnalysis('user-1', 7);

    const reasons = result.monitors[0].noiseReason;
    expect(reasons.some((r) => r.toLowerCase().includes('flap'))).toBe(true);
  });

  it('computes summary stats correctly', async () => {
    const logs = [
      { id: 'l1', monitorId: 'mon-1', monitorName: 'A', status: 'sent', createdAt: hoursAgo(1) },
      { id: 'l2', monitorId: 'mon-1', monitorName: 'A', status: 'failed', createdAt: hoursAgo(2) },
      { id: 'l3', monitorId: 'mon-2', monitorName: 'B', status: 'sent', createdAt: hoursAgo(3) },
    ];
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue(logs);
    mockPrisma.monitor.findMany.mockResolvedValue([
      { id: 'mon-1', name: 'A', type: 'HTTP', confirmations: 2, flapDetectionEnabled: true, intervalSec: 60, retryCount: 0 },
      { id: 'mon-2', name: 'B', type: 'HTTP', confirmations: 2, flapDetectionEnabled: true, intervalSec: 60, retryCount: 0 },
    ]);

    const result = await makeSvc().noiseAnalysis('user-1', 7);

    expect(result.summary.totalAlerts).toBe(3);
    expect(result.summary.uniqueMonitors).toBe(2);
  });

  it('sorts monitors by noise score descending', async () => {
    // mon-1: 5 alerts (medium), mon-2: 200 alerts (critical)
    const logs = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `l1-${i}`, monitorId: 'mon-1', monitorName: 'Low',
        status: 'sent', createdAt: hoursAgo(i),
      })),
      ...Array.from({ length: 200 }, (_, i) => ({
        id: `l2-${i}`, monitorId: 'mon-2', monitorName: 'Noisy',
        status: 'sent', createdAt: hoursAgo(i),
      })),
    ];
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue(logs);
    mockPrisma.monitor.findMany.mockResolvedValue([
      { id: 'mon-1', name: 'Low', type: 'HTTP', confirmations: 2, flapDetectionEnabled: true, intervalSec: 60, retryCount: 0 },
      { id: 'mon-2', name: 'Noisy', type: 'HTTP', confirmations: 1, flapDetectionEnabled: false, intervalSec: 30, retryCount: 0 },
    ]);

    const result = await makeSvc().noiseAnalysis('user-1', 7);

    expect(result.monitors[0].monitorName).toBe('Noisy');
    expect(result.monitors[1].monitorName).toBe('Low');
  });

  it('reports high delivery failure rate in noise reasons', async () => {
    const logs = [
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `ok-${i}`, monitorId: 'mon-1', monitorName: 'Monitor',
        status: 'sent', createdAt: hoursAgo(i),
      })),
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `fail-${i}`, monitorId: 'mon-1', monitorName: 'Monitor',
        status: 'failed', createdAt: hoursAgo(i + 10),
      })),
    ];
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue(logs);
    mockPrisma.monitor.findMany.mockResolvedValue([{
      id: 'mon-1', name: 'Monitor', type: 'HTTP',
      confirmations: 2, flapDetectionEnabled: true, intervalSec: 60, retryCount: 0,
    }]);

    const result = await makeSvc().noiseAnalysis('user-1', 7);

    const reasons = result.monitors[0].noiseReason;
    expect(reasons.some((r) => r.includes('failed'))).toBe(true);
  });
});

// ─── deliveryResponseTime ─────────────────────────────────────────────────────

describe('AlertsAnalysisService.deliveryResponseTime', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty channels when no logs exist', async () => {
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue([]);

    const result = await makeSvc().deliveryResponseTime('user-1', 7);

    expect(result.channels).toHaveLength(0);
    expect(result.fleetStats.totalDeliveries).toBe(0);
  });

  it('computes per-channel latency stats', async () => {
    const logs = Array.from({ length: 5 }, (_, i) => ({
      id: `log-${i}`,
      status: 'SUCCESS',
      durationMs: 100 + i * 50, // 100, 150, 200, 250, 300
      createdAt: hoursAgo(i),
      alertChannel: { id: 'ch-1', name: 'Slack', type: 'SLACK' },
    }));
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue(logs);

    const result = await makeSvc().deliveryResponseTime('user-1', 7);

    expect(result.channels).toHaveLength(1);
    expect(result.channels[0].channelName).toBe('Slack');
    expect(result.channels[0].totalDeliveries).toBe(5);
    expect(result.channels[0].successCount).toBe(5);
    expect(result.channels[0].avgMs).not.toBeNull();
  });

  it('computes fleet-wide stats across all channels', async () => {
    const logs = [
      { id: 'l1', status: 'SUCCESS', durationMs: 100, createdAt: hoursAgo(1), alertChannel: { id: 'ch-1', name: 'Slack', type: 'SLACK' } },
      { id: 'l2', status: 'SUCCESS', durationMs: 200, createdAt: hoursAgo(2), alertChannel: { id: 'ch-2', name: 'Email', type: 'EMAIL' } },
    ];
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue(logs);

    const result = await makeSvc().deliveryResponseTime('user-1', 7);

    expect(result.fleetStats.totalDeliveries).toBe(2);
    expect(result.fleetStats.avgMs).toBe(150);
  });

  it('counts success and failed deliveries separately', async () => {
    const logs = [
      { id: 'l1', status: 'SUCCESS', durationMs: 100, createdAt: hoursAgo(1), alertChannel: { id: 'ch-1', name: 'Slack', type: 'SLACK' } },
      { id: 'l2', status: 'FAILED', durationMs: null, createdAt: hoursAgo(2), alertChannel: { id: 'ch-1', name: 'Slack', type: 'SLACK' } },
    ];
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue(logs);

    const result = await makeSvc().deliveryResponseTime('user-1', 7);

    expect(result.channels[0].successCount).toBe(1);
    expect(result.channels[0].failedCount).toBe(1);
  });

  it('generates daily trend data', async () => {
    const logs = [
      { id: 'l1', status: 'sent', durationMs: 100, createdAt: daysAgo(1), alertChannel: { id: 'ch-1', name: 'Slack', type: 'SLACK' } },
      { id: 'l2', status: 'sent', durationMs: 200, createdAt: daysAgo(2), alertChannel: { id: 'ch-1', name: 'Slack', type: 'SLACK' } },
    ];
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue(logs);

    const result = await makeSvc().deliveryResponseTime('user-1', 7);

    expect(result.dailyTrend.length).toBeGreaterThan(0);
    expect(result.dailyTrend[0]).toHaveProperty('date');
    expect(result.dailyTrend[0]).toHaveProperty('count');
  });
});
