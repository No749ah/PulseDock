import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

const VALID_TYPES = ['monitors', 'incidents', 'status_pages', 'versions'] as const;
const VALID_SORT_BY = ['relevance', 'updatedAt', 'title'] as const;
const VALID_SORT_DIR = ['asc', 'desc'] as const;

/** Query params for GET /v2/search */
export class V2SearchQuery {
  @ApiPropertyOptional({ description: 'Search query string (min 2 chars)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Entity types to search: monitors, incidents, status_pages, versions. Comma-separated.',
    example: 'monitors,incidents',
  })
  @IsOptional()
  @IsString()
  types?: string;

  @ApiPropertyOptional({
    description: 'Sort field: relevance | updatedAt | title',
    enum: VALID_SORT_BY,
    default: 'relevance',
  })
  @IsOptional()
  @IsIn(VALID_SORT_BY)
  sortBy?: (typeof VALID_SORT_BY)[number];

  @ApiPropertyOptional({
    description: 'Sort direction: asc | desc',
    enum: VALID_SORT_DIR,
    default: 'desc',
  })
  @IsOptional()
  @IsIn(VALID_SORT_DIR)
  sortDir?: (typeof VALID_SORT_DIR)[number];

  @ApiPropertyOptional({ description: 'Page number (1-indexed)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Results per page (1-50)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
