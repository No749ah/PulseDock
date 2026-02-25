import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

export class UpdateFolderDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}
