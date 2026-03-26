import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { PrismaService } from '../common/prisma.service';

/** Monitor types that represent uptime/availability checks */
const UPTIME_MONITOR_TYPES = ['HTTP', 'TCP', 'SSL_CERT', 'HEARTBEAT'] as const;
/** Monitor types that represent version / release tracking */
const VERSION_MONITOR_TYPES = ['GIT_RELEASE', 'DOCKER_IMAGE'] as const;

type UptimeType = typeof UPTIME_MONITOR_TYPES[number];
type VersionType = typeof VERSION_MONITOR_TYPES[number];

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Dashboard overview', description: 'Returns aggregate monitor stats (uptime monitors and version monitors treated separately) and recent check runs for the authenticated user.' })
  @ApiResponse({ status: 200, description: 'Dashboard overview returned.' })
  async overview(@Req() req: { user: { id: string } }) {
    // Load monitors with their latest run in a single query to avoid N+1
    const monitors = await this.prisma.monitor.findMany({
      where: { userId: req.user.id },
      include: {
        runs: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
        },
      },
    });

    // Fetch the 20 most recent runs across all monitors for the activity feed
    const recentRuns = await this.prisma.monitorRun.findMany({
      where: { userId: req.user.id },
      orderBy: { checkedAt: 'desc' },
      take: 20,
      include: { monitor: { select: { type: true } } },
    });

    // --- Uptime stats: only HTTP / TCP / SSL / Heartbeat monitors ---
    const uptimeMonitors = monitors.filter((m) =>
      (UPTIME_MONITOR_TYPES as ReadonlyArray<string>).includes(m.type),
    );

    let uptimeGreen = 0;
    let uptimeYellow = 0;
    let uptimeRed = 0;
    for (const monitor of uptimeMonitors) {
      const latest = monitor.runs[0];
      if (!latest || latest.level === 'green') uptimeGreen += 1;
      else if (latest.level === 'yellow') uptimeYellow += 1;
      else uptimeRed += 1;
    }

    const uptimeTotal = uptimeMonitors.length;
    const uptimePct =
      uptimeTotal === 0
        ? 100
        : Math.round((uptimeGreen / uptimeTotal) * 10000) / 100;

    // --- Version stats: GIT_RELEASE / DOCKER_IMAGE monitors ---
    const versionMonitors = monitors.filter((m) =>
      (VERSION_MONITOR_TYPES as ReadonlyArray<string>).includes(m.type),
    );

    let versionUpToDate = 0;
    let versionUpdateAvailable = 0; // yellow: minor/patch behind
    let versionMajorBehind = 0;    // red: major version behind
    for (const monitor of versionMonitors) {
      const latest = monitor.runs[0];
      if (!latest || latest.level === 'green') versionUpToDate += 1;
      else if (latest.level === 'yellow') versionUpdateAvailable += 1;
      else versionMajorBehind += 1;
    }

    // Legacy aggregate (all monitors, for backwards compat)
    const total = monitors.length;

    return {
      stats: {
        totalMonitors: total,
        // --- Uptime monitors (HTTP / TCP / SSL / Heartbeat) ---
        uptimeMonitors: uptimeTotal,
        uptimeGreen,
        uptimeYellow,
        uptimeRed,
        uptimePct,
        // --- Version monitors (GIT_RELEASE / DOCKER_IMAGE) ---
        versionMonitors: versionMonitors.length,
        versionUpToDate,
        versionUpdateAvailable,
        versionMajorBehind,
        // Legacy fields kept for compatibility
        green: uptimeGreen,
        yellow: uptimeYellow,
        red: uptimeRed,
      },
      latestRuns: recentRuns.map((r) => ({
        id: r.id,
        userId: r.userId,
        monitorId: r.monitorId,
        monitorType: r.monitor?.type ?? null,
        checkedAt: r.checkedAt.toISOString(),
        ok: r.ok,
        statusCode: r.status,
        latencyMs: r.latencyMs,
        message: r.message,
        level: r.level,
      })),
    };
  }

  /**
   * Returns a per-day health score for the past N days (default 30).
   * Health score = percentage of uptime monitors that were green on that day.
   * A monitor is "green on day D" if all its checks on day D had level=green.
   * Days with no checks return null (shown as gaps in the chart).
   */
  @Get('health-timeline')
  @ApiOperation({
    summary: 'Dashboard health timeline',
    description:
      'Returns a per-day infrastructure health score for the last N days (default 30). ' +
      'Score = % of uptime monitors with all checks green on that UTC day. ' +
      'Days with no checks are returned as null (chart gap). ' +
      'Used for the dashboard trend chart.',
  })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to return (1-90, default 30)', type: Number })
  @ApiResponse({ status: 200, description: 'Health timeline returned.' })
  async healthTimeline(
    @Req() req: { user: { id: string } },
    @Query('days') daysParam?: string,
  ): Promise<{ timeline: Array<{ date: string; healthScore: number | null; green: number; total: number }> }> {
    const days = Math.min(90, Math.max(1, parseInt(daysParam ?? '30', 10) || 30));

    // Get the user's uptime monitors
    const uptimeMonitors = await this.prisma.monitor.findMany({
      where: {
        userId: req.user.id,
        type: { in: ['HTTP', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP', 'BROWSER'] },
      },
      select: { id: true },
    });

    if (uptimeMonitors.length === 0) {
      const timeline = Array.from({ length: days }, (_, i) => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - (days - 1 - i));
        return { date: d.toISOString().slice(0, 10), healthScore: null, green: 0, total: 0 };
      });
      return { timeline };
    }

    const monitorIds = uptimeMonitors.map((m) => m.id);
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days + 1);
    since.setUTCHours(0, 0, 0, 0);

    // Fetch all runs for these monitors in the window
    const runs = await this.prisma.monitorRun.findMany({
      where: {
        userId: req.user.id,
        monitorId: { in: monitorIds },
        checkedAt: { gte: since },
      },
      select: { monitorId: true, checkedAt: true, level: true },
      orderBy: { checkedAt: 'asc' },
    });

    // Group runs by UTC date → monitor → all levels
    const byDate = new Map<string, Map<string, boolean>>();
    for (const run of runs) {
      const date = run.checkedAt.toISOString().slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, new Map());
      const dayMap = byDate.get(date)!;
      // A monitor is "green" on a day only if ALL its runs are green
      const prev = dayMap.get(run.monitorId);
      const isGreen = run.level === 'green';
      dayMap.set(run.monitorId, prev === undefined ? isGreen : prev && isGreen);
    }

    // Build the timeline
    const timeline: Array<{ date: string; healthScore: number | null; green: number; total: number }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayMap = byDate.get(dateStr);
      if (!dayMap || dayMap.size === 0) {
        timeline.push({ date: dateStr, healthScore: null, green: 0, total: 0 });
      } else {
        const total = dayMap.size;
        const green = Array.from(dayMap.values()).filter(Boolean).length;
        timeline.push({
          date: dateStr,
          healthScore: Math.round((green / total) * 10000) / 100,
          green,
          total,
        });
      }
    }

    return { timeline };
  }
}
