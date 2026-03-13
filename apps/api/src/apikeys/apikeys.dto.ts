import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'CI/CD Pipeline', description: 'Human-readable name for this API key' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z', description: 'Optional expiry date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
