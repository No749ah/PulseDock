import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AuthGuard } from '../common/auth.guard';

const mockAuthGuard = { canActivate: (ctx: ExecutionContext) => { const req = ctx.switchToHttp().getRequest(); req.user = req.user ?? { id: 'user1' }; return true; } };

const mockReport = {
  id: 'rep1',
  userId: 'user1',
  enabled: true,
  frequency: 'weekly' as const,
  dayOfWeek: 1,
  hourUTC: 8,
  lastSentAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockReportsService = {
  getReport: vi.fn(),
  upsertReport: vi.fn(),
  deleteReport: vi.fn(),
};

describe('ReportsController', () => {
  let controller: ReportsController;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: mockReportsService }],
    }).overrideGuard(AuthGuard).useValue(mockAuthGuard).compile();

    controller = module.get<ReportsController>(ReportsController);
  });

  describe('getReport()', () => {
    it('returns report config when it exists', async () => {
      mockReportsService.getReport.mockResolvedValue(mockReport);
      const req = { user: { id: 'user1' } };
      const result = await controller.getReport(req);
      expect(result).toEqual(mockReport);
      expect(mockReportsService.getReport).toHaveBeenCalledWith('user1');
    });

    it('returns null when no report config found', async () => {
      mockReportsService.getReport.mockResolvedValue(null);
      const req = { user: { id: 'user1' } };
      const result = await controller.getReport(req);
      expect(result).toBeNull();
    });
  });

  describe('upsertReport()', () => {
    it('creates or updates report config', () => {
      mockReportsService.upsertReport.mockResolvedValue(mockReport);
      const req = { user: { id: 'user1' } };
      const dto = { enabled: true, frequency: 'weekly' as const, dayOfWeek: 1, hourUTC: 8 };
      const result = controller.upsertReport(req, dto);
      expect(mockReportsService.upsertReport).toHaveBeenCalledWith('user1', dto);
      expect(result).toBeDefined();
    });
  });

  describe('deleteReport()', () => {
    it('deletes report config', async () => {
      mockReportsService.deleteReport.mockResolvedValue(undefined);
      const req = { user: { id: 'user1' } };
      await controller.deleteReport(req);
      expect(mockReportsService.deleteReport).toHaveBeenCalledWith('user1');
    });
  });
});
