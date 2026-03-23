import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});
