import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class V2ListApiKeysQuery {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({ description: 'Items per page (1–100)', default: 20 })
  limit?: number;

  @IsOptional()
  @IsIn(['READ', 'WRITE', 'ADMIN'])
  @ApiPropertyOptional({ description: 'Filter by key scope', enum: ['READ', 'WRITE', 'ADMIN'] })
  scope?: string;

  @IsOptional()
  @IsIn(['active', 'expired'])
  @ApiPropertyOptional({ description: 'Filter by expiry status: active or expired', enum: ['active', 'expired'] })
  status?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Search by key name (case-insensitive prefix match)' })
  search?: string;

  @IsOptional()
  @IsIn(['name', 'createdAt', 'lastUsedAt', 'usageCount'])
  @ApiPropertyOptional({ description: 'Sort field', enum: ['name', 'createdAt', 'lastUsedAt', 'usageCount'] })
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'] })
  sortDir?: string;
}
