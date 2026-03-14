import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeHtml } from '../common/sanitize';

export class CreateAlertChannelDto {
  @SanitizeHtml()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsIn(['discord', 'webhook', 'slack', 'telegram', 'email'])
  type!: 'discord' | 'webhook' | 'slack' | 'telegram' | 'email';

  @IsObject()
  config!: Record<string, unknown>;
}

export class UpdateAlertChannelDto {
  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsIn(['discord', 'webhook', 'slack', 'telegram', 'email'])
  type?: 'discord' | 'webhook' | 'slack' | 'telegram' | 'email';

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class TestAlertChannelDto {
  @IsString()
  @MaxLength(255)
  channelId!: string;
}
