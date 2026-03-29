/**
 * Unit tests for MonitorsService alert configuration methods:
 * - updateMonitorAlertNotifyOn()
 * - updateMonitorAlertRepeatInterval()
 * - updateMonitorAlertEscalationPolicy()
 * - getConfigHistory()
 */

import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MonitorsService } from './monitors.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { VersionDetectionService } from './version-detection.service';

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
}

function makeService(prisma: Record<string, unknown>, audit = makeAudit()) {
  return new MonitorsService(
    prisma as never,
    { listPlugins: vi.fn().mockReturnValue([]), runMonitor: vi.fn() } as unknown as ChecksService,
    audit,
    { emitMonitorUpdate: vi.fn(), emitCheckResult: vi.fn() } as unknown as RealtimeEvents,
    {} as unknown as VersionDetectionService,
  );
}

function makeMonitorPrisma(found = true) {
  return {
    monitor: {
      findFirst: vi.fn().mockResolvedValue(found ? { id: 'm1', userId: 'user-1' } : null),
    },
    monitorAlert: {
      update: vi.fn().mockResolvedValue({}),
    },
    escalationPolicy: {
      findFirst: vi.fn().mockResolvedValue({ id: 'ep-1', userId: 'user-1' }),
    },
    monitorConfigChange: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

// ─── updateMonitorAlertNotifyOn() ────────────────────────────────────────────

describe('MonitorsService.updateMonitorAlertNotifyOn()', () => {
  it('throws NotFoundException when monitor not found', async () => {
    const prisma = makeMonitorPrisma(false);
    const svc = makeService(prisma);
    await expect(svc.updateMonitorAlertNotifyOn('user-1', 'bad', 'ch-1', 'ON_CHANGE'))
      .rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException for invalid notifyOn value', async () => {
    const prisma = makeMonitorPrisma();
    const svc = makeService(prisma);
    await expect(svc.updateMonitorAlertNotifyOn('user-1', 'm1', 'ch-1', 'INVALID'))
      .rejects.toThrow(BadRequestException);
  });

  it('updates monitorAlert with valid notifyOn value', async () => {
    const prisma = makeMonitorPrisma();
    const svc = makeService(prisma);
    const result = await svc.updateMonitorAlertNotifyOn('user-1', 'm1', 'ch-1', 'ON_CHANGE');

    expect(result).toEqual({ ok: true });
    expect(prisma.monitorAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { notifyOn: 'ON_CHANGE' } }),
    );
  });

  it('accepts all valid notifyOn values', async () => {
    const validValues = ['ON_CHANGE', 'ALWAYS', 'FIRST_ONLY', 'DAILY_DIGEST', 'REPEAT_EVERY_N', 'VERSION_ANY', 'VERSION_MAJOR'];
    for (const v of validValues) {
      const prisma = makeMonitorPrisma();
      const svc = makeService(prisma);
      await expect(svc.updateMonitorAlertNotifyOn('user-1', 'm1', 'ch-1', v)).resolves.toEqual({ ok: true });
    }
  });

  it('logs audit event', async () => {
    const prisma = makeMonitorPrisma();
    const audit = makeAudit();
    const svc = makeService(prisma, audit);
    await svc.updateMonitorAlertNotifyOn('user-1', 'm1', 'ch-1', 'ALWAYS');
    expect(audit.log).toHaveBeenCalledWith('monitor.alert.update', 'user-1', 'user-1', expect.objectContaining({ notifyOn: 'ALWAYS' }));
  });
});

// ─── updateMonitorAlertRepeatInterval() ──────────────────────────────────────

describe('MonitorsService.updateMonitorAlertRepeatInterval()', () => {
  it('throws NotFoundException when monitor not found', async () => {
    const prisma = makeMonitorPrisma(false);
    const svc = makeService(prisma);
    await expect(svc.updateMonitorAlertRepeatInterval('user-1', 'bad', 'ch-1', 60))
      .rejects.toThrow(NotFoundException);
  });

  it('clamps interval to min 1', async () => {
    const prisma = makeMonitorPrisma();
    const svc = makeService(prisma);
    await svc.updateMonitorAlertRepeatInterval('user-1', 'm1', 'ch-1', 0);
    expect(prisma.monitorAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { repeatIntervalMin: 1 } }),
    );
  });

  it('clamps interval to max 1440', async () => {
    const prisma = makeMonitorPrisma();
    const svc = makeService(prisma);
    await svc.updateMonitorAlertRepeatInterval('user-1', 'm1', 'ch-1', 9999);
    expect(prisma.monitorAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { repeatIntervalMin: 1440 } }),
    );
  });

  it('accepts null to clear repeat interval', async () => {
    const prisma = makeMonitorPrisma();
    const svc = makeService(prisma);
    const result = await svc.updateMonitorAlertRepeatInterval('user-1', 'm1', 'ch-1', null);
    expect(result).toEqual({ ok: true });
    expect(prisma.monitorAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { repeatIntervalMin: null } }),
    );
  });

  it('passes valid interval through unchanged', async () => {
    const prisma = makeMonitorPrisma();
    const svc = makeService(prisma);
    await svc.updateMonitorAlertRepeatInterval('user-1', 'm1', 'ch-1', 60);
    expect(prisma.monitorAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { repeatIntervalMin: 60 } }),
    );
  });
});

// ─── updateMonitorAlertEscalationPolicy() ────────────────────────────────────

describe('MonitorsService.updateMonitorAlertEscalationPolicy()', () => {
  it('throws NotFoundException when monitor not found', async () => {
    const prisma = makeMonitorPrisma(false);
    const svc = makeService(prisma);
    await expect(svc.updateMonitorAlertEscalationPolicy('user-1', 'bad', 'ch-1', 'ep-1'))
      .rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when escalation policy not found', async () => {
    const prisma = {
      ...makeMonitorPrisma(),
      escalationPolicy: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const svc = makeService(prisma);
    await expect(svc.updateMonitorAlertEscalationPolicy('user-1', 'm1', 'ch-1', 'nonexistent'))
      .rejects.toThrow(NotFoundException);
  });

  it('updates monitorAlert with escalation policy ID', async () => {
    const prisma = makeMonitorPrisma();
    const svc = makeService(prisma);
    const result = await svc.updateMonitorAlertEscalationPolicy('user-1', 'm1', 'ch-1', 'ep-1');

    expect(result).toEqual({ ok: true });
    expect(prisma.monitorAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { escalationPolicyId: 'ep-1' } }),
    );
  });

  it('accepts null to clear escalation policy (skips policy lookup)', async () => {
    const prisma = makeMonitorPrisma();
    const svc = makeService(prisma);
    const result = await svc.updateMonitorAlertEscalationPolicy('user-1', 'm1', 'ch-1', null);

    expect(result).toEqual({ ok: true });
    expect(prisma.escalationPolicy.findFirst).not.toHaveBeenCalled();
    expect(prisma.monitorAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { escalationPolicyId: null } }),
    );
  });
});

// ─── getConfigHistory() ──────────────────────────────────────────────────────

describe('MonitorsService.getConfigHistory()', () => {
  it('throws NotFoundException for unknown monitor', async () => {
    const prisma = makeMonitorPrisma(false);
    const svc = makeService(prisma);
    await expect(svc.getConfigHistory('user-1', 'missing'))
      .rejects.toThrow(NotFoundException);
  });

  it('returns config history entries', async () => {
    const prisma = {
      ...makeMonitorPrisma(),
      monitorConfigChange: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'cc-1', changes: { name: ['Old', 'New'] }, summary: 'Changed name', createdAt: new Date(), userId: 'user-1' },
        ]),
      },
    };
    const svc = makeService(prisma);
    const result = await svc.getConfigHistory('user-1', 'm1');

    expect(result).toHaveLength(1);
    expect(result[0].summary).toBe('Changed name');
  });

  it('returns empty array when no changes exist', async () => {
    const prisma = makeMonitorPrisma();
    const svc = makeService(prisma);
    const result = await svc.getConfigHistory('user-1', 'm1');
    expect(result).toHaveLength(0);
  });

  it('clamps limit to maximum 200', async () => {
    const prisma = makeMonitorPrisma();
    const svc = makeService(prisma);
    await svc.getConfigHistory('user-1', 'm1', 9999);

    expect(prisma.monitorConfigChange.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });

  it('uses default limit of 50 when not specified', async () => {
    const prisma = makeMonitorPrisma();
    const svc = makeService(prisma);
    await svc.getConfigHistory('user-1', 'm1');

    expect(prisma.monitorConfigChange.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });
});
