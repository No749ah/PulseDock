/**
 * Unit tests for SearchController
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchController } from './search.controller';
import { SearchService, SearchResultDto } from './search.service';

function makeSearchService(): SearchService {
  return {
    search: vi.fn().mockResolvedValue({
      monitors: [],
      incidents: [],
      status_pages: [],
      versions: [],
    } as SearchResultDto),
  } as unknown as SearchService;
}

const emptyResult: SearchResultDto = {
  monitors: [],
  incidents: [],
  status_pages: [],
  versions: [],
};

describe('SearchController', () => {
  let controller: SearchController;
  let service: SearchService;

  beforeEach(() => {
    service = makeSearchService();
    controller = new SearchController(service);
  });

  it('calls search with user id and trimmed query', async () => {
    const req = { user: { id: 'user-1' } };

    await controller.search(req, '  grafana  ', undefined, undefined);

    expect(service.search).toHaveBeenCalledWith(
      'user-1',
      'grafana',
      5, // default limit
      new Set(['monitors', 'incidents', 'status_pages', 'versions']),
    );
  });

  it('uses default limit of 5 when not specified', async () => {
    const req = { user: { id: 'user-1' } };

    await controller.search(req, 'test');

    const [, , limit] = vi.mocked(service.search).mock.calls[0];
    expect(limit).toBe(5);
  });

  it('clamps limit to max 20', async () => {
    const req = { user: { id: 'user-1' } };

    await controller.search(req, 'test', '999');

    const [, , limit] = vi.mocked(service.search).mock.calls[0];
    expect(limit).toBe(20);
  });

  it('clamps limit to min 1 for very small values', async () => {
    // Note: '0' parses as 0 which is falsy, so '|| 5' gives the default 5.
    // Negative numbers also become 1 via Math.max.
    const req = { user: { id: 'user-1' } };

    await controller.search(req, 'test', '-5');

    const [, , limit] = vi.mocked(service.search).mock.calls[0];
    expect(limit).toBe(1); // Math.max(Math.min(-5, 20), 1) = 1
  });

  it('uses specified limit', async () => {
    const req = { user: { id: 'user-1' } };

    await controller.search(req, 'test', '10');

    const [, , limit] = vi.mocked(service.search).mock.calls[0];
    expect(limit).toBe(10);
  });

  it('filters types when types param is provided', async () => {
    const req = { user: { id: 'user-1' } };

    await controller.search(req, 'test', undefined, 'monitors,incidents');

    const [, , , typeSet] = vi.mocked(service.search).mock.calls[0];
    expect(typeSet).toEqual(new Set(['monitors', 'incidents']));
  });

  it('returns all types when types param is not provided', async () => {
    const req = { user: { id: 'user-1' } };

    await controller.search(req, 'test', undefined, undefined);

    const [, , , typeSet] = vi.mocked(service.search).mock.calls[0];
    expect(typeSet).toEqual(new Set(['monitors', 'incidents', 'status_pages', 'versions']));
  });

  it('handles non-numeric limit string gracefully (uses default 5)', async () => {
    const req = { user: { id: 'user-1' } };

    await controller.search(req, 'test', 'notanumber');

    const [, , limit] = vi.mocked(service.search).mock.calls[0];
    expect(limit).toBe(5); // NaN || 5 → 5
  });

  it('returns search results', async () => {
    vi.mocked(service.search).mockResolvedValue({
      monitors: [{ id: 'm1', name: 'My API', type: 'HTTP', target: '', score: 1 }],
      incidents: [],
      status_pages: [],
      versions: [],
    } as SearchResultDto);
    const req = { user: { id: 'user-1' } };

    const result = await controller.search(req, 'api');

    expect(result.monitors).toHaveLength(1);
    expect(result.monitors[0].name).toBe('My API');
  });

  it('trims whitespace from types param', async () => {
    const req = { user: { id: 'user-1' } };

    await controller.search(req, 'test', undefined, ' monitors , versions ');

    const [, , , typeSet] = vi.mocked(service.search).mock.calls[0];
    expect(typeSet.has('monitors')).toBe(true);
    expect(typeSet.has('versions')).toBe(true);
    expect(typeSet.has('incidents')).toBe(false);
  });
});
