import { Controller, Get, Param } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Controller('v1/public')
export class PublicDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview/:userId')
  async overview(@Param('userId') userId: string) {
    const monitors = await this.prisma.monitor.findMany({ where: { userId } });
    const runs = await this.prisma.monitorRun.findMany({ where: { userId }, orderBy: { checkedAt: 'desc' } });

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
      totalMonitors: total,
      green,
      yellow,
      red,
      uptimePct,
      latestRuns: runs.slice(0, 10).map((r) => ({
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
