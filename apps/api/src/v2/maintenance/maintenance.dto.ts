import { IsOptional, IsIn, IsInt, Min, Max, IsEnum, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum V2MaintenanceRecurrence {
  NONE = 'NONE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export class V2ListMaintenanceQuery {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Page size (max 100)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Full-text search on name or description.' })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by recurrence type.',
    enum: V2MaintenanceRecurrence,
  })
  @IsOptional()
  @IsIn(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'])
  recurrence?: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

  @ApiPropertyOptional({
    description: 'Filter to only active windows (currently suppressing checks).',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  activeOnly?: boolean | string;

  @ApiPropertyOptional({
    description: 'Sort field.',
    enum: ['startsAt', 'endsAt', 'createdAt', 'name', 'monitorCount'],
    default: 'startsAt',
  })
  @IsOptional()
  @IsIn(['startsAt', 'endsAt', 'createdAt', 'name', 'monitorCount'])
  sortBy?: 'startsAt' | 'endsAt' | 'createdAt' | 'name' | 'monitorCount';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
