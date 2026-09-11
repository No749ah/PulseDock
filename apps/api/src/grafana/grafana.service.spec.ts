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
      expect(results).toContain('My_API.flap');
      expect(results).toContain('My_DB.uptime');
      expect(results).toHaveLength(8);
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

    it('returns flap timeseries (1=flapping, 0=stable)', async () => {
      (mockPrisma.monitor.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'My API' });
      // Pattern: ok, fail, ok, fail, ok — 4 state changes → flapping at end
      (mockPrisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { ok: true,  checkedAt: new Date('2026-03-20T10:00:00Z') },
        { ok: false, checkedAt: new Date('2026-03-20T10:01:00Z') },
        { ok: true,  checkedAt: new Date('2026-03-20T10:02:00Z') },
        { ok: false, checkedAt: new Date('2026-03-20T10:03:00Z') },
        { ok: true,  checkedAt: new Date('2026-03-20T10:04:00Z') },
      ]);

      const service = makeService();
      const result = await service.query('user-1', {
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-20T23:59:59Z' },
        intervalMs: 60000,
        maxDataPoints: 1000,
        targets: [{ target: 'My_API.flap' }],
      });

      expect(result).toHaveLength(1);
      const ts = result[0] as { target: string; datapoints: [number, number][] };
      expect(ts.target).toBe('My_API.flap');
      expect(ts.datapoints).toHaveLength(5);
      // Last run has 4 state changes in 5-run window → flapping
      expect(ts.datapoints[4][0]).toBe(1);
      // First run has no prior context → not flapping
      expect(ts.datapoints[0][0]).toBe(0);
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
        { id: 'm1', name: 'API', type: 'HTTP', target: 'https://example.com', enabled: true, isFlapping: false },
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

  describe('query() — uptime timeseries', () => {
    it('returns uptime timeseries with daily buckets', async () => {
      (mockPrisma.monitor.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'My API' });
      (mockPrisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { ok: true, checkedAt: new Date('2026-03-20T08:00:00Z') },
        { ok: true, checkedAt: new Date('2026-03-20T09:00:00Z') },
        { ok: false, checkedAt: new Date('2026-03-20T10:00:00Z') },
        { ok: true, checkedAt: new Date('2026-03-21T08:00:00Z') },
      ]);

      const service = makeService();
      const result = await service.query('user-1', {
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-22T00:00:00Z' },
        intervalMs: 60000,
        maxDataPoints: 1000,
        targets: [{ target: 'My_API.uptime' }],
      });

      expect(result).toHaveLength(1);
      const ts = result[0] as { target: string; datapoints: [number, number][] };
      expect(ts.target).toBe('My_API.uptime');
      // Day 2026-03-20: 2 ok out of 3 = 66.67%
      expect(ts.datapoints[0][0]).toBeCloseTo(66.67, 1);
      // Day 2026-03-21: 1 ok out of 1 = 100%
      expect(ts.datapoints[1][0]).toBe(100);
    });

    it('returns 0% uptime for a day with all failures', async () => {
      (mockPrisma.monitor.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'SVC' });
      (mockPrisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { ok: false, checkedAt: new Date('2026-03-20T08:00:00Z') },
        { ok: false, checkedAt: new Date('2026-03-20T09:00:00Z') },
      ]);

      const service = makeService();
      const result = await service.query('user-1', {
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-21T00:00:00Z' },
        intervalMs: 60000,
        maxDataPoints: 1000,
        targets: [{ target: 'SVC.uptime' }],
      });

      const ts = result[0] as { datapoints: [number, number][] };
      expect(ts.datapoints[0][0]).toBe(0);
    });

    it('returns empty datapoints when no runs exist', async () => {
      (mockPrisma.monitor.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'Empty' });
      (mockPrisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const service = makeService();
      const result = await service.query('user-1', {
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-21T00:00:00Z' },
        intervalMs: 60000,
        maxDataPoints: 1000,
        targets: [{ target: 'Empty.uptime' }],
      });

      const ts = result[0] as { datapoints: [number, number][] };
      expect(ts.datapoints).toHaveLength(0);
    });
  });

  describe('query() — edge cases', () => {
    it('skips targets with no dot separator', async () => {
      const service = makeService();
      const result = await service.query('user-1', {
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-20T23:59:59Z' },
        intervalMs: 60000,
        maxDataPoints: 1000,
        targets: [{ target: 'nodot' }],
      });

      expect(result).toHaveLength(0);
    });

    it('skips unrecognised metric names', async () => {
      (mockPrisma.monitor.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'My API' });

      const service = makeService();
      const result = await service.query('user-1', {
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-20T23:59:59Z' },
        intervalMs: 60000,
        maxDataPoints: 1000,
        targets: [{ target: 'My_API.unknown_metric' }],
      });

      expect(result).toHaveLength(0);
    });

    it('handles table target via type=table (not just all_monitors.table)', async () => {
      (mockPrisma.monitor.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const service = makeService();
      const result = await service.query('user-1', {
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-20T23:59:59Z' },
        intervalMs: 60000,
        maxDataPoints: 1000,
        targets: [{ target: 'anything', type: 'table' }],
      });

      expect(result).toHaveLength(1);
      const table = result[0] as { type: string };
      expect(table.type).toBe('table');
    });

    it('handles maxDataPoints=0 gracefully (defaults to 1000)', async () => {
      (mockPrisma.monitor.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1', name: 'Svc' });
      (mockPrisma.monitorRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { latencyMs: 10, checkedAt: new Date('2026-03-20T10:00:00Z') },
      ]);

      const service = makeService();
      const result = await service.query('user-1', {
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-20T23:59:59Z' },
        intervalMs: 60000,
        maxDataPoints: 0,
        targets: [{ target: 'Svc.latency' }],
      });

      expect(result).toHaveLength(1);
    });
  });

  describe('annotations() — edge cases', () => {
    it('returns empty annotations when no incidents in range', async () => {
      (mockPrisma.incident.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const service = makeService();
      const result = await service.annotations('user-1', {
        annotation: { name: 'Incidents', enable: true },
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-20T23:59:59Z' },
      });

      expect(result).toHaveLength(0);
    });

    it('handles incidents without resolvedAt', async () => {
      (mockPrisma.incident.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          title: 'Ongoing issue',
          severity: 'MEDIUM',
          status: 'INVESTIGATING',
          createdAt: new Date('2026-03-20T08:00:00Z'),
          resolvedAt: null,
        },
      ]);

      const service = makeService();
      const result = await service.annotations('user-1', {
        annotation: { name: 'Incidents', enable: true },
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-20T23:59:59Z' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].timeEnd).toBeUndefined();
      expect(result[0].title).toBe('Incident: Ongoing issue');
    });

    it('uses default iconColor when not provided', async () => {
      (mockPrisma.incident.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          title: 'Test',
          severity: null,
          status: 'OPEN',
          createdAt: new Date('2026-03-20T08:00:00Z'),
          resolvedAt: null,
        },
      ]);

      const service = makeService();
      const result = await service.annotations('user-1', {
        annotation: { name: 'Incidents', enable: true },
        range: { from: '2026-03-19T00:00:00Z', to: '2026-03-20T23:59:59Z' },
      });

      expect(result[0].annotation.iconColor).toBe('red');
      expect(result[0].tags).toContain('unknown');
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

    it('returns status values for key=status', async () => {
      const service = makeService();
      const result = await service.tagValues('user-1', 'status');
      expect(result).toEqual([
        { text: 'up' },
        { text: 'down' },
        { text: 'degraded' },
        { text: 'paused' },
      ]);
    });

    it('returns empty array for unknown key', async () => {
      const service = makeService();
      const result = await service.tagValues('user-1', 'unknown_key');
      expect(result).toEqual([]);
    });
  });
});
