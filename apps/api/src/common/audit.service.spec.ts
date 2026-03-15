import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditService } from './audit.service';

function makePrisma() {
  return {
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'log-1' }),
    },
  };
}

describe('AuditService', () => {
  let service: AuditService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AuditService(prisma as never);
  });

  describe('log()', () => {
    it('creates an audit log entry with all fields', async () => {
      await service.log('auth.login', 'actor-1', 'target-1', { ip: '127.0.0.1' });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'auth.login',
          actorUserId: 'actor-1',
          targetUserId: 'target-1',
          metaJson: { ip: '127.0.0.1' },
        },
      });
    });

    it('defaults actorUserId and targetUserId to null when omitted', async () => {
      await service.log('system.startup');
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'system.startup',
          actorUserId: null,
          targetUserId: null,
          metaJson: {},
        },
      });
    });

    it('uses empty object as meta when meta is undefined', async () => {
      await service.log('auth.logout', 'user-1', null, undefined);
      const call = prisma.auditLog.create.mock.calls[0][0] as { data: { metaJson: unknown } };
      expect(call.data.metaJson).toEqual({});
    });

    it('nulls actorUserId when explicitly passed null', async () => {
      await service.log('admin.action', null, 'target-2', { reason: 'test' });
      const call = prisma.auditLog.create.mock.calls[0][0] as { data: { actorUserId: unknown } };
      expect(call.data.actorUserId).toBeNull();
    });

    it('stores complex meta objects correctly', async () => {
      const meta = { changes: ['email', 'name'], before: { email: 'old@x.com' }, after: { email: 'new@x.com' } };
      await service.log('user.updated', 'u-1', 'u-1', meta);
      const call = prisma.auditLog.create.mock.calls[0][0] as { data: { metaJson: unknown } };
      expect(call.data.metaJson).toEqual(meta);
    });
  });
});
