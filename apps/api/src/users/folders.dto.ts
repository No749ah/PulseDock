import { IsOptional, IsString, MinLength } from 'class-validator';
import { SanitizeHtml } from '../common/sanitize';

export class CreateFolderDto {
  @SanitizeHtml()
  @IsString()
  @MinLength(2)
  name!: string;
}

export class UpdateFolderDto {
  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MinLength(2)
  name?: string;
}
