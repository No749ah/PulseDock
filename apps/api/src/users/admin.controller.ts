import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuthGuard } from '../common/auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { AuditService } from '../common/audit.service';
import { SetRoleDto, SetStatusDto, UpdateUserDto } from './admin.dto';

@UseGuards(AuthGuard, RolesGuard)
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Roles('admin')
  @Get('users')
  async users() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map((u) => ({ id: u.id, email: u.email, role: u.role, isActive: u.isActive, createdAt: u.createdAt.toISOString() }));
  }

  @Roles('admin')
  @Patch('users/role')
  async setRole(@Req() req: { user: { id: string } }, @Body() body: SetRoleDto) {
    const user = await this.prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw new NotFoundException('user not found');
    await this.prisma.user.update({ where: { id: body.userId }, data: { role: body.role } });
    await this.audit.log('admin.user.set_role', req.user.id, body.userId, { role: body.role });
    return { ok: true };
  }

  @Roles('admin')
  @Patch('users/update')
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
  async revokePasswordReset(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const existing = await this.prisma.passwordResetToken.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('password reset token not found');
    await this.prisma.passwordResetToken.update({ where: { id }, data: { consumedAt: new Date() } });
    await this.audit.log('admin.password_reset.revoke', req.user.id, null, { passwordResetId: id, email: existing.email });
    return { ok: true };
  }
}
