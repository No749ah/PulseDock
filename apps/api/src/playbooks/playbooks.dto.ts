import { IsString, IsOptional, IsArray, MaxLength, ArrayMaxSize, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PlaybookStepDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiProperty({ enum: ['check', 'escalate', 'runbook', 'command', 'notify'] })
  @IsEnum(['check', 'escalate', 'runbook', 'command', 'notify']) type!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(200) contact?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) url?: string;
}

export class CreatePlaybookDto {
  @ApiProperty() @IsString() @MaxLength(100) name!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty({ type: [PlaybookStepDto] })
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PlaybookStepDto)
  steps!: PlaybookStepDto[];
  @ApiProperty({ required: false }) @IsOptional() @IsArray() @IsString({ each: true }) forSeverities?: string[];
}

export class UpdatePlaybookDto extends CreatePlaybookDto {}

export class AttachPlaybookDto {
  @ApiProperty({ nullable: true }) @IsOptional() @IsString() playbookId?: string | null;
}

export class MarkStepDto {
  @ApiProperty() done!: boolean;
}
