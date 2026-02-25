import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { PrismaService } from '../common/prisma.service';

@UseGuards(AuthGuard)
@Controller('v1/dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview(@Req() req: { user: { id: string } }) {
    const monitors = await this.prisma.monitor.findMany({ where: { userId: req.user.id } });
    const runs = await this.prisma.monitorRun.findMany({ where: { userId: req.user.id }, orderBy: { checkedAt: 'desc' } });

    const latestMap = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      if (!latestMap.has(run.monitorId)) latestMap.set(run.monitorId, run);
    }

    let green = 0;
    let yellow = 0;
    let red = 0;
    for (const monitor of monitors) {
      const latest = latestMap.get(monitor.id);
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
      latestRuns: runs.slice(0, 12).map((r) => ({
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
