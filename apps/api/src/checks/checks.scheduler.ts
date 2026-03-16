import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from './checks.service';

/** How many days of MonitorRun history to keep. Configurable via RUN_RETENTION_DAYS env var. Default: 90 days. */
const RUN_RETENTION_DAYS = Math.max(1, parseInt(process.env['RUN_RETENTION_DAYS'] ?? '90', 10) || 90);

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
          confirmations: monitor.confirmations,
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

  /**
   * Daily cleanup: delete MonitorRun records older than RUN_RETENTION_DAYS.
   * Runs at 03:00 UTC to avoid overlapping with peak traffic.
   * Controlled by RUN_RETENTION_DAYS env var (default: 90 days, minimum: 1 day).
   */
  @Cron('0 3 * * *')
  async pruneOldRuns() {
    const cutoff = new Date(Date.now() - RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    try {
      const result = await this.prisma.monitorRun.deleteMany({
        where: { checkedAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        this.logger.log(`Pruned ${result.count} MonitorRun records older than ${RUN_RETENTION_DAYS} days`);
      }
    } catch (err) {
      this.logger.error('Failed to prune old MonitorRun records', err instanceof Error ? err.message : String(err));
    }
  }
}
