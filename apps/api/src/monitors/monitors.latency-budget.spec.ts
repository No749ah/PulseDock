import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsCrudService } from './monitors-crud.service';

type PrismaMonitor = {
  id: string;
  userId: string;
  name: string;
  latencyBudgetMs: number | null;
};

type PrismaRun = {
  latencyMs: number | null;
};

function buildService(monitor: PrismaMonitor | null, runs: PrismaRun[]): MonitorsCrudService {
  const prisma = {
    monitor: {
      findFirst: vi.fn().mockResolvedValue(monitor),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue(runs),
    },
  };
  return new (MonitorsCrudService as unknown as new (...args: unknown[]) => MonitorsCrudService)(prisma as never, {} as never, {} as never, {} as never, {} as never);
}

describe('MonitorsService.getLatencyBudgetReport', () => {
  it('throws NotFoundException for wrong user', async () => {
    const service = buildService(null, []);
    await expect(service.getLatencyBudgetReport('user-1', 'monitor-1')).rejects.toThrow(NotFoundException);
  });

  it('returns no-budget status when latencyBudgetMs is null', async () => {
    const monitor: PrismaMonitor = { id: 'm1', userId: 'u1', name: 'Test', latencyBudgetMs: null };
    const runs: PrismaRun[] = [{ latencyMs: 200 }, { latencyMs: 300 }, { latencyMs: 400 }];
    const service = buildService(monitor, runs);
    const report = await service.getLatencyBudgetReport('u1', 'm1');
    expect(report.status).toBe('no-budget');
    expect(report.latencyBudgetMs).toBeNull();
    expect(report.checksAboveBudget).toBe(0);
    expect(report.budgetUsedPct).toBe(0);
  });

  it('returns healthy when fewer than 10% of checks exceed budget', async () => {
    const monitor: PrismaMonitor = { id: 'm1', userId: 'u1', name: 'Test', latencyBudgetMs: 500 };
    // 1 out of 20 = 5% — healthy
    const runs: PrismaRun[] = [
      ...Array.from({ length: 19 }, () => ({ latencyMs: 300 })),
      { latencyMs: 600 },
    ];
    const service = buildService(monitor, runs);
    const report = await service.getLatencyBudgetReport('u1', 'm1');
    expect(report.status).toBe('healthy');
    expect(report.checksAboveBudget).toBe(1);
    expect(report.budgetUsedPct).toBeLessThan(10);
  });

  it('returns warning when 10-25% of checks exceed budget', async () => {
    const monitor: PrismaMonitor = { id: 'm1', userId: 'u1', name: 'Test', latencyBudgetMs: 500 };
    // 3 out of 20 = 15% — warning
    const runs: PrismaRun[] = [
      ...Array.from({ length: 17 }, () => ({ latencyMs: 300 })),
      { latencyMs: 600 },
      { latencyMs: 700 },
      { latencyMs: 800 },
    ];
    const service = buildService(monitor, runs);
    const report = await service.getLatencyBudgetReport('u1', 'm1');
    expect(report.status).toBe('warning');
    expect(report.checksAboveBudget).toBe(3);
    expect(report.budgetUsedPct).toBeGreaterThanOrEqual(10);
    expect(report.budgetUsedPct).toBeLessThanOrEqual(25);
  });

  it('returns exceeded when more than 25% of checks exceed budget', async () => {
    const monitor: PrismaMonitor = { id: 'm1', userId: 'u1', name: 'Test', latencyBudgetMs: 500 };
    // 6 out of 20 = 30% — exceeded
    const runs: PrismaRun[] = [
      ...Array.from({ length: 14 }, () => ({ latencyMs: 300 })),
      ...Array.from({ length: 6 }, () => ({ latencyMs: 700 })),
    ];
    const service = buildService(monitor, runs);
    const report = await service.getLatencyBudgetReport('u1', 'm1');
    expect(report.status).toBe('exceeded');
    expect(report.checksAboveBudget).toBe(6);
    expect(report.budgetUsedPct).toBeGreaterThan(25);
  });

  it('computes p95LatencyMs correctly', async () => {
    const monitor: PrismaMonitor = { id: 'm1', userId: 'u1', name: 'Test', latencyBudgetMs: 1000 };
    // 100 values: 1-100ms sorted, p95 index = floor(100 * 0.95) = 95 → value at index 95 = 96ms
    const runs: PrismaRun[] = Array.from({ length: 100 }, (_, i) => ({ latencyMs: i + 1 }));
    const service = buildService(monitor, runs);
    const report = await service.getLatencyBudgetReport('u1', 'm1');
    expect(report.p95LatencyMs).toBe(96);
    expect(report.avgLatencyMs).toBe(51); // average of 1..100 = 50.5, rounded = 51
  });

  it('checksAboveBudget is 0 when all checks are within budget', async () => {
    const monitor: PrismaMonitor = { id: 'm1', userId: 'u1', name: 'Test', latencyBudgetMs: 1000 };
    const runs: PrismaRun[] = Array.from({ length: 10 }, () => ({ latencyMs: 200 }));
    const service = buildService(monitor, runs);
    const report = await service.getLatencyBudgetReport('u1', 'm1');
    expect(report.checksAboveBudget).toBe(0);
    expect(report.budgetUsedPct).toBe(0);
    expect(report.status).toBe('healthy');
  });
});
