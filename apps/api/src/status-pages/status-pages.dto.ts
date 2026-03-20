import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
  IsArray,
  IsNumber,
  IsIn,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WidgetType } from './status-pages.types';

const VALID_WIDGET_TYPES: WidgetType[] = [
  // ── Core Status ──────────────────────────────────────────────────────────
  'uptime-bar',
  'uptime-timeline',
  'uptime-percentage-card',
  'rolling-uptime-cards',
  'uptime-heatmap',
  'uptime-comparison-chart',
  'status-history-ribbon',
  'current-status-badge',
  'overall-system-status',
  'component-status-list',
  'multi-monitor-status-grid',
  'multi-status-badges',
  'monitor-group-status',
  'monitor-group',
  'aggregate-health-score',
  'sticky-header',
  // ── Performance ──────────────────────────────────────────────────────────
  'response-time-chart',
  'response-time-heatmap',
  'response-time-comparison',
  'latency-percentiles-card',
  'performance-trend',
  'apdex-score',
  'throughput-counter',
  'dns-resolution-time',
  'ssl-certificate-status',
  // ── SLA & Uptime Deep ────────────────────────────────────────────────────
  'sla-summary',
  'sla-compliance-table',
  'downtime-log',
  'mttr-mttf-cards',
  // ── Incidents & Maintenance ──────────────────────────────────────────────
  'incident-history',
  'active-incident-banner',
  'active-incident-count',
  'incident-timeline',
  'incident-severity-distribution',
  'incident-duration-stats',
  'post-mortem-card',
  'scheduled-maintenance',
  'maintenance-calendar',
  'next-maintenance-countdown',
  'maintenance-impact-list',
  // ── Version ──────────────────────────────────────────────────────────────
  'version-status-grid',
  'version-check-badge',
  'update-summary',
  'version-timeline',
  'outdated-components-alert',
  'version-comparison-table',
  'changelog-widget',
  'security-advisory',
  // ── Metrics & Data ───────────────────────────────────────────────────────
  'metric-counter',
  'metric-comparison-row',
  'custom-metric-chart',
  'gauge',
  'sparkline-row',
  'stats-grid',
  'progress-ring',
  'data-table',
  'check-history-feed',
  // ── Multi-Env / Region / Deps ────────────────────────────────────────────
  'service-health-matrix',
  'multi-environment-status',
  'region-status-map',
  'third-party-dependencies',
  'dependency-map',
  // ── Content & Branding ───────────────────────────────────────────────────
  'text-block',
  'announcement-bar',
  'image-banner',
  'link-list',
  'social-links',
  'faq-accordion',
  'embed-iframe',
  'video-embed',
  'code-block',
  'subscriber-form',
  'rss-feed-widget',
  'countdown',
  // ── Layout & Navigation ──────────────────────────────────────────────────
  'tab-container',
  'collapsible-section',
  'column-layout',
  'table-of-contents',
  'page-navigation',
  'last-updated-footer',
  'divider',
  // ── Misc ─────────────────────────────────────────────────────────────────
  'offline-banner',
];

export class WidgetDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty()
  @IsIn(VALID_WIDGET_TYPES)
  type!: WidgetType;

  @ApiProperty()
  @IsNumber()
  x!: number;

  @ApiProperty()
  @IsNumber()
  y!: number;

  @ApiProperty()
  @IsNumber()
  w!: number;

  @ApiProperty()
  @IsNumber()
  h!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  locked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class PageSettingsDto {
  @ApiPropertyOptional({ description: 'Auto-refresh interval in seconds. 0 = disabled.' })
  @IsOptional()
  @IsNumber()
  autoRefreshInterval?: number;

  @ApiPropertyOptional({ description: 'Show "Powered by PulseDock" footer branding.' })
  @IsOptional()
  @IsBoolean()
  showBranding?: boolean;

  @ApiPropertyOptional({ description: 'Logo URL for the page header.' })
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'logoUrl must be a valid URL' })
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Custom accent color hex (e.g. #6366f1).' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  accentColor?: string;
}

export class PageLayoutDto {
  @ApiProperty({ type: [WidgetDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WidgetDto)
  widgets!: WidgetDto[];

  @ApiPropertyOptional({ type: PageSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PageSettingsDto)
  settings?: PageSettingsDto;
}

export class CreateStatusPageDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'URL-friendly slug (lowercase letters, numbers, hyphens only)',
    pattern: '^[a-z0-9-]+$',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({ description: 'Initial page layout (widgets + settings). Stored as raw JSON.' })
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  layout?: Record<string, unknown>;
}

export class UpdateStatusPageDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Page layout (widgets + settings). Stored as raw JSON — no deep validation.' })
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  layout?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  password?: string;

  @ApiPropertyOptional({
    description: 'Set to empty string to remove password protection',
  })
  @IsOptional()
  @IsBoolean()
  removePassword?: boolean;

  @ApiPropertyOptional({
    description: 'Webhook URL to POST when the overall page status changes (operational/degraded/outage). Leave empty to disable.',
    example: 'https://example.com/webhook/status',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notifyWebhookUrl?: string;

  @ApiPropertyOptional({
    description: 'Slack incoming webhook URL for status change notifications. Leave empty to disable.',
    example: 'https://hooks.slack.com/services/YOUR_WORKSPACE/YOUR_CHANNEL/YOUR_TOKEN',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  slackWebhookUrl?: string;

  @ApiPropertyOptional({
    description: 'Discord webhook URL for status change notifications. Leave empty to disable.',
    example: 'https://discord.com/api/webhooks/000000000000000000/XXXXXXXXXXXXXXXXXXXXXXXXX',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  discordWebhookUrl?: string;

  @ApiPropertyOptional({
    description: 'Custom CSS injected into the public status page <head>. Allows branding and style customization. Max 10,000 characters.',
    example: 'body { font-family: "Inter", sans-serif; } .page-title { color: #6366f1; }',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  customCss?: string;
}
