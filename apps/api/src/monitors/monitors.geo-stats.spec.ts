import { describe, it, expect } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsService } from './monitors.service';

// Minimal mock of PrismaService for geo-stats tests
function makeService(overrides: {
  monitorFindFirst?: (args: unknown) => unknown;
  monitorRunFindMany?: (args: unknown) => unknown;
}): MonitorsService {
  const prismaMock = {
    monitor: {
      findFirst: overrides.monitorFindFirst ?? ((_args: unknown) => ({ id: 'mon1', userId: 'user1' })),
    },
    monitorRun: {
      findMany: overrides.monitorRunFindMany ?? ((_args: unknown) => []),
    },
  };
  // Build a minimal service with only what geoStats uses
  const svc = new MonitorsService(
    prismaMock as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );
  return svc;
}

describe('MonitorsService.geoStats', () => {
  it('returns hasGeoData: false when no runs have geoRegion set', async () => {
    const svc = makeService({
      monitorRunFindMany: () => [],
    });
    const result = await svc.geoStats('user1', 'mon1', 7);
    expect(result.hasGeoData).toBe(false);
    expect(result.regions).toHaveLength(0);
  });

  it('groups runs by region correctly', async () => {
    const svc = makeService({
      monitorRunFindMany: () => [
        { ok: true, latencyMs: 100, geoRegion: 'us-east-1' },
        { ok: true, latencyMs: 200, geoRegion: 'us-east-1' },
        { ok: false, latencyMs: 300, geoRegion: 'eu-west-1' },
      ],
    });
    const result = await svc.geoStats('user1', 'mon1', 7);
    expect(result.hasGeoData).toBe(true);
    expect(result.regions).toHaveLength(2);
    const usRegion = result.regions.find((r) => r.region === 'us-east-1');
    expect(usRegion).toBeDefined();
    expect(usRegion!.totalRuns).toBe(2);
    const euRegion = result.regions.find((r) => r.region === 'eu-west-1');
    expect(euRegion).toBeDefined();
    expect(euRegion!.totalRuns).toBe(1);
  });

  it('calculates uptimePct per region', async () => {
    const svc = makeService({
      monitorRunFindMany: () => [
        { ok: true, latencyMs: 100, geoRegion: 'us-east-1' },
        { ok: true, latencyMs: 100, geoRegion: 'us-east-1' },
        { ok: false, latencyMs: 100, geoRegion: 'us-east-1' },
        { ok: false, latencyMs: null, geoRegion: 'ap-south-1' },
      ],
    });
    const result = await svc.geoStats('user1', 'mon1', 7);
    const usRegion = result.regions.find((r) => r.region === 'us-east-1');
    expect(usRegion!.uptimePct).toBeCloseTo(66.7, 0);
    const apRegion = result.regions.find((r) => r.region === 'ap-south-1');
    expect(apRegion!.uptimePct).toBe(0);
  });

  it('calculates avgLatencyMs per region (null if no latency data)', async () => {
    const svc = makeService({
      monitorRunFindMany: () => [
        { ok: true, latencyMs: 100, geoRegion: 'us-east-1' },
        { ok: true, latencyMs: 200, geoRegion: 'us-east-1' },
        { ok: false, latencyMs: null, geoRegion: 'eu-west-1' },
      ],
    });
    const result = await svc.geoStats('user1', 'mon1', 7);
    const usRegion = result.regions.find((r) => r.region === 'us-east-1');
    expect(usRegion!.avgLatencyMs).toBe(150);
    const euRegion = result.regions.find((r) => r.region === 'eu-west-1');
    expect(euRegion!.avgLatencyMs).toBeNull();
    expect(euRegion!.p95LatencyMs).toBeNull();
  });

  it('throws NotFoundException when monitor not found', async () => {
    const svc = makeService({
      monitorFindFirst: () => null,
    });
    await expect(svc.geoStats('user1', 'nonexistent', 7)).rejects.toThrow(NotFoundException);
  });
});
