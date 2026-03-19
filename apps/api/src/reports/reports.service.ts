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

  async getReport(userId: string) {
    return this.prisma.scheduledReport.findUnique({ where: { userId } });
  }

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

  async deleteReport(userId: string) {
    try {
      await this.prisma.scheduledReport.delete({ where: { userId } });
    } catch {
      // Not found — fine
    }
  }

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

  private async computeReportData(userId: string, frequency: string) {
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
