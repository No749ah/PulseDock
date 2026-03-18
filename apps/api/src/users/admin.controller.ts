import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma.service';
import { AuthGuard } from '../common/auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { AuditService } from '../common/audit.service';
import { SetRoleDto, SetStatusDto, UpdateUserDto } from './admin.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Roles('admin')
  @Get('users')
  @ApiOperation({ summary: 'List all users', description: 'Admin only. Returns all registered users.' })
  @ApiResponse({ status: 200, description: 'User list returned.' })
  @ApiResponse({ status: 403, description: 'Admin role required.' })
  async users() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map((u) => ({ id: u.id, email: u.email, role: u.role, isActive: u.isActive, createdAt: u.createdAt.toISOString() }));
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
        role: body.role ?? user.role,
        isActive: body.isActive ?? user.isActive,
      },
    });

    if (body.isActive === false) await this.prisma.session.deleteMany({ where: { userId: body.userId } });
    await this.audit.log('admin.user.update', req.user.id, body.userId, { email: body.email, role: body.role, isActive: body.isActive });

    return { id: updated.id, email: updated.email, role: updated.role, isActive: updated.isActive, createdAt: updated.createdAt.toISOString() };
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
}
