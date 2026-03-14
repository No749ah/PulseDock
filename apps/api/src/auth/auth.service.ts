import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compareSync, hashSync } from 'bcryptjs';
import type ms from 'ms';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { MailerService } from '../common/mailer.service';
import { MetricsService } from '../common/metrics.service';
import { generateSecret as totpGenerateSecret, generate as totpGenerate, verify as totpVerify, generateURI } from 'otplib';
import * as QRCode from 'qrcode';

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
      throw new BadRequestException('Password must be at least 12 characters and include uppercase, lowercase, a number, and a special character');
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
    const isFirstAdmin = userCount === 0;
    const user = await this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: hashSync(password, 10),
        role: isFirstAdmin ? 'admin' : 'user',
        isActive: true,
        mustChangePassword: false,
        emailVerified: isFirstAdmin,
      },
    });

    await this.audit.log('auth.register', user.id, user.id, { email: user.email });

    if (!isFirstAdmin && process.env.REQUIRE_EMAIL_VERIFICATION === 'true') {
      const token = randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.prisma.emailVerificationToken.create({ data: { token, email: user.email, expiresAt } });
      const appBase = process.env.APP_BASE_URL ?? 'http://localhost:3000';
      const verifyUrl = `${appBase}/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;
      await this.mailer.sendEmailVerificationEmail(user.email, verifyUrl);
      return { id: user.id, email: user.email, role: user.role, emailVerificationSent: true };
    }

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

    if (!user.emailVerified && process.env.REQUIRE_EMAIL_VERIFICATION === 'true') {
      throw new UnauthorizedException('email_not_verified');
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    }

    // If 2FA is enabled, issue a short-lived temp token instead of a session
    if (user.totpEnabled) {
      const tempToken = this.jwt.sign(
        { sub: user.id, type: 'totp-pending' },
        {
          secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
          expiresIn: '5m' as ms.StringValue,
        },
      );
      return { requires2fa: true, tempToken } as unknown as { accessToken: string; refreshToken: string; user: AuthUser };
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
        emailVerified: true,
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

  /**
   * Revoke the session associated with an access token.
   * Used by logout so stolen refresh tokens become invalid immediately.
   */
  async revokeSessionByToken(token: string): Promise<void> {
    try {
      const payload = this.jwt.verify<{ sub: string; sid?: string; type: string }>(token, {
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
      });
      if (payload.type !== 'access' || !payload.sid) return;
      await this.prisma.session.updateMany({
        where: { id: payload.sid, userId: payload.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log('auth.logout', payload.sub, payload.sub, { sessionId: payload.sid });
    } catch {
      // Token invalid/expired — nothing to revoke
    }
  }

  async verifyEmail(token: string) {
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { token } });
    if (!record) throw new UnauthorizedException('invalid verification token');
    if (record.consumedAt) throw new UnauthorizedException('verification token already used');
    if (record.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('verification token expired');

    await this.prisma.user.update({ where: { email: record.email }, data: { emailVerified: true } });
    await this.prisma.emailVerificationToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });

    const user = await this.prisma.user.findUnique({ where: { email: record.email } });
    if (user) {
      await this.audit.log('auth.verify_email', user.id, user.id, { email: record.email });
    }

    return { ok: true };
  }

  async resendVerification(email: string) {
    const normalized = email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });

    // Do not leak user existence — always return ok
    if (user && !user.emailVerified) {
      const recentToken = await this.prisma.emailVerificationToken.findFirst({
        where: {
          email: normalized,
          createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) },
        },
      });

      if (!recentToken) {
        const token = randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await this.prisma.emailVerificationToken.create({ data: { token, email: normalized, expiresAt } });
        const appBase = process.env.APP_BASE_URL ?? 'http://localhost:3000';
        const verifyUrl = `${appBase}/verify-email?token=${token}&email=${encodeURIComponent(normalized)}`;
        await this.mailer.sendEmailVerificationEmail(normalized, verifyUrl);
        await this.audit.log('auth.resend_verification', user.id, user.id, { email: normalized });
      }
    }

    return { ok: true };
  }

  // ─── 2FA / TOTP ─────────────────────────────────────────────────────────────

  private generateRecoveryCodes(): { plaintext: string[]; hashes: string[] } {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const hex = randomBytes(6).toString('hex'); // 12 hex chars
      codes.push(`${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`);
    }
    const hashes = codes.map((c) => hashSync(c, 10));
    return { plaintext: codes, hashes };
  }

  async setup2FA(userId: string): Promise<{ secret: string; qrCodeUrl: string; otpAuthUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('user not found');

    const secret = totpGenerateSecret();
    const otpAuthUrl = generateURI({ issuer: 'PulseDock', label: user.email, secret });
    const qrCodeUrl = await QRCode.toDataURL(otpAuthUrl);

    // Store secret but do NOT enable 2FA yet — user must verify a code first
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: secret } });
    await this.audit.log('auth.2fa_setup_started', userId, userId, {});

    return { secret, qrCodeUrl, otpAuthUrl };
  }

  async verifyAndEnable2FA(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpSecret) throw new BadRequestException('2FA setup not started');
    if (user.totpEnabled) throw new BadRequestException('2FA already enabled');

    const valid = await totpVerify({ token: code, secret: user.totpSecret });
    if (!valid) throw new UnauthorizedException('invalid TOTP code');

    const { plaintext, hashes } = this.generateRecoveryCodes();

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true, totpRecoveryCodes: JSON.stringify(hashes) },
    });
    await this.audit.log('auth.2fa_enabled', userId, userId, {});

    return { recoveryCodes: plaintext };
  }

  async disable2FA(userId: string, password: string, code: string): Promise<{ ok: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('user not found');
    if (!user.totpEnabled || !user.totpSecret) throw new BadRequestException('2FA is not enabled');

    if (!compareSync(password, user.passwordHash)) {
      throw new UnauthorizedException('invalid password');
    }

    const valid = await totpVerify({ token: code, secret: user.totpSecret });
    if (!valid && !this.checkRecoveryCode(user.totpRecoveryCodes, code)) {
      throw new UnauthorizedException('invalid TOTP code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null, totpRecoveryCodes: null },
    });
    await this.audit.log('auth.2fa_disabled', userId, userId, {});

    return { ok: true };
  }

  async regenerateRecoveryCodes(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpEnabled || !user.totpSecret) throw new BadRequestException('2FA is not enabled');

    const valid = await totpVerify({ token: code, secret: user.totpSecret });
    if (!valid) throw new UnauthorizedException('invalid TOTP code');

    const { plaintext, hashes } = this.generateRecoveryCodes();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpRecoveryCodes: JSON.stringify(hashes) },
    });
    await this.audit.log('auth.2fa_recovery_codes_regenerated', userId, userId, {});

    return { recoveryCodes: plaintext };
  }

  private checkRecoveryCode(totpRecoveryCodes: string | null, code: string): boolean {
    if (!totpRecoveryCodes) return false;
    let hashes: string[];
    try {
      hashes = JSON.parse(totpRecoveryCodes) as string[];
    } catch {
      return false;
    }
    const matched = hashes.findIndex((h) => compareSync(code, h));
    if (matched === -1) return false;
    return true;
  }

  private consumeRecoveryCode(totpRecoveryCodes: string | null, code: string): { matched: boolean; remainingHashes: string[] } {
    if (!totpRecoveryCodes) return { matched: false, remainingHashes: [] };
    let hashes: string[];
    try {
      hashes = JSON.parse(totpRecoveryCodes) as string[];
    } catch {
      return { matched: false, remainingHashes: [] };
    }
    const matchedIdx = hashes.findIndex((h) => compareSync(code, h));
    if (matchedIdx === -1) return { matched: false, remainingHashes: hashes };
    const remaining = [...hashes.slice(0, matchedIdx), ...hashes.slice(matchedIdx + 1)];
    return { matched: true, remainingHashes: remaining };
  }

  async verifyTotpLogin(
    tempToken: string,
    code: string,
    context?: { userAgent?: string | null; ipAddress?: string | null },
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    let payload: { sub: string; type: string };
    try {
      payload = this.jwt.verify<{ sub: string; type: string }>(tempToken, {
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
      });
    } catch {
      throw new UnauthorizedException('invalid or expired temp token');
    }

    if (payload.type !== 'totp-pending') throw new UnauthorizedException('invalid token type');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('user not found or disabled');
    if (!user.totpEnabled || !user.totpSecret) throw new BadRequestException('2FA not enabled');

    // Try TOTP code first
    const totpValid = await totpVerify({ token: code, secret: user.totpSecret });
    if (!totpValid) {
      // Try recovery code (single-use)
      const { matched, remainingHashes } = this.consumeRecoveryCode(user.totpRecoveryCodes, code);
      if (!matched) {
        await this.audit.log('auth.2fa_verify_failed', user.id, user.id, {});
        throw new UnauthorizedException('invalid TOTP code');
      }
      // Consume the recovery code
      await this.prisma.user.update({
        where: { id: user.id },
        data: { totpRecoveryCodes: JSON.stringify(remainingHashes) },
      });
      await this.audit.log('auth.2fa_recovery_code_used', user.id, user.id, {});
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

    await this.audit.log('auth.login', user.id, user.id, { via: '2fa' });
    return { accessToken, refreshToken, user: { ...payloadUser, mustChangePassword: user.mustChangePassword } };
  }

  async getActiveUserById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) return null;
    return { id: user.id, email: user.email, role: user.role as 'admin' | 'user', mustChangePassword: user.mustChangePassword, totpEnabled: user.totpEnabled };
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
