import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Logger } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { PrismaService } from '../common/prisma.service';

export class TemplateReportDto {
  @IsString()
  toolId!: string;

  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsOptional()
  @IsNumber()
  statusCode?: number;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

@ApiTags('Feedback')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/feedback')
export class FeedbackController {
  private readonly logger = new Logger(FeedbackController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Report a broken or incorrect tool registry template.
   * @param req - Authenticated request
   * @param dto - Feedback payload
   * @returns Confirmation
   */
  @Post('template-report')
  @HttpCode(200)
  @ApiOperation({ summary: 'Report a wrong/broken tool template' })
  @ApiResponse({ status: 200, description: 'Feedback received.' })
  async reportTemplate(
    @Req() req: { user: { id: string; email?: string } },
    @Body() dto: TemplateReportDto,
  ) {
    this.logger.warn('Template feedback received', {
      toolId: dto.toolId,
      endpoint: dto.endpoint,
      statusCode: dto.statusCode,
      error: dto.error,
      note: dto.note,
      userId: req.user.id,
    });

    await this.prisma.toolTemplateFeedback.create({
      data: {
        userId: req.user.id,
        toolId: dto.toolId,
        endpoint: dto.endpoint,
        statusCode: dto.statusCode,
        error: dto.error ? dto.error.substring(0, 1000) : undefined,
        note: dto.note ? dto.note.substring(0, 2000) : undefined,
      },
    });

    return { received: true };
  }

  /**
   * Get template feedback reports (admin view).
   * @returns List of feedback reports
   */
  @Get('template-reports')
  @ApiOperation({ summary: 'List all template feedback reports' })
  @ApiResponse({ status: 200, description: 'Reports returned.' })
  async listReports(@Req() req: { user: { id: string; role?: string } }) {
    const reports = await this.prisma.toolTemplateFeedback.findMany({
      where: req.user.role === 'admin' ? {} : { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        toolId: true,
        endpoint: true,
        statusCode: true,
        error: true,
        note: true,
        createdAt: true,
        userId: true,
      },
    });
    return { total: reports.length, reports };
  }
}
