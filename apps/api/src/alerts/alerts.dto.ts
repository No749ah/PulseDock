import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SanitizeHtml } from '../common/sanitize';

export class CreateAlertChannelDto {
  @SanitizeHtml()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsIn(['discord', 'webhook', 'slack', 'telegram', 'email', 'pagerduty', 'opsgenie', 'sms', 'teams', 'ntfy', 'gotify', 'matrix', 'rocketchat', 'apprise'])
  type!: 'discord' | 'webhook' | 'slack' | 'telegram' | 'email' | 'pagerduty' | 'opsgenie' | 'sms' | 'teams' | 'ntfy' | 'gotify' | 'matrix' | 'rocketchat' | 'apprise';

  @IsObject()
  config!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  alertGrouping?: boolean;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(86400)
  groupWindowSec?: number;

  @IsOptional()
  @IsBoolean()
  groupByFolder?: boolean;

  @IsOptional()
  @IsBoolean()
  groupByTag?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  messageTemplate?: string;
}

export class UpdateAlertChannelDto {
  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsIn(['discord', 'webhook', 'slack', 'telegram', 'email', 'pagerduty', 'opsgenie', 'sms', 'teams', 'ntfy', 'gotify', 'matrix', 'rocketchat', 'apprise'])
  type?: 'discord' | 'webhook' | 'slack' | 'telegram' | 'email' | 'pagerduty' | 'opsgenie' | 'sms' | 'teams' | 'ntfy' | 'gotify' | 'matrix' | 'rocketchat' | 'apprise';

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  alertGrouping?: boolean;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(86400)
  groupWindowSec?: number;

  @IsOptional()
  @IsBoolean()
  groupByFolder?: boolean;

  @IsOptional()
  @IsBoolean()
  groupByTag?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  messageTemplate?: string | null;
}

export class TestAlertChannelDto {
  @IsString()
  @MaxLength(255)
  channelId!: string;
}

export class PreviewPayloadDto {
  @IsOptional()
  @IsString()
  template?: string;
}
