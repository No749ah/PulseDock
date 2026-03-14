import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadRequestException, ConflictException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest)
// ---------------------------------------------------------------------------

vi.mock('otplib', () => ({
  generateSecret: vi.fn().mockReturnValue('MOCK_TOTP_SECRET'),
  generate: vi.fn().mockReturnValue('123456'),
  verify: vi.fn().mockReturnValue(true),
  generateURI: vi.fn().mockReturnValue('otpauth://totp/PulseDock:test@example.com?secret=MOCK_TOTP_SECRET&issuer=PulseDock'),
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockedQR'),
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockedQR') },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', // "Passw0rd!test"
    role: 'user',
    isActive: true,
    mustChangePassword: false,
    failedLoginCount: 0,
    lockedUntil: null,
    emailVerified: true,
    totpEnabled: false,
    totpSecret: null,
    totpRecoveryCodes: null,
    displayName: null,
    timezone: 'UTC',
    ...overrides,
  };
}

function makeInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invite-1',
    token: 'valid-invite-token',
    email: 'invited@example.com',
    role: 'user',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    acceptedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeResetToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rst-1',
    token: 'valid-reset-token',
    email: 'test@example.com',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    consumedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeVerificationToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vt-1',
    token: 'valid-token-abc',
    email: 'test@example.com',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    consumedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makePrisma(userOverride?: Record<string, unknown> | null) {
  const user = userOverride !== undefined ? userOverride : makeUser();
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'new-user', email: data.email, role: data.role }),
      ),
      update: vi.fn().mockResolvedValue({
        ...(user ?? makeUser()),
        id: 'user-1',
        email: 'test@example.com',
        role: 'user',
        displayName: null,
        timezone: 'UTC',
      }),
    },
    session: {
      create: vi.fn().mockResolvedValue({ id: 'session-1' }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue({ id: 'session-1', userId: 'user-1', refreshTokenHash: 'hash', userAgent: null, ipAddress: null, revokedAt: null }),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    emailVerificationToken: {
      findUnique: vi.fn().mockResolvedValue(makeVerificationToken()),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(makeVerificationToken()),
      update: vi.fn().mockResolvedValue({}),
    },
    passwordResetToken: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    inviteToken: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function makeJwt() {
  return {
    sign: vi.fn().mockReturnValue('mocked-token'),
    verify: vi.fn().mockReturnValue({}),
  };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function makeMailer() {
  return {
    sendPasswordReset: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue({ sent: true }),
    sendEmailVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendNewLoginEmail: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMetrics() {
  return { inc: vi.fn(), snapshot: vi.fn() };
}

function makeService(prismaOverride?: ReturnType<typeof makePrisma>) {
  return new AuthService(
    (prismaOverride ?? makePrisma()) as never,
    makeJwt() as never,
    makeAudit() as never,
    makeMailer() as never,
    makeMetrics() as never,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  describe('password policy', () => {
    it('throws BadRequestException for short password', async () => {
      const oldEnv = process.env.ALLOW_PUBLIC_REGISTRATION;
      process.env.ALLOW_PUBLIC_REGISTRATION = 'true';

      const prisma = makePrisma(null);
      const svc = makeService(prisma as never);

      await expect(svc.register('new@example.com', 'short')).rejects.toThrow(BadRequestException);

      process.env.ALLOW_PUBLIC_REGISTRATION = oldEnv;
    });

    it('throws BadRequestException for password without uppercase', async () => {
      const oldEnv = process.env.ALLOW_PUBLIC_REGISTRATION;
      process.env.ALLOW_PUBLIC_REGISTRATION = 'true';

      const prisma = makePrisma(null);
      const svc = makeService(prisma as never);

      await expect(svc.register('new@example.com', 'lowercase123!')).rejects.toThrow(BadRequestException);

      process.env.ALLOW_PUBLIC_REGISTRATION = oldEnv;
    });
  });

  describe('register()', () => {
    it('throws UnauthorizedException when public registration disabled', async () => {
      const oldEnv = process.env.ALLOW_PUBLIC_REGISTRATION;
      process.env.ALLOW_PUBLIC_REGISTRATION = 'false';

      const svc = makeService();
      await expect(svc.register('new@example.com', 'ValidPass12!')).rejects.toThrow(UnauthorizedException);

      process.env.ALLOW_PUBLIC_REGISTRATION = oldEnv;
    });

    it('throws ConflictException if email already exists', async () => {
      const oldEnv = process.env.ALLOW_PUBLIC_REGISTRATION;
      process.env.ALLOW_PUBLIC_REGISTRATION = 'true';

      const prisma = makePrisma(makeUser());
      const svc = makeService(prisma as never);

      await expect(svc.register('test@example.com', 'ValidPass1!Pass')).rejects.toThrow(ConflictException);

      process.env.ALLOW_PUBLIC_REGISTRATION = oldEnv;
    });

    it('creates user and returns id/email/role when valid', async () => {
      const oldEnv = process.env.ALLOW_PUBLIC_REGISTRATION;
      process.env.ALLOW_PUBLIC_REGISTRATION = 'true';

      const prisma = makePrisma(null);
      const svc = makeService(prisma as never);

      const result = await svc.register('brand-new@example.com', 'ValidPass1!Pass');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('role');

      process.env.ALLOW_PUBLIC_REGISTRATION = oldEnv;
    });
  });

  describe('login()', () => {
    it('throws UnauthorizedException for nonexistent user', async () => {
      const prisma = makePrisma(null);
      const svc = makeService(prisma as never);

      await expect(svc.login('nobody@example.com', 'Password1!')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const user = makeUser({ passwordHash: '$2a$10$invalidhashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
      const prisma = makePrisma(user);
      const svc = makeService(prisma as never);

      await expect(svc.login('test@example.com', 'WrongPassword1!')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for locked account', async () => {
      const user = makeUser({ lockedUntil: new Date(Date.now() + 60_000) });
      const prisma = makePrisma(user);
      const svc = makeService(prisma as never);

      await expect(svc.login('test@example.com', 'ValidPass1!')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for disabled user', async () => {
      const { hashSync } = await import('bcryptjs');
      const hash = hashSync('ValidPass1!', 10);
      const user = makeUser({ passwordHash: hash, isActive: false });
      const prisma = makePrisma(user);
      const svc = makeService(prisma as never);

      await expect(svc.login('test@example.com', 'ValidPass1!')).rejects.toThrow(UnauthorizedException);
    });

    it('returns accessToken + refreshToken + user on successful login', async () => {
      const { hashSync } = await import('bcryptjs');
      const hash = hashSync('ValidPass1!', 10);
      const user = makeUser({ passwordHash: hash });
      const prisma = makePrisma(user);
      const svc = makeService(prisma as never);

      const result = await svc.login('test@example.com', 'ValidPass1!');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).toHaveProperty('id');
      expect(result.user).toHaveProperty('email');
      expect(result.user).toHaveProperty('role');
    });
  });

  // ─── verifyEmail() ──────────────────────────────────────────────────────────

  describe('verifyEmail()', () => {
    it('returns { ok: true } for a valid token', async () => {
      const prisma = makePrisma();
      prisma.emailVerificationToken.findUnique.mockResolvedValue(makeVerificationToken());
      const svc = makeService(prisma as never);

      const result = await svc.verifyEmail('valid-token-abc');
      expect(result).toEqual({ ok: true });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { emailVerified: true } }),
      );
    });

    it('throws UnauthorizedException for token not found', async () => {
      const prisma = makePrisma();
      prisma.emailVerificationToken.findUnique.mockResolvedValue(null);
      const svc = makeService(prisma as never);

      await expect(svc.verifyEmail('nonexistent-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for already consumed token', async () => {
      const prisma = makePrisma();
      prisma.emailVerificationToken.findUnique.mockResolvedValue(
        makeVerificationToken({ consumedAt: new Date() }),
      );
      const svc = makeService(prisma as never);

      await expect(svc.verifyEmail('valid-token-abc')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for expired token', async () => {
      const prisma = makePrisma();
      prisma.emailVerificationToken.findUnique.mockResolvedValue(
        makeVerificationToken({ expiresAt: new Date(Date.now() - 1000) }),
      );
      const svc = makeService(prisma as never);

      await expect(svc.verifyEmail('expired-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── resendVerification() ──────────────────────────────────────────────────

  describe('resendVerification()', () => {
    it('returns { ok: true } silently when user not found', async () => {
      const prisma = makePrisma(null);
      const svc = makeService(prisma as never);

      const result = await svc.resendVerification('unknown@example.com');
      expect(result).toEqual({ ok: true });
      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });

    it('returns { ok: true } silently when user is already verified (no-op)', async () => {
      const prisma = makePrisma(makeUser({ emailVerified: true }));
      const svc = makeService(prisma as never);

      const result = await svc.resendVerification('test@example.com');
      expect(result).toEqual({ ok: true });
      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });

    it('does not create new token when recent token exists (cooldown)', async () => {
      const prisma = makePrisma(makeUser({ emailVerified: false }));
      prisma.emailVerificationToken.findFirst.mockResolvedValue(makeVerificationToken());
      const svc = makeService(prisma as never);

      const result = await svc.resendVerification('test@example.com');
      expect(result).toEqual({ ok: true });
      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });

    it('creates and sends a new token when no recent token', async () => {
      const mailer = makeMailer();
      const prisma = makePrisma(makeUser({ emailVerified: false }));
      prisma.emailVerificationToken.findFirst.mockResolvedValue(null);
      const svc = new AuthService(prisma as never, makeJwt() as never, makeAudit() as never, mailer as never, makeMetrics() as never);

      const result = await svc.resendVerification('test@example.com');
      expect(result).toEqual({ ok: true });
      expect(prisma.emailVerificationToken.create).toHaveBeenCalled();
      expect(mailer.sendEmailVerificationEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringContaining('verify-email'),
      );
    });
  });

  // ─── changePassword() ───────────────────────────────────────────────────────

  describe('changePassword()', () => {
    it('changes password successfully', async () => {
      const { hashSync } = await import('bcryptjs');
      const currentHash = hashSync('CurrentPass1!', 10);
      const prisma = makePrisma(makeUser({ passwordHash: currentHash }));
      const svc = makeService(prisma as never);

      const result = await svc.changePassword('user-1', 'CurrentPass1!', 'NewPass1!SuperStrong');
      expect(result).toEqual({ ok: true });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mustChangePassword: false }),
        }),
      );
    });

    it('throws UnauthorizedException for wrong current password', async () => {
      const { hashSync } = await import('bcryptjs');
      const currentHash = hashSync('CurrentPass1!', 10);
      const prisma = makePrisma(makeUser({ passwordHash: currentHash }));
      const svc = makeService(prisma as never);

      await expect(svc.changePassword('user-1', 'WrongPass1!', 'NewPass1!SuperStrong')).rejects.toThrow(UnauthorizedException);
    });

    it('throws BadRequestException for weak new password', async () => {
      const { hashSync } = await import('bcryptjs');
      const currentHash = hashSync('CurrentPass1!', 10);
      const prisma = makePrisma(makeUser({ passwordHash: currentHash }));
      const svc = makeService(prisma as never);

      await expect(svc.changePassword('user-1', 'CurrentPass1!', 'weakpassword')).rejects.toThrow(BadRequestException);
    });

    it('invalidates all sessions after password change', async () => {
      const { hashSync } = await import('bcryptjs');
      const currentHash = hashSync('CurrentPass1!', 10);
      const prisma = makePrisma(makeUser({ passwordHash: currentHash }));
      const svc = makeService(prisma as never);

      await svc.changePassword('user-1', 'CurrentPass1!', 'NewPass1!SuperStrong');
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    });
  });

  // ─── updateProfile() ────────────────────────────────────────────────────────

  describe('updateProfile()', () => {
    it('updates displayName and timezone', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(null); // no email conflict
      const svc = makeService(prisma as never);

      const result = await svc.updateProfile('user-1', 'test@example.com', 'Noah Dev', 'Europe/Berlin');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ displayName: 'Noah Dev', timezone: 'Europe/Berlin' }),
        }),
      );
      expect(result).toHaveProperty('id');
    });

    it('throws ConflictException when email is taken by another user', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'other-user', email: 'taken@example.com' });
      const svc = makeService(prisma as never);

      await expect(svc.updateProfile('user-1', 'taken@example.com')).rejects.toThrow(ConflictException);
    });

    it('allows updating own email without conflict', async () => {
      const prisma = makePrisma();
      // findUnique returns a user with the same id (the current user)
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
      const svc = makeService(prisma as never);

      await expect(svc.updateProfile('user-1', 'test@example.com')).resolves.not.toThrow();
    });
  });

  // ─── revokeSession() ────────────────────────────────────────────────────────

  describe('revokeSession()', () => {
    it('revokes the session and returns { ok: true }', async () => {
      const prisma = makePrisma();
      const svc = makeService(prisma as never);

      const result = await svc.revokeSession('user-1', 'session-1');
      expect(result).toEqual({ ok: true });
      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('throws UnauthorizedException when session not found', async () => {
      const prisma = makePrisma();
      prisma.session.findFirst.mockResolvedValue(null);
      const svc = makeService(prisma as never);

      await expect(svc.revokeSession('user-1', 'non-existent')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── revokeAllSessions() ─────────────────────────────────────────────────────

  describe('revokeAllSessions()', () => {
    it('revokes all sessions for the user', async () => {
      const prisma = makePrisma();
      const svc = makeService(prisma as never);

      const result = await svc.revokeAllSessions('user-1');
      expect(result).toEqual({ ok: true });
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }),
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });
  });

  // ─── refresh() ──────────────────────────────────────────────────────────────

  describe('refresh()', () => {
    it('throws UnauthorizedException when no token provided', async () => {
      const svc = makeService();
      await expect(svc.refresh(undefined)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when jwt.verify throws', async () => {
      const jwt = makeJwt();
      jwt.verify.mockImplementation(() => { throw new Error('bad token'); });
      const svc = new AuthService(makePrisma() as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);
      await expect(svc.refresh('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token type is not refresh', async () => {
      const jwt = makeJwt();
      jwt.verify.mockReturnValue({ sub: 'user-1', sid: 'session-1', type: 'access', email: 'test@example.com', role: 'user' });
      const svc = new AuthService(makePrisma() as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);
      await expect(svc.refresh('access-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when session not found', async () => {
      const prisma = makePrisma();
      const jwt = makeJwt();
      jwt.verify.mockReturnValue({ sub: 'user-1', sid: 'session-1', type: 'refresh', email: 'test@example.com', role: 'user' });
      prisma.session.findFirst.mockResolvedValue(null);
      const svc = new AuthService(prisma as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);
      await expect(svc.refresh('any-token')).rejects.toThrow(UnauthorizedException);
    });

    it('returns new tokens when refresh token is valid', async () => {
      const { hashSync } = await import('bcryptjs');
      const tokenStr = 'ValidRefreshToken123!';
      const tokenHash = hashSync(tokenStr, 1);

      const prisma = makePrisma();
      const jwt = makeJwt();
      jwt.verify.mockReturnValue({ sub: 'user-1', sid: 'session-1', type: 'refresh', email: 'test@example.com', role: 'user' });
      jwt.sign.mockReturnValue('new-signed-token');
      prisma.session.findFirst.mockResolvedValue({
        id: 'session-1', userId: 'user-1', refreshTokenHash: tokenHash,
        userAgent: null, ipAddress: null, revokedAt: null, createdAt: new Date(),
      });

      const svc = new AuthService(prisma as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);
      const result = await svc.refresh(tokenStr);

      expect(result).toHaveProperty('accessToken', 'new-signed-token');
      expect(result).toHaveProperty('refreshToken', 'new-signed-token');
      expect(result.user).toMatchObject({ id: 'user-1', email: 'test@example.com' });
    });

    it('throws UnauthorizedException when user is inactive after valid session', async () => {
      const { hashSync } = await import('bcryptjs');
      const tokenStr = 'ValidRefreshToken123!';
      const tokenHash = hashSync(tokenStr, 1);

      const prisma = makePrisma(makeUser({ isActive: false }));
      const jwt = makeJwt();
      jwt.verify.mockReturnValue({ sub: 'user-1', sid: 'session-1', type: 'refresh', email: 'test@example.com', role: 'user' });
      prisma.session.findFirst.mockResolvedValue({
        id: 'session-1', userId: 'user-1', refreshTokenHash: tokenHash,
        userAgent: null, ipAddress: null, revokedAt: null, createdAt: new Date(),
      });

      const svc = new AuthService(prisma as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);
      await expect(svc.refresh(tokenStr)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── getInviteInfo() ────────────────────────────────────────────────────────

  describe('getInviteInfo()', () => {
    it('returns invite info for a valid token', async () => {
      const prisma = makePrisma();
      prisma.inviteToken.findUnique.mockResolvedValue(makeInvite());
      const svc = makeService(prisma as never);

      const result = await svc.getInviteInfo('valid-invite-token');
      expect(result).toMatchObject({ email: 'invited@example.com', role: 'user' });
      expect(result).toHaveProperty('expiresAt');
    });

    it('throws UnauthorizedException when token not found', async () => {
      const prisma = makePrisma();
      prisma.inviteToken.findUnique.mockResolvedValue(null);
      const svc = makeService(prisma as never);
      await expect(svc.getInviteInfo('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when invite already accepted', async () => {
      const prisma = makePrisma();
      prisma.inviteToken.findUnique.mockResolvedValue(makeInvite({ acceptedAt: new Date() }));
      const svc = makeService(prisma as never);
      await expect(svc.getInviteInfo('valid-invite-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when invite expired', async () => {
      const prisma = makePrisma();
      prisma.inviteToken.findUnique.mockResolvedValue(makeInvite({ expiresAt: new Date(Date.now() - 1000) }));
      const svc = makeService(prisma as never);
      await expect(svc.getInviteInfo('valid-invite-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── acceptInvite() ─────────────────────────────────────────────────────────

  describe('acceptInvite()', () => {
    it('creates user and marks invite as accepted', async () => {
      const prisma = makePrisma(null);
      prisma.inviteToken.findUnique.mockResolvedValue(makeInvite());
      const svc = makeService(prisma as never);

      const result = await svc.acceptInvite('valid-invite-token', 'ValidPass1!Strong');
      expect(result).toMatchObject({ email: 'invited@example.com', role: 'user' });
      expect(prisma.inviteToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'invite-1' }, data: expect.objectContaining({ acceptedAt: expect.any(Date) }) }),
      );
    });

    it('throws BadRequestException for weak password', async () => {
      const prisma = makePrisma();
      prisma.inviteToken.findUnique.mockResolvedValue(makeInvite());
      const svc = makeService(prisma as never);
      await expect(svc.acceptInvite('valid-invite-token', 'weak')).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException when invite not found', async () => {
      const prisma = makePrisma();
      prisma.inviteToken.findUnique.mockResolvedValue(null);
      const svc = makeService(prisma as never);
      await expect(svc.acceptInvite('bad-token', 'ValidPass1!Strong')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when invite already accepted', async () => {
      const prisma = makePrisma();
      prisma.inviteToken.findUnique.mockResolvedValue(makeInvite({ acceptedAt: new Date() }));
      const svc = makeService(prisma as never);
      await expect(svc.acceptInvite('valid-invite-token', 'ValidPass1!Strong')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when invite expired', async () => {
      const prisma = makePrisma();
      prisma.inviteToken.findUnique.mockResolvedValue(makeInvite({ expiresAt: new Date(Date.now() - 1000) }));
      const svc = makeService(prisma as never);
      await expect(svc.acceptInvite('valid-invite-token', 'ValidPass1!Strong')).rejects.toThrow(UnauthorizedException);
    });

    it('throws ConflictException when user already exists', async () => {
      const prisma = makePrisma(makeUser({ email: 'invited@example.com' }));
      prisma.inviteToken.findUnique.mockResolvedValue(makeInvite());
      const svc = makeService(prisma as never);
      await expect(svc.acceptInvite('valid-invite-token', 'ValidPass1!Strong')).rejects.toThrow(ConflictException);
    });
  });

  // ─── requestPasswordReset() ─────────────────────────────────────────────────

  describe('requestPasswordReset()', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.test.example.com';
      process.env.SMTP_USER = 'test-user';
      process.env.SMTP_PASS = 'test-pass';
    });

    afterEach(() => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
    });

    it('throws ServiceUnavailableException when mail is not configured', async () => {
      delete process.env.SMTP_HOST;
      const svc = makeService();
      await expect(svc.requestPasswordReset('test@example.com')).rejects.toThrow(ServiceUnavailableException);
    });

    it('returns { ok: true } silently when user does not exist', async () => {
      const prisma = makePrisma(null);
      const svc = makeService(prisma as never);
      const result = await svc.requestPasswordReset('unknown@example.com');
      expect(result).toEqual({ ok: true });
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('creates reset token and sends email for existing user', async () => {
      const mailer = makeMailer();
      const prisma = makePrisma();
      const svc = new AuthService(prisma as never, makeJwt() as never, makeAudit() as never, mailer as never, makeMetrics() as never);

      const result = await svc.requestPasswordReset('test@example.com');
      expect(result).toEqual({ ok: true });
      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
      expect(mailer.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringContaining('reset='),
      );
    });
  });

  // ─── resetPassword() ────────────────────────────────────────────────────────

  describe('resetPassword()', () => {
    it('throws BadRequestException for weak new password (checked before token lookup)', async () => {
      const svc = makeService();
      await expect(svc.resetPassword('any-token', 'weak')).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException when token not found', async () => {
      const prisma = makePrisma();
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      const svc = makeService(prisma as never);
      await expect(svc.resetPassword('bad-token', 'NewValidPass1!Strong')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token already consumed', async () => {
      const prisma = makePrisma();
      prisma.passwordResetToken.findUnique.mockResolvedValue(makeResetToken({ consumedAt: new Date() }));
      const svc = makeService(prisma as never);
      await expect(svc.resetPassword('valid-reset-token', 'NewValidPass1!Strong')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token expired', async () => {
      const prisma = makePrisma();
      prisma.passwordResetToken.findUnique.mockResolvedValue(makeResetToken({ expiresAt: new Date(Date.now() - 1000) }));
      const svc = makeService(prisma as never);
      await expect(svc.resetPassword('valid-reset-token', 'NewValidPass1!Strong')).rejects.toThrow(UnauthorizedException);
    });

    it('updates password and revokes all sessions on success', async () => {
      const prisma = makePrisma();
      prisma.passwordResetToken.findUnique.mockResolvedValue(makeResetToken());
      const svc = makeService(prisma as never);

      const result = await svc.resetPassword('valid-reset-token', 'NewValidPass1!Strong');
      expect(result).toEqual({ ok: true });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ mustChangePassword: false }) }),
      );
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }), data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
      );
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rst-1' }, data: expect.objectContaining({ consumedAt: expect.any(Date) }) }),
      );
    });
  });

  // ─── listSessions() ─────────────────────────────────────────────────────────

  describe('listSessions()', () => {
    it('returns mapped active sessions', async () => {
      const now = new Date();
      const prisma = makePrisma();
      prisma.session.findMany.mockResolvedValue([
        { id: 's-1', userAgent: 'Chrome/120', ipAddress: '1.2.3.4', revokedAt: null, createdAt: now },
        { id: 's-2', userAgent: 'Firefox/110', ipAddress: '5.6.7.8', revokedAt: null, createdAt: now },
      ]);
      const svc = makeService(prisma as never);

      const result = await svc.listSessions('user-1');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 's-1', userAgent: 'Chrome/120', ipAddress: '1.2.3.4', revokedAt: null });
      expect(result[0]).toHaveProperty('createdAt', now.toISOString());
    });

    it('returns empty array when no active sessions', async () => {
      const prisma = makePrisma();
      prisma.session.findMany.mockResolvedValue([]);
      const svc = makeService(prisma as never);

      const result = await svc.listSessions('user-1');
      expect(result).toEqual([]);
    });
  });

  // ─── revokeSessionByToken() ──────────────────────────────────────────────────

  describe('revokeSessionByToken()', () => {
    it('revokes the session when valid access token provided', async () => {
      const prisma = makePrisma();
      const jwt = makeJwt();
      jwt.verify.mockReturnValue({ sub: 'user-1', sid: 'session-1', type: 'access' });
      const svc = new AuthService(prisma as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);

      await svc.revokeSessionByToken('valid-access-token');
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1', userId: 'user-1', revokedAt: null },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('does nothing when token is invalid (no throw)', async () => {
      const prisma = makePrisma();
      const jwt = makeJwt();
      jwt.verify.mockImplementation(() => { throw new Error('invalid'); });
      const svc = new AuthService(prisma as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);

      await expect(svc.revokeSessionByToken('bad-token')).resolves.toBeUndefined();
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });

    it('does nothing when token type is not access', async () => {
      const prisma = makePrisma();
      const jwt = makeJwt();
      jwt.verify.mockReturnValue({ sub: 'user-1', sid: 'session-1', type: 'refresh' });
      const svc = new AuthService(prisma as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);

      await svc.revokeSessionByToken('refresh-token');
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── setup2FA() ─────────────────────────────────────────────────────────────

  describe('setup2FA()', () => {
    it('returns secret, otpAuthUrl, and qrCodeUrl for valid user', async () => {
      const prisma = makePrisma();
      const svc = makeService(prisma as never);

      const result = await svc.setup2FA('user-1');
      expect(result).toHaveProperty('secret', 'MOCK_TOTP_SECRET');
      expect(result).toHaveProperty('otpAuthUrl');
      expect(result).toHaveProperty('qrCodeUrl');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' }, data: { totpSecret: 'MOCK_TOTP_SECRET' } }),
      );
    });

    it('throws UnauthorizedException when user not found', async () => {
      const prisma = makePrisma(null);
      const svc = makeService(prisma as never);
      await expect(svc.setup2FA('nonexistent')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── verifyAndEnable2FA() ───────────────────────────────────────────────────

  describe('verifyAndEnable2FA()', () => {
    it('enables 2FA and returns 10 recovery codes on valid TOTP code', async () => {
      const prisma = makePrisma(makeUser({ totpSecret: 'MOCK_TOTP_SECRET', totpEnabled: false }));
      const svc = makeService(prisma as never);

      const result = await svc.verifyAndEnable2FA('user-1', '123456');
      expect(result).toHaveProperty('recoveryCodes');
      expect(result.recoveryCodes).toHaveLength(10);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ totpEnabled: true }) }),
      );
    });

    it('throws BadRequestException when 2FA setup not started (no totpSecret)', async () => {
      const prisma = makePrisma(makeUser({ totpSecret: null, totpEnabled: false }));
      const svc = makeService(prisma as never);
      await expect(svc.verifyAndEnable2FA('user-1', '123456')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when 2FA already enabled', async () => {
      const prisma = makePrisma(makeUser({ totpSecret: 'MOCK_TOTP_SECRET', totpEnabled: true }));
      const svc = makeService(prisma as never);
      await expect(svc.verifyAndEnable2FA('user-1', '123456')).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException for invalid TOTP code', async () => {
      const { verify } = await import('otplib');
      vi.mocked(verify).mockReturnValueOnce(false);

      const prisma = makePrisma(makeUser({ totpSecret: 'MOCK_TOTP_SECRET', totpEnabled: false }));
      const svc = makeService(prisma as never);
      await expect(svc.verifyAndEnable2FA('user-1', 'wrong')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── disable2FA() ───────────────────────────────────────────────────────────

  describe('disable2FA()', () => {
    it('disables 2FA when password and TOTP code are valid', async () => {
      const { hashSync } = await import('bcryptjs');
      const passwordHash = hashSync('ValidPass1!Strong', 1);
      const prisma = makePrisma(makeUser({ totpEnabled: true, totpSecret: 'MOCK_TOTP_SECRET', passwordHash }));
      const svc = makeService(prisma as never);

      const result = await svc.disable2FA('user-1', 'ValidPass1!Strong', '123456');
      expect(result).toEqual({ ok: true });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totpEnabled: false, totpSecret: null, totpRecoveryCodes: null }),
        }),
      );
    });

    it('throws UnauthorizedException when user not found', async () => {
      const prisma = makePrisma(null);
      const svc = makeService(prisma as never);
      await expect(svc.disable2FA('user-1', 'ValidPass1!Strong', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('throws BadRequestException when 2FA is not enabled', async () => {
      const prisma = makePrisma(makeUser({ totpEnabled: false }));
      const svc = makeService(prisma as never);
      await expect(svc.disable2FA('user-1', 'ValidPass1!Strong', '123456')).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const { hashSync } = await import('bcryptjs');
      const passwordHash = hashSync('CorrectPass1!Strong', 1);
      const prisma = makePrisma(makeUser({ totpEnabled: true, totpSecret: 'MOCK_TOTP_SECRET', passwordHash }));
      const svc = makeService(prisma as never);
      await expect(svc.disable2FA('user-1', 'WrongPass1!Bad', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for invalid TOTP code and no recovery code', async () => {
      const { hashSync } = await import('bcryptjs');
      const { verify } = await import('otplib');
      vi.mocked(verify).mockReturnValueOnce(false);

      const passwordHash = hashSync('ValidPass1!Strong', 1);
      const prisma = makePrisma(makeUser({ totpEnabled: true, totpSecret: 'MOCK_TOTP_SECRET', passwordHash, totpRecoveryCodes: null }));
      const svc = makeService(prisma as never);
      await expect(svc.disable2FA('user-1', 'ValidPass1!Strong', 'bad-code')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── regenerateRecoveryCodes() ──────────────────────────────────────────────

  describe('regenerateRecoveryCodes()', () => {
    it('regenerates and returns 10 new recovery codes', async () => {
      const prisma = makePrisma(makeUser({ totpEnabled: true, totpSecret: 'MOCK_TOTP_SECRET' }));
      const svc = makeService(prisma as never);

      const result = await svc.regenerateRecoveryCodes('user-1', '123456');
      expect(result).toHaveProperty('recoveryCodes');
      expect(result.recoveryCodes).toHaveLength(10);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ totpRecoveryCodes: expect.any(String) }) }),
      );
    });

    it('throws BadRequestException when 2FA is not enabled', async () => {
      const prisma = makePrisma(makeUser({ totpEnabled: false }));
      const svc = makeService(prisma as never);
      await expect(svc.regenerateRecoveryCodes('user-1', '123456')).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException for invalid TOTP code', async () => {
      const { verify } = await import('otplib');
      vi.mocked(verify).mockReturnValueOnce(false);

      const prisma = makePrisma(makeUser({ totpEnabled: true, totpSecret: 'MOCK_TOTP_SECRET' }));
      const svc = makeService(prisma as never);
      await expect(svc.regenerateRecoveryCodes('user-1', 'wrong')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── verifyTotpLogin() ──────────────────────────────────────────────────────

  describe('verifyTotpLogin()', () => {
    it('throws UnauthorizedException for invalid/expired temp token', async () => {
      const jwt = makeJwt();
      jwt.verify.mockImplementation(() => { throw new Error('expired'); });
      const svc = new AuthService(makePrisma() as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);
      await expect(svc.verifyTotpLogin('bad-temp', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong token type', async () => {
      const jwt = makeJwt();
      jwt.verify.mockReturnValue({ sub: 'user-1', type: 'access' });
      const svc = new AuthService(makePrisma() as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);
      await expect(svc.verifyTotpLogin('access-token', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for invalid TOTP code and no recovery code', async () => {
      const { verify } = await import('otplib');
      vi.mocked(verify).mockReturnValueOnce(false);

      const jwt = makeJwt();
      jwt.verify.mockReturnValue({ sub: 'user-1', type: 'totp-pending' });
      const prisma = makePrisma(makeUser({ totpEnabled: true, totpSecret: 'MOCK_TOTP_SECRET', totpRecoveryCodes: null }));
      const svc = new AuthService(prisma as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);
      await expect(svc.verifyTotpLogin('valid-temp', 'bad-code')).rejects.toThrow(UnauthorizedException);
    });

    it('returns tokens on valid TOTP code', async () => {
      const jwt = makeJwt();
      jwt.verify.mockReturnValue({ sub: 'user-1', type: 'totp-pending' });
      jwt.sign.mockReturnValue('new-token');
      const prisma = makePrisma(makeUser({ totpEnabled: true, totpSecret: 'MOCK_TOTP_SECRET' }));
      prisma.session.create.mockResolvedValue({ id: 'session-1' });
      const svc = new AuthService(prisma as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);

      const result = await svc.verifyTotpLogin('valid-temp', '123456');
      expect(result).toHaveProperty('accessToken', 'new-token');
      expect(result).toHaveProperty('refreshToken', 'new-token');
      expect(result.user).toMatchObject({ id: 'user-1', email: 'test@example.com' });
    });
  });

  // ─── getActiveUserById() ────────────────────────────────────────────────────

  describe('getActiveUserById()', () => {
    it('returns user info when user is active', async () => {
      const svc = makeService();
      const result = await svc.getActiveUserById('user-1');
      expect(result).toMatchObject({ id: 'user-1', email: 'test@example.com', role: 'user' });
      expect(result).toHaveProperty('totpEnabled', false);
    });

    it('returns null when user not found', async () => {
      const prisma = makePrisma(null);
      const svc = makeService(prisma as never);
      const result = await svc.getActiveUserById('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null when user is inactive', async () => {
      const prisma = makePrisma(makeUser({ isActive: false }));
      const svc = makeService(prisma as never);
      const result = await svc.getActiveUserById('user-1');
      expect(result).toBeNull();
    });
  });

  // ─── getUserByAccessToken() ─────────────────────────────────────────────────

  describe('getUserByAccessToken()', () => {
    it('returns null when no token provided', async () => {
      const svc = makeService();
      const result = await svc.getUserByAccessToken(undefined);
      expect(result).toBeNull();
    });

    it('returns null when jwt.verify throws', async () => {
      const jwt = makeJwt();
      jwt.verify.mockImplementation(() => { throw new Error('invalid'); });
      const svc = new AuthService(makePrisma() as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);
      const result = await svc.getUserByAccessToken('bad-token');
      expect(result).toBeNull();
    });

    it('returns null when token type is not access', async () => {
      const jwt = makeJwt();
      jwt.verify.mockReturnValue({ sub: 'user-1', sid: 'session-1', type: 'refresh', email: 'test@example.com', role: 'user' });
      const svc = new AuthService(makePrisma() as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);
      const result = await svc.getUserByAccessToken('refresh-token');
      expect(result).toBeNull();
    });

    it('returns null when session not found', async () => {
      const jwt = makeJwt();
      jwt.verify.mockReturnValue({ sub: 'user-1', sid: 'session-1', type: 'access', email: 'test@example.com', role: 'user' });
      const prisma = makePrisma();
      prisma.session.findFirst.mockResolvedValue(null);
      const svc = new AuthService(prisma as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);
      const result = await svc.getUserByAccessToken('valid-token');
      expect(result).toBeNull();
    });

    it('returns user info when token and session are valid', async () => {
      const jwt = makeJwt();
      jwt.verify.mockReturnValue({ sub: 'user-1', sid: 'session-1', type: 'access', email: 'test@example.com', role: 'user' });
      const prisma = makePrisma();
      prisma.session.findFirst.mockResolvedValue({
        id: 'session-1', userId: 'user-1', refreshTokenHash: 'hash',
        userAgent: null, ipAddress: null, revokedAt: null,
        createdAt: new Date(), // recent — not expired
      });
      const svc = new AuthService(prisma as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);

      const result = await svc.getUserByAccessToken('valid-token');
      expect(result).toMatchObject({ id: 'user-1', email: 'test@example.com', role: 'user', sessionId: 'session-1' });
    });

    it('returns null and deletes session when session is expired', async () => {
      const jwt = makeJwt();
      jwt.verify.mockReturnValue({ sub: 'user-1', sid: 'session-1', type: 'access', email: 'test@example.com', role: 'user' });
      const prisma = makePrisma();
      // createdAt far in the past — older than 30d refresh TTL
      prisma.session.findFirst.mockResolvedValue({
        id: 'session-1', userId: 'user-1', refreshTokenHash: 'hash',
        userAgent: null, ipAddress: null, revokedAt: null,
        createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      });
      const svc = new AuthService(prisma as never, jwt as never, makeAudit() as never, makeMailer() as never, makeMetrics() as never);

      const result = await svc.getUserByAccessToken('valid-token');
      expect(result).toBeNull();
      expect(prisma.session.delete).toBeDefined();
    });
  });
});

// ─── getUserAuditLog() ───────────────────────────────────────────────────────

describe('getUserAuditLog()', () => {
  it('returns audit log entries for user', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 'al-1', action: 'monitor.create', createdAt: new Date(), metaJson: { monitorId: 'm-1' } },
      { id: 'al-2', action: 'user.login', createdAt: new Date(), metaJson: {} },
    ]);
    const svc = makeService(prisma as never);

    const result = await svc.getUserAuditLog('user-1');
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { actorUserId: 'user-1' },
    }));
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'al-1', action: 'monitor.create' });
  });

  it('caps limit at 500', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue([]);
    const svc = makeService(prisma as never);

    await svc.getUserAuditLog('user-1', 9999);
    const call = (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { take: number };
    expect(call.take).toBe(500);
  });
});

// ─── exportUserAuditLog() ────────────────────────────────────────────────────

describe('exportUserAuditLog()', () => {
  it('exports as JSON', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 'al-1', action: 'user.login', createdAt: new Date('2026-01-01'), metaJson: {} },
    ]);
    const svc = makeService(prisma as never);

    const result = await svc.exportUserAuditLog('user-1', 'json');

    expect(result.contentType).toBe('application/json');
    expect(result.filename).toMatch(/\.json$/);
    const parsed = JSON.parse(result.data) as unknown[];
    expect(parsed).toHaveLength(1);
  });

  it('exports as CSV', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 'al-1', action: 'monitor.create', createdAt: new Date('2026-01-01'), metaJson: { key: 'value' } },
    ]);
    const svc = makeService(prisma as never);

    const result = await svc.exportUserAuditLog('user-1', 'csv');

    expect(result.contentType).toBe('text/csv');
    expect(result.filename).toMatch(/\.csv$/);
    expect(result.data).toContain('id,action,createdAt,meta');
    expect(result.data).toContain('monitor.create');
  });
});
