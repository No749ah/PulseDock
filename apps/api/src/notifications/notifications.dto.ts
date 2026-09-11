import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @ApiPropertyOptional({ description: 'Notify when a monitor goes down', example: true })
  @IsOptional()
  @IsBoolean()
  notifyOnDown?: boolean;

  @ApiPropertyOptional({ description: 'Notify when a monitor recovers', example: true })
  @IsOptional()
  @IsBoolean()
  notifyOnRecovery?: boolean;

  @ApiPropertyOptional({ description: 'Notify when a monitor is degraded (slow/warning)', example: true })
  @IsOptional()
  @IsBoolean()
  notifyOnDegraded?: boolean;

  @ApiPropertyOptional({ description: 'Enable quiet hours (suppress notifications during a time window)', example: false })
  @IsOptional()
  @IsBoolean()
  quietHoursEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Quiet hours start (0–23, UTC hour)', example: 22 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursStart?: number;

  @ApiPropertyOptional({ description: 'Quiet hours end (0–23, UTC hour)', example: 8 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursEnd?: number;

  @ApiPropertyOptional({
    description: 'Alert delivery frequency',
    enum: ['instant', 'hourly_digest', 'daily_digest'],
    example: 'instant',
  })
  @IsOptional()
  @IsIn(['instant', 'hourly_digest', 'daily_digest'])
  frequency?: string;

  @ApiPropertyOptional({ description: 'Enable alert storm protection — suppress alerts when too many fire in 10 minutes', example: false })
  @IsOptional()
  @IsBoolean()
  alertStormProtection?: boolean;

  @ApiPropertyOptional({ description: 'Max alerts per 10 minutes before storm mode activates (default: 10)', example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  alertStormThreshold?: number;
}

export class NotificationPreferenceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() notifyOnDown!: boolean;
  @ApiProperty() notifyOnRecovery!: boolean;
  @ApiProperty() notifyOnDegraded!: boolean;
  @ApiProperty() quietHoursEnabled!: boolean;
  @ApiProperty() quietHoursStart!: number;
  @ApiProperty() quietHoursEnd!: number;
  @ApiProperty({ enum: ['instant', 'hourly_digest', 'daily_digest'] }) frequency!: string;
  @ApiProperty() alertStormProtection!: boolean;
  @ApiProperty() alertStormThreshold!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}
