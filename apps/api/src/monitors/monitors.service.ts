import { Injectable } from '@nestjs/common';
import type { MonitorType } from '../types';
import type { PlaygroundDto, PlaygroundResult } from './playground.dto';
import { MonitorsCrudService } from './monitors-crud.service';
import { MonitorsAnalyticsService } from './monitors-analytics.service';
import { MonitorsSlaService } from './monitors-sla.service';
import { MonitorsDiagnosticsService } from './monitors-diagnostics.service';
import { MonitorsExportService } from './monitors-export.service';
import { MonitorsComparisonService } from './monitors-comparison.service';

export { simulateAlertRules } from './monitors-crud.service';
export type { SimulateRun, SimulateConfig, SimulateAlertsResult } from './monitors-crud.service';
export { pearsonCorrelation } from './monitors-comparison.service';
export { linearRegression } from './monitors-analytics.service';
export type { SuggestedMonitor, OpenApiSuggestion } from './monitors-export.service';
import type { SuggestedMonitor, OpenApiSuggestion } from './monitors-export.service';

@Injectable()
export class MonitorsService {
  constructor(
    private readonly crud: MonitorsCrudService,
    private readonly analytics: MonitorsAnalyticsService,
    private readonly sla: MonitorsSlaService,
    private readonly diagnostics: MonitorsDiagnosticsService,
    private readonly exportSvc: MonitorsExportService,
    private readonly comparison: MonitorsComparisonService,
  ) {}

    listPlugins() {
    return this.crud.listPlugins();
  }

    async list(userId: string, tagFilter?: string) {
    return this.crud.list(userId, tagFilter);
  }

    async getOne(userId: string, monitorId: string) {
    return this.crud.getOne(userId, monitorId);
  }

    async create(userId: string, body: {
    name: string;
    description?: string;
    runbookUrl?: string;
    target: string;
    type: MonitorType;
    intervalSec?: number;
    timeoutMs?: number;
    confirmations?: number;
    retryCount?: number;
    config?: Record<string, unknown>;
    alertChannelIds?: string[];
    folderId?: string | null;
    tags?: string[];
    enabled?: boolean;
    slaTarget?: number;
    slaPeriodDays?: number;
    autoIncident?: boolean;
    autoIncidentSeverity?: string;
    flapDetectionEnabled?: boolean;
    flapWindow?: number;
    flapThreshold?: number;
    latencyAlertMs?: number | null;
    latencyBudgetMs?: number | null;
    anomalyDetection?: boolean;
    anomalyMultiplier?: number;
    cronExpression?: string | null;
    scheduleEnabled?: boolean;
    scheduleDays?: string;
    scheduleStartHour?: number;
    scheduleEndHour?: number;
    sliLatencyTarget?: number;
    sliLatencyWindow?: number;
    trackedHeaders?: string | null;
    rtoMinutes?: number | null;
    statusWebhookSecret?: string | null;
    statusWebhookUrl?: string | null;
    throttleMs?: number;
    maxChecksPerHour?: number;
    adaptiveIntervalEnabled?: boolean;
    adaptiveIntervalDownSec?: number | null;
    adaptiveIntervalDegradedSec?: number | null;
    geoRegions?: string[];
    metricPath?: string | null;
    metricName?: string | null;
    metricUnit?: string | null;
    metricAlertMin?: number | null;
    metricAlertMax?: number | null;
    headerAssertions?: Array<{ header: string; op: string; value?: string }> | null;
    graphqlQuery?: string | null;
    graphqlVariables?: string | null;
    graphqlDataPath?: string | null;
    graphqlExpectedValue?: string | null;
    downtimeCostPerHour?: number | null;
    priority?: number;
  }) {
    return this.crud.create(userId, body);
  }

    async update(userId: string, monitorId: string, body: {
    name?: string;
    description?: string | null;
    runbookUrl?: string | null;
    target?: string;
    type?: MonitorType;
    intervalSec?: number;
    timeoutMs?: number;
    confirmations?: number;
    retryCount?: number;
    config?: Record<string, unknown>;
    alertChannelIds?: string[];
    folderId?: string | null;
    enabled?: boolean;
    tags?: string[];
    slaTarget?: number | null;
    slaPeriodDays?: number | null;
    autoIncident?: boolean;
    autoIncidentSeverity?: string;
    flapDetectionEnabled?: boolean;
    flapWindow?: number;
    flapThreshold?: number;
    latencyAlertMs?: number | null;
    latencyBudgetMs?: number | null;
    anomalyDetection?: boolean;
    anomalyMultiplier?: number;
    cronExpression?: string | null;
    scheduleEnabled?: boolean;
    scheduleDays?: string;
    scheduleStartHour?: number;
    scheduleEndHour?: number;
    sliLatencyTarget?: number | null;
    sliLatencyWindow?: number;
    trackedHeaders?: string | null;
    rtoMinutes?: number | null;
    statusWebhookSecret?: string | null;
    statusWebhookUrl?: string | null;
    throttleMs?: number | null;
    maxChecksPerHour?: number | null;
    adaptiveIntervalEnabled?: boolean;
    adaptiveIntervalDownSec?: number | null;
    adaptiveIntervalDegradedSec?: number | null;
    geoRegions?: string[];
    metricPath?: string | null;
    metricName?: string | null;
    metricUnit?: string | null;
    metricAlertMin?: number | null;
    metricAlertMax?: number | null;
    headerAssertions?: Array<{ header: string; op: string; value?: string }> | null;
    graphqlQuery?: string | null;
    graphqlVariables?: string | null;
    graphqlDataPath?: string | null;
    graphqlExpectedValue?: string | null;
    downtimeCostPerHour?: number | null;
    priority?: number;
  }) {
    return this.crud.update(userId, monitorId, body);
  }

    async getConfigHistory(userId: string, monitorId: string, limit = 50) {
    return this.crud.getConfigHistory(userId, monitorId, limit);
  }

    async remove(userId: string, monitorId: string) {
    return this.crud.remove(userId, monitorId);
  }

    async clone(userId: string, monitorId: string) {
    return this.crud.clone(userId, monitorId);
  }

    async bulkAction(userId: string, ids: string[], action: 'enable' | 'disable' | 'delete' | 'run' | 'add-tag' | 'remove-tag' | 'update-interval' | 'update-timeout' | 'update-confirmations' | 'pause', tagId?: string, value?: number) {
    return this.crud.bulkAction(userId, ids, action, tagId, value);
  }

    async bulkEdit(userId: string, body: {
    ids: string[];
    intervalSec?: number;
    timeoutMs?: number;
    confirmations?: number;
    retryCount?: number;
    flapDetectionEnabled?: boolean;
    latencyAlertMs?: number | null;
    slaTarget?: number | null;
    enabled?: boolean;
    folderId?: string | null;
    alertChannelIds?: string[];
    priority?: number;
  }): Promise<{ ok: boolean; affected: number; errors: Array<{ id: string; error: string }> }> {
    return this.crud.bulkEdit(userId, body);
  }

    async listMonitorAlerts(userId: string, monitorId: string) {
    return this.crud.listMonitorAlerts(userId, monitorId);
  }

    async addMonitorAlert(userId: string, monitorId: string, channelId: string, notifyOn?: string, repeatIntervalMin?: number) {
    return this.crud.addMonitorAlert(userId, monitorId, channelId, notifyOn, repeatIntervalMin);
  }

    async updateMonitorAlertNotifyOn(userId: string, monitorId: string, channelId: string, notifyOn: string) {
    return this.crud.updateMonitorAlertNotifyOn(userId, monitorId, channelId, notifyOn);
  }

    async updateMonitorAlertRepeatInterval(userId: string, monitorId: string, channelId: string, intervalMin: number | null) {
    return this.crud.updateMonitorAlertRepeatInterval(userId, monitorId, channelId, intervalMin);
  }

    async updateMonitorAlertEscalationPolicy(userId: string, monitorId: string, channelId: string, policyId: string | null) {
    return this.crud.updateMonitorAlertEscalationPolicy(userId, monitorId, channelId, policyId);
  }

    async removeMonitorAlert(userId: string, monitorId: string, channelId: string) {
    return this.crud.removeMonitorAlert(userId, monitorId, channelId);
  }

    async snooze(userId: string, monitorId: string, hours: number) {
    return this.crud.snooze(userId, monitorId, hours);
  }

    async runNow(userId: string, monitorId: string) {
    return this.crud.runNow(userId, monitorId);
  }

    async getRecentRuns(userId: string, limit = 10, since?: Date) {
    return this.crud.getRecentRuns(userId, limit, since);
  }

    async liveFeed(
    userId: string,
    opts?: { limit?: number; since?: string; level?: string; type?: string },
  ) {
    return this.crud.liveFeed(userId, opts);
  }

    async runs(userId: string) {
    return this.crud.runs(userId);
  }

    async monitorRuns(
    userId: string,
    monitorId: string,
    opts?: { limit?: string; before?: string; status?: string },
  ) {
    return this.crud.monitorRuns(userId, monitorId, opts);
  }

    async exportMonitorRuns(userId: string, monitorId: string): Promise<{ csv: string; filename: string; monitorName: string }> {
    return this.crud.exportMonitorRuns(userId, monitorId);
  }

    async getLatencyBudgetReport(
    userId: string,
    monitorId: string,
  ): Promise<{
    monitorId: string;
    monitorName: string;
    latencyBudgetMs: number | null;
    periodStart: string;
    periodEnd: string;
    totalChecks: number;
    checksAboveBudget: number;
    budgetUsedPct: number;
    avgLatencyMs: number | null;
    p95LatencyMs: number | null;
    status: 'no-budget' | 'healthy' | 'warning' | 'exceeded';
  }> {
    return this.crud.getLatencyBudgetReport(userId, monitorId);
  }

    async exportMonitorRunsEnhanced(
    userId: string,
    monitorId: string,
    opts: {
      format: 'csv' | 'json';
      days: number;
      includeTimings: boolean;
      includeAssertions: boolean;
    },
  ): Promise<{ data: string; filename: string; totalCount: number }> {
    return this.crud.exportMonitorRunsEnhanced(userId, monitorId, opts);
  }

    async monitorUptime(userId: string, monitorId: string, period: '1d' | '7d' | '30d' | '90d' = '30d') {
    return this.crud.monitorUptime(userId, monitorId, period);
  }

    async monitorChart(userId: string, monitorId: string, period: '1d' | '7d' | '30d' | '90d' = '7d') {
    return this.crud.monitorChart(userId, monitorId, period);
  }

    async testVersionConnection(input: { provider: 'github' | 'gitlab' | 'forgejo' | 'gitea' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'nuget' | 'rubygems' | 'gem' | 'go' | 'golang' | 'gomod' | 'maven' | 'helm'; target: string; token?: string; host?: string }) {
    return this.crud.testVersionConnection(input);
  }

    async discoverCurrentVersion(input: { provider: 'github' | 'gitlab' | 'forgejo' | 'gitea' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'nuget' | 'rubygems' | 'gem' | 'go' | 'golang' | 'gomod' | 'maven' | 'helm'; target: string; token?: string; host?: string; appUrl?: string; appToken?: string; appVersionEndpoint?: string; appAuthType?: 'none' | 'token' | 'openvpn'; openvpnUsername?: string; openvpnPassword?: string; endpointFallbacks?: string[]; jsonPath?: string; jsonPathExtractors?: string[] }) {
    return this.crud.discoverCurrentVersion(input);
  }

    async versionSummary(userId: string) {
    return this.crud.versionSummary(userId);
  }

    async versionDriftReport(userId: string) {
    return this.crud.versionDriftReport(userId);
  }

    async listDependencies(userId: string, monitorId: string) {
    return this.crud.listDependencies(userId, monitorId);
  }

    async addDependency(userId: string, monitorId: string, dependsOnId: string) {
    return this.crud.addDependency(userId, monitorId, dependsOnId);
  }

    async removeDependency(userId: string, monitorId: string, dependsOnId: string) {
    return this.crud.removeDependency(userId, monitorId, dependsOnId);
  }

    async hasDependencyDown(monitorId: string): Promise<boolean> {
    return this.crud.hasDependencyDown(monitorId);
  }

    async listEvents(userId: string, monitorId: string) {
    return this.crud.listEvents(userId, monitorId);
  }

    async createEvent(userId: string, monitorId: string, message: string, eventType = 'note') {
    return this.crud.createEvent(userId, monitorId, message, eventType);
  }

    async deleteEvent(userId: string, monitorId: string, eventId: string) {
    return this.crud.deleteEvent(userId, monitorId, eventId);
  }

    async togglePin(userId: string, monitorId: string): Promise<{ pinned: boolean }> {
    return this.crud.togglePin(userId, monitorId);
  }

    async bulkCreateFromUrls(
    userId: string,
    body: {
      urls: string[];
      folderId?: string;
      alertChannelIds?: string[];
      intervalSec?: number;
    },
  ): Promise<{ created: number; skipped: number; errors: Array<{ url: string; error: string }> }> {
    return this.crud.bulkCreateFromUrls(userId, body);
  }

    async getResponseDiff(
    userId: string,
    monitorId: string,
    runId: string,
    baseRunId?: string,
  ): Promise<{
    failedBody: string | null;
    baseBody: string | null;
    runId: string;
    baseRunId: string | null;
  }> {
    return this.crud.getResponseDiff(userId, monitorId, runId, baseRunId);
  }

    async simulateAlerts(
    userId: string,
    monitorId: string,
    config: {
      confirmations?: number;
      flapDetection?: boolean;
      flapWindow?: number;
      flapThreshold?: number;
      scheduleStartHour?: number;
      scheduleEndHour?: number;
    },
  ) {
    return this.crud.simulateAlerts(userId, monitorId, config);
  }

    async runPlayground(dto: PlaygroundDto, userId: string): Promise<PlaygroundResult> {
    return this.crud.runPlayground(dto, userId);
  }

    async fleetHealthReport(userId: string): Promise<{
    generatedAt: string;
    fleetScore: number;
    fleetGrade: string;
    summary: {
      total: number;
      enabled: number;
      up: number;
      degraded: number;
      down: number;
      noData: number;
    };
    reliabilityTiers: {
      tier: string;
      label: string;
      count: number;
      color: string;
      monitors: Array<{ id: string; name: string; uptimePct: number; score: number; grade: string }>;
    }[];
    atRisk: Array<{
      id: string;
      name: string;
      reason: string;
      severity: 'critical' | 'high' | 'medium';
      uptimePct: number;
      score: number;
    }>;
    incidentVelocity: {
      last7d: number;
      last30d: number;
      trend: 'improving' | 'stable' | 'worsening';
      weeklyBreakdown: Array<{ week: string; count: number }>;
    };
    typeDistribution: Array<{ type: string; count: number; avgUptime: number }>;
    coverageGaps: {
      noAlertChannel: number;
      noSlaTarget: number;
      noDescription: number;
      totalGapScore: number;
    };
    topPerformers: Array<{ id: string; name: string; uptimePct: number; grade: string }>;
    worstPerformers: Array<{ id: string; name: string; uptimePct: number; grade: string }>;
  }> {
    return this.analytics.fleetHealthReport(userId);
  }

    async monitorTrends(userId: string): Promise<{
    monitors: Array<{
      id: string;
      name: string;
      type: string;
      enabled: boolean;
      folder: string | null;
      currentUptimePct: number | null;
      previousUptimePct: number | null;
      uptimeDelta: number | null;
      uptimeTrend: 'improving' | 'degrading' | 'stable' | 'new';
      currentAvgLatencyMs: number | null;
      previousAvgLatencyMs: number | null;
      latencyDeltaPct: number | null;
      latencyTrend: 'improving' | 'degrading' | 'stable' | 'new';
      currentChecks: number;
      previousChecks: number;
    }>;
    generatedAt: string;
  }> {
    return this.analytics.monitorTrends(userId);
  }

    async monitorCorrelation(userId: string, days: number = 7): Promise<{
    monitors: Array<{ id: string; name: string; type: string }>;
    pairs: Array<{
      aId: string;
      bId: string;
      similarity: number;
      sharedWindows: number;
      aWindows: number;
      bWindows: number;
    }>;
    groups: Array<{
      monitorIds: string[];
      avgSimilarity: number;
      label: string;
    }>;
  }> {
    return this.analytics.monitorCorrelation(userId, days);
  }

    async anomalyReport(userId: string, hours: 24 | 48 | 168 = 24): Promise<{
    generatedAt: string;
    periodHours: number;
    totalMonitors: number;
    anomaliesFound: number;
    anomalies: Array<{
      monitorId: string;
      monitorName: string;
      monitorType: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      anomalyTypes: string[];
      details: Array<{
        type: string;
        description: string;
        currentValue: number | null;
        previousValue: number | null;
        changePct: number | null;
      }>;
      currentPeriod: {
        uptimePct: number | null;
        avgLatencyMs: number | null;
        failureCount: number;
        totalChecks: number;
      };
      previousPeriod: {
        uptimePct: number | null;
        avgLatencyMs: number | null;
        failureCount: number;
        totalChecks: number;
      };
    }>;
  }> {
    return this.analytics.anomalyReport(userId, hours);
  }

    async failurePrediction(userId: string): Promise<{
    predictions: Array<{
      monitorId: string;
      monitorName: string;
      monitorType: string;
      currentUptimePct: number;
      currentAvgLatencyMs: number | null;
      riskScore: number;
      prediction: 'stable' | 'watch' | 'at_risk' | 'likely_failure';
      estimatedHoursToFailure: number | null;
      trend: {
        uptimeSlopePctPerDay: number;
        latencySlopeMsPerDay: number | null;
      };
      lastCheckOk: boolean | null;
      checkCount: number;
    }>;
    summary: {
      total: number;
      stable: number;
      watch: number;
      atRisk: number;
      likelyFailure: number;
      avgFleetRisk: number;
    };
  }> {
    return this.analytics.failurePrediction(userId);
  }

    async uptimeHeatmap(userId: string, days: number): Promise<{
    monitors: Array<{
      id: string;
      name: string;
      type: string;
      folder: string | null;
      days: Array<{ date: string; uptimePct: number | null; total: number; failed: number }>;
    }>;
    dates: string[];
  }> {
    return this.analytics.uptimeHeatmap(userId, days);
  }

    async latencyHeatmap(userId: string, days: number): Promise<{
    monitors: Array<{
      id: string;
      name: string;
      type: string;
      folder: string | null;
      days: Array<{
        date: string;
        avgLatencyMs: number | null;
        p95LatencyMs: number | null;
        samples: number;
        grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
      }>;
    }>;
    dates: string[];
    summary: {
      avgFleetLatency: number | null;
      bestDay: string | null;
      worstDay: string | null;
    };
  }> {
    return this.analytics.latencyHeatmap(userId, days);
  }

    async reliabilityTrend(userId: string, weeks: number): Promise<{
    monitors: Array<{
      id: string;
      name: string;
      type: string;
      folder: string | null;
      currentScore: number | null;
      trend: 'improving' | 'degrading' | 'stable' | 'new';
      deltaPct: number | null;
      weeks: Array<{
        weekStart: string;
        uptimePct: number | null;
        avgLatencyMs: number | null;
        checksTotal: number;
        checksFailed: number;
        incidents: number;
        score: number | null;
      }>;
    }>;
    weekStarts: string[];
    summary: {
      improving: number;
      degrading: number;
      stable: number;
      avgCurrentScore: number | null;
    };
  }> {
    return this.analytics.reliabilityTrend(userId, weeks);
  }

    async timingBreakdown(userId: string, days: number): Promise<{
    period: { days: number };
    fleet: {
      avgDnsMs: number | null;
      avgTcpMs: number | null;
      avgTlsMs: number | null;
      avgTtfbMs: number | null;
      avgDownloadMs: number | null;
      totalSamples: number;
      bottleneck: 'dns' | 'tcp' | 'tls' | 'ttfb' | 'download' | null;
    };
    monitors: Array<{
      id: string;
      name: string;
      type: string;
      samples: number;
      avgDnsMs: number | null;
      avgTcpMs: number | null;
      avgTlsMs: number | null;
      avgTtfbMs: number | null;
      avgDownloadMs: number | null;
      avgTotalMs: number | null;
      bottleneck: 'dns' | 'tcp' | 'tls' | 'ttfb' | 'download' | null;
      bottleneckPct: number | null;
    }>;
  }> {
    return this.analytics.timingBreakdown(userId, days);
  }

    async failurePatterns(userId: string, monitorId: string, periodDays: number = 30): Promise<{
    totalFailures: number;
    uniquePatterns: number;
    patterns: Array<{
      pattern: string;
      count: number;
      percentage: number;
      firstSeen: Date;
      lastSeen: Date;
      exampleMessage: string;
      weeklyTrend: number[]; // 7 buckets, oldest→newest
    }>;
  }> {
    return this.analytics.failurePatterns(userId, monitorId, periodDays);
  }

    async geoStats(
    userId: string,
    monitorId: string,
    periodDays = 7,
  ): Promise<{
    regions: Array<{
      region: string;
      totalRuns: number;
      okRuns: number;
      uptimePct: number;
      avgLatencyMs: number | null;
      p95LatencyMs: number | null;
    }>;
    hasGeoData: boolean;
  }> {
    return this.analytics.geoStats(userId, monitorId, periodDays);
  }

    async latencyHistory(userId: string, monitorId: string, days: number = 30): Promise<{
    days: Array<{
      date: string; // YYYY-MM-DD UTC
      p50: number | null;
      p95: number | null;
      p99: number | null;
      avgMs: number | null;
      uptimePct: number | null;
      totalChecks: number;
    }>;
  }> {
    return this.analytics.latencyHistory(userId, monitorId, days);
  }

    async getTagAnalytics(
    userId: string,
    days: number,
  ): Promise<{
    periodDays: number;
    tags: Array<{
      tag: string;
      monitorCount: number;
      avgUptimePct: number;
      worstUptimePct: number;
      totalIncidents: number;
      avgLatencyMs: number | null;
      monitorsDown: number;
      health: 'healthy' | 'degraded' | 'critical';
    }>;
  }> {
    return this.analytics.getTagAnalytics(userId, days);
  }

    async getAssertionStats(
    userId: string,
    monitorId: string,
    days: number,
  ): Promise<{
    periodDays: number;
    totalChecks: number;
    assertionChecks: number;
    totalAssertionFailures: number;
    byType: {
      bodyContains: { failures: number; pct: number };
      jsonPath: { failures: number; pct: number };
      headerAssertions: { failures: number; pct: number; topHeaders: string[] };
    };
    recentFailures: Array<{
      checkedAt: string;
      type: string;
      message: string;
      latencyMs: number | null;
    }>;
  }> {
    return this.analytics.getAssertionStats(userId, monitorId, days);
  }

    async downtimeCostReport(userId: string): Promise<{
    totalEstimatedCost: number;
    totalDowntimeMinutes: number;
    monitorCount: number;
    monitors: Array<{
      id: string;
      name: string;
      downtimeCostPerHour: number;
      downtimeMinutes: number;
      estimatedCost: number;
      incidentCount: number;
      worstIncidentCost: number;
    }>;
    currency: 'USD';
    periodDays: 30;
  }> {
    return this.analytics.downtimeCostReport(userId);
  }

    async downtimeCostHistory(monitorId: string, userId: string, periodDays = 30): Promise<{
    days: Array<{
      date: string;
      downtimeMinutes: number;
      estimatedCost: number;
      checks: number;
      failedChecks: number;
    }>;
  }> {
    return this.analytics.downtimeCostHistory(monitorId, userId, periodDays);
  }

    async statusTimeline(userId: string, hours: number): Promise<{
    monitors: Array<{
      id: string;
      name: string;
      type: string;
      folder: string | null;
      segments: Array<{ start: string; end: string; level: 'green' | 'yellow' | 'red' }>;
      currentLevel: string;
      uptimePct: number;
    }>;
    from: string;
    to: string;
    totalHours: number;
  }> {
    return this.analytics.statusTimeline(userId, hours);
  }

    async dependencyGraph(userId: string): Promise<{
    nodes: Array<{
      id: string;
      name: string;
      type: string;
      enabled: boolean;
      folderId: string | null;
      folderName: string | null;
      status: 'up' | 'down' | 'degraded' | 'paused' | 'no-data';
      latencyMs: number | null;
      uptimePct7d: number | null;
      isMuted: boolean;
      inDegree: number;  // how many monitors depend on this one
      outDegree: number; // how many dependencies this monitor has
    }>;
    edges: Array<{
      source: string;  // monitorId (the dependent)
      target: string;  // dependsOnId (the dependency)
    }>;
    summary: {
      totalMonitors: number;
      totalEdges: number;
      isolatedNodes: number; // monitors with no dependencies and no dependents
      monitorsByStatus: { up: number; down: number; degraded: number; paused: number; noData: number };
    };
    generatedAt: string;
  }> {
    return this.analytics.dependencyGraph(userId);
  }

    async latencyBenchmark(userId: string): Promise<{
    monitors: Array<{
      monitorId: string;
      monitorName: string;
      monitorType: string;
      target: string;
      current: {
        p50: number | null;
        p75: number | null;
        p95: number | null;
        p99: number | null;
        avg: number | null;
        min: number | null;
        max: number | null;
        samples: number;
      };
      previous: {
        p50: number | null;
        p95: number | null;
        avg: number | null;
        samples: number;
      };
      trend: 'improving' | 'stable' | 'degrading' | 'new';
      trendPct: number | null;
      latencyAlertMs: number | null;
      budgetMs: number | null;
      p95ExceedsBudget: boolean;
      p95ExceedsAlert: boolean;
      grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
    }>;
    summary: {
      totalMonitors: number;
      monitorsWithData: number;
      fleetP50: number | null;
      fleetP95: number | null;
      gradeDistribution: { A: number; B: number; C: number; D: number; F: number };
      exceedingBudget: number;
      exceedingAlert: number;
      improvingCount: number;
      degradingCount: number;
    };
  }> {
    return this.analytics.latencyBenchmark(userId);
  }

    async metricHistory(userId: string, monitorId: string, opts: { limit?: number; periodDays?: number } = {}): Promise<{
    metricName: string | null;
    metricUnit: string | null;
    metricPath: string | null;
    metricAlertMin: number | null;
    metricAlertMax: number | null;
    points: Array<{ checkedAt: string; value: number; level: string }>;
    stats: { min: number | null; max: number | null; avg: number | null; latest: number | null; count: number };
  }> {
    return this.analytics.metricHistory(userId, monitorId, opts);
  }

    async slaDashboard(userId: string) {
    return this.sla.slaDashboard(userId);
  }

    async slaComplianceReport(userId: string, months: number) {
    return this.sla.slaComplianceReport(userId, months);
  }

    async slaByTag(userId: string): Promise<Array<{
    tagId: string | null;
    tagName: string;
    tagColor: string | null;
    monitorCount: number;
    withSlaTarget: number;
    uptimePct: number | null;
    compliantCount: number;
    atRiskCount: number;
    breachedCount: number;
    noDataCount: number;
    monitors: Array<{
      id: string;
      name: string;
      type: string;
      slaTarget: number | null;
      uptimePct: number | null;
      compliant: boolean | null;
    }>;
  }>> {
    return this.sla.slaByTag(userId);
  }

    async slaBudgetForecast(userId: string, monitorId: string) {
    return this.sla.slaBudgetForecast(userId, monitorId);
  }

    async getErrorBudget(
    monitorId: string,
    userId: string,
    opts: { slaTarget: number; period: string },
  ) {
    return this.sla.getErrorBudget(monitorId, userId, opts);
  }

    async getSloReport(userId: string, monitorId: string) {
    return this.sla.getSloReport(userId, monitorId);
  }

    async getSloSummary(userId: string) {
    return this.sla.getSloSummary(userId);
  }

    async uptimeCertificate(userId: string, monitorId: string, months: number): Promise<string> {
    return this.sla.uptimeCertificate(userId, monitorId, months);
  }

    async generateUptimeCertificate(
    userId: string,
    monitorId: string,
    options: { periodDays: number; title?: string },
  ): Promise<{
    certificateId: string;
    monitorId: string;
    monitorName: string;
    monitorTarget: string;
    monitorType: string;
    issuedAt: string;
    periodDays: number;
    periodStart: string;
    periodEnd: string;
    uptimePct: number;
    avgLatencyMs: number | null;
    p95LatencyMs: number | null;
    totalChecks: number;
    successChecks: number;
    failedChecks: number;
    totalDowntimeMinutes: number;
    longestOutageMinutes: number;
    incidents: number;
    slaTarget: number | null;
    slaCompliant: boolean | null;
    title: string;
  }> {
    return this.sla.generateUptimeCertificate(userId, monitorId, options);
  }

    async getHealthScore(
    userId: string,
    monitorId: string,
  ): Promise<{
    score: number;
    grade: string;
    breakdown: {
      uptime: number;
      latency: number;
      sla: number;
      streak: number;
    };
  }> {
    return this.diagnostics.getHealthScore(userId, monitorId);
  }

    async getHealthSummary(userId: string): Promise<{
    scores: Array<{ monitorId: string; name: string; score: number; grade: string }>;
    overall: { avg: number; a: number; b: number; c: number; d: number; f: number };
  }> {
    return this.diagnostics.getHealthSummary(userId);
  }

    async healthScore(
    userId: string,
    monitorId: string,
  ): Promise<{
    score: number | null;
    breakdown: { uptime: number; latency: number; incidents: number; flapping: number; total: number } | null;
  }> {
    return this.diagnostics.healthScore(userId, monitorId);
  }

    async allHealthScores(userId: string): Promise<{ monitorId: string; score: number | null }[]> {
    return this.diagnostics.allHealthScores(userId);
  }

    async healthScoreLeaderboard(userId: string): Promise<{
    items: Array<{
      monitorId: string;
      monitorName: string;
      monitorType: string;
      score: number | null;
      grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
      uptimePct24h: number | null;
      totalChecks24h: number;
      activeIncidents: number;
      isFlapping: boolean;
      slaTarget: number | null;
      slaCompliant: boolean | null;
      hints: string[];
    }>;
    summary: {
      totalMonitors: number;
      noDataCount: number;
      gradeDistribution: Record<'A' | 'B' | 'C' | 'D' | 'F', number>;
      avgScore: number | null;
    };
  }> {
    return this.diagnostics.healthScoreLeaderboard(userId);
  }

    async checkSchedule(userId: string): Promise<{
    generatedAt: string;
    summary: {
      totalMonitors: number;
      enabledMonitors: number;
      fleetChecksPerHour: number;
      fleetChecksPerDay: number;
      peakHour: number;
      peakHourLoad: number;
      quietHour: number;
      quietHourLoad: number;
      avgChecksPerHour: number;
    };
    hourlyLoad: Array<{ hour: number; label: string; estimatedChecks: number }>;
    monitors: Array<{
      id: string;
      name: string;
      type: string;
      enabled: boolean;
      intervalSec: number;
      cronExpression: string | null;
      checksPerHour: number;
      lastCheckedAt: string | null;
      nextCheckEstimateSec: number | null;
    }>;
  }> {
    return this.diagnostics.checkSchedule(userId);
  }

    async checkRate(userId: string, monitorId: string): Promise<{
    intervalSec: number;
    throttleMs: number | null;
    maxChecksPerHour: number | null;
    checksLastHour: number;
    effectiveChecksPerHour: number;
    isThrottled: boolean;
  }> {
    return this.diagnostics.checkRate(userId, monitorId);
  }

    async monitorCoverage(userId: string): Promise<{
    coverageScore: number;
    totalMonitors: number;
    monitorsWithAlerts: number;
    monitorsWithSla: number;
    monitorsWithDescription: number;
    monitorsWithRunbook: number;
    monitorsWithTags: number;
    monitorsEnabled: number;
    gaps: Array<{
      id: string;
      name: string;
      type: string;
      missingAlerts: boolean;
      missingSla: boolean;
      missingDescription: boolean;
      missingRunbook: boolean;
      missingTags: boolean;
      coverageScore: number;
    }>;
    generatedAt: string;
  }> {
    return this.diagnostics.monitorCoverage(userId);
  }

    async intervalOptimizer(userId: string): Promise<{
    monitors: Array<{
      id: string;
      name: string;
      type: string;
      currentIntervalSec: number | null;
      cronExpression: string | null;
      incidents90d: number;
      avgDetectionMinutes: number | null;
      checksPerDay: number;
      recommendation: 'increase' | 'decrease' | 'optimal' | 'new';
      suggestedIntervalSec: number | null;
      reason: string;
    }>;
    summary: {
      optimal: number;
      tooFrequent: number;
      tooInfrequent: number;
      totalMonitors: number;
    };
  }> {
    return this.diagnostics.intervalOptimizer(userId);
  }

    async getSslSummary(userId: string): Promise<{
    total: number;
    expired: number;
    critical: number;
    warning: number;
    healthy: number;
    certs: Array<{
      monitorId: string;
      name: string;
      target: string;
      type: string;
      enabled: boolean;
      folderId: string | null;
      folderName: string | null;
      status: string;
      daysRemaining: number | null;
      expiresAt: string | null;
      lastCheckedAt: string | null;
      lastMessage: string;
      level: string;
    }>;
  }> {
    return this.diagnostics.getSslSummary(userId);
  }

    async getSecurityHeadersSummary(userId: string): Promise<{
    total: number;
    gradeA: number;
    gradeB: number;
    gradeC: number;
    gradeD: number;
    gradeF: number;
    noData: number;
    avgScore: number | null;
    headerCoverage: Array<{ name: string; presentCount: number; totalCount: number; coveragePct: number; severity: string }>;
    monitors: Array<{
      monitorId: string;
      name: string;
      target: string;
      folderId: string | null;
      folderName: string | null;
      enabled: boolean;
      grade: string | null;
      score: number | null;
      checkedAt: string | null;
      headers: Array<{ name: string; present: boolean; severity: string }>;
    }>;
  }> {
    return this.diagnostics.getSecurityHeadersSummary(userId);
  }

    async ctLogHistory(userId: string, monitorId: string): Promise<{
    entries: Array<{
      checkedAt: Date;
      newCertCount: number;
      domains: string[];
      message: string;
      level: string;
    }>;
  }> {
    return this.diagnostics.ctLogHistory(userId, monitorId);
  }

    async redirectChainStats(userId: string, monitorId: string): Promise<{
    hasRedirects: boolean;
    avgRedirects: number;
    maxRedirects: number;
    commonChains: Array<{ chain: string[]; count: number }>;
  }> {
    return this.diagnostics.redirectChainStats(userId, monitorId);
  }

    async exportMonitors(userId: string, opts?: { format?: 'json' | 'yaml'; ids?: string[]; includeAlertChannels?: boolean }) {
    return this.exportSvc.exportMonitors(userId, opts);
  }

    async importMonitors(userId: string, items: Array<{
    name: string;
    target: string;
    type: MonitorType;
    intervalSec?: number;
    timeoutMs?: number;
    confirmations?: number;
    config?: Record<string, unknown>;
    enabled?: boolean;
  }>) {
    return this.exportSvc.importMonitors(userId, items);
  }

    async exportMonitorsConfig(userId: string, opts: { format: 'json' | 'yaml'; ids?: string[]; includeAlertChannels: boolean }) {
    return this.exportSvc.exportMonitorsConfig(userId, opts);
  }

    async importMonitorsConfig(userId: string, opts: { format: 'json' | 'yaml'; content: string; dryRun?: boolean; overwriteExisting?: boolean }) {
    return this.exportSvc.importMonitorsConfig(userId, opts);
  }

    async importExternal(
    userId: string,
    source: 'uptime-robot' | 'better-uptime' | 'uptime-kuma' | 'csv',
    payload: unknown,
  ) {
    return this.exportSvc.importExternal(userId, source, payload);
  }

    importFromCompose(compose: string): SuggestedMonitor[] {
    return this.exportSvc.importFromCompose(compose);
  }

    async previewFromOpenApi(opts: {
    specJson?: string;
    url?: string;
    baseUrl: string;
    maxPaths?: number;
  }): Promise<{ suggestions: OpenApiSuggestion[] }> {
    return this.exportSvc.previewFromOpenApi(opts);
  }

    async importFromOpenApi(
    userId: string,
    opts: {
      specJson?: string;
      url?: string;
      baseUrl: string;
      selectedPaths: string[];
      intervalSec?: number;
      folderId?: string;
      alertChannelIds?: string[];
    },
  ): Promise<{ created: number; monitors: unknown[] }> {
    return this.exportSvc.importFromOpenApi(userId, opts);
  }

    async compareMonitors(userId: string, monitorIds: string[], days: number) {
    return this.comparison.compareMonitors(userId, monitorIds, days);
  }

    async getLatencyDistribution(
    userId: string,
    monitorId: string,
    period: '24h' | '7d' | '30d' = '7d',
  ) {
    return this.comparison.getLatencyDistribution(userId, monitorId, period);
  }

    async getPeriodComparison(userId: string, monitorId: string, period: '24h' | '7d' | '30d' = '7d') {
    return this.comparison.getPeriodComparison(userId, monitorId, period);
  }

    async getStatusTransitions(
    userId: string,
    monitorId: string,
    period: '24h' | '7d' | '30d' = '7d',
  ) {
    return this.comparison.getStatusTransitions(userId, monitorId, period);
  }
}
