import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AdminController } from './admin.controller';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'alice@example.com',
    role: 'user',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    passwordHash: 'hash',
    emailVerified: true,
    displayName: null,
    timezone: 'UTC',
    ...overrides,
  };
}

function makeAuditLog(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    action: 'admin.user.set_role',
    actorUserId: 'admin-1',
    targetUserId: 'user-1',
    metaJson: { role: 'admin' },
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeResetToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reset-1',
    email: 'alice@example.com',
    token: 'abc123',
    consumedAt: null,
    expiresAt: new Date(Date.now() + 3600 * 1000),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makePrisma(opts: {
  user?: ReturnType<typeof makeUser> | null;
  users?: ReturnType<typeof makeUser>[];
  auditLogs?: ReturnType<typeof makeAuditLog>[];
  resetToken?: ReturnType<typeof makeResetToken> | null;
  counts?: number[];
} = {}) {
  const user = opts.user !== undefined ? opts.user : makeUser();
  const users = opts.users ?? [makeUser()];
  const auditLogs = opts.auditLogs ?? [makeAuditLog()];
  const resetToken = opts.resetToken !== undefined ? opts.resetToken : makeResetToken();
  const counts = opts.counts ?? [10, 8, 20, 15, 100, 5];

  let countIdx = 0;

  return {
    user: {
      findMany: vi.fn().mockResolvedValue(users),
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...makeUser(), ...data }),
      ),
      count: vi.fn().mockImplementation(() => Promise.resolve(counts[countIdx++] ?? 0)),
    },
    session: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: {
      findMany: vi.fn().mockResolvedValue(auditLogs),
    },
    passwordResetToken: {
      findMany: vi.fn().mockResolvedValue(resetToken ? [resetToken] : []),
      findUnique: vi.fn().mockResolvedValue(resetToken),
      update: vi.fn().mockResolvedValue({ ...makeResetToken(), consumedAt: new Date() }),
    },
    monitor: {
      count: vi.fn().mockResolvedValue(10),
    },
    monitorRun: {
      count: vi.fn().mockResolvedValue(50),
    },
  };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function makeController(opts: Parameters<typeof makePrisma>[0] = {}) {
  const prisma = makePrisma(opts);
  const audit = makeAudit();
  const controller = new AdminController(prisma as never, audit as never, { listPlans: vi.fn().mockResolvedValue([]), setUserPlan: vi.fn().mockResolvedValue({ userId: 'u', planName: 'COMMUNITY' }) } as never);
  return { controller, prisma, audit };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('AdminController', () => {
  // ── users() ────────────────────────────────────────────────────────────────

  describe('users()', () => {
    it('returns all users mapped to safe shape', async () => {
      const { controller, prisma } = makeController({ users: [makeUser(), makeUser({ id: 'user-2', email: 'bob@example.com' })] });
      const result = await controller.users();
      expect(prisma.user.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'asc' } });
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('email');
      expect(result[0]).not.toHaveProperty('passwordHash');
    });

    it('returns empty array when no users exist', async () => {
      const { controller } = makeController({ users: [] });
      const result = await controller.users();
      expect(result).toEqual([]);
    });
  });

  // ── setRole() ──────────────────────────────────────────────────────────────

  describe('setRole()', () => {
    it('updates user role and logs audit', async () => {
      const { controller, prisma, audit } = makeController();
      const req = { user: { id: 'admin-1' } };
      const result = await controller.setRole(req, { userId: 'user-1', role: 'admin' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: 'admin' },
      });
      expect(audit.log).toHaveBeenCalledWith('admin.user.set_role', 'admin-1', 'user-1', { role: 'admin' });
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when user not found', async () => {
      const { controller } = makeController({ user: null });
      const req = { user: { id: 'admin-1' } };
      await expect(controller.setRole(req, { userId: 'missing', role: 'admin' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── updateUser() ───────────────────────────────────────────────────────────

  describe('updateUser()', () => {
    it('updates user fields and returns updated user', async () => {
      const { controller, prisma } = makeController();
      const req = { user: { id: 'admin-1' } };
      const result = await controller.updateUser(req, {
        userId: 'user-1',
        email: 'new@example.com',
        role: 'admin',
        isActive: true,
      });
      expect(prisma.user.update).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
    });

    it('throws NotFoundException when user not found', async () => {
      const { controller } = makeController({ user: null });
      const req = { user: { id: 'admin-1' } };
      await expect(
        controller.updateUser(req, { userId: 'missing', email: 'x@x.com' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes sessions when setting isActive=false', async () => {
      const { controller, prisma } = makeController();
      const req = { user: { id: 'admin-1' } };
      await controller.updateUser(req, { userId: 'user-1', isActive: false });
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    });

    it('does not delete sessions when isActive=true', async () => {
      const { controller, prisma } = makeController();
      const req = { user: { id: 'admin-1' } };
      await controller.updateUser(req, { userId: 'user-1', isActive: true });
      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    });

    it('falls back to user.email when body.email is not provided', async () => {
      const { controller, prisma } = makeController();
      const req = { user: { id: 'admin-1' } };
      await controller.updateUser(req, { userId: 'user-1', role: 'admin' }); // no email
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'alice@example.com' }), // user.email fallback
        }),
      );
    });
  });

  // ── setStatus() ────────────────────────────────────────────────────────────

  describe('setStatus()', () => {
    it('disables user and revokes sessions', async () => {
      const { controller, prisma } = makeController();
      const req = { user: { id: 'admin-1' } };
      await controller.setStatus(req, { userId: 'user-1', isActive: false });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isActive: false },
      });
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    });

    it('enables user without revoking sessions', async () => {
      const { controller, prisma } = makeController();
      const req = { user: { id: 'admin-1' } };
      await controller.setStatus(req, { userId: 'user-1', isActive: true });
      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when user not found', async () => {
      const { controller } = makeController({ user: null });
      const req = { user: { id: 'admin-1' } };
      await expect(
        controller.setStatus(req, { userId: 'missing', isActive: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── auditLogs() ────────────────────────────────────────────────────────────

  describe('auditLogs()', () => {
    it('returns audit logs mapped to safe shape', async () => {
      const { controller, prisma } = makeController();
      const result = await controller.auditLogs();
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('action');
      expect(result[0]).toHaveProperty('createdAt');
    });

    it('returns empty array when no logs', async () => {
      const { controller } = makeController({ auditLogs: [] });
      const result = await controller.auditLogs();
      expect(result).toEqual([]);
    });

    it('falls back to {} when log metaJson is null', async () => {
      const { controller } = makeController({ auditLogs: [makeAuditLog({ metaJson: null })] });
      const result = await controller.auditLogs();
      expect(result[0]?.meta).toEqual({});
    });
  });

  // ── passwordResets() ───────────────────────────────────────────────────────

  describe('passwordResets()', () => {
    it('returns pending password reset tokens', async () => {
      const { controller } = makeController();
      const result = await controller.passwordResets();
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('email');
      expect(result[0]).toHaveProperty('resetUrl');
    });

    it('returns empty array when no pending resets', async () => {
      const { controller } = makeController({ resetToken: null });
      const result = await controller.passwordResets();
      expect(result).toEqual([]);
    });
  });

  // ── revokePasswordReset() ─────────────────────────────────────────────────

  describe('revokePasswordReset()', () => {
    it('revokes a password reset token', async () => {
      const { controller, prisma } = makeController();
      const req = { user: { id: 'admin-1' } };
      const result = await controller.revokePasswordReset(req, 'reset-1');
      expect(prisma.passwordResetToken.update).toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when token not found', async () => {
      const { controller } = makeController({ resetToken: null });
      const req = { user: { id: 'admin-1' } };
      await expect(controller.revokePasswordReset(req, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── systemStats() ─────────────────────────────────────────────────────────

  describe('systemStats()', () => {
    it('returns system statistics shape', async () => {
      const prisma = makePrisma();
      // Override count to return predictable values in sequence
      const countValues = [10, 8, 20, 15, 100, 5];
      let idx = 0;
      prisma.user.count = vi.fn().mockImplementation(() => Promise.resolve(countValues[idx++] ?? 0));
      prisma.monitor.count = vi.fn().mockImplementation(() => Promise.resolve(countValues[idx++] ?? 0));
      prisma.monitorRun.count = vi.fn().mockImplementation(() => Promise.resolve(countValues[idx++] ?? 0));

      const audit = makeAudit();
      const controller = new AdminController(prisma as never, audit as never, { listPlans: vi.fn().mockResolvedValue([]), setUserPlan: vi.fn().mockResolvedValue({ userId: 'u', planName: 'COMMUNITY' }) } as never);
      const result = await controller.systemStats();

      expect(result).toHaveProperty('users');
      expect(result).toHaveProperty('monitors');
      expect(result).toHaveProperty('checksToday');
      expect(result).toHaveProperty('errorRatePct');
      expect(result).toHaveProperty('generatedAt');
    });

    it('returns errorRatePct=0 when checksToday=0', async () => {
      const prisma = makePrisma();
      prisma.user.count = vi.fn().mockResolvedValue(0);
      prisma.monitor.count = vi.fn().mockResolvedValue(0);
      prisma.monitorRun.count = vi.fn().mockResolvedValue(0);

      const audit = makeAudit();
      const controller = new AdminController(prisma as never, audit as never, { listPlans: vi.fn().mockResolvedValue([]), setUserPlan: vi.fn().mockResolvedValue({ userId: 'u', planName: 'COMMUNITY' }) } as never);
      const result = await controller.systemStats();
      expect(result.errorRatePct).toBe(0);
    });
  });

  // ── resetMfa() ────────────────────────────────────────────────────────────

  describe('resetMfa()', () => {
    it('resets MFA when user has TOTP enabled', async () => {
      const { controller, prisma, audit } = makeController({
        user: { ...makeUser(), totpEnabled: true, totpSecret: 'secret', totpRecoveryCodes: '[]' } as never,
      });
      const req = { user: { id: 'admin-1' } };
      const result = await controller.resetMfa(req as never, 'user-1');
      expect(result.ok).toBe(true);
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(audit.log).toHaveBeenCalledWith('admin.user.reset_mfa', 'admin-1', 'user-1', expect.any(Object));
    });

    it('throws ForbiddenException when trying to reset own MFA', async () => {
      const { controller } = makeController();
      const req = { user: { id: 'user-1' } };
      await expect(controller.resetMfa(req as never, 'user-1')).rejects.toThrow('Cannot reset your own MFA via admin panel');
    });

    it('throws NotFoundException when user not found', async () => {
      const { controller } = makeController({ user: null });
      const req = { user: { id: 'admin-1' } };
      await expect(controller.resetMfa(req as never, 'missing-user')).rejects.toThrow('user not found');
    });

    it('throws BadRequestException when MFA is not enabled', async () => {
      const { controller } = makeController({
        user: { ...makeUser(), totpEnabled: false } as never,
      });
      const req = { user: { id: 'admin-1' } };
      await expect(controller.resetMfa(req as never, 'user-1')).rejects.toThrow('MFA is not enabled');
    });
  });

  // ── forcePasswordReset() ──────────────────────────────────────────────────

  describe('forcePasswordReset()', () => {
    it('creates a reset token and revokes sessions', async () => {
      const { controller, prisma, audit } = makeController();
      (prisma as unknown as { passwordResetToken: { create: ReturnType<typeof vi.fn> } }).passwordResetToken['create'] = vi.fn().mockResolvedValue({ id: 'prt-1' });
      const req = { user: { id: 'admin-1' } };
      const result = await controller.forcePasswordReset(req as never, 'user-1');
      expect(result.ok).toBe(true);
      expect(result.resetUrl).toContain('reset=');
      expect(result.expiresAt).toBeTruthy();
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(audit.log).toHaveBeenCalledWith('admin.user.force_password_reset', 'admin-1', 'user-1', expect.any(Object));
    });

    it('throws NotFoundException when user not found', async () => {
      const { controller } = makeController({ user: null });
      const req = { user: { id: 'admin-1' } };
      await expect(controller.forcePasswordReset(req as never, 'missing-user')).rejects.toThrow('user not found');
    });
  });

  // ── deleteUser() ──────────────────────────────────────────────────────────

  describe('deleteUser()', () => {
    it('deletes a user and logs audit', async () => {
      const { controller, prisma, audit } = makeController();
      (prisma as unknown as { user: { delete: ReturnType<typeof vi.fn> } }).user['delete'] = vi.fn().mockResolvedValue({});
      const req = { user: { id: 'admin-1' } };
      const result = await controller.deleteUser(req as never, 'user-1');
      expect(result.ok).toBe(true);
      expect(audit.log).toHaveBeenCalledWith('admin.user.delete', 'admin-1', 'user-1', expect.any(Object));
    });

    it('throws ForbiddenException when deleting own account', async () => {
      const { controller } = makeController();
      const req = { user: { id: 'user-1' } };
      await expect(controller.deleteUser(req as never, 'user-1')).rejects.toThrow('Cannot delete your own account');
    });

    it('throws NotFoundException when user not found', async () => {
      const { controller } = makeController({ user: null });
      const req = { user: { id: 'admin-1' } };
      await expect(controller.deleteUser(req as never, 'missing-user')).rejects.toThrow('user not found');
    });
  });

  // ── setUserPlan() ─────────────────────────────────────────────────────────

  describe('setUserPlan()', () => {
    it('sets the plan for a user', async () => {
      const { controller } = makeController();
      const result = await controller.setUserPlan('user-1', { planId: 'PRO' });
      expect(result.planName).toBe('COMMUNITY');
    });

    it('throws NotFoundException when user not found', async () => {
      const { controller } = makeController({ user: null });
      await expect(controller.setUserPlan('missing-user', { planId: 'PRO' })).rejects.toThrow('user not found');
    });
  });
});
