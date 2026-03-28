import { describe, it, expect, vi } from 'vitest';
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

const mockMonitor = {
  id: 'mon-1',
  name: 'API Server',
  type: 'HTTP',
  folder: { name: 'Production' },
};

const mockMonitor2 = {
  id: 'mon-2',
  name: 'Database',
  type: 'TCP',
  folder: null,
};

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

describe('MonitorsService — statusTimeline()', () => {
  it('returns empty monitors array when user has no monitors', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([]) },
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = makeService(prisma);
    const result = await service.statusTimeline('user-1', 24);
    expect(result.monitors).toHaveLength(0);
    expect(result.totalHours).toBe(24);
    expect(result.from).toBeTruthy();
    expect(result.to).toBeTruthy();
  });

  it('returns single green segment when monitor has no runs in window', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([mockMonitor]) },
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = makeService(prisma);
    const result = await service.statusTimeline('user-1', 24);
    expect(result.monitors).toHaveLength(1);
    const m = result.monitors[0];
    expect(m.id).toBe('mon-1');
    expect(m.segments).toHaveLength(1);
    expect(m.segments[0].level).toBe('green');
    expect(m.uptimePct).toBe(100);
  });

  it('splits into multiple segments on level changes', async () => {
    const now = new Date();
    const runs = [
      { monitorId: 'mon-1', checkedAt: hoursAgo(10), level: 'green' },
      { monitorId: 'mon-1', checkedAt: hoursAgo(5), level: 'red' },    // transition green→red
      { monitorId: 'mon-1', checkedAt: hoursAgo(2), level: 'green' },  // recovery red→green
      { monitorId: 'mon-1', checkedAt: hoursAgo(1), level: 'green' },
    ];
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([mockMonitor]) },
      monitorRun: { findMany: vi.fn().mockResolvedValue(runs) },
    };
    const service = makeService(prisma);
    const result = await service.statusTimeline('user-1', 24);
    const m = result.monitors[0];
    // Should have at least 3 segments: green → red → green
    expect(m.segments.length).toBeGreaterThanOrEqual(2);
    const levels = m.segments.map(s => s.level);
    expect(levels).toContain('green');
    expect(levels).toContain('red');
  });

  it('calculates uptimePct correctly from window runs', async () => {
    const runs = [
      { monitorId: 'mon-1', checkedAt: hoursAgo(3), level: 'green' },
      { monitorId: 'mon-1', checkedAt: hoursAgo(2), level: 'green' },
      { monitorId: 'mon-1', checkedAt: hoursAgo(1), level: 'red' },
      { monitorId: 'mon-1', checkedAt: hoursAgo(0.5), level: 'green' },
    ];
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([mockMonitor]) },
      monitorRun: { findMany: vi.fn().mockResolvedValue(runs) },
    };
    const service = makeService(prisma);
    const result = await service.statusTimeline('user-1', 24);
    const m = result.monitors[0];
    // 3 green out of 4 = 75%
    expect(m.uptimePct).toBe(75);
  });

  it('handles multiple monitors independently', async () => {
    const runs = [
      { monitorId: 'mon-1', checkedAt: hoursAgo(2), level: 'green' },
      { monitorId: 'mon-2', checkedAt: hoursAgo(2), level: 'red' },
      { monitorId: 'mon-1', checkedAt: hoursAgo(1), level: 'green' },
      { monitorId: 'mon-2', checkedAt: hoursAgo(1), level: 'red' },
    ];
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([mockMonitor, mockMonitor2]) },
      monitorRun: { findMany: vi.fn().mockResolvedValue(runs) },
    };
    const service = makeService(prisma);
    const result = await service.statusTimeline('user-1', 24);
    expect(result.monitors).toHaveLength(2);
    const mon1 = result.monitors.find(m => m.id === 'mon-1')!;
    const mon2 = result.monitors.find(m => m.id === 'mon-2')!;
    expect(mon1.uptimePct).toBe(100);
    expect(mon2.uptimePct).toBe(0);
    expect(mon2.currentLevel).toBe('red');
  });

  it('clamps hours to 1-168 range', async () => {
    const prisma = {
      monitor: { findMany: vi.fn().mockResolvedValue([]) },
      monitorRun: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = makeService(prisma);
    const r1 = await service.statusTimeline('user-1', 0);
    expect(r1.totalHours).toBe(1);
    const r2 = await service.statusTimeline('user-1', 9999);
    expect(r2.totalHours).toBe(168);
  });
});
