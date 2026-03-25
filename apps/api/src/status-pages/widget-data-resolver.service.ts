import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisCacheService } from '../common/redis-cache.service';
import { Widget } from './status-pages.types';
import {
  getRangeStart,
  resolveStatusWidget,
  resolveUptimeWidget,
  resolvePerformanceWidget,
  resolveSlaWidget,
  resolveIncidentWidget,
  resolveMaintenanceWidget,
  resolveVersionWidget,
  resolveMetricWidget,
  resolveContentWidget,
  resolveLayoutWidget,
} from './resolvers';

// Widget type → category resolver mapping
const STATUS_TYPES = new Set([
  'current-status-badge', 'overall-system-status', 'monitor-group', 'monitor-group-status',
  'component-status-list', 'service-health-matrix', 'aggregate-health-score',
  'multi-monitor-status-grid', 'multi-status-badges', 'ssl-certificate-status',
  'dns-resolution-time', 'multi-environment-status', 'region-status-map',
  'third-party-dependencies', 'security-advisory',
]);

const UPTIME_TYPES = new Set([
  'uptime-bar', 'uptime-timeline', 'rolling-uptime-cards', 'status-history-ribbon',
  'uptime-percentage-card', 'uptime-heatmap', 'uptime-comparison-chart',
]);

const PERFORMANCE_TYPES = new Set([
  'response-time-chart', 'response-time-heatmap', 'latency-percentiles-card',
  'performance-trend', 'apdex-score', 'throughput-counter', 'response-time-comparison',
  'check-history-feed',
]);

const SLA_TYPES = new Set([
  'sla-summary', 'sla-compliance-table', 'downtime-log', 'mttr-mttf-cards',
]);

const INCIDENT_TYPES = new Set([
  'active-incident-banner', 'active-incident-count', 'incident-history',
  'incident-timeline', 'incident-severity-distribution', 'incident-duration-stats',
  'post-mortem-card',
]);

const MAINTENANCE_TYPES = new Set([
  'scheduled-maintenance', 'maintenance-calendar', 'next-maintenance-countdown',
  'maintenance-impact-list',
]);

const VERSION_TYPES = new Set([
  'version-status-grid', 'version-check-badge', 'update-summary', 'version-timeline',
  'outdated-components-alert', 'version-comparison-table', 'changelog-widget',
]);

const METRIC_TYPES = new Set([
  'metric-counter', 'metric-comparison-row', 'custom-metric-chart', 'gauge',
  'stats-grid', 'sparkline-row', 'progress-ring', 'data-table',
]);

const CONTENT_TYPES = new Set([
  'announcement-bar', 'link-list', 'faq-accordion', 'social-links', 'embed-iframe',
  'subscriber-form', 'countdown', 'text-block', 'code-block', 'image-banner',
  'video-embed', 'rss-feed-widget',
]);

const LAYOUT_TYPES = new Set([
  'last-updated-footer', 'collapsible-section', 'divider', 'tab-container',
  'dependency-map', 'table-of-contents', 'page-navigation', 'column-layout',
  'sticky-header', 'offline-banner',
]);

@Injectable()
export class WidgetDataResolverService {
  private readonly logger = new Logger(WidgetDataResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  /**
   * Converts a range string (24h, 7d, 30d, 90d) to a start Date.
   * Delegates to shared utility.
   */
  getRangeStart(range?: string): Date {
    return getRangeStart(range);
  }

  /**
   * Resolves server-side data for a single widget configuration.
   * Supports all implemented widget types and returns a widget-specific payload for rendering.
   *
   * @param userId - The owner user ID of the status page
   * @param widget - The widget configuration object from the page layout
   * @param range - Optional range string (24h, 7d, 30d, 90d)
   * @returns A widget-specific data object
   * @throws BadRequestException if required widget configuration is missing or invalid
   * @throws NotFoundException if a referenced resource (e.g. monitor) does not exist
   */
  async resolveWidgetData(userId: string, widget: Widget, range?: string): Promise<Record<string, unknown>> {
    const monitorId = widget.config.monitorId as string | undefined;
    // If a range param is provided, convert it to days and override widget's periodDays for time-based widgets
    const rangeToDays: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };
    const overrideDays = range && rangeToDays[range] ? rangeToDays[range] : undefined;

    // Cache key uniquely identifies this widget data request.
    // TTL: 30s for most widgets (aligns with public page 60s auto-refresh).
    // No-config widgets skip the cache entirely (fast path, no DB).
    const cacheKey = `widget:${widget.id}:${widget.type}:${monitorId ?? 'none'}:${range ?? 'default'}`;
    const cached = await this.cache.get<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const result = await this._resolveWidgetDataUncached(userId, widget, overrideDays);
    // Don't cache unconfigured/error states — they resolve instantly and shouldn't mask real data
    if (!result['_noConfig']) {
      await this.cache.set(cacheKey, result, 30);
    }
    return result;
  }

  /**
   * Routes widget data resolution to the appropriate category resolver.
   */
  private async _resolveWidgetDataUncached(
    userId: string,
    widget: Widget,
    overrideDays: number | undefined,
  ): Promise<Record<string, unknown>> {
    const { prisma, cache } = this;
    const type = widget.type;

    if (STATUS_TYPES.has(type)) {
      return resolveStatusWidget(prisma, cache, userId, widget, overrideDays);
    }
    if (UPTIME_TYPES.has(type)) {
      return resolveUptimeWidget(prisma, cache, userId, widget, overrideDays);
    }
    if (PERFORMANCE_TYPES.has(type)) {
      return resolvePerformanceWidget(prisma, cache, userId, widget, overrideDays);
    }
    if (SLA_TYPES.has(type)) {
      return resolveSlaWidget(prisma, cache, userId, widget, overrideDays);
    }
    if (INCIDENT_TYPES.has(type)) {
      return resolveIncidentWidget(prisma, cache, userId, widget, overrideDays);
    }
    if (MAINTENANCE_TYPES.has(type)) {
      return resolveMaintenanceWidget(prisma, cache, userId, widget, overrideDays);
    }
    if (VERSION_TYPES.has(type)) {
      return resolveVersionWidget(prisma, cache, userId, widget, overrideDays);
    }
    if (METRIC_TYPES.has(type)) {
      return resolveMetricWidget(prisma, cache, userId, widget, overrideDays);
    }
    if (CONTENT_TYPES.has(type)) {
      return resolveContentWidget(prisma, cache, userId, widget, overrideDays);
    }
    if (LAYOUT_TYPES.has(type)) {
      return resolveLayoutWidget(prisma, cache, userId, widget, overrideDays);
    }

    this.logger.warn(`Unknown widget type: ${type}`);
    return { widgetType: type, message: 'Widget data not yet implemented for this type' };
  }
}
