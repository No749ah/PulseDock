import { IsIn, IsOptional, IsBoolean, IsString, MaxLength, IsUrl } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class UpdateRetentionDto {
  @ApiProperty({ enum: [7, 30, 90, 365], example: 90 })
  @IsIn([7, 30, 90, 365])
  retentionDays!: 7 | 30 | 90 | 365

  @ApiPropertyOptional({ description: 'Whether to aggregate old data into daily rollup buckets before deletion (default: true)' })
  @IsOptional()
  @IsBoolean()
  rollupEnabled?: boolean
}

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({ description: 'Workspace display name', example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  workspaceName?: string

  @ApiPropertyOptional({ description: 'Workspace slug for URLs', example: 'acme-corp' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  workspaceSlug?: string

  @ApiPropertyOptional({ description: 'Workspace logo URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  workspaceLogo?: string

  @ApiPropertyOptional({ description: 'Workspace website URL' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  workspaceWebsite?: string
}
