import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class V2ListDeploymentsQuery {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Page size (max 200)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by service name (exact match)' })
  @IsOptional()
  @IsString()
  service?: string;

  @ApiPropertyOptional({ description: 'Filter by environment (e.g. production, staging)' })
  @IsOptional()
  @IsString()
  environment?: string;

  @ApiPropertyOptional({
    description: 'Filter by deployment status',
    enum: ['STARTED', 'SUCCESS', 'FAILED', 'ROLLBACK'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['STARTED', 'SUCCESS', 'FAILED', 'ROLLBACK'])
  status?: string;

  @ApiPropertyOptional({ description: 'Full-text search on service name, version, or commitMessage' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['createdAt', 'service', 'environment', 'status'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'service', 'environment', 'status'])
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
