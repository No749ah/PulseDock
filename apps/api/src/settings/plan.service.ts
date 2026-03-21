import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'

/** Resource types that have plan limits. */
export type PlanResource = 'monitors' | 'checks' | 'team' | 'status-pages' | 'alert-channels'

/** Result of a limit check. */
export interface LimitCheckResult {
  /** Whether creating another resource is allowed. */
  allowed: boolean
  /** Current usage count. */
  current: number
  /** Limit on this plan (-1 = unlimited). */
  limit: number
  /** Plan name (e.g. COMMUNITY, PRO, ENTERPRISE). */
  plan: string
}

/** Current resource usage for a user. */
export interface UsageStats {
  monitorCount: number
  checksToday: number
  teamMemberCount: number
  statusPageCount: number
  alertChannelCount: number
}

/** Seeded plan definitions. */
const SEED_PLANS = [
  {
    name: 'COMMUNITY',
    maxMonitors: -1,
    maxChecksPerDay: -1,
    maxTeamMembers: -1,
    maxStatusPages: -1,
    maxAlertChannels: -1,
    isCustom: false,
  },
  {
    name: 'PRO',
    maxMonitors: 50,
    maxChecksPerDay: 10_000,
    maxTeamMembers: 10,
    maxStatusPages: 20,
    maxAlertChannels: 20,
    isCustom: false,
  },
  {
    name: 'ENTERPRISE',
    maxMonitors: -1,
    maxChecksPerDay: -1,
    maxTeamMembers: -1,
    maxStatusPages: -1,
    maxAlertChannels: -1,
    isCustom: true,
  },
] as const

@Injectable()
export class PlanService implements OnModuleInit {
  private readonly logger = new Logger(PlanService.name)

  constructor(private readonly prisma: PrismaService) {}

  /** Seeds the default plans on module startup if they don't already exist. */
  async onModuleInit(): Promise<void> {
    for (const seed of SEED_PLANS) {
      const exists = await this.prisma.plan.findUnique({ where: { name: seed.name } })
      if (!exists) {
        await this.prisma.plan.create({ data: seed })
        this.logger.log(`Seeded plan: ${seed.name}`)
      }
    }
  }

  /**
   * Returns the user's current plan. Creates a COMMUNITY UserPlan record if none exists.
   *
   * @param userId - The user's ID
   * @returns The user's plan record with plan details
   */
  async getUserPlan(userId: string): Promise<{
    id: string
    name: string
    maxMonitors: number
    maxChecksPerDay: number
    maxTeamMembers: number
    maxStatusPages: number
    maxAlertChannels: number
    validUntil: Date | null
  }> {
    let userPlan = await this.prisma.userPlan.findUnique({
      where: { userId },
      include: { plan: true },
    })

    if (!userPlan) {
      const communityPlan = await this.prisma.plan.findUniqueOrThrow({ where: { name: 'COMMUNITY' } })
      userPlan = await this.prisma.userPlan.create({
        data: { userId, planId: communityPlan.id },
        include: { plan: true },
      })
    }

    const p = userPlan.plan
    return {
      id: p.id,
      name: p.name,
      maxMonitors: userPlan.overrideMaxMonitors ?? p.maxMonitors,
      maxChecksPerDay: userPlan.overrideMaxChecksPerDay ?? p.maxChecksPerDay,
      maxTeamMembers: p.maxTeamMembers,
      maxStatusPages: p.maxStatusPages,
      maxAlertChannels: p.maxAlertChannels,
      validUntil: userPlan.validUntil,
    }
  }

  /**
   * Returns the current resource usage counts for a user.
   *
   * @param userId - The user's ID
   * @returns Usage stats: monitor count, checks today, team members, status pages, alert channels
   */
  async getUsage(userId: string): Promise<UsageStats> {
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const [monitorCount, checksToday, teamMemberCount, statusPageCount, alertChannelCount] =
      await Promise.all([
        this.prisma.monitor.count({ where: { userId } }),
        this.prisma.monitorRun.count({
          where: { monitor: { userId }, checkedAt: { gte: todayStart } },
        }),
        this.prisma.teamMember.count({ where: { userId } }),
        this.prisma.publicStatusPage.count({ where: { userId } }),
        this.prisma.alertChannel.count({ where: { userId } }),
      ])

    return { monitorCount, checksToday, teamMemberCount, statusPageCount, alertChannelCount }
  }

  /**
   * Checks whether the user is allowed to create another instance of a resource.
   *
   * @param userId   - The user's ID
   * @param resource - The resource type to check
   * @returns LimitCheckResult with allowed flag, current count, limit, and plan name
   */
  async checkLimit(userId: string, resource: PlanResource): Promise<LimitCheckResult> {
    const [plan, usage] = await Promise.all([this.getUserPlan(userId), this.getUsage(userId)])

    const mapping: Record<PlanResource, { current: number; limit: number }> = {
      monitors: { current: usage.monitorCount, limit: plan.maxMonitors },
      checks: { current: usage.checksToday, limit: plan.maxChecksPerDay },
      team: { current: usage.teamMemberCount, limit: plan.maxTeamMembers },
      'status-pages': { current: usage.statusPageCount, limit: plan.maxStatusPages },
      'alert-channels': { current: usage.alertChannelCount, limit: plan.maxAlertChannels },
    }

    const { current, limit } = mapping[resource]
    const allowed = limit === -1 || current < limit

    return { allowed, current, limit, plan: plan.name }
  }

  /**
   * Returns true when a resource limit has been reached.
   * A limit of -1 is always unlimited and returns false.
   *
   * @param userId   - The user's ID
   * @param resource - The resource type to check
   * @returns true if the limit is reached; false if allowed or unlimited
   */
  async isLimitReached(userId: string, resource: PlanResource): Promise<boolean> {
    const result = await this.checkLimit(userId, resource)
    return !result.allowed
  }

  /**
   * Returns all plans with the count of users on each plan.
   *
   * @returns Array of plans with userCount
   */
  async listPlans(): Promise<Array<{
    id: string
    name: string
    maxMonitors: number
    maxChecksPerDay: number
    maxTeamMembers: number
    maxStatusPages: number
    maxAlertChannels: number
    isCustom: boolean
    userCount: number
  }>> {
    const plans = await this.prisma.plan.findMany({
      include: { _count: { select: { userPlans: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      maxMonitors: p.maxMonitors,
      maxChecksPerDay: p.maxChecksPerDay,
      maxTeamMembers: p.maxTeamMembers,
      maxStatusPages: p.maxStatusPages,
      maxAlertChannels: p.maxAlertChannels,
      isCustom: p.isCustom,
      userCount: p._count.userPlans,
    }))
  }

  /**
   * Sets a user's plan by planId. Creates or updates the UserPlan record.
   *
   * @param userId - The user's ID
   * @param planId - The new plan's ID
   * @returns Updated UserPlan with plan details
   */
  async setUserPlan(userId: string, planId: string): Promise<{ userId: string; planName: string }> {
    const plan = await this.prisma.plan.findUniqueOrThrow({ where: { id: planId } })
    await this.prisma.userPlan.upsert({
      where: { userId },
      create: { userId, planId },
      update: { planId, updatedAt: new Date() },
    })
    return { userId, planName: plan.name }
  }
}
