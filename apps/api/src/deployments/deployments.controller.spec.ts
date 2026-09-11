import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeploymentsController, PublicDeploymentsController } from './deployments.controller';

function makeMocks() {
  const svc = {
    create: vi.fn(),
    list: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    generateDeployToken: vi.fn(),
    getSummary: vi.fn(),
    listByMonitor: vi.fn(),
    getMonitorImpact: vi.fn(),
    receiveWebhook: vi.fn(),
  };
  const monitorsService = {
    runNow: vi.fn(),
  };
  return { svc, monitorsService };
}

function makeReq(userId = 'u1') {
  return { user: { id: userId } };
}

describe('DeploymentsController', () => {
  let ctrl: DeploymentsController;
  let svc: ReturnType<typeof makeMocks>['svc'];
  let monitorsService: ReturnType<typeof makeMocks>['monitorsService'];

  beforeEach(() => {
    const mocks = makeMocks();
    svc = mocks.svc;
    monitorsService = mocks.monitorsService;
    ctrl = new DeploymentsController(svc as never, monitorsService as never);
  });

  it('create delegates to service', async () => {
    svc.create.mockResolvedValue({ id: 'ev1' });
    const result = await ctrl.create(makeReq(), { service: 'api' } as never);
    expect(svc.create).toHaveBeenCalledWith('u1', { service: 'api' });
    expect(result.id).toBe('ev1');
  });

  it('list parses days param', async () => {
    svc.list.mockResolvedValue([]);
    await ctrl.list(makeReq(), 'api', undefined, undefined, '14');
    expect(svc.list).toHaveBeenCalledWith('u1', { service: 'api', environment: undefined, status: undefined, days: 14 });
  });

  it('list defaults days to 30', async () => {
    svc.list.mockResolvedValue([]);
    await ctrl.list(makeReq());
    expect(svc.list).toHaveBeenCalledWith('u1', expect.objectContaining({ days: 30 }));
  });

  it('findOne delegates to service', async () => {
    svc.findOne.mockResolvedValue({ id: 'ev1' });
    const result = await ctrl.findOne(makeReq(), 'ev1');
    expect(result.id).toBe('ev1');
  });

  it('update delegates to service', async () => {
    svc.update.mockResolvedValue({ id: 'ev1', status: 'SUCCESS' });
    const result = await ctrl.update(makeReq(), 'ev1', { status: 'SUCCESS' } as never);
    expect(svc.update).toHaveBeenCalledWith('u1', 'ev1', { status: 'SUCCESS' });
    expect(result.status).toBe('SUCCESS');
  });

  it('remove delegates to service', async () => {
    svc.remove.mockResolvedValue({ deleted: true });
    const result = await ctrl.remove(makeReq(), 'ev1');
    expect(result.deleted).toBe(true);
  });

  it('generateToken delegates to service', async () => {
    svc.generateDeployToken.mockResolvedValue({ token: 'pd_deploy_abc' });
    const result = await ctrl.generateToken(makeReq());
    expect(result.token).toMatch(/^pd_deploy_/);
  });

  it('getSummary parses days param', async () => {
    svc.getSummary.mockResolvedValue({ total: 5 });
    await ctrl.getSummary(makeReq(), '7');
    expect(svc.getSummary).toHaveBeenCalledWith('u1', 7);
  });

  it('listByMonitor delegates with parsed days', async () => {
    svc.listByMonitor.mockResolvedValue([]);
    await ctrl.listByMonitor(makeReq(), 'm1', '14');
    expect(svc.listByMonitor).toHaveBeenCalledWith('u1', 'm1', 14);
  });

  it('getMonitorImpact delegates correctly', async () => {
    svc.getMonitorImpact.mockResolvedValue({ before: 100, after: 150 });
    const result = await ctrl.getMonitorImpact(makeReq(), 'dep1', 'm1');
    expect(svc.getMonitorImpact).toHaveBeenCalledWith('u1', 'm1', 'dep1');
    expect(result.after).toBe(150);
  });

  describe('verifyDeployment', () => {
    it('returns empty results when no monitors linked', async () => {
      svc.findOne.mockResolvedValue({ id: 'ev1', monitorIds: [] });
      const result = await ctrl.verifyDeployment(makeReq(), 'ev1');
      expect(result.results).toEqual([]);
      expect(result.message).toBe('No monitors linked to this deployment');
    });

    it('runs checks on linked monitors and returns results', async () => {
      svc.findOne.mockResolvedValue({ id: 'ev1', monitorIds: ['m1', 'm2'] });
      monitorsService.runNow
        .mockResolvedValueOnce({ ok: true, level: 'green', latencyMs: 50, message: null, statusCode: 200 })
        .mockRejectedValueOnce(new Error('Timeout'));

      const result = await ctrl.verifyDeployment(makeReq(), 'ev1');
      expect(result.deploymentId).toBe('ev1');
      expect(result.results).toHaveLength(2);
      expect(result.results[0].ok).toBe(true);
      expect(result.results[1].ok).toBe(false);
      expect(result.results[1].level).toBe('error');
      expect(result.results[1].message).toBe('Timeout');
    });
  });
});

describe('PublicDeploymentsController', () => {
  it('receive delegates to receiveWebhook', async () => {
    const { svc } = makeMocks();
    const ctrl = new PublicDeploymentsController(svc as never);
    svc.receiveWebhook.mockResolvedValue({ id: 'ev1' });
    const result = await ctrl.receive('pd_deploy_xyz', { service: 'api' } as never);
    expect(svc.receiveWebhook).toHaveBeenCalledWith('pd_deploy_xyz', { service: 'api' });
    expect(result.id).toBe('ev1');
  });
});
