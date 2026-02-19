import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreateMonitorDto {
  @IsString()
  name!: string;

  @IsString()
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
}

export class UpdateMonitorDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
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
}

export class RunMonitorDto {
  @IsString()
  monitorId!: string;
}

export class TestVersionConnectionDto {
  @IsIn(['github', 'gitlab', 'docker', 'apt'])
  provider!: 'github' | 'gitlab' | 'docker' | 'apt';

  @IsString()
  target!: string;

  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  host?: string;
}

export class DiscoverVersionDto {
  @IsIn(['github', 'gitlab', 'docker', 'apt'])
  provider!: 'github' | 'gitlab' | 'docker' | 'apt';

  @IsString()
  target!: string;

  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsString()
  appUrl?: string;

  @IsOptional()
  @IsString()
  appToken?: string;

  @IsOptional()
  @IsString()
  appVersionEndpoint?: string;

  @IsOptional()
  @IsIn(['none', 'token', 'openvpn'])
  appAuthType?: 'none' | 'token' | 'openvpn';

  @IsOptional()
  @IsString()
  openvpnUsername?: string;

  @IsOptional()
  @IsString()
  openvpnPassword?: string;
}
