import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from './checks.service';

@Injectable()
export class ChecksScheduler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checksService: ChecksService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick() {
    const now = Date.now();
    const monitors = await this.prisma.monitor.findMany({ where: { enabled: true } });

    for (const monitor of monitors) {
      const latest = await this.prisma.monitorRun.findFirst({
        where: { monitorId: monitor.id },
        orderBy: { checkedAt: 'desc' },
      });
      const due = !latest || now - latest.checkedAt.getTime() >= monitor.intervalSec * 1000;
      if (!due) continue;

      await this.checksService.runMonitor({
        id: monitor.id,
        userId: monitor.userId,
        name: monitor.name,
        type: monitor.type,
        target: monitor.target,
        intervalSec: monitor.intervalSec,
        timeoutMs: monitor.timeoutMs,
        config: (monitor.configJson as Record<string, unknown> | null) ?? {},
        alertChannelIds: [],
        folderId: monitor.folderId,
        enabled: monitor.enabled,
        createdAt: monitor.createdAt.toISOString(),
      });
    }
  }
}
