import { IsOptional, IsIn, IsDateString, IsString, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const VALID_SORT_DIRS = ['asc', 'desc'] as const;

export class V2ListActivityQuery {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Page size (1–100)', default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  /**
   * Filter by action prefix — e.g. "auth" returns all auth.* events,
   * "monitor" returns all monitor.* events.
   */
  @ApiPropertyOptional({ description: 'Filter by action prefix (e.g. auth, monitor, alert)' })
  @IsOptional()
  @IsString()
  action?: string;

  /** Filter events after this ISO 8601 timestamp */
  @ApiPropertyOptional({ description: 'Return events after this ISO 8601 timestamp' })
  @IsOptional()
  @IsDateString()
  since?: string;

  /** Filter events before this ISO 8601 timestamp */
  @ApiPropertyOptional({ description: 'Return events before this ISO 8601 timestamp' })
  @IsOptional()
  @IsDateString()
  until?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(VALID_SORT_DIRS)
  sortDir?: (typeof VALID_SORT_DIRS)[number];
}
