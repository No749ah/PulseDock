import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnnotationsController } from './annotations.controller';

function makeReq(userId = 'user-1') {
  return { user: { userId } };
}

function makeAnnotation(overrides = {}) {
  return {
    id: 'ann-1',
    monitorId: 'mon-1',
    userId: 'user-1',
    text: 'Deployed v2.1',
    color: 'blue',
    annotatedAt: new Date('2026-03-27T07:00:00Z'),
    createdAt: new Date('2026-03-27T07:00:00Z'),
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    monitor: {
      findFirst: vi.fn().mockResolvedValue({ id: 'mon-1' }),
    },
    monitorAnnotation: {
      findMany: vi.fn().mockResolvedValue([makeAnnotation()]),
      findFirst: vi.fn().mockResolvedValue(makeAnnotation()),
      create: vi.fn().mockResolvedValue(makeAnnotation()),
      update: vi.fn().mockResolvedValue(makeAnnotation({ text: 'Updated' })),
      delete: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

describe('AnnotationsController', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let ctrl: AnnotationsController;

  beforeEach(() => {
    prisma = makePrisma();
    ctrl = new AnnotationsController(prisma as never);
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns annotations for owned monitor', async () => {
      const result = await ctrl.list(makeReq(), 'mon-1');
      expect(result).toHaveProperty('annotations');
      expect((result as { annotations: unknown[] }).annotations).toHaveLength(1);
    });

    it('returns 404 when monitor not owned', async () => {
      prisma.monitor.findFirst.mockResolvedValue(null);
      const result = await ctrl.list(makeReq(), 'mon-99');
      expect((result as { statusCode: number }).statusCode).toBe(404);
    });

    it('queries annotations ordered by annotatedAt desc', async () => {
      await ctrl.list(makeReq(), 'mon-1');
      expect(prisma.monitorAnnotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { annotatedAt: 'desc' } }),
      );
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates annotation with provided fields', async () => {
      const result = await ctrl.create(makeReq(), 'mon-1', {
        text: 'Deployed v2.1',
        color: 'green',
        annotatedAt: '2026-03-27T07:00:00Z',
      });
      expect(result).toHaveProperty('annotation');
      expect(prisma.monitorAnnotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ text: 'Deployed v2.1', color: 'green' }),
        }),
      );
    });

    it('defaults color to blue when not provided', async () => {
      await ctrl.create(makeReq(), 'mon-1', {
        text: 'Test',
        annotatedAt: '2026-03-27T07:00:00Z',
      });
      expect(prisma.monitorAnnotation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ color: 'blue' }) }),
      );
    });

    it('returns 404 when monitor not owned', async () => {
      prisma.monitor.findFirst.mockResolvedValue(null);
      const result = await ctrl.create(makeReq(), 'mon-99', {
        text: 'Test',
        annotatedAt: '2026-03-27T07:00:00Z',
      });
      expect((result as { statusCode: number }).statusCode).toBe(404);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('updates text when provided', async () => {
      const result = await ctrl.update(makeReq(), 'mon-1', 'ann-1', { text: 'Updated label' });
      expect(result).toHaveProperty('annotation');
      expect(prisma.monitorAnnotation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ text: 'Updated label' }) }),
      );
    });

    it('returns 404 when annotation not found', async () => {
      prisma.monitorAnnotation.findFirst.mockResolvedValue(null);
      const result = await ctrl.update(makeReq(), 'mon-1', 'ann-99', { text: 'x' });
      expect((result as { statusCode: number }).statusCode).toBe(404);
    });

    it('does not update undefined fields', async () => {
      await ctrl.update(makeReq(), 'mon-1', 'ann-1', {});
      const call = prisma.monitorAnnotation.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(call.data).not.toHaveProperty('text');
      expect(call.data).not.toHaveProperty('color');
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('deletes annotation when found', async () => {
      await ctrl.remove(makeReq(), 'mon-1', 'ann-1');
      expect(prisma.monitorAnnotation.delete).toHaveBeenCalledWith({ where: { id: 'ann-1' } });
    });

    it('no-ops when annotation not found (idempotent)', async () => {
      prisma.monitorAnnotation.findFirst.mockResolvedValue(null);
      await ctrl.remove(makeReq(), 'mon-1', 'ann-99');
      expect(prisma.monitorAnnotation.delete).not.toHaveBeenCalled();
    });
  });
});
