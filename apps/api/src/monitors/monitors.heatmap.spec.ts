import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorsService } from './monitors.service';

function makeService(prismaMock: Record<string, unknown>) {
  return new (MonitorsService as unknown as new (...args: unknown[]) => MonitorsService)(
    prismaMock,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const todayStr = today.toISOString().slice(0, 10);

const yesterday = new Date(today);
yesterday.setUTCDate(today.getUTCDate() - 1);
const yesterdayStr = yesterday.toISOString().slice(0, 10);

const mockMonitor = {
  id: 'mon-1',
  name: 'My API',
  type: 'HTTP',
  folder: { name: 'Production' },
};

describe('MonitorsService — uptimeHeatmap', () => {
  it('returns correct dates array for the requested period', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([mockMonitor]) },
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = makeService(prisma);
    const result = await service.uptimeHeatmap('user-1', 7);
    expect(result.dates).toHaveLength(7);
    expect(result.dates[result.dates.length - 1]).toBe(todayStr);
  });

  it('returns null uptimePct for days with no checks', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([mockMonitor]) },
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = makeService(prisma);
    const result = await service.uptimeHeatmap('user-1', 7);
    expect(result.monitors[0].days.every(d => d.uptimePct === null)).toBe(true);
    expect(result.monitors[0].days.every(d => d.total === 0)).toBe(true);
  });

  it('computes uptimePct correctly from check runs', async () => {
    const runs = [
      { monitorId: 'mon-1', checkedAt: new Date(`${todayStr}T10:00:00Z`), level: 'green' },
      { monitorId: 'mon-1', checkedAt: new Date(`${todayStr}T11:00:00Z`), level: 'green' },
      { monitorId: 'mon-1', checkedAt: new Date(`${todayStr}T12:00:00Z`), level: 'red' },
      { monitorId: 'mon-1', checkedAt: new Date(`${todayStr}T13:00:00Z`), level: 'green' },
    ];
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([mockMonitor]) },
      monitorRun: { findMany: vi.fn().mockResolvedValue(runs) },
    };
    const service = makeService(prisma);
    const result = await service.uptimeHeatmap('user-1', 7);
    const todayCell = result.monitors[0].days.find(d => d.date === todayStr);
    expect(todayCell?.total).toBe(4);
    expect(todayCell?.failed).toBe(1);
    expect(todayCell?.uptimePct).toBe(75); // 3/4 = 75%
  });

  it('clamps days to 1-90 range', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([]) },
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = makeService(prisma);
    const r1 = await service.uptimeHeatmap('user-1', 200);
    expect(r1.dates).toHaveLength(90);
    const r2 = await service.uptimeHeatmap('user-1', 0);
    expect(r2.dates).toHaveLength(1);
  });

  it('returns folder name from monitor relation', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([mockMonitor]) },
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = makeService(prisma);
    const result = await service.uptimeHeatmap('user-1', 7);
    expect(result.monitors[0].folder).toBe('Production');
  });

  it('returns empty monitors array when no monitors exist', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([]) },
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = makeService(prisma);
    const result = await service.uptimeHeatmap('user-1', 30);
    expect(result.monitors).toHaveLength(0);
    expect(result.dates).toHaveLength(30);
    // monitorRun.findMany should NOT be called when there are no monitors
    expect(prisma.monitorRun.findMany).not.toHaveBeenCalled();
  });
});
