import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { InvitesController } from './invites.controller';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invite-1',
    token: 'abc123def456abc123def456abc123def456abc123def456',
    email: 'newuser@example.com',
    role: 'user',
    invitedById: 'admin-1',
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
    acceptedAt: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makePrisma(opts: {
  invite?: ReturnType<typeof makeInvite> | null;
  invites?: ReturnType<typeof makeInvite>[];
} = {}) {
  const invite = opts.invite !== undefined ? opts.invite : makeInvite();
  const invites = opts.invites ?? [makeInvite()];

  return {
    inviteToken: {
      findMany: vi.fn().mockResolvedValue(invites),
      findUnique: vi.fn().mockResolvedValue(invite),
      create: vi.fn().mockResolvedValue(invite),
      delete: vi.fn().mockResolvedValue(invite),
    },
  };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function makeMailer(sent = true) {
  return { sendInviteEmail: vi.fn().mockResolvedValue({ sent }) };
}

function makeController(opts: Parameters<typeof makePrisma>[0] = {}) {
  const prisma = makePrisma(opts);
  const audit = makeAudit();
  const mailer = makeMailer();
  const controller = new InvitesController(prisma as never, audit as never, mailer as never);
  return { controller, prisma, audit, mailer };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('InvitesController', () => {
  // ── list() ─────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns mapped invite list', async () => {
      const { controller, prisma } = makeController();
      const result = await controller.list();
      expect(prisma.inviteToken.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('email');
      expect(result[0]).toHaveProperty('token');
      expect(result[0].acceptedAt).toBeNull();
    });

    it('returns acceptedAt as ISO string when set', async () => {
      const acceptedAt = new Date('2026-02-01');
      const { controller } = makeController({ invites: [makeInvite({ acceptedAt })] });
      const result = await controller.list();
      expect(result[0].acceptedAt).toBe(acceptedAt.toISOString());
    });

    it('returns empty array when no invites', async () => {
      const { controller } = makeController({ invites: [] });
      const result = await controller.list();
      expect(result).toEqual([]);
    });
  });

  // ── create() ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates an invite and sends email', async () => {
      const { controller, prisma, mailer, audit } = makeController();
      const req = { user: { id: 'admin-1' } };
      const result = await controller.create(req, { email: 'newuser@example.com', role: 'user' });

      expect(prisma.inviteToken.create).toHaveBeenCalled();
      expect(mailer.sendInviteEmail).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith('admin.invite.create', 'admin-1', null, expect.any(Object));
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result.mailSent).toBe(true);
    });

    it('clamps expiresInHours to range 1–168', async () => {
      const { controller, prisma } = makeController();
      const req = { user: { id: 'admin-1' } };
      await controller.create(req, { email: 'newuser@example.com', expiresInHours: 999 });
      const callArgs = prisma.inviteToken.create.mock.calls[0][0];
      const expiresAt = callArgs.data.expiresAt as Date;
      const hours = (expiresAt.getTime() - Date.now()) / 3600000;
      expect(hours).toBeLessThanOrEqual(168 + 1); // +1 for rounding
    });

    it('exposes inviteUrl in development mode', async () => {
      process.env.NODE_ENV = 'development';
      const { controller } = makeController();
      const req = { user: { id: 'admin-1' } };
      const result = await controller.create(req, { email: 'newuser@example.com' });
      expect(result.inviteUrl).toBeDefined();
      process.env.NODE_ENV = 'test';
    });

    it('does not expose inviteUrl in non-development mode', async () => {
      process.env.NODE_ENV = 'test';
      const { controller } = makeController();
      const req = { user: { id: 'admin-1' } };
      const result = await controller.create(req, { email: 'newuser@example.com' });
      expect(result.inviteUrl).toBeUndefined();
    });
  });

  // ── revoke() ───────────────────────────────────────────────────────────────

  describe('revoke()', () => {
    it('deletes the invite and returns { ok: true }', async () => {
      const { controller, prisma, audit } = makeController();
      const req = { user: { id: 'admin-1' } };
      const result = await controller.revoke(req, 'invite-1');
      expect(prisma.inviteToken.delete).toHaveBeenCalledWith({ where: { id: 'invite-1' } });
      expect(audit.log).toHaveBeenCalledWith('admin.invite.revoke', 'admin-1', null, expect.any(Object));
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when invite not found', async () => {
      const { controller } = makeController({ invite: null });
      const req = { user: { id: 'admin-1' } };
      await expect(controller.revoke(req, 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
