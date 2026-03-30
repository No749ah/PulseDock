import { Controller, DefaultValuePipe, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { RequireScope } from '../common/require-scope.decorator';
import { ScopeGuard } from '../common/scope.guard';
import { ApiKeyScope } from '../apikeys/apikeys.dto';
import { MonitorsAnalyticsService } from './monitors-analytics.service';

@ApiTags('Monitors')
@ApiBearerAuth()
@UseGuards(AuthGuard, ScopeGuard)
@Controller('v1/monitors')
export class MonitorsAnalyticsController {
  constructor(
    private readonly analyticsService: MonitorsAnalyticsService,
  ) {}

  // ─── Fleet Health Report ────────────────────────────────────────────────

  @Get('fleet-report')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Fleet health report',
    description:
      'Returns an executive-level health overview of the entire monitor fleet: fleet score/grade, reliability tiers, at-risk monitors, incident velocity trend, type distribution, coverage gaps, and top/worst performers.',
  })
  @ApiResponse({ status: 200, description: 'Fleet health report returned.' })
  fleetHealthReport(@Req() req: { user: { id: string } }) {
    return this.analyticsService.fleetHealthReport(req.user.id);
  }

  // ─── Trends ─────────────────────────────────────────────────────────────

  @Get('trends')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Monitor trend analysis', description: 'Returns week-over-week uptime and latency trends for all monitors. Compares current 7 days vs prior 7 days.' })
  @ApiResponse({ status: 200, description: 'Trend data returned.' })
  monitorTrends(@Req() req: { user: { id: string } }) {
    return this.analyticsService.monitorTrends(req.user.id);
  }

  // ─── Correlation ────────────────────────────────────────────────────────

  @Get('correlation')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Monitor failure correlation analysis',
    description: 'Computes pairwise Jaccard similarity of failure windows across all monitors. Identifies which monitors tend to fail together, enabling faster root cause analysis. Groups highly-correlated monitors (≥40% similarity) into failure clusters.',
  })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Look-back period in days (1–90, default 7)' })
  @ApiResponse({ status: 200, description: 'Correlation analysis returned.' })
  correlation(
    @Req() req: { user: { id: string } },
    @Query('days') days?: string,
  ) {
    return this.analyticsService.monitorCorrelation(req.user.id, days ? parseInt(days, 10) : 7);
  }

  // ─── Anomaly Report ────────────────────────────────────────────────────

  @Get('anomaly-report')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Fleet-wide anomaly report',
    description:
      'Detects significant behavioral changes across all monitors by comparing the current period against the prior period of equal duration. Identifies uptime regressions, latency spikes, flapping, failure bursts, and recoveries. Results sorted by severity (critical → low).',
  })
  @ApiQuery({ name: 'hours', required: false, type: Number, enum: [24, 48, 168], description: 'Lookback window in hours: 24 (1d), 48 (2d), or 168 (7d). Default: 24.' })
  @ApiResponse({ status: 200, description: 'Anomaly report returned.' })
  anomalyReport(
    @Req() req: { user: { id: string } },
    @Query('hours', new DefaultValuePipe(24)) hours: string,
  ) {
    const h = parseInt(hours as string, 10);
    const validH = ([24, 48, 168] as const).includes(h as 24 | 48 | 168) ? (h as 24 | 48 | 168) : 24;
    return this.analyticsService.anomalyReport(req.user.id, validH);
  }

  // ─── Failure Prediction ─────────────────────────────────────────────────

  @Get('failure-prediction')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Predict which monitors are likely to fail based on trend analysis' })
  @ApiResponse({ status: 200, description: 'Failure prediction data for all monitors' })
  getFailurePrediction(@Req() req: { user: { id: string } }) {
    return this.analyticsService.failurePrediction(req.user.id);
  }

  // ─── Uptime Heatmap ────────────────────────────────────────────────────

  @Get('heatmap')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Uptime heatmap', description: 'Returns a per-monitor × per-day uptime heatmap for the last N days (1-90). Each cell contains uptimePct, total checks, and failed checks. Monitors ordered by pinned-first then creation date.' })
  @ApiQuery({ name: 'days', required: false, description: '1-90 (default 30)' })
  @ApiResponse({ status: 200, description: 'Heatmap data returned.' })
  uptimeHeatmap(
    @Req() req: { user: { id: string } },
    @Query('days') daysParam?: string,
  ) {
    const days = Math.min(90, Math.max(1, parseInt(daysParam ?? '30', 10) || 30));
    return this.analyticsService.uptimeHeatmap(req.user.id, days);
  }

  // ─── Latency Heatmap ───────────────────────────────────────────────────

  @Get('latency-heatmap')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Fleet latency heatmap',
    description: 'Returns per-monitor x per-day average latency heatmap. HTTP/BROWSER monitors only. Grade A (<200ms) through F (>=2000ms).',
  })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Number of days (1-90, default 30)' })
  @ApiResponse({ status: 200, description: 'Latency heatmap returned.' })
  latencyHeatmap(
    @Req() req: { user: { id: string } },
    @Query('days') days?: string,
  ) {
    const d = parseInt(days ?? '30', 10);
    return this.analyticsService.latencyHeatmap(req.user.id, Number.isFinite(d) ? d : 30);
  }

  // ─── Reliability Trend ─────────────────────────────────────────────────

  @Get('reliability')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Monitor reliability trend', description: 'Weekly reliability score trend per monitor for the last N weeks (2–26).' })
  @ApiQuery({ name: 'weeks', required: false, type: Number, description: 'Number of weeks (2-26, default 12)' })
  @ApiResponse({ status: 200, description: 'Reliability trends returned.' })
  reliabilityTrend(
    @Req() req: { user: { id: string } },
    @Query('weeks') weeks?: string,
  ) {
    const w = parseInt(weeks ?? '12', 10);
    return this.analyticsService.reliabilityTrend(req.user.id, Number.isFinite(w) ? w : 12);
  }

  // ─── Timing Breakdown ──────────────────────────────────────────────────

  @Get('timing-breakdown')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'HTTP timing breakdown', description: 'Fleet-level DNS/TCP/TLS/TTFB/Download timing analysis. HTTP and Browser monitors only.' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Period in days (1-90, default 30)' })
  @ApiResponse({ status: 200, description: 'Timing breakdown returned.' })
  timingBreakdown(
    @Req() req: { user: { id: string } },
    @Query('days') days?: string,
  ) {
    const d = parseInt(days ?? '30', 10);
    return this.analyticsService.timingBreakdown(req.user.id, Number.isFinite(d) ? d : 30);
  }

  // ─── Status Timeline ──────────────────────────────────────────────────

  @Get('status-timeline')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Multi-monitor status timeline',
    description:
      'Returns a Gantt-style status timeline for all monitors. Each monitor has a list of segments ' +
      '(start, end, level) showing when it was green/yellow/red. Use hours param to control window size (1-168h, default 24h). ' +
      'Ideal for visualizing correlated outages across services.',
  })
  @ApiQuery({ name: 'hours', required: false, description: 'Window size in hours: 1–168 (default 24)' })
  @ApiResponse({ status: 200, description: 'Status timeline returned.' })
  statusTimeline(
    @Req() req: { user: { id: string } },
    @Query('hours') hoursParam?: string,
  ) {
    const hours = Math.min(168, Math.max(1, parseInt(hoursParam ?? '24', 10) || 24));
    return this.analyticsService.statusTimeline(req.user.id, hours);
  }

  // ─── Dependency Graph ─────────────────────────────────────────────────

  @Get('dependency-graph')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Monitor dependency graph',
    description:
      'Returns a full dependency topology graph for all monitors. ' +
      'Nodes include live status, latency, and 7-day uptime. ' +
      'Edges represent alert-suppression dependencies (source depends on target). ' +
      'inDegree = blast radius (how many monitors would be suppressed if this one goes down). ' +
      'outDegree = how many dependencies this monitor has. ' +
      'Useful for rendering infrastructure topology maps and understanding failure blast radius.',
  })
  @ApiResponse({ status: 200, description: 'Dependency graph data returned.' })
  dependencyGraph(@Req() req: { user: { id: string } }) {
    return this.analyticsService.dependencyGraph(req.user.id);
  }

  // ─── Latency Benchmark ────────────────────────────────────────────────

  @Get('latency-bench')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Latency benchmarks',
    description: 'Returns P50/P75/P95/P99 latency benchmarks for all HTTP and BROWSER monitors. Compares current 7-day period vs previous 7-day period.',
  })
  @ApiResponse({ status: 200, description: 'Latency benchmark data returned.' })
  latencyBench(@Req() req: { user: { id: string } }) {
    return this.analyticsService.latencyBenchmark(req.user.id);
  }

  // ─── Metric History ────────────────────────────────────────────────────

  @Get(':id/metric-history')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Get custom metric capture history',
    description: 'Returns time-series of numeric values captured from HTTP response body via the monitor metricPath JSONPath. Only populated when metricPath is configured.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max data points (default 200)' })
  @ApiQuery({ name: 'periodDays', required: false, description: 'Rolling window in days (default 30)' })
  @ApiResponse({ status: 200, description: 'Metric history returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  metricHistory(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('periodDays') periodDays?: string,
  ) {
    return this.analyticsService.metricHistory(req.user.id, id, {
      limit: limit ? Math.min(500, Math.max(1, parseInt(limit, 10))) : undefined,
      periodDays: periodDays ? Math.min(365, Math.max(1, parseInt(periodDays, 10))) : undefined,
    });
  }

  // ─── Failure Patterns ──────────────────────────────────────────────────

  @Get(':id/failure-patterns')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Failure pattern analysis for a monitor',
    description: 'Groups failed check messages into normalized patterns. Returns frequency, first/last seen, and a weekly trend for each pattern. Useful for diagnosing recurring failure causes.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'periodDays', required: false, type: Number, description: 'Number of days to look back (default 30, max 365)' })
  @ApiResponse({ status: 200, description: 'Failure pattern analysis returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  failurePatterns(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('periodDays') periodDays?: string,
  ) {
    return this.analyticsService.failurePatterns(req.user.id, id, periodDays ? parseInt(periodDays, 10) : 30);
  }

  // ─── Geo Stats ─────────────────────────────────────────────────────────

  @Get(':id/geo-stats')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Geo-distribution stats for a monitor',
    description: 'Returns per-region latency and availability stats for monitors with geoRegions configured.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'periodDays', required: false, type: Number, description: 'Number of days to look back (default 7)' })
  @ApiResponse({ status: 200, description: 'Geo stats returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  geoStats(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('periodDays') periodDays?: string,
  ) {
    return this.analyticsService.geoStats(req.user.id, id, periodDays ? parseInt(periodDays, 10) : 7);
  }

  // ─── Latency History ──────────────────────────────────────────────────

  @Get(':id/latency-history')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Daily P50/P95/P99 latency history',
    description: 'Returns per-day latency percentiles (P50, P95, P99) and uptime% for the last N days. Useful for rendering multi-line performance trend charts.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Number of days to look back (default 30, max 90)' })
  @ApiResponse({ status: 200, description: 'Daily latency history returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  latencyHistory(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    return this.analyticsService.latencyHistory(req.user.id, id, days ? parseInt(days, 10) : 30);
  }

  // ─── Assertion Stats ──────────────────────────────────────────────────

  @Get(':id/assertion-stats')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Per-assertion-type failure statistics for a monitor',
    description: 'Returns failure counts and percentages for bodyContains, jsonPath, and headerAssertion checks over the specified period.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Lookback window in days (1–90, default 30)' })
  @ApiResponse({ status: 200, description: 'Assertion stats returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  getAssertionStats(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    const d = parseInt(days ?? '30', 10);
    return this.analyticsService.getAssertionStats(req.user.id, id, Number.isFinite(d) ? d : 30);
  }

  // ─── Tag Analytics ────────────────────────────────────────────────────

  @Get('tag-analytics')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Per-tag health analytics',
    description: 'Returns aggregated uptime, incident counts, and health classification grouped by tag for all monitors. Sorted by average uptime ascending (worst first). Untagged monitors appear last.',
  })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Lookback window in days (1–90, default 7)' })
  @ApiResponse({ status: 200, description: 'Tag analytics returned.' })
  getTagAnalytics(
    @Req() req: { user: { id: string } },
    @Query('days') days?: string,
  ) {
    const d = parseInt(days ?? '7', 10);
    return this.analyticsService.getTagAnalytics(req.user.id, Number.isFinite(d) ? d : 7);
  }

  // ─── Downtime Cost Report ──────────────────────────────────────────────

  @Get('downtime-cost-report')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Fleet-level downtime cost report',
    description:
      'Returns financial impact summary for all monitors with downtimeCostPerHour configured. Analyzes last 30 days of check history. Includes per-monitor breakdown with incident counts and worst-incident cost.',
  })
  @ApiResponse({ status: 200, description: 'Downtime cost report returned.' })
  downtimeCostReport(@Req() req: { user: { id: string } }) {
    return this.analyticsService.downtimeCostReport(req.user.id);
  }

  // ─── Downtime Cost History ─────────────────────────────────────────────

  @Get(':id/downtime-cost-history')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Daily downtime cost history for a monitor',
    description: 'Returns time-series of daily cost impact for a single monitor. Requires downtimeCostPerHour to be set for meaningful cost values.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Lookback window in days (1–90, default 30)' })
  @ApiResponse({ status: 200, description: 'Daily cost history returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  downtimeCostHistory(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    const d = parseInt(days ?? '30', 10);
    return this.analyticsService.downtimeCostHistory(id, req.user.id, Number.isFinite(d) ? d : 30);
  }
}
