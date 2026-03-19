import { IsIn, IsOptional, IsBoolean } from 'class-validator'
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
