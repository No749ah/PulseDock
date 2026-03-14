import { IsHexColor, IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeHtml } from '../common/sanitize';

export class CreateTagDto {
  @SanitizeHtml()
  @IsString()
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class UpdateTagDto {
  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;
}
