import { IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class V2ListTagsQuery {
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

  @ApiPropertyOptional({ description: 'Full-text search on tag name.' })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort field.',
    enum: ['name', 'createdAt', 'monitorCount'],
    default: 'name',
  })
  @IsOptional()
  @IsIn(['name', 'createdAt', 'monitorCount'])
  sortBy?: 'name' | 'createdAt' | 'monitorCount';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
