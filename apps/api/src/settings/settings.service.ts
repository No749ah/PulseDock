import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../common/prisma.service'
import { UpdateRetentionDto } from './settings.dto'

/** Number of days of raw data to keep before rolling up to daily buckets. */
const RAW_ROLLUP_THRESHOLD_DAYS = 7

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the data-retention settings for a user.
   * Defaults: 90-day retention, rollup enabled (if no settings row exists yet).
   *
   * @param userId - Owner's user ID
   */
  async getRetention(userId: string): Promise<{ retentionDays: number; rollupEnabled: boolean }> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } })
    return {
      retentionDays: settings?.retentionDays ?? 90,
      rollupEnabled: settings?.rollupEnabled ?? true,
    }
  }

  /**
   * Updates (or creates) the data-retention settings for a user.
   *
   * @param userId - Owner's user ID
   * @param dto    - Retention update payload (retentionDays, optional rollupEnabled)
   * @returns Updated settings with a confirmation message
   */
  async updateRetention(
    userId: string,
    dto: UpdateRetentionDto,
  ): Promise<{ retentionDays: number; rollupEnabled: boolean; message: string }> {
    const updateData: { retentionDays: number; rollupEnabled?: boolean } = {
      retentionDays: dto.retentionDays,
    }
    if (dto.rollupEnabled !== undefined) updateData.rollupEnabled = dto.rollupEnabled

    const result = await this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, retentionDays: dto.retentionDays, rollupEnabled: dto.rollupEnabled ?? true },
      update: updateData,
    })
    return {
      retentionDays: result.retentionDays,
      rollupEnabled: result.rollupEnabled,
      message: 'Retention settings updated',
    }
  }

  /**
   * Returns storage usage stats for a user: raw runs count, rollup count, oldest raw run date.
   *
   * @param userId - Authenticated user ID
   * @returns Object with rawRunsTotal, rollupBucketsTotal, oldestRawRunAt, newestRawRunAt
   */
  async getStorageStats(userId: string): Promise<{
    rawRunsTotal: number
    rollupBucketsTotal: number
    oldestRawRunAt: string | null
    newestRawRunAt: string | null
  }> {
    const [rawCount, rollupCount, oldest, newest] = await Promise.all([
      this.prisma.monitorRun.count({ where: { userId } }),
      this.prisma.monitorRunRollup.count({ where: { userId } }),
      this.prisma.monitorRun.findFirst({
        where: { userId },
        orderBy: { checkedAt: 'asc' },
        select: { checkedAt: true },
      }),
      this.prisma.monitorRun.findFirst({
        where: { userId },
        orderBy: { checkedAt: 'desc' },
        select: { checkedAt: true },
      }),
    ])

    return {
      rawRunsTotal: rawCount,
      rollupBucketsTotal: rollupCount,
      oldestRawRunAt: oldest?.checkedAt?.toISOString() ?? null,
      newestRawRunAt: newest?.checkedAt?.toISOString() ?? null,
    }
  }

  /**
   * Nightly job: roll up and prune MonitorRun records.
   * 1. Runs older than RAW_ROLLUP_THRESHOLD_DAYS are aggregated into daily buckets.
   * 2. Runs older than retentionDays are deleted entirely (rollup data kept).
   * Runs at 03:15 UTC every night to avoid peak hours.
   */
  @Cron('15 3 * * *')
  async pruneOldRuns(): Promise<void> {
    this.logger.log('Starting nightly MonitorRun retention prune + rollup')

    const allSettings = await this.prisma.userSettings.findMany({
      select: { userId: true, retentionDays: true, rollupEnabled: true },
    })

    const defaultRetention = 90

    const allUsersWithMonitors = await this.prisma.monitor.findMany({
      select: { userId: true },
      distinct: ['userId'],
    })

    let totalRolledUp = 0
    let totalDeleted = 0

    for (const { userId } of allUsersWithMonitors) {
      const settingsRow = allSettings.find((s) => s.userId === userId)
      const retentionDays = settingsRow?.retentionDays ?? defaultRetention
      const rollupEnabled = settingsRow?.rollupEnabled ?? true

      const rollupCutoff = new Date(Date.now() - RAW_ROLLUP_THRESHOLD_DAYS * 24 * 60 * 60 * 1000)
      const deleteCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

      // Step 1: Roll up raw data older than RAW_ROLLUP_THRESHOLD_DAYS into daily buckets
      if (rollupEnabled) {
        const rolled = await this.rollupUserRuns(userId, rollupCutoff)
        totalRolledUp += rolled
      }

      // Step 2: Delete raw runs older than retention period
      const result = await this.prisma.monitorRun.deleteMany({
        where: { userId, checkedAt: { lt: deleteCutoff } },
      })

      if (result.count > 0) {
        this.logger.log(
          `Pruned ${result.count} raw runs for user ${userId} (retention: ${retentionDays}d)`,
        )
        totalDeleted += result.count
      }
    }

    this.logger.log(
      `Retention cycle complete — rolled up: ${totalRolledUp}, deleted: ${totalDeleted}`,
    )
  }

  /**
   * Aggregate raw MonitorRun records older than cutoff into daily buckets.
   * Uses upsert to merge into existing rollup rows for idempotency.
   * Returns the number of raw runs processed.
   */
  private async rollupUserRuns(userId: string, cutoff: Date): Promise<number> {
    // Fetch monitors for this user
    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      select: { id: true },
    })

    let processed = 0

    for (const { id: monitorId } of monitors) {
      // Load raw runs older than cutoff (not yet rolled up into daily)
      const runs = await this.prisma.monitorRun.findMany({
        where: {
          monitorId,
          userId,
          checkedAt: { lt: cutoff },
        },
        select: { ok: true, latencyMs: true, checkedAt: true },
        orderBy: { checkedAt: 'asc' },
      })

      if (runs.length === 0) continue

      // Group by UTC day bucket (YYYY-MM-DD)
      const dayBuckets = new Map<string, { ok: boolean; latencyMs: number | null }[]>()

      for (const run of runs) {
        const dayKey = run.checkedAt.toISOString().slice(0, 10) // "2026-03-12"
        if (!dayBuckets.has(dayKey)) dayBuckets.set(dayKey, [])
        dayBuckets.get(dayKey)!.push({ ok: run.ok, latencyMs: run.latencyMs })
      }

      // Upsert each daily bucket
      for (const [dayKey, bucketRuns] of dayBuckets.entries()) {
        const bucketAt = new Date(`${dayKey}T00:00:00.000Z`)
        const totalChecks = bucketRuns.length
        const okChecks = bucketRuns.filter((r) => r.ok).length
        const latencies = bucketRuns
          .filter((r) => r.latencyMs !== null)
          .map((r) => r.latencyMs as number)
          .sort((a, b) => a - b)

        const avgLatencyMs =
          latencies.length > 0
            ? Math.round(latencies.reduce((sum, v) => sum + v, 0) / latencies.length)
            : null
        const p95LatencyMs =
          latencies.length > 0
            ? latencies[Math.floor(latencies.length * 0.95)] ?? latencies[latencies.length - 1]
            : null
        const maxLatencyMs = latencies.length > 0 ? latencies[latencies.length - 1] : null
        const minLatencyMs = latencies.length > 0 ? latencies[0] : null

        await this.prisma.monitorRunRollup.upsert({
          where: { monitorId_granularity_bucketAt: { monitorId, granularity: 'daily', bucketAt } },
          create: {
            monitorId,
            userId,
            granularity: 'daily',
            bucketAt,
            totalChecks,
            okChecks,
            avgLatencyMs,
            p95LatencyMs,
            maxLatencyMs,
            minLatencyMs,
          },
          update: {
            // Merge with existing bucket data if partial rollup was done before
            totalChecks: { increment: 0 }, // handled below via raw update
          },
        })

        // For idempotency, re-compute the bucket from scratch if it already existed
        // (simpler than differential merge: just recalculate from remaining raw data)
        await this.prisma.monitorRunRollup.update({
          where: { monitorId_granularity_bucketAt: { monitorId, granularity: 'daily', bucketAt } },
          data: {
            totalChecks,
            okChecks,
            avgLatencyMs,
            p95LatencyMs,
            maxLatencyMs,
            minLatencyMs,
          },
        })
      }

      processed += runs.length
    }

    if (processed > 0) {
      this.logger.log(`Rolled up ${processed} raw runs for user ${userId} into daily buckets`)
    }

    return processed
  }
}
