import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EscalationController } from './escalation.controller';

function makeService() {
  return {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
}

const req = { user: { id: 'u1' } };

describe('EscalationController', () => {
  let ctrl: EscalationController;
  let svc: ReturnType<typeof makeService>;

  beforeEach(() => {
    svc = makeService();
    ctrl = new EscalationController(svc as never);
  });

  it('list delegates to service', async () => {
    svc.list.mockResolvedValue([{ id: 'ep1' }]);
    const result = await ctrl.list(req);
    expect(svc.list).toHaveBeenCalledWith('u1');
    expect(result).toHaveLength(1);
  });

  it('findOne delegates to service', async () => {
    svc.findOne.mockResolvedValue({ id: 'ep1', name: 'Critical' });
    const result = await ctrl.findOne(req, 'ep1');
    expect(svc.findOne).toHaveBeenCalledWith('u1', 'ep1');
    expect(result.name).toBe('Critical');
  });

  it('create delegates to service', async () => {
    const dto = { name: 'New Policy', steps: [{ delayMinutes: 5, channelIds: ['ch1'] }] };
    svc.create.mockResolvedValue({ id: 'ep1', ...dto });
    const result = await ctrl.create(req, dto as never);
    expect(svc.create).toHaveBeenCalledWith('u1', dto);
    expect(result.name).toBe('New Policy');
  });

  it('update delegates to service', async () => {
    const dto = { name: 'Updated' };
    svc.update.mockResolvedValue({ id: 'ep1', name: 'Updated' });
    const result = await ctrl.update(req, 'ep1', dto as never);
    expect(svc.update).toHaveBeenCalledWith('u1', 'ep1', dto);
    expect(result.name).toBe('Updated');
  });

  it('remove delegates to service', async () => {
    svc.remove.mockResolvedValue(undefined);
    await ctrl.remove(req, 'ep1');
    expect(svc.remove).toHaveBeenCalledWith('u1', 'ep1');
  });
});
