import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { MailerService } from '../common/mailer.service';
import { UpsertReportDto } from './reports.dto';

// ── Digest types ─────────────────────────────────────────────────────────────

export interface DigestPerformer {
  id: string;
  name: string;
  type: string;
  uptimePct: number;
  avgLatencyMs: number | null;
}

export interface DigestImprovement {
  id: string;
  name: string;
  uptimeDelta: number;
}

export interface DigestRecommendation {
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  monitorId?: string;
}

export interface DigestTrendPoint {
  date: string;
  uptimePct: number | null;
}

export interface DigestResult {
  period: number;
  generatedAt: string;
  fleet: {
    totalMonitors: number;
    uptimeMonitors: number;
    versionMonitors: number;
    overallUptimePct: number;
    overallGrade: string;
  };
  topPerformers: DigestPerformer[];
  worstPerformers: DigestPerformer[];
  mostImproved: DigestImprovement[];
  mostDegraded: DigestImprovement[];
  alerts: {
    totalFired: number;
    topNoisyMonitor: { name: string; count: number } | null;
    recoveryRate: number;
  };
  incidents: {
    total: number;
    resolved: number;
    avgResolutionMinutes: number | null;
  };
  checks: {
    totalRuns: number;
    successRuns: number;
    failedRuns: number;
    successRate: number;
  };
  versionUpdates: {
    monitored: number;
    upToDate: number;
    updateAvailable: number;
  };
  recommendations: DigestRecommendation[];
  uptimeTrend: DigestTrendPoint[];
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Returns the scheduled-report config for a user, or `null` if none has been set up.
   *
   * @param userId - Owner's user ID
   */
  async getReport(userId: string) {
    return this.prisma.scheduledReport.findUnique({ where: { userId } });
  }

  /**
   * Creates or updates the scheduled-report config for a user.
   * There is at most one config record per user (unique on `userId`).
   *
   * @param userId - Owner's user ID
   * @param dto    - Report settings (enabled, frequency, dayOfWeek, hourUtc)
   */
  async upsertReport(userId: string, dto: UpsertReportDto) {
    return this.prisma.scheduledReport.upsert({
      where: { userId },
      create: {
        userId,
        enabled: dto.enabled ?? true,
        frequency: dto.frequency ?? 'weekly',
        dayOfWeek: dto.dayOfWeek ?? 1,
        hourUtc: dto.hourUtc ?? 8,
      },
      update: {
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.frequency !== undefined && { frequency: dto.frequency }),
        ...(dto.dayOfWeek !== undefined && { dayOfWeek: dto.dayOfWeek }),
        ...(dto.hourUtc !== undefined && { hourUtc: dto.hourUtc }),
      },
    });
  }

  /**
   * Deletes the scheduled-report config for a user.
   * Silently no-ops if no config exists.
   *
   * @param userId - Owner's user ID
   */
  async deleteReport(userId: string) {
    try {
      await this.prisma.scheduledReport.delete({ where: { userId } });
    } catch {
      // Not found — fine
    }
  }

  /**
   * Sends a test report immediately to the user's email.
   * Uses weekly frequency (last 7 days) regardless of configured schedule.
   * @param userId - Owner's user ID
   */
  async sendNow(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new Error('User not found');

    const data = await this.computeReportData(userId, 'weekly');
    const dashboardUrl = (process.env.PUBLIC_URL ?? 'http://localhost:1234') + '/dashboard';

    await this.mailer.sendUptimeReport(user.email, {
      frequency: 'weekly',
      periodLabel: 'Last 7 days',
      ...data,
      dashboardUrl,
    });

    this.logger.log(`[report-sent-now] userId=${userId}`);
  }

  /**
   * Cron job that runs every 15 minutes to dispatch scheduled uptime reports.
   * For each enabled report it checks whether it is due (matches configured hour/day
   * and respects the `lastSentAt` deduplication window), computes the report data,
   * sends the HTML email via `MailerService`, and updates `lastSentAt`.
   *
   * @remarks
   * Frequency "daily" requires ≥23 h since last send.
   * Frequency "weekly" requires ≥167 h since last send (7 days minus 1 h tolerance).
   */
  @Cron('0,15,30,45 * * * *')
  async sendDueReports() {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentDay = now.getUTCDay();

    const reports = await this.prisma.scheduledReport.findMany({
      where: { enabled: true },
      include: { user: { select: { id: true, email: true } } },
    });

    for (const report of reports) {
      try {
        const isDue = this.isDue(report, now, currentHour, currentDay);
        if (!isDue) continue;

        const data = await this.computeReportData(report.userId, report.frequency);
        const dashboardUrl = (process.env.PUBLIC_URL ?? 'http://localhost:1234') + '/dashboard';

        await this.mailer.sendUptimeReport(report.user.email, {
          frequency: report.frequency,
          periodLabel: report.frequency === 'daily' ? 'Last 24 hours' : 'Last 7 days',
          ...data,
          dashboardUrl,
        });

        await this.prisma.scheduledReport.update({
          where: { id: report.id },
          data: { lastSentAt: now },
        });

        this.logger.log(`[report-sent] userId=${report.userId} frequency=${report.frequency}`);
      } catch (err) {
        this.logger.error(`[report-error] userId=${report.userId} err=${String(err)}`);
      }
    }
  }

  /**
   * Determines whether a scheduled report should be sent right now.
   * Checks UTC hour and (for weekly reports) day-of-week, then verifies
   * that enough time has elapsed since the last send.
   */
  private isDue(
    report: { frequency: string; dayOfWeek: number; hourUtc: number; lastSentAt: Date | null },
    now: Date,
    currentHour: number,
    currentDay: number,
  ): boolean {
    if (report.hourUtc !== currentHour) return false;

    if (report.frequency === 'weekly') {
      if (report.dayOfWeek !== currentDay) return false;
      if (!report.lastSentAt) return true;
      const hoursAgo = (now.getTime() - report.lastSentAt.getTime()) / 3_600_000;
      return hoursAgo >= 167; // ~7 days minus 1h tolerance
    }

    // daily
    if (!report.lastSentAt) return true;
    const hoursAgo = (now.getTime() - report.lastSentAt.getTime()) / 3_600_000;
    return hoursAgo >= 23;
  }

  /**
   * Aggregates uptime report data for a user over the report period.
   * Returns overall uptime%, per-monitor breakdown (worst first), active incident count,
   * and green/yellow/red health buckets.
   *
   * @param userId    - Owner's user ID
   * @param frequency - 'daily' (last 24 h) or 'weekly' (last 7 days)
   */
  async computeReportData(userId: string, frequency: string) {
    const periodMs = frequency === 'daily' ? 24 * 3_600_000 : 7 * 24 * 3_600_000;
    const since = new Date(Date.now() - periodMs);

    const monitors = await this.prisma.monitor.findMany({
      where: { userId, enabled: true },
      select: { id: true, name: true, type: true },
    });

    const UPTIME_TYPES = new Set(['HTTP', 'TCP', 'SSL_CERT', 'HEARTBEAT']);
    const uptimeMonitors = monitors.filter((m) => UPTIME_TYPES.has(m.type));
    const totalMonitors = monitors.length;

    // Latest run per monitor
    const latestRunsRaw = await this.prisma.$queryRaw<
      Array<{ monitorId: string; ok: boolean; level: string | null }>
    >`
      SELECT DISTINCT ON ("monitorId") "monitorId", ok, level
      FROM "MonitorRun"
      WHERE "userId" = ${userId}
      ORDER BY "monitorId", "checkedAt" DESC
    `;

    const latestByMonitor = new Map(latestRunsRaw.map((r) => [r.monitorId, r]));

    let greenCount = 0;
    let yellowCount = 0;
    let redCount = 0;
    for (const m of uptimeMonitors) {
      const run = latestByMonitor.get(m.id);
      if (!run) continue;
      if (run.level === 'green' || run.ok) greenCount++;
      else if (run.level === 'yellow') yellowCount++;
      else redCount++;
    }

    // Uptime% per uptime monitor
    const topMonitors: Array<{ name: string; uptimePct: number; status: string }> = [];

    for (const m of uptimeMonitors.slice(0, 10)) {
      const runs = await this.prisma.monitorRun.findMany({
        where: { monitorId: m.id, checkedAt: { gte: since } },
        select: { ok: true, level: true },
      });

      if (runs.length === 0) continue;
      const ok = runs.filter((r) => r.ok).length;
      const uptimePct = Math.round((ok / runs.length) * 1000) / 10;
      const latestRun = latestByMonitor.get(m.id);
      const status: string = latestRun?.level ?? (latestRun ? (latestRun.ok ? 'green' : 'red') : 'unknown');

      topMonitors.push({ name: m.name, uptimePct, status });
    }

    topMonitors.sort((a, b) => a.uptimePct - b.uptimePct); // worst first

    const overallUptimePct =
      topMonitors.length > 0
        ? Math.round((topMonitors.reduce((s, m) => s + m.uptimePct, 0) / topMonitors.length) * 10) / 10
        : 100;

    const activeIncidents = await this.prisma.incident.count({
      where: { userId, resolvedAt: null },
    });

    return {
      totalMonitors,
      uptimeMonitors: uptimeMonitors.length,
      overallUptimePct,
      greenCount,
      yellowCount,
      redCount,
      topMonitors,
      activeIncidents,
    };
  }

  // ── Operations Digest ───────────────────────────────────────────────────────

  /**
   * Computes a full on-demand operations digest for the given period (7, 30, or 90 days).
   */
  async getDigest(userId: string, period: number): Promise<DigestResult> {
    const now = new Date();
    const periodStart = new Date(now.getTime() - period * 24 * 3_600_000);
    const priorStart = new Date(periodStart.getTime() - period * 24 * 3_600_000);

    const VERSION_TYPES = new Set(['GIT_RELEASE', 'DOCKER_IMAGE']);
    const UPTIME_TYPES = new Set(['HTTP', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP', 'BROWSER', 'FTP', 'IMAP', 'POP3', 'WHOIS', 'GRAPHQL', 'TRANSACTION', 'CT_LOG']);

    // ── Fleet ────────────────────────────────────────────────────────────────
    const monitors = await this.prisma.monitor.findMany({
      where: { userId, enabled: true },
      select: {
        id: true,
        name: true,
        type: true,
        intervalSec: true,
        slaTarget: true,
        monitorAlerts: { select: { alertChannelId: true } },
      },
    });

    const uptimeMonitors = monitors.filter((m) => UPTIME_TYPES.has(m.type));
    const versionMonitors = monitors.filter((m) => VERSION_TYPES.has(m.type));

    // ── Runs for the current period ──────────────────────────────────────────
    const periodRuns = await this.prisma.monitorRun.findMany({
      where: { userId, checkedAt: { gte: periodStart } },
      select: { monitorId: true, ok: true, latencyMs: true, checkedAt: true },
    });

    // ── Runs for the prior period ────────────────────────────────────────────
    const priorRuns = await this.prisma.monitorRun.findMany({
      where: { userId, checkedAt: { gte: priorStart, lt: periodStart } },
      select: { monitorId: true, ok: true },
    });

    // Per-monitor stats (current period)
    const monitorRunMap = new Map<string, { total: number; ok: number; latencies: number[] }>();
    for (const run of periodRuns) {
      let entry = monitorRunMap.get(run.monitorId);
      if (!entry) {
        entry = { total: 0, ok: 0, latencies: [] };
        monitorRunMap.set(run.monitorId, entry);
      }
      entry.total++;
      if (run.ok) entry.ok++;
      if (run.latencyMs != null) entry.latencies.push(run.latencyMs);
    }

    // Per-monitor stats (prior period)
    const priorMonitorMap = new Map<string, { total: number; ok: number }>();
    for (const run of priorRuns) {
      let entry = priorMonitorMap.get(run.monitorId);
      if (!entry) {
        entry = { total: 0, ok: 0 };
        priorMonitorMap.set(run.monitorId, entry);
      }
      entry.total++;
      if (run.ok) entry.ok++;
    }

    // Compute uptime% per uptime monitor
    const uptimeStats: Array<{ id: string; name: string; type: string; uptimePct: number; avgLatencyMs: number | null; priorUptimePct: number | null }> = [];
    for (const m of uptimeMonitors) {
      const stats = monitorRunMap.get(m.id);
      if (!stats || stats.total === 0) continue;
      const uptimePct = (stats.ok / stats.total) * 100;
      const avgLatencyMs = stats.latencies.length > 0
        ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
        : null;

      const priorStats = priorMonitorMap.get(m.id);
      const priorUptimePct = priorStats && priorStats.total > 0
        ? (priorStats.ok / priorStats.total) * 100
        : null;

      uptimeStats.push({ id: m.id, name: m.name, type: m.type, uptimePct, avgLatencyMs, priorUptimePct });
    }

    const overallUptimePct = uptimeStats.length > 0
      ? uptimeStats.reduce((s, m) => s + m.uptimePct, 0) / uptimeStats.length
      : 100;

    const overallGrade = this.uptimeToGrade(overallUptimePct);

    // ── Top / Worst performers ───────────────────────────────────────────────
    const sorted = [...uptimeStats].sort((a, b) => b.uptimePct - a.uptimePct);
    const topPerformers: DigestPerformer[] = sorted.slice(0, 5).map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      uptimePct: Math.round(m.uptimePct * 100) / 100,
      avgLatencyMs: m.avgLatencyMs != null ? Math.round(m.avgLatencyMs) : null,
    }));
    const worstPerformers: DigestPerformer[] = [...sorted].reverse().slice(0, 5).map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      uptimePct: Math.round(m.uptimePct * 100) / 100,
      avgLatencyMs: m.avgLatencyMs != null ? Math.round(m.avgLatencyMs) : null,
    }));

    // ── Most improved / degraded ─────────────────────────────────────────────
    const deltas: Array<{ id: string; name: string; uptimeDelta: number }> = [];
    for (const m of uptimeStats) {
      if (m.priorUptimePct == null) continue;
      deltas.push({ id: m.id, name: m.name, uptimeDelta: m.uptimePct - m.priorUptimePct });
    }
    deltas.sort((a, b) => b.uptimeDelta - a.uptimeDelta);
    const mostImproved: DigestImprovement[] = deltas.filter((d) => d.uptimeDelta > 0).slice(0, 3).map((d) => ({
      id: d.id,
      name: d.name,
      uptimeDelta: Math.round(d.uptimeDelta * 100) / 100,
    }));
    const mostDegraded: DigestImprovement[] = [...deltas].reverse().filter((d) => d.uptimeDelta < 0).slice(0, 3).map((d) => ({
      id: d.id,
      name: d.name,
      uptimeDelta: Math.round(d.uptimeDelta * 100) / 100,
    }));

    // ── Checks ───────────────────────────────────────────────────────────────
    const totalRuns = periodRuns.length;
    const successRuns = periodRuns.filter((r) => r.ok).length;
    const failedRuns = totalRuns - successRuns;
    const successRate = totalRuns > 0 ? (successRuns / totalRuns) * 100 : 100;

    // ── Alerts ───────────────────────────────────────────────────────────────
    const allAlerts = await this.prisma.alertDeliveryLog.findMany({
      where: { createdAt: { gte: periodStart } },
      select: { monitorId: true, monitorName: true, trigger: true },
    });

    // Filter to only this user's monitors
    const userMonitorIds = new Set(monitors.map((m) => m.id));
    const userAlerts = allAlerts.filter((a) => a.monitorId == null || userMonitorIds.has(a.monitorId));

    const totalFired = userAlerts.filter((a) => a.trigger !== 'monitor_recovery').length;
    const recoveryAlerts = userAlerts.filter((a) => a.trigger === 'monitor_recovery').length;
    const recoveryRate = totalFired > 0 ? Math.round((recoveryAlerts / totalFired) * 100) : 100;

    // Top noisy monitor
    const noiseCounts = new Map<string, { name: string; count: number }>();
    for (const a of userAlerts) {
      if (!a.monitorId || a.trigger === 'monitor_recovery') continue;
      const entry = noiseCounts.get(a.monitorId);
      if (entry) {
        entry.count++;
      } else {
        noiseCounts.set(a.monitorId, { name: a.monitorName ?? a.monitorId, count: 1 });
      }
    }
    let topNoisyMonitor: { name: string; count: number } | null = null;
    for (const v of noiseCounts.values()) {
      if (!topNoisyMonitor || v.count > topNoisyMonitor.count) topNoisyMonitor = v;
    }

    // ── Incidents ────────────────────────────────────────────────────────────
    const incidents = await this.prisma.incident.findMany({
      where: { userId, createdAt: { gte: periodStart } },
      select: { resolvedAt: true, createdAt: true },
    });

    const resolvedIncidents = incidents.filter((i) => i.resolvedAt != null);
    const avgResolutionMinutes = resolvedIncidents.length > 0
      ? resolvedIncidents.reduce((s, i) => s + (i.resolvedAt!.getTime() - i.createdAt.getTime()) / 60_000, 0) / resolvedIncidents.length
      : null;

    // ── Version updates ──────────────────────────────────────────────────────
    let upToDate = 0;
    let updateAvailable = 0;
    for (const m of versionMonitors) {
      const lastRun = monitorRunMap.get(m.id);
      if (!lastRun) continue;
      if (lastRun.ok) upToDate++;
      else updateAvailable++;
    }

    // ── Uptime trend (daily buckets) ─────────────────────────────────────────
    const uptimeTrend: DigestTrendPoint[] = [];
    for (let i = period - 1; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
      const dateStr = dayStart.toISOString().slice(0, 10);

      const dayRuns = periodRuns.filter((r) => r.checkedAt >= dayStart && r.checkedAt < dayEnd);
      if (dayRuns.length === 0) {
        uptimeTrend.push({ date: dateStr, uptimePct: null });
      } else {
        const dayOk = dayRuns.filter((r) => r.ok).length;
        uptimeTrend.push({ date: dateStr, uptimePct: Math.round((dayOk / dayRuns.length) * 10000) / 100 });
      }
    }

    // ── Recommendations ──────────────────────────────────────────────────────
    const recommendations: DigestRecommendation[] = [];

    // Monitors with no alert channel (high)
    for (const m of monitors) {
      if (m.monitorAlerts.length === 0) {
        recommendations.push({
          severity: 'high',
          title: `"${m.name}" has no alert channel`,
          description: 'This monitor will not notify anyone when it goes down. Add an alert channel.',
          monitorId: m.id,
        });
      }
    }

    // Monitors with >5% downtime in period (high)
    for (const m of uptimeStats) {
      if (m.uptimePct < 95) {
        recommendations.push({
          severity: 'high',
          title: `"${m.name}" had ${(100 - m.uptimePct).toFixed(1)}% downtime`,
          description: `This monitor had significant downtime in the last ${period} days. Investigate the root cause.`,
          monitorId: m.id,
        });
      }
    }

    // Monitors with no SLA target (medium)
    for (const m of monitors) {
      if (m.slaTarget == null) {
        recommendations.push({
          severity: 'medium',
          title: `"${m.name}" has no SLA target`,
          description: 'Setting an SLA target helps track service commitments and enables SLA breach alerting.',
          monitorId: m.id,
        });
      }
    }

    // Monitors not checked in last 2x their interval (low)
    const now2 = now.getTime();
    for (const m of monitors) {
      const lastRun = periodRuns
        .filter((r) => r.monitorId === m.id)
        .sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())[0];
      if (lastRun) {
        const msSinceLastCheck = now2 - lastRun.checkedAt.getTime();
        if (msSinceLastCheck > m.intervalSec * 2 * 1000) {
          recommendations.push({
            severity: 'low',
            title: `"${m.name}" hasn't been checked recently`,
            description: `Expected every ${m.intervalSec}s but last check was ${Math.round(msSinceLastCheck / 60_000)} minutes ago.`,
            monitorId: m.id,
          });
        }
      }
    }

    return {
      period,
      generatedAt: now.toISOString(),
      fleet: {
        totalMonitors: monitors.length,
        uptimeMonitors: uptimeMonitors.length,
        versionMonitors: versionMonitors.length,
        overallUptimePct: Math.round(overallUptimePct * 100) / 100,
        overallGrade,
      },
      topPerformers,
      worstPerformers,
      mostImproved,
      mostDegraded,
      alerts: {
        totalFired,
        topNoisyMonitor,
        recoveryRate,
      },
      incidents: {
        total: incidents.length,
        resolved: resolvedIncidents.length,
        avgResolutionMinutes: avgResolutionMinutes != null ? Math.round(avgResolutionMinutes) : null,
      },
      checks: {
        totalRuns,
        successRuns,
        failedRuns,
        successRate: Math.round(successRate * 100) / 100,
      },
      versionUpdates: {
        monitored: versionMonitors.length,
        upToDate,
        updateAvailable,
      },
      recommendations,
      uptimeTrend,
    };
  }

  private uptimeToGrade(uptimePct: number): string {
    if (uptimePct >= 99.9) return 'A';
    if (uptimePct >= 99) return 'B';
    if (uptimePct >= 95) return 'C';
    if (uptimePct >= 90) return 'D';
    return 'F';
  }
}
