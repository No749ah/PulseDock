import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { StatusPageSubscriberService } from './subscriber.service';

// ── helpers ────────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    publicStatusPage: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    statusPageSubscriber: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    incident: {
      findUnique: vi.fn(),
    },
  } as any;
}

function makeMailer() {
  return {
    sendStatusPageUpdateEmail: vi.fn().mockResolvedValue(undefined),
  } as any;
}

// ── test suite ─────────────────────────────────────────────────────────────

describe('StatusPageSubscriberService', () => {
  let service: StatusPageSubscriberService;
  let prisma: ReturnType<typeof makePrisma>;
  let mailer: ReturnType<typeof makeMailer>;

  beforeEach(() => {
    prisma = makePrisma();
    mailer = makeMailer();
    service = new StatusPageSubscriberService(prisma, mailer);
  });

  // ── subscribeToStatusPage ──────────────────────────────────────────────

  describe('subscribeToStatusPage()', () => {
    it('throws NotFoundException when page not found', async () => {
      prisma.publicStatusPage.findUnique.mockResolvedValue(null);
      await expect(service.subscribeToStatusPage('bad-slug', 'a@b.com'))
        .rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when page exists but is not published', async () => {
      prisma.publicStatusPage.findUnique.mockResolvedValue({ id: 'p1', isPublished: false });
      await expect(service.subscribeToStatusPage('draft', 'a@b.com'))
        .rejects.toThrow(NotFoundException);
    });

    it('returns alreadySubscribed=true if email already subscribed', async () => {
      prisma.publicStatusPage.findUnique.mockResolvedValue({ id: 'p1', isPublished: true, slug: 's', title: 'T' });
      prisma.statusPageSubscriber.findUnique.mockResolvedValue({ id: 'sub1', email: 'a@b.com' });

      const result = await service.subscribeToStatusPage('s', 'a@b.com');
      expect(result).toEqual({ subscribed: false, alreadySubscribed: true });
      expect(prisma.statusPageSubscriber.create).not.toHaveBeenCalled();
    });

    it('creates subscriber, sends confirmation email, returns subscribed=true', async () => {
      prisma.publicStatusPage.findUnique.mockResolvedValue({ id: 'p1', isPublished: true, slug: 'my-page', title: 'My Page' });
      prisma.statusPageSubscriber.findUnique.mockResolvedValue(null);
      prisma.statusPageSubscriber.create.mockResolvedValue({
        id: 'sub1',
        email: 'new@user.com',
        unsubscribeToken: 'tok123',
      });

      const result = await service.subscribeToStatusPage('my-page', 'new@user.com');
      expect(result).toEqual({ subscribed: true, alreadySubscribed: false });
      expect(prisma.statusPageSubscriber.create).toHaveBeenCalledWith({
        data: { statusPageId: 'p1', email: 'new@user.com' },
      });
      expect(mailer.sendStatusPageUpdateEmail).toHaveBeenCalledWith(
        'new@user.com',
        expect.objectContaining({
          pageTitle: 'My Page',
          pageSlug: 'my-page',
          subject: expect.stringContaining('subscribed'),
        }),
      );
    });

    it('still returns subscribed=true even if confirmation email fails', async () => {
      prisma.publicStatusPage.findUnique.mockResolvedValue({ id: 'p1', isPublished: true, slug: 's', title: 'T' });
      prisma.statusPageSubscriber.findUnique.mockResolvedValue(null);
      prisma.statusPageSubscriber.create.mockResolvedValue({ id: 'sub1', unsubscribeToken: 'tok' });
      mailer.sendStatusPageUpdateEmail.mockRejectedValue(new Error('SMTP down'));

      const result = await service.subscribeToStatusPage('s', 'test@x.com');
      expect(result).toEqual({ subscribed: true, alreadySubscribed: false });
    });
  });

  // ── unsubscribe ────────────────────────────────────────────────────────

  describe('unsubscribe()', () => {
    it('throws NotFoundException when token is invalid', async () => {
      prisma.statusPageSubscriber.findUnique.mockResolvedValue(null);
      await expect(service.unsubscribe('bad-token')).rejects.toThrow(NotFoundException);
    });

    it('deletes subscriber when token is valid', async () => {
      prisma.statusPageSubscriber.findUnique.mockResolvedValue({
        id: 'sub1',
        email: 'a@b.com',
        statusPageId: 'p1',
      });
      prisma.statusPageSubscriber.delete.mockResolvedValue({});

      await service.unsubscribe('valid-token');
      expect(prisma.statusPageSubscriber.delete).toHaveBeenCalledWith({ where: { id: 'sub1' } });
    });
  });

  // ── notifySubscribersOfIncident ────────────────────────────────────────

  describe('notifySubscribersOfIncident()', () => {
    it('does nothing when incident not found', async () => {
      prisma.incident.findUnique.mockResolvedValue(null);
      await service.notifySubscribersOfIncident('bad-id', 'created');
      expect(prisma.publicStatusPage.findMany).not.toHaveBeenCalled();
    });

    it('does nothing when no published status pages exist for user', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        id: 'inc1',
        userId: 'u1',
        title: 'Outage',
        severity: 'high',
        monitors: [{ monitorId: 'm1' }],
      });
      prisma.publicStatusPage.findMany.mockResolvedValue([]);
      await service.notifySubscribersOfIncident('inc1', 'created');
      expect(prisma.statusPageSubscriber.findMany).not.toHaveBeenCalled();
    });

    it('does nothing when no subscribers exist for affected pages', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        id: 'inc1',
        userId: 'u1',
        title: 'Outage',
        severity: 'medium',
        monitors: [{ monitorId: 'm1' }],
      });
      prisma.publicStatusPage.findMany.mockResolvedValue([
        { id: 'sp1', slug: 'my', title: 'My Page', layout: JSON.stringify({ widgets: [{ config: { monitorId: 'm1' } }] }) },
      ]);
      prisma.statusPageSubscriber.findMany.mockResolvedValue([]);
      await service.notifySubscribersOfIncident('inc1', 'created');
      expect(mailer.sendStatusPageUpdateEmail).not.toHaveBeenCalled();
    });

    it('sends emails to all subscribers of affected pages on incident created', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        id: 'inc1',
        userId: 'u1',
        title: 'DB down',
        severity: 'critical',
        monitors: [{ monitorId: 'm1' }],
      });
      prisma.publicStatusPage.findMany.mockResolvedValue([
        { id: 'sp1', slug: 'ops', title: 'Ops Status', layout: JSON.stringify({ widgets: [{ config: { monitorId: 'm1' } }] }) },
      ]);
      prisma.statusPageSubscriber.findMany.mockResolvedValue([
        { id: 'sub1', email: 'a@b.com', statusPageId: 'sp1', unsubscribeToken: 'tok1' },
        { id: 'sub2', email: 'c@d.com', statusPageId: 'sp1', unsubscribeToken: 'tok2' },
      ]);

      await service.notifySubscribersOfIncident('inc1', 'created');
      expect(mailer.sendStatusPageUpdateEmail).toHaveBeenCalledTimes(2);
      expect(mailer.sendStatusPageUpdateEmail).toHaveBeenCalledWith(
        'a@b.com',
        expect.objectContaining({
          subject: expect.stringContaining('DB down'),
          statusColor: '#ef4444',
        }),
      );
    });

    it('sends resolved email with green color', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        id: 'inc1',
        userId: 'u1',
        title: 'Fixed',
        severity: null,
        monitors: [],
      });
      // No monitors means any page matches (monitorIds.length === 0 → hasMonitor = true)
      prisma.publicStatusPage.findMany.mockResolvedValue([
        { id: 'sp1', slug: 'ops', title: 'Ops', layout: '{}' },
      ]);
      prisma.statusPageSubscriber.findMany.mockResolvedValue([
        { id: 'sub1', email: 'x@y.com', statusPageId: 'sp1', unsubscribeToken: 'tok1' },
      ]);

      await service.notifySubscribersOfIncident('inc1', 'resolved');
      expect(mailer.sendStatusPageUpdateEmail).toHaveBeenCalledWith(
        'x@y.com',
        expect.objectContaining({
          subject: expect.stringContaining('Resolved'),
          statusColor: '#22c55e',
        }),
      );
    });

    it('skips pages that do not contain any affected monitor', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        id: 'inc1',
        userId: 'u1',
        title: 'Outage',
        severity: 'medium',
        monitors: [{ monitorId: 'm1' }],
      });
      prisma.publicStatusPage.findMany.mockResolvedValue([
        { id: 'sp1', slug: 'ops', title: 'Ops', layout: JSON.stringify({ widgets: [{ config: { monitorId: 'm2' } }] }) },
      ]);
      // sp1 layout references m2, not m1 → not affected
      prisma.statusPageSubscriber.findMany.mockResolvedValue([]);
      await service.notifySubscribersOfIncident('inc1', 'created');
      // findMany for subscribers called with empty set (the page doesn't match)
      expect(mailer.sendStatusPageUpdateEmail).not.toHaveBeenCalled();
    });

    it('handles mailer failure gracefully (fire-and-forget)', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        id: 'inc1',
        userId: 'u1',
        title: 'Outage',
        severity: 'low',
        monitors: [],
      });
      prisma.publicStatusPage.findMany.mockResolvedValue([
        { id: 'sp1', slug: 'ops', title: 'Ops', layout: '{}' },
      ]);
      prisma.statusPageSubscriber.findMany.mockResolvedValue([
        { id: 'sub1', email: 'fail@test.com', statusPageId: 'sp1', unsubscribeToken: 'tok' },
      ]);
      mailer.sendStatusPageUpdateEmail.mockRejectedValue(new Error('SMTP error'));

      // Should not throw
      await service.notifySubscribersOfIncident('inc1', 'created');
    });
  });
});
