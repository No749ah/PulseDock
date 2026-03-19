import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../common/prisma.service'
import { UpdateRetentionDto } from './settings.dto'

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async getRetention(userId: string): Promise<{ retentionDays: number }> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } })
    return { retentionDays: settings?.retentionDays ?? 90 }
  }

  async updateRetention(userId: string, dto: UpdateRetentionDto): Promise<{ retentionDays: number; message: string }> {
    await this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, retentionDays: dto.retentionDays },
      update: { retentionDays: dto.retentionDays },
    })
    return { retentionDays: dto.retentionDays, message: 'Retention settings updated' }
  }

  /**
   * Nightly job: prune MonitorRun records older than each user's configured retention period.
   * Runs at 03:15 UTC every night to avoid peak hours.
   */
  @Cron('15 3 * * *')
  async pruneOldRuns(): Promise<void> {
    this.logger.log('Starting nightly MonitorRun retention prune')

    const allSettings = await this.prisma.userSettings.findMany({
      select: { userId: true, retentionDays: true },
    })

    // Default for users with no explicit settings row
    const defaultRetention = 90

    // Collect all user IDs that have monitors
    const allUsersWithMonitors = await this.prisma.monitor.findMany({
      select: { userId: true },
      distinct: ['userId'],
    })

    let totalDeleted = 0

    for (const { userId } of allUsersWithMonitors) {
      const settingsRow = allSettings.find((s) => s.userId === userId)
      const retentionDays = settingsRow?.retentionDays ?? defaultRetention
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

      const result = await this.prisma.monitorRun.deleteMany({
        where: { userId, checkedAt: { lt: cutoff } },
      })

      if (result.count > 0) {
        this.logger.log(`Pruned ${result.count} runs for user ${userId} (retention: ${retentionDays}d, cutoff: ${cutoff.toISOString()})`)
        totalDeleted += result.count
      }
    }

    this.logger.log(`Retention prune complete — ${totalDeleted} total runs deleted`)
  }
}
