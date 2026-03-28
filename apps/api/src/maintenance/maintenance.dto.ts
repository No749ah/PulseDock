import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

export enum MaintenanceRecurrence {
  NONE = 'NONE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

@ValidatorConstraint({ name: 'EndAfterStart', async: false })
class EndAfterStartConstraint implements ValidatorConstraintInterface {
  validate(endsAt: string, args: ValidationArguments): boolean {
    const obj = args.object as { startsAt?: string };
    if (!obj.startsAt) return true;
    return new Date(endsAt) > new Date(obj.startsAt);
  }
  defaultMessage(): string {
    return 'endsAt must be after startsAt';
  }
}

export class CreateMaintenanceWindowDto {
  @ApiProperty({ description: 'Name of the maintenance window', example: 'Database migration' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'Optional description', example: 'Upgrading PostgreSQL 15 → 16' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ description: 'ISO 8601 start time', example: '2026-03-16T02:00:00.000Z' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ description: 'ISO 8601 end time', example: '2026-03-16T04:00:00.000Z' })
  @IsDateString()
  @Validate(EndAfterStartConstraint)
  endsAt!: string;

  @ApiPropertyOptional({
    description: 'Monitor IDs to include in this window (empty = all monitors)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  monitorIds?: string[];

  @ApiPropertyOptional({
    description: 'Recurrence pattern: NONE (one-shot), DAILY, WEEKLY, MONTHLY',
    enum: MaintenanceRecurrence,
    default: MaintenanceRecurrence.NONE,
  })
  @IsOptional()
  @IsEnum(MaintenanceRecurrence)
  recurrence?: MaintenanceRecurrence;

  @ApiPropertyOptional({
    description: 'Comma-separated day-of-week numbers for WEEKLY recurrence (0=Sun … 6=Sat)',
    example: '0,6',
  })
  @IsOptional()
  @IsString()
  @MaxLength(13)
  recurrenceDays?: string;

  @ApiPropertyOptional({
    description: 'Duration in minutes for each occurrence window (derived from startsAt/endsAt if omitted)',
    example: 120,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  durationMinutes?: number;

  @ApiPropertyOptional({
    description: 'ISO 8601 date after which no new occurrences are generated',
    example: '2027-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  recurrenceEndsAt?: string;
}

export class UpdateMaintenanceWindowDto extends PartialType(CreateMaintenanceWindowDto) {}
