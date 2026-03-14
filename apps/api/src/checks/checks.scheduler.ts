import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from './checks.service';

@Injectable()
export class ChecksScheduler {
  private readonly logger = new Logger(ChecksScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly checksService: ChecksService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick() {
    const now = Date.now();

    // Single query: fetch all enabled monitors with their latest run (avoids N+1)
    const monitors = await this.prisma.monitor.findMany({
      where: { enabled: true },
      include: {
        runs: {
          take: 1,
          orderBy: { checkedAt: 'desc' },
        },
      },
    });

    const due = monitors.filter((monitor) => {
      const latest = monitor.runs[0] ?? null;
      return !latest || now - latest.checkedAt.getTime() >= monitor.intervalSec * 1000;
    });

    if (due.length === 0) return;

    // Run due monitors concurrently rather than sequentially
    const results = await Promise.allSettled(
      due.map((monitor) =>
        this.checksService.runMonitor({
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
        }),
      ),
    );

    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn(`${failed.length}/${due.length} monitor checks failed in tick`);
    }
  }
}
