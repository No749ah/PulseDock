import { Test, TestingModule } from '@nestjs/testing'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { SettingsService } from './settings.service'
import { PrismaService } from '../common/prisma.service'
import { UpdateRetentionDto } from './settings.dto'

function makePrisma() {
  return {
    userSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    monitor: {
      findMany: vi.fn(),
    },
    monitorRun: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    monitorRunRollup: {
      count: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  }
}

describe('SettingsService', () => {
  let service: SettingsService
  let prisma: ReturnType<typeof makePrisma>

  beforeEach(async () => {
    prisma = makePrisma()
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()
    service = module.get<SettingsService>(SettingsService)
  })

  describe('getRetention()', () => {
    it('returns persisted retentionDays when settings row exists', async () => {
      prisma.userSettings.findUnique.mockResolvedValue({ userId: 'u1', retentionDays: 30, rollupEnabled: true })
      const result = await service.getRetention('u1')
      expect(result).toEqual({ retentionDays: 30, rollupEnabled: true })
    })

    it('returns defaults when no settings row exists', async () => {
      prisma.userSettings.findUnique.mockResolvedValue(null)
      const result = await service.getRetention('u1')
      expect(result).toEqual({ retentionDays: 90, rollupEnabled: true })
    })
  })

  describe('updateRetention()', () => {
    it('upserts settings and returns updated value', async () => {
      prisma.userSettings.upsert.mockResolvedValue({ userId: 'u1', retentionDays: 7, rollupEnabled: true })
      const dto: UpdateRetentionDto = { retentionDays: 7 }
      const result = await service.updateRetention('u1', dto)
      expect(result).toMatchObject({ retentionDays: 7, message: 'Retention settings updated' })
      expect(prisma.userSettings.upsert).toHaveBeenCalled()
    })

    it('passes rollupEnabled to upsert when provided', async () => {
      prisma.userSettings.upsert.mockResolvedValue({ userId: 'u1', retentionDays: 30, rollupEnabled: false })
      const dto: UpdateRetentionDto = { retentionDays: 30, rollupEnabled: false }
      const result = await service.updateRetention('u1', dto)
      expect(result).toMatchObject({ rollupEnabled: false })
    })
  })

  describe('getStorageStats()', () => {
    it('returns raw and rollup counts plus oldest/newest dates', async () => {
      const now = new Date()
      prisma.monitorRun.count.mockResolvedValue(500)
      prisma.monitorRunRollup.count.mockResolvedValue(30)
      prisma.monitorRun.findFirst
        .mockResolvedValueOnce({ checkedAt: new Date('2026-01-01') })
        .mockResolvedValueOnce({ checkedAt: now })

      const stats = await service.getStorageStats('u1')
      expect(stats.rawRunsTotal).toBe(500)
      expect(stats.rollupBucketsTotal).toBe(30)
      expect(stats.oldestRawRunAt).toBe('2026-01-01T00:00:00.000Z')
    })

    it('returns nulls when no runs exist', async () => {
      prisma.monitorRun.count.mockResolvedValue(0)
      prisma.monitorRunRollup.count.mockResolvedValue(0)
      prisma.monitorRun.findFirst.mockResolvedValue(null)

      const stats = await service.getStorageStats('u1')
      expect(stats.rawRunsTotal).toBe(0)
      expect(stats.oldestRawRunAt).toBeNull()
      expect(stats.newestRawRunAt).toBeNull()
    })
  })

  describe('pruneOldRuns()', () => {
    it('deletes MonitorRun records older than retentionDays for each user', async () => {
      prisma.userSettings.findMany.mockResolvedValue([
        { userId: 'u1', retentionDays: 7, rollupEnabled: false },
      ])
      prisma.monitor.findMany
        // allUsersWithMonitors query
        .mockResolvedValueOnce([{ userId: 'u1' }])
        // per-monitor rollup query (rollupEnabled=false, skipped)
        .mockResolvedValue([])
      prisma.monitorRun.deleteMany.mockResolvedValue({ count: 42 })

      await service.pruneOldRuns()

      expect(prisma.monitorRun.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }),
      )
    })

    it('uses default 90 days for users with no settings row', async () => {
      prisma.userSettings.findMany.mockResolvedValue([])
      prisma.monitor.findMany
        .mockResolvedValueOnce([{ userId: 'u2' }]) // allUsersWithMonitors
        .mockResolvedValue([]) // per-monitor monitors
      prisma.monitorRun.deleteMany.mockResolvedValue({ count: 0 })

      await service.pruneOldRuns()

      const call = prisma.monitorRun.deleteMany.mock.calls[0][0]
      const cutoff = call.where.checkedAt.lt as Date
      const daysAgo = (Date.now() - cutoff.getTime()) / (1000 * 60 * 60 * 24)
      expect(daysAgo).toBeCloseTo(90, 0)
    })

    it('skips users with no monitors', async () => {
      prisma.userSettings.findMany.mockResolvedValue([{ userId: 'u1', retentionDays: 30, rollupEnabled: true }])
      prisma.monitor.findMany.mockResolvedValue([])
      prisma.monitorRun.deleteMany.mockResolvedValue({ count: 0 })

      await service.pruneOldRuns()

      expect(prisma.monitorRun.deleteMany).not.toHaveBeenCalled()
    })

    it('aggregates runs into daily rollup buckets when rollupEnabled=true', async () => {
      const oldDate = new Date('2026-01-01T10:00:00Z')
      prisma.userSettings.findMany.mockResolvedValue([
        { userId: 'u1', retentionDays: 30, rollupEnabled: true },
      ])
      prisma.monitor.findMany
        .mockResolvedValueOnce([{ userId: 'u1' }]) // allUsersWithMonitors
        .mockResolvedValueOnce([{ id: 'mon-1' }]) // per-user monitors in rollupUserRuns
      prisma.monitorRun.findMany.mockResolvedValue([
        { ok: true, latencyMs: 50, checkedAt: oldDate },
        { ok: true, latencyMs: 80, checkedAt: new Date('2026-01-01T11:00:00Z') },
        { ok: false, latencyMs: null, checkedAt: new Date('2026-01-01T12:00:00Z') },
      ])
      prisma.monitorRunRollup.upsert.mockResolvedValue({})
      prisma.monitorRunRollup.update.mockResolvedValue({})
      prisma.monitorRun.deleteMany.mockResolvedValue({ count: 3 })

      await service.pruneOldRuns()

      expect(prisma.monitorRunRollup.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            monitorId_granularity_bucketAt: expect.objectContaining({ granularity: 'daily' }),
          }),
        }),
      )
    })
  })
})
