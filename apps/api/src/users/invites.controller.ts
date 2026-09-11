import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import { AuthGuard } from '../common/auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateInviteDto } from './invites.dto';
import { MailerService } from '../common/mailer.service';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Controller('v1/admin/invites')
export class InvitesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
  ) {}

  @Roles('admin')
  @Get()
  @ApiOperation({ summary: 'List invites', description: 'Admin only. Returns the last 100 invite tokens.' })
  @ApiResponse({ status: 200, description: 'Invite list returned.' })
  async list() {
    const invites = await this.prisma.inviteToken.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt.toISOString(),
      acceptedAt: i.acceptedAt ? i.acceptedAt.toISOString() : null,
      createdAt: i.createdAt.toISOString(),
      token: i.token,
    }));
  }

  @Roles('admin')
  @Post()
  @ApiOperation({ summary: 'Create invite', description: 'Admin only. Generate a new invite token and optionally send an invite email.' })
  @ApiResponse({ status: 201, description: 'Invite created. Returns inviteUrl in development mode.' })
  async create(@Req() req: { user: { id: string } }, @Body() body: CreateInviteDto) {
    const token = randomBytes(24).toString('hex');
    const expiresInHours = Math.max(1, Math.min(168, Number(body.expiresInHours ?? 48)));
    const invite = await this.prisma.inviteToken.create({
      data: {
        token,
        email: body.email.toLowerCase(),
        role: body.role ?? 'user',
        invitedById: req.user.id,
        expiresAt: new Date(Date.now() + expiresInHours * 3600 * 1000),
      },
    });

    const appBase = process.env.APP_BASE_URL ?? 'http://localhost:3000';
    const inviteUrl = `${appBase}/login?invite=${invite.token}`;
    const mail = await this.mailer.sendInviteEmail(invite.email, inviteUrl);
    await this.audit.log('admin.invite.create', req.user.id, null, { email: invite.email, role: invite.role, expiresInHours, mailSent: mail.sent });
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      inviteUrl: process.env.NODE_ENV === 'development' ? inviteUrl : undefined,
      expiresAt: invite.expiresAt.toISOString(),
      mailSent: mail.sent,
    };
  }

  @Roles('admin')
  @Delete(':id')
  @ApiOperation({ summary: 'Revoke invite', description: 'Admin only. Delete an invite token before it is accepted.' })
  @ApiParam({ name: 'id', description: 'Invite token ID' })
  @ApiResponse({ status: 200, description: 'Invite revoked.' })
  @ApiResponse({ status: 404, description: 'Invite not found.' })
  async revoke(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const invite = await this.prisma.inviteToken.findUnique({ where: { id } });
    if (!invite) throw new NotFoundException('invite not found');

    await this.prisma.inviteToken.delete({ where: { id } });
    await this.audit.log('admin.invite.revoke', req.user.id, null, { inviteId: id, email: invite.email, role: invite.role });
    return { ok: true };
  }
}
