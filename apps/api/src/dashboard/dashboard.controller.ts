import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
}
