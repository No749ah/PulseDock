import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { OnCallController } from './oncall.controller';
import { OnCallService } from './oncall.service';
import { AuthGuard } from '../common/auth.guard';

const makeService = () => ({
  createSchedule: vi.fn(),
  findAllSchedules: vi.fn(),
  getScheduleWithCurrentOnCall: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  addParticipant: vi.fn(),
  removeParticipant: vi.fn(),
  createPolicy: vi.fn(),
  findAllPolicies: vi.fn(),
  findPolicy: vi.fn(),
  updatePolicy: vi.fn(),
  deletePolicy: vi.fn(),
});

const req = (id = 'user-1') => ({ user: { id } } as never);

describe('OnCallController', () => {
  let controller: OnCallController;
  let service: ReturnType<typeof makeService>;

  beforeEach(async () => {
    service = makeService();
    const module = await Test.createTestingModule({
      controllers: [OnCallController],
      providers: [{ provide: OnCallService, useValue: service }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(OnCallController);
  });

  describe('Schedule endpoints', () => {
    it('createSchedule — delegates with userId and dto', async () => {
      service.createSchedule.mockResolvedValue({ id: 'sched-1' });
      const dto = { name: 'Primary On-Call', rotationDays: 7 };
      const result = await controller.createSchedule(req(), dto as never);
      expect(service.createSchedule).toHaveBeenCalledWith('user-1', dto);
      expect(result).toMatchObject({ id: 'sched-1' });
    });

    it('listSchedules — returns service result', async () => {
      service.findAllSchedules.mockResolvedValue([{ id: 'sched-1' }]);
      const result = await controller.listSchedules(req());
      expect(service.findAllSchedules).toHaveBeenCalledWith('user-1');
      expect(result).toHaveLength(1);
    });

    it('getSchedule — passes id and userId', async () => {
      service.getScheduleWithCurrentOnCall.mockResolvedValue({ id: 'sched-1', currentOnCall: null });
      await controller.getSchedule(req(), 'sched-1');
      expect(service.getScheduleWithCurrentOnCall).toHaveBeenCalledWith('user-1', 'sched-1');
    });

    it('updateSchedule — passes all params', async () => {
      service.updateSchedule.mockResolvedValue({ id: 'sched-1' });
      const dto = { name: 'Updated' };
      await controller.updateSchedule(req(), 'sched-1', dto as never);
      expect(service.updateSchedule).toHaveBeenCalledWith('user-1', 'sched-1', dto);
    });

    it('deleteSchedule — delegates to service', async () => {
      service.deleteSchedule.mockResolvedValue(undefined);
      await controller.deleteSchedule(req(), 'sched-1');
      expect(service.deleteSchedule).toHaveBeenCalledWith('user-1', 'sched-1');
    });

    it('addParticipant — delegates with all params', async () => {
      service.addParticipant.mockResolvedValue({ id: 'part-1' });
      const dto = { userId: 'user-2', order: 1 };
      await controller.addParticipant(req(), 'sched-1', dto as never);
      expect(service.addParticipant).toHaveBeenCalledWith('user-1', 'sched-1', dto);
    });

    it('removeParticipant — delegates to service', async () => {
      service.removeParticipant.mockResolvedValue(undefined);
      await controller.removeParticipant(req(), 'sched-1', 'part-1');
      expect(service.removeParticipant).toHaveBeenCalledWith('user-1', 'sched-1', 'part-1');
    });
  });

  describe('Escalation Policy endpoints', () => {
    it('createPolicy — delegates with userId and dto', async () => {
      service.createPolicy.mockResolvedValue({ id: 'pol-1' });
      const dto = { name: 'Default Policy', rules: [] };
      const result = await controller.createPolicy(req(), dto as never);
      expect(service.createPolicy).toHaveBeenCalledWith('user-1', dto);
      expect(result).toMatchObject({ id: 'pol-1' });
    });

    it('listPolicies — returns service result', async () => {
      service.findAllPolicies.mockResolvedValue([{ id: 'pol-1' }]);
      const result = await controller.listPolicies(req());
      expect(service.findAllPolicies).toHaveBeenCalledWith('user-1');
      expect(result).toHaveLength(1);
    });

    it('getPolicy — passes id and userId', async () => {
      service.findPolicy.mockResolvedValue({ id: 'pol-1', rules: [] });
      await controller.getPolicy(req(), 'pol-1');
      expect(service.findPolicy).toHaveBeenCalledWith('user-1', 'pol-1');
    });

    it('updatePolicy — passes all params', async () => {
      service.updatePolicy.mockResolvedValue({ id: 'pol-1' });
      const dto = { name: 'Updated Policy' };
      await controller.updatePolicy(req(), 'pol-1', dto as never);
      expect(service.updatePolicy).toHaveBeenCalledWith('user-1', 'pol-1', dto);
    });

    it('deletePolicy — delegates to service', async () => {
      service.deletePolicy.mockResolvedValue(undefined);
      await controller.deletePolicy(req(), 'pol-1');
      expect(service.deletePolicy).toHaveBeenCalledWith('user-1', 'pol-1');
    });
  });
});
