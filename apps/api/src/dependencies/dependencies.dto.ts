import { IsString, IsArray, ArrayMaxSize, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddDependencyDto {
  @ApiProperty({ description: 'ID of the monitor that has the dependency' })
  @IsString()
  monitorId!: string;

  @ApiProperty({ description: 'ID of the monitor being depended on' })
  @IsString()
  dependsOnId!: string;
}

export class SetDependenciesDto {
  @ApiProperty({ description: 'IDs of monitors this monitor depends on' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  dependsOnIds!: string[];
}

export class ImpactAnalysisDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  monitorId?: string;
}
