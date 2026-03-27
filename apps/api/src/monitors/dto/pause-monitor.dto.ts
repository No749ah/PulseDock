import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for the "pause monitor" endpoint.
 * Pauses all checks on a monitor for the specified duration.
 * Unlike muting (which only suppresses alerts), pausing stops checks entirely.
 */
export class PauseMonitorDto {
  @ApiProperty({
    description: 'Number of minutes to pause checks. After this duration, checks resume automatically.',
    minimum: 1,
    maximum: 10080,
    example: 60,
  })
  @IsInt()
  @Min(1)
  @Max(10080) // 7 days max
  minutes!: number;
}
