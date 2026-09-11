import { IsBoolean, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class SetRoleDto {
  @IsString()
  userId!: string;

  @IsIn(['admin', 'user'])
  role!: 'admin' | 'user';
}

export class SetStatusDto {
  @IsString()
  userId!: string;

  @IsBoolean()
  isActive!: boolean;
}

export class UpdateUserDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsIn(['admin', 'user'])
  role?: 'admin' | 'user';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}
