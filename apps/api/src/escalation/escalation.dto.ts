import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class EscalationStepDto {
  @ApiProperty({ description: 'Minutes after alert fires before this step triggers', example: 5 })
  delayMinutes!: number;

  @ApiProperty({ description: 'Alert channel ID to notify at this step', example: 'clxxxx' })
  @IsString()
  @IsNotEmpty()
  channelId!: string;
}

export class CreateEscalationPolicyDto {
  @ApiProperty({ description: 'Policy name', example: 'Critical Service Escalation' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description: 'Escalation steps in order',
    type: [EscalationStepDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EscalationStepDto)
  steps?: EscalationStepDto[];
}

export class UpdateEscalationPolicyDto {
  @ApiPropertyOptional({ description: 'Policy name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    description: 'Escalation steps in order',
    type: [EscalationStepDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EscalationStepDto)
  steps?: EscalationStepDto[];
}
