import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SanitizeHtml } from '../common/sanitize';

export class CreateFolderDto {
  @SanitizeHtml()
  @IsString()
  @MinLength(2)
  @ApiProperty({ description: 'Folder name (min 2 chars)' })
  name!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Parent folder ID for nesting. Null = root level.' })
  parentId?: string | null;
}

export class UpdateFolderDto {
  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MinLength(2)
  @ApiPropertyOptional({ description: 'Folder name' })
  name?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Parent folder ID. Set to null to move to root.' })
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  @ApiPropertyOptional({ description: 'Sort position within parent (0-9999)' })
  position?: number;
}

export class MoveFolderDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'New parent folder ID. Null = move to root.' })
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  @ApiPropertyOptional({ description: 'Sort position within new parent' })
  position?: number;
}
