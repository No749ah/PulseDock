import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';
import { SanitizeHtml } from '../common/sanitize';

export class CreateMonitorDto {
  @SanitizeHtml()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  @IsUrl({}, { message: 'target must be a valid URL' })
  target!: string;

  @IsIn(['HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE'])
  type!: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';

  @IsOptional()
  @IsInt()
  @Min(10)
  intervalSec?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  timeoutMs?: number;

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
  @IsUrl({}, { message: 'target must be a valid URL' })
  target?: string;

  @IsOptional()
  @IsIn(['HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE'])
  type?: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';

  @IsOptional()
  @IsInt()
  @Min(10)
  intervalSec?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  timeoutMs?: number;

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
  @IsIn(['github', 'gitlab', 'docker', 'apt', 'npm', 'pypi', 'cargo'])
  provider!: 'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo';

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

  @IsIn(['HTTP', 'GIT_RELEASE', 'DOCKER_IMAGE'])
  type!: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';

  @IsOptional()
  @IsInt()
  @Min(10)
  intervalSec?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  timeoutMs?: number;

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
  @IsIn(['github', 'gitlab', 'docker', 'apt', 'npm', 'pypi', 'cargo'])
  provider!: 'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo';

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
