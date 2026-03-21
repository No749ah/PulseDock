import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { OrganizationsService } from './organizations.service'
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  InviteOrgMemberDto,
  UpdateOrgMemberRoleDto,
} from './organizations.dto'

interface AuthRequest extends Request {
  user: { sub: string }
}

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/organizations')
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'List organizations the current user belongs to' })
  @ApiResponse({ status: 200, description: 'List of organizations' })
  getOrganizations(@Request() req: AuthRequest) {
    return this.orgsService.getOrganizations(req.user.sub)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new organization (caller becomes OWNER)' })
  @ApiResponse({ status: 201, description: 'Organization created' })
  @ApiResponse({ status: 409, description: 'Slug already taken' })
  createOrganization(@Request() req: AuthRequest, @Body() dto: CreateOrganizationDto) {
    return this.orgsService.createOrganization(req.user.sub, dto)
  }

  @Get('slug-check')
  @ApiOperation({ summary: 'Check if an organization slug is available' })
  @ApiQuery({ name: 'slug', required: true, description: 'Slug to check' })
  @ApiResponse({ status: 200, description: 'Returns { available: boolean }' })
  async checkSlug(@Query('slug') slug: string) {
    return this.orgsService.checkSlug(slug)
  }

  @Get('invites/accept')
  @ApiOperation({ summary: 'Accept an organization invite by token' })
  @ApiQuery({ name: 'token', required: true, description: 'Invite token from email' })
  @ApiResponse({ status: 200, description: 'Invite accepted, joined organization' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  acceptInvite(@Request() req: AuthRequest, @Query('token') token: string) {
    return this.orgsService.acceptInvite(token, req.user.sub)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization details including members' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiResponse({ status: 200, description: 'Organization with member list' })
  @ApiResponse({ status: 404, description: 'Organization not found or not a member' })
  getOrganization(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.orgsService.getOrganization(id, req.user.sub)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update organization settings (OWNER/ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiResponse({ status: 200, description: 'Organization updated' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  updateOrganization(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.orgsService.updateOrganization(id, req.user.sub, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete organization (OWNER only)' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiResponse({ status: 204, description: 'Organization deleted' })
  @ApiResponse({ status: 403, description: 'Only the owner can delete an organization' })
  deleteOrganization(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.orgsService.deleteOrganization(id, req.user.sub)
  }

  @Post(':id/switch')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Switch active organization (workspace switcher)' })
  @ApiParam({ name: 'id', description: 'Organization ID to activate' })
  @ApiResponse({ status: 204, description: 'Active organization updated' })
  @ApiResponse({ status: 404, description: 'Not a member of this organization' })
  switchOrganization(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.orgsService.switchOrganization(id, req.user.sub)
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List all members of an organization' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiResponse({ status: 200, description: 'List of members with user details' })
  getMembers(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.orgsService.getMembers(id, req.user.sub)
  }

  @Post(':id/members/invite')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite a member to the organization (OWNER/ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiResponse({ status: 201, description: 'Member invited or added directly' })
  @ApiResponse({ status: 400, description: 'User already a member' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  inviteMember(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: InviteOrgMemberDto,
  ) {
    return this.orgsService.inviteMember(id, req.user.sub, dto)
  }

  @Patch(':id/members/:userId')
  @ApiOperation({ summary: "Update a member's role (OWNER only)" })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiParam({ name: 'userId', description: 'Target user ID' })
  @ApiResponse({ status: 200, description: 'Role updated' })
  @ApiResponse({ status: 403, description: 'Only OWNER can change roles' })
  updateMemberRole(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateOrgMemberRoleDto,
  ) {
    return this.orgsService.updateMemberRole(id, targetUserId, req.user.sub, dto)
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from the organization (OWNER/ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Organization ID' })
  @ApiParam({ name: 'userId', description: 'Target user ID to remove' })
  @ApiResponse({ status: 204, description: 'Member removed' })
  @ApiResponse({ status: 403, description: 'Cannot remove the organization owner' })
  removeMember(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.orgsService.removeMember(id, targetUserId, req.user.sub)
  }
}
