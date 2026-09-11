import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, ConflictException } from '@nestjs/common';
import { StatusPagesController } from './status-pages.controller';
import { StatusPagesService } from './status-pages.service';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeService() {
  return {
    findAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 'page-1', title: 'Test' }),
    findOne: vi.fn().mockResolvedValue({ id: 'page-1', title: 'Test' }),
    update: vi.fn().mockResolvedValue({ id: 'page-1', title: 'Updated' }),
    publish: vi.fn().mockResolvedValue({ id: 'page-1', isPublished: true }),
    remove: vi.fn().mockResolvedValue({ deleted: true }),
    findPublic: vi.fn().mockResolvedValue({ id: 'page-1', title: 'Public Page', monitors: [] }),
    getWidgetData: vi.fn().mockResolvedValue({ widgetType: 'uptime-bar', uptimePct: 99.5 }),
    findPreview: vi.fn().mockResolvedValue({ id: 'page-1', title: 'Preview', monitors: [] }),
    getPreviewWidgetData: vi.fn().mockResolvedValue({ widgetType: 'uptime-bar', uptimePct: 99.9 }),
    getHistory: vi.fn().mockResolvedValue([{ id: 'h1', savedAt: '2026-01-01' }]),
    restoreHistory: vi.fn().mockResolvedValue({ id: 'page-1', title: 'Restored' }),
    checkSlugAvailability: vi.fn().mockResolvedValue({ available: true, valid: true, slug: 'test' }),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    subscribeToStatusPage: vi.fn().mockResolvedValue({ alreadySubscribed: false }),
    getRssFeed: vi.fn().mockResolvedValue('<rss>...</rss>'),
    getPublicJson: vi.fn().mockResolvedValue({ status: 'operational', monitors: [] }),
  } as unknown as StatusPagesService;
}

function makeReq(userId = 'user-1') {
  return { user: { id: userId } } as { user: { id: string } };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('StatusPagesController', () => {
  let controller: StatusPagesController;
  let service: ReturnType<typeof makeService>;

  beforeEach(() => {
    service = makeService();
    const mockPlanService = { checkLimit: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: -1, plan: 'COMMUNITY' }) };
    controller = new StatusPagesController(service as unknown as StatusPagesService, mockPlanService as never);
  });

  // ── list() ────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('calls findAll with userId from request', async () => {
      const req = makeReq('user-42');
      await controller.list(req);
      expect(service.findAll).toHaveBeenCalledWith('user-42');
    });

    it('returns the result from findAll', async () => {
      const pages = [{ id: 'p1' }, { id: 'p2' }];
      (service.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(pages);
      const result = await controller.list(makeReq());
      expect(result).toEqual(pages);
    });
  });

  // ── create() ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('calls create with userId and body', async () => {
      const req = makeReq('user-1');
      const dto = { title: 'My Page' };
      await controller.create(req, dto);
      expect(service.create).toHaveBeenCalledWith('user-1', dto);
    });

    it('returns the created page', async () => {
      const page = { id: 'page-99', title: 'New Page' };
      (service.create as ReturnType<typeof vi.fn>).mockResolvedValue(page);
      const result = await controller.create(makeReq(), { title: 'New Page' });
      expect(result).toEqual(page);
    });
  });

  // ── findOne() ─────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('calls findOne with userId and id', async () => {
      await controller.findOne(makeReq('user-1'), 'page-5');
      expect(service.findOne).toHaveBeenCalledWith('user-1', 'page-5');
    });

    it('returns the page from service', async () => {
      const page = { id: 'page-5', title: 'Found Page' };
      (service.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(page);
      const result = await controller.findOne(makeReq(), 'page-5');
      expect(result).toEqual(page);
    });
  });

  // ── update() ──────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('calls update with userId, id, and body from request', async () => {
      const dto = { title: 'Updated Title' };
      const req = { ...makeReq('user-1'), body: dto } as any;
      await controller.update(req, 'page-3');
      expect(service.update).toHaveBeenCalledWith('user-1', 'page-3', dto);
    });

    it('returns the updated page', async () => {
      const updated = { id: 'page-3', title: 'Updated Title' };
      (service.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);
      const req = { ...makeReq(), body: { title: 'Updated Title' } } as any;
      const result = await controller.update(req, 'page-3');
      expect(result).toEqual(updated);
    });
  });

  // ── publish() ─────────────────────────────────────────────────────────────

  describe('publish()', () => {
    it('calls publish with userId and id', async () => {
      await controller.publish(makeReq('user-1'), 'page-7');
      expect(service.publish).toHaveBeenCalledWith('user-1', 'page-7');
    });

    it('returns the result from service', async () => {
      const published = { id: 'page-7', isPublished: true };
      (service.publish as ReturnType<typeof vi.fn>).mockResolvedValue(published);
      const result = await controller.publish(makeReq(), 'page-7');
      expect(result).toEqual(published);
    });

    it('returns unpublished result when service toggles off', async () => {
      const unpublished = { id: 'page-7', isPublished: false };
      (service.publish as ReturnType<typeof vi.fn>).mockResolvedValue(unpublished);
      const result = await controller.publish(makeReq(), 'page-7');
      expect(result).toEqual(unpublished);
    });
  });

  // ── remove() ──────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('calls remove with userId and id', async () => {
      await controller.remove(makeReq('user-1'), 'page-4');
      expect(service.remove).toHaveBeenCalledWith('user-1', 'page-4');
    });

    it('returns { deleted: true }', async () => {
      const result = await controller.remove(makeReq(), 'page-4');
      expect(result).toEqual({ deleted: true });
    });
  });

  // ── findPublic() ──────────────────────────────────────────────────────────

  describe('findPublic()', () => {
    it('calls findPublic with slug (no password)', async () => {
      await controller.findPublic('my-page');
      expect(service.findPublic).toHaveBeenCalledWith('my-page', undefined);
    });

    it('calls findPublic with slug and password', async () => {
      await controller.findPublic('my-page', 'secret123');
      expect(service.findPublic).toHaveBeenCalledWith('my-page', 'secret123');
    });

    it('returns the public page data', async () => {
      const page = { id: 'p1', title: 'Public', monitors: [] };
      (service.findPublic as ReturnType<typeof vi.fn>).mockResolvedValue(page);
      const result = await controller.findPublic('my-page');
      expect(result).toEqual(page);
    });
  });

  // ── getWidgetData() ───────────────────────────────────────────────────────

  describe('getWidgetData()', () => {
    it('calls getWidgetData with slug, widgetId, and no password', async () => {
      await controller.getWidgetData('my-page', 'widget-1');
      expect(service.getWidgetData).toHaveBeenCalledWith('my-page', 'widget-1', undefined, undefined);
    });

    it('calls getWidgetData with password when provided', async () => {
      await controller.getWidgetData('my-page', 'widget-1', 'secret');
      expect(service.getWidgetData).toHaveBeenCalledWith('my-page', 'widget-1', 'secret', undefined);
    });

    it('returns the widget data from service', async () => {
      const widgetData = { widgetType: 'uptime-bar', uptimePct: 99.5, monitorId: 'm1' };
      (service.getWidgetData as ReturnType<typeof vi.fn>).mockResolvedValue(widgetData);
      const result = await controller.getWidgetData('my-page', 'widget-1');
      expect(result).toEqual(widgetData);
    });

    it('passes all arguments correctly for current-status-badge widget', async () => {
      const badgeData = { widgetType: 'current-status-badge', level: 'green', monitorId: 'm2' };
      (service.getWidgetData as ReturnType<typeof vi.fn>).mockResolvedValue(badgeData);
      const result = await controller.getWidgetData('status-page', 'badge-widget', 'pass123', undefined);
      expect(service.getWidgetData).toHaveBeenCalledWith('status-page', 'badge-widget', 'pass123', undefined);
      expect(result).toEqual(badgeData);
    });

    it('passes range param when provided', async () => {
      const widgetData = { widgetType: 'uptime-bar', uptimePct: 98.5 };
      (service.getWidgetData as ReturnType<typeof vi.fn>).mockResolvedValue(widgetData);
      const result = await controller.getWidgetData('my-page', 'widget-1', undefined, '30d');
      expect(service.getWidgetData).toHaveBeenCalledWith('my-page', 'widget-1', undefined, '30d');
      expect(result).toEqual(widgetData);
    });

    it('passes range and password together', async () => {
      const widgetData = { widgetType: 'uptime-timeline', days: 90 };
      (service.getWidgetData as ReturnType<typeof vi.fn>).mockResolvedValue(widgetData);
      const result = await controller.getWidgetData('locked-page', 'timeline-w', 'secret', '90d');
      expect(service.getWidgetData).toHaveBeenCalledWith('locked-page', 'timeline-w', 'secret', '90d');
      expect(result).toEqual(widgetData);
    });
  });

  // ── create() plan limit ───────────────────────────────────────────────────

  describe('create() — plan limit enforcement', () => {
    it('throws ForbiddenException when plan limit reached', async () => {
      const mockPlanService = {
        checkLimit: vi.fn().mockResolvedValue({ allowed: false, current: 5, limit: 5, plan: 'COMMUNITY' }),
      };
      const ctrl = new StatusPagesController(service as unknown as StatusPagesService, mockPlanService as never);
      await expect(ctrl.create(makeReq(), { title: 'Overflow' })).rejects.toThrow(ForbiddenException);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('includes plan details in error body', async () => {
      const mockPlanService = {
        checkLimit: vi.fn().mockResolvedValue({ allowed: false, current: 3, limit: 3, plan: 'STARTER' }),
      };
      const ctrl = new StatusPagesController(service as unknown as StatusPagesService, mockPlanService as never);
      try {
        await ctrl.create(makeReq(), { title: 'Over' });
        expect.unreachable('should have thrown');
      } catch (e: unknown) {
        const err = e as ForbiddenException;
        const body = err.getResponse() as Record<string, unknown>;
        expect(body.code).toBe('PLAN_LIMIT');
        expect(body.resource).toBe('status-pages');
        expect(body.current).toBe(3);
        expect(body.limit).toBe(3);
      }
    });
  });

  // ── update() edge cases ───────────────────────────────────────────────────

  describe('update() — edge cases', () => {
    it('defaults to empty object when body is null', async () => {
      const req = { user: { id: 'u1' }, body: null } as never;
      await controller.update(req, 'page-1');
      expect(service.update).toHaveBeenCalledWith('u1', 'page-1', {});
    });

    it('defaults to empty object when body is undefined', async () => {
      const req = { user: { id: 'u1' }, body: undefined } as never;
      await controller.update(req, 'page-1');
      expect(service.update).toHaveBeenCalledWith('u1', 'page-1', {});
    });

    it('defaults to empty object when body is an array', async () => {
      const req = { user: { id: 'u1' }, body: [1, 2, 3] } as never;
      await controller.update(req, 'page-1');
      expect(service.update).toHaveBeenCalledWith('u1', 'page-1', {});
    });
  });

  // ── getPreview() ──────────────────────────────────────────────────────────

  describe('getPreview()', () => {
    it('calls findPreview with userId and id', async () => {
      await controller.getPreview(makeReq('u1'), 'page-10');
      expect(service.findPreview).toHaveBeenCalledWith('u1', 'page-10');
    });

    it('returns the preview data', async () => {
      const preview = { id: 'page-10', monitors: [{ id: 'm1', level: 'green' }] };
      (service.findPreview as ReturnType<typeof vi.fn>).mockResolvedValue(preview);
      const result = await controller.getPreview(makeReq(), 'page-10');
      expect(result).toEqual(preview);
    });
  });

  // ── getPreviewWidgetData() ────────────────────────────────────────────────

  describe('getPreviewWidgetData()', () => {
    it('calls service with all params', async () => {
      await controller.getPreviewWidgetData(makeReq('u1'), 'page-5', 'w-1', '30d');
      expect(service.getPreviewWidgetData).toHaveBeenCalledWith('u1', 'page-5', 'w-1', '30d');
    });

    it('passes undefined range when not provided', async () => {
      await controller.getPreviewWidgetData(makeReq('u2'), 'page-6', 'w-2');
      expect(service.getPreviewWidgetData).toHaveBeenCalledWith('u2', 'page-6', 'w-2', undefined);
    });

    it('returns widget data', async () => {
      const data = { widgetType: 'sla-summary', actual: 99.95 };
      (service.getPreviewWidgetData as ReturnType<typeof vi.fn>).mockResolvedValue(data);
      const result = await controller.getPreviewWidgetData(makeReq(), 'p1', 'w1');
      expect(result).toEqual(data);
    });
  });

  // ── getHistory() ──────────────────────────────────────────────────────────

  describe('getHistory()', () => {
    it('calls getHistory with userId and id', async () => {
      await controller.getHistory(makeReq('u1'), 'page-3');
      expect(service.getHistory).toHaveBeenCalledWith('u1', 'page-3');
    });

    it('returns history entries', async () => {
      const history = [{ id: 'h1', savedAt: '2026-01-01' }, { id: 'h2', savedAt: '2026-01-02' }];
      (service.getHistory as ReturnType<typeof vi.fn>).mockResolvedValue(history);
      const result = await controller.getHistory(makeReq(), 'page-3');
      expect(result).toEqual(history);
    });
  });

  // ── restoreHistory() ──────────────────────────────────────────────────────

  describe('restoreHistory()', () => {
    it('calls restoreHistory with userId, pageId, historyId', async () => {
      await controller.restoreHistory(makeReq('u1'), 'page-3', 'h5');
      expect(service.restoreHistory).toHaveBeenCalledWith('u1', 'page-3', 'h5');
    });

    it('returns the restored page', async () => {
      const restored = { id: 'page-3', title: 'Restored', layout: { widgets: [] } };
      (service.restoreHistory as ReturnType<typeof vi.fn>).mockResolvedValue(restored);
      const result = await controller.restoreHistory(makeReq(), 'page-3', 'h5');
      expect(result).toEqual(restored);
    });
  });

  // ── checkSlug() ───────────────────────────────────────────────────────────

  describe('checkSlug()', () => {
    it('calls checkSlugAvailability with slug and no excludeId', async () => {
      await controller.checkSlug(makeReq('u1'), 'my-slug');
      expect(service.checkSlugAvailability).toHaveBeenCalledWith('u1', 'my-slug', undefined);
    });

    it('passes excludeId when provided', async () => {
      await controller.checkSlug(makeReq('u1'), 'my-slug', 'page-99');
      expect(service.checkSlugAvailability).toHaveBeenCalledWith('u1', 'my-slug', 'page-99');
    });

    it('returns availability result', async () => {
      const check = { available: false, valid: true, slug: 'taken-slug' };
      (service.checkSlugAvailability as ReturnType<typeof vi.fn>).mockResolvedValue(check);
      const result = await controller.checkSlug(makeReq(), 'taken-slug');
      expect(result).toEqual(check);
    });
  });

  // ── unsubscribe() ─────────────────────────────────────────────────────────

  describe('unsubscribe()', () => {
    it('calls service unsubscribe with token', async () => {
      await controller.unsubscribe('abc-token');
      expect(service.unsubscribe).toHaveBeenCalledWith('abc-token');
    });

    it('returns success message', async () => {
      const result = await controller.unsubscribe('abc-token');
      expect(result).toEqual({ message: 'Successfully unsubscribed' });
    });
  });

  // ── subscribe() ───────────────────────────────────────────────────────────

  describe('subscribe()', () => {
    it('calls subscribeToStatusPage with slug and email', async () => {
      await controller.subscribe('my-page', { email: 'test@example.com' });
      expect(service.subscribeToStatusPage).toHaveBeenCalledWith('my-page', 'test@example.com');
    });

    it('returns { subscribed: true } on success', async () => {
      const result = await controller.subscribe('my-page', { email: 'test@example.com' });
      expect(result).toEqual({ subscribed: true });
    });

    it('throws ConflictException when already subscribed', async () => {
      (service.subscribeToStatusPage as ReturnType<typeof vi.fn>).mockResolvedValue({ alreadySubscribed: true });
      await expect(controller.subscribe('my-page', { email: 'dup@example.com' })).rejects.toThrow(ConflictException);
    });
  });

  // ── getRssFeed() ──────────────────────────────────────────────────────────

  describe('getRssFeed()', () => {
    it('calls getRssFeed with slug and sends XML via response', async () => {
      const xml = '<?xml version="1.0"?><rss><channel></channel></rss>';
      (service.getRssFeed as ReturnType<typeof vi.fn>).mockResolvedValue(xml);
      const res = { send: vi.fn() } as never;
      await controller.getRssFeed('my-page', res);
      expect(service.getRssFeed).toHaveBeenCalledWith('my-page');
      expect((res as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(xml);
    });
  });

  // ── getPublicJson() ───────────────────────────────────────────────────────

  describe('getPublicJson()', () => {
    it('calls getPublicJson with slug and no password', async () => {
      await controller.getPublicJson('my-page');
      expect(service.getPublicJson).toHaveBeenCalledWith('my-page', undefined);
    });

    it('calls getPublicJson with slug and password', async () => {
      await controller.getPublicJson('locked-page', 'secret');
      expect(service.getPublicJson).toHaveBeenCalledWith('locked-page', 'secret');
    });

    it('returns structured JSON data', async () => {
      const data = { status: 'degraded', monitors: [{ id: 'm1', level: 'yellow' }] };
      (service.getPublicJson as ReturnType<typeof vi.fn>).mockResolvedValue(data);
      const result = await controller.getPublicJson('my-page');
      expect(result).toEqual(data);
    });
  });
});
