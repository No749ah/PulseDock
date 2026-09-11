import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma.service';
import { AuthGuard } from '../common/auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { AuditService } from '../common/audit.service';
import { PlanService } from '../settings/plan.service';
import { SetRoleDto, SetStatusDto, UpdateUserDto } from './admin.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planService: PlanService,
  ) {}

  @Roles('admin')
  @Get('users')
  @ApiOperation({ summary: 'List all users', description: 'Admin only. Returns all registered users.' })
  @ApiResponse({ status: 200, description: 'User list returned.' })
  @ApiResponse({ status: 403, description: 'Admin role required.' })
  async users() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName ?? null,
      role: u.role,
      isActive: u.isActive,
      totpEnabled: u.totpEnabled ?? false,
      emailVerified: u.emailVerified ?? false,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt?.toISOString() ?? null,
    }));
  }

  @Roles('admin')
  @Post('users/:id/reset-mfa')
  @ApiOperation({ summary: 'Reset user MFA', description: 'Admin only. Disables TOTP 2FA for a user and clears all recovery codes.' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'MFA reset.' })
  async resetMfa(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    if (id === req.user.id) throw new ForbiddenException('Cannot reset your own MFA via admin panel — use Account Settings');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('user not found');
    if (!user.totpEnabled) throw new BadRequestException('MFA is not enabled for this user');
    await this.prisma.user.update({
      where: { id },
      data: { totpEnabled: false, totpSecret: null, totpRecoveryCodes: null },
    });
    // Revoke all sessions so the user must re-authenticate
    await this.prisma.session.deleteMany({ where: { userId: id } });
    await this.audit.log('admin.user.reset_mfa', req.user.id, id, { email: user.email });
    return { ok: true };
  }

  @Roles('admin')
  @Post('users/:id/force-password-reset')
  @ApiOperation({ summary: 'Force password reset', description: 'Admin only. Revokes all sessions and generates a password reset token for the user.' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Password reset token created and all sessions revoked.' })
  async forcePasswordReset(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('user not found');
    // Revoke all active sessions
    await this.prisma.session.deleteMany({ where: { userId: id } });
    // Generate reset token
    const { randomBytes } = await import('crypto');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    await this.prisma.passwordResetToken.create({
      data: { email: user.email, token, expiresAt },
    });
    await this.audit.log('admin.user.force_password_reset', req.user.id, id, { email: user.email });
    const appBase = process.env.APP_BASE_URL ?? 'http://localhost:3000';
    return { ok: true, resetUrl: `${appBase}/login?reset=${token}`, expiresAt: expiresAt.toISOString() };
  }

  @Roles('admin')
  @Delete('users/:id')
  @ApiOperation({ summary: 'Delete user', description: 'Admin only. Permanently deletes a user account and all associated data.' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User deleted.' })
  async deleteUser(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    if (id === req.user.id) throw new ForbiddenException('Cannot delete your own account via admin panel');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('user not found');
    // Audit BEFORE delete — AuditLog.targetUserId has a FK to User,
    // so logging after deletion triggers a P2003 constraint violation.
    await this.audit.log('admin.user.delete', req.user.id, null, { targetUserId: id, email: user.email });
    // Cascade: sessions, monitors, alerts, invites etc. handled by Prisma relations
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }

  @Roles('admin')
  @Patch('users/role')
  @ApiOperation({ summary: 'Set user role', description: 'Admin only. Assign admin or user role to a user.' })
  @ApiResponse({ status: 200, description: 'Role updated.' })
  async setRole(@Req() req: { user: { id: string } }, @Body() body: SetRoleDto) {
    const user = await this.prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw new NotFoundException('user not found');
    await this.prisma.user.update({ where: { id: body.userId }, data: { role: body.role } });
    await this.audit.log('admin.user.set_role', req.user.id, body.userId, { role: body.role });
    return { ok: true };
  }

  @Roles('admin')
  @Patch('users/update')
  @ApiOperation({ summary: 'Update user', description: 'Admin only. Update email, role, or active status of any user.' })
  @ApiResponse({ status: 200, description: 'User updated.' })
  async updateUser(@Req() req: { user: { id: string } }, @Body() body: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw new NotFoundException('user not found');

    const updated = await this.prisma.user.update({
      where: { id: body.userId },
      data: {
        email: body.email?.toLowerCase() ?? user.email,
        displayName: body.displayName !== undefined ? (body.displayName.trim() || null) : user.displayName,
        role: body.role ?? user.role,
        isActive: body.isActive ?? user.isActive,
        mustChangePassword: body.mustChangePassword ?? user.mustChangePassword,
      },
    });

    if (body.isActive === false) await this.prisma.session.deleteMany({ where: { userId: body.userId } });
    await this.audit.log('admin.user.update', req.user.id, body.userId, { email: body.email, role: body.role, isActive: body.isActive, mustChangePassword: body.mustChangePassword });

    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName ?? null,
      role: updated.role,
      isActive: updated.isActive,
      totpEnabled: updated.totpEnabled ?? false,
      emailVerified: updated.emailVerified ?? false,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt?.toISOString() ?? null,
    };
  }

  @Roles('admin')
  @Patch('users/status')
  @ApiOperation({ summary: 'Set user active status', description: 'Admin only. Enable or disable a user account. Disabling revokes all sessions.' })
  @ApiResponse({ status: 200, description: 'Status updated.' })
  async setStatus(@Req() req: { user: { id: string } }, @Body() body: SetStatusDto) {
    const user = await this.prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw new NotFoundException('user not found');
    await this.prisma.user.update({ where: { id: body.userId }, data: { isActive: body.isActive } });
    if (!body.isActive) await this.prisma.session.deleteMany({ where: { userId: body.userId } });
    await this.audit.log('admin.user.set_status', req.user.id, body.userId, { isActive: body.isActive });
    return { ok: true };
  }

  @Roles('admin')
  @Get('audit-logs')
  @ApiOperation({ summary: 'Audit logs', description: 'Admin only. Returns the last 200 audit log entries.' })
  @ApiResponse({ status: 200, description: 'Audit logs returned.' })
  async auditLogs() {
    const logs = await this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    return logs.map((l) => ({
      id: l.id,
      action: l.action,
      actorUserId: l.actorUserId,
      targetUserId: l.targetUserId,
      meta: l.metaJson ?? {},
      createdAt: l.createdAt.toISOString(),
    }));
  }

  @Roles('admin')
  @Get('password-resets')
  @ApiOperation({ summary: 'Pending password resets', description: 'Admin only. Returns all active (unconsumed, unexpired) password reset tokens.' })
  @ApiResponse({ status: 200, description: 'Password reset tokens returned.' })
  async passwordResets() {
    const rows = await this.prisma.passwordResetToken.findMany({
      where: { consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const appBase = process.env.APP_BASE_URL ?? 'http://localhost:3000';
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      resetUrl: `${appBase}/login?reset=${r.token}`,
    }));
  }

  @Roles('admin')
  @Delete('password-resets/:id')
  @ApiOperation({ summary: 'Revoke password reset token', description: 'Admin only. Invalidate a specific password reset token.' })
  @ApiParam({ name: 'id', description: 'Password reset token ID' })
  @ApiResponse({ status: 200, description: 'Token revoked.' })
  async revokePasswordReset(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const existing = await this.prisma.passwordResetToken.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('password reset token not found');
    await this.prisma.passwordResetToken.update({ where: { id }, data: { consumedAt: new Date() } });
    await this.audit.log('admin.password_reset.revoke', req.user.id, null, { passwordResetId: id, email: existing.email });
    return { ok: true };
  }

  @Roles('admin')
  @Get('stats')
  @ApiOperation({ summary: 'System statistics', description: 'Admin only. Returns aggregate counts for monitors, users, checks, and error rate.' })
  @ApiResponse({ status: 200, description: 'System stats returned.' })
  async systemStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalUsers,
      activeUsers,
      totalMonitors,
      enabledMonitors,
      checksToday,
      failedToday,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.monitor.count(),
      this.prisma.monitor.count({ where: { enabled: true } }),
      // Exclude version monitors (GIT_RELEASE, DOCKER_IMAGE) — being outdated is not an uptime failure
      this.prisma.monitorRun.count({
        where: {
          checkedAt: { gte: todayStart },
          monitor: { type: { notIn: ['GIT_RELEASE', 'DOCKER_IMAGE'] } },
        },
      }),
      this.prisma.monitorRun.count({
        where: {
          checkedAt: { gte: todayStart },
          ok: false,
          monitor: { type: { notIn: ['GIT_RELEASE', 'DOCKER_IMAGE'] } },
        },
      }),
    ]);

    const errorRatePct = checksToday > 0 ? Math.round((failedToday / checksToday) * 1000) / 10 : 0;

    return {
      users: { total: totalUsers, active: activeUsers },
      monitors: { total: totalMonitors, enabled: enabledMonitors },
      checksToday,
      failedToday,
      errorRatePct,
      generatedAt: now.toISOString(),
    };
  }

  @Roles('admin')
  @Get('plans')
  @ApiOperation({ summary: 'List all plans', description: 'Admin only. Returns all billing/license plans with user counts.' })
  @ApiResponse({ status: 200, description: 'Plan list returned.' })
  @ApiResponse({ status: 403, description: 'Admin role required.' })
  async listPlans() {
    return this.planService.listPlans();
  }

  @Roles('admin')
  @Put('users/:id/plan')
  @ApiOperation({ summary: 'Set user plan', description: 'Admin only. Assigns a billing/license plan to a user.' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({ schema: { type: 'object', properties: { planId: { type: 'string' } }, required: ['planId'] } })
  @ApiResponse({ status: 200, description: 'Plan updated.' })
  @ApiResponse({ status: 403, description: 'Admin role required.' })
  @ApiResponse({ status: 404, description: 'User or plan not found.' })
  async setUserPlan(@Param('id') id: string, @Body() body: { planId: string }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('user not found');
    return this.planService.setUserPlan(id, body.planId);
  }
}
