import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
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
  private readonly logger = new Logger(AuthService.name);

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

  /**
   * Deletes revoked and expired sessions for a user.
   * Session expiry is derived from the configured refresh token TTL.
   *
   * @param userId - The user ID whose stale sessions should be removed
   * @returns Resolves when cleanup is complete
   */
  private async purgeUserSessions(userId: string) {
    const cutoff = new Date(Date.now() - this.getRefreshTtlMs());
    await this.prisma.session.deleteMany({
      where: {
        userId,
        OR: [{ revokedAt: { not: null } }, { createdAt: { lt: cutoff } }],
      },
    });
  }

  /**
   * Registers a new user account.
   * Enforces the password policy and checks that public registration is enabled via `ALLOW_PUBLIC_REGISTRATION`.
   * The first registered user is granted the `admin` role and has email verification skipped.
   * Subsequent users receive a verification email when `REQUIRE_EMAIL_VERIFICATION=true`.
   *
   * @param email - The user's email address (will be lowercased)
   * @param password - Plain-text password (must satisfy the password policy)
   * @returns Basic user info; includes `emailVerificationSent: true` when verification email was sent
   * @throws BadRequestException if the password does not meet the policy requirements
   * @throws UnauthorizedException if public registration is disabled
   * @throws ConflictException if the email address is already registered
   */
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

  /**
   * Authenticates a user with email and password.
   * Enforces account lockout (5 failed attempts → 15-minute lock) and notifies the user when locked.
   * When 2FA is enabled, returns a short-lived `tempToken` instead of a full session.
   * After a successful login, fires an asynchronous new-IP detection check.
   *
   * @param email - The user's email address
   * @param password - The plain-text password to verify
   * @param context - Optional request context (userAgent, ipAddress) for session creation and anomaly detection
   * @returns `{ accessToken, refreshToken, user }` on success, or `{ requires2fa: true, tempToken }` when 2FA is pending
   * @throws UnauthorizedException if credentials are invalid, the account is locked, or email is not verified
   */
  async login(email: string, password: string, context?: { userAgent?: string | null; ipAddress?: string | null }) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new UnauthorizedException('invalid credentials');

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException('account temporarily locked');
    }

    if (!user.passwordHash || !compareSync(password, user.passwordHash)) {
      const failedLoginCount = user.failedLoginCount + 1;
      const lockedUntil = failedLoginCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount, lockedUntil } });
      await this.audit.log('auth.login_failed', user.id, user.id, { failedLoginCount });
      this.metrics.inc('authLoginFailed');
      // Notify user when their account gets locked
      if (lockedUntil) {
        this.mailer?.sendAccountLockedEmail(user.email, lockedUntil, context?.ipAddress).catch(() => {
          // fire-and-forget — don't block or reveal internal errors
        });
      }
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

    // Anomaly detection: warn user if login from a previously unseen IP
    void this.checkNewIpAndNotify(user.id, user.email, context?.ipAddress ?? null, context?.userAgent ?? null);

    return { accessToken, refreshToken, user: { ...payloadUser, mustChangePassword: user.mustChangePassword } satisfies AuthUser };
  }

  /**
   * Fires-and-forgets an email if the given IP has never been seen in this user's session history.
   * Runs after login completes so it doesn't add latency to the login response.
   */
  private async checkNewIpAndNotify(userId: string, email: string, ipAddress: string | null, userAgent: string | null): Promise<void> {
    if (!ipAddress) return;

    try {
      // Count sessions from before now with this IP (excluding the session just created)
      const previousSessionsWithIp = await this.prisma.session.count({
        where: {
          userId,
          ipAddress,
          // created more than 10 seconds ago to exclude the current session
          createdAt: { lt: new Date(Date.now() - 10_000) },
        },
      });

      if (previousSessionsWithIp > 0) return; // IP is known, no alert

      // Check if this is the very first login ever (only 1 session total)
      const totalSessions = await this.prisma.session.count({ where: { userId } });
      if (totalSessions <= 1) return; // First ever login — no alert

      // New IP on an established account → send warning
      await this.mailer.sendNewLoginEmail(email, {
        ipAddress,
        userAgent,
        timestamp: new Date().toUTCString(),
      });

      await this.audit.log('auth.new_ip_login', userId, userId, { ipAddress, userAgent });
    } catch (err) {
      this.logger.warn(`[anomaly-detect] failed to check IP for user ${userId}: ${String(err)}`);
    }
  }

  /**
   * Rotates a refresh token, invalidating the old one and issuing a fresh pair of tokens.
   * Validates the token's signature, type (`refresh`), and session revocation status.
   *
   * @param refreshToken - The current refresh token from the HTTP-only cookie or request body
   * @param context - Optional request context used to update session metadata (userAgent, ipAddress)
   * @returns `{ accessToken, refreshToken, user }` with rotated tokens
   * @throws UnauthorizedException if the token is missing, invalid, expired, or the session was revoked
   */
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

  /**
   * Returns metadata for an invite token (email, role, expiry) without consuming it.
   * Used by the invite acceptance page to pre-fill the email field.
   *
   * @param token - The invite token from the invite email URL
   * @returns `{ email, role, expiresAt }` of the invite
   * @throws UnauthorizedException if the token is invalid, already accepted, or expired
   */
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

  /**
   * Creates a new user account by consuming a valid invite token.
   * The new account's email is automatically marked as verified.
   *
   * @param token - The invite token from the invite email URL
   * @param password - Plain-text password chosen by the new user (must satisfy the password policy)
   * @returns Basic user info `{ id, email, role }`
   * @throws BadRequestException if the password does not meet the policy requirements
   * @throws UnauthorizedException if the token is invalid, already accepted, or expired
   * @throws ConflictException if a user with that email already exists
   */
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

  /**
   * Updates the authenticated user's profile fields (email, displayName, timezone).
   * Only the fields explicitly passed (non-undefined) are updated.
   * Email uniqueness is enforced — cannot reuse another account's email.
   *
   * @param userId - The authenticated user's ID
   * @param email - New email address (optional, will be lowercased)
   * @param displayName - Display name to show in the UI (optional, empty string clears it)
   * @param timezone - IANA timezone string (optional, defaults to 'UTC' when empty)
   * @returns Updated user profile `{ id, email, role, displayName, timezone }`
   * @throws ConflictException if the new email is already used by another account
   */
  async updateProfile(userId: string, email?: string, displayName?: string, timezone?: string) {
    const data: Record<string, unknown> = {};

    if (email !== undefined) {
      const normalized = email.toLowerCase();
      const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
      if (existing && existing.id !== userId) throw new ConflictException('email already exists');
      data.email = normalized;
    }

    if (displayName !== undefined) data.displayName = displayName.trim() || null;
    if (timezone !== undefined) data.timezone = timezone || 'UTC';

    const user = await this.prisma.user.update({ where: { id: userId }, data });
    await this.audit.log('auth.update_profile', userId, userId, { email: data.email ?? undefined, displayName, timezone });
    return { id: user.id, email: user.email, role: user.role as 'admin' | 'user', displayName: user.displayName ?? null, timezone: user.timezone ?? 'UTC' };
  }

  /**
   * Changes the authenticated user's password.
   * Current password verification is required unless the account has `mustChangePassword=true`.
   * All existing sessions are invalidated after a successful password change.
   *
   * @param userId - The authenticated user's ID
   * @param currentPassword - The current password (required unless `mustChangePassword` is true)
   * @param newPassword - The new password (must satisfy the password policy)
   * @returns `{ ok: true }` on success
   * @throws BadRequestException if the new password does not meet the policy requirements
   * @throws UnauthorizedException if the current password is wrong or the user is not found
   */
  async changePassword(userId: string, currentPassword: string | undefined, newPassword: string) {
    this.assertPasswordPolicy(newPassword);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    const requiresCurrentPassword = !user.mustChangePassword;
    if (requiresCurrentPassword && (!currentPassword || !user.passwordHash || !compareSync(currentPassword, user.passwordHash))) {
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

  isMailConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }

  /**
   * Issues a password reset token and sends a reset email to the given address.
   * Any existing unused reset tokens for the email are invalidated before issuing a new one.
   * Does not reveal whether the email is registered (always returns `{ ok: true }`).
   * Tokens are short-lived (15 minutes).
   *
   * @param email - The account's email address
   * @returns `{ ok: true }` regardless of whether the email is registered
   * @throws ServiceUnavailableException if SMTP is not configured on this instance
   */
  async requestPasswordReset(email: string) {
    if (!this.isMailConfigured()) {
      throw new ServiceUnavailableException('Password reset is not available: mail is not configured on this instance.');
    }

    const normalized = email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });

    // do not leak user existence
    if (!user) return { ok: true };

    // Invalidate any existing unused reset tokens for this email before issuing a new one
    await this.prisma.passwordResetToken.updateMany({
      where: { email: normalized, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const token = randomBytes(24).toString('hex');
    // Short-lived: 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

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

  /**
   * Resets a user's password using a valid single-use reset token.
   * All active sessions are revoked after the password is successfully changed.
   *
   * @param token - The password reset token from the reset email URL
   * @param newPassword - The new password (must satisfy the password policy)
   * @returns `{ ok: true }` on success
   * @throws BadRequestException if the new password does not meet the policy requirements
   * @throws UnauthorizedException if the token is invalid, already consumed, or expired
   */
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

  /**
   * Returns all active (non-revoked) sessions for the authenticated user.
   * Purges expired and revoked sessions before listing.
   *
   * @param userId - The authenticated user's ID
   * @returns Array of active session objects (id, userAgent, ipAddress, revokedAt, createdAt)
   */
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

  /**
   * Revokes a specific session by ID, invalidating its refresh token.
   * Purges expired/revoked sessions for the user after revocation.
   *
   * @param userId - The authenticated user's ID
   * @param sessionId - The session ID to revoke
   * @returns `{ ok: true }` on success
   * @throws UnauthorizedException if the session is not found or does not belong to the user
   */
  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new UnauthorizedException('session not found');

    await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    await this.purgeUserSessions(userId);
    await this.audit.log('auth.revoke_session', userId, userId, { sessionId });
    return { ok: true };
  }

  /**
   * Revokes all active sessions for the authenticated user (global sign-out).
   *
   * @param userId - The authenticated user's ID
   * @returns `{ ok: true }` on success
   */
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

  /**
   * Consumes an email verification token and marks the associated account's email as verified.
   *
   * @param token - The verification token from the email link
   * @returns `{ ok: true }` on success
   * @throws UnauthorizedException if the token is invalid, already consumed, or expired
   */
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

  /**
   * Resends an email verification link for an unverified account.
   * Rate-limited: does not send if a token was issued within the last 2 minutes.
   * Does not reveal whether the email is registered (always returns `{ ok: true }`).
   *
   * @param email - The unverified account's email address
   * @returns `{ ok: true }` always
   */
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

  /**
   * Initiates the TOTP 2FA setup flow by generating a new TOTP secret for the user.
   * The secret is stored but 2FA is NOT yet enabled — the user must call `verifyAndEnable2FA` with a valid code.
   *
   * @param userId - The authenticated user's ID
   * @returns `{ secret, qrCodeUrl, otpAuthUrl }` — the QR code data URL for authenticator app scanning
   * @throws UnauthorizedException if the user is not found
   */
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

  /**
   * Verifies a TOTP code and enables 2FA on the account if valid.
   * Generates 10 single-use recovery codes; their bcrypt hashes are stored in the database.
   *
   * @param userId - The authenticated user's ID
   * @param code - The 6-digit TOTP code from the authenticator app
   * @returns `{ recoveryCodes }` — the plaintext recovery codes (shown once; user should store them)
   * @throws BadRequestException if 2FA setup has not been started or is already enabled
   * @throws UnauthorizedException if the TOTP code is invalid
   */
  async verifyAndEnable2FA(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpSecret) throw new BadRequestException('2FA setup not started');
    if (user.totpEnabled) throw new BadRequestException('2FA already enabled');

    const valid = await totpVerify({ token: code, secret: user.totpSecret });
    if (!valid.valid) throw new UnauthorizedException('invalid TOTP code');

    const { plaintext, hashes } = this.generateRecoveryCodes();

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true, totpRecoveryCodes: JSON.stringify(hashes) },
    });
    await this.audit.log('auth.2fa_enabled', userId, userId, {});

    return { recoveryCodes: plaintext };
  }

  /**
   * Disables TOTP 2FA on the account after verifying the current password and a valid TOTP/recovery code.
   * Clears the stored secret and all recovery codes.
   *
   * @param userId - The authenticated user's ID
   * @param password - The account's current password
   * @param code - A valid TOTP code or recovery code
   * @returns `{ ok: true }` on success
   * @throws UnauthorizedException if the user is not found or the password/code is invalid
   * @throws BadRequestException if 2FA is not currently enabled
   */
  async disable2FA(userId: string, password: string, code: string): Promise<{ ok: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('user not found');
    if (!user.totpEnabled || !user.totpSecret) throw new BadRequestException('2FA is not enabled');

    if (!user.passwordHash || !compareSync(password, user.passwordHash)) {
      throw new UnauthorizedException('invalid password');
    }

    const valid = await totpVerify({ token: code, secret: user.totpSecret });
    if (!valid.valid && !this.checkRecoveryCode(user.totpRecoveryCodes, code)) {
      throw new UnauthorizedException('invalid TOTP code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null, totpRecoveryCodes: null },
    });
    await this.audit.log('auth.2fa_disabled', userId, userId, {});

    return { ok: true };
  }

  /**
   * Regenerates the set of 2FA recovery codes after verifying a valid TOTP code.
   * Old recovery codes are invalidated immediately upon regeneration.
   *
   * @param userId - The authenticated user's ID
   * @param code - A valid TOTP code from the authenticator app
   * @returns `{ recoveryCodes }` — 10 new plaintext recovery codes (shown once)
   * @throws BadRequestException if 2FA is not enabled
   * @throws UnauthorizedException if the TOTP code is invalid
   */
  async regenerateRecoveryCodes(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpEnabled || !user.totpSecret) throw new BadRequestException('2FA is not enabled');

    const valid = await totpVerify({ token: code, secret: user.totpSecret });
    if (!valid.valid) throw new UnauthorizedException('invalid TOTP code');

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

  /**
   * Completes the 2FA login flow by verifying a TOTP code (or single-use recovery code) against a temp token.
   * Creates a full authenticated session and returns access/refresh tokens upon success.
   * Recovery codes are consumed (removed from the stored list) when used.
   *
   * @param tempToken - The short-lived `totp-pending` JWT issued during the first login step
   * @param code - A 6-digit TOTP code or a recovery code
   * @param context - Optional request context (userAgent, ipAddress) for session creation
   * @returns `{ accessToken, refreshToken, user }` on successful 2FA verification
   * @throws UnauthorizedException if the temp token is invalid/expired, user is disabled, or the code is wrong
   * @throws BadRequestException if 2FA is not enabled on the account
   */
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
    if (!totpValid.valid) {
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

  /**
   * Looks up an active user by ID. Used internally by JWT guards to hydrate the request user.
   *
   * @param id - The user's ID
   * @returns Full user profile or `null` if not found / account is inactive
   */
  async getActiveUserById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) return null;
    return { id: user.id, email: user.email, role: user.role as 'admin' | 'user', mustChangePassword: user.mustChangePassword, totpEnabled: user.totpEnabled, displayName: user.displayName ?? null, timezone: user.timezone ?? 'UTC' };
  }

  /**
   * Resolves an access token to a user, validating the JWT, session existence, and session expiry.
   * Used by cookie-based auth flows where the access token is read from a cookie.
   *
   * @param token - The access JWT string, or undefined
   * @returns `{ id, email, role, sessionId }` on success, or `null` if the token is invalid/expired/revoked
   */
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

  // ─── Audit Log ──────────────────────────────────────────────────────────────

  /**
   * Returns the authenticated user's audit log entries (their own actions only).
   *
   * @param userId - The authenticated user's ID
   * @param limit - Maximum number of entries to return (capped at 500, default 100)
   * @returns Array of audit log entries ordered by createdAt descending
   */
  async getUserAuditLog(userId: string, limit = 100): Promise<Array<{
    id: string;
    action: string;
    createdAt: Date;
    metaJson: unknown;
  }>> {
    return this.prisma.auditLog.findMany({
      where: { actorUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
      select: { id: true, action: true, createdAt: true, metaJson: true },
    });
  }

  /**
   * Exports up to 500 audit log entries for the authenticated user in CSV or JSON format.
   *
   * @param userId - The authenticated user's ID
   * @param format - Output format: `'csv'` or `'json'`
   * @returns `{ data, contentType, filename }` — the serialized log data with appropriate content type and filename
   */
  async exportUserAuditLog(userId: string, format: 'csv' | 'json'): Promise<{ data: string; contentType: string; filename: string }> {
    const entries = await this.getUserAuditLog(userId, 500);

    if (format === 'json') {
      return {
        data: JSON.stringify(entries, null, 2),
        contentType: 'application/json',
        filename: `audit-log-${new Date().toISOString().slice(0, 10)}.json`,
      };
    }

    // CSV format
    const header = 'id,action,createdAt,meta';
    const rows = entries.map((e) => {
      const meta = e.metaJson ? JSON.stringify(e.metaJson).replace(/"/g, '""') : '';
      return `"${e.id}","${e.action}","${e.createdAt.toISOString()}","${meta}"`;
    });
    return {
      data: [header, ...rows].join('\n'),
      contentType: 'text/csv',
      filename: `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  }

  // ─── OAuth2 / SSO ──────────────────────────────────────────────────────────

  /**
   * Returns the OAuth2 authorization URL for a given provider.
   * Throws NotFoundException if the provider is not configured.
   */
  getOAuthRedirectUrl(provider: 'github' | 'google'): string {
    const base = process.env.OAUTH_REDIRECT_BASE_URL ?? 'http://localhost:4321';
    const callbackUrl = `${base}/v1/auth/oauth/${provider}/callback`;

    if (provider === 'github') {
      const clientId = process.env.GITHUB_CLIENT_ID;
      if (!clientId) throw new NotFoundException('Provider not configured');
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callbackUrl,
        scope: 'user:email',
      });
      return `https://github.com/login/oauth/authorize?${params.toString()}`;
    }

    if (provider === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) throw new NotFoundException('Provider not configured');
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callbackUrl,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account',
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    throw new NotFoundException('Provider not configured');
  }

  /**
   * Handles the OAuth2 callback for a provider.
   * Exchanges the code for an access token, fetches the user profile,
   * and upserts the user + OAuthAccount. Returns session tokens.
   */
  async handleOAuthCallback(
    provider: 'github' | 'google',
    code: string,
    context?: { userAgent?: string | null; ipAddress?: string | null },
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const base = process.env.OAUTH_REDIRECT_BASE_URL ?? 'http://localhost:4321';
    const callbackUrl = `${base}/v1/auth/oauth/${provider}/callback`;

    let profile: { id: string; email: string; name?: string | null };

    if (provider === 'github') {
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new NotFoundException('Provider not configured');

      // Exchange code for access token
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: callbackUrl }),
      });
      const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
      if (!tokenData.access_token) throw new UnauthorizedException('GitHub OAuth failed');

      const token = tokenData.access_token;
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      });
      const userData = await userRes.json() as { id: number; login: string; name?: string | null; email?: string | null };

      // Fetch primary email if not on profile
      let email = userData.email;
      if (!email) {
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        });
        const emails = await emailsRes.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
        const primary = emails.find((e) => e.primary && e.verified);
        email = primary?.email ?? null;
      }
      if (!email) throw new BadRequestException('No verified email on GitHub account');
      profile = { id: String(userData.id), email, name: userData.name };
    } else if (provider === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new NotFoundException('Provider not configured');

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
        }).toString(),
      });
      const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
      if (!tokenData.access_token) throw new UnauthorizedException('Google OAuth failed');

      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userRes.json() as { sub: string; email: string; name?: string | null };
      if (!userData.email) throw new BadRequestException('No email from Google account');
      profile = { id: userData.sub, email: userData.email, name: userData.name };
    } else {
      throw new NotFoundException('Provider not configured');
    }

    // Upsert user + OAuthAccount
    const user = await this.findOrCreateOAuthUser(provider, profile.id, profile.email, profile.name ?? null);

    // Create session
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

    await this.audit.log('auth.oauth_login', user.id, user.id, { provider });
    void this.checkNewIpAndNotify(user.id, user.email, context?.ipAddress ?? null, context?.userAgent ?? null);

    return { accessToken, refreshToken };
  }

  /**
   * Finds or creates a user for an OAuth login.
   * Priority: existing OAuthAccount → email match → create new user.
   */
  async findOrCreateOAuthUser(
    provider: string,
    providerId: string,
    email: string,
    displayName: string | null,
  ) {
    // 1. Check for existing OAuthAccount
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerId: { provider, providerId } },
      include: { user: true },
    });
    if (existing) return existing.user;

    // 2. Find user by email and link
    const userByEmail = await this.prisma.user.findUnique({ where: { email } });
    if (userByEmail) {
      await this.prisma.oAuthAccount.create({
        data: { userId: userByEmail.id, provider, providerId },
      });
      return userByEmail;
    }

    // 3. Create new user
    const newUser = await this.prisma.user.create({
      data: {
        email,
        passwordHash: null,
        emailVerified: true,
        displayName: displayName ?? null,
        oauthAccounts: { create: { provider, providerId } },
      },
    });
    await this.audit.log('auth.register', newUser.id, newUser.id, { email, via: provider });
    return newUser;
  }
}
