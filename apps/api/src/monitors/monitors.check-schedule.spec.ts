/**
 * Unit tests for MonitorsService.checkSchedule()
 *
 * Tests fleet-level check scheduling overview:
 * 1. Returns expected shape with 24 hourly buckets
 * 2. Empty fleet returns all zeros
 * 3. Single monitor with 60s interval → 60 checks/hour
 * 4. Disabled monitors excluded from fleet total
 * 5. Cron-expression monitor: `0 9 * * *` → ≈ 0.042 checks/hour (1/day)
 * 6. Multiple monitors sum correctly
 * 7. nextCheckEstimateSec is 0 for never-checked enabled monitors
 * 8. nextCheckEstimateSec computed from lastCheckedAt + intervalSec
 * 9. cronExpression passed through to result
 * 10. Peak hour is the one with highest load
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MonitorsService } from './monitors.service';

function makePrisma() {
  return {
    monitor: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    monitorRun: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    monitorAlert: { findMany: vi.fn() },
    alertChannel: { findMany: vi.fn() },
    folder: { findFirst: vi.fn() },
    tag: { findMany: vi.fn() },
    monitorTag: { findMany: vi.fn() },
    monitorDependency: { findMany: vi.fn() },
    monitorAnnotation: { findMany: vi.fn() },
    monitorEvent: { findMany: vi.fn(), create: vi.fn() },
    monitorConfigChange: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  };
}

function makeService(prismaOverrides?: Partial<ReturnType<typeof makePrisma>>): MonitorsService {
  const prisma = { ...makePrisma(), ...prismaOverrides };
  return new MonitorsService(prisma as never, {} as never, {} as never, {} as never, {} as never);
}

describe('MonitorsService.checkSchedule()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: MonitorsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
    // Default: no run history
    prisma.monitorRun.findMany.mockResolvedValue([]);
  });

  it('returns expected shape with 24 hourly buckets', async () => {
    prisma.monitor.findMany.mockResolvedValue([]);

    const result = await service.checkSchedule('user-1');

    expect(result).toHaveProperty('generatedAt');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('hourlyLoad');
    expect(result).toHaveProperty('monitors');
    expect(result.hourlyLoad).toHaveLength(24);
    expect(result.hourlyLoad[0].hour).toBe(0);
    expect(result.hourlyLoad[23].hour).toBe(23);
    expect(result.hourlyLoad[0].label).toBe('00:00');
    expect(result.hourlyLoad[12].label).toBe('12:00');
  });

  it('empty fleet returns all-zero summary', async () => {
    prisma.monitor.findMany.mockResolvedValue([]);

    const result = await service.checkSchedule('user-1');

    expect(result.summary.totalMonitors).toBe(0);
    expect(result.summary.enabledMonitors).toBe(0);
    expect(result.summary.fleetChecksPerHour).toBe(0);
    expect(result.summary.fleetChecksPerDay).toBe(0);
    expect(result.monitors).toHaveLength(0);
    result.hourlyLoad.forEach((h) => expect(h.estimatedChecks).toBe(0));
  });

  it('single monitor with 60s interval → 60 checks/hour', async () => {
    prisma.monitor.findMany.mockResolvedValue([{
      id: 'm1', name: 'My Monitor', type: 'HTTP',
      enabled: true, intervalSec: 60, cronExpression: null, lastCheckedAt: null,
    }]);

    const result = await service.checkSchedule('user-1');

    expect(result.summary.enabledMonitors).toBe(1);
    expect(result.summary.fleetChecksPerHour).toBe(60);
    expect(result.summary.fleetChecksPerDay).toBe(1440);
    const m = result.monitors.find((m) => m.id === 'm1')!;
    expect(m.checksPerHour).toBe(60);
  });

  it('disabled monitors excluded from fleet total and hourly load', async () => {
    prisma.monitor.findMany.mockResolvedValue([
      { id: 'm1', name: 'Enabled', type: 'HTTP', enabled: true, intervalSec: 60, cronExpression: null, lastCheckedAt: null },
      { id: 'm2', name: 'Disabled', type: 'HTTP', enabled: false, intervalSec: 30, cronExpression: null, lastCheckedAt: null },
    ]);

    const result = await service.checkSchedule('user-1');

    // Only enabled monitor contributes to fleet rate
    expect(result.summary.enabledMonitors).toBe(1);
    expect(result.summary.fleetChecksPerHour).toBe(60); // only m1 (60 checks/h)
    // Disabled monitor still appears in monitors list but with 0 contribution
    expect(result.monitors).toHaveLength(2);
  });

  it('cron-expression every hour (`0 * * * *`) → 1 check/hour', async () => {
    prisma.monitor.findMany.mockResolvedValue([{
      id: 'm1', name: 'Hourly Cron', type: 'HTTP',
      enabled: true, intervalSec: 3600, cronExpression: '0 * * * *', lastCheckedAt: null,
    }]);

    const result = await service.checkSchedule('user-1');
    const m = result.monitors.find((m) => m.id === 'm1')!;
    expect(m.checksPerHour).toBe(1);
  });

  it('cron-expression daily at 9am (`0 9 * * *`) → ~0.04 checks/hour', async () => {
    prisma.monitor.findMany.mockResolvedValue([{
      id: 'm1', name: 'Daily', type: 'HTTP',
      enabled: true, intervalSec: 86400, cronExpression: '0 9 * * *', lastCheckedAt: null,
    }]);

    const result = await service.checkSchedule('user-1');
    const m = result.monitors.find((m) => m.id === 'm1')!;
    // One specific hour → 1/24 = 0.04 checks/hour
    expect(m.checksPerHour).toBeCloseTo(1 / 24, 2);
  });

  it('multiple monitors sum checksPerHour correctly', async () => {
    prisma.monitor.findMany.mockResolvedValue([
      { id: 'm1', name: 'A', type: 'HTTP', enabled: true, intervalSec: 60, cronExpression: null, lastCheckedAt: null },
      { id: 'm2', name: 'B', type: 'HTTP', enabled: true, intervalSec: 120, cronExpression: null, lastCheckedAt: null },
    ]);

    const result = await service.checkSchedule('user-1');

    // m1: 60/hr, m2: 30/hr → total 90/hr
    expect(result.summary.fleetChecksPerHour).toBe(90);
  });

  it('nextCheckEstimateSec is 0 for never-checked enabled monitors', async () => {
    prisma.monitor.findMany.mockResolvedValue([{
      id: 'm1', name: 'M1', type: 'HTTP', enabled: true, intervalSec: 60, cronExpression: null, lastCheckedAt: null,
    }]);

    const result = await service.checkSchedule('user-1');
    const m = result.monitors.find((m) => m.id === 'm1')!;
    expect(m.nextCheckEstimateSec).toBe(0);
  });

  it('nextCheckEstimateSec is null for disabled monitors', async () => {
    prisma.monitor.findMany.mockResolvedValue([{
      id: 'm1', name: 'M1', type: 'HTTP', enabled: false, intervalSec: 60, cronExpression: null, lastCheckedAt: null,
    }]);

    const result = await service.checkSchedule('user-1');
    const m = result.monitors.find((m) => m.id === 'm1')!;
    expect(m.nextCheckEstimateSec).toBeNull();
  });

  it('nextCheckEstimateSec computed from lastCheckedAt + intervalSec', async () => {
    // Checked 30 seconds ago, interval is 60s → ~30s remaining
    const lastCheckedAt = new Date(Date.now() - 30_000);
    prisma.monitor.findMany.mockResolvedValue([{
      id: 'm1', name: 'M1', type: 'HTTP', enabled: true, intervalSec: 60, cronExpression: null,
    }]);
    // Mock the run batch query to return the lastCheckedAt
    prisma.monitorRun.findMany.mockResolvedValue([{ monitorId: 'm1', checkedAt: lastCheckedAt }]);

    const result = await service.checkSchedule('user-1');
    const m = result.monitors.find((m) => m.id === 'm1')!;
    // Should be approximately 30s (allow ±2s for test timing)
    expect(m.nextCheckEstimateSec).toBeGreaterThanOrEqual(28);
    expect(m.nextCheckEstimateSec).toBeLessThanOrEqual(32);
  });

  it('cronExpression passed through to result', async () => {
    const cron = '0 9 * * 1-5';
    prisma.monitor.findMany.mockResolvedValue([{
      id: 'm1', name: 'M1', type: 'HTTP', enabled: true, intervalSec: 86400, cronExpression: cron, lastCheckedAt: null,
    }]);

    const result = await service.checkSchedule('user-1');
    const m = result.monitors.find((m) => m.id === 'm1')!;
    expect(m.cronExpression).toBe(cron);
  });

  it('peakHour is the hour index with highest estimated load', async () => {
    // With uniform interval monitors, all hours have equal load → peakHour would be 0
    prisma.monitor.findMany.mockResolvedValue([{
      id: 'm1', name: 'M1', type: 'HTTP', enabled: true, intervalSec: 60, cronExpression: null, lastCheckedAt: null,
    }]);

    const result = await service.checkSchedule('user-1');
    // All hours are equal, so peak/quiet should be consistent (both 0)
    const loads = result.hourlyLoad.map((h) => h.estimatedChecks);
    const maxLoad = Math.max(...loads);
    expect(result.summary.peakHourLoad).toBe(maxLoad);
  });

  it('cron `*/6 * * * *` (every 6 min) → 10 checks/hour', async () => {
    prisma.monitor.findMany.mockResolvedValue([{
      id: 'm1', name: 'M1', type: 'HTTP',
      enabled: true, intervalSec: 360, cronExpression: '*/6 * * * *', lastCheckedAt: null,
    }]);

    const result = await service.checkSchedule('user-1');
    const m = result.monitors.find((m) => m.id === 'm1')!;
    // */6 in minute field, * in hour → fires every 6 minutes = 10/hour
    expect(m.checksPerHour).toBe(10);
  });
});
