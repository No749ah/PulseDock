import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../common/auth.guard'
import { TeamService } from './team.service'
import { InviteMemberDto } from './team.dto'

@ApiTags('Team')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get('members')
  @ApiOperation({ summary: 'Get team members' })
  getMembers(@Req() req: { user: { id: string } }) {
    return this.teamService.getMembers(req.user.id)
  }

  @Post('invite')
  @ApiOperation({ summary: 'Invite a team member' })
  inviteMember(@Req() req: { user: { id: string } }, @Body() dto: InviteMemberDto) {
    return this.teamService.inviteMember(req.user.id, dto)
  }

  @Delete('members/:memberId')
  @ApiOperation({ summary: 'Remove a team member' })
  removeMember(@Req() req: { user: { id: string } }, @Param('memberId') memberId: string) {
    return this.teamService.removeMember(req.user.id, memberId)
  }
}
