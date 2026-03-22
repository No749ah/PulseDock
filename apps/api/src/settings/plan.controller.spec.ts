import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Test } from '@nestjs/testing'
import { PlanController } from './plan.controller'
import { PlanService } from './plan.service'
import { AuthGuard } from '../common/auth.guard'

const communityPlan = {
  name: 'COMMUNITY',
  validUntil: null,
  maxMonitors: 10,
  maxChecksPerDay: 1000,
  maxTeamMembers: 1,
  maxStatusPages: 2,
  maxAlertChannels: 3,
}

const usage = {
  monitorCount: 3,
  checksToday: 120,
  teamMemberCount: 0,
  statusPageCount: 1,
  alertChannelCount: 2,
}

const makePlanService = () => ({
  getUserPlan: vi.fn().mockResolvedValue(communityPlan),
  getUsage: vi.fn().mockResolvedValue(usage),
  checkLimit: vi.fn(),
})

const req = (id = 'user-1') => ({ user: { id } } as never)

describe('PlanController', () => {
  let controller: PlanController
  let svc: ReturnType<typeof makePlanService>

  beforeEach(async () => {
    svc = makePlanService()
    const module = await Test.createTestingModule({
      controllers: [PlanController],
      providers: [{ provide: PlanService, useValue: svc }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile()
    controller = module.get(PlanController)
  })

  describe('getPlan', () => {
    it('returns plan and usage combined', async () => {
      const result = await controller.getPlan(req())
      expect(svc.getUserPlan).toHaveBeenCalledWith('user-1')
      expect(svc.getUsage).toHaveBeenCalledWith('user-1')
      expect(result.plan.name).toBe('COMMUNITY')
      expect(result.plan.limits.monitors).toBe(10)
      expect(result.usage.monitors).toBe(3)
      expect(result.usage.checksToday).toBe(120)
    })

    it('includes all limit fields', async () => {
      const result = await controller.getPlan(req())
      expect(result.plan.limits).toHaveProperty('checksPerDay', 1000)
      expect(result.plan.limits).toHaveProperty('teamMembers', 1)
      expect(result.plan.limits).toHaveProperty('statusPages', 2)
      expect(result.plan.limits).toHaveProperty('alertChannels', 3)
    })

    it('includes all usage fields', async () => {
      const result = await controller.getPlan(req())
      expect(result.usage).toHaveProperty('teamMembers', 0)
      expect(result.usage).toHaveProperty('statusPages', 1)
      expect(result.usage).toHaveProperty('alertChannels', 2)
    })
  })

  describe('checkLimit', () => {
    it('delegates valid resource to plan service', async () => {
      const limitResult = { allowed: true, current: 3, limit: 10, plan: 'COMMUNITY' }
      svc.checkLimit.mockResolvedValue(limitResult)
      const result = await controller.checkLimit(req(), 'monitors')
      expect(svc.checkLimit).toHaveBeenCalledWith('user-1', 'monitors')
      expect(result).toMatchObject({ allowed: true, current: 3 })
    })

    it('returns allowed:true for unknown resource without calling service', async () => {
      const result = await controller.checkLimit(req(), 'invalid-resource')
      expect(svc.checkLimit).not.toHaveBeenCalled()
      expect(result).toMatchObject({ allowed: true, limit: -1 })
    })

    it('handles status-pages resource', async () => {
      const limitResult = { allowed: false, current: 2, limit: 2, plan: 'COMMUNITY' }
      svc.checkLimit.mockResolvedValue(limitResult)
      const result = await controller.checkLimit(req(), 'status-pages')
      expect(svc.checkLimit).toHaveBeenCalledWith('user-1', 'status-pages')
      expect(result).toMatchObject({ allowed: false })
    })

    it('handles alert-channels resource', async () => {
      const limitResult = { allowed: true, current: 1, limit: 3, plan: 'COMMUNITY' }
      svc.checkLimit.mockResolvedValue(limitResult)
      const result = await controller.checkLimit(req(), 'alert-channels')
      expect(result).toMatchObject({ allowed: true })
    })

    it('handles team resource', async () => {
      const limitResult = { allowed: false, current: 1, limit: 1, plan: 'COMMUNITY' }
      svc.checkLimit.mockResolvedValue(limitResult)
      const result = await controller.checkLimit(req(), 'team')
      expect(svc.checkLimit).toHaveBeenCalledWith('user-1', 'team')
      expect(result).toMatchObject({ allowed: false })
    })
  })
})
