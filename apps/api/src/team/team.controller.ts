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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../common/auth.guard'
import { TeamService } from './team.service'
import { InviteMemberDto, UpdateMemberRoleDto } from './team.dto'

@ApiTags('Team')
@Controller('v1/team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  // ── Public invite lookup (no auth required) ───────────────────────────────

  @Get('invite/:token')
  @ApiOperation({ summary: 'Preview invite details by token (public)', description: 'Returns the invite email, role, and inviter name for display on the accept-invite page. No auth required.' })
  @ApiParam({ name: 'token', description: 'Invite token from the invite email link' })
  @ApiResponse({ status: 200, description: 'Invite details (email, role, inviter, expiry).' })
  @ApiResponse({ status: 404, description: 'Invite not found or expired.' })
  getInviteByToken(@Param('token') token: string) {
    return this.teamService.getInviteByToken(token)
  }

  // ── Authenticated endpoints ───────────────────────────────────────────────

  @Post('invite/:token/accept')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Accept a team invite', description: 'Links the authenticated user to the inviting user\'s team with the specified role. Deletes the invite token on success.' })
  @ApiParam({ name: 'token', description: 'Invite token from the invite email link' })
  @ApiResponse({ status: 201, description: 'Invite accepted — TeamMember record created.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 404, description: 'Invite not found or expired.' })
  acceptInvite(@Param('token') token: string, @Req() req: { user: { id: string } }) {
    return this.teamService.acceptInvite(token, req.user.id)
  }

  @Get('members')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List team members', description: 'Returns all accepted team members for the authenticated user with their roles and join dates.' })
  @ApiResponse({ status: 200, description: 'Array of TeamMember objects.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  getMembers(@Req() req: { user: { id: string } }) {
    return this.teamService.getMembers(req.user.id)
  }

  @Get('invites')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List pending team invites', description: 'Returns all pending (not-yet-accepted) invite tokens sent by the authenticated user.' })
  @ApiResponse({ status: 200, description: 'Array of pending TeamInvite objects.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  getInvites(@Req() req: { user: { id: string } }) {
    return this.teamService.getInvites(req.user.id)
  }

  @Post('invite')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Invite a team member', description: 'Sends an invite to an email address with a specified role. If the email matches an existing user, creates a TeamMember directly; otherwise creates a TokenInvite with a 7-day expiry.' })
  @ApiResponse({ status: 201, description: 'Invite sent (or member added if user already exists).' })
  @ApiResponse({ status: 400, description: 'Validation error — email is required and must be valid.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 409, description: 'User is already a team member.' })
  inviteMember(@Req() req: { user: { id: string } }, @Body() dto: InviteMemberDto) {
    return this.teamService.inviteMember(req.user.id, dto)
  }

  @Patch('members/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Update a team member\'s role', description: 'Changes the role of an existing team member. Valid roles: VIEWER, EDITOR, ADMIN.' })
  @ApiParam({ name: 'id', description: 'TeamMember CUID' })
  @ApiResponse({ status: 200, description: 'Updated TeamMember.' })
  @ApiResponse({ status: 400, description: 'Validation error — role must be a valid TeamRole enum value.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied — cannot modify members of another user\'s team.' })
  @ApiResponse({ status: 404, description: 'Team member not found.' })
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
  @ApiOperation({ summary: 'Remove a team member', description: 'Removes a team member from the team. The removed user loses access to shared resources.' })
  @ApiParam({ name: 'id', description: 'TeamMember CUID' })
  @ApiResponse({ status: 200, description: '`{ ok: true }` on success.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  @ApiResponse({ status: 404, description: 'Team member not found.' })
  removeMember(@Req() req: { user: { id: string } }, @Param('id') memberId: string) {
    return this.teamService.removeMember(req.user.id, memberId)
  }

  @Delete('invites/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Cancel a pending team invite', description: 'Deletes a pending invite token, preventing acceptance. Has no effect on already-accepted invites.' })
  @ApiParam({ name: 'id', description: 'TeamInvite CUID' })
  @ApiResponse({ status: 200, description: '`{ ok: true }` on success.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  @ApiResponse({ status: 404, description: 'Invite not found.' })
  cancelInvite(@Req() req: { user: { id: string } }, @Param('id') inviteId: string) {
    return this.teamService.cancelInvite(req.user.id, inviteId)
  }
}
