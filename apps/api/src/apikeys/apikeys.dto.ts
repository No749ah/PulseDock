import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeHtml } from '../common/sanitize';

export enum ApiKeyScope {
  READ = 'READ',
  WRITE = 'WRITE',
  ADMIN = 'ADMIN',
}

export const API_KEY_SCOPE_DESCRIPTIONS: Record<ApiKeyScope, string> = {
  [ApiKeyScope.READ]: 'Read-only: list monitors, runs, status pages (no mutations)',
  [ApiKeyScope.WRITE]: 'Read + Write: create/update/delete monitors, alert channels (no admin operations)',
  [ApiKeyScope.ADMIN]: 'Full access: all operations including user management and system settings',
};

export class CreateApiKeyDto {
  @ApiProperty({ example: 'CI/CD Pipeline', description: 'Human-readable name for this API key' })
  @SanitizeHtml()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @ApiPropertyOptional({ enum: ApiKeyScope, default: ApiKeyScope.WRITE, description: 'Permission scope for this key' })
  @IsOptional()
  @IsEnum(ApiKeyScope)
  scope?: ApiKeyScope;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z', description: 'Optional expiry date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
