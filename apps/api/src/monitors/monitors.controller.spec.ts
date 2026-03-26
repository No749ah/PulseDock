import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorsController } from './monitors.controller';

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

function makeMonitorsService() {
  return {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    runNow: vi.fn(),
    bulkAction: vi.fn(),
    testVersionConnection: vi.fn(),
    discoverCurrentVersion: vi.fn(),
    listPlugins: vi.fn(),
    getRecentRuns: vi.fn(),
    monitorRuns: vi.fn(),
    exportMonitorRuns: vi.fn(),
    monitorUptime: vi.fn(),
    monitorChart: vi.fn(),
    versionSummary: vi.fn(),
    exportMonitors: vi.fn(),
    importMonitors: vi.fn(),
    importExternal: vi.fn(),
    listMonitorAlerts: vi.fn(),
    addMonitorAlert: vi.fn(),
    updateMonitorAlertNotifyOn: vi.fn(),
    removeMonitorAlert: vi.fn(),
    listEvents: vi.fn(),
    createEvent: vi.fn(),
    deleteEvent: vi.fn(),
    snooze: vi.fn(),
    listDependencies: vi.fn(),
    addDependency: vi.fn(),
    removeDependency: vi.fn(),
    getHealthScore: vi.fn(),
    getHealthSummary: vi.fn(),
    getErrorBudget: vi.fn(),
  };
}

describe('MonitorsController', () => {
  let controller: MonitorsController;
  let service: ReturnType<typeof makeMonitorsService>;

  beforeEach(() => {
    service = makeMonitorsService();
    const mockPlanService = { checkLimit: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: -1, plan: 'COMMUNITY' }) };
    controller = new MonitorsController(service as never, mockPlanService as never);
  });

  it('list() delegates to service.list', async () => {
    service.list.mockResolvedValue([]);
    const result = await controller.list(makeReq(), 'prod');
    expect(service.list).toHaveBeenCalledWith('user-1', 'prod');
    expect(result).toEqual([]);
  });

  it('list() passes undefined tag when not provided', async () => {
    service.list.mockResolvedValue([]);
    await controller.list(makeReq(), undefined);
    expect(service.list).toHaveBeenCalledWith('user-1', undefined);
  });

  it('create() delegates to service.create', async () => {
    const dto = { name: 'My Monitor', target: 'https://example.com', type: 'HTTP' as const, intervalSec: 60 };
    service.create.mockResolvedValue({ id: 'm-1', ...dto });
    const result = await controller.create(makeReq(), dto as never);
    expect(service.create).toHaveBeenCalledWith('user-1', dto);
    expect((result as Record<string, unknown>)['id']).toBe('m-1');
  });

  it('update() delegates to service.update', async () => {
    service.update.mockResolvedValue({ id: 'm-1', name: 'Updated' });
    const result = await controller.update(makeReq(), 'm-1', { name: 'Updated' } as never);
    expect(service.update).toHaveBeenCalledWith('user-1', 'm-1', { name: 'Updated' });
  });

  it('remove() delegates to service.remove', async () => {
    service.remove.mockResolvedValue({ deleted: true });
    const result = await controller.remove(makeReq(), 'm-1');
    expect(service.remove).toHaveBeenCalledWith('user-1', 'm-1');
    expect(result).toEqual({ deleted: true });
  });

  it('runNow() delegates to service.runNow', async () => {
    service.runNow.mockResolvedValue({ ok: true });
    const result = await controller.runNow(makeReq(), { monitorId: 'm-1' });
    expect(service.runNow).toHaveBeenCalledWith('user-1', 'm-1');
  });

  it('bulk() delegates to service.bulkAction', async () => {
    service.bulkAction.mockResolvedValue({ processed: 2 });
    const result = await controller.bulk(makeReq(), { ids: ['m-1', 'm-2'], action: 'enable' });
    expect(service.bulkAction).toHaveBeenCalledWith('user-1', ['m-1', 'm-2'], 'enable', undefined);
  });

  it('versionTest() delegates to service.testVersionConnection', async () => {
    service.testVersionConnection.mockResolvedValue({ version: '1.0.0', source: 'github' });
    const body = { source: 'github', target: 'owner/repo' };
    const result = await controller.versionTest(body as never);
    expect(service.testVersionConnection).toHaveBeenCalledWith(body);
  });

  it('versionDiscover() delegates to service.discoverCurrentVersion', async () => {
    service.discoverCurrentVersion.mockResolvedValue({ discovered: '1.2.3' });
    const body = { url: 'https://example.com' };
    const result = await controller.versionDiscover(body as never);
    expect(service.discoverCurrentVersion).toHaveBeenCalledWith(body);
  });

  it('listPlugins() delegates to service.listPlugins', () => {
    service.listPlugins.mockReturnValue([{ id: 'http', name: 'HTTP' }]);
    const result = controller.listPlugins();
    expect(service.listPlugins).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('getRecentRuns() parses limit and delegates', async () => {
    service.getRecentRuns.mockResolvedValue([]);
    await controller.getRecentRuns(makeReq(), '25', undefined);
    expect(service.getRecentRuns).toHaveBeenCalledWith('user-1', 25, undefined);
  });

  it('getRecentRuns() defaults to 10 when limit not provided', async () => {
    service.getRecentRuns.mockResolvedValue([]);
    await controller.getRecentRuns(makeReq(), undefined, undefined);
    expect(service.getRecentRuns).toHaveBeenCalledWith('user-1', 10, undefined);
  });

  it('monitorRuns() delegates to service.monitorRuns with opts', async () => {
    service.monitorRuns.mockResolvedValue({ runs: [], hasMore: false, total: 0, nextCursor: null });
    await controller.monitorRuns(makeReq(), 'm-1', '100', undefined, 'all');
    expect(service.monitorRuns).toHaveBeenCalledWith('user-1', 'm-1', { limit: '100', before: undefined, status: 'all' });
  });

  it('exportMonitorRuns() sends CSV with correct headers', async () => {
    service.exportMonitorRuns.mockResolvedValue({
      csv: 'id,checkedAt,ok\nrun-1,2026-01-01T00:00:00Z,1',
      filename: 'pulsedock-runs-test-2026-01-01.csv',
      monitorName: 'Test Monitor',
    });
    const res = {
      setHeader: vi.fn(),
      send: vi.fn(),
    } as unknown as import('express').Response;
    await controller.exportMonitorRuns(makeReq(), 'm-1', res);
    expect(service.exportMonitorRuns).toHaveBeenCalledWith('user-1', 'm-1');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="pulsedock-runs-test-2026-01-01.csv"');
    expect(res.send).toHaveBeenCalledWith('id,checkedAt,ok\nrun-1,2026-01-01T00:00:00Z,1');
  });

  it('versionSummary() delegates to service.versionSummary', async () => {
    service.versionSummary.mockResolvedValue({ stats: { total: 0 }, items: [] });
    const result = await controller.versionSummary(makeReq());
    expect(service.versionSummary).toHaveBeenCalledWith('user-1');
  });

  it('exportMonitors() delegates to service.exportMonitors', async () => {
    service.exportMonitors.mockResolvedValue({ version: '1', exportedAt: new Date().toISOString(), monitors: [] });
    await controller.exportMonitors(makeReq());
    expect(service.exportMonitors).toHaveBeenCalledWith('user-1');
  });

  it('importMonitors() delegates to service.importMonitors', async () => {
    service.importMonitors.mockResolvedValue({ imported: 2, errors: [] });
    const result = await controller.importMonitors(makeReq(), { monitors: [{ name: 'A', target: 'https://a.com', type: 'HTTP' }] as never[] });
    expect(service.importMonitors).toHaveBeenCalledWith('user-1', expect.any(Array));
    expect((result as Record<string, unknown>)['imported']).toBe(2);
  });

  it('importExternal() delegates to service.importExternal', async () => {
    service.importExternal.mockResolvedValue({ imported: 3, skipped: 0, errors: [], message: 'Imported 3 monitors.' });
    const body = { source: 'uptime-robot' as const, payload: { monitors: [] } };
    const result = await controller.importExternal(makeReq(), body);
    expect(service.importExternal).toHaveBeenCalledWith('user-1', 'uptime-robot', { monitors: [] });
    expect((result as Record<string, unknown>)['imported']).toBe(3);
  });

  it('listAlerts() delegates to service.listMonitorAlerts', async () => {
    service.listMonitorAlerts.mockResolvedValue([]);
    await controller.listAlerts(makeReq(), 'm-1');
    expect(service.listMonitorAlerts).toHaveBeenCalledWith('user-1', 'm-1');
  });

  it('addAlert() delegates to service.addMonitorAlert', async () => {
    service.addMonitorAlert.mockResolvedValue({ ok: true });
    await controller.addAlert(makeReq(), 'm-1', 'ch-1', {});
    expect(service.addMonitorAlert).toHaveBeenCalledWith('user-1', 'm-1', 'ch-1', undefined);
  });

  it('removeAlert() delegates to service.removeMonitorAlert', async () => {
    service.removeMonitorAlert.mockResolvedValue({ ok: true });
    await controller.removeAlert(makeReq(), 'm-1', 'ch-1');
    expect(service.removeMonitorAlert).toHaveBeenCalledWith('user-1', 'm-1', 'ch-1');
  });

  it('monitorUptime() passes valid period to service', async () => {
    service.monitorUptime.mockResolvedValue({ uptimePct: 99.5, totalChecks: 100, failedChecks: 0 });
    const result = await controller.monitorUptime(makeReq(), 'm-1', '7d');
    expect(service.monitorUptime).toHaveBeenCalledWith('user-1', 'm-1', '7d');
    expect(result).toEqual(expect.objectContaining({ uptimePct: 99.5 }));
  });

  it('monitorUptime() falls back to 30d for an invalid period', async () => {
    service.monitorUptime.mockResolvedValue({ uptimePct: 50, totalChecks: 10, failedChecks: 5 });
    await controller.monitorUptime(makeReq(), 'm-1', 'invalid-period');
    expect(service.monitorUptime).toHaveBeenCalledWith('user-1', 'm-1', '30d');
  });

  // ── Timeline Annotations (MonitorEvents) ──────────────────────────────

  it('listEvents() delegates to service.listEvents', async () => {
    const events = [{ id: 'ev-1', message: 'Deployed', eventType: 'deploy', createdAt: new Date() }];
    service.listEvents.mockResolvedValue({ events });
    const result = await controller.listEvents(makeReq(), 'm-1');
    expect(service.listEvents).toHaveBeenCalledWith('user-1', 'm-1');
    expect(result).toEqual({ events });
  });

  it('createEvent() delegates to service.createEvent with eventType', async () => {
    const event = { id: 'ev-2', message: 'v2.0 rollout', eventType: 'deploy', createdAt: new Date() };
    service.createEvent.mockResolvedValue(event);
    const result = await controller.createEvent(makeReq(), 'm-1', { message: 'v2.0 rollout', eventType: 'deploy' });
    expect(service.createEvent).toHaveBeenCalledWith('user-1', 'm-1', 'v2.0 rollout', 'deploy');
    expect(result).toEqual(event);
  });

  it('createEvent() defaults eventType to "note" when not specified', async () => {
    const event = { id: 'ev-3', message: 'Restarted', eventType: 'note', createdAt: new Date() };
    service.createEvent.mockResolvedValue(event);
    await controller.createEvent(makeReq(), 'm-1', { message: 'Restarted' });
    expect(service.createEvent).toHaveBeenCalledWith('user-1', 'm-1', 'Restarted', 'note');
  });

  it('deleteEvent() delegates to service.deleteEvent', async () => {
    service.deleteEvent.mockResolvedValue({ ok: true });
    const result = await controller.deleteEvent(makeReq(), 'm-1', 'ev-1');
    expect(service.deleteEvent).toHaveBeenCalledWith('user-1', 'm-1', 'ev-1');
    expect(result).toEqual({ ok: true });
  });

  // ── create() plan limit ────────────────────────────────────────────────

  it('create() throws ForbiddenException when plan limit is reached', async () => {
    const { ForbiddenException } = await import('@nestjs/common');
    const mockPlanService = { checkLimit: vi.fn().mockResolvedValue({ allowed: false, current: 50, limit: 50, plan: 'PRO' }) };
    const ctrl = new MonitorsController(service as never, mockPlanService as never);
    const dto = { name: 'Monitor', target: 'https://example.com', type: 'HTTP' as const, intervalSec: 60 };
    await expect(ctrl.create(makeReq(), dto as never)).rejects.toThrow(ForbiddenException);
  });

  // ── snooze() ──────────────────────────────────────────────────────────

  it('snooze() delegates to service.snooze with hours', async () => {
    service.snooze.mockResolvedValue({ ok: true });
    await controller.snooze(makeReq(), 'm-1', { hours: 4 });
    expect(service.snooze).toHaveBeenCalledWith('user-1', 'm-1', 4);
  });

  it('snooze() defaults hours to 1 when not provided', async () => {
    service.snooze.mockResolvedValue({ ok: true });
    await controller.snooze(makeReq(), 'm-1', {} as never);
    expect(service.snooze).toHaveBeenCalledWith('user-1', 'm-1', 1);
  });

  // ── monitorChart() ────────────────────────────────────────────────────

  it('monitorChart() passes valid period to service', async () => {
    service.monitorChart.mockResolvedValue({ buckets: [] });
    const result = await controller.monitorChart(makeReq(), 'm-1', '7d');
    expect(service.monitorChart).toHaveBeenCalledWith('user-1', 'm-1', '7d');
  });

  it('monitorChart() falls back to 7d for invalid period', async () => {
    service.monitorChart.mockResolvedValue({ buckets: [] });
    await controller.monitorChart(makeReq(), 'm-1', 'invalid');
    expect(service.monitorChart).toHaveBeenCalledWith('user-1', 'm-1', '7d');
  });

  // ── healthScore() ─────────────────────────────────────────────────────

  it('healthScore() delegates to service.getHealthScore', async () => {
    service.getHealthScore.mockResolvedValue({ score: 87, grade: 'A' });
    const result = await controller.healthScore(makeReq(), 'm-1');
    expect(service.getHealthScore).toHaveBeenCalledWith('user-1', 'm-1');
    expect(result).toEqual({ score: 87, grade: 'A' });
  });

  // ── healthSummary() ───────────────────────────────────────────────────

  it('healthSummary() delegates to service.getHealthSummary', async () => {
    service.getHealthSummary.mockResolvedValue({ scores: [], overall: { avg: 0 } });
    const result = await controller.healthSummary(makeReq());
    expect(service.getHealthSummary).toHaveBeenCalledWith('user-1');
  });

  // ── errorBudget() ─────────────────────────────────────────────────────

  it('errorBudget() parses slaTarget and period correctly', async () => {
    service.getErrorBudget.mockResolvedValue({ remaining: 0.1 });
    await controller.errorBudget(makeReq(), 'm-1', '99.5', '7d');
    expect(service.getErrorBudget).toHaveBeenCalledWith('m-1', 'user-1', { slaTarget: 99.5, period: '7d' });
  });

  it('errorBudget() defaults slaTarget to 99.9 and period to 30d when invalid', async () => {
    service.getErrorBudget.mockResolvedValue({ remaining: 0 });
    await controller.errorBudget(makeReq(), 'm-1', 'not-a-number', 'bad-period');
    expect(service.getErrorBudget).toHaveBeenCalledWith('m-1', 'user-1', { slaTarget: 99.9, period: '30d' });
  });

  it('errorBudget() defaults to 99.9 when slaTarget is out of range', async () => {
    service.getErrorBudget.mockResolvedValue({ remaining: 0 });
    await controller.errorBudget(makeReq(), 'm-1', '0', '30d');
    expect(service.getErrorBudget).toHaveBeenCalledWith('m-1', 'user-1', { slaTarget: 99.9, period: '30d' });
  });

  // ── updateAlert() ─────────────────────────────────────────────────────

  it('updateAlert() delegates to service.updateMonitorAlertNotifyOn', async () => {
    service.updateMonitorAlertNotifyOn.mockResolvedValue({ ok: true });
    await controller.updateAlert(makeReq(), 'm-1', 'ch-1', { notifyOn: 'ALWAYS' });
    expect(service.updateMonitorAlertNotifyOn).toHaveBeenCalledWith('user-1', 'm-1', 'ch-1', 'ALWAYS');
  });

  // ── addAlert with notifyOn ────────────────────────────────────────────

  it('addAlert() passes notifyOn from body', async () => {
    service.addMonitorAlert.mockResolvedValue({ ok: true });
    await controller.addAlert(makeReq(), 'm-1', 'ch-1', { notifyOn: 'FIRST_ONLY' });
    expect(service.addMonitorAlert).toHaveBeenCalledWith('user-1', 'm-1', 'ch-1', 'FIRST_ONLY');
  });

  // ── listDependencies / addDependency / removeDependency ───────────────

  it('listDependencies() delegates to service.listDependencies', async () => {
    service.listDependencies.mockResolvedValue([]);
    await controller.listDependencies(makeReq(), 'm-1');
    expect(service.listDependencies).toHaveBeenCalledWith('user-1', 'm-1');
  });

  it('addDependency() delegates to service.addDependency', async () => {
    service.addDependency.mockResolvedValue({ ok: true });
    await controller.addDependency(makeReq(), 'm-1', 'dep-1');
    expect(service.addDependency).toHaveBeenCalledWith('user-1', 'm-1', 'dep-1');
  });

  it('removeDependency() delegates to service.removeDependency', async () => {
    service.removeDependency.mockResolvedValue({ ok: true });
    await controller.removeDependency(makeReq(), 'm-1', 'dep-1');
    expect(service.removeDependency).toHaveBeenCalledWith('user-1', 'm-1', 'dep-1');
  });

  // ── getRecentRuns with since param ────────────────────────────────────

  it('getRecentRuns() parses since parameter', async () => {
    service.getRecentRuns.mockResolvedValue([]);
    const since = '2026-01-01T00:00:00Z';
    await controller.getRecentRuns(makeReq(), '5', since);
    expect(service.getRecentRuns).toHaveBeenCalledWith('user-1', 5, new Date(since));
  });

  // ── listDeliveries() ──────────────────────────────────────────────────

  it('listDeliveries() returns delivery history with counts', async () => {
    const { NotFoundException } = await import('@nestjs/common');
    const createdAt = new Date('2026-03-26T08:00:00Z');
    const mockPrisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'm-1', userId: 'user-1', name: 'My Monitor' }) },
      alertDeliveryLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'log-1',
            alertChannelId: 'ch-1',
            monitorId: 'm-1',
            status: 'success',
            trigger: 'monitor_failure',
            errorMessage: null,
            durationMs: 145,
            createdAt,
            alertChannel: { id: 'ch-1', name: 'Slack Alerts', type: 'slack' },
          },
          {
            id: 'log-2',
            alertChannelId: 'ch-1',
            monitorId: 'm-1',
            status: 'failed',
            trigger: 'monitor_recovery',
            errorMessage: 'Timeout',
            durationMs: 5000,
            createdAt,
            alertChannel: { id: 'ch-1', name: 'Slack Alerts', type: 'slack' },
          },
        ]),
      },
    };
    const ctrl = new MonitorsController(service as never, { checkLimit: vi.fn() } as never, mockPrisma as never);
    const result = await ctrl.listDeliveries(makeReq(), 'm-1') as Record<string, unknown>;
    expect(mockPrisma.monitor.findFirst).toHaveBeenCalledWith({ where: { id: 'm-1', userId: 'user-1' } });
    expect(result['total']).toBe(2);
    expect(result['successCount']).toBe(1);
    expect(result['failedCount']).toBe(1);
    const deliveries = result['deliveries'] as Array<Record<string, unknown>>;
    expect(deliveries[0]['channelName']).toBe('Slack Alerts');
    expect(deliveries[0]['channelType']).toBe('slack');
    expect(deliveries[0]['status']).toBe('success');
    expect(deliveries[1]['errorMessage']).toBe('Timeout');
  });

  it('listDeliveries() throws NotFoundException when monitor not found', async () => {
    const { NotFoundException } = await import('@nestjs/common');
    const mockPrisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue(null) },
      alertDeliveryLog: { findMany: vi.fn() },
    };
    const ctrl = new MonitorsController(service as never, { checkLimit: vi.fn() } as never, mockPrisma as never);
    await expect(ctrl.listDeliveries(makeReq(), 'no-such-id')).rejects.toThrow(NotFoundException);
  });

  it('listDeliveries() returns empty deliveries when none exist', async () => {
    const mockPrisma = {
      monitor: { findFirst: vi.fn().mockResolvedValue({ id: 'm-1', userId: 'user-1' }) },
      alertDeliveryLog: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const ctrl = new MonitorsController(service as never, { checkLimit: vi.fn() } as never, mockPrisma as never);
    const result = await ctrl.listDeliveries(makeReq(), 'm-1') as Record<string, unknown>;
    expect(result['total']).toBe(0);
    expect(result['successCount']).toBe(0);
    expect(result['failedCount']).toBe(0);
    expect(result['deliveries']).toEqual([]);
  });
});
