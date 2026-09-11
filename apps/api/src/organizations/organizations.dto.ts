import { IsString, IsOptional, IsUrl, IsEmail, IsEnum, MinLength, MaxLength, Matches } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { OrgRole } from '@prisma/client'

export { OrgRole }

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Corp', description: 'Organization display name' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string

  @ApiProperty({ example: 'acme-corp', description: 'URL-safe slug (2-50 chars, lowercase letters/digits/hyphens)' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug must be lowercase letters, digits, and hyphens only' })
  slug!: string

  @ApiPropertyOptional({ example: 'https://acme.com/logo.png' })
  @IsOptional()
  @IsUrl()
  logoUrl?: string

  @ApiPropertyOptional({ example: 'https://acme.com' })
  @IsOptional()
  @IsUrl()
  website?: string
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Acme Corporation' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string

  @ApiPropertyOptional({ example: 'https://acme.com/new-logo.png' })
  @IsOptional()
  @IsUrl()
  logoUrl?: string

  @ApiPropertyOptional({ example: 'https://acme.com' })
  @IsOptional()
  @IsUrl()
  website?: string
}

export class InviteOrgMemberDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email!: string

  @ApiProperty({ enum: OrgRole, default: OrgRole.MEMBER })
  @IsEnum(OrgRole)
  role!: OrgRole
}

export class UpdateOrgMemberRoleDto {
  @ApiProperty({ enum: OrgRole })
  @IsEnum(OrgRole)
  role!: OrgRole
}
