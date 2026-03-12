import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
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
      update: vi.fn().mockResolvedValue({}),
    },
    session: {
      create: vi.fn().mockResolvedValue({ id: 'session-1' }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({}),
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
  return { sendPasswordReset: vi.fn().mockResolvedValue(undefined) };
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
    it('throws UnauthorizedException for short password', async () => {
      // Temporarily enable public registration
      const oldEnv = process.env.ALLOW_PUBLIC_REGISTRATION;
      process.env.ALLOW_PUBLIC_REGISTRATION = 'true';

      const prisma = makePrisma(null); // no existing user
      const svc = makeService(prisma as never);

      await expect(svc.register('new@example.com', 'short')).rejects.toThrow(UnauthorizedException);

      process.env.ALLOW_PUBLIC_REGISTRATION = oldEnv;
    });

    it('throws UnauthorizedException for password without uppercase', async () => {
      const oldEnv = process.env.ALLOW_PUBLIC_REGISTRATION;
      process.env.ALLOW_PUBLIC_REGISTRATION = 'true';

      const prisma = makePrisma(null);
      const svc = makeService(prisma as never);

      await expect(svc.register('new@example.com', 'lowercase123!')).rejects.toThrow(UnauthorizedException);

      process.env.ALLOW_PUBLIC_REGISTRATION = oldEnv;
    });
  });

  describe('register()', () => {
    it('throws UnauthorizedException when public registration disabled', async () => {
      const oldEnv = process.env.ALLOW_PUBLIC_REGISTRATION;
      process.env.ALLOW_PUBLIC_REGISTRATION = 'false';

      const svc = makeService();
      await expect(svc.register('new@example.com', 'ValidPass1!')).rejects.toThrow(UnauthorizedException);

      process.env.ALLOW_PUBLIC_REGISTRATION = oldEnv;
    });

    it('throws ConflictException if email already exists', async () => {
      const oldEnv = process.env.ALLOW_PUBLIC_REGISTRATION;
      process.env.ALLOW_PUBLIC_REGISTRATION = 'true';

      // findUnique returns an existing user → conflict
      const prisma = makePrisma(makeUser());
      const svc = makeService(prisma as never);

      await expect(svc.register('test@example.com', 'ValidPass1!Pass')).rejects.toThrow(ConflictException);

      process.env.ALLOW_PUBLIC_REGISTRATION = oldEnv;
    });

    it('creates user and returns id/email/role when valid', async () => {
      const oldEnv = process.env.ALLOW_PUBLIC_REGISTRATION;
      process.env.ALLOW_PUBLIC_REGISTRATION = 'true';

      const prisma = makePrisma(null); // no existing user
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
      // bcrypt hash for something other than the test password
      const user = makeUser({ passwordHash: '$2a$10$invalidhashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
      const prisma = makePrisma(user);
      const svc = makeService(prisma as never);

      await expect(svc.login('test@example.com', 'WrongPassword1!')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for locked account', async () => {
      const user = makeUser({ lockedUntil: new Date(Date.now() + 60_000) }); // locked for 1 min
      const prisma = makePrisma(user);
      const svc = makeService(prisma as never);

      await expect(svc.login('test@example.com', 'ValidPass1!')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for disabled user', async () => {
      // Use a real bcrypt hash so password check passes but isActive=false
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
});
