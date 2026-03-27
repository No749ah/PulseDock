import { Injectable, Logger, BeforeApplicationShutdown, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MonitorType } from '@prisma/client';
import { CronExpressionParser } from 'cron-parser';
import { PrismaService } from '../common/prisma.service';
import { ChecksService } from './checks.service';
import { AlertsService } from '../alerts/alerts.service';
import { EscalationService } from '../escalation/escalation.service';

/**
 * Returns true if a monitor with a cron expression is due to run.
 * A cron-scheduled monitor is due when the most recent "prev" fire time
 * is strictly after the last check. This means we only run it once per
 * cron window, no matter how fast the tick cycle is.
 */
function isCronDue(cronExpression: string, lastCheckedAt: Date | null): boolean {
  try {
    const interval = CronExpressionParser.parse(cronExpression, { tz: 'UTC' });
    const prev = interval.prev().toDate();
    if (!lastCheckedAt) return true; // never checked → run now
    return prev.getTime() > lastCheckedAt.getTime();
  } catch {
    return false; // invalid expression → skip rather than crash
  }
}

/** How many days of MonitorRun history to keep. Configurable via RUN_RETENTION_DAYS env var. Default: 90 days. */
const RUN_RETENTION_DAYS = Math.max(1, parseInt(process.env['RUN_RETENTION_DAYS'] ?? '90', 10) || 90);

/**
 * Maximum number of monitor checks to run concurrently per scheduler tick.
 * Configurable via MAX_CONCURRENT_CHECKS env var. Default: 50.
 * Setting too high on large deployments may cause CPU/network saturation.
 * Setting too low may cause checks to back up and miss their intervals.
 */
const MAX_CONCURRENT_CHECKS = Math.max(1, parseInt(process.env['MAX_CONCURRENT_CHECKS'] ?? '50', 10) || 50);

/** Max jitter delay (ms) added to each check to avoid thundering herd. */
const MAX_JITTER_MS = 5_000;

/** Log a warning when this many monitors are concurrently being checked. */
const QUEUE_DEPTH_WARN_THRESHOLD = 50;

/** Maximum time (ms) to wait for in-flight checks to finish during shutdown. */
const SHUTDOWN_DRAIN_TIMEOUT_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency limiter
// Runs at most `limit` tasks at once, draining the queue as slots free up.
// Returns Promise.allSettled-style results preserving original order.
// ─────────────────────────────────────────────────────────────────────────────
async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIdx = 0;

  async function runSlot(): Promise<void> {
    while (nextIdx < items.length) {
      const idx = nextIdx++;
      try {
        results[idx] = { status: 'fulfilled', value: await fn(items[idx]) };
      } catch (err) {
        results[idx] = { status: 'rejected', reason: err };
      }
    }
  }

  // Spin up `limit` concurrent slots
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runSlot));
  return results;
}

@Injectable()
export class ChecksScheduler implements BeforeApplicationShutdown {
  private readonly logger = new Logger(ChecksScheduler.name);

  /** Tracks how many monitors are currently being checked. */
  private queueDepth = 0;

  /** Duration (ms) of the last completed check cycle. */
  private lastCycleMs = 0;

  /** When true, new check cycles are suppressed. Set on shutdown signal. */
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly checksService: ChecksService,
    private readonly alertsService: AlertsService,
    @Optional() private readonly escalationService?: EscalationService,
  ) {}

  /** Returns the current check queue depth (number of monitors actively being checked). */
  getQueueDepth(): number {
    return this.queueDepth;
  }

  /** Returns the duration in ms of the last completed check cycle. */
  getLastCycleMs(): number {
    return this.lastCycleMs;
  }

  /**
   * Graceful shutdown: stop accepting new check cycles and wait for in-flight checks
   * to complete (up to SHUTDOWN_DRAIN_TIMEOUT_MS). This prevents data loss or orphaned
   * check results during container restarts or zero-downtime deploys.
   */
  async beforeApplicationShutdown(): Promise<void> {
    this.draining = true;
    this.logger.log(`Shutdown signal received — draining ${this.queueDepth} in-flight checks…`);

    const deadline = Date.now() + SHUTDOWN_DRAIN_TIMEOUT_MS;
    while (this.queueDepth > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
    }

    if (this.queueDepth > 0) {
      this.logger.warn(`Shutdown timeout: ${this.queueDepth} checks still in-flight after ${SHUTDOWN_DRAIN_TIMEOUT_MS}ms`);
    } else {
      this.logger.log('All in-flight checks completed — shutting down cleanly');
    }
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick() {
    if (this.draining) return; // suppress new cycles during shutdown drain
    const cycleStart = Date.now();

    // Single query: fetch all enabled monitors with their latest run (avoids N+1).
    // Explicit select: only pull columns needed for check execution — avoids deserializing
    // large configJson blobs and description text for monitors that don't end up being due.
    const monitors = await this.prisma.monitor.findMany({
      where: { enabled: true },
      select: {
        id: true,
        userId: true,
        name: true,
        type: true,
        target: true,
        intervalSec: true,
        timeoutMs: true,
        confirmations: true,
        retryCount: true,
        configJson: true,
        folderId: true,
        enabled: true,
        description: true,
        runbookUrl: true,
        createdAt: true,
        slaTarget: true,
        slaPeriodDays: true,
        slaBreachAlertedAt: true,
        autoIncident: true,
        autoIncidentSeverity: true,
        activeAutoIncidentId: true,
        isFlapping: true,
        flapDetectionEnabled: true,
        flapWindow: true,
        flapThreshold: true,
        flapAlertedAt: true,
        latencyAlertMs: true,
        anomalyDetection: true,
        anomalyMultiplier: true,
        sliLatencyTarget: true,
        sliLatencyWindow: true,
        cronExpression: true,
        scheduleEnabled: true,
        scheduleDays: true,
        scheduleStartHour: true,
        scheduleEndHour: true,
        runs: {
          take: 1,
          orderBy: { checkedAt: 'desc' },
          select: { checkedAt: true, level: true },
        },
      },
    });

    const nowDate = new Date(cycleStart);
    const nowDayOfWeek = nowDate.getUTCDay();
    const nowHour = nowDate.getUTCHours();

    const total = monitors.length;
    const due = monitors.filter((monitor) => {
      // Schedule check: skip if outside configured window
      if (monitor.scheduleEnabled) {
        const allowedDays = (monitor.scheduleDays ?? '1,2,3,4,5').split(',').map(Number);
        if (!allowedDays.includes(nowDayOfWeek)) return false;
        const start = monitor.scheduleStartHour ?? 8;
        const end = monitor.scheduleEndHour ?? 18;
        if (nowHour < start || nowHour >= end) return false;
      }
      const latest = monitor.runs[0] ?? null;
      // If a cron expression is configured, use it to determine due time
      if (monitor.cronExpression) {
        return isCronDue(monitor.cronExpression, latest?.checkedAt ?? null);
      }
      // Otherwise fall back to fixed interval
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

    // Run due monitors concurrently, limited to MAX_CONCURRENT_CHECKS simultaneous checks.
    // This prevents thundering-herd / CPU saturation on large deployments.
    const results = await runWithConcurrencyLimit(
      due,
      MAX_CONCURRENT_CHECKS,
      (monitor) => this.runWithJitter(monitor),
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

    // Check escalation policies — fire next step for monitors that are still down
    if (this.escalationService) {
      this.escalationService.checkAllEscalations().catch((err: unknown) => {
        this.logger.warn(`Escalation check failed: ${String(err)}`);
      });
    }
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
    retryCount: number;
    configJson: unknown;
    folderId: string | null;
    enabled: boolean;
    description?: string | null;
    runbookUrl?: string | null;
    createdAt: Date;
    slaTarget?: number | null;
    slaPeriodDays?: number | null;
    slaBreachAlertedAt?: Date | null;
    autoIncident: boolean;
    autoIncidentSeverity: string;
    activeAutoIncidentId: string | null;
    isFlapping?: boolean;
    flapDetectionEnabled?: boolean;
    flapWindow?: number;
    flapThreshold?: number;
    flapAlertedAt?: Date | null;
    mutedUntil?: Date | null;
    latencyAlertMs?: number | null;
    anomalyDetection?: boolean;
    anomalyMultiplier?: number;
    scheduleEnabled?: boolean;
    scheduleDays?: string;
    scheduleStartHour?: number;
    scheduleEndHour?: number;
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
        retryCount: monitor.retryCount ?? 0,
        config: (monitor.configJson as Record<string, unknown> | null | undefined) ?? {},
        alertChannelIds: [],
        folderId: monitor.folderId,
        enabled: monitor.enabled,
        description: monitor.description ?? null,
        runbookUrl: monitor.runbookUrl ?? null,
        createdAt: monitor.createdAt.toISOString(),
        slaTarget: monitor.slaTarget ?? null,
        slaPeriodDays: monitor.slaPeriodDays ?? null,
        slaBreachAlertedAt: monitor.slaBreachAlertedAt ? monitor.slaBreachAlertedAt.toISOString() : null,
        autoIncident: monitor.autoIncident,
        autoIncidentSeverity: monitor.autoIncidentSeverity,
        activeAutoIncidentId: monitor.activeAutoIncidentId,
        isFlapping: monitor.isFlapping ?? false,
        flapDetectionEnabled: monitor.flapDetectionEnabled ?? true,
        flapWindow: monitor.flapWindow ?? 10,
        flapThreshold: monitor.flapThreshold ?? 0.5,
        flapAlertedAt: monitor.flapAlertedAt ? monitor.flapAlertedAt.toISOString() : null,
        mutedUntil: (monitor as typeof monitor & { mutedUntil?: Date | null }).mutedUntil
          ? (monitor as typeof monitor & { mutedUntil?: Date | null }).mutedUntil!.toISOString()
          : null,
        latencyAlertMs: (monitor as typeof monitor & { latencyAlertMs?: number | null }).latencyAlertMs ?? null,
        anomalyDetection: (monitor as typeof monitor & { anomalyDetection?: boolean }).anomalyDetection ?? false,
        anomalyMultiplier: (monitor as typeof monitor & { anomalyMultiplier?: number }).anomalyMultiplier ?? 2.0,
        sliLatencyTarget: (monitor as typeof monitor & { sliLatencyTarget?: number | null }).sliLatencyTarget ?? null,
        sliLatencyWindow: (monitor as typeof monitor & { sliLatencyWindow?: number }).sliLatencyWindow ?? 7,
        scheduleEnabled: monitor.scheduleEnabled ?? false,
        scheduleDays: monitor.scheduleDays ?? '1,2,3,4,5',
        scheduleStartHour: monitor.scheduleStartHour ?? 8,
        scheduleEndHour: monitor.scheduleEndHour ?? 18,
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
    if (this.draining) return;
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
   * Every 30 minutes: check SLA error budget burn rates using the multi-window model.
   *
   * Fires when BOTH of these conditions are true simultaneously (reduces false positives):
   *   - 1h burn rate  >= threshold (fast window: detects sudden spikes)
   *   - 6h burn rate  >= threshold / 5 (slow window: confirms sustained degradation)
   *
   * Three severity tiers aligned with Google SRE thresholds:
   *   - Critical (page now):   1h >= 14.4×  AND  6h >= 2.88× (burns 50% budget in 1h)
   *   - High     (page soon):  1h >= 6×     AND  6h >= 1.2×  (burns 50% budget in 6h)
   *   - Warning  (ticket):     1h >= 3×     AND  6h >= 0.6×  (burns 50% budget in 1d)
   *
   * At most one alert per monitor per 6 hours (prevents duplicate paging).
   */
  @Cron('*/30 * * * *')
  async checkBurnRateAlerts() {
    if (this.draining) return;
    const monitors = await this.prisma.monitor.findMany({
      where: { enabled: true, slaTarget: { not: null } },
      select: {
        id: true, name: true, userId: true,
        slaTarget: true, slaPeriodDays: true,
        slaBurnRateAlertedAt: true,
      },
    });

    for (const monitor of monitors) {
      if (monitor.slaTarget === null) continue;

      // Throttle: at most one burn-rate alert per 6 hours
      const now = new Date();
      const hoursSinceLast = monitor.slaBurnRateAlertedAt
        ? (now.getTime() - monitor.slaBurnRateAlertedAt.getTime()) / 3_600_000
        : Infinity;
      if (hoursSinceLast < 6) continue;

      const periodDays = monitor.slaPeriodDays ?? 30;
      const slaTarget = monitor.slaTarget;
      const errorBudgetPct = 100 - slaTarget; // e.g. 0.1 for 99.9%
      if (errorBudgetPct <= 0) continue;

      // Load windowed runs in parallel
      const now1h  = new Date(now.getTime() - 1 * 60 * 60 * 1000);
      const now6h  = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      const nowFull = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

      const [runs1h, runs6h, runsFull] = await Promise.all([
        this.prisma.monitorRun.findMany({
          where: { monitorId: monitor.id, checkedAt: { gte: now1h } },
          select: { ok: true },
        }),
        this.prisma.monitorRun.findMany({
          where: { monitorId: monitor.id, checkedAt: { gte: now6h } },
          select: { ok: true },
        }),
        this.prisma.monitorRun.findMany({
          where: { monitorId: monitor.id, checkedAt: { gte: nowFull } },
          select: { ok: true },
        }),
      ]);

      // Not enough data to compute meaningful burn rates
      if (runs1h.length < 2 || runsFull.length < 10) continue;

      const errorRateFull = runsFull.filter((r) => !r.ok).length / runsFull.length;
      const budgetConsumedPct = Math.min(100, (errorRateFull / (errorBudgetPct / 100)) * 100);

      const calcRate = (runs: { ok: boolean }[], windowHours: number): number => {
        if (runs.length === 0) return 0;
        const errRate = runs.filter((r) => !r.ok).length / runs.length;
        const sustainableErrRate = errorBudgetPct / 100;
        const sustainableErrPerHour = sustainableErrRate / (periodDays * 24);
        const actualErrPerHour = errRate / windowHours;
        if (sustainableErrPerHour <= 0) return 0;
        return actualErrPerHour / sustainableErrPerHour;
      };

      const burnRate1h = calcRate(runs1h, 1);
      const burnRate6h = runs6h.length >= 2 ? calcRate(runs6h, 6) : 0;

      // Determine if any severity tier triggers (both windows must fire)
      let triggered = false;
      if (burnRate1h >= 14.4 && burnRate6h >= 2.88) triggered = true;
      else if (burnRate1h >= 6    && burnRate6h >= 1.2)  triggered = true;
      else if (burnRate1h >= 3    && burnRate6h >= 0.6)  triggered = true;

      if (!triggered) continue;

      try {
        await this.alertsService.notifyBurnRateAlert(
          monitor.id,
          monitor.name,
          monitor.userId,
          burnRate1h,
          burnRate6h,
          budgetConsumedPct,
          slaTarget,
        );
      } catch (err) {
        this.logger.error(`Burn-rate alert failed for monitor ${monitor.id}`, err instanceof Error ? err.message : String(err));
      }

      await this.prisma.monitor.update({
        where: { id: monitor.id },
        data: { slaBurnRateAlertedAt: now },
      });

      this.logger.log(JSON.stringify({
        event: 'sla.burn_rate_alert',
        monitorId: monitor.id,
        monitorName: monitor.name,
        burnRate1h: Math.round(burnRate1h * 10) / 10,
        burnRate6h: Math.round(burnRate6h * 10) / 10,
        budgetConsumedPct: Math.round(budgetConsumedPct * 10) / 10,
        slaTarget,
      }));
    }
  }

  /**
   * Every minute: flush expired alert groups whose window has passed.
   * Sends grouped summary alerts for any pending groups with >=2 monitors.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async flushExpiredAlertGroups() {
    try {
      await this.alertsService.flushExpiredAlertGroups();
    } catch (err) {
      this.logger.error('Failed to flush expired alert groups', err instanceof Error ? err.message : String(err));
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
