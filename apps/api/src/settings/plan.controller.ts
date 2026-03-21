import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../common/auth.guard'
import { PlanService, PlanResource } from './plan.service'

const VALID_RESOURCES: PlanResource[] = ['monitors', 'checks', 'team', 'status-pages', 'alert-channels']

@ApiTags('Plan')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/plan')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Get()
  @ApiOperation({
    summary: 'Get current plan & usage',
    description: 'Returns the user\'s current plan, resource limits, and current usage counts.',
  })
  @ApiResponse({ status: 200, description: 'Plan and usage returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getPlan(@Req() req: { user: { id: string } }) {
    const [plan, usage] = await Promise.all([
      this.planService.getUserPlan(req.user.id),
      this.planService.getUsage(req.user.id),
    ])

    return {
      plan: {
        name: plan.name,
        validUntil: plan.validUntil,
        limits: {
          monitors: plan.maxMonitors,
          checksPerDay: plan.maxChecksPerDay,
          teamMembers: plan.maxTeamMembers,
          statusPages: plan.maxStatusPages,
          alertChannels: plan.maxAlertChannels,
        },
      },
      usage: {
        monitors: usage.monitorCount,
        checksToday: usage.checksToday,
        teamMembers: usage.teamMemberCount,
        statusPages: usage.statusPageCount,
        alertChannels: usage.alertChannelCount,
      },
    }
  }

  @Get('check/:resource')
  @ApiOperation({
    summary: 'Check resource limit',
    description: 'Returns whether the user can create another instance of the given resource.',
  })
  @ApiParam({
    name: 'resource',
    description: 'Resource to check',
    enum: ['monitors', 'checks', 'team', 'status-pages', 'alert-channels'],
  })
  @ApiResponse({ status: 200, description: 'Limit check result.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async checkLimit(
    @Req() req: { user: { id: string } },
    @Param('resource') resource: string,
  ) {
    if (!VALID_RESOURCES.includes(resource as PlanResource)) {
      return { allowed: true, current: 0, limit: -1, plan: 'COMMUNITY' }
    }
    return this.planService.checkLimit(req.user.id, resource as PlanResource)
  }
}
