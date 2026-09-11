import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AlertsAnalysisService {
  private readonly logger = new Logger(AlertsAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Analyzes alert delivery patterns to identify noisy monitors and provide
   * actionable recommendations to reduce alert fatigue.
   *
   * @param userId - The authenticated user ID
   * @param periodDays - Number of days to analyze (default 7, max 30)
   * @returns Noise analysis report with per-monitor stats and recommendations
   */
  async noiseAnalysis(userId: string, periodDays = 7): Promise<{
    summary: {
      totalAlerts: number;
      uniqueMonitors: number;
      noisyMonitors: number;
      noisyPercent: number;
      avgAlertsPerMonitor: number;
      topNoisyCount: number;
    };
    monitors: Array<{
      monitorId: string;
      monitorName: string;
      monitorType: string;
      totalAlerts: number;
      failedDeliveries: number;
      alertsPerDay: number;
      noiseScore: 'low' | 'medium' | 'high' | 'critical';
      noiseReason: string[];
      recommendations: string[];
      currentConfig: {
        confirmations: number;
        flapDetection: boolean;
        intervalSec: number;
        retryCount: number;
      };
    }>;
    periodDays: number;
  }> {
    const clampedDays = Math.min(30, Math.max(1, periodDays));
    const since = new Date(Date.now() - clampedDays * 86_400_000);

    // Pull all delivery logs for this user within the period, grouped by monitor
    const logs = await this.prisma.alertDeliveryLog.findMany({
      where: {
        createdAt: { gte: since },
        alertChannel: { userId },
      },
      select: {
        id: true,
        monitorId: true,
        monitorName: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group deliveries by monitorId
    const byMonitor = new Map<string, { monitorName: string; total: number; failed: number; timestamps: Date[] }>();
    for (const log of logs) {
      if (!log.monitorId) continue;
      const entry = byMonitor.get(log.monitorId) ?? {
        monitorName: log.monitorName ?? log.monitorId,
        total: 0,
        failed: 0,
        timestamps: [],
      };
      entry.total += 1;
      if (log.status === 'failed') entry.failed += 1;
      entry.timestamps.push(log.createdAt);
      byMonitor.set(log.monitorId, entry);
    }

    if (byMonitor.size === 0) {
      return {
        summary: { totalAlerts: 0, uniqueMonitors: 0, noisyMonitors: 0, noisyPercent: 0, avgAlertsPerMonitor: 0, topNoisyCount: 0 },
        monitors: [],
        periodDays: clampedDays,
      };
    }

    // Fetch monitor configs for the monitors we found
    const monitorIds = [...byMonitor.keys()];
    const monitors = await this.prisma.monitor.findMany({
      where: { id: { in: monitorIds }, userId },
      select: {
        id: true,
        name: true,
        type: true,
        confirmations: true,
        flapDetectionEnabled: true,
        intervalSec: true,
        retryCount: true,
      },
    });
    const monitorMap = new Map(monitors.map((m) => [m.id, m]));

    const monitorResults: Array<{
      monitorId: string;
      monitorName: string;
      monitorType: string;
      totalAlerts: number;
      failedDeliveries: number;
      alertsPerDay: number;
      noiseScore: 'low' | 'medium' | 'high' | 'critical';
      noiseReason: string[];
      recommendations: string[];
      currentConfig: { confirmations: number; flapDetection: boolean; intervalSec: number; retryCount: number };
    }> = [];

    for (const [monitorId, stats] of byMonitor.entries()) {
      const config = monitorMap.get(monitorId);
      const alertsPerDay = stats.total / clampedDays;
      const noiseReasons: string[] = [];
      const recommendations: string[] = [];

      // Classify noise
      if (alertsPerDay > 20) noiseReasons.push('Extremely high alert volume (>20/day)');
      else if (alertsPerDay > 10) noiseReasons.push('High alert volume (>10/day)');
      else if (alertsPerDay > 3) noiseReasons.push('Elevated alert volume (>3/day)');

      if (config) {
        if ((config.confirmations ?? 1) <= 1 && alertsPerDay > 3) {
          noiseReasons.push('No confirmation threshold — every failure fires an alert');
          recommendations.push('Set confirmations to 2–3 to require consecutive failures before alerting');
        }
        if (!config.flapDetectionEnabled && alertsPerDay > 5) {
          noiseReasons.push('Flap detection disabled — up/down oscillation triggers many alerts');
          recommendations.push('Enable flap detection to suppress alerts when monitor rapidly oscillates');
        }
        if ((config.intervalSec ?? 60) < 60 && alertsPerDay > 5) {
          noiseReasons.push(`Very frequent check interval (${config.intervalSec}s) amplifies noise`);
          recommendations.push('Consider increasing check interval to 60–300s to reduce check frequency');
        }
        if ((config.retryCount ?? 0) === 0 && alertsPerDay > 3) {
          recommendations.push('Add 1–2 retries to absorb transient network blips before alerting');
        }
      }

      if (stats.failed > 0) {
        const failPct = Math.round((stats.failed / stats.total) * 100);
        if (failPct > 20) {
          noiseReasons.push(`${failPct}% of deliveries failed — channel may be misconfigured`);
          recommendations.push('Check alert channel configuration — high delivery failure rate');
        }
      }

      if (recommendations.length === 0 && noiseReasons.length === 0) {
        recommendations.push('Alert volume looks healthy — no immediate action needed');
      }

      let noiseScore: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (alertsPerDay > 20) noiseScore = 'critical';
      else if (alertsPerDay > 10) noiseScore = 'high';
      else if (alertsPerDay > 3) noiseScore = 'medium';

      monitorResults.push({
        monitorId,
        monitorName: stats.monitorName,
        monitorType: config?.type ?? 'HTTP',
        totalAlerts: stats.total,
        failedDeliveries: stats.failed,
        alertsPerDay: Math.round(alertsPerDay * 10) / 10,
        noiseScore,
        noiseReason: noiseReasons,
        recommendations,
        currentConfig: {
          confirmations: config?.confirmations ?? 1,
          flapDetection: config?.flapDetectionEnabled ?? false,
          intervalSec: config?.intervalSec ?? 60,
          retryCount: config?.retryCount ?? 0,
        },
      });
    }

    // Sort by noise score (critical → high → medium → low) then by totalAlerts desc
    const scoreOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    monitorResults.sort(
      (a, b) =>
        scoreOrder[b.noiseScore] - scoreOrder[a.noiseScore] || b.totalAlerts - a.totalAlerts,
    );

    const noisyMonitors = monitorResults.filter((m) => m.noiseScore === 'high' || m.noiseScore === 'critical').length;
    const totalAlerts = logs.length;
    const topNoisyCount = monitorResults[0]?.totalAlerts ?? 0;

    return {
      summary: {
        totalAlerts,
        uniqueMonitors: byMonitor.size,
        noisyMonitors,
        noisyPercent: byMonitor.size > 0 ? Math.round((noisyMonitors / byMonitor.size) * 100) : 0,
        avgAlertsPerMonitor: byMonitor.size > 0 ? Math.round((totalAlerts / byMonitor.size) * 10) / 10 : 0,
        topNoisyCount,
      },
      monitors: monitorResults,
      periodDays: clampedDays,
    };
  }

  /**
   * Analyzes alert delivery response times.
   * Returns per-channel latency stats + percentiles + daily trend.
   * Latency = sentAt - createdAt in milliseconds.
   */
  async deliveryResponseTime(userId: string, days: number): Promise<{
    period: { days: number };
    channels: Array<{
      channelId: string;
      channelName: string;
      channelType: string;
      totalDeliveries: number;
      successCount: number;
      failedCount: number;
      successRate: number;
      avgMs: number | null;
      p50Ms: number | null;
      p95Ms: number | null;
      maxMs: number | null;
    }>;
    fleetStats: {
      avgMs: number | null;
      p50Ms: number | null;
      p95Ms: number | null;
      totalDeliveries: number;
      successRate: number;
    };
    dailyTrend: Array<{
      date: string;
      count: number;
      successCount: number;
      avgMs: number | null;
    }>;
  }> {
    const clampedDays = Math.min(90, Math.max(1, days));
    const since = new Date(Date.now() - clampedDays * 24 * 60 * 60 * 1000);

    const logs = await this.prisma.alertDeliveryLog.findMany({
      where: { alertChannel: { userId }, createdAt: { gte: since } },
      select: {
        id: true,
        status: true,
        durationMs: true,
        createdAt: true,
        alertChannel: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    function percentile(arr: number[], p: number): number | null {
      if (arr.length === 0) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.floor((p / 100) * sorted.length);
      return sorted[Math.min(idx, sorted.length - 1)];
    }

    // Per-channel aggregation
    type ChanStats = { name: string; type: string; total: number; success: number; failed: number; latencies: number[] };
    const chanMap = new Map<string, ChanStats>();

    for (const log of logs) {
      const id = log.alertChannel?.id ?? 'unknown';
      if (!chanMap.has(id)) {
        chanMap.set(id, { name: log.alertChannel?.name ?? 'Unknown', type: log.alertChannel?.type ?? 'unknown', total: 0, success: 0, failed: 0, latencies: [] });
      }
      const s = chanMap.get(id)!;
      s.total++;
      if (log.status === 'SUCCESS') {
        s.success++;
        if (log.durationMs !== null && log.durationMs !== undefined) {
          if (log.durationMs >= 0 && log.durationMs < 300000) s.latencies.push(log.durationMs);
        }
      } else {
        s.failed++;
      }
    }

    const channels = Array.from(chanMap.entries()).map(([channelId, s]) => ({
      channelId,
      channelName: s.name,
      channelType: s.type,
      totalDeliveries: s.total,
      successCount: s.success,
      failedCount: s.failed,
      successRate: s.total > 0 ? Math.round((s.success / s.total) * 100) : 0,
      avgMs: s.latencies.length > 0 ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length) : null,
      p50Ms: percentile(s.latencies, 50),
      p95Ms: percentile(s.latencies, 95),
      maxMs: s.latencies.length > 0 ? Math.max(...s.latencies) : null,
    })).sort((a, b) => b.totalDeliveries - a.totalDeliveries);

    // Fleet stats
    const allLatencies = logs
      .filter(l => l.status === 'SUCCESS' && l.durationMs !== null && l.durationMs !== undefined && l.durationMs >= 0 && l.durationMs < 300000)
      .map(l => l.durationMs!);
    const totalDeliveries = logs.length;
    const successLogs = logs.filter(l => l.status === 'SUCCESS').length;

    const fleetStats = {
      avgMs: allLatencies.length > 0 ? Math.round(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length) : null,
      p50Ms: percentile(allLatencies, 50),
      p95Ms: percentile(allLatencies, 95),
      totalDeliveries,
      successRate: totalDeliveries > 0 ? Math.round((successLogs / totalDeliveries) * 100) : 0,
    };

    // Daily trend
    const dayMap = new Map<string, { count: number; success: number; latencies: number[] }>();
    for (const log of logs) {
      const date = log.createdAt.toISOString().slice(0, 10);
      if (!dayMap.has(date)) dayMap.set(date, { count: 0, success: 0, latencies: [] });
      const d = dayMap.get(date)!;
      d.count++;
      if (log.status === 'SUCCESS') {
        d.success++;
        if (log.durationMs !== null && log.durationMs !== undefined && log.durationMs >= 0 && log.durationMs < 300000) {
          d.latencies.push(log.durationMs);
        }
      }
    }

    const dailyTrend = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        count: d.count,
        successCount: d.success,
        avgMs: d.latencies.length > 0 ? Math.round(d.latencies.reduce((a, b) => a + b, 0) / d.latencies.length) : null,
      }));

    return { period: { days: clampedDays }, channels, fleetStats, dailyTrend };
  }

  /**
   * Returns health status for all alert channels owned by a user.
   * Aggregates last 7 days delivery data per channel in a single query.
   */
  async channelsHealth(userId: string): Promise<Array<{
    channelId: string;
    name: string;
    type: string;
    enabled: boolean;
    totalDeliveries: number;
    successCount: number;
    failedCount: number;
    successRate: number;
    lastDeliveryAt: Date | null;
    lastSuccessAt: Date | null;
    lastErrorMessage: string | null;
    last24hCount: number;
    healthStatus: 'healthy' | 'degraded' | 'failing' | 'untested';
  }>> {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const channels = await this.prisma.alertChannel.findMany({
      where: { userId },
      select: { id: true, name: true, type: true },
    });

    if (channels.length === 0) return [];

    const channelIds = channels.map(c => c.id);

    const logs = await this.prisma.alertDeliveryLog.findMany({
      where: { alertChannelId: { in: channelIds }, createdAt: { gte: since7d } },
      select: {
        alertChannelId: true,
        status: true,
        createdAt: true,
        errorMessage: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return channels.map(channel => {
      const chanLogs = logs.filter(l => l.alertChannelId === channel.id);
      const total = chanLogs.length;
      const successLogs = chanLogs.filter(l => l.status === 'success');
      const failedLogs = chanLogs.filter(l => l.status === 'failed');
      const successCount = successLogs.length;
      const failedCount = failedLogs.length;
      const last24h = chanLogs.filter(l => l.createdAt >= since24h);

      const lastDelivery = chanLogs[0] ?? null;
      const lastSuccess = successLogs[0] ?? null;
      const lastFailed = failedLogs[0] ?? null;

      const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;

      let healthStatus: 'healthy' | 'degraded' | 'failing' | 'untested';
      if (total === 0) {
        healthStatus = 'untested';
      } else if (successRate >= 95) {
        healthStatus = 'healthy';
      } else if (successRate >= 70) {
        healthStatus = 'degraded';
      } else {
        healthStatus = 'failing';
      }

      return {
        channelId: channel.id,
        name: channel.name,
        type: channel.type,
        enabled: true,
        totalDeliveries: total,
        successCount,
        failedCount,
        successRate: total > 0 ? successRate : 100,
        lastDeliveryAt: lastDelivery?.createdAt ?? null,
        lastSuccessAt: lastSuccess?.createdAt ?? null,
        lastErrorMessage: lastFailed?.errorMessage ?? null,
        last24hCount: last24h.length,
        healthStatus,
      };
    });
  }

  /**
   * Returns aggregated delivery statistics for a specific alert channel.
   * Includes total counts, success rate, 24h window stats, and recent 10 log entries.
   */
  async deliveryStats(userId: string, channelId: string): Promise<{
    totalDeliveries: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    lastDeliveryAt: Date | null;
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
    last24hSuccess: number;
    last24hFailure: number;
    recentLogs: Array<{
      id: string;
      triggeredAt: Date;
      success: boolean;
      statusCode: number | null;
      errorMessage: string | null;
      monitorName: string | null;
    }>;
  }> {
    const channel = await this.prisma.alertChannel.findFirst({ where: { id: channelId, userId } });
    if (!channel) throw new NotFoundException('Alert channel not found');

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalDeliveries, successCount, failureCount, last24h, recentLogs] = await Promise.all([
      this.prisma.alertDeliveryLog.count({ where: { alertChannelId: channelId } }),
      this.prisma.alertDeliveryLog.count({ where: { alertChannelId: channelId, status: 'success' } }),
      this.prisma.alertDeliveryLog.count({ where: { alertChannelId: channelId, status: 'failed' } }),
      this.prisma.alertDeliveryLog.findMany({
        where: { alertChannelId: channelId, createdAt: { gte: since24h } },
        select: { status: true },
      }),
      this.prisma.alertDeliveryLog.findMany({
        where: { alertChannelId: channelId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          createdAt: true,
          status: true,
          errorMessage: true,
          monitorName: true,
        },
      }),
    ]);

    const lastDelivery = recentLogs[0] ?? null;
    const lastSuccess = recentLogs.find(l => l.status === 'success') ?? null;
    const lastFailure = recentLogs.find(l => l.status === 'failed') ?? null;

    return {
      totalDeliveries,
      successCount,
      failureCount,
      successRate: totalDeliveries > 0 ? Math.round((successCount / totalDeliveries) * 100) : 100,
      lastDeliveryAt: lastDelivery?.createdAt ?? null,
      lastSuccessAt: lastSuccess?.createdAt ?? null,
      lastFailureAt: lastFailure?.createdAt ?? null,
      last24hSuccess: last24h.filter(l => l.status === 'success').length,
      last24hFailure: last24h.filter(l => l.status === 'failed').length,
      recentLogs: recentLogs.map(l => ({
        id: l.id,
        triggeredAt: l.createdAt,
        success: l.status === 'success',
        statusCode: null,
        errorMessage: l.errorMessage,
        monitorName: l.monitorName,
      })),
    };
  }
}
