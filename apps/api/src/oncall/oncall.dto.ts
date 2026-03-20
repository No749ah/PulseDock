import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsEmail,
  Min,
  Max,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOnCallScheduleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  rotationDays?: number;
}

export class UpdateOnCallScheduleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  rotationDays?: number;
}

export class AddParticipantDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  order!: number;
}

export class CreateEscalationStepDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  stepOrder!: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(1440)
  waitMinutes!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  notifyEmail?: string;
}

export class CreateEscalationPolicyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  escalateAfterMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxEscalations?: number;

  @ApiPropertyOptional({ type: [CreateEscalationStepDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEscalationStepDto)
  steps?: CreateEscalationStepDto[];
}

export class UpdateEscalationPolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  escalateAfterMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxEscalations?: number;
}
