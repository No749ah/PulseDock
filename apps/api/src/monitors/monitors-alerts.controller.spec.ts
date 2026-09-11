import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MonitorsAlertsController } from './monitors-alerts.controller';

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

function makeCrudService() {
  return {
    listMonitorAlerts: vi.fn(),
    addMonitorAlert: vi.fn(),
    updateMonitorAlertNotifyOn: vi.fn(),
    updateMonitorAlertEscalationPolicy: vi.fn(),
    updateMonitorAlertRepeatInterval: vi.fn(),
    removeMonitorAlert: vi.fn(),
    simulateAlerts: vi.fn(),
  };
}

describe('MonitorsAlertsController', () => {
  let controller: MonitorsAlertsController;
  let service: ReturnType<typeof makeCrudService>;

  beforeEach(() => {
    service = makeCrudService();
    controller = new MonitorsAlertsController(service as never, {} as never);
  });

  // ─── listAlerts ──────────────────────────────────────────────────────────

  it('listAlerts() delegates to crudService.listMonitorAlerts', async () => {
    service.listMonitorAlerts.mockResolvedValue([{ id: 'ch-1', name: 'Slack' }]);
    const result = await controller.listAlerts(makeReq(), 'm-1');
    expect(service.listMonitorAlerts).toHaveBeenCalledWith('user-1', 'm-1');
    expect(result).toHaveLength(1);
  });

  it('listAlerts() returns empty array when no channels assigned', async () => {
    service.listMonitorAlerts.mockResolvedValue([]);
    const result = await controller.listAlerts(makeReq(), 'm-1') as unknown[];
    expect(result).toEqual([]);
  });

  // ─── addAlert ────────────────────────────────────────────────────────────

  it('addAlert() delegates to crudService.addMonitorAlert', async () => {
    service.addMonitorAlert.mockResolvedValue({ ok: true });
    await controller.addAlert(makeReq(), 'm-1', 'ch-1', {});
    expect(service.addMonitorAlert).toHaveBeenCalledWith('user-1', 'm-1', 'ch-1', undefined, undefined);
  });

  it('addAlert() passes notifyOn and repeatIntervalMin from body', async () => {
    service.addMonitorAlert.mockResolvedValue({ ok: true });
    await controller.addAlert(makeReq(), 'm-1', 'ch-1', { notifyOn: 'FIRST_ONLY', repeatIntervalMin: 30 });
    expect(service.addMonitorAlert).toHaveBeenCalledWith('user-1', 'm-1', 'ch-1', 'FIRST_ONLY', 30);
  });

  it('addAlert() handles missing body', async () => {
    service.addMonitorAlert.mockResolvedValue({ ok: true });
    await controller.addAlert(makeReq(), 'm-1', 'ch-1', undefined as never);
    expect(service.addMonitorAlert).toHaveBeenCalledWith('user-1', 'm-1', 'ch-1', undefined, undefined);
  });

  // ─── updateAlert ─────────────────────────────────────────────────────────

  it('updateAlert() calls updateMonitorAlertNotifyOn when notifyOn provided', async () => {
    service.updateMonitorAlertNotifyOn.mockResolvedValue({ ok: true });
    const result = await controller.updateAlert(makeReq(), 'm-1', 'ch-1', { notifyOn: 'ALWAYS' }) as Record<string, unknown>;
    expect(service.updateMonitorAlertNotifyOn).toHaveBeenCalledWith('user-1', 'm-1', 'ch-1', 'ALWAYS');
    expect(result['ok']).toBe(true);
  });

  it('updateAlert() calls updateMonitorAlertEscalationPolicy when escalationPolicyId provided', async () => {
    service.updateMonitorAlertEscalationPolicy.mockResolvedValue({ ok: true });
    await controller.updateAlert(makeReq(), 'm-1', 'ch-1', { escalationPolicyId: 'ep-1' });
    expect(service.updateMonitorAlertEscalationPolicy).toHaveBeenCalledWith('user-1', 'm-1', 'ch-1', 'ep-1');
  });

  it('updateAlert() calls updateMonitorAlertEscalationPolicy with null when cleared', async () => {
    service.updateMonitorAlertEscalationPolicy.mockResolvedValue({ ok: true });
    await controller.updateAlert(makeReq(), 'm-1', 'ch-1', { escalationPolicyId: null });
    expect(service.updateMonitorAlertEscalationPolicy).toHaveBeenCalledWith('user-1', 'm-1', 'ch-1', null);
  });

  it('updateAlert() calls updateMonitorAlertRepeatInterval when repeatIntervalMin provided', async () => {
    service.updateMonitorAlertRepeatInterval.mockResolvedValue({ ok: true });
    await controller.updateAlert(makeReq(), 'm-1', 'ch-1', { repeatIntervalMin: 60 });
    expect(service.updateMonitorAlertRepeatInterval).toHaveBeenCalledWith('user-1', 'm-1', 'ch-1', 60);
  });

  it('updateAlert() calls updateMonitorAlertRepeatInterval with null when cleared', async () => {
    service.updateMonitorAlertRepeatInterval.mockResolvedValue({ ok: true });
    await controller.updateAlert(makeReq(), 'm-1', 'ch-1', { repeatIntervalMin: null });
    expect(service.updateMonitorAlertRepeatInterval).toHaveBeenCalledWith('user-1', 'm-1', 'ch-1', null);
  });

  it('updateAlert() can update multiple fields in one call', async () => {
    service.updateMonitorAlertNotifyOn.mockResolvedValue({ ok: true });
    service.updateMonitorAlertRepeatInterval.mockResolvedValue({ ok: true });
    await controller.updateAlert(makeReq(), 'm-1', 'ch-1', { notifyOn: 'ALWAYS', repeatIntervalMin: 15 });
    expect(service.updateMonitorAlertNotifyOn).toHaveBeenCalled();
    expect(service.updateMonitorAlertRepeatInterval).toHaveBeenCalled();
  });

  // ─── removeAlert ─────────────────────────────────────────────────────────

  it('removeAlert() delegates to crudService.removeMonitorAlert', async () => {
    service.removeMonitorAlert.mockResolvedValue({ ok: true });
    const result = await controller.removeAlert(makeReq(), 'm-1', 'ch-1');
    expect(service.removeMonitorAlert).toHaveBeenCalledWith('user-1', 'm-1', 'ch-1');
    expect(result).toEqual({ ok: true });
  });

  // ─── simulateAlerts ──────────────────────────────────────────────────────

  it('simulateAlerts() delegates to crudService.simulateAlerts', async () => {
    service.simulateAlerts.mockResolvedValue({ alertsFired: 3, noiseScore: 0.2, timeline: [] });
    const body = { consecutiveFailures: 2, failureWindow: 5 };
    const result = await controller.simulateAlerts(makeReq(), 'm-1', body as never) as Record<string, unknown>;
    expect(service.simulateAlerts).toHaveBeenCalledWith('user-1', 'm-1', body);
    expect(result['alertsFired']).toBe(3);
  });
});

// ─── listDeliveries (prisma-direct) ─────────────────────────────────────────

describe('MonitorsAlertsController.listDeliveries()', () => {
  const createdAt = new Date('2026-03-26T08:00:00Z');

  it('returns delivery history with success/failed counts', async () => {
    const mockPrisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'm-1' }) },
      alertDeliveryLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'log-1', alertChannelId: 'ch-1', monitorId: 'm-1',
            status: 'success', trigger: 'monitor_failure', errorMessage: null,
            durationMs: 145, createdAt,
            alertChannel: { id: 'ch-1', name: 'Slack Alerts', type: 'slack' },
          },
          {
            id: 'log-2', alertChannelId: 'ch-1', monitorId: 'm-1',
            status: 'failed', trigger: 'monitor_recovery', errorMessage: 'Timeout',
            durationMs: 5000, createdAt,
            alertChannel: { id: 'ch-1', name: 'Slack Alerts', type: 'slack' },
          },
        ]),
      },
    };
    const ctrl = new MonitorsAlertsController({} as never, mockPrisma as never);
    const result = await ctrl.listDeliveries(makeReq(), 'm-1') as Record<string, unknown>;
    expect(result['total']).toBe(2);
    expect(result['successCount']).toBe(1);
    expect(result['failedCount']).toBe(1);
    const deliveries = result['deliveries'] as Array<Record<string, unknown>>;
    expect(deliveries[0]['channelName']).toBe('Slack Alerts');
    expect(deliveries[0]['status']).toBe('success');
    expect(deliveries[1]['errorMessage']).toBe('Timeout');
  });

  it('returns empty deliveries when no logs exist', async () => {
    const mockPrisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'm-1' }) },
      alertDeliveryLog: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const ctrl = new MonitorsAlertsController({} as never, mockPrisma as never);
    const result = await ctrl.listDeliveries(makeReq(), 'm-1') as Record<string, unknown>;
    expect(result['total']).toBe(0);
    expect(result['successCount']).toBe(0);
    expect(result['failedCount']).toBe(0);
    expect((result['deliveries'] as unknown[]).length).toBe(0);
  });

  it('throws NotFoundException when monitor not found', async () => {
    const mockPrisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue(null) },
      alertDeliveryLog: { findMany: vi.fn() },
    };
    const ctrl = new MonitorsAlertsController({} as never, mockPrisma as never);
    await expect(ctrl.listDeliveries(makeReq(), 'missing')).rejects.toThrow(NotFoundException);
  });

  it('formats createdAt as ISO string', async () => {
    const mockPrisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'm-1' }) },
      alertDeliveryLog: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'log-1', alertChannelId: 'ch-1', monitorId: 'm-1',
          status: 'success', trigger: null, errorMessage: null, durationMs: 100, createdAt,
          alertChannel: { id: 'ch-1', name: 'Email', type: 'email' },
        }]),
      },
    };
    const ctrl = new MonitorsAlertsController({} as never, mockPrisma as never);
    const result = await ctrl.listDeliveries(makeReq(), 'm-1') as Record<string, unknown>;
    const deliveries = result['deliveries'] as Array<Record<string, unknown>>;
    expect(typeof deliveries[0]['createdAt']).toBe('string');
    expect(deliveries[0]['createdAt']).toBe(createdAt.toISOString());
  });

  it('uses req.user.id for monitor ownership check', async () => {
    const mockPrisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'm-1' }) },
      alertDeliveryLog: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const ctrl = new MonitorsAlertsController({} as never, mockPrisma as never);
    await ctrl.listDeliveries({ user: { id: 'user-99' } }, 'm-1');
    expect(mockPrisma.monitor.findFirst).toHaveBeenCalledWith({ where: { id: 'm-1', userId: 'user-99' } });
  });
});
