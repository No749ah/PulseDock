import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsStateController } from './monitors-state.controller';

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

function makeCrudService() {
  return {
    snooze: vi.fn(),
    togglePin: vi.fn(),
  };
}

function makePrisma(found = true, extra: Record<string, unknown> = {}) {
  return {
    monitor: {
      findFirst: vi.fn().mockResolvedValue(
        found ? { id: 'mon-1', userId: 'user-1', configJson: {}, ...extra } : null,
      ),
      update: vi.fn().mockResolvedValue({ id: 'mon-1' }),
    },
    alertAcknowledgement: {
      create: vi.fn().mockResolvedValue({
        id: 'ack-1',
        monitorId: 'mon-1',
        userId: 'user-1',
        note: null,
        acknowledgedAt: new Date('2026-01-01T10:00:00Z'),
        clearedAt: null,
        createdAt: new Date('2026-01-01T10:00:00Z'),
      }),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
}

// ─── snooze ───────────────────────────────────────────────────────────────────

describe('MonitorsStateController.snooze()', () => {
  it('delegates hours to crudService.snooze', async () => {
    const crud = makeCrudService();
    crud.snooze.mockResolvedValue({ ok: true });
    const ctrl = new MonitorsStateController(crud as never, {} as never);
    await ctrl.snooze(makeReq(), 'm-1', { hours: 4 });
    expect(crud.snooze).toHaveBeenCalledWith('user-1', 'm-1', 4);
  });

  it('defaults hours to 1 when not provided', async () => {
    const crud = makeCrudService();
    crud.snooze.mockResolvedValue({ ok: true });
    const ctrl = new MonitorsStateController(crud as never, {} as never);
    await ctrl.snooze(makeReq(), 'm-1', {} as never);
    expect(crud.snooze).toHaveBeenCalledWith('user-1', 'm-1', 1);
  });
});

// ─── muteMonitor ──────────────────────────────────────────────────────────────

describe('MonitorsStateController.muteMonitor()', () => {
  it('sets mutedUntil and returns ISO string', async () => {
    const prisma = makePrisma();
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    const result = await ctrl.muteMonitor(makeReq(), 'mon-1', { minutes: 60 } as never) as Record<string, unknown>;
    expect(typeof result['mutedUntil']).toBe('string');
    expect(prisma.monitor.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mon-1' }, data: expect.objectContaining({ mutedUntil: expect.any(Date) }) }),
    );
  });

  it('throws NotFoundException when monitor not found', async () => {
    const prisma = makePrisma(false);
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    await expect(ctrl.muteMonitor(makeReq(), 'missing', { minutes: 30 } as never)).rejects.toThrow(NotFoundException);
  });

  it('sets mutedUntil to roughly minutes * 60_000 ms in the future', async () => {
    const prisma = makePrisma();
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    const before = Date.now();
    await ctrl.muteMonitor(makeReq(), 'mon-1', { minutes: 10 } as never);
    const updateCall = (prisma.monitor.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const mutedUntil: Date = updateCall.data.mutedUntil;
    const diff = mutedUntil.getTime() - before;
    expect(diff).toBeGreaterThanOrEqual(10 * 60_000 - 500);
    expect(diff).toBeLessThanOrEqual(10 * 60_000 + 500);
  });
});

// ─── unmuteMonitor ────────────────────────────────────────────────────────────

describe('MonitorsStateController.unmuteMonitor()', () => {
  it('sets mutedUntil to null', async () => {
    const prisma = makePrisma();
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    const result = await ctrl.unmuteMonitor(makeReq(), 'mon-1') as Record<string, unknown>;
    expect(result['mutedUntil']).toBeNull();
    expect(prisma.monitor.update).toHaveBeenCalledWith({ where: { id: 'mon-1' }, data: { mutedUntil: null } });
  });

  it('throws NotFoundException when monitor not found', async () => {
    const prisma = makePrisma(false);
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    await expect(ctrl.unmuteMonitor(makeReq(), 'missing')).rejects.toThrow(NotFoundException);
  });
});

// ─── pauseMonitor ─────────────────────────────────────────────────────────────

describe('MonitorsStateController.pauseMonitor()', () => {
  it('sets pausedUntil and returns ISO string', async () => {
    const prisma = makePrisma();
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    const result = await ctrl.pauseMonitor(makeReq(), 'mon-1', { minutes: 120 } as never) as Record<string, unknown>;
    expect(typeof result['pausedUntil']).toBe('string');
    expect(prisma.monitor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ pausedUntil: expect.any(Date) }) }),
    );
  });

  it('throws NotFoundException when monitor not found', async () => {
    const prisma = makePrisma(false);
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    await expect(ctrl.pauseMonitor(makeReq(), 'missing', { minutes: 30 } as never)).rejects.toThrow(NotFoundException);
  });
});

// ─── resumeMonitor ────────────────────────────────────────────────────────────

describe('MonitorsStateController.resumeMonitor()', () => {
  it('sets pausedUntil to null', async () => {
    const prisma = makePrisma();
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    const result = await ctrl.resumeMonitor(makeReq(), 'mon-1') as Record<string, unknown>;
    expect(result['pausedUntil']).toBeNull();
    expect(prisma.monitor.update).toHaveBeenCalledWith({ where: { id: 'mon-1' }, data: { pausedUntil: null } });
  });

  it('throws NotFoundException when monitor not found', async () => {
    const prisma = makePrisma(false);
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    await expect(ctrl.resumeMonitor(makeReq(), 'missing')).rejects.toThrow(NotFoundException);
  });
});

// ─── acknowledgeMonitor ───────────────────────────────────────────────────────

describe('MonitorsStateController.acknowledgeMonitor()', () => {
  it('creates an acknowledgement and returns formatted response', async () => {
    const prisma = makePrisma();
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    const result = await ctrl.acknowledgeMonitor(makeReq(), 'mon-1', { note: 'On it' }) as Record<string, unknown>;
    expect(result['id']).toBe('ack-1');
    expect(result['monitorId']).toBe('mon-1');
    expect(typeof result['acknowledgedAt']).toBe('string');
    expect(result['clearedAt']).toBeNull();
    expect(prisma.alertAcknowledgement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ monitorId: 'mon-1', userId: 'user-1', note: 'On it' }) }),
    );
  });

  it('sets note to null when not provided', async () => {
    const prisma = makePrisma();
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    await ctrl.acknowledgeMonitor(makeReq(), 'mon-1', {});
    expect(prisma.alertAcknowledgement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ note: null }) }),
    );
  });

  it('throws NotFoundException when monitor not found', async () => {
    const prisma = makePrisma(false);
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    await expect(ctrl.acknowledgeMonitor(makeReq(), 'missing', {})).rejects.toThrow(NotFoundException);
  });
});

// ─── clearAcknowledgement ─────────────────────────────────────────────────────

describe('MonitorsStateController.clearAcknowledgement()', () => {
  it('clears active acknowledgement', async () => {
    const clearedAt = new Date('2026-01-01T12:00:00Z');
    const prisma = makePrisma();
    prisma.alertAcknowledgement.findFirst = vi.fn().mockResolvedValue({ id: 'ack-1' });
    prisma.alertAcknowledgement.update = vi.fn().mockResolvedValue({
      id: 'ack-1',
      monitorId: 'mon-1',
      userId: 'user-1',
      note: 'On it',
      acknowledgedAt: new Date('2026-01-01T10:00:00Z'),
      clearedAt,
      createdAt: new Date('2026-01-01T10:00:00Z'),
    });
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    const result = await ctrl.clearAcknowledgement(makeReq(), 'mon-1') as Record<string, unknown>;
    expect(result['id']).toBe('ack-1');
    expect(typeof result['clearedAt']).toBe('string');
  });

  it('throws NotFoundException when monitor not found', async () => {
    const prisma = makePrisma(false);
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    await expect(ctrl.clearAcknowledgement(makeReq(), 'missing')).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when no active acknowledgement found', async () => {
    const prisma = makePrisma();
    prisma.alertAcknowledgement.findFirst = vi.fn().mockResolvedValue(null);
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    await expect(ctrl.clearAcknowledgement(makeReq(), 'mon-1')).rejects.toThrow(NotFoundException);
  });
});

// ─── togglePin ────────────────────────────────────────────────────────────────

describe('MonitorsStateController.togglePin()', () => {
  it('delegates to crudService.togglePin', async () => {
    const crud = makeCrudService();
    crud.togglePin.mockResolvedValue({ pinned: true });
    const ctrl = new MonitorsStateController(crud as never, {} as never);
    const result = await ctrl.togglePin(makeReq(), 'm-1');
    expect(crud.togglePin).toHaveBeenCalledWith('user-1', 'm-1');
    expect(result).toEqual({ pinned: true });
  });

  it('returns pinned:false when toggled off', async () => {
    const crud = makeCrudService();
    crud.togglePin.mockResolvedValue({ pinned: false });
    const ctrl = new MonitorsStateController(crud as never, {} as never);
    const result = await ctrl.togglePin(makeReq(), 'm-1');
    expect(result.pinned).toBe(false);
  });
});

// ─── resetDnsBaseline ─────────────────────────────────────────────────────────

describe('MonitorsStateController.resetDnsBaseline()', () => {
  it('removes dnsBaseline and dnsBaselineSetAt from configJson', async () => {
    const prisma = makePrisma(true, { configJson: { dnsBaseline: ['1.2.3.4'], dnsBaselineSetAt: '2026-01-01', keep: true } });
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    const result = await ctrl.resetDnsBaseline(makeReq(), 'mon-1') as Record<string, unknown>;
    expect(result['ok']).toBe(true);
    const updateCall = (prisma.monitor.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const configJson = updateCall.data.configJson as Record<string, unknown>;
    expect(configJson['dnsBaseline']).toBeUndefined();
    expect(configJson['dnsBaselineSetAt']).toBeUndefined();
    expect(configJson['keep']).toBe(true);
  });

  it('throws NotFoundException when monitor not found', async () => {
    const prisma = makePrisma(false);
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    await expect(ctrl.resetDnsBaseline(makeReq(), 'missing')).rejects.toThrow(NotFoundException);
  });
});

// ─── resetContentBaseline ────────────────────────────────────────────────────

describe('MonitorsStateController.resetContentBaseline()', () => {
  it('removes contentHash and contentHashSetAt from configJson', async () => {
    const prisma = makePrisma(true, { configJson: { contentHash: 'abc', contentHashSetAt: '2026-01-01', other: 'x' } });
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    const result = await ctrl.resetContentBaseline(makeReq(), 'mon-1') as Record<string, unknown>;
    expect(result['ok']).toBe(true);
    const updateCall = (prisma.monitor.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const configJson = updateCall.data.configJson as Record<string, unknown>;
    expect(configJson['contentHash']).toBeUndefined();
    expect(configJson['other']).toBe('x');
  });

  it('throws NotFoundException when monitor not found', async () => {
    const prisma = makePrisma(false);
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    await expect(ctrl.resetContentBaseline(makeReq(), 'missing')).rejects.toThrow(NotFoundException);
  });
});

// ─── resetHeaderBaseline ─────────────────────────────────────────────────────

describe('MonitorsStateController.resetHeaderBaseline()', () => {
  it('clears headerBaseline and headerBaselineSetAt', async () => {
    const prisma = makePrisma();
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    const result = await ctrl.resetHeaderBaseline(makeReq(), 'mon-1') as Record<string, unknown>;
    expect(result['ok']).toBe(true);
    expect(prisma.monitor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ headerBaselineSetAt: null }) }),
    );
  });

  it('throws NotFoundException when monitor not found', async () => {
    const prisma = makePrisma(false);
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    await expect(ctrl.resetHeaderBaseline(makeReq(), 'missing')).rejects.toThrow(NotFoundException);
  });
});

// ─── generateShareToken ───────────────────────────────────────────────────────

describe('MonitorsStateController.generateShareToken()', () => {
  it('generates a share token starting with pd_share_', async () => {
    const prisma = {
      monitor: {
        findFirst: vi.fn().mockResolvedValue({ id: 'mon-1' }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    const result = await ctrl.generateShareToken(makeReq(), 'mon-1') as Record<string, unknown>;
    expect(typeof result['shareToken']).toBe('string');
    expect(String(result['shareToken'])).toMatch(/^pd_share_/);
  });

  it('throws NotFoundException when monitor not found', async () => {
    const prisma = {
      monitor: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    };
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    await expect(ctrl.generateShareToken(makeReq(), 'missing')).rejects.toThrow(NotFoundException);
  });
});

// ─── revokeShareToken ─────────────────────────────────────────────────────────

describe('MonitorsStateController.revokeShareToken()', () => {
  it('sets shareToken to null', async () => {
    const prisma = {
      monitor: {
        findFirst: vi.fn().mockResolvedValue({ id: 'mon-1' }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    const result = await ctrl.revokeShareToken(makeReq(), 'mon-1') as Record<string, unknown>;
    expect(result['shareToken']).toBeNull();
    expect(prisma.monitor.update).toHaveBeenCalledWith({ where: { id: 'mon-1' }, data: { shareToken: null } });
  });

  it('throws NotFoundException when monitor not found', async () => {
    const prisma = {
      monitor: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    };
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    await expect(ctrl.revokeShareToken(makeReq(), 'missing')).rejects.toThrow(NotFoundException);
  });
});

// ─── different users ──────────────────────────────────────────────────────────

describe('MonitorsStateController user isolation', () => {
  it('muteMonitor uses req.user.id in findFirst query', async () => {
    const prisma = makePrisma();
    const ctrl = new MonitorsStateController({} as never, prisma as never);
    await ctrl.muteMonitor({ user: { id: 'user-99' } }, 'mon-1', { minutes: 5 } as never);
    expect(prisma.monitor.findFirst).toHaveBeenCalledWith({ where: { id: 'mon-1', userId: 'user-99' } });
  });

  it('snooze passes correct userId', async () => {
    const crud = makeCrudService();
    crud.snooze.mockResolvedValue({});
    const ctrl = new MonitorsStateController(crud as never, {} as never);
    await ctrl.snooze({ user: { id: 'user-42' } }, 'mon-x', { hours: 8 });
    expect(crud.snooze).toHaveBeenCalledWith('user-42', 'mon-x', 8);
  });
});
