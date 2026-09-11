import { IsOptional, IsString, IsIn, IsInt, Min, Max, IsISO8601 } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Query parameters for GET /v2/alert-deliveries
 */
export class V2ListAlertDeliveriesQuery {
  @ApiPropertyOptional({ description: 'Filter by delivery status', enum: ['success', 'failed'] })
  @IsOptional()
  @IsString()
  @IsIn(['success', 'failed'])
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by alert channel ID' })
  @IsOptional()
  @IsString()
  channelId?: string;

  @ApiPropertyOptional({ description: 'Filter by monitor ID' })
  @IsOptional()
  @IsString()
  monitorId?: string;

  @ApiPropertyOptional({ description: 'Return deliveries at or after this ISO-8601 datetime' })
  @IsOptional()
  @IsISO8601()
  since?: string;

  @ApiPropertyOptional({ description: 'Return deliveries at or before this ISO-8601 datetime' })
  @IsOptional()
  @IsISO8601()
  until?: string;

  @ApiPropertyOptional({ description: 'Sort field', enum: ['createdAt', 'durationMs', 'status'], default: 'createdAt' })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'durationMs', 'status'])
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortDir?: string = 'desc';

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page (1–100)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
