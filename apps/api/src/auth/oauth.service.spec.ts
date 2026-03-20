import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

// Minimal mock factory — only the OAuth-related parts
function makeAuthService(overrides: Record<string, unknown> = {}) {
  const prisma: Record<string, unknown> = {
    oAuthAccount: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    ...overrides,
  };

  const jwt = { sign: vi.fn().mockReturnValue('tok') } as unknown;
  const audit = { log: vi.fn() } as unknown;
  const metrics = { inc: vi.fn() } as unknown;

  // Instantiate via prototype to bypass full constructor
  const svc = Object.create(AuthService.prototype) as AuthService;
  Object.assign(svc, { prisma, jwt, audit, metrics, mailer: null, logger: { warn: vi.fn(), log: vi.fn() } });
  return { svc, prisma };
}

describe('AuthService – OAuth', () => {
  describe('getOAuthRedirectUrl()', () => {
    it('throws NotFoundException when GITHUB_CLIENT_ID is not set', () => {
      const { svc } = makeAuthService();
      delete process.env.GITHUB_CLIENT_ID;
      expect(() => svc.getOAuthRedirectUrl('github')).toThrow(NotFoundException);
    });

    it('throws NotFoundException when GOOGLE_CLIENT_ID is not set', () => {
      const { svc } = makeAuthService();
      delete process.env.GOOGLE_CLIENT_ID;
      expect(() => svc.getOAuthRedirectUrl('google')).toThrow(NotFoundException);
    });

    it('returns GitHub authorization URL when GITHUB_CLIENT_ID is set', () => {
      const { svc } = makeAuthService();
      process.env.GITHUB_CLIENT_ID = 'test-gh-client';
      const url = svc.getOAuthRedirectUrl('github');
      expect(url).toContain('github.com/login/oauth/authorize');
      expect(url).toContain('test-gh-client');
      delete process.env.GITHUB_CLIENT_ID;
    });

    it('returns Google authorization URL when GOOGLE_CLIENT_ID is set', () => {
      const { svc } = makeAuthService();
      process.env.GOOGLE_CLIENT_ID = 'test-goog-client';
      const url = svc.getOAuthRedirectUrl('google');
      expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('test-goog-client');
      delete process.env.GOOGLE_CLIENT_ID;
    });
  });

  describe('findOrCreateOAuthUser()', () => {
    it('returns existing user when OAuthAccount is found', async () => {
      const existingUser = { id: 'u1', email: 'a@b.com', role: 'user' };
      const { svc, prisma } = makeAuthService();
      (prisma.oAuthAccount as { findUnique: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValue({ user: existingUser });

      const result = await svc.findOrCreateOAuthUser('github', 'gh-123', 'a@b.com', 'Alice');
      expect(result).toEqual(existingUser);
      expect((prisma.oAuthAccount as { findUnique: ReturnType<typeof vi.fn> }).findUnique).toHaveBeenCalledWith({
        where: { provider_providerId: { provider: 'github', providerId: 'gh-123' } },
        include: { user: true },
      });
    });

    it('links existing user by email when no OAuthAccount exists', async () => {
      const existingUser = { id: 'u2', email: 'b@c.com', role: 'user' };
      const { svc, prisma } = makeAuthService();
      (prisma.oAuthAccount as { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValue(null);
      (prisma.user as { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValue(existingUser);
      (prisma.oAuthAccount as { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }).create.mockResolvedValue({});

      const result = await svc.findOrCreateOAuthUser('google', 'goog-456', 'b@c.com', 'Bob');
      expect(result).toEqual(existingUser);
      expect((prisma.oAuthAccount as { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledWith({
        data: { userId: 'u2', provider: 'google', providerId: 'goog-456' },
      });
    });

    it('creates new user when neither OAuthAccount nor email match exists', async () => {
      const newUser = { id: 'u3', email: 'new@user.com', role: 'user' };
      const { svc, prisma } = makeAuthService();
      (prisma.oAuthAccount as { findUnique: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValue(null);
      (prisma.user as { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValue(null);
      (prisma.user as { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }).create.mockResolvedValue(newUser);
      const audit = { log: vi.fn() };
      Object.assign(svc, { audit });

      const result = await svc.findOrCreateOAuthUser('github', 'gh-789', 'new@user.com', 'New User');
      expect(result).toEqual(newUser);
      expect((prisma.user as { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@user.com',
          passwordHash: null,
          emailVerified: true,
        }),
      });
    });
  });
});
