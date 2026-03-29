import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceGroupsController } from './service-groups.controller';

function makeService() {
  return {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    getStatus: vi.fn(),
  };
}

const req = { user: { id: 'u1' } };

describe('ServiceGroupsController', () => {
  let ctrl: ServiceGroupsController;
  let svc: ReturnType<typeof makeService>;

  beforeEach(() => {
    svc = makeService();
    ctrl = new ServiceGroupsController(svc as never);
  });

  it('list delegates to service', async () => {
    svc.list.mockResolvedValue([{ id: 'sg1', name: 'Core' }]);
    const result = await ctrl.list(req);
    expect(svc.list).toHaveBeenCalledWith('u1');
    expect(result).toHaveLength(1);
  });

  it('create delegates to service', async () => {
    const dto = { name: 'API Services', monitorIds: ['m1', 'm2'] };
    svc.create.mockResolvedValue({ id: 'sg1', ...dto });
    const result = await ctrl.create(req, dto as never);
    expect(svc.create).toHaveBeenCalledWith('u1', dto);
    expect(result.name).toBe('API Services');
  });

  it('update delegates to service', async () => {
    const dto = { name: 'Updated' };
    svc.update.mockResolvedValue({ id: 'sg1', name: 'Updated' });
    const result = await ctrl.update(req, 'sg1', dto as never);
    expect(svc.update).toHaveBeenCalledWith('u1', 'sg1', dto);
    expect(result.name).toBe('Updated');
  });

  it('remove delegates to service', async () => {
    svc.remove.mockResolvedValue(undefined);
    await ctrl.remove(req, 'sg1');
    expect(svc.remove).toHaveBeenCalledWith('u1', 'sg1');
  });

  it('getStatus delegates to service', async () => {
    svc.getStatus.mockResolvedValue({ status: 'operational', monitors: 3 });
    const result = await ctrl.getStatus(req, 'sg1');
    expect(svc.getStatus).toHaveBeenCalledWith('u1', 'sg1');
    expect(result.status).toBe('operational');
  });
});
