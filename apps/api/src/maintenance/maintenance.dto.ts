import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

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
}

export class UpdateMaintenanceWindowDto extends PartialType(CreateMaintenanceWindowDto) {}
