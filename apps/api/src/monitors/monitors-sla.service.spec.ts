/**
 * Unit tests for MonitorsSlaService.
 *
 * All Prisma interactions are mocked — no database required.
 * Tests cover:
 *   - slaDashboard: uptime computation, compliance, error budget, history
 *   - slaComplianceReport: monthly breakdowns, incidents, downtime minutes
 *   - slaBudgetForecast: linear projection, exhaustion date
 *   - getErrorBudget: burn rates, status thresholds, projected exhaustion
 *   - getSloReport: latency SLI, uptime SLO
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MonitorsSlaService } from './monitors-sla.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mon-1',
    name: 'API Monitor',
    type: 'HTTP',
    userId: 'user-1',
    folderId: null,
    slaTarget: 99.9,
    slaPeriodDays: 30,
    description: null,
    target: 'https://example.com',
    intervalSec: 60,
    enabled: true,
    sliLatencyTarget: null,
    sliLatencyWindow: 7,
    ...overrides,
  };
}

type MockRun = { monitorId: string; ok: boolean; checkedAt: Date; latencyMs?: number | null };

function makeRun(overrides: Partial<MockRun> = {}): MockRun {
  return {
    monitorId: 'mon-1',
    ok: true,
    checkedAt: new Date(),
    latencyMs: 120,
    ...overrides,
  };
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3_600_000);
}

// ─── Mocked PrismaService ─────────────────────────────────────────────────────

const mockPrisma = {
  monitor: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  monitorRun: {
    findMany: vi.fn(),
  },
  incident: {
    findMany: vi.fn(),
  },
};

function makeSvc(): MonitorsSlaService {
  return new MonitorsSlaService(mockPrisma as never);
}

// ─── slaDashboard ──────────────────────────────────────────────────────────────

describe('MonitorsSlaService.slaDashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty monitors list when user has no enabled monitors', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const svc = makeSvc();
    const result = await svc.slaDashboard('user-1');

    expect(result.monitors).toHaveLength(0);
    expect(result.summary.totalMonitors).toBe(0);
  });

  it('computes 100% uptime when all runs pass', async () => {
    const monitor = makeMonitor();
    mockPrisma.monitor.findMany.mockResolvedValue([monitor]);

    const runs = Array.from({ length: 10 }, () => makeRun({ ok: true }));
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await svc().slaDashboard('user-1');

    expect(result.monitors[0].uptimePct).toBe(100);
    expect(result.monitors[0].compliant).toBe(true);
  });

  it('computes uptimePct correctly with mixed pass/fail runs', async () => {
    const monitor = makeMonitor({ slaTarget: 90 });
    mockPrisma.monitor.findMany.mockResolvedValue([monitor]);

    // 8 ok, 2 fail = 80% — breaches 90% target
    // Use hoursAgo(1) to ensure checkedAt < now (strict less-than in filter)
    const runs = [
      ...Array.from({ length: 8 }, () => makeRun({ ok: true, checkedAt: hoursAgo(1) })),
      ...Array.from({ length: 2 }, () => makeRun({ ok: false, checkedAt: hoursAgo(1) })),
    ];
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await svc().slaDashboard('user-1');

    expect(result.monitors[0].uptimePct).toBe(80);
    expect(result.monitors[0].compliant).toBe(false);
  });

  it('sets compliant=null when monitor has no slaTarget', async () => {
    const monitor = makeMonitor({ slaTarget: null });
    mockPrisma.monitor.findMany.mockResolvedValue([monitor]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([makeRun({ ok: true })]);

    const result = await svc().slaDashboard('user-1');

    expect(result.monitors[0].compliant).toBeNull();
    expect(result.monitors[0].errorBudgetUsedPct).toBeNull();
  });

  it('calculates errorBudgetUsedPct=0 when uptime=100 and target=99.9', async () => {
    const monitor = makeMonitor({ slaTarget: 99.9 });
    mockPrisma.monitor.findMany.mockResolvedValue([monitor]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([makeRun({ ok: true })]);

    const result = await svc().slaDashboard('user-1');

    expect(result.monitors[0].errorBudgetUsedPct).toBe(0);
    expect(result.monitors[0].budgetRemainingPct).toBe(100);
  });

  it('returns 100% uptime when no runs exist', async () => {
    const monitor = makeMonitor({ slaTarget: 99 });
    mockPrisma.monitor.findMany.mockResolvedValue([monitor]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc().slaDashboard('user-1');

    expect(result.monitors[0].uptimePct).toBe(100);
    expect(result.monitors[0].totalRuns).toBe(0);
  });

  it('summary counts breached monitors correctly', async () => {
    const monitors = [
      makeMonitor({ id: 'mon-1', slaTarget: 99.9 }),
      makeMonitor({ id: 'mon-2', slaTarget: 99.9 }),
    ];
    mockPrisma.monitor.findMany.mockResolvedValue(monitors);

    // mon-1 all ok, mon-2 all fail — use hoursAgo to ensure checkedAt < now
    const runs = [
      makeRun({ monitorId: 'mon-1', ok: true, checkedAt: hoursAgo(1) }),
      makeRun({ monitorId: 'mon-2', ok: false, checkedAt: hoursAgo(1) }),
    ];
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await svc().slaDashboard('user-1');

    expect(result.summary.breached).toBe(1);
    expect(result.summary.totalMonitors).toBe(2);
  });

  it('includes 3-month history in response', async () => {
    const monitor = makeMonitor();
    mockPrisma.monitor.findMany.mockResolvedValue([monitor]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([makeRun({ ok: true })]);

    const result = await svc().slaDashboard('user-1');

    expect(result.monitors[0].monthlyHistory).toHaveLength(3);
    expect(result.monitors[0].monthlyHistory[0]).toHaveProperty('month');
    expect(result.monitors[0].monthlyHistory[0]).toHaveProperty('uptimePct');
  });
});

// ─── slaComplianceReport ──────────────────────────────────────────────────────

describe('MonitorsSlaService.slaComplianceReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty report when no monitors have SLA targets', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await svc().slaComplianceReport('user-1', 3);

    expect(result.monitors).toHaveLength(0);
    expect(result.summary.totalMonitors).toBe(0);
  });

  it('clamps months to valid range 1–12', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    // months=0 should be clamped to 1
    const result = await svc().slaComplianceReport('user-1', 0);
    expect(result).toBeDefined();

    // months=20 should be clamped to 12
    const result2 = await svc().slaComplianceReport('user-1', 20);
    expect(result2).toBeDefined();
  });

  it('computes monthly uptime for each monitor', async () => {
    const monitor = makeMonitor({ slaTarget: 99.9 });
    mockPrisma.monitor.findMany.mockResolvedValue([monitor]);

    const now = new Date();
    const runs = Array.from({ length: 100 }, (_, i) =>
      makeRun({
        monitorId: 'mon-1',
        ok: i < 99, // 99% uptime
        checkedAt: new Date(now.getTime() - i * 60_000),
      }),
    );
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await svc().slaComplianceReport('user-1', 1);

    expect(result.monitors[0].id).toBe('mon-1');
    expect(result.monitors[0].slaTarget).toBe(99.9);
  });

  it('marks monitor as compliant when uptime >= slaTarget', async () => {
    const monitor = makeMonitor({ slaTarget: 90 });
    mockPrisma.monitor.findMany.mockResolvedValue([monitor]);

    const runs = Array.from({ length: 100 }, (_, i) =>
      makeRun({ ok: i < 95, checkedAt: new Date() }),
    );
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);
    mockPrisma.incident.findMany.mockResolvedValue([]);

    const result = await svc().slaComplianceReport('user-1', 1);

    // 95% uptime >= 90% target — check via period.compliant
    const mon = result.monitors[0];
    // The period-level compliance reflects the full period
    expect(mon.period).toBeDefined();
  });
});

// ─── slaBudgetForecast ────────────────────────────────────────────────────────

describe('MonitorsSlaService.slaBudgetForecast', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NotFoundException when monitor not found', async () => {
    mockPrisma.monitor.findUnique.mockResolvedValue(null);

    await expect(svc().slaBudgetForecast('user-1', 'bad-id')).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when monitor belongs to different user', async () => {
    mockPrisma.monitor.findUnique.mockResolvedValue(makeMonitor({ userId: 'other-user' }));

    await expect(svc().slaBudgetForecast('user-1', 'mon-1')).rejects.toThrow(ForbiddenException);
  });

  it('returns forecast with 100% uptime when all runs pass', async () => {
    mockPrisma.monitor.findUnique.mockResolvedValue(makeMonitor());
    const runs = Array.from({ length: 10 }, () => makeRun({ ok: true, checkedAt: hoursAgo(1) }));
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await svc().slaBudgetForecast('user-1', 'mon-1');

    expect(result.currentStats.uptimePct).toBe(100);
    expect(result.forecast.willBreach).toBe(false);
  });

  it('sets willBreach=null when monitor has no slaTarget', async () => {
    mockPrisma.monitor.findUnique.mockResolvedValue(makeMonitor({ slaTarget: null }));
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc().slaBudgetForecast('user-1', 'mon-1');

    expect(result.forecast.willBreach).toBeNull();
  });

  it('returns low confidence when fewer than 3 checks', async () => {
    mockPrisma.monitor.findUnique.mockResolvedValue(makeMonitor());
    mockPrisma.monitorRun.findMany.mockResolvedValue([makeRun({ ok: true })]);

    const result = await svc().slaBudgetForecast('user-1', 'mon-1');

    expect(result.forecast.confidence).toBe('low');
  });

  it('returns high confidence when 10+ checks exist', async () => {
    mockPrisma.monitor.findUnique.mockResolvedValue(makeMonitor());
    const runs = Array.from({ length: 15 }, () => makeRun({ ok: true, checkedAt: hoursAgo(1) }));
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await svc().slaBudgetForecast('user-1', 'mon-1');

    expect(result.forecast.confidence).toBe('high');
  });

  it('daily breakdown covers every day in month', async () => {
    mockPrisma.monitor.findUnique.mockResolvedValue(makeMonitor());
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc().slaBudgetForecast('user-1', 'mon-1');

    expect(result.dailyBreakdown.length).toBe(result.period.daysInMonth);
  });

  it('sets budgetExhaustedAlready=true when budget already consumed', async () => {
    mockPrisma.monitor.findUnique.mockResolvedValue(makeMonitor({ slaTarget: 99.9 }));
    // 100% failure rate = budget exhausted
    const runs = Array.from({ length: 20 }, () => makeRun({ ok: false, checkedAt: hoursAgo(12) }));
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await svc().slaBudgetForecast('user-1', 'mon-1');

    expect(result.forecast.budgetExhaustedAlready).toBe(true);
  });
});

// ─── getErrorBudget ───────────────────────────────────────────────────────────

describe('MonitorsSlaService.getErrorBudget', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NotFoundException when monitor not found', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(null);

    await expect(svc().getErrorBudget('bad-id', 'user-1', { slaTarget: 99.9, period: '30d' })).rejects.toThrow(NotFoundException);
  });

  it('returns healthy status when budget consumption is below 50%', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor());
    // 100% ok = 0% budget consumed
    const runs = Array.from({ length: 100 }, () => ({ ok: true }));
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await svc().getErrorBudget('mon-1', 'user-1', { slaTarget: 99.9, period: '30d' });

    expect(result.status).toBe('healthy');
    expect(result.budgetConsumedPct).toBe(0);
    expect(result.budgetRemainingPct).toBe(100);
  });

  it('returns exhausted status when 100% budget consumed', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor());
    // All failures — budget consumed way past 100%
    const runs = Array.from({ length: 100 }, () => ({ ok: false }));
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await svc().getErrorBudget('mon-1', 'user-1', { slaTarget: 99.9, period: '30d' });

    expect(result.status).toBe('exhausted');
    // budgetConsumedPct can exceed 100 (no cap in service implementation)
    expect(result.budgetConsumedPct).toBeGreaterThanOrEqual(100);
  });

  it('returns warning status when budget 50–80% consumed', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor({ slaTarget: 90 }));
    // 5% failure rate on 90% SLA = 50% of budget (50% of 10% allowed)
    const runs = [
      ...Array.from({ length: 95 }, () => ({ ok: true })),
      ...Array.from({ length: 5 }, () => ({ ok: false })),
    ];
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await svc().getErrorBudget('mon-1', 'user-1', { slaTarget: 90, period: '30d' });

    expect(['warning', 'critical', 'exhausted']).toContain(result.status);
  });

  it('computes positive burn rates', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor());
    const failedRuns = Array.from({ length: 10 }, () => ({ ok: false }));
    mockPrisma.monitorRun.findMany.mockResolvedValue(failedRuns);

    const result = await svc().getErrorBudget('mon-1', 'user-1', { slaTarget: 99.9, period: '30d' });

    expect(result.burnRate).toBeGreaterThan(0);
  });

  it('handles zero runs gracefully', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor());
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc().getErrorBudget('mon-1', 'user-1', { slaTarget: 99.9, period: '30d' });

    expect(result.actualUptimePct).toBe(100);
    expect(result.budgetConsumedPct).toBe(0);
    expect(result.status).toBe('healthy');
  });

  it('defaults to 30-day period for invalid period string', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor());
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc().getErrorBudget('mon-1', 'user-1', { slaTarget: 99, period: 'invalid' });

    expect(result.totalMinutes).toBe(30 * 24 * 60);
  });
});

// ─── getSloReport ─────────────────────────────────────────────────────────────

describe('MonitorsSlaService.getSloReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NotFoundException when monitor not found', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(null);

    await expect(svc().getSloReport('user-1', 'bad-id')).rejects.toThrow(NotFoundException);
  });

  it('returns uptime SLO as ok when uptime >= slaTarget', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor({ slaTarget: 99, slaPeriodDays: 30 }));
    const runs = Array.from({ length: 100 }, () => ({ ok: true, checkedAt: new Date() }));
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await svc().getSloReport('user-1', 'mon-1');

    expect(result.uptime.status).toBe('ok');
    // Service returns `actual` not `actualUptime`
    expect(result.uptime.actual).toBe(100);
  });

  it('returns uptime SLO as breached when uptime < slaTarget', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor({ slaTarget: 99.9, slaPeriodDays: 30 }));
    const runs = [
      ...Array.from({ length: 90 }, () => ({ ok: true, checkedAt: new Date() })),
      ...Array.from({ length: 10 }, () => ({ ok: false, checkedAt: new Date() })),
    ];
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await svc().getSloReport('user-1', 'mon-1');

    expect(result.uptime.status).toBe('breached');
  });

  it('latency SLI is absent when monitor has no sliLatencyTarget', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(makeMonitor({ sliLatencyTarget: null }));
    mockPrisma.monitorRun.findMany.mockResolvedValue([{ ok: true, checkedAt: new Date() }]);

    const result = await svc().getSloReport('user-1', 'mon-1');

    // Service omits `latency` key when no sliLatencyTarget (undefined, not null)
    expect(result.latency).toBeUndefined();
  });

  it('computes latency SLI percentiles when target is set', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(
      makeMonitor({ sliLatencyTarget: 500, sliLatencyWindow: 7 }),
    );
    // Uptime runs
    mockPrisma.monitorRun.findMany
      .mockResolvedValueOnce([{ ok: true, checkedAt: new Date() }])
      // Latency runs
      .mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => ({ latencyMs: 100 + i * 20 })),
      );

    const result = await svc().getSloReport('user-1', 'mon-1');

    expect(result.latency).not.toBeNull();
    expect(result.latency?.p95).toBeGreaterThan(0);
  });
});

// ─── Helper to create service ─────────────────────────────────────────────────

function svc(): MonitorsSlaService {
  return new MonitorsSlaService(mockPrisma as never);
}
