import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { MonitorType } from '../../types';

/** All valid MonitorType values (kept in sync with types.ts). */
export const ALL_MONITOR_TYPES: MonitorType[] = [
  'HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'TCP', 'SSL_CERT', 'HEARTBEAT',
  'DNS', 'PING', 'SMTP', 'BROWSER', 'WHOIS', 'FTP', 'IMAP', 'POP3',
  'CT_LOG', 'GRAPHQL', 'TRANSACTION',
];

export class V2ListMonitorsQuery {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by monitor type',
    enum: ALL_MONITOR_TYPES,
  })
  @IsOptional()
  @IsIn(ALL_MONITOR_TYPES)
  type?: MonitorType;

  @ApiPropertyOptional({ description: 'Filter by enabled state' })
  @IsOptional()
  @IsIn(['true', 'false'])
  enabled?: 'true' | 'false';

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['name', 'createdAt', 'type', 'intervalSec'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['name', 'createdAt', 'type', 'intervalSec'])
  sortBy?: 'name' | 'createdAt' | 'type' | 'intervalSec' = 'createdAt';

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ description: 'Full-text search on monitor name or target' })
  @IsOptional()
  @IsString()
  search?: string;
}
