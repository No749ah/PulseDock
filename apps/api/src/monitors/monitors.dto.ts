import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SanitizeHtml } from '../common/sanitize';

export class CreateMonitorDto {
  @ApiProperty({ description: 'Display name for the monitor', maxLength: 255, example: 'My API Health' })
  @SanitizeHtml()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({
    description: 'Target URL, host:port, GitHub repo slug, Docker image, etc. depending on type',
    maxLength: 1024,
    example: 'https://api.example.com/health',
  })
  @IsString()
  @MaxLength(1024)
  target!: string;

  @ApiProperty({
    description: 'Monitor type',
    enum: ['HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'TCP', 'SSL_CERT', 'HEARTBEAT'],
    example: 'HTTP',
  })
  @IsIn(['HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'TCP', 'SSL_CERT', 'HEARTBEAT'])
  type!: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE' | 'TCP' | 'SSL_CERT' | 'HEARTBEAT';

  @ApiPropertyOptional({ description: 'Check interval in seconds (min 10)', minimum: 10, example: 60 })
  @IsOptional()
  @IsInt()
  @Min(10)
  intervalSec?: number;

  @ApiPropertyOptional({ description: 'Request timeout in milliseconds (min 100)', minimum: 100, example: 10000 })
  @IsOptional()
  @IsInt()
  @Min(100)
  timeoutMs?: number;

  @ApiPropertyOptional({
    description: 'Number of consecutive failures required before triggering an alert (1–10). Reduces false-positive noise.',
    minimum: 1,
    maximum: 10,
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  confirmations?: number;

  @ApiPropertyOptional({
    description: [
      'Monitor-type-specific configuration. For HTTP monitors: method, requestHeaders, requestBody, expectedStatus, bodyContains, responseTimeThresholdMs.',
      'For HEARTBEAT: timeoutMin, token.',
      'For SSL_CERT: warnDays.',
      'For GIT_RELEASE/DOCKER_IMAGE: token, host, appVersionEndpoint, appAuthType.',
    ].join(' '),
    example: {
      method: 'POST',
      requestHeaders: { 'Authorization': 'Bearer <token>', 'Content-Type': 'application/json' },
      requestBody: '{"ping":true}',
      expectedStatus: [200, 201],
      bodyContains: '"ok":true',
      responseTimeThresholdMs: 2000,
    },
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  alertChannelIds?: string[];

  @IsOptional()
  folderId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
}

export class UpdateMonitorDto {
  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  target?: string;

  @IsOptional()
  @IsIn(['HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'TCP', 'SSL_CERT', 'HEARTBEAT'])
  type?: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE' | 'TCP' | 'SSL_CERT' | 'HEARTBEAT';

  @IsOptional()
  @IsInt()
  @Min(10)
  intervalSec?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  timeoutMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  confirmations?: number;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  alertChannelIds?: string[];

  @IsOptional()
  folderId?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
}

export class RunMonitorDto {
  @IsString()
  monitorId!: string;
}

export class TestVersionConnectionDto {
  @IsIn(['github', 'gitlab', 'docker', 'apt', 'npm', 'pypi', 'cargo', 'maven', 'helm'])
  provider!: 'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'maven' | 'helm';

  @IsString()
  @MaxLength(1024)
  target!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;
}

export class ImportMonitorItemDto {
  @SanitizeHtml()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(1024)
  target!: string;

  @IsIn(['HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE', 'TCP', 'SSL_CERT', 'HEARTBEAT'])
  type!: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE' | 'TCP' | 'SSL_CERT' | 'HEARTBEAT';

  @IsOptional()
  @IsInt()
  @Min(10)
  intervalSec?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  timeoutMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  confirmations?: number;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ImportMonitorsDto {
  @IsArray()
  monitors!: ImportMonitorItemDto[];
}

export class DiscoverVersionDto {
  @IsIn(['github', 'gitlab', 'docker', 'apt', 'npm', 'pypi', 'cargo', 'maven', 'helm'])
  provider!: 'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'maven' | 'helm';

  @IsString()
  @MaxLength(1024)
  target!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;

  @IsOptional()
  @IsString()
  @IsUrl()
  appUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  appToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  appVersionEndpoint?: string;

  @IsOptional()
  @IsIn(['none', 'token', 'openvpn'])
  appAuthType?: 'none' | 'token' | 'openvpn';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  openvpnUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  openvpnPassword?: string;
}

export class BulkActionDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];

  @IsIn(['enable', 'disable', 'delete', 'run'])
  action!: 'enable' | 'disable' | 'delete' | 'run';
}

export class ImportExternalDto {
  @IsIn(['uptime-robot', 'better-uptime', 'csv'])
  source!: 'uptime-robot' | 'better-uptime' | 'csv';

  /** Raw export payload: JSON object for uptime-robot/better-uptime, CSV string for csv. */
  payload!: unknown;
}
