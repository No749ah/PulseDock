import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AcknowledgeMonitorDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
