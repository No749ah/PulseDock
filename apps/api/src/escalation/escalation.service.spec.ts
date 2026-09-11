import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { EscalationService } from './escalation.service';
import type { PrismaService } from '../common/prisma.service';
import type { AlertsService } from '../alerts/alerts.service';

const makePrisma = () =>
  ({
    escalationPolicy: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    monitorAlert: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    monitorRun: {
      findFirst: vi.fn(),
    },
    alertChannel: {
      findFirst: vi.fn(),
    },
  }) as unknown as PrismaService;

const makeAlerts = () =>
  ({
    sendToChannel: vi.fn(),
  }) as unknown as AlertsService;

describe('EscalationService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let alerts: ReturnType<typeof makeAlerts>;
  let svc: EscalationService;

  beforeEach(() => {
    prisma = makePrisma();
    alerts = makeAlerts();
    svc = new EscalationService(prisma, alerts as any);
    (svc as any)['prisma'] = prisma;
    (svc as any)['alerts'] = alerts;
    vi.clearAllMocks();
  });

  describe('list()', () => {
    it('returns all policies for user', async () => {
      const policies = [{ id: 'p1', name: 'Policy 1' }];
      (prisma.escalationPolicy.findMany as any).mockResolvedValue(policies);
      const result = await svc.list('u1');
      expect(result).toEqual(policies);
      expect(prisma.escalationPolicy.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne()', () => {
    it('returns policy when found', async () => {
      const policy = { id: 'p1', name: 'Policy 1' };
      (prisma.escalationPolicy.findFirst as any).mockResolvedValue(policy);
      const result = await svc.findOne('u1', 'p1');
      expect(result).toEqual(policy);
    });

    it('throws NotFoundException when not found', async () => {
      (prisma.escalationPolicy.findFirst as any).mockResolvedValue(null);
      await expect(svc.findOne('u1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create()', () => {
    it('creates a new policy', async () => {
      const created = { id: 'p1', name: 'New', steps: [] };
      (prisma.escalationPolicy.create as any).mockResolvedValue(created);
      const result = await svc.create('u1', { name: 'New', steps: [] });
      expect(result).toEqual(created);
      expect(prisma.escalationPolicy.create).toHaveBeenCalledWith({
        data: { userId: 'u1', name: 'New', steps: [] },
      });
    });
  });

  describe('update()', () => {
    it('updates existing policy', async () => {
      (prisma.escalationPolicy.findFirst as any).mockResolvedValue({ id: 'p1' });
      const updated = { id: 'p1', name: 'Updated' };
      (prisma.escalationPolicy.update as any).mockResolvedValue(updated);
      const result = await svc.update('u1', 'p1', { name: 'Updated' });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when not found', async () => {
      (prisma.escalationPolicy.findFirst as any).mockResolvedValue(null);
      await expect(svc.update('u1', 'missing', { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove()', () => {
    it('deletes existing policy', async () => {
      (prisma.escalationPolicy.findFirst as any).mockResolvedValue({ id: 'p1' });
      (prisma.escalationPolicy.delete as any).mockResolvedValue({});
      await svc.remove('u1', 'p1');
      expect(prisma.escalationPolicy.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });

    it('throws NotFoundException when not found', async () => {
      (prisma.escalationPolicy.findFirst as any).mockResolvedValue(null);
      await expect(svc.remove('u1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkAllEscalations()', () => {
    const baseMonitorAlert = (overrides: Record<string, any> = {}) => ({
      monitorId: 'm1',
      alertChannelId: 'ac1',
      escalationPolicyId: 'ep1',
      escalationStep: 0,
      escalatedAt: null,
      escalationPolicy: {
        id: 'ep1',
        name: 'Default',
        steps: [{ delayMinutes: 5, channelId: 'ch1' }],
      },
      monitor: {
        id: 'm1',
        name: 'API',
        target: 'https://api.test',
        type: 'HTTP',
        userId: 'u1',
        mutedUntil: null,
      },
      alertChannel: { id: 'ac1' },
      ...overrides,
    });

    it('skips muted monitor', async () => {
      (prisma.monitorAlert.findMany as any).mockResolvedValue([
        baseMonitorAlert({ monitor: { ...baseMonitorAlert().monitor, mutedUntil: new Date(Date.now() + 60_000) } }),
      ]);
      await svc.checkAllEscalations();
      expect(prisma.monitorRun.findFirst).not.toHaveBeenCalled();
    });

    it('skips healthy monitor and does not reset if already at step 0', async () => {
      (prisma.monitorAlert.findMany as any).mockResolvedValue([baseMonitorAlert()]);
      (prisma.monitorRun.findFirst as any).mockResolvedValue({ ok: true });
      await svc.checkAllEscalations();
      expect(prisma.monitorAlert.update).not.toHaveBeenCalled();
    });

    it('resets escalation state on recovery', async () => {
      (prisma.monitorAlert.findMany as any).mockResolvedValue([
        baseMonitorAlert({ escalationStep: 1, escalatedAt: new Date() }),
      ]);
      (prisma.monitorRun.findFirst as any).mockResolvedValue({ ok: true });
      (prisma.monitorAlert.update as any).mockResolvedValue({});
      await svc.checkAllEscalations();
      expect(prisma.monitorAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { escalationStep: 0, escalatedAt: null },
        }),
      );
    });

    it('fires step when delay threshold met', async () => {
      (prisma.monitorAlert.findMany as any).mockResolvedValue([baseMonitorAlert()]);
      // Last run is unhealthy
      (prisma.monitorRun.findFirst as any)
        .mockResolvedValueOnce({ ok: false, latencyMs: 100 }) // lastRun
        .mockResolvedValueOnce({ checkedAt: new Date(Date.now() - 10 * 60_000), ok: false }); // firstFail (10 mins ago)

      const channel = { id: 'ch1', userId: 'u1', name: 'Slack', type: 'slack', configJson: {}, createdAt: new Date() };
      (prisma.alertChannel.findFirst as any).mockResolvedValue(channel);
      (alerts.sendToChannel as any).mockResolvedValue(undefined);
      (prisma.monitorAlert.update as any).mockResolvedValue({});

      await svc.checkAllEscalations();

      expect(alerts.sendToChannel).toHaveBeenCalled();
      expect(prisma.monitorAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ escalationStep: 1 }),
        }),
      );
    });

    it('skips when all steps already done', async () => {
      (prisma.monitorAlert.findMany as any).mockResolvedValue([
        baseMonitorAlert({ escalationStep: 1 }), // only 1 step, already at index 1
      ]);
      (prisma.monitorRun.findFirst as any)
        .mockResolvedValueOnce({ ok: false, latencyMs: 50 })
        .mockResolvedValueOnce({ checkedAt: new Date(Date.now() - 60 * 60_000), ok: false });

      await svc.checkAllEscalations();
      expect(prisma.alertChannel.findFirst).not.toHaveBeenCalled();
    });

    it('handles missing channel by advancing step', async () => {
      (prisma.monitorAlert.findMany as any).mockResolvedValue([baseMonitorAlert()]);
      (prisma.monitorRun.findFirst as any)
        .mockResolvedValueOnce({ ok: false, latencyMs: 50 })
        .mockResolvedValueOnce({ checkedAt: new Date(Date.now() - 10 * 60_000), ok: false });

      (prisma.alertChannel.findFirst as any).mockResolvedValue(null);
      (prisma.monitorAlert.update as any).mockResolvedValue({});

      await svc.checkAllEscalations();

      expect(alerts.sendToChannel).not.toHaveBeenCalled();
      expect(prisma.monitorAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ escalationStep: 1 }),
        }),
      );
    });
  });

  describe('resetForMonitor()', () => {
    it('resets all escalation state for a monitor', async () => {
      (prisma.monitorAlert.updateMany as any).mockResolvedValue({ count: 2 });
      await svc.resetForMonitor('m1');
      expect(prisma.monitorAlert.updateMany).toHaveBeenCalledWith({
        where: { monitorId: 'm1', escalationStep: { gt: 0 } },
        data: { escalationStep: 0, escalatedAt: null },
      });
    });
  });
});
