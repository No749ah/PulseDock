import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { AuthGuard } from '../common/auth.guard';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

const mockWindow = {
  id: 'mw-1',
  userId: 'user-1',
  name: 'DB Upgrade',
  description: null,
  startsAt: new Date('2026-03-16T02:00:00Z'),
  endsAt: new Date('2026-03-16T04:00:00Z'),
  monitorIds: ['mon-1'],
  monitorCount: 1,
  isActive: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

class MockAuthGuard implements CanActivate {
  canActivate(_ctx: ExecutionContext): boolean {
    return true;
  }
}

describe('MaintenanceController', () => {
  let controller: MaintenanceController;
  let service: Partial<MaintenanceService> & Record<string, ReturnType<typeof vi.fn>>;

  const req = { user: { id: 'user-1' } };

  beforeEach(async () => {
    const mockService = {
      list: vi.fn().mockResolvedValue([mockWindow]),
      listActive: vi.fn().mockResolvedValue([]),
      getOne: vi.fn().mockResolvedValue(mockWindow),
      create: vi.fn().mockResolvedValue(mockWindow),
      update: vi.fn().mockResolvedValue(mockWindow),
      remove: vi.fn().mockResolvedValue({ ok: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaintenanceController],
      providers: [{ provide: MaintenanceService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useClass(MockAuthGuard)
      .compile();

    controller = module.get<MaintenanceController>(MaintenanceController);
    service = module.get(MaintenanceService);
  });

  describe('list()', () => {
    it('returns maintenance windows for the user', async () => {
      const result = await controller.list(req as never);
      expect(service.list).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([mockWindow]);
    });
  });

  describe('listActive()', () => {
    it('returns currently active windows', async () => {
      const result = await controller.listActive(req as never);
      expect(service.listActive).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('getOne()', () => {
    it('returns a single window by id', async () => {
      const result = await controller.getOne('mw-1', req as never);
      expect(service.getOne).toHaveBeenCalledWith('mw-1', 'user-1');
      expect(result).toEqual(mockWindow);
    });
  });

  describe('create()', () => {
    it('creates and returns a window', async () => {
      const dto = {
        name: 'DB Upgrade',
        startsAt: '2026-03-16T02:00:00Z',
        endsAt: '2026-03-16T04:00:00Z',
        monitorIds: ['mon-1'],
      };
      const result = await controller.create(req as never, dto as never);
      expect(service.create).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(mockWindow);
    });
  });

  describe('update()', () => {
    it('updates and returns the window', async () => {
      const dto = { name: 'DB Upgrade v2' };
      const result = await controller.update('mw-1', req as never, dto as never);
      expect(service.update).toHaveBeenCalledWith('mw-1', 'user-1', dto);
      expect(result).toEqual(mockWindow);
    });
  });

  describe('remove()', () => {
    it('removes the window and returns ok', async () => {
      const result = await controller.remove('mw-1', req as never);
      expect(service.remove).toHaveBeenCalledWith('mw-1', 'user-1');
      expect(result).toEqual({ ok: true });
    });
  });
});
