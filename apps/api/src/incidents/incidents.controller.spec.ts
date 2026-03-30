import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthGuard } from '../common/auth.guard';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { IncidentStatus, IncidentSeverity } from '@prisma/client';

const mockIncident = {
  id: 'inc-1',
  userId: 'user-1',
  title: 'API degraded',
  description: 'High error rate',
  status: IncidentStatus.INVESTIGATING,
  severity: IncidentSeverity.HIGH,
  resolvedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  updates: [],
  monitors: [],
};

class MockAuthGuard implements CanActivate {
  canActivate(_ctx: ExecutionContext): boolean {
    return true;
  }
}

describe('IncidentsController', () => {
  let controller: IncidentsController;
  let service: Partial<IncidentsService> & Record<string, ReturnType<typeof vi.fn>>;

  const req = { user: { id: 'user-1', sub: 'user-1', role: 'user' } };

  beforeEach(async () => {
    const mockService = {
      findAll: vi.fn().mockResolvedValue([mockIncident]),
      findOne: vi.fn().mockResolvedValue(mockIncident),
      create: vi.fn().mockResolvedValue(mockIncident),
      update: vi.fn().mockResolvedValue({ ...mockIncident, title: 'Updated' }),
      addUpdate: vi.fn().mockResolvedValue({
        id: 'upd-1',
        incidentId: 'inc-1',
        body: 'Root cause identified',
        status: IncidentStatus.IDENTIFIED,
        createdAt: new Date(),
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IncidentsController],
      providers: [{ provide: IncidentsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useClass(MockAuthGuard)
      .compile();

    controller = module.get<IncidentsController>(IncidentsController);
    service = module.get(IncidentsService);
  });

  describe('findAll()', () => {
    it('returns incidents for the authenticated user', async () => {
      const result = await controller.findAll(req as never);
      expect(service.findAll).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([mockIncident]);
    });
  });

  describe('findOne()', () => {
    it('returns a single incident by id', async () => {
      const result = await controller.findOne(req as never, 'inc-1');
      expect(service.findOne).toHaveBeenCalledWith('user-1', 'inc-1');
      expect(result).toEqual(mockIncident);
    });
  });

  describe('create()', () => {
    it('creates and returns a new incident', async () => {
      const body = { title: 'API degraded', severity: IncidentSeverity.HIGH };
      const result = await controller.create(req as never, body as never);
      expect(service.create).toHaveBeenCalledWith('user-1', body);
      expect(result).toEqual(mockIncident);
    });
  });

  describe('update()', () => {
    it('updates and returns the incident', async () => {
      const body = { title: 'Updated', status: IncidentStatus.IDENTIFIED };
      const result = await controller.update(req as never, 'inc-1', body as never);
      expect(service.update).toHaveBeenCalledWith('user-1', 'inc-1', body);
      expect((result as unknown as typeof mockIncident).title).toBe('Updated');
    });
  });

  describe('addUpdate()', () => {
    it('posts a timeline update to the incident', async () => {
      const body = { body: 'Root cause identified', status: IncidentStatus.IDENTIFIED };
      const result = await controller.addUpdate(req as never, 'inc-1', body as never);
      expect(service.addUpdate).toHaveBeenCalledWith('user-1', 'inc-1', body);
      expect((result as { body: string }).body).toBe('Root cause identified');
    });
  });

  describe('delete()', () => {
    it('deletes the incident and returns undefined', async () => {
      const result = await controller.delete(req as never, 'inc-1');
      expect(service.delete).toHaveBeenCalledWith('user-1', 'inc-1');
      expect(result).toBeUndefined();
    });
  });
});
