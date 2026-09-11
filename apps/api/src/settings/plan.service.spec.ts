import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PlanService } from './plan.service'

function makePrisma() {
  return {
    plan: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    userPlan: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    monitor: { count: vi.fn() },
    monitorRun: { count: vi.fn() },
    teamMember: { count: vi.fn() },
    publicStatusPage: { count: vi.fn() },
    alertChannel: { count: vi.fn() },
  }
}

const communityPlan = {
  id: 'plan-community',
  name: 'COMMUNITY',
  maxMonitors: -1,
  maxChecksPerDay: -1,
  maxTeamMembers: -1,
  maxStatusPages: -1,
  maxAlertChannels: -1,
  isCustom: false,
  createdAt: new Date(),
}

const proPlan = {
  id: 'plan-pro',
  name: 'PRO',
  maxMonitors: 50,
  maxChecksPerDay: 10_000,
  maxTeamMembers: 10,
  maxStatusPages: 20,
  maxAlertChannels: 20,
  isCustom: false,
  createdAt: new Date(),
}

describe('PlanService', () => {
  let service: PlanService
  let prisma: ReturnType<typeof makePrisma>

  beforeEach(() => {
    prisma = makePrisma()
    service = new PlanService(prisma as never)
  })

  describe('getUserPlan', () => {
    it('returns existing user plan when one is found', async () => {
      prisma.userPlan.findUnique.mockResolvedValue({
        overrideMaxMonitors: null,
        overrideMaxChecksPerDay: null,
        validUntil: null,
        plan: communityPlan,
      })

      const result = await service.getUserPlan('user-1')
      expect(result.name).toBe('COMMUNITY')
      expect(result.maxMonitors).toBe(-1)
      expect(prisma.userPlan.create).not.toHaveBeenCalled()
    })

    it('creates a COMMUNITY UserPlan when none exists', async () => {
      prisma.userPlan.findUnique.mockResolvedValue(null)
      prisma.plan.findUniqueOrThrow.mockResolvedValue(communityPlan)
      prisma.userPlan.create.mockResolvedValue({
        overrideMaxMonitors: null,
        overrideMaxChecksPerDay: null,
        validUntil: null,
        plan: communityPlan,
      })

      const result = await service.getUserPlan('user-new')
      expect(prisma.userPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-new' }) }),
      )
      expect(result.name).toBe('COMMUNITY')
    })

    it('applies override limits over plan defaults', async () => {
      prisma.userPlan.findUnique.mockResolvedValue({
        overrideMaxMonitors: 5,
        overrideMaxChecksPerDay: null,
        validUntil: null,
        plan: communityPlan,
      })

      const result = await service.getUserPlan('user-1')
      expect(result.maxMonitors).toBe(5) // override wins
      expect(result.maxChecksPerDay).toBe(-1) // plan default
    })
  })

  describe('getUsage', () => {
    it('returns correct usage counts from prisma', async () => {
      prisma.userPlan.findUnique.mockResolvedValue(null) // not needed for getUsage
      prisma.monitor.count.mockResolvedValue(12)
      prisma.monitorRun.count.mockResolvedValue(340)
      prisma.teamMember.count.mockResolvedValue(3)
      prisma.publicStatusPage.count.mockResolvedValue(2)
      prisma.alertChannel.count.mockResolvedValue(5)

      const result = await service.getUsage('user-1')
      expect(result).toEqual({
        monitorCount: 12,
        checksToday: 340,
        teamMemberCount: 3,
        statusPageCount: 2,
        alertChannelCount: 5,
      })
    })
  })

  describe('checkLimit', () => {
    beforeEach(() => {
      prisma.monitor.count.mockResolvedValue(0)
      prisma.monitorRun.count.mockResolvedValue(0)
      prisma.teamMember.count.mockResolvedValue(0)
      prisma.publicStatusPage.count.mockResolvedValue(0)
      prisma.alertChannel.count.mockResolvedValue(0)
    })

    it('returns allowed=true when limit is -1 (unlimited)', async () => {
      prisma.userPlan.findUnique.mockResolvedValue({
        overrideMaxMonitors: null,
        overrideMaxChecksPerDay: null,
        validUntil: null,
        plan: communityPlan,
      })
      prisma.monitor.count.mockResolvedValue(9999)

      const result = await service.checkLimit('user-1', 'monitors')
      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(-1)
      expect(result.plan).toBe('COMMUNITY')
    })

    it('returns allowed=false when at limit', async () => {
      prisma.userPlan.findUnique.mockResolvedValue({
        overrideMaxMonitors: null,
        overrideMaxChecksPerDay: null,
        validUntil: null,
        plan: proPlan,
      })
      prisma.monitor.count.mockResolvedValue(50)

      const result = await service.checkLimit('user-1', 'monitors')
      expect(result.allowed).toBe(false)
      expect(result.current).toBe(50)
      expect(result.limit).toBe(50)
    })

    it('returns allowed=true when below limit', async () => {
      prisma.userPlan.findUnique.mockResolvedValue({
        overrideMaxMonitors: null,
        overrideMaxChecksPerDay: null,
        validUntil: null,
        plan: proPlan,
      })
      prisma.monitor.count.mockResolvedValue(10)

      const result = await service.checkLimit('user-1', 'monitors')
      expect(result.allowed).toBe(true)
    })
  })

  describe('onModuleInit', () => {
    it('seeds default plans when they do not exist', async () => {
      prisma.plan.findUnique.mockResolvedValue(null)
      prisma.plan.create.mockResolvedValue({})
      await service.onModuleInit()
      // 3 plans: COMMUNITY, PRO, ENTERPRISE
      expect(prisma.plan.findUnique).toHaveBeenCalledTimes(3)
      expect(prisma.plan.create).toHaveBeenCalledTimes(3)
    })

    it('skips seeding when plans already exist', async () => {
      prisma.plan.findUnique.mockResolvedValue({ id: 'existing' })
      await service.onModuleInit()
      expect(prisma.plan.findUnique).toHaveBeenCalledTimes(3)
      expect(prisma.plan.create).not.toHaveBeenCalled()
    })
  })

  describe('listPlans', () => {
    it('returns all plans with user counts', async () => {
      prisma.plan.findMany.mockResolvedValue([
        { ...communityPlan, _count: { userPlans: 10 } },
        { ...proPlan, _count: { userPlans: 5 } },
      ])
      const result = await service.listPlans()
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('COMMUNITY')
      expect(result[0].userCount).toBe(10)
      expect(result[1].name).toBe('PRO')
      expect(result[1].userCount).toBe(5)
    })
  })

  describe('setUserPlan', () => {
    it('upserts user plan and returns userId + planName', async () => {
      prisma.plan.findUniqueOrThrow.mockResolvedValue(proPlan)
      prisma.userPlan.upsert.mockResolvedValue({})
      const result = await service.setUserPlan('user-1', 'plan-pro')
      expect(prisma.plan.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'plan-pro' } })
      expect(prisma.userPlan.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          create: expect.objectContaining({ userId: 'user-1', planId: 'plan-pro' }),
          update: expect.objectContaining({ planId: 'plan-pro' }),
        }),
      )
      expect(result).toEqual({ userId: 'user-1', planName: 'PRO' })
    })
  })

  describe('checkLimit — all resource types', () => {
    beforeEach(() => {
      prisma.userPlan.findUnique.mockResolvedValue({
        overrideMaxMonitors: null,
        overrideMaxChecksPerDay: null,
        validUntil: null,
        plan: proPlan,
      })
      prisma.monitor.count.mockResolvedValue(0)
      prisma.monitorRun.count.mockResolvedValue(0)
      prisma.teamMember.count.mockResolvedValue(0)
      prisma.publicStatusPage.count.mockResolvedValue(0)
      prisma.alertChannel.count.mockResolvedValue(0)
    })

    it('checks "checks" resource correctly', async () => {
      prisma.monitorRun.count.mockResolvedValue(9999)
      const result = await service.checkLimit('user-1', 'checks')
      expect(result.current).toBe(9999)
      expect(result.limit).toBe(10_000)
      expect(result.allowed).toBe(true)
    })

    it('checks "team" resource correctly', async () => {
      prisma.teamMember.count.mockResolvedValue(10)
      const result = await service.checkLimit('user-1', 'team')
      expect(result.current).toBe(10)
      expect(result.limit).toBe(10)
      expect(result.allowed).toBe(false)
    })

    it('checks "status-pages" resource correctly', async () => {
      prisma.publicStatusPage.count.mockResolvedValue(5)
      const result = await service.checkLimit('user-1', 'status-pages')
      expect(result.current).toBe(5)
      expect(result.limit).toBe(20)
      expect(result.allowed).toBe(true)
    })

    it('checks "alert-channels" resource correctly', async () => {
      prisma.alertChannel.count.mockResolvedValue(20)
      const result = await service.checkLimit('user-1', 'alert-channels')
      expect(result.current).toBe(20)
      expect(result.limit).toBe(20)
      expect(result.allowed).toBe(false)
    })
  })

  describe('isLimitReached', () => {
    it('returns false for unlimited plan', async () => {
      prisma.userPlan.findUnique.mockResolvedValue({
        overrideMaxMonitors: null,
        overrideMaxChecksPerDay: null,
        validUntil: null,
        plan: communityPlan,
      })
      prisma.monitor.count.mockResolvedValue(500)
      prisma.monitorRun.count.mockResolvedValue(0)
      prisma.teamMember.count.mockResolvedValue(0)
      prisma.publicStatusPage.count.mockResolvedValue(0)
      prisma.alertChannel.count.mockResolvedValue(0)

      const reached = await service.isLimitReached('user-1', 'monitors')
      expect(reached).toBe(false)
    })

    it('returns true when limit is exceeded on PRO plan', async () => {
      prisma.userPlan.findUnique.mockResolvedValue({
        overrideMaxMonitors: null,
        overrideMaxChecksPerDay: null,
        validUntil: null,
        plan: proPlan,
      })
      prisma.monitor.count.mockResolvedValue(51)
      prisma.monitorRun.count.mockResolvedValue(0)
      prisma.teamMember.count.mockResolvedValue(0)
      prisma.publicStatusPage.count.mockResolvedValue(0)
      prisma.alertChannel.count.mockResolvedValue(0)

      const reached = await service.isLimitReached('user-1', 'monitors')
      expect(reached).toBe(true)
    })
  })
})
