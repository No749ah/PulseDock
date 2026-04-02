import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorsComparisonController } from './monitors-comparison.controller';

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

function makeComparisonService() {
  return {
    compareMonitors: vi.fn(),
    getLatencyDistribution: vi.fn(),
    getPeriodComparison: vi.fn(),
    getStatusTransitions: vi.fn(),
  };
}

describe('MonitorsComparisonController', () => {
  let controller: MonitorsComparisonController;
  let service: ReturnType<typeof makeComparisonService>;

  beforeEach(() => {
    service = makeComparisonService();
    controller = new MonitorsComparisonController(service as never);
  });

  // ─── compareMonitors ────────────────────────────────────────────────────

  it('compareMonitors() splits ids and delegates to service', async () => {
    service.compareMonitors.mockResolvedValue({ monitors: [] });
    await controller.compareMonitors(makeReq(), 'm-1,m-2', 7);
    expect(service.compareMonitors).toHaveBeenCalledWith('user-1', ['m-1', 'm-2'], 7);
  });

  it('compareMonitors() coerces days to number', async () => {
    service.compareMonitors.mockResolvedValue({ monitors: [] });
    await controller.compareMonitors(makeReq(), 'm-1,m-2,m-3', 30);
    expect(service.compareMonitors).toHaveBeenCalledWith('user-1', ['m-1', 'm-2', 'm-3'], 30);
  });

  it('compareMonitors() trims whitespace from ids', async () => {
    service.compareMonitors.mockResolvedValue({ monitors: [] });
    await controller.compareMonitors(makeReq(), ' m-1 , m-2 ', 7);
    expect(service.compareMonitors).toHaveBeenCalledWith('user-1', ['m-1', 'm-2'], 7);
  });

  it('compareMonitors() filters empty strings from ids', async () => {
    service.compareMonitors.mockResolvedValue({ monitors: [] });
    await controller.compareMonitors(makeReq(), 'm-1,,m-2', 7);
    expect(service.compareMonitors).toHaveBeenCalledWith('user-1', ['m-1', 'm-2'], 7);
  });

  // ─── getLatencyDistribution ─────────────────────────────────────────────

  it('getLatencyDistribution() defaults period to 7d', async () => {
    service.getLatencyDistribution.mockResolvedValue({ buckets: [] });
    await controller.getLatencyDistribution(makeReq(), 'mon-1');
    expect(service.getLatencyDistribution).toHaveBeenCalledWith('user-1', 'mon-1', '7d');
  });

  it('getLatencyDistribution() passes valid period 24h', async () => {
    service.getLatencyDistribution.mockResolvedValue({ buckets: [] });
    await controller.getLatencyDistribution(makeReq(), 'mon-1', '24h');
    expect(service.getLatencyDistribution).toHaveBeenCalledWith('user-1', 'mon-1', '24h');
  });

  it('getLatencyDistribution() passes valid period 30d', async () => {
    service.getLatencyDistribution.mockResolvedValue({});
    await controller.getLatencyDistribution(makeReq(), 'mon-1', '30d');
    expect(service.getLatencyDistribution).toHaveBeenCalledWith('user-1', 'mon-1', '30d');
  });

  it('getLatencyDistribution() falls back to 7d for invalid period', async () => {
    service.getLatencyDistribution.mockResolvedValue({});
    await controller.getLatencyDistribution(makeReq(), 'mon-1', 'invalid');
    expect(service.getLatencyDistribution).toHaveBeenCalledWith('user-1', 'mon-1', '7d');
  });

  // ─── getPeriodComparison ────────────────────────────────────────────────

  it('getPeriodComparison() defaults to 7d', async () => {
    service.getPeriodComparison.mockResolvedValue({});
    await controller.getPeriodComparison(makeReq(), 'mon-1');
    expect(service.getPeriodComparison).toHaveBeenCalledWith('user-1', 'mon-1', '7d');
  });

  it('getPeriodComparison() passes valid period 30d', async () => {
    service.getPeriodComparison.mockResolvedValue({});
    await controller.getPeriodComparison(makeReq(), 'mon-1', '30d');
    expect(service.getPeriodComparison).toHaveBeenCalledWith('user-1', 'mon-1', '30d');
  });

  it('getPeriodComparison() falls back to 7d for unrecognized value', async () => {
    service.getPeriodComparison.mockResolvedValue({});
    await controller.getPeriodComparison(makeReq(), 'mon-1', 'weekly');
    expect(service.getPeriodComparison).toHaveBeenCalledWith('user-1', 'mon-1', '7d');
  });

  // ─── getStatusTransitions ───────────────────────────────────────────────

  it('getStatusTransitions() defaults period to 7d', async () => {
    service.getStatusTransitions.mockResolvedValue([]);
    await controller.getStatusTransitions(makeReq(), 'mon-1');
    expect(service.getStatusTransitions).toHaveBeenCalledWith('user-1', 'mon-1', '7d');
  });

  it('getStatusTransitions() passes valid period 24h', async () => {
    service.getStatusTransitions.mockResolvedValue([]);
    await controller.getStatusTransitions(makeReq(), 'mon-1', '24h');
    expect(service.getStatusTransitions).toHaveBeenCalledWith('user-1', 'mon-1', '24h');
  });

  it('getStatusTransitions() falls back to 7d for invalid period', async () => {
    service.getStatusTransitions.mockResolvedValue([]);
    await controller.getStatusTransitions(makeReq(), 'mon-1', 'bad');
    expect(service.getStatusTransitions).toHaveBeenCalledWith('user-1', 'mon-1', '7d');
  });

  // ─── user isolation ─────────────────────────────────────────────────────

  it('uses userId from request in all calls', async () => {
    service.compareMonitors.mockResolvedValue({});
    await controller.compareMonitors({ user: { id: 'user-99' } }, 'm-1,m-2', 7);
    expect(service.compareMonitors).toHaveBeenCalledWith('user-99', ['m-1', 'm-2'], 7);
  });
});
