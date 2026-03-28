import { IsArray, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OpenApiPreviewDto {
  @ApiProperty({ required: false, description: 'URL to fetch the OpenAPI/Swagger spec from' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiProperty({ required: false, description: 'Raw JSON string of the OpenAPI/Swagger spec' })
  @IsOptional()
  @IsString()
  specJson?: string;

  @ApiProperty({ description: 'Base URL for generated monitors (e.g. https://api.example.com)' })
  @IsString()
  baseUrl!: string;

  @ApiProperty({ required: false, description: 'Maximum number of paths to return (default 50, max 100)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxPaths?: number;
}

export class OpenApiImportDto extends OpenApiPreviewDto {
  @ApiProperty({ description: 'Array of "METHOD:PATH" strings to import' })
  @IsArray()
  @IsString({ each: true })
  selectedPaths!: string[];

  @ApiProperty({ required: false, description: 'Monitor check interval in seconds (default 60)' })
  @IsOptional()
  @IsNumber()
  intervalSec?: number;

  @ApiProperty({ required: false, description: 'Folder ID to assign monitors to' })
  @IsOptional()
  @IsString()
  folderId?: string;

  @ApiProperty({ required: false, description: 'Alert channel IDs to assign to created monitors' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  alertChannelIds?: string[];
}
