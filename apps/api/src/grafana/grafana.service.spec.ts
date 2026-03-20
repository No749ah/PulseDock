import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GrafanaService } from './grafana.service';
import type { PrismaService } from '../common/prisma.service';

const mockPrisma = {
  monitor: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  monitorRun: {
    findMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  incident: {
    findMany: vi.fn(),
  },
} as unknown as PrismaService;

function makeService() {
  return new GrafanaService(mockPrisma);
}

describe('GrafanaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('search()', () => {
    it('returns metric targets for all enabled monitors', async () => {
      (mockPrisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'm1', name: 'My API' },
        { id: 'm2', name: 'My DB' },
      ]);

      const service = makeService();
      const results = await service.search('user-1', '');

      expect(results).toContain('My_API.uptime');
      expect(results).toContain('My_API.latency');
      expect(results).toContain('My_API.status');
      expect(results).toContain('My_DB.uptime');
      expect(results).toHaveLength(6);
    });

    it('filters by query string', async () => {
      (mockPrisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'm1', name: 'My API' },
        { id: 'm2', name: 'My DB' },
      ]);

      const service = makeService();
      const results = await service.search('user-1', 'latency');

      expect(results).toContain('My_API.latency');
      expect(results).toContain('My_DB.latency');
      expect(results).not.toContain('My_API.uptime');
      expect(results).toHaveLength(2);
    });
  });

  describe('query()', () => {
    it('returns latency timeseries for monitor.latency target', async () => {
      (mockPrisma.monitor.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'My API' });
      (mockPrisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { latencyMs: 42, checkedAt: new Date('2026-03-20T10:00:00Z') },
        { latencyMs: 55, checkedAt: new Date('2026-03-20T10:01:00Z') },
      ]);

      const service = makeService();
      const result = await service.query('user-1', {
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-20T23:59:59Z' },
        intervalMs: 60000,
        maxDataPoints: 1000,
        targets: [{ target: 'My_API.latency' }],
      });

      expect(result).toHaveLength(1);
      const ts = result[0] as { target: string; datapoints: [number, number][] };
      expect(ts.target).toBe('My_API.latency');
      expect(ts.datapoints[0][0]).toBe(42);
    });

    it('returns status timeseries (1=ok, 0=down)', async () => {
      (mockPrisma.monitor.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'My API' });
      (mockPrisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { ok: true, checkedAt: new Date('2026-03-20T10:00:00Z') },
        { ok: false, checkedAt: new Date('2026-03-20T10:01:00Z') },
      ]);

      const service = makeService();
      const result = await service.query('user-1', {
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-20T23:59:59Z' },
        intervalMs: 60000,
        maxDataPoints: 1000,
        targets: [{ target: 'My_API.status' }],
      });

      const ts = result[0] as { datapoints: [number, number][] };
      expect(ts.datapoints[0][0]).toBe(1);
      expect(ts.datapoints[1][0]).toBe(0);
    });

    it('returns empty array when monitor not found', async () => {
      (mockPrisma.monitor.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const service = makeService();
      const result = await service.query('user-1', {
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-20T23:59:59Z' },
        intervalMs: 60000,
        maxDataPoints: 1000,
        targets: [{ target: 'Unknown_Monitor.latency' }],
      });

      expect(result).toHaveLength(0);
    });

    it('returns all_monitors table', async () => {
      (mockPrisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'm1', name: 'API', type: 'HTTP', target: 'https://example.com', enabled: true },
      ]);
      (mockPrisma.monitorRun.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
        _count: { _all: 100 },
        _avg: { latencyMs: 42 },
      });
      (mockPrisma.monitorRun.count as ReturnType<typeof vi.fn>).mockResolvedValue(99);

      const service = makeService();
      const result = await service.query('user-1', {
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-20T23:59:59Z' },
        intervalMs: 60000,
        maxDataPoints: 1000,
        targets: [{ target: 'all_monitors.table', type: 'table' }],
      });

      expect(result).toHaveLength(1);
      const table = result[0] as { type: string; columns: { text: string }[]; rows: unknown[][] };
      expect(table.type).toBe('table');
      expect(table.columns[0].text).toBe('Monitor');
      expect(table.rows[0][0]).toBe('API');
      expect(table.rows[0][3]).toBe(99); // 99% uptime
    });
  });

  describe('annotations()', () => {
    it('returns incident annotations in range', async () => {
      (mockPrisma.incident.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          title: 'API outage',
          severity: 'HIGH',
          status: 'RESOLVED',
          createdAt: new Date('2026-03-20T08:00:00Z'),
          resolvedAt: new Date('2026-03-20T09:00:00Z'),
        },
      ]);

      const service = makeService();
      const result = await service.annotations('user-1', {
        annotation: { name: 'Incidents', enable: true, iconColor: 'red' },
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-20T23:59:59Z' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Incident: API outage');
      expect(result[0].tags).toContain('incident');
    });
  });

  describe('tagValues()', () => {
    it('returns monitor names for key=monitor', async () => {
      (mockPrisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { name: 'My API' },
        { name: 'My DB' },
      ]);

      const service = makeService();
      const result = await service.tagValues('user-1', 'monitor');

      expect(result).toEqual([{ text: 'My API' }, { text: 'My DB' }]);
    });

    it('returns static type values for key=type', async () => {
      const service = makeService();
      const result = await service.tagValues('user-1', 'type');
      expect(result.map((v) => v.text)).toContain('HTTP');
      expect(result.map((v) => v.text)).toContain('TCP');
    });

    it('returns empty array for unknown key', async () => {
      const service = makeService();
      const result = await service.tagValues('user-1', 'unknown_key');
      expect(result).toEqual([]);
    });
  });
});
