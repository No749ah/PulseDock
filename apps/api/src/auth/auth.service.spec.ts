import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

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
    displayName: null,
    timezone: 'UTC',
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
});
