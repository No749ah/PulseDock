import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsDiagnosticsService } from './monitors-diagnostics.service';

function makeMonitor(overrides: Record<string, unknown> = {}) {
  return { id: 'monitor-1', userId: 'user-1', name: 'Test Monitor', ...overrides };
}

function makeRun(redirectChain: string[] = []) {
  return { redirectChain };
}

function makePrisma(
  monitor: ReturnType<typeof makeMonitor> | null,
  runs: Array<{ redirectChain: string[] }>,
) {
  return {
    monitor: {
      findFirst: vi.fn().mockResolvedValue(monitor),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue(runs),
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new (MonitorsDiagnosticsService as unknown as new (...args: unknown[]) => MonitorsDiagnosticsService)(prisma as unknown as ConstructorParameters<typeof MonitorsDiagnosticsService>[0]);
}

describe('MonitorsService.redirectChainStats', () => {
  it('returns hasRedirects: false when no runs exist', async () => {
    const prisma = makePrisma(makeMonitor(), []);
    const service = makeService(prisma);
    const result = await service.redirectChainStats('user-1', 'monitor-1');
    expect(result.hasRedirects).toBe(false);
    expect(result.avgRedirects).toBe(0);
    expect(result.maxRedirects).toBe(0);
    expect(result.commonChains).toHaveLength(0);
  });

  it('returns hasRedirects: false when all runs have empty redirectChain', async () => {
    const prisma = makePrisma(makeMonitor(), [makeRun([]), makeRun([]), makeRun([])]);
    const service = makeService(prisma);
    const result = await service.redirectChainStats('user-1', 'monitor-1');
    expect(result.hasRedirects).toBe(false);
    expect(result.avgRedirects).toBe(0);
    expect(result.maxRedirects).toBe(0);
    expect(result.commonChains).toHaveLength(0);
  });

  it('correctly calculates avgRedirects and maxRedirects', async () => {
    const runs = [
      makeRun(['http://a.com', 'https://a.com']),       // 2 hops
      makeRun(['http://b.com', 'https://b.com', 'https://www.b.com']), // 3 hops
      makeRun([]),                                        // no redirects
    ];
    const prisma = makePrisma(makeMonitor(), runs);
    const service = makeService(prisma);
    const result = await service.redirectChainStats('user-1', 'monitor-1');
    expect(result.hasRedirects).toBe(true);
    // 2 runs with redirects: total hops = 2 + 3 = 5, avg = 5/2 = 2.5
    expect(result.avgRedirects).toBe(2.5);
    expect(result.maxRedirects).toBe(3);
  });

  it('groups and sorts commonChains by count descending', async () => {
    const chainA = ['http://a.com', 'https://a.com'];
    const chainB = ['http://b.com', 'https://b.com'];
    const runs = [
      makeRun(chainA),
      makeRun(chainA),
      makeRun(chainA),
      makeRun(chainB),
      makeRun(chainB),
    ];
    const prisma = makePrisma(makeMonitor(), runs);
    const service = makeService(prisma);
    const result = await service.redirectChainStats('user-1', 'monitor-1');
    expect(result.hasRedirects).toBe(true);
    expect(result.commonChains).toHaveLength(2);
    expect(result.commonChains[0].count).toBe(3);
    expect(result.commonChains[0].chain).toEqual(chainA);
    expect(result.commonChains[1].count).toBe(2);
    expect(result.commonChains[1].chain).toEqual(chainB);
  });

  it('returns at most 5 common chains', async () => {
    // Create 7 distinct chains
    const runs = Array.from({ length: 7 }, (_, i) =>
      makeRun([`http://chain-${i}.com`, `https://chain-${i}.com`]),
    );
    const prisma = makePrisma(makeMonitor(), runs);
    const service = makeService(prisma);
    const result = await service.redirectChainStats('user-1', 'monitor-1');
    expect(result.hasRedirects).toBe(true);
    expect(result.commonChains.length).toBeLessThanOrEqual(5);
  });

  it('throws NotFoundException when monitor is not found', async () => {
    const prisma = makePrisma(null, []);
    const service = makeService(prisma);
    await expect(service.redirectChainStats('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });
});
