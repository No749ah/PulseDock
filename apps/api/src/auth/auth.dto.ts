import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';


export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password!: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(256)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(6)
  totpCode?: string;
}

export class RefreshDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  refreshToken?: string;
}

export class InviteInfoDto {
  @IsString()
  @MaxLength(1024)
  token!: string;
}

export class AcceptInviteDto {
  @IsString()
  @MaxLength(1024)
  token!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password!: string;
}

export class RequestResetDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MaxLength(1024)
  token!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  newPassword!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  currentPassword?: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  newPassword!: string;
}

export class RevokeSessionDto {
  @IsString()
  @MaxLength(255)
  sessionId!: string;
}

export class VerifyEmailDto {
  @IsString()
  @MaxLength(1024)
  token!: string;
}

export class ResendVerificationDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;
}

export class VerifyTotpDto {
  @IsString()
  @MaxLength(2048)
  tempToken!: string;

  @IsString()
  @MaxLength(64)
  code!: string;
}

export class DisableTotpDto {
  @IsString()
  @MaxLength(256)
  password!: string;

  @IsString()
  @MaxLength(64)
  code!: string;
}

export class VerifyCodeDto {
  @IsString()
  @MaxLength(64)
  code!: string;
}

export class SetupDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password!: string;
}
