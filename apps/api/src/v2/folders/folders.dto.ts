import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

const SORT_FIELDS = ['name', 'createdAt', 'monitorCount', 'position'] as const;
type SortField = (typeof SORT_FIELDS)[number];

const SORT_DIRS = ['asc', 'desc'] as const;
type SortDir = (typeof SORT_DIRS)[number];

export class V2ListFoldersQuery {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page (max 200)', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: 'Full-text search on folder name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: SORT_FIELDS,
    default: 'name',
  })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy?: SortField;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: SORT_DIRS,
    default: 'asc',
  })
  @IsOptional()
  @IsIn(SORT_DIRS)
  sortDir?: SortDir;

  @ApiPropertyOptional({
    description: 'Filter by parent folder id. Pass "root" to list only top-level folders.',
  })
  @IsOptional()
  @IsString()
  parentId?: string;
}
