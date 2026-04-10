/**
 * Unit tests for MonitorsService.slaBudgetForecast()
 *
 * Tests the SLA error budget forecast endpoint that predicts whether a monitor
 * will breach its SLA target by month end, based on the current month's observed
 * uptime rate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MonitorsSlaService } from './monitors-sla.service';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { VersionDetectionService } from './version-detection.service';
import { MonitorsService } from './monitors.service';

// ── Helper: build a minimal Prisma mock ───────────────────────────────────────

function buildPrismaMock(opts: {
  monitor?: object | null;
  runs?: Array<{ ok: boolean; checkedAt: Date }>;
}) {
  return {
    monitor: {
      findUnique: vi.fn().mockResolvedValue(opts.monitor ?? null),
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

async function buildService(prisma: object): Promise<MonitorsSlaService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MonitorsSlaService,
      { provide: PrismaService, useValue: prisma },
      { provide: ChecksService, useValue: {} },
      { provide: AuditService, useValue: { log: vi.fn() } },
      { provide: RealtimeEvents, useValue: {} },
      { provide: VersionDetectionService, useValue: {} },
    ],
  }).compile();
  return module.get(MonitorsSlaService);
}

const USER_ID = 'user-1';
const MONITOR_ID = 'mon-1';

describe('MonitorsService.slaBudgetForecast()', () => {
  // ── Test 1: Monitor not found ──────────────────────────────────────────────
  it('throws NotFoundException when monitor does not exist', async () => {
    const prisma = buildPrismaMock({ monitor: null });
    const svc = await buildService(prisma);

    await expect(svc.slaBudgetForecast(USER_ID, MONITOR_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── Test 2: Access denied for other user ──────────────────────────────────
  it('throws ForbiddenException when monitor belongs to another user', async () => {
    const prisma = buildPrismaMock({
      monitor: { id: MONITOR_ID, name: 'Test', userId: 'other-user', slaTarget: 99.9, intervalSec: 60 },
    });
    const svc = await buildService(prisma);

    await expect(svc.slaBudgetForecast(USER_ID, MONITOR_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ── Test 3: No SLA target — returns null for SLA fields ──────────────────
  it('returns null sla/budget fields when no slaTarget is set', async () => {
    const now = new Date();
    const runs = [
      { ok: true, checkedAt: new Date(now.getTime() - 3600000) },
      { ok: true, checkedAt: new Date(now.getTime() - 7200000) },
    ];
    const prisma = buildPrismaMock({
      monitor: { id: MONITOR_ID, name: 'Test', userId: USER_ID, slaTarget: null, intervalSec: 60 },
      runs,
    });
    const svc = await buildService(prisma);

    const result = await svc.slaBudgetForecast(USER_ID, MONITOR_ID);

    expect(result.slaTarget).toBeNull();
    expect(result.currentStats.errorBudgetUsedPct).toBeNull();
    expect(result.forecast.willBreach).toBeNull();
    expect(result.forecast.budgetExhaustionDate).toBeNull();
  });

  // ── Test 4: Perfect uptime — will not breach ──────────────────────────────
  it('predicts no breach when uptime is 100%', async () => {
    const now = new Date();
    // 10 successful checks in past hour
    const runs = Array.from({ length: 10 }, (_, i) => ({
      ok: true,
      checkedAt: new Date(now.getTime() - (i + 1) * 360000),
    }));
    const prisma = buildPrismaMock({
      monitor: { id: MONITOR_ID, name: 'Test', userId: USER_ID, slaTarget: 99.9, intervalSec: 60 },
      runs,
    });
    const svc = await buildService(prisma);

    const result = await svc.slaBudgetForecast(USER_ID, MONITOR_ID);

    expect(result.currentStats.uptimePct).toBe(100);
    expect(result.forecast.willBreach).toBe(false);
    expect(result.forecast.projectedUptimePct).toBeGreaterThanOrEqual(99.9);
    expect(result.forecast.budgetExhaustionDate).toBeNull();
  });

  // ── Test 5: High failure rate — will breach and budget exhaustion predicted ──
  it('predicts breach and budget exhaustion when failure rate is high', async () => {
    const now = new Date();
    // 50% failure rate over 20 checks — well above the 0.1% SLA tolerance at 99.9% target
    const runs = Array.from({ length: 20 }, (_, i) => ({
      ok: i % 2 === 0, // 10 ok, 10 failed
      checkedAt: new Date(now.getTime() - (i + 1) * 300000),
    }));
    const prisma = buildPrismaMock({
      monitor: { id: MONITOR_ID, name: 'Test', userId: USER_ID, slaTarget: 99.9, intervalSec: 300 },
      runs,
    });
    const svc = await buildService(prisma);

    const result = await svc.slaBudgetForecast(USER_ID, MONITOR_ID);

    expect(result.currentStats.uptimePct).toBe(50);
    expect(result.forecast.willBreach).toBe(true);
    // Budget should already be exhausted (50% failure >> 0.1% allowed)
    expect(result.forecast.budgetExhaustedAlready).toBe(true);
    expect(result.forecast.confidence).toBe('high'); // >= 10 checks
  });

  // ── Test 6: Daily breakdown contains actual and projected entries ─────────
  it('returns daily breakdown with actual and projected entries', async () => {
    const now = new Date();
    const runs = [
      { ok: true, checkedAt: new Date(now.getTime() - 3600000) },
      { ok: false, checkedAt: new Date(now.getTime() - 7200000) },
      { ok: true, checkedAt: new Date(now.getTime() - 10800000) },
    ];
    const prisma = buildPrismaMock({
      monitor: { id: MONITOR_ID, name: 'Test', userId: USER_ID, slaTarget: 99.5, intervalSec: 3600 },
      runs,
    });
    const svc = await buildService(prisma);

    const result = await svc.slaBudgetForecast(USER_ID, MONITOR_ID);

    expect(result.dailyBreakdown.length).toBeGreaterThan(0);

    const actualDays = result.dailyBreakdown.filter((d) => d.type === 'actual');
    const projectedDays = result.dailyBreakdown.filter((d) => d.type === 'projected');

    // Today must be present as 'actual'
    expect(actualDays.length).toBeGreaterThanOrEqual(1);

    // If we're not at end of month, there must be projected days
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (dayOfMonth < daysInMonth) {
      expect(projectedDays.length).toBeGreaterThan(0);
    }

    // All entries have required fields
    for (const entry of result.dailyBreakdown) {
      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('type');
      expect(entry).toHaveProperty('uptimePct');
      expect(entry).toHaveProperty('totalChecks');
      expect(entry).toHaveProperty('failedChecks');
    }
  }, 15000);
});
