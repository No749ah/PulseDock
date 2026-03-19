import { IsIn } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class UpdateRetentionDto {
  @ApiProperty({ enum: [7, 30, 90, 365], example: 90 })
  @IsIn([7, 30, 90, 365])
  retentionDays!: 7 | 30 | 90 | 365
}
