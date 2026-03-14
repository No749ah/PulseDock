import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class V2ListChecksQuery {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Filter to a specific monitor ID' })
  @IsOptional()
  @IsString()
  monitorId?: string;

  @ApiPropertyOptional({ description: 'Filter by result level', enum: ['green', 'yellow', 'red'] })
  @IsOptional()
  @IsIn(['green', 'yellow', 'red'])
  level?: 'green' | 'yellow' | 'red';

  @ApiPropertyOptional({ description: 'Filter checks after this ISO-8601 timestamp (inclusive)' })
  @IsOptional()
  @IsISO8601()
  since?: string;

  @ApiPropertyOptional({ description: 'Filter checks before this ISO-8601 timestamp (exclusive)' })
  @IsOptional()
  @IsISO8601()
  until?: string;
}
