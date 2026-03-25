import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { MailerService } from '../common/mailer.service';
import { UpsertReportDto } from './reports.dto';

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
}
