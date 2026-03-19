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
      deleteMany: vi.fn(),
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
      prisma.userSettings.findUnique.mockResolvedValue({ userId: 'u1', retentionDays: 30 })
      const result = await service.getRetention('u1')
      expect(result).toEqual({ retentionDays: 30 })
    })

    it('returns default 90 days when no settings row exists', async () => {
      prisma.userSettings.findUnique.mockResolvedValue(null)
      const result = await service.getRetention('u1')
      expect(result).toEqual({ retentionDays: 90 })
    })
  })

  describe('updateRetention()', () => {
    it('upserts settings and returns updated value', async () => {
      prisma.userSettings.upsert.mockResolvedValue({ userId: 'u1', retentionDays: 7 })
      const dto: UpdateRetentionDto = { retentionDays: 7 }
      const result = await service.updateRetention('u1', dto)
      expect(result).toMatchObject({ retentionDays: 7, message: 'Retention settings updated' })
      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        create: { userId: 'u1', retentionDays: 7 },
        update: { retentionDays: 7 },
      })
    })
  })

  describe('pruneOldRuns()', () => {
    it('deletes MonitorRun records older than retentionDays for each user', async () => {
      prisma.userSettings.findMany.mockResolvedValue([{ userId: 'u1', retentionDays: 7 }])
      prisma.monitor.findMany.mockResolvedValue([{ userId: 'u1' }])
      prisma.monitorRun.deleteMany.mockResolvedValue({ count: 42 })

      await service.pruneOldRuns()

      expect(prisma.monitorRun.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) })
      )
    })

    it('uses default 90 days for users with no settings row', async () => {
      prisma.userSettings.findMany.mockResolvedValue([]) // no settings rows
      prisma.monitor.findMany.mockResolvedValue([{ userId: 'u2' }])
      prisma.monitorRun.deleteMany.mockResolvedValue({ count: 0 })

      await service.pruneOldRuns()

      const call = prisma.monitorRun.deleteMany.mock.calls[0][0]
      // cutoff should be approximately 90 days ago
      const cutoff = call.where.checkedAt.lt as Date
      const daysAgo = (Date.now() - cutoff.getTime()) / (1000 * 60 * 60 * 24)
      expect(daysAgo).toBeCloseTo(90, 0)
    })

    it('skips users with no monitors', async () => {
      prisma.userSettings.findMany.mockResolvedValue([{ userId: 'u1', retentionDays: 30 }])
      prisma.monitor.findMany.mockResolvedValue([]) // no monitors
      prisma.monitorRun.deleteMany.mockResolvedValue({ count: 0 })

      await service.pruneOldRuns()

      expect(prisma.monitorRun.deleteMany).not.toHaveBeenCalled()
    })
  })
})
