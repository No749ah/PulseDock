import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MonitorType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from './checks.service';
import { AlertsService } from '../alerts/alerts.service';

/** How many days of MonitorRun history to keep. Configurable via RUN_RETENTION_DAYS env var. Default: 90 days. */
const RUN_RETENTION_DAYS = Math.max(1, parseInt(process.env['RUN_RETENTION_DAYS'] ?? '90', 10) || 90);

/** Max jitter delay (ms) added to each check to avoid thundering herd. */
const MAX_JITTER_MS = 5_000;

/** Log a warning when this many monitors are concurrently being checked. */
const QUEUE_DEPTH_WARN_THRESHOLD = 50;

@Injectable()
export class ChecksScheduler {
  private readonly logger = new Logger(ChecksScheduler.name);

  /** Tracks how many monitors are currently being checked. */
  private queueDepth = 0;

  /** Duration (ms) of the last completed check cycle. */
  private lastCycleMs = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly checksService: ChecksService,
    private readonly alertsService: AlertsService,
  ) {}

  /** Returns the current check queue depth (number of monitors actively being checked). */
  getQueueDepth(): number {
    return this.queueDepth;
  }

  /** Returns the duration in ms of the last completed check cycle. */
  getLastCycleMs(): number {
    return this.lastCycleMs;
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick() {
    const cycleStart = Date.now();

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

    const total = monitors.length;
    const due = monitors.filter((monitor) => {
      const latest = monitor.runs[0] ?? null;
      return !latest || cycleStart - latest.checkedAt.getTime() >= monitor.intervalSec * 1000;
    });

    const skipped = total - due.length;

    if (due.length === 0) {
      const earlyDuration = Date.now() - cycleStart;
      this.lastCycleMs = earlyDuration;
      this.logger.log(JSON.stringify({
        event: 'check.cycle',
        total,
        due: 0,
        skipped,
        durationMs: earlyDuration,
      }));
      return;
    }

    // Run due monitors concurrently with per-monitor jitter to avoid thundering herd
    const results = await Promise.allSettled(
      due.map((monitor) => this.runWithJitter(monitor)),
    );

    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn(`${failed.length}/${due.length} monitor checks failed in tick`);
    }

    const durationMs = Date.now() - cycleStart;
    this.lastCycleMs = durationMs;

    this.logger.log(JSON.stringify({
      event: 'check.cycle',
      total,
      due: due.length,
      skipped,
      durationMs,
    }));
  }

  /**
   * Applies a random jitter delay (0–MAX_JITTER_MS) before running a monitor check.
   * This staggers concurrent checks to prevent thundering herd issues.
   */
  private async runWithJitter(monitor: {
    id: string;
    userId: string;
    name: string;
    type: MonitorType;
    target: string;
    intervalSec: number;
    timeoutMs: number;
    confirmations: number;
    configJson: unknown;
    folderId: string | null;
    enabled: boolean;
    createdAt: Date;
    slaTarget?: number | null;
    slaPeriodDays?: number | null;
    slaBreachAlertedAt?: Date | null;
  }): Promise<void> {
    const jitterMs = Math.floor(Math.random() * MAX_JITTER_MS);
    if (jitterMs > 0) {
      await new Promise((r) => setTimeout(r, jitterMs));
    }

    this.queueDepth++;
    if (this.queueDepth >= QUEUE_DEPTH_WARN_THRESHOLD) {
      this.logger.warn(`Check queue depth ${this.queueDepth} exceeds threshold of ${QUEUE_DEPTH_WARN_THRESHOLD}`);
    }

    try {
      await this.checksService.runMonitor({
        id: monitor.id,
        userId: monitor.userId,
        name: monitor.name,
        type: monitor.type as MonitorType,
        target: monitor.target,
        intervalSec: monitor.intervalSec,
        timeoutMs: monitor.timeoutMs,
        confirmations: monitor.confirmations,
        config: (monitor.configJson as Record<string, unknown> | null | undefined) ?? {},
        alertChannelIds: [],
        folderId: monitor.folderId,
        enabled: monitor.enabled,
        createdAt: monitor.createdAt.toISOString(),
        slaTarget: monitor.slaTarget ?? null,
        slaPeriodDays: monitor.slaPeriodDays ?? null,
        slaBreachAlertedAt: monitor.slaBreachAlertedAt ? monitor.slaBreachAlertedAt.toISOString() : null,
      });
    } finally {
      this.queueDepth--;
    }
  }

  /**
   * Every 15 minutes: check SLA targets across all monitors that have slaTarget set.
   * Fires a breach alert when rolling uptime drops below the target (at most once per 24h).
   * Fires a recovery alert when uptime returns above the target and was previously breached.
   */
  @Cron('*/15 * * * *')
  async checkSlaBreach() {
    const monitors = await this.prisma.monitor.findMany({
      where: { enabled: true, slaTarget: { not: null } },
    });

    for (const monitor of monitors) {
      if (monitor.slaTarget === null) continue;

      const periodDays = monitor.slaPeriodDays ?? 30;
      const from = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

      const runs = await this.prisma.monitorRun.findMany({
        where: { monitorId: monitor.id, checkedAt: { gte: from } },
        select: { ok: true },
      });

      const totalChecks = runs.length;
      if (totalChecks === 0) continue;

      const successChecks = runs.filter((r) => r.ok).length;
      const actualPct = Math.round((successChecks / totalChecks) * 10000) / 100;
      const targetPct = monitor.slaTarget;

      const now = new Date();

      if (actualPct < targetPct) {
        // Check if we should fire (no prior alert OR last alert > 24h ago)
        const lastAlerted = monitor.slaBreachAlertedAt;
        const hoursSinceLastAlert = lastAlerted
          ? (now.getTime() - lastAlerted.getTime()) / 3_600_000
          : Infinity;

        if (hoursSinceLastAlert >= 24) {
          try {
            await this.alertsService.notifySlaBreached(
              monitor.id,
              monitor.name,
              monitor.userId,
              actualPct,
              targetPct,
              periodDays,
            );
          } catch (err) {
            this.logger.error(`SLA breach notification failed for monitor ${monitor.id}`, err instanceof Error ? err.message : String(err));
          }

          await this.prisma.monitor.update({
            where: { id: monitor.id },
            data: { slaBreachAlertedAt: now },
          });

          this.logger.log(JSON.stringify({
            event: 'sla.breach',
            monitorId: monitor.id,
            monitorName: monitor.name,
            actualPct,
            targetPct,
            periodDays,
          }));
        }
      } else if (monitor.slaBreachAlertedAt !== null) {
        // Uptime recovered — fire recovery alert and clear the breach state
        try {
          await this.alertsService.notifySlaRecovered(
            monitor.id,
            monitor.name,
            monitor.userId,
            actualPct,
            targetPct,
            periodDays,
          );
        } catch (err) {
          this.logger.error(`SLA recovery notification failed for monitor ${monitor.id}`, err instanceof Error ? err.message : String(err));
        }

        await this.prisma.monitor.update({
          where: { id: monitor.id },
          data: { slaBreachAlertedAt: null },
        });

        this.logger.log(JSON.stringify({
          event: 'sla.recovered',
          monitorId: monitor.id,
          monitorName: monitor.name,
          actualPct,
          targetPct,
          periodDays,
        }));
      }
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
