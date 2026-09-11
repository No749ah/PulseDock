import { describe, it, expect, vi } from 'vitest';
import { MaintenanceService } from './maintenance.service';

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

function buildService(windows: object[], baselineRuns: object[], windowRuns: object[], recoveryRuns: object[] = []) {
  const prisma = {
    maintenanceWindow: {
      findMany: vi.fn().mockResolvedValue(windows),
    },
    monitorRun: {
      findMany: vi.fn()
        .mockResolvedValueOnce(windowRuns)
        .mockResolvedValueOnce(baselineRuns)
        .mockResolvedValueOnce(recoveryRuns),
    },
  };
  return new MaintenanceService(prisma as never);
}

describe('MaintenanceService.effectiveness', () => {
  it('returns empty windows when no completed windows exist', async () => {
    const prisma = {
      maintenanceWindow: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const svc = new MaintenanceService(prisma as never);
    const r = await svc.effectiveness('user-1', 90);
    expect(r.summary.totalWindows).toBe(0);
    expect(r.windows).toHaveLength(0);
    expect(r.summary.totalSuppressedAlerts).toBe(0);
  });

  it('correctly marks no-data status when no runs in either period', async () => {
    const w = {
      id: 'w1',
      name: 'Deploy v2',
      description: null,
      recurrence: 'NONE',
      startsAt: hoursAgo(48),
      endsAt: hoursAgo(46),
      monitors: [],
    };
    const prisma = {
      maintenanceWindow: { findMany: vi.fn().mockResolvedValue([w]) },
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const svc = new MaintenanceService(prisma as never);
    const r = await svc.effectiveness('user-1', 90);
    expect(r.windows[0].status).toBe('no-data');
    expect(r.windows[0].checksInWindow).toBe(0);
    expect(r.windows[0].checksInBaseline).toBe(0);
  });

  it('computes failure percentages correctly', async () => {
    const w = {
      id: 'w1',
      name: 'Deploy',
      description: null,
      recurrence: 'NONE',
      startsAt: hoursAgo(48),
      endsAt: hoursAgo(46),
      monitors: [{ monitor: { id: 'm1', name: 'API' } }],
    };
    // 4 window runs: 2 failed
    const windowRuns = [
      { ok: false, checkedAt: hoursAgo(47) },
      { ok: false, checkedAt: hoursAgo(47) },
      { ok: true, checkedAt: hoursAgo(47) },
      { ok: true, checkedAt: hoursAgo(47) },
    ];
    // 10 baseline runs: 1 failed
    const baselineRuns = [
      { ok: false },
      ...Array(9).fill({ ok: true }),
    ];
    const recoveryRuns: object[] = [];
    const prisma = {
      maintenanceWindow: { findMany: vi.fn().mockResolvedValue([w]) },
      monitorRun: { findMany: vi.fn()
        .mockResolvedValueOnce(windowRuns)
        .mockResolvedValueOnce(baselineRuns)
        .mockResolvedValueOnce(recoveryRuns),
      },
    };
    const svc = new MaintenanceService(prisma as never);
    const r = await svc.effectiveness('user-1', 90);
    expect(r.windows[0].checksInWindow).toBe(4);
    expect(r.windows[0].failuresInWindow).toBe(2);
    expect(r.windows[0].windowFailurePct).toBe(50);
    expect(r.windows[0].checksInBaseline).toBe(10);
    expect(r.windows[0].failuresInBaseline).toBe(1);
    expect(r.windows[0].baselineFailurePct).toBe(10);
    expect(r.windows[0].suppressedAlerts).toBe(2);
  });

  it('detects recovery time after window ends', async () => {
    const endsAt = hoursAgo(24);
    const w = {
      id: 'w1',
      name: 'Upgrade',
      description: null,
      recurrence: 'NONE',
      startsAt: hoursAgo(26),
      endsAt,
      monitors: [],
    };
    const recoveryRuns = [
      { ok: true, checkedAt: new Date(endsAt.getTime() + 5 * 60 * 1000) }, // 5 min after
    ];
    const prisma = {
      maintenanceWindow: { findMany: vi.fn().mockResolvedValue([w]) },
      monitorRun: { findMany: vi.fn()
        .mockResolvedValueOnce([]) // window runs
        .mockResolvedValueOnce([]) // baseline runs
        .mockResolvedValueOnce(recoveryRuns), // recovery
      },
    };
    const svc = new MaintenanceService(prisma as never);
    const r = await svc.effectiveness('user-1', 90);
    expect(r.windows[0].recoveredAfterMinutes).toBe(5);
  });

  it('marks over-active when no failures in either period', async () => {
    const w = {
      id: 'w1',
      name: 'Precautionary',
      description: null,
      recurrence: 'NONE',
      startsAt: hoursAgo(48),
      endsAt: hoursAgo(46),
      monitors: [],
    };
    const okRuns = Array(5).fill({ ok: true, checkedAt: hoursAgo(47) });
    const baselineOkRuns = Array(5).fill({ ok: true });
    const prisma = {
      maintenanceWindow: { findMany: vi.fn().mockResolvedValue([w]) },
      monitorRun: { findMany: vi.fn()
        .mockResolvedValueOnce(okRuns)
        .mockResolvedValueOnce(baselineOkRuns)
        .mockResolvedValueOnce([]),
      },
    };
    const svc = new MaintenanceService(prisma as never);
    const r = await svc.effectiveness('user-1', 90);
    expect(r.windows[0].status).toBe('over-active');
  });

  it('computes duration minutes correctly', async () => {
    const w = {
      id: 'w1',
      name: 'Short window',
      description: null,
      recurrence: 'NONE',
      startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      endsAt: new Date(Date.now() - 1 * 60 * 60 * 1000),   // 1 hour ago = 60 min duration
      monitors: [],
    };
    const prisma = {
      maintenanceWindow: { findMany: vi.fn().mockResolvedValue([w]) },
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const svc = new MaintenanceService(prisma as never);
    const r = await svc.effectiveness('user-1', 90);
    expect(r.windows[0].durationMinutes).toBe(60);
  });
});
