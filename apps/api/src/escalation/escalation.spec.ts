import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { EscalationService } from './escalation.service';

const makePolicy = (overrides = {}) => ({
  id: 'pol-1',
  userId: 'u1',
  name: 'Critical Escalation',
  steps: [
    { delayMinutes: 5, channelId: 'ch-1' },
    { delayMinutes: 15, channelId: 'ch-2' },
  ],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const makeMonitorAlert = (overrides = {}) => ({
  monitorId: 'mon-1',
  alertChannelId: 'ch-0',
  notifyOn: 'ON_CHANGE',
  lastNotifiedAt: null,
  escalationPolicyId: 'pol-1',
  escalatedAt: null,
  escalationStep: 0,
  escalationPolicy: makePolicy(),
  monitor: {
    id: 'mon-1',
    name: 'My API',
    target: 'https://api.example.com',
    type: 'HTTP',
    userId: 'u1',
    mutedUntil: null,
  },
  alertChannel: { id: 'ch-0', name: 'Primary', type: 'webhook', configJson: { url: 'https://webhook.example.com' } },
  ...overrides,
});

describe('EscalationService', () => {
  let service: EscalationService;
  let prisma: ReturnType<typeof mockPrisma>;
  let alerts: ReturnType<typeof mockAlerts>;

  function mockPrisma() {
    return {
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
    };
  }

  function mockAlerts() {
    return { sendToChannel: vi.fn() };
  }

  beforeEach(() => {
    prisma = mockPrisma();
    alerts = mockAlerts();
    service = new EscalationService(prisma as never, alerts as never);
  });

  // ── CRUD ───────────────────────────────────────────────────────

  it('list() returns policies for user', async () => {
    const policies = [makePolicy()];
    prisma.escalationPolicy.findMany.mockResolvedValue(policies);
    const result = await service.list('u1');
    expect(result).toEqual(policies);
    expect(prisma.escalationPolicy.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findOne() returns policy when found', async () => {
    const policy = makePolicy();
    prisma.escalationPolicy.findFirst.mockResolvedValue(policy);
    const result = await service.findOne('u1', 'pol-1');
    expect(result).toEqual(policy);
  });

  it('findOne() throws NotFoundException when not found', async () => {
    prisma.escalationPolicy.findFirst.mockResolvedValue(null);
    await expect(service.findOne('u1', 'pol-999')).rejects.toThrow(NotFoundException);
  });

  it('create() creates a policy with steps', async () => {
    const policy = makePolicy();
    prisma.escalationPolicy.create.mockResolvedValue(policy);
    const result = await service.create('u1', { name: 'Critical Escalation', steps: [{ delayMinutes: 5, channelId: 'ch-1' }] });
    expect(prisma.escalationPolicy.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'u1', name: 'Critical Escalation' }),
    }));
    expect(result).toEqual(policy);
  });

  it('create() uses empty steps when not provided', async () => {
    const policy = makePolicy({ steps: [] });
    prisma.escalationPolicy.create.mockResolvedValue(policy);
    await service.create('u1', { name: 'Empty Policy' });
    expect(prisma.escalationPolicy.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ steps: [] }),
    }));
  });

  it('update() updates policy name', async () => {
    prisma.escalationPolicy.findFirst.mockResolvedValue(makePolicy());
    prisma.escalationPolicy.update.mockResolvedValue(makePolicy({ name: 'Updated' }));
    const result = await service.update('u1', 'pol-1', { name: 'Updated' });
    expect(prisma.escalationPolicy.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pol-1' },
      data: expect.objectContaining({ name: 'Updated' }),
    }));
    expect(result.name).toBe('Updated');
  });

  it('update() throws NotFoundException when policy not found', async () => {
    prisma.escalationPolicy.findFirst.mockResolvedValue(null);
    await expect(service.update('u1', 'pol-999', { name: 'New' })).rejects.toThrow(NotFoundException);
  });

  it('remove() deletes policy', async () => {
    prisma.escalationPolicy.findFirst.mockResolvedValue(makePolicy());
    prisma.escalationPolicy.delete.mockResolvedValue({});
    await service.remove('u1', 'pol-1');
    expect(prisma.escalationPolicy.delete).toHaveBeenCalledWith({ where: { id: 'pol-1' } });
  });

  it('remove() throws NotFoundException when policy not found', async () => {
    prisma.escalationPolicy.findFirst.mockResolvedValue(null);
    await expect(service.remove('u1', 'pol-999')).rejects.toThrow(NotFoundException);
  });

  // ── Escalation Logic ───────────────────────────────────────────

  it('checkAllEscalations() skips when no MonitorAlerts have policies', async () => {
    prisma.monitorAlert.findMany.mockResolvedValue([]);
    await service.checkAllEscalations();
    expect(alerts.sendToChannel).not.toHaveBeenCalled();
  });

  it('checkAllEscalations() skips muted monitors', async () => {
    const mutedUntil = new Date(Date.now() + 60_000);
    prisma.monitorAlert.findMany.mockResolvedValue([makeMonitorAlert({ monitor: { ...makeMonitorAlert().monitor, mutedUntil } })]);
    await service.checkAllEscalations();
    expect(prisma.monitorRun.findFirst).not.toHaveBeenCalled();
  });

  it('checkAllEscalations() skips when monitor has no runs', async () => {
    prisma.monitorAlert.findMany.mockResolvedValue([makeMonitorAlert()]);
    prisma.monitorRun.findFirst.mockResolvedValue(null);
    await service.checkAllEscalations();
    expect(alerts.sendToChannel).not.toHaveBeenCalled();
  });

  it('checkAllEscalations() resets escalation state when monitor recovers', async () => {
    prisma.monitorAlert.findMany.mockResolvedValue([makeMonitorAlert({ escalationStep: 1, escalatedAt: new Date() })]);
    prisma.monitorRun.findFirst.mockResolvedValue({ ok: true, latencyMs: 200, checkedAt: new Date() });
    prisma.monitorAlert.update.mockResolvedValue({});
    await service.checkAllEscalations();
    expect(prisma.monitorAlert.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ escalationStep: 0, escalatedAt: null }),
    }));
    expect(alerts.sendToChannel).not.toHaveBeenCalled();
  });

  it('checkAllEscalations() does not escalate when delay not yet passed', async () => {
    const recentFail = new Date(Date.now() - 2 * 60_000); // 2 minutes ago — step needs 5 min
    prisma.monitorAlert.findMany.mockResolvedValue([makeMonitorAlert()]);
    prisma.monitorRun.findFirst
      .mockResolvedValueOnce({ ok: false, latencyMs: null, checkedAt: new Date() }) // last run (unhealthy)
      .mockResolvedValueOnce({ ok: false, checkedAt: recentFail }); // first fail
    await service.checkAllEscalations();
    expect(alerts.sendToChannel).not.toHaveBeenCalled();
  });

  it('checkAllEscalations() fires escalation step when delay passed', async () => {
    const oldFail = new Date(Date.now() - 10 * 60_000); // 10 minutes ago — step needs 5 min
    prisma.monitorAlert.findMany.mockResolvedValue([makeMonitorAlert()]);
    prisma.monitorRun.findFirst
      .mockResolvedValueOnce({ ok: false, latencyMs: null, checkedAt: new Date() })
      .mockResolvedValueOnce({ ok: false, checkedAt: oldFail });
    prisma.alertChannel.findFirst.mockResolvedValue({
      id: 'ch-1', name: 'Secondary', type: 'webhook', configJson: { url: 'https://ch2.example.com' }, userId: 'u1', createdAt: new Date(),
    });
    prisma.monitorAlert.update.mockResolvedValue({});
    alerts.sendToChannel.mockResolvedValue(undefined);
    await service.checkAllEscalations();
    expect(alerts.sendToChannel).toHaveBeenCalledOnce();
    expect(prisma.monitorAlert.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ escalationStep: 1 }),
    }));
  });

  it('checkAllEscalations() skips step when channel not found', async () => {
    const oldFail = new Date(Date.now() - 10 * 60_000);
    prisma.monitorAlert.findMany.mockResolvedValue([makeMonitorAlert()]);
    prisma.monitorRun.findFirst
      .mockResolvedValueOnce({ ok: false, latencyMs: null, checkedAt: new Date() })
      .mockResolvedValueOnce({ ok: false, checkedAt: oldFail });
    prisma.alertChannel.findFirst.mockResolvedValue(null); // channel not found
    prisma.monitorAlert.update.mockResolvedValue({});
    await service.checkAllEscalations();
    expect(alerts.sendToChannel).not.toHaveBeenCalled();
    // Should still advance step to avoid infinite loop
    expect(prisma.monitorAlert.update).toHaveBeenCalled();
  });

  it('resetForMonitor() resets escalation state for all MonitorAlerts', async () => {
    prisma.monitorAlert.updateMany.mockResolvedValue({ count: 2 });
    await service.resetForMonitor('mon-1');
    expect(prisma.monitorAlert.updateMany).toHaveBeenCalledWith({
      where: { monitorId: 'mon-1', escalationStep: { gt: 0 } },
      data: { escalationStep: 0, escalatedAt: null },
    });
  });

  it('checkAllEscalations() skips all steps if already all triggered', async () => {
    const oldFail = new Date(Date.now() - 30 * 60_000);
    prisma.monitorAlert.findMany.mockResolvedValue([makeMonitorAlert({ escalationStep: 2 })]); // all 2 steps done
    prisma.monitorRun.findFirst
      .mockResolvedValueOnce({ ok: false, latencyMs: null, checkedAt: new Date() })
      .mockResolvedValueOnce({ ok: false, checkedAt: oldFail });
    await service.checkAllEscalations();
    expect(alerts.sendToChannel).not.toHaveBeenCalled();
  });
});
