import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { FeedbackController } from './feedback.controller';
import { PrismaService } from '../common/prisma.service';
import { AuthGuard } from '../common/auth.guard';

const makePrisma = () => ({
  toolTemplateFeedback: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
});

const makeReq = (overrides: Record<string, unknown> = {}) => ({
  user: { id: 'user-1', email: 'user@example.com', role: 'user', ...overrides },
});

describe('FeedbackController', () => {
  let controller: FeedbackController;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module = await Test.createTestingModule({
      controllers: [FeedbackController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(FeedbackController);
  });

  describe('reportTemplate', () => {
    it('creates a feedback record and returns received:true', async () => {
      prisma.toolTemplateFeedback.create.mockResolvedValue({ id: 'fb-1' });
      const result = await controller.reportTemplate(makeReq() as never, {
        toolId: 'grafana',
        endpoint: '/api/health',
        statusCode: 404,
        error: 'Not found',
        note: 'Endpoint changed',
      });
      expect(result).toEqual({ received: true });
      expect(prisma.toolTemplateFeedback.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ toolId: 'grafana', userId: 'user-1' }),
        }),
      );
    });

    it('truncates long error/note strings', async () => {
      prisma.toolTemplateFeedback.create.mockResolvedValue({ id: 'fb-2' });
      const longError = 'e'.repeat(2000);
      const longNote = 'n'.repeat(3000);
      await controller.reportTemplate(makeReq() as never, {
        toolId: 'prometheus',
        error: longError,
        note: longNote,
      });
      const callArg = prisma.toolTemplateFeedback.create.mock.calls[0][0].data;
      expect(callArg.error.length).toBeLessThanOrEqual(1000);
      expect(callArg.note.length).toBeLessThanOrEqual(2000);
    });

    it('handles optional fields being undefined', async () => {
      prisma.toolTemplateFeedback.create.mockResolvedValue({ id: 'fb-3' });
      const result = await controller.reportTemplate(makeReq() as never, { toolId: 'loki' });
      expect(result).toEqual({ received: true });
    });
  });

  describe('listReports', () => {
    it('returns all reports for admin users', async () => {
      const reports = [{ id: 'fb-1', toolId: 'grafana', createdAt: new Date(), userId: 'user-1' }];
      prisma.toolTemplateFeedback.findMany.mockResolvedValue(reports);
      const result = await controller.listReports(makeReq({ role: 'admin' }) as never);
      expect(result.total).toBe(1);
      expect(result.reports).toHaveLength(1);
      expect(prisma.toolTemplateFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('filters to own reports for non-admin users', async () => {
      prisma.toolTemplateFeedback.findMany.mockResolvedValue([]);
      await controller.listReports(makeReq() as never);
      expect(prisma.toolTemplateFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
    });
  });
});
