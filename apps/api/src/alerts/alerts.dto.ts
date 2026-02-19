import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateAlertChannelDto {
  @IsString()
  name!: string;

  @IsIn(['discord', 'webhook', 'slack', 'telegram', 'email'])
  type!: 'discord' | 'webhook' | 'slack' | 'telegram' | 'email';

  @IsObject()
  config!: Record<string, unknown>;
}

export class UpdateAlertChannelDto {
  @IsOptional()
  @IsString()
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
  channelId!: string;
}
