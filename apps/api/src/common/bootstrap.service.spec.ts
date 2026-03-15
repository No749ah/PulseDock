import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BootstrapService } from './bootstrap.service';

function makeService(userCount: number, createFn = vi.fn().mockResolvedValue({})) {
  const prisma = {
    user: {
      count: vi.fn().mockResolvedValue(userCount),
      create: createFn,
    },
  };
  return {
    service: new BootstrapService(prisma as never),
    prisma,
    createFn,
  };
}

describe('BootstrapService', () => {
  describe('onModuleInit()', () => {
    it('does NOT create a user when users already exist', async () => {
      const { service, createFn } = makeService(3);
      await service.onModuleInit();
      expect(createFn).not.toHaveBeenCalled();
    });

    it('creates a default admin user when no users exist', async () => {
      const { service, createFn } = makeService(0);
      await service.onModuleInit();
      expect(createFn).toHaveBeenCalledOnce();

      const callArg = createFn.mock.calls[0][0] as {
        data: { email: string; role: string; isActive: boolean; mustChangePassword: boolean };
      };
      expect(callArg.data.email).toBe('admin@pulsedock.dev');
      expect(callArg.data.role).toBe('admin');
      expect(callArg.data.isActive).toBe(true);
      expect(callArg.data.mustChangePassword).toBe(true);
    });

    it('uses DEFAULT_ADMIN_EMAIL env var when set', async () => {
      const origEmail = process.env.DEFAULT_ADMIN_EMAIL;
      process.env.DEFAULT_ADMIN_EMAIL = 'custom@example.com';
      try {
        const { service, createFn } = makeService(0);
        await service.onModuleInit();
        const callArg = createFn.mock.calls[0][0] as { data: { email: string } };
        expect(callArg.data.email).toBe('custom@example.com');
      } finally {
        if (origEmail === undefined) delete process.env.DEFAULT_ADMIN_EMAIL;
        else process.env.DEFAULT_ADMIN_EMAIL = origEmail;
      }
    });

    it('lowercases the admin email', async () => {
      const origEmail = process.env.DEFAULT_ADMIN_EMAIL;
      process.env.DEFAULT_ADMIN_EMAIL = 'ADMIN@PulseDock.DEV';
      try {
        const { service, createFn } = makeService(0);
        await service.onModuleInit();
        const callArg = createFn.mock.calls[0][0] as { data: { email: string } };
        expect(callArg.data.email).toBe('admin@pulsedock.dev');
      } finally {
        if (origEmail === undefined) delete process.env.DEFAULT_ADMIN_EMAIL;
        else process.env.DEFAULT_ADMIN_EMAIL = origEmail;
      }
    });

    it('uses DEFAULT_ADMIN_PASSWORD env var when set', async () => {
      const origPw = process.env.DEFAULT_ADMIN_PASSWORD;
      process.env.DEFAULT_ADMIN_PASSWORD = 'supersecret123!';
      try {
        const { service, createFn } = makeService(0);
        await service.onModuleInit();
        // Password is hashed — we only verify that create was called and passwordHash is a string
        const callArg = createFn.mock.calls[0][0] as { data: { passwordHash: string } };
        expect(typeof callArg.data.passwordHash).toBe('string');
        expect(callArg.data.passwordHash.startsWith('$2')).toBe(true); // bcrypt hash
      } finally {
        if (origPw === undefined) delete process.env.DEFAULT_ADMIN_PASSWORD;
        else process.env.DEFAULT_ADMIN_PASSWORD = origPw;
      }
    });

    it('hashes the password (never stores plaintext)', async () => {
      const { service, createFn } = makeService(0);
      await service.onModuleInit();
      const callArg = createFn.mock.calls[0][0] as { data: { passwordHash: string } };
      expect(callArg.data.passwordHash).not.toBe('admin123');
      expect(callArg.data.passwordHash.startsWith('$2')).toBe(true);
    });
  });
});
