import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorsRunsController } from './monitors-runs.controller';

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

function makeCrudService() {
  return {
    getRecentRuns: vi.fn(),
    monitorRuns: vi.fn(),
    exportMonitorRuns: vi.fn(),
    exportMonitorRunsEnhanced: vi.fn(),
    monitorUptime: vi.fn(),
    monitorChart: vi.fn(),
    getLatencyBudgetReport: vi.fn(),
    liveFeed: vi.fn(),
  };
}

function makeRes() {
  return {
    setHeader: vi.fn(),
    send: vi.fn(),
  } as unknown as import('express').Response;
}

describe('MonitorsRunsController', () => {
  let controller: MonitorsRunsController;
  let service: ReturnType<typeof makeCrudService>;

  beforeEach(() => {
    service = makeCrudService();
    controller = new MonitorsRunsController(service as never);
  });

  // ─── getRecentRuns ──────────────────────────────────────────────────────

  it('getRecentRuns() parses limit and delegates', async () => {
    service.getRecentRuns.mockResolvedValue([]);
    await controller.getRecentRuns(makeReq(), '25', undefined);
    expect(service.getRecentRuns).toHaveBeenCalledWith('user-1', 25, undefined);
  });

  it('getRecentRuns() defaults to 10 when limit not provided', async () => {
    service.getRecentRuns.mockResolvedValue([]);
    await controller.getRecentRuns(makeReq(), undefined, undefined);
    expect(service.getRecentRuns).toHaveBeenCalledWith('user-1', 10, undefined);
  });

  it('getRecentRuns() parses since as Date', async () => {
    service.getRecentRuns.mockResolvedValue([]);
    const since = '2026-01-01T00:00:00Z';
    await controller.getRecentRuns(makeReq(), '5', since);
    expect(service.getRecentRuns).toHaveBeenCalledWith('user-1', 5, new Date(since));
  });

  it('getRecentRuns() defaults limit to 10 for non-numeric string', async () => {
    service.getRecentRuns.mockResolvedValue([]);
    await controller.getRecentRuns(makeReq(), 'bad', undefined);
    expect(service.getRecentRuns).toHaveBeenCalledWith('user-1', 10, undefined);
  });

  // ─── monitorRuns ────────────────────────────────────────────────────────

  it('monitorRuns() delegates with all query options', async () => {
    service.monitorRuns.mockResolvedValue({ runs: [], total: 0 });
    await controller.monitorRuns(makeReq(), 'm-1', '100', undefined, 'all');
    expect(service.monitorRuns).toHaveBeenCalledWith('user-1', 'm-1', { limit: '100', before: undefined, status: 'all' });
  });

  it('monitorRuns() passes before cursor', async () => {
    service.monitorRuns.mockResolvedValue({ runs: [] });
    const before = '2026-01-01T00:00:00Z';
    await controller.monitorRuns(makeReq(), 'm-1', '50', before, 'failed');
    expect(service.monitorRuns).toHaveBeenCalledWith('user-1', 'm-1', { limit: '50', before, status: 'failed' });
  });

  // ─── exportMonitorRuns ──────────────────────────────────────────────────

  it('exportMonitorRuns() sends CSV with correct content-type header', async () => {
    service.exportMonitorRuns.mockResolvedValue({
      csv: 'id,checkedAt\nrun-1,2026-01-01',
      filename: 'pulsedock-runs-2026-01-01.csv',
    });
    const res = makeRes();
    await controller.exportMonitorRuns(makeReq(), 'm-1', res);
    expect(service.exportMonitorRuns).toHaveBeenCalledWith('user-1', 'm-1');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="pulsedock-runs-2026-01-01.csv"');
    expect(res.send).toHaveBeenCalledWith('id,checkedAt\nrun-1,2026-01-01');
  });

  it('exportMonitorRuns() sets Cache-Control no-cache', async () => {
    service.exportMonitorRuns.mockResolvedValue({ csv: '', filename: 'f.csv' });
    const res = makeRes();
    await controller.exportMonitorRuns(makeReq(), 'm-1', res);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
  });

  // ─── exportMonitorRunsEnhanced ──────────────────────────────────────────

  it('exportMonitorRunsEnhanced() defaults to CSV format', async () => {
    service.exportMonitorRunsEnhanced.mockResolvedValue({
      data: 'id,ok\n',
      filename: 'export.csv',
      totalCount: 10,
    });
    const res = makeRes();
    await controller.exportMonitorRunsEnhanced(makeReq(), 'm-1', 'csv', 30, 'false', 'false', res);
    expect(service.exportMonitorRunsEnhanced).toHaveBeenCalledWith(
      'user-1', 'm-1',
      expect.objectContaining({ format: 'csv', days: 30, includeTimings: false, includeAssertions: false }),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
  });

  it('exportMonitorRunsEnhanced() uses JSON format when requested', async () => {
    service.exportMonitorRunsEnhanced.mockResolvedValue({ data: '[]', filename: 'export.json', totalCount: 0 });
    const res = makeRes();
    await controller.exportMonitorRunsEnhanced(makeReq(), 'm-1', 'json', 30, 'false', 'false', res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');
  });

  it('exportMonitorRunsEnhanced() parses includeTimings and includeAssertions', async () => {
    service.exportMonitorRunsEnhanced.mockResolvedValue({ data: '', filename: 'f.csv', totalCount: 0 });
    const res = makeRes();
    await controller.exportMonitorRunsEnhanced(makeReq(), 'm-1', 'csv', 30, 'true', 'true', res);
    expect(service.exportMonitorRunsEnhanced).toHaveBeenCalledWith(
      'user-1', 'm-1',
      expect.objectContaining({ includeTimings: true, includeAssertions: true }),
    );
  });

  it('exportMonitorRunsEnhanced() sets X-Total-Count header', async () => {
    service.exportMonitorRunsEnhanced.mockResolvedValue({ data: '', filename: 'f.csv', totalCount: 42 });
    const res = makeRes();
    await controller.exportMonitorRunsEnhanced(makeReq(), 'm-1', 'csv', 30, 'false', 'false', res);
    expect(res.setHeader).toHaveBeenCalledWith('X-Total-Count', '42');
  });

  // ─── monitorUptime ──────────────────────────────────────────────────────

  it('monitorUptime() passes valid period', async () => {
    service.monitorUptime.mockResolvedValue({ uptimePct: 99.5 });
    await controller.monitorUptime(makeReq(), 'm-1', '7d');
    expect(service.monitorUptime).toHaveBeenCalledWith('user-1', 'm-1', '7d');
  });

  it('monitorUptime() falls back to 30d for invalid period', async () => {
    service.monitorUptime.mockResolvedValue({ uptimePct: 99 });
    await controller.monitorUptime(makeReq(), 'm-1', 'bad');
    expect(service.monitorUptime).toHaveBeenCalledWith('user-1', 'm-1', '30d');
  });

  it('monitorUptime() supports all valid periods', async () => {
    service.monitorUptime.mockResolvedValue({ uptimePct: 99 });
    for (const period of ['1d', '7d', '30d', '90d']) {
      await controller.monitorUptime(makeReq(), 'm-1', period);
      expect(service.monitorUptime).toHaveBeenCalledWith('user-1', 'm-1', period);
    }
  });

  // ─── monitorChart ────────────────────────────────────────────────────────

  it('monitorChart() passes valid period', async () => {
    service.monitorChart.mockResolvedValue({ buckets: [] });
    await controller.monitorChart(makeReq(), 'm-1', '7d');
    expect(service.monitorChart).toHaveBeenCalledWith('user-1', 'm-1', '7d');
  });

  it('monitorChart() falls back to 7d for invalid period', async () => {
    service.monitorChart.mockResolvedValue({ buckets: [] });
    await controller.monitorChart(makeReq(), 'm-1', 'invalid');
    expect(service.monitorChart).toHaveBeenCalledWith('user-1', 'm-1', '7d');
  });

  // ─── getLatencyBudgetReport ──────────────────────────────────────────────

  it('getLatencyBudgetReport() delegates to crudService', async () => {
    service.getLatencyBudgetReport.mockResolvedValue({ consumed: 12.5, budget: 5 });
    const result = await controller.getLatencyBudgetReport(makeReq(), 'm-1') as Record<string, unknown>;
    expect(service.getLatencyBudgetReport).toHaveBeenCalledWith('user-1', 'm-1');
    expect(result['consumed']).toBe(12.5);
  });

  // ─── liveFeed ────────────────────────────────────────────────────────────

  it('liveFeed() defaults to 100 items', async () => {
    service.liveFeed.mockResolvedValue({ items: [], stats: {} });
    await controller.liveFeed(makeReq());
    expect(service.liveFeed).toHaveBeenCalledWith('user-1', expect.objectContaining({ limit: 100 }));
  });

  it('liveFeed() caps limit at 200', async () => {
    service.liveFeed.mockResolvedValue({ items: [] });
    await controller.liveFeed(makeReq(), '999');
    expect(service.liveFeed).toHaveBeenCalledWith('user-1', expect.objectContaining({ limit: 200 }));
  });

  it('liveFeed() passes level and type filters', async () => {
    service.liveFeed.mockResolvedValue({ items: [] });
    await controller.liveFeed(makeReq(), '50', undefined, 'red', 'HTTP');
    expect(service.liveFeed).toHaveBeenCalledWith('user-1', expect.objectContaining({ level: 'red', type: 'HTTP' }));
  });

  it('liveFeed() passes since parameter', async () => {
    service.liveFeed.mockResolvedValue({ items: [] });
    const since = '2026-01-01T00:00:00Z';
    await controller.liveFeed(makeReq(), undefined, since);
    expect(service.liveFeed).toHaveBeenCalledWith('user-1', expect.objectContaining({ since }));
  });
});
