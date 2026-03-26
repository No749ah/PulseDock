import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from '../common/prisma.service';

const mockPrisma = {
  monitor: { findMany: vi.fn() },
  incident: { findMany: vi.fn() },
  publicStatusPage: { findMany: vi.fn() },
};

const baseDate = new Date('2026-01-01T00:00:00Z');

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = mod.get(SearchService);
    vi.clearAllMocks();
  });

  it('returns empty result for query < 2 chars', async () => {
    const result = await service.search('u1', 'a', 5, new Set(['monitors', 'incidents', 'status_pages', 'versions']));
    expect(result.total).toBe(0);
    expect(result.monitors).toHaveLength(0);
    expect(mockPrisma.monitor.findMany).not.toHaveBeenCalled();
  });

  it('returns empty result for empty query', async () => {
    const result = await service.search('u1', '', 5, new Set(['monitors']));
    expect(result.total).toBe(0);
  });

  it('searches monitors and maps result correctly', async () => {
    // Both monitors (non-VERSION_CHECK) and versions (VERSION_CHECK) query the same table
    // First call = monitors, second call = versions (both return same mock data here but
    // the total test just checks monitors category)
    mockPrisma.monitor.findMany
      .mockResolvedValueOnce([
        {
          id: 'm1', name: 'My API', target: 'https://api.example.com',
          type: 'HTTP', enabled: true, createdAt: baseDate,
          runs: [{ level: 'green', checkedAt: baseDate }],
        },
      ])
      .mockResolvedValueOnce([]); // versions search returns empty
    mockPrisma.incident.findMany.mockResolvedValue([]);
    mockPrisma.publicStatusPage.findMany.mockResolvedValue([]);

    const result = await service.search('u1', 'api', 5, new Set(['monitors', 'incidents', 'status_pages', 'versions']));
    expect(result.monitors).toHaveLength(1);
    expect(result.monitors[0].title).toBe('My API');
    expect(result.monitors[0].type).toBe('monitor');
    expect(result.monitors[0].statusColor).toBe('green');
    expect(result.total).toBe(1);
  });

  it('maps RED run to red statusColor', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      {
        id: 'm2', name: 'Down API', target: 'https://down.example.com',
        type: 'HTTP', enabled: true, createdAt: baseDate,
        runs: [{ level: 'red', checkedAt: baseDate }],
      },
    ]);
    mockPrisma.incident.findMany.mockResolvedValue([]);
    mockPrisma.publicStatusPage.findMany.mockResolvedValue([]);

    const result = await service.search('u1', 'down', 5, new Set(['monitors', 'incidents', 'status_pages', 'versions']));
    expect(result.monitors[0].statusColor).toBe('red');
  });

  it('maps disabled monitor to gray statusColor', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      {
        id: 'm3', name: 'Paused', target: 'https://x.com',
        type: 'HTTP', enabled: false, createdAt: baseDate,
        runs: [],
      },
    ]);
    mockPrisma.incident.findMany.mockResolvedValue([]);
    mockPrisma.publicStatusPage.findMany.mockResolvedValue([]);

    const result = await service.search('u1', 'pau', 5, new Set(['monitors', 'incidents', 'status_pages', 'versions']));
    expect(result.monitors[0].statusColor).toBe('gray');
    expect(result.monitors[0].status).toBe('PAUSED');
  });

  it('skips category when not in types set', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    await service.search('u1', 'test', 5, new Set(['monitors']));
    expect(mockPrisma.incident.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.publicStatusPage.findMany).not.toHaveBeenCalled();
  });

  it('searches incidents and maps result', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([
      { id: 'i1', title: 'API Outage', status: 'INVESTIGATING', severity: 'HIGH', createdAt: baseDate, updatedAt: baseDate, resolvedAt: null },
    ]);
    mockPrisma.publicStatusPage.findMany.mockResolvedValue([]);

    const result = await service.search('u1', 'outage', 5, new Set(['monitors', 'incidents', 'status_pages', 'versions']));
    expect(result.incidents).toHaveLength(1);
    expect(result.incidents[0].title).toBe('API Outage');
    expect(result.incidents[0].statusColor).toBe('red');
  });

  it('maps RESOLVED incident to green statusColor', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([
      { id: 'i2', title: 'Resolved DB', status: 'RESOLVED', severity: 'LOW', createdAt: baseDate, updatedAt: baseDate, resolvedAt: baseDate },
    ]);
    mockPrisma.publicStatusPage.findMany.mockResolvedValue([]);

    const result = await service.search('u1', 'db', 5, new Set(['incidents']));
    expect(result.incidents[0].statusColor).toBe('green');
  });

  it('searches status pages and maps result', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);
    mockPrisma.publicStatusPage.findMany.mockResolvedValue([
      { id: 'sp1', title: 'Main Status', slug: 'main', isPublished: true, updatedAt: baseDate },
    ]);

    const result = await service.search('u1', 'main', 5, new Set(['monitors', 'incidents', 'status_pages', 'versions']));
    expect(result.status_pages).toHaveLength(1);
    expect(result.status_pages[0].statusColor).toBe('green');
    expect(result.status_pages[0].status).toBe('Published');
  });

  it('maps unpublished status page to gray', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);
    mockPrisma.publicStatusPage.findMany.mockResolvedValue([
      { id: 'sp2', title: 'Draft Page', slug: 'draft', isPublished: false, updatedAt: baseDate },
    ]);

    const result = await service.search('u1', 'draft', 5, new Set(['status_pages']));
    expect(result.status_pages[0].statusColor).toBe('gray');
    expect(result.status_pages[0].status).toBe('Draft');
  });

  it('respects limit parameter in query', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([]);
    mockPrisma.incident.findMany.mockResolvedValue([]);
    mockPrisma.publicStatusPage.findMany.mockResolvedValue([]);

    await service.search('u1', 'test', 3, new Set(['monitors', 'incidents', 'status_pages', 'versions']));
    expect(mockPrisma.monitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
  });

  it('returns correct total across all categories', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      { id: 'm1', name: 'Test Monitor', target: 'https://x.com', type: 'HTTP', enabled: true, createdAt: baseDate, runs: [] },
    ]);
    mockPrisma.incident.findMany.mockResolvedValue([
      { id: 'i1', title: 'Test Incident', status: 'INVESTIGATING', severity: 'HIGH', createdAt: baseDate, updatedAt: baseDate, resolvedAt: null },
    ]);
    mockPrisma.publicStatusPage.findMany.mockResolvedValue([]);

    const result = await service.search('u1', 'test', 5, new Set(['monitors', 'incidents', 'status_pages', 'versions']));
    // monitor (not VERSION_CHECK) + incident = 2 results. versions search also returns from monitor table with VERSION_CHECK filter.
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.monitors).toHaveLength(1);
    expect(result.incidents).toHaveLength(1);
  });

  it('uses createdAt as fallback updatedAt when no runs', async () => {
    mockPrisma.monitor.findMany.mockResolvedValue([
      { id: 'm1', name: 'New Monitor', target: 'https://new.com', type: 'HTTP', enabled: true, createdAt: baseDate, runs: [] },
    ]);
    mockPrisma.incident.findMany.mockResolvedValue([]);
    mockPrisma.publicStatusPage.findMany.mockResolvedValue([]);

    const result = await service.search('u1', 'new', 5, new Set(['monitors']));
    expect(result.monitors[0].updatedAt).toBe(baseDate.toISOString());
  });
});
