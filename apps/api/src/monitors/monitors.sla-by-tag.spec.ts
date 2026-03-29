/**
 * Unit tests for MonitorsService.slaByTag()
 *
 * Tests SLA compliance aggregation grouped by tag:
 * 1. Empty fleet returns []
 * 2. Monitors without tags go into "Untagged" bucket
 * 3. Monitors with tags are grouped correctly
 * 4. Weighted uptime computed across all monitors in a tag
 * 5. compliantCount / atRiskCount / breachedCount computed correctly
 * 6. noDataCount for monitors with no runs
 * 7. Monitor in multiple tags appears in each group
 * 8. Tags sorted alphabetically, Untagged at end
 * 9. atRisk detection: compliant but within 0.5% of SLA target
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MonitorsService } from './monitors.service';

function makePrisma() {
  return {
    monitor: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    monitorRun: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
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

function makeService(prismaOverrides?: Partial<ReturnType<typeof makePrisma>>): MonitorsService {
  const prisma = { ...makePrisma(), ...prismaOverrides };
  return new MonitorsService(prisma as never, {} as never, {} as never, {} as never, {} as never);
}

const TAG_DB = { id: 'tag-db', name: 'Database', color: '#3b82f6' };
const TAG_API = { id: 'tag-api', name: 'API', color: '#10b981' };

function makeMonitor(id: string, tags: typeof TAG_DB[] = [], slaTarget: number | null = 99.9) {
  return {
    id,
    name: `Monitor ${id}`,
    type: 'HTTP',
    slaTarget,
    monitorTags: tags.map((tag) => ({ tag })),
  };
}

function makeRun(monitorId: string, ok: boolean) {
  return { monitorId, ok };
}

describe('MonitorsService.slaByTag()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: MonitorsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('returns [] when no monitors exist', async () => {
    prisma.monitor.findMany.mockResolvedValue([]);
    prisma.monitorRun.findMany.mockResolvedValue([]);
    const result = await service.slaByTag('user-1');
    expect(result).toEqual([]);
  });

  it('puts monitors with no tags into Untagged bucket', async () => {
    prisma.monitor.findMany.mockResolvedValue([makeMonitor('m1', [])]);
    prisma.monitorRun.findMany.mockResolvedValue([
      makeRun('m1', true), makeRun('m1', true), makeRun('m1', false),
    ]);

    const result = await service.slaByTag('user-1');
    expect(result).toHaveLength(1);
    expect(result[0].tagId).toBeNull();
    expect(result[0].tagName).toBe('Untagged');
    expect(result[0].monitorCount).toBe(1);
  });

  it('groups monitors by tag correctly', async () => {
    prisma.monitor.findMany.mockResolvedValue([
      makeMonitor('m1', [TAG_DB]),
      makeMonitor('m2', [TAG_API]),
    ]);
    prisma.monitorRun.findMany.mockResolvedValue([
      makeRun('m1', true), makeRun('m2', true),
    ]);

    const result = await service.slaByTag('user-1');
    // Should have 2 tags, sorted alphabetically: API, Database
    expect(result).toHaveLength(2);
    expect(result[0].tagName).toBe('API');
    expect(result[0].monitorCount).toBe(1);
    expect(result[1].tagName).toBe('Database');
    expect(result[1].monitorCount).toBe(1);
  });

  it('computes weighted uptime correctly across multiple monitors in a tag', async () => {
    // m1: 9/10 ok = 90%, m2: 10/10 ok = 100%
    // Weighted: (9+10)/(10+10) = 19/20 = 95%
    prisma.monitor.findMany.mockResolvedValue([
      makeMonitor('m1', [TAG_DB]),
      makeMonitor('m2', [TAG_DB]),
    ]);
    const runs = [
      ...Array(9).fill(makeRun('m1', true)),
      makeRun('m1', false),
      ...Array(10).fill(makeRun('m2', true)),
    ];
    prisma.monitorRun.findMany.mockResolvedValue(runs);

    const result = await service.slaByTag('user-1');
    expect(result).toHaveLength(1);
    expect(result[0].tagName).toBe('Database');
    expect(result[0].uptimePct).toBeCloseTo(95, 1);
  });

  it('counts compliant monitors correctly', async () => {
    // m1: 100% (99.9 target → compliant), m2: 95% (99.9 target → breached)
    prisma.monitor.findMany.mockResolvedValue([
      makeMonitor('m1', [TAG_DB], 99.9),
      makeMonitor('m2', [TAG_DB], 99.9),
    ]);
    prisma.monitorRun.findMany.mockResolvedValue([
      ...Array(100).fill(makeRun('m1', true)),
      ...Array(95).fill(makeRun('m2', true)),
      ...Array(5).fill(makeRun('m2', false)),
    ]);

    const result = await service.slaByTag('user-1');
    const dbTag = result.find((r) => r.tagName === 'Database')!;
    expect(dbTag.compliantCount).toBe(1);
    expect(dbTag.breachedCount).toBe(1);
  });

  it('counts noDataCount for monitors with no runs', async () => {
    prisma.monitor.findMany.mockResolvedValue([
      makeMonitor('m1', [TAG_DB]),
      makeMonitor('m2', [TAG_DB]),
    ]);
    // Only m1 has runs
    prisma.monitorRun.findMany.mockResolvedValue([makeRun('m1', true)]);

    const result = await service.slaByTag('user-1');
    const dbTag = result.find((r) => r.tagName === 'Database')!;
    expect(dbTag.noDataCount).toBe(1);
  });

  it('monitor in multiple tags appears in each group', async () => {
    prisma.monitor.findMany.mockResolvedValue([
      makeMonitor('m1', [TAG_DB, TAG_API]),
    ]);
    prisma.monitorRun.findMany.mockResolvedValue([makeRun('m1', true)]);

    const result = await service.slaByTag('user-1');
    // Should appear in both DB and API tags
    expect(result).toHaveLength(2);
    const apiTag = result.find((r) => r.tagName === 'API')!;
    const dbTag = result.find((r) => r.tagName === 'Database')!;
    expect(apiTag.monitors.find((m) => m.id === 'm1')).toBeDefined();
    expect(dbTag.monitors.find((m) => m.id === 'm1')).toBeDefined();
  });

  it('tags are sorted alphabetically with Untagged at end', async () => {
    prisma.monitor.findMany.mockResolvedValue([
      makeMonitor('m1', [TAG_API]),
      makeMonitor('m2', [TAG_DB]),
      makeMonitor('m3', []), // untagged
    ]);
    prisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await service.slaByTag('user-1');
    expect(result.map((r) => r.tagName)).toEqual(['API', 'Database', 'Untagged']);
  });

  it('atRisk detection: compliant but within 0.5% of SLA target', async () => {
    // Monitor with 99.91% uptime and 99.9% SLA target → compliant but margin = 0.01% < 0.5% → atRisk
    prisma.monitor.findMany.mockResolvedValue([
      makeMonitor('m1', [TAG_DB], 99.9),
    ]);
    // 9991/10000 ok = 99.91%
    prisma.monitorRun.findMany.mockResolvedValue([
      ...Array(9991).fill(makeRun('m1', true)),
      ...Array(9).fill(makeRun('m1', false)),
    ]);

    const result = await service.slaByTag('user-1');
    const dbTag = result.find((r) => r.tagName === 'Database')!;
    expect(dbTag.compliantCount).toBe(1);
    expect(dbTag.atRiskCount).toBe(1);
    expect(dbTag.breachedCount).toBe(0);
  });

  it('withSlaTarget count excludes monitors without an SLA target', async () => {
    prisma.monitor.findMany.mockResolvedValue([
      makeMonitor('m1', [TAG_DB], 99.9),
      makeMonitor('m2', [TAG_DB], null), // no SLA target
    ]);
    prisma.monitorRun.findMany.mockResolvedValue([
      makeRun('m1', true), makeRun('m2', true),
    ]);

    const result = await service.slaByTag('user-1');
    const dbTag = result.find((r) => r.tagName === 'Database')!;
    expect(dbTag.monitorCount).toBe(2);
    expect(dbTag.withSlaTarget).toBe(1);
  });

  it('uptimePct is null when tag has monitors but none have runs', async () => {
    prisma.monitor.findMany.mockResolvedValue([makeMonitor('m1', [TAG_DB])]);
    prisma.monitorRun.findMany.mockResolvedValue([]);

    const result = await service.slaByTag('user-1');
    const dbTag = result.find((r) => r.tagName === 'Database')!;
    expect(dbTag.uptimePct).toBeNull();
  });

  it('includes tag color in result', async () => {
    prisma.monitor.findMany.mockResolvedValue([makeMonitor('m1', [TAG_DB])]);
    prisma.monitorRun.findMany.mockResolvedValue([makeRun('m1', true)]);

    const result = await service.slaByTag('user-1');
    expect(result[0].tagColor).toBe('#3b82f6');
  });
});
