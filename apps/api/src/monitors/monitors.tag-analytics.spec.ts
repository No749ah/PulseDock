/**
 * Unit tests for MonitorsService.getTagAnalytics()
 *
 * 1. returns empty array for user with no monitors
 * 2. groups monitors by tag correctly
 * 3. computes avgUptimePct from runs
 * 4. untagged monitors appear in Untagged bucket last
 * 5. monitors with multiple tags appear in each tag's bucket
 * 6. health classification correct (>99%=healthy, 95-99%=degraded, <95%=critical)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MonitorsAnalyticsService } from './monitors-analytics.service';

function makePrisma() {
  return {
    monitor: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    monitorRun: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    monitorTag: { findMany: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    tag: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    alertChannel: { findMany: vi.fn() },
    monitorAlert: { findMany: vi.fn() },
    folder: { findFirst: vi.fn() },
    monitorDependency: { findMany: vi.fn() },
    monitorAnnotation: { findMany: vi.fn() },
    monitorEvent: { findMany: vi.fn(), create: vi.fn() },
    monitorConfigChange: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  };
}

function makeService(prismaOverrides?: Partial<ReturnType<typeof makePrisma>>): MonitorsAnalyticsService {
  const prisma = { ...makePrisma(), ...prismaOverrides };
  return new (MonitorsAnalyticsService as unknown as new (...args: unknown[]) => MonitorsAnalyticsService)(prisma as never);
}

const TAG_API = { id: 'tag-api', name: 'API', color: '#10b981' };
const TAG_DB = { id: 'tag-db', name: 'Database', color: '#3b82f6' };

function makeMonitor(id: string, tags: typeof TAG_API[]) {
  return {
    id,
    monitorTags: tags.map((tag) => ({ tag })),
  };
}

function makeRun(monitorId: string, ok: boolean, latencyMs = 100) {
  return { monitorId, ok, level: ok ? 'green' : 'red', latencyMs };
}

describe('MonitorsService.getTagAnalytics()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: MonitorsAnalyticsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('1. returns empty array for user with no monitors', async () => {
    prisma.monitor.findMany.mockResolvedValue([]);
    prisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await service.getTagAnalytics('user-1', 7);

    expect(result.tags).toHaveLength(0);
    expect(result.periodDays).toBe(7);
  });

  it('2. groups monitors by tag correctly', async () => {
    prisma.monitor.findMany.mockResolvedValue([
      makeMonitor('m1', [TAG_API]),
      makeMonitor('m2', [TAG_DB]),
    ]);
    prisma.monitorRun.findMany
      .mockResolvedValueOnce([makeRun('m1', true), makeRun('m2', true)])
      .mockResolvedValueOnce([]);

    const result = await service.getTagAnalytics('user-1', 7);

    const tagNames = result.tags.map((t) => t.tag);
    expect(tagNames).toContain('API');
    expect(tagNames).toContain('Database');
    expect(result.tags.find((t) => t.tag === 'API')?.monitorCount).toBe(1);
    expect(result.tags.find((t) => t.tag === 'Database')?.monitorCount).toBe(1);
  });

  it('3. computes avgUptimePct from runs', async () => {
    // m1: 8/10 ok = 80%, m2: 10/10 ok = 100% → avg = 90%
    prisma.monitor.findMany.mockResolvedValue([
      makeMonitor('m1', [TAG_API]),
      makeMonitor('m2', [TAG_API]),
    ]);
    const runs = [
      ...Array(8).fill(null).map(() => makeRun('m1', true)),
      ...Array(2).fill(null).map(() => makeRun('m1', false)),
      ...Array(10).fill(null).map(() => makeRun('m2', true)),
    ];
    prisma.monitorRun.findMany
      .mockResolvedValueOnce(runs)
      .mockResolvedValueOnce([]);

    const result = await service.getTagAnalytics('user-1', 7);

    const apiTag = result.tags.find((t) => t.tag === 'API')!;
    expect(apiTag.avgUptimePct).toBeCloseTo(90, 0);
  });

  it('4. untagged monitors appear in Untagged bucket last', async () => {
    prisma.monitor.findMany.mockResolvedValue([
      makeMonitor('m1', [TAG_API]),
      makeMonitor('m2', []), // untagged
    ]);
    prisma.monitorRun.findMany
      .mockResolvedValueOnce([makeRun('m1', true), makeRun('m2', true)])
      .mockResolvedValueOnce([]);

    const result = await service.getTagAnalytics('user-1', 7);

    const lastTag = result.tags[result.tags.length - 1];
    expect(lastTag.tag).toBe('Untagged');
    expect(lastTag.monitorCount).toBe(1);
  });

  it('5. monitors with multiple tags appear in each tag bucket', async () => {
    prisma.monitor.findMany.mockResolvedValue([
      makeMonitor('m1', [TAG_API, TAG_DB]),
    ]);
    prisma.monitorRun.findMany
      .mockResolvedValueOnce([makeRun('m1', true)])
      .mockResolvedValueOnce([]);

    const result = await service.getTagAnalytics('user-1', 7);

    const tagNames = result.tags.map((t) => t.tag);
    expect(tagNames).toContain('API');
    expect(tagNames).toContain('Database');
    expect(result.tags.find((t) => t.tag === 'API')?.monitorCount).toBe(1);
    expect(result.tags.find((t) => t.tag === 'Database')?.monitorCount).toBe(1);
  });

  it('6. health classification: >99%=healthy, 95-99%=degraded, <95%=critical', async () => {
    // m1 = 100% → healthy, m2 = 97% → degraded, m3 = 90% → critical
    prisma.monitor.findMany.mockResolvedValue([
      makeMonitor('m1', [TAG_API]),
      makeMonitor('m2', [TAG_DB]),
      makeMonitor('m3', [{ id: 'tag-web', name: 'Web', color: '#f59e0b' }]),
    ]);
    const runs = [
      ...Array(100).fill(null).map(() => makeRun('m1', true)),
      ...Array(97).fill(null).map(() => makeRun('m2', true)),
      ...Array(3).fill(null).map(() => makeRun('m2', false)),
      ...Array(90).fill(null).map(() => makeRun('m3', true)),
      ...Array(10).fill(null).map(() => makeRun('m3', false)),
    ];
    prisma.monitorRun.findMany
      .mockResolvedValueOnce(runs)
      .mockResolvedValueOnce([]);

    const result = await service.getTagAnalytics('user-1', 7);

    expect(result.tags.find((t) => t.tag === 'API')?.health).toBe('healthy');
    expect(result.tags.find((t) => t.tag === 'Database')?.health).toBe('degraded');
    expect(result.tags.find((t) => t.tag === 'Web')?.health).toBe('critical');
  });
});
