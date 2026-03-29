import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsService } from './monitors.service';

type PrismaMonitor = { id: string; userId: string; name: string };
type PrismaRun = {
  id: string;
  checkedAt: Date;
  level: string;
  ok: boolean;
  status: number;
  latencyMs: number | null;
  message: string;
  timingsJson: unknown;
  responseSizeBytes: number | null;
  geoRegion: string | null;
  redirectChain: string[];
  capturedMetricValue: number | null;
  headerAssertionsFailed: unknown;
  responseBody: string | null;
};

function makeRun(overrides: Partial<PrismaRun> = {}): PrismaRun {
  return {
    id: 'run-1',
    checkedAt: new Date('2026-03-01T12:00:00Z'),
    level: 'ok',
    ok: true,
    status: 200,
    latencyMs: 123,
    message: 'OK',
    timingsJson: { dnsMs: 1, tcpMs: 2, tlsMs: 3, ttfbMs: 10, downloadMs: 5 },
    responseSizeBytes: 1024,
    geoRegion: 'us-east-1',
    redirectChain: ['https://example.com/'],
    capturedMetricValue: 42.5,
    headerAssertionsFailed: null,
    responseBody: null,
    ...overrides,
  };
}

function buildService(monitor: PrismaMonitor | null, runs: PrismaRun[]): MonitorsService {
  const prisma = {
    monitor: {
      findFirst: vi.fn().mockResolvedValue(monitor),
    },
    monitorRun: {
      findMany: vi.fn().mockResolvedValue(runs),
    },
  };
  return new MonitorsService(prisma as never, {} as never, {} as never, {} as never, {} as never);
}

describe('MonitorsService.exportMonitorRunsEnhanced', () => {
  const monitor: PrismaMonitor = { id: 'm1', userId: 'u1', name: 'My Monitor' };

  it('throws NotFoundException for wrong user', async () => {
    const service = buildService(null, []);
    await expect(
      service.exportMonitorRunsEnhanced('user-x', 'monitor-x', { format: 'csv', days: 30, includeTimings: false, includeAssertions: false }),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns CSV with correct headers', async () => {
    const service = buildService(monitor, [makeRun()]);
    const { data } = await service.exportMonitorRunsEnhanced('u1', 'm1', { format: 'csv', days: 30, includeTimings: false, includeAssertions: false });
    const headerRow = data.split('\n')[0];
    expect(headerRow).toContain('checkedAt');
    expect(headerRow).toContain('level');
    expect(headerRow).toContain('ok');
    expect(headerRow).toContain('latencyMs');
    expect(headerRow).toContain('statusCode');
    expect(headerRow).toContain('responseSizeBytes');
    expect(headerRow).toContain('geoRegion');
    expect(headerRow).toContain('redirectChainLength');
    expect(headerRow).toContain('capturedMetricValue');
  });

  it('includes timing columns when includeTimings=true', async () => {
    const service = buildService(monitor, [makeRun()]);
    const { data } = await service.exportMonitorRunsEnhanced('u1', 'm1', { format: 'csv', days: 30, includeTimings: true, includeAssertions: false });
    const headerRow = data.split('\n')[0];
    expect(headerRow).toContain('dnsMs');
    expect(headerRow).toContain('tcpMs');
    expect(headerRow).toContain('tlsMs');
    expect(headerRow).toContain('ttfbMs');
    expect(headerRow).toContain('downloadMs');
  });

  it('omits timing columns when includeTimings=false', async () => {
    const service = buildService(monitor, [makeRun()]);
    const { data } = await service.exportMonitorRunsEnhanced('u1', 'm1', { format: 'csv', days: 30, includeTimings: false, includeAssertions: false });
    const headerRow = data.split('\n')[0];
    expect(headerRow).not.toContain('dnsMs');
    expect(headerRow).not.toContain('tcpMs');
    expect(headerRow).not.toContain('tlsMs');
    expect(headerRow).not.toContain('ttfbMs');
    expect(headerRow).not.toContain('downloadMs');
  });

  it('limits to 10000 rows (respects take constraint)', async () => {
    // Mock returns exactly 10000 items
    const runs = Array.from({ length: 10_000 }, (_, i) => makeRun({ id: `run-${i}` }));
    const service = buildService(monitor, runs);
    const { data, totalCount } = await service.exportMonitorRunsEnhanced('u1', 'm1', { format: 'csv', days: 30, includeTimings: false, includeAssertions: false });
    expect(totalCount).toBe(10_000);
    // Header + 10000 data rows = 10001 lines
    const lines = data.split('\n');
    expect(lines.length).toBe(10_001);
  });
});
