import { describe, it, expect, vi } from 'vitest';
import { StatusPagesService } from './status-pages.service';

type MockPage = {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  viewCount: number;
  lastViewedAt: Date | null;
  createdAt: Date;
  layout: unknown;
};

function buildService(pages: MockPage[]): StatusPagesService {
  const prisma = {
    publicStatusPage: {
      findMany: vi.fn().mockResolvedValue(pages),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  // StatusPagesService takes (prisma, cache, widgetResolver, subscriberService)
  return new StatusPagesService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('StatusPagesService.getAnalytics', () => {
  it('returns empty array for no pages', async () => {
    const svc = buildService([]);
    const r = await svc.getAnalytics('user-1');
    expect(r).toHaveLength(0);
  });

  it('returns pages sorted by viewCount descending (DB-ordered mock)', async () => {
    // The DB returns pages ordered by viewCount desc; mock simulates this
    const pages: MockPage[] = [
      { id: '2', title: 'High', slug: 'high', isPublished: true, viewCount: 100, lastViewedAt: new Date(), createdAt: new Date(), layout: null },
      { id: '1', title: 'Low', slug: 'low', isPublished: true, viewCount: 5, lastViewedAt: null, createdAt: new Date(), layout: null },
    ];
    const svc = buildService(pages);
    const r = await svc.getAnalytics('user-1');
    expect(r[0].viewCount).toBe(100);
    expect(r[1].viewCount).toBe(5);
  });

  it('counts widgets from layout JSON', async () => {
    const pages: MockPage[] = [{
      id: '1', title: 'Page', slug: 'p', isPublished: true, viewCount: 0, lastViewedAt: null, createdAt: new Date(),
      layout: { widgets: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }] },
    }];
    const svc = buildService(pages);
    const r = await svc.getAnalytics('user-1');
    expect(r[0].widgetCount).toBe(3);
  });

  it('handles null layout gracefully', async () => {
    const pages: MockPage[] = [{
      id: '1', title: 'Empty', slug: 'e', isPublished: false, viewCount: 0, lastViewedAt: null, createdAt: new Date(), layout: null,
    }];
    const svc = buildService(pages);
    const r = await svc.getAnalytics('user-1');
    expect(r[0].widgetCount).toBe(0);
  });
});
