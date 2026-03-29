import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../common/prisma.service';
import { MailerService } from '../common/mailer.service';
import { ScheduleModule } from '@nestjs/schedule';

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const mockPrisma = {
  scheduledReport: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  monitor: { findMany: vi.fn() },
  monitorRun: { findMany: vi.fn() },
  alertDeliveryLog: { findMany: vi.fn() },
  incident: { findMany: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn(),
};

const mockMailer = { sendUptimeReport: vi.fn() };

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMonitor(
  overrides: Partial<{
    id: string;
    name: string;
    type: string;
    intervalSec: number;
    slaTarget: number | null;
    monitorAlerts: { alertChannelId: string }[];
  }> = {},
) {
  return {
    id: overrides.id ?? 'mon-1',
    name: overrides.name ?? 'Test Monitor',
    type: overrides.type ?? 'HTTP',
    intervalSec: overrides.intervalSec ?? 60,
    slaTarget: overrides.slaTarget !== undefined ? overrides.slaTarget : 99.9,
    monitorAlerts: overrides.monitorAlerts ?? [{ alertChannelId: 'ch-1' }],
  };
}

function makeRun(monitorId: string, ok: boolean, latencyMs: number | null = null, checkedAt?: Date) {
  return {
    monitorId,
    ok,
    latencyMs,
    checkedAt: checkedAt ?? new Date(),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ReportsService — getDigest', () => {
  let service: ReportsService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailerService, useValue: mockMailer },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  // ── Test 1: Empty fleet ───────────────────────────────────────────────────

  it('returns zeros and grade A for an empty fleet', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await service.getDigest('user-empty', 7);

    expect(result.fleet.totalMonitors).toBe(0);
    expect(result.fleet.uptimeMonitors).toBe(0);
    expect(result.fleet.overallUptimePct).toBe(100);
    expect(result.fleet.overallGrade).toBe('A');
    expect(result.topPerformers).toHaveLength(0);
    expect(result.worstPerformers).toHaveLength(0);
    expect(result.checks.totalRuns).toBe(0);
    expect(result.checks.successRate).toBe(100);
    expect(result.uptimeTrend).toHaveLength(7);
    expect(result.period).toBe(7);
  });

  // ── Test 2: Correct overall uptime% ──────────────────────────────────────

  it('computes overall uptime% correctly across multiple monitors', async () => {
    const mon1 = makeMonitor({ id: 'mon-a', name: 'Alpha', type: 'HTTP' });
    const mon2 = makeMonitor({ id: 'mon-b', name: 'Beta', type: 'HTTP' });
    mockPrisma.monitor.findMany.mockResolvedValue([mon1, mon2]);

    // mon-a: 90/100 ok → 90%
    // mon-b: 50/100 ok → 50%
    // overall: (90 + 50) / 2 = 70%
    const runs: ReturnType<typeof makeRun>[] = [];
    for (let i = 0; i < 100; i++) runs.push(makeRun('mon-a', i < 90));
    for (let i = 0; i < 100; i++) runs.push(makeRun('mon-b', i < 50));

    mockPrisma.monitorRun.findMany
      .mockResolvedValueOnce(runs)   // current period
      .mockResolvedValueOnce([]);    // prior period

    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await service.getDigest('user-uptime', 7);

    expect(result.fleet.overallUptimePct).toBeCloseTo(70, 0);
    expect(result.fleet.overallGrade).toBe('F'); // 70% → F
  });

  // ── Test 3: Top performers ordered by uptime desc ─────────────────────────

  it('returns top performers ordered by uptime descending', async () => {
    // Use counts of 200 to get precise percentages without rounding collisions
    // m5: 200/200 = 100%, m1: 199/200 = 99.5%, m2: 190/200 = 95% ...
    const monIds = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
    const okCounts = [199, 190, 176, 144, 200, 100]; // out of 200

    const monitors = monIds.map((id) =>
      makeMonitor({ id, name: `Mon-${id}`, type: 'HTTP' }),
    );
    mockPrisma.monitor.findMany.mockResolvedValue(monitors);

    const runs: ReturnType<typeof makeRun>[] = [];
    monIds.forEach((id, i) => {
      for (let j = 0; j < 200; j++) runs.push(makeRun(id, j < okCounts[i]));
    });

    mockPrisma.monitorRun.findMany
      .mockResolvedValueOnce(runs)
      .mockResolvedValueOnce([]);

    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await service.getDigest('user-top', 7);

    expect(result.topPerformers).toHaveLength(5);
    // Should be sorted descending
    for (let i = 0; i < result.topPerformers.length - 1; i++) {
      expect(result.topPerformers[i].uptimePct).toBeGreaterThanOrEqual(result.topPerformers[i + 1].uptimePct);
    }
    // Top should be the 100% monitor (m5: 200/200)
    expect(result.topPerformers[0].id).toBe('m5');
  });

  // ── Test 4: Worst performers ordered by uptime asc ────────────────────────

  it('returns worst performers ordered by uptime ascending', async () => {
    const monIds = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
    const okCounts = [199, 190, 176, 144, 200, 100]; // out of 200

    const monitors = monIds.map((id) =>
      makeMonitor({ id, name: `Mon-${id}`, type: 'HTTP' }),
    );
    mockPrisma.monitor.findMany.mockResolvedValue(monitors);

    const runs: ReturnType<typeof makeRun>[] = [];
    monIds.forEach((id, i) => {
      for (let j = 0; j < 200; j++) runs.push(makeRun(id, j < okCounts[i]));
    });

    mockPrisma.monitorRun.findMany
      .mockResolvedValueOnce(runs)
      .mockResolvedValueOnce([]);

    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await service.getDigest('user-worst', 7);

    expect(result.worstPerformers).toHaveLength(5);
    // Should be sorted ascending
    for (let i = 0; i < result.worstPerformers.length - 1; i++) {
      expect(result.worstPerformers[i].uptimePct).toBeLessThanOrEqual(result.worstPerformers[i + 1].uptimePct);
    }
    // Worst should be the 50% monitor (m6: 100/200)
    expect(result.worstPerformers[0].id).toBe('m6');
  });

  // ── Test 5: mostImproved when current > prior ─────────────────────────────

  it('detects mostImproved when current period uptime > prior period uptime', async () => {
    const mon = makeMonitor({ id: 'mon-imp', name: 'Improving Monitor', type: 'HTTP' });
    mockPrisma.monitor.findMany.mockResolvedValue([mon]);

    const now = new Date();
    const periodStart = new Date(now.getTime() - 7 * 24 * 3_600_000);
    const priorStart = new Date(periodStart.getTime() - 7 * 24 * 3_600_000);

    // Current period: 80/100 = 80%
    const currentRuns = Array.from({ length: 100 }, (_, i) =>
      makeRun('mon-imp', i < 80, null, new Date(periodStart.getTime() + i * 1000)),
    );

    // Prior period: 40/100 = 40%
    const priorRuns = Array.from({ length: 100 }, (_, i) =>
      makeRun('mon-imp', i < 40, null, new Date(priorStart.getTime() + i * 1000)),
    );

    mockPrisma.monitorRun.findMany
      .mockResolvedValueOnce(currentRuns)
      .mockResolvedValueOnce(priorRuns);

    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await service.getDigest('user-imp', 7);

    expect(result.mostImproved).toHaveLength(1);
    expect(result.mostImproved[0].id).toBe('mon-imp');
    expect(result.mostImproved[0].uptimeDelta).toBeGreaterThan(0);
    expect(result.mostDegraded).toHaveLength(0);
  });

  // ── Test 6: Recommendation for monitor with no alert channels ────────────

  it('generates a high-severity recommendation for monitors with no alert channels', async () => {
    const mon = makeMonitor({ id: 'mon-noalert', name: 'Silent Monitor', monitorAlerts: [] });
    mockPrisma.monitor.findMany.mockResolvedValue([mon]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await service.getDigest('user-rec', 7);

    const highRecs = result.recommendations.filter(
      (r) => r.severity === 'high' && r.monitorId === 'mon-noalert',
    );
    expect(highRecs.length).toBeGreaterThanOrEqual(1);
    expect(highRecs[0].title).toContain('Silent Monitor');
  });

  // ── Test 7: uptimeTrend has correct number of buckets ─────────────────────

  it('uptimeTrend returns correct number of day buckets for the period', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result7 = await service.getDigest('user-trend', 7);
    expect(result7.uptimeTrend).toHaveLength(7);

    const result30 = await service.getDigest('user-trend', 30);
    expect(result30.uptimeTrend).toHaveLength(30);

    const result90 = await service.getDigest('user-trend', 90);
    expect(result90.uptimeTrend).toHaveLength(90);
  });

  // ── Test 8: period is passed through correctly ────────────────────────────

  it('includes the requested period in the response', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);
    mockPrisma.alertDeliveryLog.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await service.getDigest('user-period', 30);
    expect(result.period).toBe(30);
    expect(result.generatedAt).toBeDefined();
  });
});
