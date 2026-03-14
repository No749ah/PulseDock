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

    // Fetch last 500 runs across all monitors, ordered newest-first
    const runs = await this.prisma.monitorRun.findMany({
      where: { userId },
      orderBy: { checkedAt: 'desc' },
      take: 500,
    });

    // Group runs by monitorId (still newest-first)
    const runsByMonitor = new Map<string, (typeof runs)>();
    for (const run of runs) {
      if (!runsByMonitor.has(run.monitorId)) runsByMonitor.set(run.monitorId, []);
      runsByMonitor.get(run.monitorId)!.push(run);
    }

    let green = 0;
    let yellow = 0;
    let red = 0;

    const monitorStatuses = monitors.map((monitor) => {
      const monRuns = runsByMonitor.get(monitor.id) ?? [];
      const latest = monRuns[0]; // newest-first
      const level = (latest?.level ?? 'green') as 'green' | 'yellow' | 'red';

      if (!latest || level === 'green') green += 1;
      else if (level === 'yellow') yellow += 1;
      else red += 1;

      // Per-monitor uptime %: fraction of green runs in last 100 runs
      const recentRuns = monRuns.slice(0, 100);
      const greenCount = recentRuns.filter((r) => r.level === 'green').length;
      const monitorUptimePct = recentRuns.length === 0 ? 100 : Math.round((greenCount / recentRuns.length) * 10000) / 100;

      // Latency sparkline: last 30 runs with non-null latency, chronological order
      const latencyHistory = monRuns
        .slice(0, 30)
        .reverse()
        .filter((r) => r.latencyMs !== null)
        .map((r) => ({ checkedAt: r.checkedAt.toISOString(), latencyMs: r.latencyMs as number }));

      return {
        id: monitor.id,
        name: monitor.name,
        type: monitor.type,
        level,
        lastChecked: latest?.checkedAt.toISOString() ?? null,
        message: latest?.message ?? null,
        latencyMs: latest?.latencyMs ?? null,
        uptimePct: monitorUptimePct,
        latencyHistory,
      };
    });

    const total = monitors.length;
    const uptimePct = total === 0 ? 100 : Math.round((green / total) * 10000) / 100;

    // Compute incident history across all monitors
    // Strategy: per monitor, scan runs oldest-to-newest, track open incidents
    const incidents: Array<{
      id: string;
      monitorId: string;
      monitorName: string;
      level: 'yellow' | 'red';
      startedAt: string;
      resolvedAt: string | null;
      durationMs: number | null;
    }> = [];

    for (const monitor of monitors) {
      const monRuns = (runsByMonitor.get(monitor.id) ?? []).slice().reverse(); // oldest-first
      let incidentStart: (typeof monRuns)[number] | null = null;
      let incidentLevel: 'yellow' | 'red' = 'yellow';

      for (const run of monRuns) {
        const lvl = run.level as 'green' | 'yellow' | 'red';
        if (lvl !== 'green') {
          if (!incidentStart) {
            incidentStart = run;
            incidentLevel = lvl === 'red' ? 'red' : 'yellow';
          } else if (lvl === 'red') {
            // Escalate level if red encountered
            incidentLevel = 'red';
          }
        } else {
          if (incidentStart) {
            // Incident resolved
            const startMs = incidentStart.checkedAt.getTime();
            const endMs = run.checkedAt.getTime();
            incidents.push({
              id: `${monitor.id}-${startMs}`,
              monitorId: monitor.id,
              monitorName: monitor.name,
              level: incidentLevel,
              startedAt: incidentStart.checkedAt.toISOString(),
              resolvedAt: run.checkedAt.toISOString(),
              durationMs: endMs - startMs,
            });
            incidentStart = null;
            incidentLevel = 'yellow';
          }
        }
      }

      // Ongoing incident
      if (incidentStart) {
        incidents.push({
          id: `${monitor.id}-${incidentStart.checkedAt.getTime()}`,
          monitorId: monitor.id,
          monitorName: monitor.name,
          level: incidentLevel,
          startedAt: incidentStart.checkedAt.toISOString(),
          resolvedAt: null,
          durationMs: null,
        });
      }
    }

    // Sort incidents newest-first
    incidents.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    return {
      userId,
      displayName: user.email,
      totalMonitors: total,
      green,
      yellow,
      red,
      uptimePct,
      monitors: monitorStatuses,
      incidents: incidents.slice(0, 20),
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
