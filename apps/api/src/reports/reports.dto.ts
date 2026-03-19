import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertReportDto {
  @ApiPropertyOptional({ description: 'Whether reports are enabled', default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: ['daily', 'weekly'], description: 'Report frequency', default: 'weekly' })
  @IsOptional()
  @IsIn(['daily', 'weekly'])
  frequency?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 6, description: 'Day of week to send (0=Sun, 1=Mon, ..., 6=Sat). Only used for weekly reports.', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 23, description: 'UTC hour to send the report (0–23)', default: 8 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hourUtc?: number;
}

export class ScheduledReportResponseDto {
  id!: string;
  userId!: string;
  enabled!: boolean;
  frequency!: string;
  dayOfWeek!: number;
  hourUtc!: number;
  lastSentAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}
