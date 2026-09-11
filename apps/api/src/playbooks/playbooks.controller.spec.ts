import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaybooksController } from './playbooks.controller';

function makeService() {
  return {
    findAll: vi.fn(),
    create: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    attachToMonitor: vi.fn(),
    getForIncident: vi.fn(),
    markStep: vi.fn(),
  };
}

const req = { user: { id: 'u1' } };

describe('PlaybooksController', () => {
  let ctrl: PlaybooksController;
  let svc: ReturnType<typeof makeService>;

  beforeEach(() => {
    svc = makeService();
    ctrl = new PlaybooksController(svc as never);
  });

  it('findAll delegates to service', async () => {
    svc.findAll.mockResolvedValue([{ id: 'pb1' }]);
    const result = await ctrl.findAll(req);
    expect(svc.findAll).toHaveBeenCalledWith('u1');
    expect(result).toHaveLength(1);
  });

  it('create delegates to service', async () => {
    const dto = { name: 'DB Outage', steps: [{ id: 's1', title: 'Check', type: 'check' }] };
    svc.create.mockResolvedValue({ id: 'pb1', ...dto });
    const result = await ctrl.create(req, dto as never);
    expect(svc.create).toHaveBeenCalledWith('u1', dto);
    expect(result.name).toBe('DB Outage');
  });

  it('findOne delegates to service', async () => {
    svc.findOne.mockResolvedValue({ id: 'pb1', name: 'Test' });
    const result = await ctrl.findOne(req, 'pb1');
    expect(svc.findOne).toHaveBeenCalledWith('u1', 'pb1');
    expect(result.name).toBe('Test');
  });

  it('update delegates to service', async () => {
    const dto = { name: 'Updated', steps: [{ id: 's1', title: 'New', type: 'check' }] };
    svc.update.mockResolvedValue({ id: 'pb1', ...dto });
    const result = await ctrl.update(req, 'pb1', dto as never);
    expect(svc.update).toHaveBeenCalledWith('u1', 'pb1', dto);
    expect(result.name).toBe('Updated');
  });

  it('remove delegates to service', async () => {
    svc.delete.mockResolvedValue(undefined);
    const result = await ctrl.remove(req, 'pb1');
    expect(svc.delete).toHaveBeenCalledWith('u1', 'pb1');
  });

  it('attachToMonitor delegates with playbookId', async () => {
    svc.attachToMonitor.mockResolvedValue({ id: 'mon1', playbookId: 'pb1' });
    const result = await ctrl.attachToMonitor(req, 'mon1', { playbookId: 'pb1' } as never);
    expect(svc.attachToMonitor).toHaveBeenCalledWith('u1', 'mon1', 'pb1');
    expect(result.playbookId).toBe('pb1');
  });

  it('getForIncident delegates to service', async () => {
    svc.getForIncident.mockResolvedValue({ steps: [], source: 'none' });
    const result = await ctrl.getForIncident(req, 'inc1');
    expect(svc.getForIncident).toHaveBeenCalledWith('u1', 'inc1');
    expect(result.source).toBe('none');
  });

  it('markStep delegates with done flag', async () => {
    svc.markStep.mockResolvedValue({});
    await ctrl.markStep(req, 'inc1', 's1', { done: true } as never);
    expect(svc.markStep).toHaveBeenCalledWith('u1', 'inc1', 's1', true);
  });
});
