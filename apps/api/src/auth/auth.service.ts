import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compareSync, hashSync } from 'bcryptjs';
import type ms from 'ms';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { MailerService } from '../common/mailer.service';
import { MetricsService } from '../common/metrics.service';

type AuthUser = { id: string; email: string; role: 'admin' | 'user'; mustChangePassword: boolean };

@Injectable()
export class AuthService {
  private assertPasswordPolicy(password: string) {
    const ok =
      password.length >= 12 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /\d/.test(password) &&
      /[^A-Za-z0-9]/.test(password);

    if (!ok) {
      throw new UnauthorizedException('password must be at least 12 chars and include upper/lower/number/special');
    }
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly metrics: MetricsService,
  ) {}

  private signAccessToken(user: { id: string; email: string; role: 'admin' | 'user' }, sessionId: string) {
    return this.jwt.sign(
      { sub: user.id, sid: sessionId, email: user.email, role: user.role, type: 'access' },
      {
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
        expiresIn: (process.env.JWT_ACCESS_EXPIRES ?? '15m') as ms.StringValue,
      },
    );
  }

  private signRefreshToken(user: { id: string; email: string; role: 'admin' | 'user' }, sessionId: string) {
    return this.jwt.sign(
      { sub: user.id, sid: sessionId, email: user.email, role: user.role, type: 'refresh' },
      {
        secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
        expiresIn: (process.env.JWT_REFRESH_EXPIRES ?? '30d') as ms.StringValue,
      },
    );
  }

  private getRefreshTtlMs() {
    const raw = String(process.env.JWT_REFRESH_EXPIRES ?? '30d').trim();
    const m = raw.match(/^(\d+)([smhd])$/i);
    if (!m) return 30 * 24 * 60 * 60 * 1000;
    const value = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === 's') return value * 1000;
    if (unit === 'm') return value * 60 * 1000;
    if (unit === 'h') return value * 60 * 60 * 1000;
    return value * 24 * 60 * 60 * 1000;
  }

  private async purgeUserSessions(userId: string) {
    const cutoff = new Date(Date.now() - this.getRefreshTtlMs());
    await this.prisma.session.deleteMany({
      where: {
        userId,
        OR: [{ revokedAt: { not: null } }, { createdAt: { lt: cutoff } }],
      },
    });
  }

  async register(email: string, password: string) {
    this.assertPasswordPolicy(password);
    const allowPublicRegistration = (process.env.ALLOW_PUBLIC_REGISTRATION ?? 'false') === 'true';
    if (!allowPublicRegistration) {
      throw new UnauthorizedException('public registration disabled, use invite link');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) throw new ConflictException('email already exists');

    const userCount = await this.prisma.user.count();
    const user = await this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: hashSync(password, 10),
        role: userCount === 0 ? 'admin' : 'user',
        isActive: true,
        mustChangePassword: false,
      },
    });

    await this.audit.log('auth.register', user.id, user.id, { email: user.email });
    return { id: user.id, email: user.email, role: user.role };
  }

  async login(email: string, password: string, context?: { userAgent?: string | null; ipAddress?: string | null }) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new UnauthorizedException('invalid credentials');

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException('account temporarily locked');
    }

    if (!compareSync(password, user.passwordHash)) {
      const failedLoginCount = user.failedLoginCount + 1;
      const lockedUntil = failedLoginCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount, lockedUntil } });
      await this.audit.log('auth.login_failed', user.id, user.id, { failedLoginCount });
      this.metrics.inc('authLoginFailed');
      throw new UnauthorizedException('invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('user is disabled');
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    }

    const payloadUser = { id: user.id, email: user.email, role: user.role as 'admin' | 'user' };

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: 'pending',
        userAgent: context?.userAgent ?? null,
        ipAddress: context?.ipAddress ?? null,
      },
    });

    const accessToken = this.signAccessToken(payloadUser, session.id);
    const refreshToken = this.signRefreshToken(payloadUser, session.id);

    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: hashSync(refreshToken, 10) },
    });

    await this.audit.log('auth.login', user.id, user.id, {});
    return { accessToken, refreshToken, user: { ...payloadUser, mustChangePassword: user.mustChangePassword } satisfies AuthUser };
  }

  async refresh(refreshToken: string | undefined, context?: { userAgent?: string | null; ipAddress?: string | null }) {
    if (!refreshToken) throw new UnauthorizedException('No refresh token provided');
    try {
      const payload = this.jwt.verify<{ sub: string; sid?: string; type: string; email: string; role: 'admin' | 'user' }>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
      });

      if (payload.type !== 'refresh' || !payload.sid) throw new UnauthorizedException('invalid token type');

      const session = await this.prisma.session.findFirst({
        where: { id: payload.sid, userId: payload.sub, revokedAt: null },
      });
      if (!session || !compareSync(refreshToken, session.refreshTokenHash)) throw new UnauthorizedException('invalid refresh session');

      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException('user not found');
      if (!user.isActive) throw new UnauthorizedException('user is disabled');

      const payloadUser = { id: user.id, email: user.email, role: user.role as 'admin' | 'user' };
      const nextRefreshToken = this.signRefreshToken(payloadUser, session.id);

      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          refreshTokenHash: hashSync(nextRefreshToken, 10),
          userAgent: context?.userAgent ?? session.userAgent,
          ipAddress: context?.ipAddress ?? session.ipAddress,
        },
      });

      await this.audit.log('auth.refresh', user.id, user.id, {});
      return {
        accessToken: this.signAccessToken(payloadUser, session.id),
        refreshToken: nextRefreshToken,
        user: { ...payloadUser, mustChangePassword: user.mustChangePassword } satisfies AuthUser,
      };
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }
  }

  async getInviteInfo(token: string) {
    const invite = await this.prisma.inviteToken.findUnique({ where: { token } });
    if (!invite) throw new UnauthorizedException('invalid invite token');
    if (invite.acceptedAt) throw new UnauthorizedException('invite already used');
    if (invite.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('invite expired');

    return {
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async acceptInvite(token: string, password: string) {
    this.assertPasswordPolicy(password);
    const invite = await this.prisma.inviteToken.findUnique({ where: { token } });
    if (!invite) throw new UnauthorizedException('invalid invite token');
    if (invite.acceptedAt) throw new UnauthorizedException('invite already used');
    if (invite.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('invite expired');

    const existing = await this.prisma.user.findUnique({ where: { email: invite.email } });
    if (existing) throw new ConflictException('user already exists');

    const user = await this.prisma.user.create({
      data: {
        email: invite.email,
        passwordHash: hashSync(password, 10),
        role: invite.role,
        isActive: true,
        mustChangePassword: false,
      },
    });

    await this.prisma.inviteToken.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    await this.audit.log('auth.accept_invite', user.id, user.id, { inviteId: invite.id });

    return { id: user.id, email: user.email, role: user.role as 'admin' | 'user' };
  }

  async updateProfile(userId: string, email: string) {
    const normalized = email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existing && existing.id !== userId) throw new ConflictException('email already exists');

    const user = await this.prisma.user.update({ where: { id: userId }, data: { email: normalized } });
    await this.audit.log('auth.update_profile', userId, userId, { email: normalized });
    return { id: user.id, email: user.email, role: user.role as 'admin' | 'user' };
  }

  async changePassword(userId: string, currentPassword: string | undefined, newPassword: string) {
    this.assertPasswordPolicy(newPassword);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    const requiresCurrentPassword = !user.mustChangePassword;
    if (requiresCurrentPassword && (!currentPassword || !compareSync(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('invalid current password');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashSync(newPassword, 10), mustChangePassword: false },
    });
    await this.prisma.session.deleteMany({ where: { userId } });
    await this.audit.log('auth.change_password', userId, userId, {});
    return { ok: true };
  }

  async requestPasswordReset(email: string) {
    const normalized = email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });

    // do not leak user existence
    if (!user) return { ok: true };

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        token,
        email: normalized,
        expiresAt,
      },
    });

    const appBase = process.env.APP_BASE_URL ?? 'http://localhost:3000';
    const resetUrl = `${appBase}/login?reset=${token}&email=${encodeURIComponent(normalized)}`;
    const mail = await this.mailer.sendPasswordResetEmail(normalized, resetUrl);

    await this.audit.log('auth.request_password_reset', user.id, user.id, { email: normalized, mailSent: mail.sent });
    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string) {
    this.assertPasswordPolicy(newPassword);
    const reset = await this.prisma.passwordResetToken.findUnique({ where: { token } });
    if (!reset) throw new UnauthorizedException('invalid reset token');
    if (reset.consumedAt) throw new UnauthorizedException('reset token already used');
    if (reset.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('reset token expired');

    const user = await this.prisma.user.findUnique({ where: { email: reset.email } });
    if (!user) throw new UnauthorizedException('user not found');

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashSync(newPassword, 10),
        mustChangePassword: false,
      },
    });

    await this.prisma.passwordResetToken.update({ where: { id: reset.id }, data: { consumedAt: new Date() } });
    await this.prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log('auth.reset_password', user.id, user.id, {});

    return { ok: true };
  }

  async listSessions(userId: string) {
    await this.purgeUserSessions(userId);
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      revokedAt: s.revokedAt ? s.revokedAt.toISOString() : null,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new UnauthorizedException('session not found');

    await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    await this.purgeUserSessions(userId);
    await this.audit.log('auth.revoke_session', userId, userId, { sessionId });
    return { ok: true };
  }

  async revokeAllSessions(userId: string) {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.purgeUserSessions(userId);
    await this.audit.log('auth.revoke_all_sessions', userId, userId, {});
    return { ok: true };
  }

  async getActiveUserById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) return null;
    return { id: user.id, email: user.email, role: user.role as 'admin' | 'user', mustChangePassword: user.mustChangePassword };
  }

  async getUserByAccessToken(token: string | undefined) {
    if (!token) return null;
    try {
      const payload = this.jwt.verify<{ sub: string; sid?: string; email: string; role: 'admin' | 'user'; type: string }>(token, {
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
      });
      if (payload.type !== 'access' || !payload.sid) return null;

      const session = await this.prisma.session.findFirst({ where: { id: payload.sid, userId: payload.sub, revokedAt: null } });
      if (!session) return null;
      const expired = session.createdAt.getTime() < Date.now() - this.getRefreshTtlMs();
      if (expired) {
        await this.prisma.session.delete({ where: { id: session.id } });
        return null;
      }

      return { id: payload.sub, email: payload.email, role: payload.role, sessionId: payload.sid };
    } catch {
      return null;
    }
  }
}
