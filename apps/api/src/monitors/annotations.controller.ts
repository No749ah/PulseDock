import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../common/prisma.service';

const ALLOWED_COLORS = ['blue', 'green', 'yellow', 'red', 'purple', 'gray'] as const;

class CreateAnnotationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  text!: string;

  @IsOptional()
  @IsIn(ALLOWED_COLORS)
  color?: string;

  @IsISO8601()
  annotatedAt!: string;
}

class UpdateAnnotationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  text?: string;

  @IsOptional()
  @IsIn(ALLOWED_COLORS)
  color?: string;

  @IsOptional()
  @IsISO8601()
  annotatedAt?: string;
}

@ApiTags('monitor-annotations')
@Controller('v1/monitors/:id/annotations')
@UseGuards(JwtAuthGuard)
export class AnnotationsController {
  constructor(private readonly prisma: PrismaService) {}

  /** List all annotations for a monitor */
  @Get()
  @ApiOperation({ summary: 'List annotations for a monitor', description: 'Returns all user-defined timeline annotations for the given monitor, ordered by time.' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Annotation list' })
  @ApiResponse({ status: 404, description: 'Monitor not found' })
  async list(@Req() req: { user: { userId: string } }, @Param('id') monitorId: string) {
    // Verify ownership
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId: req.user.userId },
      select: { id: true },
    });
    if (!monitor) return { error: 'Monitor not found', statusCode: 404 };

    const annotations = await this.prisma.monitorAnnotation.findMany({
      where: { monitorId, userId: req.user.userId },
      orderBy: { annotatedAt: 'desc' },
    });
    return { annotations };
  }

  /** Create a new annotation */
  @Post()
  @ApiOperation({ summary: 'Create annotation', description: 'Add a timeline annotation (e.g. "Deployed v2.1") at a specific point in time on the monitor chart.' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 201, description: 'Annotation created' })
  @ApiResponse({ status: 404, description: 'Monitor not found' })
  async create(
    @Req() req: { user: { userId: string } },
    @Param('id') monitorId: string,
    @Body() dto: CreateAnnotationDto,
  ) {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId: req.user.userId },
      select: { id: true },
    });
    if (!monitor) return { error: 'Monitor not found', statusCode: 404 };

    const annotation = await this.prisma.monitorAnnotation.create({
      data: {
        monitorId,
        userId: req.user.userId,
        text: dto.text,
        color: dto.color ?? 'blue',
        annotatedAt: new Date(dto.annotatedAt),
      },
    });
    return { annotation };
  }

  /** Update an annotation */
  @Patch(':annotationId')
  @ApiOperation({ summary: 'Update annotation' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiParam({ name: 'annotationId', description: 'Annotation ID' })
  @ApiResponse({ status: 200, description: 'Annotation updated' })
  @ApiResponse({ status: 404, description: 'Annotation not found' })
  async update(
    @Req() req: { user: { userId: string } },
    @Param('id') monitorId: string,
    @Param('annotationId') annotationId: string,
    @Body() dto: UpdateAnnotationDto,
  ) {
    const existing = await this.prisma.monitorAnnotation.findFirst({
      where: { id: annotationId, monitorId, userId: req.user.userId },
    });
    if (!existing) return { error: 'Annotation not found', statusCode: 404 };

    const annotation = await this.prisma.monitorAnnotation.update({
      where: { id: annotationId },
      data: {
        ...(dto.text !== undefined && { text: dto.text }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.annotatedAt !== undefined && { annotatedAt: new Date(dto.annotatedAt) }),
      },
    });
    return { annotation };
  }

  /** Delete an annotation */
  @Delete(':annotationId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete annotation' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiParam({ name: 'annotationId', description: 'Annotation ID' })
  @ApiResponse({ status: 204, description: 'Annotation deleted' })
  @ApiResponse({ status: 404, description: 'Annotation not found' })
  async remove(
    @Req() req: { user: { userId: string } },
    @Param('id') monitorId: string,
    @Param('annotationId') annotationId: string,
  ) {
    const existing = await this.prisma.monitorAnnotation.findFirst({
      where: { id: annotationId, monitorId, userId: req.user.userId },
    });
    if (!existing) return;

    await this.prisma.monitorAnnotation.delete({ where: { id: annotationId } });
  }
}
