import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorsAnalyticsController } from './monitors-analytics.controller';

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

function makeAnalyticsService() {
  return {
    fleetHealthReport: vi.fn(),
    monitorTrends: vi.fn(),
    monitorCorrelation: vi.fn(),
    anomalyReport: vi.fn(),
    failurePrediction: vi.fn(),
    uptimeHeatmap: vi.fn(),
    latencyHeatmap: vi.fn(),
    reliabilityTrend: vi.fn(),
    timingBreakdown: vi.fn(),
    statusTimeline: vi.fn(),
    dependencyGraph: vi.fn(),
    latencyBenchmark: vi.fn(),
    metricHistory: vi.fn(),
    failurePatterns: vi.fn(),
    geoStats: vi.fn(),
    latencyHistory: vi.fn(),
    getAssertionStats: vi.fn(),
    getTagAnalytics: vi.fn(),
    downtimeCostReport: vi.fn(),
    downtimeCostHistory: vi.fn(),
  };
}

describe('MonitorsAnalyticsController', () => {
  let controller: MonitorsAnalyticsController;
  let service: ReturnType<typeof makeAnalyticsService>;

  beforeEach(() => {
    service = makeAnalyticsService();
    controller = new MonitorsAnalyticsController(service as never);
  });

  // ─── fleetHealthReport ──────────────────────────────────────────────────

  it('fleetHealthReport() delegates to analyticsService', async () => {
    service.fleetHealthReport.mockResolvedValue({ score: 80, grade: 'B' });
    const result = await controller.fleetHealthReport(makeReq());
    expect(service.fleetHealthReport).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(expect.objectContaining({ score: 80 }));
  });

  // ─── monitorTrends ──────────────────────────────────────────────────────

  it('monitorTrends() delegates to analyticsService', async () => {
    service.monitorTrends.mockResolvedValue({ monitors: [] });
    await controller.monitorTrends(makeReq());
    expect(service.monitorTrends).toHaveBeenCalledWith('user-1');
  });

  // ─── correlation ────────────────────────────────────────────────────────

  it('correlation() passes days=7 by default', async () => {
    service.monitorCorrelation.mockResolvedValue({ pairs: [], groups: [] });
    await controller.correlation(makeReq());
    expect(service.monitorCorrelation).toHaveBeenCalledWith('user-1', 7);
  });

  it('correlation() parses days from query string', async () => {
    service.monitorCorrelation.mockResolvedValue({ pairs: [] });
    await controller.correlation(makeReq(), '14');
    expect(service.monitorCorrelation).toHaveBeenCalledWith('user-1', 14);
  });

  // ─── anomalyReport ──────────────────────────────────────────────────────

  it('anomalyReport() uses 24h by default', async () => {
    service.anomalyReport.mockResolvedValue({ anomalies: [] });
    await controller.anomalyReport(makeReq(), '24');
    expect(service.anomalyReport).toHaveBeenCalledWith('user-1', 24);
  });

  it('anomalyReport() passes valid hours values', async () => {
    service.anomalyReport.mockResolvedValue({});
    await controller.anomalyReport(makeReq(), '168');
    expect(service.anomalyReport).toHaveBeenCalledWith('user-1', 168);
  });

  it('anomalyReport() falls back to 24 for invalid hours', async () => {
    service.anomalyReport.mockResolvedValue({});
    await controller.anomalyReport(makeReq(), '99');
    expect(service.anomalyReport).toHaveBeenCalledWith('user-1', 24);
  });

  // ─── failurePrediction ──────────────────────────────────────────────────

  it('failurePrediction() delegates to analyticsService', async () => {
    service.failurePrediction.mockResolvedValue({ predictions: [] });
    await controller.getFailurePrediction(makeReq());
    expect(service.failurePrediction).toHaveBeenCalledWith('user-1');
  });

  // ─── uptimeHeatmap ──────────────────────────────────────────────────────

  it('uptimeHeatmap() defaults to 30 days', async () => {
    service.uptimeHeatmap.mockResolvedValue({ monitors: [], dates: [] });
    await controller.uptimeHeatmap(makeReq());
    expect(service.uptimeHeatmap).toHaveBeenCalledWith('user-1', 30);
  });

  it('uptimeHeatmap() clamps to max 90', async () => {
    service.uptimeHeatmap.mockResolvedValue({});
    await controller.uptimeHeatmap(makeReq(), '200');
    expect(service.uptimeHeatmap).toHaveBeenCalledWith('user-1', 90);
  });

  it('uptimeHeatmap() falls back to 30 for 0 (falsy parse)', async () => {
    service.uptimeHeatmap.mockResolvedValue({});
    // parseInt('0') || 30 === 30 because 0 is falsy
    await controller.uptimeHeatmap(makeReq(), '0');
    expect(service.uptimeHeatmap).toHaveBeenCalledWith('user-1', 30);
  });

  it('uptimeHeatmap() parses days from string', async () => {
    service.uptimeHeatmap.mockResolvedValue({});
    await controller.uptimeHeatmap(makeReq(), '14');
    expect(service.uptimeHeatmap).toHaveBeenCalledWith('user-1', 14);
  });

  // ─── latencyHeatmap ─────────────────────────────────────────────────────

  it('latencyHeatmap() defaults to 30 days', async () => {
    service.latencyHeatmap.mockResolvedValue({});
    await controller.latencyHeatmap(makeReq());
    expect(service.latencyHeatmap).toHaveBeenCalledWith('user-1', 30);
  });

  it('latencyHeatmap() passes numeric days', async () => {
    service.latencyHeatmap.mockResolvedValue({});
    await controller.latencyHeatmap(makeReq(), '7');
    expect(service.latencyHeatmap).toHaveBeenCalledWith('user-1', 7);
  });

  // ─── reliabilityTrend ───────────────────────────────────────────────────

  it('reliabilityTrend() defaults to 12 weeks', async () => {
    service.reliabilityTrend.mockResolvedValue([]);
    await controller.reliabilityTrend(makeReq());
    expect(service.reliabilityTrend).toHaveBeenCalledWith('user-1', 12);
  });

  it('reliabilityTrend() passes custom weeks', async () => {
    service.reliabilityTrend.mockResolvedValue([]);
    await controller.reliabilityTrend(makeReq(), '26');
    expect(service.reliabilityTrend).toHaveBeenCalledWith('user-1', 26);
  });

  // ─── timingBreakdown ────────────────────────────────────────────────────

  it('timingBreakdown() defaults to 30 days', async () => {
    service.timingBreakdown.mockResolvedValue({});
    await controller.timingBreakdown(makeReq());
    expect(service.timingBreakdown).toHaveBeenCalledWith('user-1', 30);
  });

  // ─── statusTimeline ─────────────────────────────────────────────────────

  it('statusTimeline() defaults to 24 hours', async () => {
    service.statusTimeline.mockResolvedValue([]);
    await controller.statusTimeline(makeReq());
    expect(service.statusTimeline).toHaveBeenCalledWith('user-1', 24);
  });

  it('statusTimeline() clamps to max 168', async () => {
    service.statusTimeline.mockResolvedValue([]);
    await controller.statusTimeline(makeReq(), '999');
    expect(service.statusTimeline).toHaveBeenCalledWith('user-1', 168);
  });

  it('statusTimeline() falls back to 24 for 0 (falsy parse)', async () => {
    service.statusTimeline.mockResolvedValue([]);
    // parseInt('0') || 24 === 24 because 0 is falsy
    await controller.statusTimeline(makeReq(), '0');
    expect(service.statusTimeline).toHaveBeenCalledWith('user-1', 24);
  });

  // ─── dependencyGraph ────────────────────────────────────────────────────

  it('dependencyGraph() delegates to analyticsService', async () => {
    service.dependencyGraph.mockResolvedValue({ nodes: [], edges: [] });
    await controller.dependencyGraph(makeReq());
    expect(service.dependencyGraph).toHaveBeenCalledWith('user-1');
  });

  // ─── latencyBench ───────────────────────────────────────────────────────

  it('latencyBench() delegates to analyticsService', async () => {
    service.latencyBenchmark.mockResolvedValue([]);
    await controller.latencyBench(makeReq());
    expect(service.latencyBenchmark).toHaveBeenCalledWith('user-1');
  });

  // ─── metricHistory ──────────────────────────────────────────────────────

  it('metricHistory() delegates with defaults', async () => {
    service.metricHistory.mockResolvedValue({ points: [] });
    await controller.metricHistory(makeReq(), 'm-1');
    expect(service.metricHistory).toHaveBeenCalledWith('user-1', 'm-1', { limit: undefined, periodDays: undefined });
  });

  it('metricHistory() clamps limit to max 500', async () => {
    service.metricHistory.mockResolvedValue({ points: [] });
    await controller.metricHistory(makeReq(), 'm-1', '1000');
    expect(service.metricHistory).toHaveBeenCalledWith('user-1', 'm-1', expect.objectContaining({ limit: 500 }));
  });

  // ─── failurePatterns ────────────────────────────────────────────────────

  it('failurePatterns() defaults to 30 days', async () => {
    service.failurePatterns.mockResolvedValue({ patterns: [] });
    await controller.failurePatterns(makeReq(), 'm-1');
    expect(service.failurePatterns).toHaveBeenCalledWith('user-1', 'm-1', 30);
  });

  it('failurePatterns() passes custom periodDays', async () => {
    service.failurePatterns.mockResolvedValue({});
    await controller.failurePatterns(makeReq(), 'm-1', '60');
    expect(service.failurePatterns).toHaveBeenCalledWith('user-1', 'm-1', 60);
  });

  // ─── geoStats ───────────────────────────────────────────────────────────

  it('geoStats() defaults to 7 days', async () => {
    service.geoStats.mockResolvedValue({ regions: [] });
    await controller.geoStats(makeReq(), 'm-1');
    expect(service.geoStats).toHaveBeenCalledWith('user-1', 'm-1', 7);
  });

  it('geoStats() passes custom periodDays', async () => {
    service.geoStats.mockResolvedValue({});
    await controller.geoStats(makeReq(), 'm-1', '14');
    expect(service.geoStats).toHaveBeenCalledWith('user-1', 'm-1', 14);
  });

  // ─── latencyHistory ─────────────────────────────────────────────────────

  it('latencyHistory() defaults to 30 days', async () => {
    service.latencyHistory.mockResolvedValue({ days: [] });
    await controller.latencyHistory(makeReq(), 'm-1');
    expect(service.latencyHistory).toHaveBeenCalledWith('user-1', 'm-1', 30);
  });

  // ─── getAssertionStats ───────────────────────────────────────────────────

  it('getAssertionStats() defaults to 30 days', async () => {
    service.getAssertionStats.mockResolvedValue({});
    await controller.getAssertionStats(makeReq(), 'm-1');
    expect(service.getAssertionStats).toHaveBeenCalledWith('user-1', 'm-1', 30);
  });

  it('getAssertionStats() falls back to 30 for non-finite input', async () => {
    service.getAssertionStats.mockResolvedValue({});
    await controller.getAssertionStats(makeReq(), 'm-1', 'NaN');
    expect(service.getAssertionStats).toHaveBeenCalledWith('user-1', 'm-1', 30);
  });

  // ─── getTagAnalytics ────────────────────────────────────────────────────

  it('getTagAnalytics() defaults to 7 days', async () => {
    service.getTagAnalytics.mockResolvedValue([]);
    await controller.getTagAnalytics(makeReq());
    expect(service.getTagAnalytics).toHaveBeenCalledWith('user-1', 7);
  });

  // ─── downtimeCostReport ─────────────────────────────────────────────────

  it('downtimeCostReport() delegates to analyticsService', async () => {
    service.downtimeCostReport.mockResolvedValue({ total: 0, monitors: [] });
    await controller.downtimeCostReport(makeReq());
    expect(service.downtimeCostReport).toHaveBeenCalledWith('user-1');
  });

  // ─── downtimeCostHistory ────────────────────────────────────────────────

  it('downtimeCostHistory() defaults to 30 days', async () => {
    service.downtimeCostHistory.mockResolvedValue({ days: [] });
    await controller.downtimeCostHistory(makeReq(), 'm-1');
    expect(service.downtimeCostHistory).toHaveBeenCalledWith('m-1', 'user-1', 30);
  });

  it('downtimeCostHistory() passes custom days', async () => {
    service.downtimeCostHistory.mockResolvedValue({});
    await controller.downtimeCostHistory(makeReq(), 'm-1', '7');
    expect(service.downtimeCostHistory).toHaveBeenCalledWith('m-1', 'user-1', 7);
  });

  // ─── user isolation ─────────────────────────────────────────────────────

  it('all calls use userId from request', async () => {
    service.fleetHealthReport.mockResolvedValue({});
    await controller.fleetHealthReport({ user: { id: 'user-42' } });
    expect(service.fleetHealthReport).toHaveBeenCalledWith('user-42');
  });
});
