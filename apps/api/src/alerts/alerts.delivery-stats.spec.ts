import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { MetricsService } from '../common/metrics.service';

function makeMailer() {
  return { sendAlertEmail: vi.fn().mockResolvedValue(undefined) };
}

function makeNotifications() {
  return { shouldNotify: vi.fn().mockResolvedValue(true) };
}

function makeMetrics() {
  return { inc: vi.fn() } as unknown as MetricsService;
}

function makeChannel(id = 'chan-1', userId = 'user-1') {
  return {
    id,
    userId,
    name: 'Test Channel',
    type: 'webhook',
    configJson: { url: 'https://hooks.example.com/test' },
    createdAt: new Date(),
    alertGrouping: false,
    groupWindowSec: 300,
    groupByFolder: true,
    groupByTag: false,
    messageTemplate: null,
    scheduleJson: null,
    _count: { alertDeliveryLogs: 0 },
  };
}

function makeLog(id: string, status: 'success' | 'failed', offsetMs = 0) {
  return {
    id,
    alertChannelId: 'chan-1',
    status,
    createdAt: new Date(Date.now() - offsetMs),
    errorMessage: status === 'failed' ? 'Connection refused' : null,
    monitorName: 'My Monitor',
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    alertChannel: {
      findFirst: vi.fn().mockResolvedValue(makeChannel()),
      ...((overrides.alertChannel as object | undefined) ?? {}),
    },
    alertDeliveryLog: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      ...((overrides.alertDeliveryLog as object | undefined) ?? {}),
    },
    ...overrides,
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const service = new AlertsService(
    prisma as never,
    makeMetrics(),
    makeMailer() as never,
    makeNotifications() as never,
  );
  return { service, prisma };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AlertsService.deliveryStats', () => {
  it('returns 100% success rate when no deliveries', async () => {
    const { service, prisma } = makeService();

    // All counts return 0, findMany returns []
    prisma.alertDeliveryLog.count = vi.fn().mockResolvedValue(0);
    prisma.alertDeliveryLog.findMany = vi.fn().mockResolvedValue([]);

    const stats = await service.deliveryStats('user-1', 'chan-1');

    expect(stats.totalDeliveries).toBe(0);
    expect(stats.successCount).toBe(0);
    expect(stats.failureCount).toBe(0);
    expect(stats.successRate).toBe(100);
    expect(stats.lastDeliveryAt).toBeNull();
    expect(stats.lastSuccessAt).toBeNull();
    expect(stats.lastFailureAt).toBeNull();
    expect(stats.recentLogs).toHaveLength(0);
  });

  it('calculates success rate correctly (3/4 = 75%)', async () => {
    const { service, prisma } = makeService();

    // Simulate: 4 total, 3 success, 1 failure
    prisma.alertDeliveryLog.count = vi.fn()
      .mockResolvedValueOnce(4)   // totalDeliveries
      .mockResolvedValueOnce(3)   // successCount
      .mockResolvedValueOnce(1);  // failureCount

    const recentLogs = [
      makeLog('log-1', 'success', 1000),
      makeLog('log-2', 'success', 2000),
      makeLog('log-3', 'failed', 3000),
      makeLog('log-4', 'success', 4000),
    ];
    prisma.alertDeliveryLog.findMany = vi.fn().mockResolvedValue(recentLogs);

    const stats = await service.deliveryStats('user-1', 'chan-1');

    expect(stats.totalDeliveries).toBe(4);
    expect(stats.successCount).toBe(3);
    expect(stats.failureCount).toBe(1);
    expect(stats.successRate).toBe(75);
  });

  it('throws NotFoundException when channel not found or owned by different user', async () => {
    const { service, prisma } = makeService();

    prisma.alertChannel.findFirst = vi.fn().mockResolvedValue(null);

    await expect(service.deliveryStats('user-2', 'chan-1')).rejects.toThrow(NotFoundException);
    await expect(service.deliveryStats('user-2', 'chan-1')).rejects.toThrow('Alert channel not found');
  });

  it('returns correct last24hSuccess and last24hFailure counts', async () => {
    const { service, prisma } = makeService();

    prisma.alertDeliveryLog.count = vi.fn().mockResolvedValue(0);

    // findMany first call = last24h window, second = recentLogs (ordered desc, take 10)
    const last24hLogs = [
      { status: 'success' },
      { status: 'success' },
      { status: 'failed' },
    ];
    const recentLogs: ReturnType<typeof makeLog>[] = [];

    prisma.alertDeliveryLog.findMany = vi.fn()
      .mockResolvedValueOnce(last24hLogs)  // 24h query
      .mockResolvedValueOnce(recentLogs);  // recent 10 query

    const stats = await service.deliveryStats('user-1', 'chan-1');

    expect(stats.last24hSuccess).toBe(2);
    expect(stats.last24hFailure).toBe(1);
  });

  it('recentLogs is limited to 10 entries', async () => {
    const { service, prisma } = makeService();

    prisma.alertDeliveryLog.count = vi.fn().mockResolvedValue(20);

    const tenLogs = Array.from({ length: 10 }, (_, i) =>
      makeLog(`log-${i}`, i % 2 === 0 ? 'success' : 'failed', i * 1000),
    );

    // findMany: first call = 24h logs, second = recent 10
    prisma.alertDeliveryLog.findMany = vi.fn()
      .mockResolvedValueOnce([])   // 24h query
      .mockResolvedValueOnce(tenLogs);  // recent 10

    const stats = await service.deliveryStats('user-1', 'chan-1');

    expect(stats.recentLogs).toHaveLength(10);
    expect(stats.recentLogs[0].id).toBe('log-0');
    expect(stats.recentLogs[0].success).toBe(true);
    expect(stats.recentLogs[1].success).toBe(false);
  });
});
