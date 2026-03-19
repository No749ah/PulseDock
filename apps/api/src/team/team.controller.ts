import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../common/auth.guard'
import { TeamService } from './team.service'
import { InviteMemberDto, UpdateMemberRoleDto } from './team.dto'

@ApiTags('Team')
@Controller('v1/team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  // ── Public invite lookup (no auth required) ───────────────────────────────

  @Get('invite/:token')
  @ApiOperation({ summary: 'Preview invite details by token (public)' })
  getInviteByToken(@Param('token') token: string) {
    return this.teamService.getInviteByToken(token)
  }

  // ── Authenticated endpoints ───────────────────────────────────────────────

  @Post('invite/:token/accept')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Accept a team invite (requires auth)' })
  acceptInvite(@Param('token') token: string, @Req() req: { user: { id: string } }) {
    return this.teamService.acceptInvite(token, req.user.id)
  }

  @Get('members')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get team members' })
  getMembers(@Req() req: { user: { id: string } }) {
    return this.teamService.getMembers(req.user.id)
  }

  @Get('invites')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get pending team invites' })
  getInvites(@Req() req: { user: { id: string } }) {
    return this.teamService.getInvites(req.user.id)
  }

  @Post('invite')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Invite a team member' })
  inviteMember(@Req() req: { user: { id: string } }, @Body() dto: InviteMemberDto) {
    return this.teamService.inviteMember(req.user.id, dto)
  }

  @Patch('members/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Update a team member role' })
  updateMemberRole(
    @Req() req: { user: { id: string } },
    @Param('id') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.teamService.updateMemberRole(req.user.id, memberId, dto)
  }

  @Delete('members/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Remove a team member' })
  removeMember(@Req() req: { user: { id: string } }, @Param('id') memberId: string) {
    return this.teamService.removeMember(req.user.id, memberId)
  }

  @Delete('invites/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Cancel a pending team invite' })
  cancelInvite(@Req() req: { user: { id: string } }, @Param('id') inviteId: string) {
    return this.teamService.cancelInvite(req.user.id, inviteId)
  }
}
