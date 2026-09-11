import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRangeStart } from './resolvers/resolver.types';

// ── Mock all resolver modules BEFORE importing the service ───────────────────
vi.mock('./resolvers', () => ({
  getRangeStart: vi.fn((range?: string) => {
    const now = new Date();
    switch (range) {
      case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      default:    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  }),
  resolveStatusWidget:      vi.fn().mockResolvedValue({ resolver: 'status' }),
  resolveUptimeWidget:      vi.fn().mockResolvedValue({ resolver: 'uptime' }),
  resolvePerformanceWidget: vi.fn().mockResolvedValue({ resolver: 'performance' }),
  resolveSlaWidget:         vi.fn().mockResolvedValue({ resolver: 'sla' }),
  resolveIncidentWidget:    vi.fn().mockResolvedValue({ resolver: 'incident' }),
  resolveMaintenanceWidget: vi.fn().mockResolvedValue({ resolver: 'maintenance' }),
  resolveVersionWidget:     vi.fn().mockResolvedValue({ resolver: 'version' }),
  resolveMetricWidget:      vi.fn().mockResolvedValue({ resolver: 'metric' }),
  resolveContentWidget:     vi.fn().mockResolvedValue({ resolver: 'content' }),
  resolveLayoutWidget:      vi.fn().mockResolvedValue({ resolver: 'layout' }),
}));

import { WidgetDataResolverService } from './widget-data-resolver.service';
import type { Widget } from './status-pages.types';
import * as resolvers from './resolvers';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeWidget(type: string, config: Record<string, unknown> = {}): Widget {
  return {
    id: `widget-${type}`,
    type: type as Widget['type'],
    x: 0, y: 0, w: 3, h: 2,
    config,
  };
}

function makeService() {
  const prisma = {} as never;
  const cache = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  };
  const svc = new WidgetDataResolverService(prisma, cache as never);
  return { svc, cache };
}

// ── getRangeStart pure function ──────────────────────────────────────────────

describe('getRangeStart (pure)', () => {
  it('returns ~7d ago by default', () => {
    const before = Date.now();
    const result = getRangeStart(undefined);
    const after = Date.now();
    const diffMs = Date.now() - result.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 100);
    expect(diffMs).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000 + (after - before) + 100);
  });

  it('returns ~24h ago for "24h"', () => {
    const result = getRangeStart('24h');
    const diffMs = Date.now() - result.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 100);
    expect(diffMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
  });

  it('returns ~30d ago for "30d"', () => {
    const result = getRangeStart('30d');
    const diffMs = Date.now() - result.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 100);
  });

  it('returns ~90d ago for "90d"', () => {
    const result = getRangeStart('90d');
    const diffMs = Date.now() - result.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(90 * 24 * 60 * 60 * 1000 - 100);
  });

  it('defaults to 7d for unknown range strings', () => {
    const result = getRangeStart('1y');
    const diffMs = Date.now() - result.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 100);
    expect(diffMs).toBeLessThanOrEqual(8 * 24 * 60 * 60 * 1000);
  });
});

// ── WidgetDataResolverService.getRangeStart ──────────────────────────────────

describe('WidgetDataResolverService.getRangeStart', () => {
  it('delegates to the utility function', () => {
    const { svc } = makeService();
    const result = svc.getRangeStart('24h');
    expect(result).toBeInstanceOf(Date);
    const diffMs = Date.now() - result.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 100);
  });
});

// ── resolveWidgetData — cache hit ───────────────────────────────────────────

describe('resolveWidgetData — cache', () => {
  it('returns cached data without calling resolver', async () => {
    const { svc, cache } = makeService();
    const cachedData = { resolver: 'status', fromCache: true };
    cache.get.mockResolvedValue(cachedData);

    const widget = makeWidget('current-status-badge', { monitorId: 'mon1' });
    const result = await svc.resolveWidgetData('user1', widget);

    expect(result).toEqual(cachedData);
    expect(vi.mocked(resolvers.resolveStatusWidget)).not.toHaveBeenCalled();
  });

  it('calls resolver on cache miss and caches result', async () => {
    const { svc, cache } = makeService();
    cache.get.mockResolvedValue(null);

    const widget = makeWidget('current-status-badge', { monitorId: 'mon1' });
    await svc.resolveWidgetData('user1', widget);

    expect(vi.mocked(resolvers.resolveStatusWidget)).toHaveBeenCalledOnce();
    expect(cache.set).toHaveBeenCalledOnce();
    // TTL should be 30 seconds
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining('widget:'),
      expect.objectContaining({ resolver: 'status' }),
      30,
    );
  });

  it('does not cache results that contain _noConfig flag', async () => {
    const { svc, cache } = makeService();
    cache.get.mockResolvedValue(null);
    vi.mocked(resolvers.resolveStatusWidget).mockResolvedValueOnce({ _noConfig: true, resolver: 'status' });

    const widget = makeWidget('current-status-badge', {});
    await svc.resolveWidgetData('user1', widget);

    expect(cache.set).not.toHaveBeenCalled();
  });

  it('builds cache key from widget id, type, monitorId, and range', async () => {
    const { svc, cache } = makeService();
    cache.get.mockResolvedValue(null);

    const widget = makeWidget('uptime-bar', { monitorId: 'mon-abc' });
    await svc.resolveWidgetData('user1', widget, '30d');

    const cacheKey = cache.get.mock.calls[0][0] as string;
    expect(cacheKey).toContain('uptime-bar');
    expect(cacheKey).toContain('mon-abc');
    expect(cacheKey).toContain('30d');
  });

  it('uses "none" in cache key when no monitorId configured', async () => {
    const { svc, cache } = makeService();
    cache.get.mockResolvedValue(null);

    const widget = makeWidget('text-block', {});
    await svc.resolveWidgetData('user1', widget);

    const cacheKey = cache.get.mock.calls[0][0] as string;
    expect(cacheKey).toContain(':none:');
  });
});

// ── resolveWidgetData — router (one widget per category) ────────────────────

describe('resolveWidgetData — routing to resolvers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks to their defaults
    vi.mocked(resolvers.resolveStatusWidget).mockResolvedValue({ resolver: 'status' });
    vi.mocked(resolvers.resolveUptimeWidget).mockResolvedValue({ resolver: 'uptime' });
    vi.mocked(resolvers.resolvePerformanceWidget).mockResolvedValue({ resolver: 'performance' });
    vi.mocked(resolvers.resolveSlaWidget).mockResolvedValue({ resolver: 'sla' });
    vi.mocked(resolvers.resolveIncidentWidget).mockResolvedValue({ resolver: 'incident' });
    vi.mocked(resolvers.resolveMaintenanceWidget).mockResolvedValue({ resolver: 'maintenance' });
    vi.mocked(resolvers.resolveVersionWidget).mockResolvedValue({ resolver: 'version' });
    vi.mocked(resolvers.resolveMetricWidget).mockResolvedValue({ resolver: 'metric' });
    vi.mocked(resolvers.resolveContentWidget).mockResolvedValue({ resolver: 'content' });
    vi.mocked(resolvers.resolveLayoutWidget).mockResolvedValue({ resolver: 'layout' });
  });

  const cases: Array<{ type: string; resolverKey: keyof typeof resolvers; resolverResult: string }> = [
    // STATUS_TYPES
    { type: 'current-status-badge',       resolverKey: 'resolveStatusWidget',      resolverResult: 'status' },
    { type: 'overall-system-status',      resolverKey: 'resolveStatusWidget',      resolverResult: 'status' },
    { type: 'component-status-list',      resolverKey: 'resolveStatusWidget',      resolverResult: 'status' },
    { type: 'ssl-certificate-status',     resolverKey: 'resolveStatusWidget',      resolverResult: 'status' },
    { type: 'region-status-map',          resolverKey: 'resolveStatusWidget',      resolverResult: 'status' },
    // UPTIME_TYPES
    { type: 'uptime-bar',                 resolverKey: 'resolveUptimeWidget',      resolverResult: 'uptime' },
    { type: 'uptime-timeline',            resolverKey: 'resolveUptimeWidget',      resolverResult: 'uptime' },
    { type: 'rolling-uptime-cards',       resolverKey: 'resolveUptimeWidget',      resolverResult: 'uptime' },
    { type: 'uptime-heatmap',             resolverKey: 'resolveUptimeWidget',      resolverResult: 'uptime' },
    // PERFORMANCE_TYPES
    { type: 'response-time-chart',        resolverKey: 'resolvePerformanceWidget', resolverResult: 'performance' },
    { type: 'response-time-heatmap',      resolverKey: 'resolvePerformanceWidget', resolverResult: 'performance' },
    { type: 'latency-percentiles-card',   resolverKey: 'resolvePerformanceWidget', resolverResult: 'performance' },
    { type: 'check-history-feed',         resolverKey: 'resolvePerformanceWidget', resolverResult: 'performance' },
    // SLA_TYPES
    { type: 'sla-summary',                resolverKey: 'resolveSlaWidget',         resolverResult: 'sla' },
    { type: 'sla-compliance-table',       resolverKey: 'resolveSlaWidget',         resolverResult: 'sla' },
    { type: 'downtime-log',               resolverKey: 'resolveSlaWidget',         resolverResult: 'sla' },
    { type: 'mttr-mttf-cards',            resolverKey: 'resolveSlaWidget',         resolverResult: 'sla' },
    // INCIDENT_TYPES
    { type: 'incident-history',           resolverKey: 'resolveIncidentWidget',    resolverResult: 'incident' },
    { type: 'active-incident-banner',     resolverKey: 'resolveIncidentWidget',    resolverResult: 'incident' },
    { type: 'active-incident-count',      resolverKey: 'resolveIncidentWidget',    resolverResult: 'incident' },
    // MAINTENANCE_TYPES
    { type: 'scheduled-maintenance',      resolverKey: 'resolveMaintenanceWidget', resolverResult: 'maintenance' },
    { type: 'maintenance-calendar',       resolverKey: 'resolveMaintenanceWidget', resolverResult: 'maintenance' },
    // VERSION_TYPES
    { type: 'version-status-grid',        resolverKey: 'resolveVersionWidget',     resolverResult: 'version' },
    { type: 'outdated-components-alert',  resolverKey: 'resolveVersionWidget',     resolverResult: 'version' },
    { type: 'changelog-widget',           resolverKey: 'resolveVersionWidget',     resolverResult: 'version' },
    // METRIC_TYPES
    { type: 'metric-counter',             resolverKey: 'resolveMetricWidget',      resolverResult: 'metric' },
    { type: 'gauge',                      resolverKey: 'resolveMetricWidget',      resolverResult: 'metric' },
    { type: 'data-table',                 resolverKey: 'resolveMetricWidget',      resolverResult: 'metric' },
    // CONTENT_TYPES
    { type: 'text-block',                 resolverKey: 'resolveContentWidget',     resolverResult: 'content' },
    { type: 'announcement-bar',           resolverKey: 'resolveContentWidget',     resolverResult: 'content' },
    // LAYOUT_TYPES
    { type: 'divider',                    resolverKey: 'resolveLayoutWidget',      resolverResult: 'layout' },
    { type: 'tab-container',             resolverKey: 'resolveLayoutWidget',      resolverResult: 'layout' },
    { type: 'sticky-header',              resolverKey: 'resolveLayoutWidget',      resolverResult: 'layout' },
    { type: 'last-updated-footer',        resolverKey: 'resolveLayoutWidget',      resolverResult: 'layout' },
  ];

  for (const { type, resolverKey, resolverResult } of cases) {
    it(`routes "${type}" → ${resolverKey}`, async () => {
      const { svc, cache } = makeService();
      cache.get.mockResolvedValue(null);

      const widget = makeWidget(type, { monitorId: 'mon1' });
      const result = await svc.resolveWidgetData('user1', widget);

      expect(result.resolver).toBe(resolverResult);
      expect(vi.mocked(resolvers[resolverKey])).toHaveBeenCalledOnce();
    });
  }

  it('returns unknown-widget message for unregistered widget types', async () => {
    const { svc, cache } = makeService();
    cache.get.mockResolvedValue(null);

    const widget = makeWidget('totally-unknown-widget-type-xyz');
    const result = await svc.resolveWidgetData('user1', widget);

    expect(result.widgetType).toBe('totally-unknown-widget-type-xyz');
    expect(result.message).toContain('not yet implemented');
    // Unknown widgets don't hit any resolver
    expect(vi.mocked(resolvers.resolveStatusWidget)).not.toHaveBeenCalled();
  });

  it('passes range override as days to resolver', async () => {
    const { svc, cache } = makeService();
    cache.get.mockResolvedValue(null);

    const widget = makeWidget('uptime-bar', { monitorId: 'mon1' });
    await svc.resolveWidgetData('user1', widget, '30d');

    // overrideDays=30 should be passed (5th argument)
    const callArgs = vi.mocked(resolvers.resolveUptimeWidget).mock.calls[0];
    expect(callArgs[4]).toBe(30); // overrideDays
  });

  it('passes overrideDays=1 for "24h" range', async () => {
    const { svc, cache } = makeService();
    cache.get.mockResolvedValue(null);

    const widget = makeWidget('uptime-bar', { monitorId: 'mon1' });
    await svc.resolveWidgetData('user1', widget, '24h');

    const callArgs = vi.mocked(resolvers.resolveUptimeWidget).mock.calls[0];
    expect(callArgs[4]).toBe(1);
  });

  it('passes overrideDays=7 for "7d" range', async () => {
    const { svc, cache } = makeService();
    cache.get.mockResolvedValue(null);

    const widget = makeWidget('uptime-bar', { monitorId: 'mon1' });
    await svc.resolveWidgetData('user1', widget, '7d');

    const callArgs = vi.mocked(resolvers.resolveUptimeWidget).mock.calls[0];
    expect(callArgs[4]).toBe(7);
  });

  it('passes overrideDays=undefined when no range provided', async () => {
    const { svc, cache } = makeService();
    cache.get.mockResolvedValue(null);

    const widget = makeWidget('uptime-bar', { monitorId: 'mon1' });
    await svc.resolveWidgetData('user1', widget);

    const callArgs = vi.mocked(resolvers.resolveUptimeWidget).mock.calls[0];
    expect(callArgs[4]).toBeUndefined();
  });
});
