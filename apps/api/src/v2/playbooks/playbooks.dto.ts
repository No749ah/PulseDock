import { IsOptional, IsInt, Min, Max, IsIn, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class V2ListPlaybooksQuery {
  @ApiPropertyOptional({ description: 'Page number (1-based)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page (1–100)', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Case-insensitive name/description search', example: 'incident' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['name', 'createdAt', 'updatedAt', 'stepCount', 'monitorCount'],
    example: 'updatedAt',
  })
  @IsOptional()
  @IsIn(['name', 'createdAt', 'updatedAt', 'stepCount', 'monitorCount'])
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'stepCount' | 'monitorCount';

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @ApiPropertyOptional({
    description: 'Filter by severity (case-insensitive). Only returns playbooks with this severity in forSeverities.',
    example: 'CRITICAL',
  })
  @IsOptional()
  @IsString()
  severity?: string;
}
