import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsService } from './monitors.service';

function makeMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'monitor-1',
    userId: 'user-1',
    name: 'Test Monitor',
    type: 'HTTP',
    target: 'https://example.com/health',
    intervalSec: 60,
    timeoutMs: 5000,
    confirmations: 1,
    configJson: null,
    enabled: true,
    slaTarget: 99.9,
    slaPeriodDays: 30,
    sliLatencyTarget: null,
    sliLatencyWindow: 7,
    slaBreachAlertedAt: null,
    slaBurnRateAlertedAt: null,
    folderId: null,
    description: null,
    runbookUrl: null,
    autoIncident: false,
    autoIncidentSeverity: 'MEDIUM',
    activeAutoIncidentId: null,
    isFlapping: false,
    flapDetectionEnabled: true,
    flapAlertedAt: null,
    mutedUntil: null,
    anomalyDetection: false,
    anomalyMultiplier: 2.0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    monitorAlerts: [],
    monitorTags: [],
    ...overrides,
  };
}

function makeRuns(total: number, failedCount: number) {
  return Array.from({ length: total }, (_, i) => ({
    ok: i >= failedCount,
    checkedAt: new Date(Date.now() - i * 60_000),
    latencyMs: null,
  }));
}

function makeLatencyRuns(latencies: number[]) {
  return latencies.map((l) => ({ latencyMs: l }));
}

function makePrisma(monitor: ReturnType<typeof makeMonitor> | null = makeMonitor()) {
  return {
    monitor: {
      findMany: vi.fn().mockResolvedValue(monitor ? [monitor] : []),
      findFirst: vi.fn().mockResolvedValue(monitor),
      create: vi.fn().mockResolvedValue(monitor),
      update: vi.fn().mockResolvedValue(monitor),
      delete: vi.fn().mockResolvedValue(monitor),
      count: vi.fn().mockResolvedValue(0),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    monitorAlert: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn(), update: vi.fn() },
    monitorTag: { deleteMany: vi.fn(), create: vi.fn() },
    tag: { upsert: vi.fn().mockResolvedValue({ id: 'tag-1', name: 'v8', color: '#6366f1' }) },
    alertChannel: { findFirst: vi.fn().mockResolvedValue(null) },
    maintenanceWindow: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), delete: vi.fn() },
    monitorEvent: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), delete: vi.fn() },
    monitorRunRollup: { findMany: vi.fn().mockResolvedValue([]) },
    alertAcknowledgement: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new MonitorsService(
    prisma as any,
    { run: vi.fn(), runMonitor: vi.fn(), listPlugins: vi.fn().mockReturnValue([]) } as any,
    { fire: vi.fn() } as any,
    { monitorCreated: vi.fn(), monitorUpdated: vi.fn(), monitorDeleted: vi.fn() } as any,
    { log: vi.fn() } as any,
    { checkLimit: vi.fn().mockResolvedValue({ allowed: true }) } as any,
  );
}

describe('MonitorsService - getSloReport', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: MonitorsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('throws NotFoundException for unknown monitor', async () => {
    prisma.monitor.findFirst.mockResolvedValue(null);
    await expect(service.getSloReport('user-1', 'no-such-id')).rejects.toThrow(NotFoundException);
  });

  it('returns correct uptime% from MonitorRun data', async () => {
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor());
    prisma.monitorRun.findMany.mockResolvedValue(makeRuns(100, 1));

    const report = await service.getSloReport('user-1', 'monitor-1');
    expect(report.uptime.totalChecks).toBe(100);
    expect(report.uptime.failedChecks).toBe(1);
    expect(report.uptime.actual).toBeCloseTo(99, 0);
  });

  it('status is "breached" when uptime < slaTarget', async () => {
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ slaTarget: 99.9 }));
    // 1000 runs, 5 failed → 99.5% actual < 99.9% target
    prisma.monitorRun.findMany.mockResolvedValue(makeRuns(1000, 5));

    const report = await service.getSloReport('user-1', 'monitor-1');
    expect(report.uptime.status).toBe('breached');
  });

  it('status is "ok" when uptime >= slaTarget', async () => {
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ slaTarget: 99.0 }));
    // 1000 runs, 1 failed → 99.9% actual > 99.0% target
    prisma.monitorRun.findMany.mockResolvedValue(makeRuns(1000, 1));

    const report = await service.getSloReport('user-1', 'monitor-1');
    expect(report.uptime.status).toBe('ok');
  });

  it('computes p95 latency correctly', async () => {
    const latencies = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100ms
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ sliLatencyTarget: 500 }));
    prisma.monitorRun.findMany
      .mockResolvedValueOnce(makeRuns(100, 0)) // uptime query
      .mockResolvedValueOnce(makeLatencyRuns(latencies)); // latency query

    const report = await service.getSloReport('user-1', 'monitor-1');
    expect(report.latency).toBeDefined();
    expect(report.latency!.p95).toBe(95);
  });

  it('latency status is "ok" when p95 < sliLatencyTarget', async () => {
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ sliLatencyTarget: 500 }));
    const latencies = Array.from({ length: 100 }, (_, i) => i + 1); // max 100ms
    prisma.monitorRun.findMany
      .mockResolvedValueOnce(makeRuns(100, 0))
      .mockResolvedValueOnce(makeLatencyRuns(latencies));

    const report = await service.getSloReport('user-1', 'monitor-1');
    expect(report.latency!.status).toBe('ok');
  });

  it('latency status is "breached" when p95 >= sliLatencyTarget', async () => {
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ sliLatencyTarget: 80 })); // target: 80ms
    const latencies = Array.from({ length: 100 }, (_, i) => i + 1); // p95 = 95ms > 80ms
    prisma.monitorRun.findMany
      .mockResolvedValueOnce(makeRuns(100, 0))
      .mockResolvedValueOnce(makeLatencyRuns(latencies));

    const report = await service.getSloReport('user-1', 'monitor-1');
    expect(report.latency!.status).toBe('breached');
  });

  it('overallHealth is "ok" when both SLOs are met', async () => {
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ slaTarget: 99.0, sliLatencyTarget: 500 }));
    const latencies = Array.from({ length: 100 }, (_, i) => i + 1); // p95 = 95ms well under 500
    prisma.monitorRun.findMany
      .mockResolvedValueOnce(makeRuns(1000, 1)) // 99.9% uptime > 99.0% target
      .mockResolvedValueOnce(makeLatencyRuns(latencies));

    const report = await service.getSloReport('user-1', 'monitor-1');
    expect(report.errorBudget.overallHealth).toBe('ok');
  });

  it('overallHealth is "breached" when uptime SLO is breached', async () => {
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ slaTarget: 99.9 }));
    // 1000 runs, 5 failed → 99.5% < 99.9% target
    prisma.monitorRun.findMany.mockResolvedValue(makeRuns(1000, 5));

    const report = await service.getSloReport('user-1', 'monitor-1');
    expect(report.errorBudget.overallHealth).toBe('breached');
  });

  it('returns period info with correct days and ISO timestamps', async () => {
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ slaPeriodDays: 7 }));
    prisma.monitorRun.findMany.mockResolvedValue(makeRuns(100, 0));

    const report = await service.getSloReport('user-1', 'monitor-1');
    expect(report.period.days).toBe(7);
    expect(typeof report.period.from).toBe('string');
    expect(typeof report.period.to).toBe('string');
    expect(new Date(report.period.from).getTime()).toBeGreaterThan(0);
  });

  it('does not include latency field when sliLatencyTarget is null', async () => {
    prisma.monitor.findFirst.mockResolvedValue(makeMonitor({ sliLatencyTarget: null }));
    prisma.monitorRun.findMany.mockResolvedValue(makeRuns(100, 0));

    const report = await service.getSloReport('user-1', 'monitor-1');
    expect(report.latency).toBeUndefined();
  });
});
