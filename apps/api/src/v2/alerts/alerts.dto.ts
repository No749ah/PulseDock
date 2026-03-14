import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class V2ListAlertChannelsQuery {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by channel type',
    enum: ['webhook', 'discord', 'slack', 'telegram', 'email'],
  })
  @IsOptional()
  @IsIn(['webhook', 'discord', 'slack', 'telegram', 'email'])
  type?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['name', 'createdAt', 'type'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['name', 'createdAt', 'type'])
  sortBy?: 'name' | 'createdAt' | 'type' = 'createdAt';

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ description: 'Full-text search on channel name' })
  @IsOptional()
  @IsString()
  search?: string;
}
