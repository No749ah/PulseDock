import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlertsService } from './alerts.service';
import type { PrismaService } from '../common/prisma.service';
import type { MailerService } from '../common/mailer.service';
import type { MetricsService } from '../common/metrics.service';
import type { RealtimeEvents } from '../realtime/realtime.events';
import type { NotificationsService } from '../notifications/notifications.service';

type MockPrisma = {
  alertDeliveryLog: { create: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  monitor: {
    findMany: ReturnType<typeof vi.fn>;
  };
  alertChannel: { findMany: ReturnType<typeof vi.fn> };
  monitorAlert: { findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  alertGroup: { findMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
};

function makePrisma(): MockPrisma {
  return {
    alertDeliveryLog: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    monitor: { findMany: vi.fn() },
    alertChannel: { findMany: vi.fn() },
    monitorAlert: { findMany: vi.fn(), updateMany: vi.fn() },
    alertGroup: { findMany: vi.fn(), deleteMany: vi.fn() },
  } as unknown as MockPrisma;
}

function makeService(prisma: MockPrisma) {
  return new AlertsService(
    prisma as unknown as PrismaService,
    {} as MetricsService,
    {} as MailerService,
    {} as NotificationsService,
    {} as RealtimeEvents,
  );
}

describe('AlertsService.noiseAnalysis', () => {
  let prisma: MockPrisma;
  let service: AlertsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('returns empty summary when no delivery logs exist', async () => {
    (prisma.alertDeliveryLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await service.noiseAnalysis('user-1', 7);
    expect(result.summary.totalAlerts).toBe(0);
    expect(result.summary.uniqueMonitors).toBe(0);
    expect(result.monitors).toHaveLength(0);
    expect(result.periodDays).toBe(7);
  });

  it('classifies a monitor with >10 alerts/day as high noise', async () => {
    const now = Date.now();
    const logs = Array.from({ length: 80 }, (_, i) => ({
      id: `log-${i}`,
      monitorId: 'mon-1',
      monitorName: 'API Gateway',
      status: 'success',
      createdAt: new Date(now - i * 60_000),
    }));

    (prisma.alertDeliveryLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(logs);
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'mon-1', name: 'API Gateway', type: 'HTTP', confirmations: 1, flapDetectionEnabled: false, intervalSec: 30, retryCount: 0 },
    ]);

    const result = await service.noiseAnalysis('user-1', 7);
    expect(result.monitors[0].noiseScore).toBe('high');
    expect(result.monitors[0].totalAlerts).toBe(80);
    expect(result.summary.noisyMonitors).toBe(1);
  });

  it('marks monitors with >20 alerts/day as critical noise', async () => {
    const now = Date.now();
    const logs = Array.from({ length: 200 }, (_, i) => ({
      id: `log-${i}`,
      monitorId: 'mon-crit',
      monitorName: 'Flappy DB',
      status: 'success',
      createdAt: new Date(now - i * 60_000),
    }));

    (prisma.alertDeliveryLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(logs);
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'mon-crit', name: 'Flappy DB', type: 'TCP', confirmations: 1, flapDetectionEnabled: false, intervalSec: 30, retryCount: 0 },
    ]);

    const result = await service.noiseAnalysis('user-1', 7);
    expect(result.monitors[0].noiseScore).toBe('critical');
  });

  it('assigns low noise score when alerts/day <= 3', async () => {
    const now = Date.now();
    const logs = Array.from({ length: 5 }, (_, i) => ({
      id: `log-${i}`,
      monitorId: 'mon-quiet',
      monitorName: 'Homepage',
      status: 'success',
      createdAt: new Date(now - i * 3_600_000),
    }));

    (prisma.alertDeliveryLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(logs);
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'mon-quiet', name: 'Homepage', type: 'HTTP', confirmations: 2, flapDetectionEnabled: true, intervalSec: 300, retryCount: 1 },
    ]);

    const result = await service.noiseAnalysis('user-1', 7);
    expect(result.monitors[0].noiseScore).toBe('low');
  });

  it('includes recommendation to enable flap detection when noisy', async () => {
    const now = Date.now();
    const logs = Array.from({ length: 50 }, (_, i) => ({
      id: `log-${i}`,
      monitorId: 'mon-flap',
      monitorName: 'Unstable API',
      status: 'success',
      createdAt: new Date(now - i * 60_000),
    }));

    (prisma.alertDeliveryLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(logs);
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'mon-flap', name: 'Unstable API', type: 'HTTP', confirmations: 1, flapDetectionEnabled: false, intervalSec: 60, retryCount: 0 },
    ]);

    const result = await service.noiseAnalysis('user-1', 7);
    const recs = result.monitors[0].recommendations;
    expect(recs.some((r) => r.toLowerCase().includes('flap'))).toBe(true);
  });

  it('skips logs with null monitorId', async () => {
    (prisma.alertDeliveryLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'log-1', monitorId: null, monitorName: null, status: 'success', createdAt: new Date() },
    ]);
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await service.noiseAnalysis('user-1', 7);
    expect(result.summary.uniqueMonitors).toBe(0);
    expect(result.monitors).toHaveLength(0);
  });

  it('clamps periodDays to 30 max', async () => {
    (prisma.alertDeliveryLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await service.noiseAnalysis('user-1', 999);
    expect(result.periodDays).toBe(30);
  });

  it('sorts monitors by noise score (critical first, then high)', async () => {
    const now = Date.now();
    const logs = [
      // mon-high: 80 alerts / 7 days = ~11.4/day → high
      ...Array.from({ length: 80 }, (_, i) => ({ id: `h${i}`, monitorId: 'mon-high', monitorName: 'High', status: 'success', createdAt: new Date(now - i * 3600) })),
      // mon-crit: 200 alerts / 7 days = ~28.6/day → critical
      ...Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, monitorId: 'mon-crit', monitorName: 'Crit', status: 'success', createdAt: new Date(now - i * 1800) })),
    ];

    (prisma.alertDeliveryLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(logs);
    (prisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'mon-high', name: 'High', type: 'HTTP', confirmations: 1, flapDetectionEnabled: false, intervalSec: 60, retryCount: 0 },
      { id: 'mon-crit', name: 'Crit', type: 'HTTP', confirmations: 1, flapDetectionEnabled: false, intervalSec: 30, retryCount: 0 },
    ]);

    const result = await service.noiseAnalysis('user-1', 7);
    expect(result.monitors[0].monitorId).toBe('mon-crit');
    expect(result.monitors[0].noiseScore).toBe('critical');
    expect(result.monitors[1].monitorId).toBe('mon-high');
    expect(result.monitors[1].noiseScore).toBe('high');
  });
});
