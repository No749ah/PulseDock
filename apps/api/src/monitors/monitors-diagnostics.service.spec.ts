/**
 * Unit tests for MonitorsDiagnosticsService.
 *
 * Focuses on the health-score algorithm (getHealthScore) and supporting methods.
 * All Prisma interactions are mocked — no database required.
 *
 * Formula recap (100 pts total):
 *   - Uptime  40 pts — linear from 90%→100%
 *   - Latency 20 pts — P95 trend vs prior 7d
 *   - SLA     20 pts — error budget consumption
 *   - Streak  20 pts — days since last downtime
 *
 * Grade thresholds: A≥85, B≥70, C≥50, D≥25, F<25
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsDiagnosticsService } from './monitors-diagnostics.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600_000);
}

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86_400_000);
}

type MockRun = { ok: boolean; latencyMs: number | null; checkedAt: Date };

function makeRun(overrides: Partial<MockRun> = {}): MockRun {
  return { ok: true, latencyMs: 100, checkedAt: new Date(), ...overrides };
}

/** Build n runs, all within the last 7 days, with a given ok/fail ratio. */
function recentRuns(total: number, okCount: number, latencyMs: number | null = 100): MockRun[] {
  return Array.from({ length: total }, (_, i) => ({
    ok: i < okCount,
    latencyMs: i < okCount ? latencyMs : null,
    checkedAt: daysAgo(Math.random() * 6.9), // within last 7d
  }));
}

/** Build n runs within the prior 7d window (7–14d ago). */
function priorRuns(total: number, okCount: number, latencyMs: number | null = 100): MockRun[] {
  return Array.from({ length: total }, (_, i) => ({
    ok: i < okCount,
    latencyMs: i < okCount ? latencyMs : null,
    checkedAt: daysAgo(7 + Math.random() * 6.9),
  }));
}

// ─── Mocked PrismaService ─────────────────────────────────────────────────────

const mockPrisma = {
  monitor: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  monitorRun: {
    findMany: vi.fn(),
  },
};

function makeSvc(): MonitorsDiagnosticsService {
  return new MonitorsDiagnosticsService(mockPrisma as never);
}

// ─── getHealthScore ───────────────────────────────────────────────────────────

describe('getHealthScore', () => {
  let svc: MonitorsDiagnosticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = makeSvc();
  });

  it('throws NotFoundException when monitor not found', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue(null);
    await expect(svc.getHealthScore('user-1', 'mon-1')).rejects.toThrow(NotFoundException);
    await expect(svc.getHealthScore('user-1', 'mon-1')).rejects.toThrow(/monitor not found/i);
  });

  it('returns grade A and score 100 for perfect monitor (100% uptime, stable latency, no failures)', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    // 7d recent: all OK, stable latency; 7d prior: same
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      ...priorRuns(10, 10, 100),
      ...recentRuns(10, 10, 100),
    ]);

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
    expect(result.breakdown.uptime).toBe(40);
    expect(result.breakdown.latency).toBe(20);
    expect(result.breakdown.sla).toBe(20);
    expect(result.breakdown.streak).toBe(20);
  });

  it('returns 0 uptime score when uptime is below 90%', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    // recent: 80% uptime (below 90% threshold → 0 uptime pts)
    // Use fixed-time runs to avoid boundary issues
    const now = Date.now();
    const boundary = now - 7 * 86_400_000;
    const recent = Array.from({ length: 10 }, (_, i) => ({
      ok: i < 8, // 80% ok
      latencyMs: i < 8 ? 100 : null,
      checkedAt: new Date(boundary + (i + 1) * 3600_000), // within last 7d
    }));
    mockPrisma.monitorRun.findMany.mockResolvedValue(recent);

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.breakdown.uptime).toBe(0);
  });

  it('returns partial uptime score for 95% uptime (halfway between 90-100)', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    // 95% uptime → (95-90)/10 * 40 = 20 pts
    const now = Date.now();
    const boundary = now - 7 * 86_400_000;
    const recent = Array.from({ length: 20 }, (_, i) => ({
      ok: i < 19, // 95% ok
      latencyMs: i < 19 ? 100 : null,
      checkedAt: new Date(boundary + (i + 1) * 3600_000),
    }));
    mockPrisma.monitorRun.findMany.mockResolvedValue(recent);

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.breakdown.uptime).toBe(20);
  });

  it('assigns full latency score (20) when no prior P95 data available', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    // Only recent runs, no prior data
    mockPrisma.monitorRun.findMany.mockResolvedValue(recentRuns(10, 10, 100));

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.breakdown.latency).toBe(20);
  });

  it('assigns full latency score (20) for version monitors regardless of latency', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'GIT_RELEASE', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      ...priorRuns(5, 5, null),
      ...recentRuns(5, 5, null),
    ]);

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.breakdown.latency).toBe(20);
  });

  it('assigns 0 latency score when P95 increased by > 50%', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    const now = Date.now();
    const boundary = now - 7 * 86_400_000;

    // Prior: P95 = 100ms, Recent: P95 = 200ms → +100% change
    const prior = Array.from({ length: 10 }, (_, i) => ({
      ok: true,
      latencyMs: 100,
      checkedAt: new Date(boundary - (i + 1) * 3600_000),
    }));
    const recent = Array.from({ length: 10 }, (_, i) => ({
      ok: true,
      latencyMs: 200,
      checkedAt: new Date(boundary + (i + 1) * 3600_000),
    }));
    mockPrisma.monitorRun.findMany.mockResolvedValue([...prior, ...recent]);

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.breakdown.latency).toBe(0);
  });

  it('assigns 10 latency score when P95 increased by 10–50%', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    const now = Date.now();
    const boundary = now - 7 * 86_400_000;

    // Prior: P95 = 100ms, Recent: P95 = 130ms → +30% change
    const prior = Array.from({ length: 10 }, (_, i) => ({
      ok: true, latencyMs: 100, checkedAt: new Date(boundary - (i + 1) * 3600_000),
    }));
    const recent = Array.from({ length: 10 }, (_, i) => ({
      ok: true, latencyMs: 130, checkedAt: new Date(boundary + (i + 1) * 3600_000),
    }));
    mockPrisma.monitorRun.findMany.mockResolvedValue([...prior, ...recent]);

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.breakdown.latency).toBe(10);
  });

  it('assigns full SLA score (20) when no slaTarget configured', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    mockPrisma.monitorRun.findMany.mockResolvedValue(recentRuns(10, 8)); // 80% uptime

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.breakdown.sla).toBe(20);
  });

  it('assigns 0 SLA score when error budget is breached', async () => {
    // slaTarget = 99.9% → allowedDownPct = 0.1%
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: 99.9, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    const now = Date.now();
    const boundary = now - 7 * 86_400_000;
    // 20% down = way over 0.1% budget
    const recent = Array.from({ length: 10 }, (_, i) => ({
      ok: i < 8,
      latencyMs: i < 8 ? 100 : null,
      checkedAt: new Date(boundary + (i + 1) * 3600_000),
    }));
    mockPrisma.monitorRun.findMany.mockResolvedValue(recent);

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.breakdown.sla).toBe(0);
  });

  it('assigns 20 SLA score when well within error budget', async () => {
    // slaTarget = 95% → allowedDownPct = 5%
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: 95, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    const now = Date.now();
    const boundary = now - 7 * 86_400_000;
    // 1% down = 20% of 5% budget → within budget
    const recent = Array.from({ length: 100 }, (_, i) => ({
      ok: i < 99,
      latencyMs: i < 99 ? 100 : null,
      checkedAt: new Date(boundary + (i + 1) * 60_000),
    }));
    mockPrisma.monitorRun.findMany.mockResolvedValue(recent);

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.breakdown.sla).toBe(20);
  });

  it('assigns full streak score (20) when no failures in 14-day window', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    mockPrisma.monitorRun.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        ok: true,
        latencyMs: 100,
        checkedAt: daysAgo(i),
      })),
    );

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.breakdown.streak).toBe(20);
  });

  it('assigns 0 streak score when monitor is currently down', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    // Last run is a failure
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: true, checkedAt: daysAgo(0.1) }),
      makeRun({ ok: false, latencyMs: null, checkedAt: new Date() }), // currently down
    ]);

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.breakdown.streak).toBe(0);
  });

  it('assigns 10 streak score when last failure was 3–6 days ago', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: false, latencyMs: null, checkedAt: daysAgo(4) }), // 4 days ago
      makeRun({ ok: true, checkedAt: daysAgo(3) }),
      makeRun({ ok: true, checkedAt: daysAgo(1) }),
      makeRun({ ok: true, checkedAt: hoursAgo(1) }),
    ]);

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.breakdown.streak).toBe(10);
  });

  it('assigns 5 streak score when last failure was < 3 days ago', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: false, latencyMs: null, checkedAt: daysAgo(1.5) }), // 1.5 days ago
      makeRun({ ok: true, checkedAt: daysAgo(1) }),
      makeRun({ ok: true, checkedAt: hoursAgo(1) }),
    ]);

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.breakdown.streak).toBe(5);
  });

  it('assigns streak=20 when failure was >= 7 days ago', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    mockPrisma.monitorRun.findMany.mockResolvedValue([
      makeRun({ ok: false, latencyMs: null, checkedAt: daysAgo(8) }), // 8 days ago (in 14d window)
      makeRun({ ok: true, checkedAt: daysAgo(7) }),
      makeRun({ ok: true, checkedAt: daysAgo(1) }),
    ]);

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.breakdown.streak).toBe(20);
  });

  it('returns score as sum of all four breakdown values', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    mockPrisma.monitorRun.findMany.mockResolvedValue(recentRuns(10, 10, 100));

    const result = await svc.getHealthScore('user-1', 'mon-1');
    const { uptime, latency, sla, streak } = result.breakdown;
    expect(result.score).toBe(uptime + latency + sla + streak);
  });

  it('clamps score breakdown values as non-negative integers', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc.getHealthScore('user-1', 'mon-1');
    for (const val of Object.values(result.breakdown)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(val)).toBe(true);
    }
  });
});

// ─── Grade thresholds ─────────────────────────────────────────────────────────

describe('getHealthScore — grade assignment', () => {
  let svc: MonitorsDiagnosticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = makeSvc();
  });

  // Helper: set up a monitor that will receive a specific total score
  async function getGradeForRuns(runs: MockRun[], slaTarget: number | null = null) {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    mockPrisma.monitorRun.findMany.mockResolvedValue(runs);
    return svc.getHealthScore('user-1', 'mon-1');
  }

  it('assigns grade A for score >= 85', async () => {
    // 100% uptime (40) + stable latency (20) + no SLA (20) + no failures (20) = 100
    const result = await getGradeForRuns([...priorRuns(10, 10, 100), ...recentRuns(10, 10, 100)]);
    expect(result.grade).toBe('A');
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it('assigns grade F when score < 25', async () => {
    // Force worst case: 0 uptime + 0 latency (by major regression) + breached SLA + currently down
    const now = Date.now();
    const boundary = now - 7 * 86_400_000;

    // Recent: all fail, 0% uptime → uptime=0
    // Latency: prior=100ms, recent=300ms (+200%) → latency=0
    // Currently down → streak=0
    // slaTarget=99.9 + all down → sla=0
    const prior = Array.from({ length: 10 }, (_, i) => ({
      ok: true, latencyMs: 100, checkedAt: new Date(boundary - (i + 1) * 3600_000),
    }));
    const recent = Array.from({ length: 10 }, (_, i) => ({
      ok: false, latencyMs: null, checkedAt: new Date(boundary + (i + 1) * 3600_000),
    }));

    const result = await getGradeForRuns([...prior, ...recent], 99.9);
    expect(result.grade).toBe('F');
    expect(result.score).toBeLessThan(25);
  });

  it('score does not exceed 100', async () => {
    const result = await getGradeForRuns([...priorRuns(10, 10, 100), ...recentRuns(10, 10, 100)]);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('score is always non-negative', async () => {
    const now = Date.now();
    const boundary = now - 7 * 86_400_000;
    const worst = Array.from({ length: 10 }, (_, i) => ({
      ok: false, latencyMs: null, checkedAt: new Date(boundary + (i + 1) * 3600_000),
    }));
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: 99.9, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    mockPrisma.monitorRun.findMany.mockResolvedValue(worst);

    const result = await svc.getHealthScore('user-1', 'mon-1');
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

// ─── No-run edge cases ────────────────────────────────────────────────────────

describe('getHealthScore — no run data', () => {
  let svc: MonitorsDiagnosticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = makeSvc();
  });

  it('returns default scores when no runs exist', async () => {
    mockPrisma.monitor.findFirst.mockResolvedValue({
      id: 'mon-1', type: 'HTTP', slaTarget: null, slaPeriodDays: 30, slaBreachAlertedAt: null,
    });
    mockPrisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await svc.getHealthScore('user-1', 'mon-1');
    // No runs → uptime=40 (default full), latency=20 (no data → full), sla=20 (no target), streak=20 (no failures)
    expect(result.breakdown.uptime).toBe(40);
    expect(result.breakdown.latency).toBe(20);
    expect(result.breakdown.sla).toBe(20);
    expect(result.breakdown.streak).toBe(20);
    expect(result.score).toBe(100);
  });
});
