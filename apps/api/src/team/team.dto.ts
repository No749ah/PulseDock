import { IsEmail, IsEnum } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export enum TeamRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  EDITOR = 'EDITOR',
  VIEWER = 'VIEWER',
}

export class InviteMemberDto {
  @ApiProperty({ example: 'member@example.com' })
  @IsEmail()
  email!: string

  @ApiProperty({ enum: TeamRole, example: TeamRole.VIEWER })
  @IsEnum(TeamRole)
  role!: TeamRole
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: TeamRole, example: TeamRole.EDITOR })
  @IsEnum(TeamRole)
  role!: TeamRole
}
