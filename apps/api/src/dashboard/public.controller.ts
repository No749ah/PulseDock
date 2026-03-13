import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma.service';

@ApiTags('Public')
@Controller('v1/public')
export class PublicDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview/:userId')
  @ApiOperation({ summary: 'Public status page data', description: 'Returns public monitor stats for a given user. No auth required — for public status pages.' })
  @ApiParam({ name: 'userId', description: 'User ID whose public status page to fetch' })
  @ApiResponse({ status: 200, description: 'Public overview returned.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async overview(@Param('userId') userId: string) {
    // Verify user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) throw new NotFoundException('User not found');

    const monitors = await this.prisma.monitor.findMany({
      where: { userId, enabled: true },
      orderBy: { name: 'asc' },
    });

    const runs = await this.prisma.monitorRun.findMany({
      where: { userId },
      orderBy: { checkedAt: 'desc' },
      take: 500,
    });

    // Build latest run map per monitor
    const latestMap = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      if (!latestMap.has(run.monitorId)) latestMap.set(run.monitorId, run);
    }

    let green = 0;
    let yellow = 0;
    let red = 0;

    const monitorStatuses = monitors.map((monitor) => {
      const latest = latestMap.get(monitor.id);
      const level = latest?.level ?? 'green';

      if (!latest || level === 'green') green += 1;
      else if (level === 'yellow') yellow += 1;
      else red += 1;

      return {
        id: monitor.id,
        name: monitor.name,
        type: monitor.type,
        level: level as 'green' | 'yellow' | 'red',
        lastChecked: latest?.checkedAt.toISOString() ?? null,
        message: latest?.message ?? null,
        latencyMs: latest?.latencyMs ?? null,
      };
    });

    const total = monitors.length;
    const uptimePct = total === 0 ? 100 : Math.round((green / total) * 10000) / 100;

    return {
      userId,
      displayName: user.email,
      totalMonitors: total,
      green,
      yellow,
      red,
      uptimePct,
      monitors: monitorStatuses,
      recentEvents: runs.slice(0, 20).map((r) => ({
        id: r.id,
        monitorId: r.monitorId,
        checkedAt: r.checkedAt.toISOString(),
        ok: r.ok,
        latencyMs: r.latencyMs,
        message: r.message,
        level: r.level as 'green' | 'yellow' | 'red',
      })),
    };
  }
}
