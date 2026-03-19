import { IsEmail, IsEnum } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export type TeamRole = 'Admin' | 'Editor' | 'Viewer'

export class InviteMemberDto {
  @ApiProperty({ example: 'member@example.com' })
  @IsEmail()
  email!: string

  @ApiProperty({ enum: ['Admin', 'Editor', 'Viewer'] })
  @IsEnum(['Admin', 'Editor', 'Viewer'])
  role!: TeamRole
}
