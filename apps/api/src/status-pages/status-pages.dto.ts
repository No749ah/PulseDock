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
  'uptime-bar',
  'uptime-timeline',
  'response-time-chart',
  'response-time-heatmap',
  'current-status-badge',
  'multi-monitor-status-grid',
  'incident-history',
  'active-incident-banner',
  'monitor-group-status',
  'monitor-group',           // alias used by frontend palette
  'overall-system-status',
  'sla-summary',
  'check-history-feed',
  'text-block',
  'scheduled-maintenance',
  'last-updated-footer',
  'metric-counter',
  'divider',
  // Version monitor widgets
  'version-status-grid',
  'version-check-badge',
  'update-summary',
  // Multi-status
  'multi-status-badges',
  // New P1 widgets
  'component-status-list',
  'rolling-uptime-cards',
  'status-history-ribbon',
  'uptime-percentage-card',
  // P1 extended — from palette expansion
  'service-health-matrix',
  'aggregate-health-score',
  'latency-percentiles-card',
  'downtime-log',
  'active-incident-count',
  'mttr-mttf-cards',
  'sla-compliance-table',
  'uptime-heatmap',
  'incident-timeline',
  'ssl-certificate-status',
  'incident-severity-distribution',
  'incident-duration-stats',
  'post-mortem-card',
  'performance-trend',
  'apdex-score',
  'throughput-counter',
  'response-time-comparison',
  'uptime-comparison-chart',
  'next-maintenance-countdown',
  'maintenance-impact-list',
  'version-timeline',
  'outdated-components-alert',
  'version-comparison-table',
  'dns-resolution-time',
  'gauge',
  'stats-grid',
  'metric-comparison-row',
  'sparkline-row',
  'progress-ring',
  'announcement-bar',
  'link-list',
  'faq-accordion',
  'social-links',
  'embed-iframe',
  'subscriber-form',
  'countdown',
  'maintenance-calendar',
  'changelog-widget',
  'image-banner',
  'data-table',
  'rss-feed-widget',
  'code-block',
  'video-embed',
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  layout?: PageLayoutDto;
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  layout?: PageLayoutDto;

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
}
