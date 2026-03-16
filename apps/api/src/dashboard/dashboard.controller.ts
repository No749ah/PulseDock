import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { PrismaService } from '../common/prisma.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Dashboard overview', description: 'Returns aggregate monitor stats and recent check runs for the authenticated user.' })
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
    });

    let green = 0;
    let yellow = 0;
    let red = 0;
    for (const monitor of monitors) {
      const latest = monitor.runs[0];
      if (!latest || latest.level === 'green') green += 1;
      else if (latest.level === 'yellow') yellow += 1;
      else red += 1;
    }

    const total = monitors.length;
    const uptimePct = total === 0 ? 100 : Math.round((green / total) * 10000) / 100;

    return {
      stats: {
        totalMonitors: total,
        green,
        yellow,
        red,
        uptimePct,
      },
      latestRuns: recentRuns.map((r) => ({
        id: r.id,
        userId: r.userId,
        monitorId: r.monitorId,
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
