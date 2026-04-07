import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { V2SearchController } from './search.controller';
import type { SearchService } from '../../search/search.service';
import type { AuthenticatedRequest } from '../v2.types';

const mockRaw = {
  query: 'test',
  total: 3,
  monitors: [
    { id: 'm1', type: 'monitor' as const, title: 'Zebra Monitor', subtitle: 'example.com', url: '/monitors/m1', updatedAt: '2026-01-03T00:00:00Z' },
    { id: 'm2', type: 'monitor' as const, title: 'Alpha Monitor', subtitle: 'alpha.com', url: '/monitors/m2', updatedAt: '2026-01-01T00:00:00Z' },
  ],
  incidents: [
    { id: 'i1', type: 'incident' as const, title: 'Beta Incident', subtitle: 'HIGH', url: '/incidents/i1', updatedAt: '2026-01-02T00:00:00Z' },
  ],
  status_pages: [],
  versions: [],
};

function makeService(raw = mockRaw): Partial<SearchService> {
  return { search: vi.fn().mockResolvedValue(raw) };
}

const mockReq = { user: { id: 'user1' } } as AuthenticatedRequest;

describe('V2SearchController', () => {
  let controller: V2SearchController;
  let service: ReturnType<typeof makeService>;

  beforeEach(() => {
    service = makeService();
    controller = new V2SearchController(service as SearchService);
  });

  it('returns paginated envelope with data + meta', async () => {
    const res = await controller.search(mockReq, { q: 'test' });
    expect(res).toHaveProperty('data');
    expect(res).toHaveProperty('meta');
    expect(res.meta).toMatchObject({ total: 3, page: 1, limit: 20, pages: 1 });
  });

  it('maps entityType onto each result', async () => {
    const res = await controller.search(mockReq, { q: 'test' });
    const types = res.data.map(d => d.entityType);
    expect(types).toContain('monitor');
    expect(types).toContain('incident');
  });

  it('returns empty data + zero meta for short query', async () => {
    service.search = vi.fn().mockResolvedValue({ query: 'a', total: 0, monitors: [], incidents: [], status_pages: [], versions: [] });
    const res = await controller.search(mockReq, { q: 'a' });
    expect(res.data).toHaveLength(0);
    expect(res.meta.total).toBe(0);
  });

  it('paginates correctly — page 1 of 2', async () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `m${i}`,
      type: 'monitor' as const,
      title: `Monitor ${i}`,
      subtitle: '',
      url: `/monitors/m${i}`,
      updatedAt: new Date(2026, 0, i + 1).toISOString(),
    }));
    service.search = vi.fn().mockResolvedValue({ query: 'test', total: 6, monitors: items, incidents: [], status_pages: [], versions: [] });
    const res = await controller.search(mockReq, { q: 'test', page: 1, limit: 3 });
    expect(res.data).toHaveLength(3);
    expect(res.meta).toMatchObject({ total: 6, page: 1, limit: 3, pages: 2 });
  });

  it('paginates correctly — page 2 of 2', async () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `m${i}`,
      type: 'monitor' as const,
      title: `Monitor ${i}`,
      subtitle: '',
      url: `/monitors/m${i}`,
      updatedAt: new Date(2026, 0, i + 1).toISOString(),
    }));
    service.search = vi.fn().mockResolvedValue({ query: 'test', total: 6, monitors: items, incidents: [], status_pages: [], versions: [] });
    const res = await controller.search(mockReq, { q: 'test', page: 2, limit: 3 });
    expect(res.data).toHaveLength(3);
    expect(res.meta).toMatchObject({ total: 6, page: 2, limit: 3, pages: 2 });
  });

  it('sortBy=title asc sorts alphabetically', async () => {
    const res = await controller.search(mockReq, { q: 'test', sortBy: 'title', sortDir: 'asc' });
    const titles = res.data.map(d => d.title);
    expect(titles[0]).toBe('Alpha Monitor');
    expect(titles[1]).toBe('Beta Incident');
    expect(titles[2]).toBe('Zebra Monitor');
  });

  it('sortBy=title desc reverses alphabetical order', async () => {
    const res = await controller.search(mockReq, { q: 'test', sortBy: 'title', sortDir: 'desc' });
    const titles = res.data.map(d => d.title);
    expect(titles[0]).toBe('Zebra Monitor');
    expect(titles[1]).toBe('Beta Incident');
    expect(titles[2]).toBe('Alpha Monitor');
  });

  it('sortBy=updatedAt desc — most recent first', async () => {
    const res = await controller.search(mockReq, { q: 'test', sortBy: 'updatedAt', sortDir: 'desc' });
    const dates = res.data.map(d => d.updatedAt ?? '');
    expect(dates[0] > dates[1]).toBe(true);
    expect(dates[1] > dates[2]).toBe(true);
  });

  it('sortBy=updatedAt asc — oldest first', async () => {
    const res = await controller.search(mockReq, { q: 'test', sortBy: 'updatedAt', sortDir: 'asc' });
    const dates = res.data.map(d => d.updatedAt ?? '');
    expect(dates[0] < dates[1]).toBe(true);
    expect(dates[1] < dates[2]).toBe(true);
  });

  it('throws 400 for invalid type in types filter', async () => {
    await expect(
      controller.search(mockReq, { q: 'test', types: 'monitors,invalid_type' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('passes types filter set to searchService', async () => {
    await controller.search(mockReq, { q: 'test', types: 'monitors,incidents' });
    const [, , , types] = (service.search as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, number, Set<string>];
    expect(types.has('monitors')).toBe(true);
    expect(types.has('incidents')).toBe(true);
    expect(types.has('status_pages')).toBe(false);
    expect(types.has('versions')).toBe(false);
  });

  it('passes all types when types param omitted', async () => {
    await controller.search(mockReq, { q: 'test' });
    const [, , , types] = (service.search as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, number, Set<string>];
    expect(types.size).toBe(4);
  });

  it('clamps limit to 50 max', async () => {
    await controller.search(mockReq, { q: 'test', limit: 999 });
    const [, , fetchLimit] = (service.search as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, number];
    // fetchLimit = page * limit + limit = 1 * 50 + 50 = 100, which is > 50
    expect(fetchLimit).toBeGreaterThanOrEqual(50);
  });

  it('clamps limit to 1 min', async () => {
    service.search = vi.fn().mockResolvedValue({ query: 'test', total: 0, monitors: [], incidents: [], status_pages: [], versions: [] });
    const res = await controller.search(mockReq, { q: 'test', limit: 0 });
    expect(res.meta.limit).toBe(1);
  });

  it('page beyond total returns empty data', async () => {
    const res = await controller.search(mockReq, { q: 'test', page: 999, limit: 20 });
    expect(res.data).toHaveLength(0);
    expect(res.meta.total).toBe(3);
    expect(res.meta.page).toBe(999);
  });

  it('includes all SearchItem fields in result', async () => {
    const res = await controller.search(mockReq, { q: 'test' });
    const item = res.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('type');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('subtitle');
    expect(item).toHaveProperty('url');
    expect(item).toHaveProperty('entityType');
  });
});
