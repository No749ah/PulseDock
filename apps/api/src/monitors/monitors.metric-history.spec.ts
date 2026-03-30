/**
 * Unit tests for MonitorsService.metricHistory()
 *
 * Tests metric capture history retrieval, stats computation, and filtering.
 */
import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MonitorsAnalyticsService } from './monitors-analytics.service';
import { VersionDetectionService } from './version-detection.service';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';

function buildPrismaMock(opts: {
  monitor?: object | null;
  runs?: Array<{ checkedAt: Date; capturedMetricValue: number | null; level: string }>;
}) {
  return {
    monitor: {
      findFirst: vi.fn().mockResolvedValue(opts.monitor ?? null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue(opts.runs ?? []),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    monitorDependency: { findMany: vi.fn().mockResolvedValue([]) },
    monitorAlert: { findMany: vi.fn().mockResolvedValue([]) },
    monitorTag: { findMany: vi.fn().mockResolvedValue([]) },
    incident: { count: vi.fn().mockResolvedValue(0) },
    incidentMonitor: { groupBy: vi.fn().mockResolvedValue([]) },
  };
}

async function buildService(prisma: object): Promise<MonitorsService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MonitorsAnalyticsService,
      { provide: PrismaService, useValue: prisma },
      {
        provide: ChecksService,
        useValue: { listPlugins: vi.fn().mockReturnValue([]), runCheck: vi.fn() },
      },
      { provide: AuditService, useValue: { log: vi.fn() } },
      { provide: RealtimeEvents, useValue: { emit: vi.fn() } },
      { provide: VersionDetectionService, useValue: {} },
    ],
  }).compile();
  return module.get<MonitorsAnalyticsService>(MonitorsAnalyticsService);
}

describe('MonitorsService – metricHistory', () => {

  // ── 1. Throws NotFoundException when monitor not found ──────────────────────
  it('throws NotFoundException when monitor does not exist', async () => {
    const prisma = buildPrismaMock({ monitor: null });
    const svc = await buildService(prisma);
    await expect(svc.metricHistory('user1', 'no-such-id')).rejects.toThrow(NotFoundException);
  });

  // ── 2. Returns empty points and null stats when no metric runs ──────────────
  it('returns empty points and null stats when no runs have capturedMetricValue', async () => {
    const prisma = buildPrismaMock({
      monitor: { metricPath: '$.queue.depth', metricName: 'Queue Depth', metricUnit: 'items', metricAlertMin: null, metricAlertMax: null },
      runs: [],
    });
    const svc = await buildService(prisma);
    const result = await svc.metricHistory('user1', 'm1');

    expect(result.points).toHaveLength(0);
    expect(result.stats.min).toBeNull();
    expect(result.stats.max).toBeNull();
    expect(result.stats.avg).toBeNull();
    expect(result.stats.latest).toBeNull();
    expect(result.stats.count).toBe(0);
  });

  // ── 3. Returns correct stats for multiple data points ──────────────────────
  it('computes min/max/avg/latest correctly from metric runs', async () => {
    const now = new Date();
    const runs = [
      { checkedAt: new Date(now.getTime() - 60000), capturedMetricValue: 10, level: 'green' },
      { checkedAt: new Date(now.getTime() - 120000), capturedMetricValue: 30, level: 'yellow' },
      { checkedAt: new Date(now.getTime() - 180000), capturedMetricValue: 20, level: 'green' },
    ];
    const prisma = buildPrismaMock({
      monitor: { metricPath: '$.count', metricName: 'Count', metricUnit: null, metricAlertMin: null, metricAlertMax: 25 },
      runs,
    });
    const svc = await buildService(prisma);
    const result = await svc.metricHistory('user1', 'm2');

    expect(result.points).toHaveLength(3);
    expect(result.stats.min).toBe(10);
    expect(result.stats.max).toBe(30);
    expect(result.stats.avg).toBe(20); // (10+30+20)/3
    // latest = first in array (most recent, since ordered desc)
    expect(result.stats.latest).toBe(10);
    expect(result.stats.count).toBe(3);
  });

  // ── 4. Returns monitor metric config in response ───────────────────────────
  it('returns metricPath, metricName, metricUnit, metricAlertMin, metricAlertMax from monitor config', async () => {
    const prisma = buildPrismaMock({
      monitor: {
        metricPath: '$.errors',
        metricName: 'Error Rate',
        metricUnit: '%',
        metricAlertMin: 0,
        metricAlertMax: 5,
      },
      runs: [],
    });
    const svc = await buildService(prisma);
    const result = await svc.metricHistory('user1', 'm3');

    expect(result.metricPath).toBe('$.errors');
    expect(result.metricName).toBe('Error Rate');
    expect(result.metricUnit).toBe('%');
    expect(result.metricAlertMin).toBe(0);
    expect(result.metricAlertMax).toBe(5);
  });

  // ── 5. Points have correct shape (checkedAt ISO string, value, level) ──────
  it('returns points with correct shape', async () => {
    const ts = new Date('2026-03-28T08:00:00Z');
    const runs = [
      { checkedAt: ts, capturedMetricValue: 42.5, level: 'green' },
    ];
    const prisma = buildPrismaMock({
      monitor: { metricPath: '$.latency', metricName: null, metricUnit: 'ms', metricAlertMin: null, metricAlertMax: null },
      runs,
    });
    const svc = await buildService(prisma);
    const result = await svc.metricHistory('user1', 'm4');

    expect(result.points).toHaveLength(1);
    expect(result.points[0].checkedAt).toBe(ts.toISOString());
    expect(result.points[0].value).toBe(42.5);
    expect(result.points[0].level).toBe('green');
  });
});
