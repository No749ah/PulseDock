import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Logger } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';

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

  @Post('template-report')
  @HttpCode(200)
  @ApiOperation({ summary: 'Report a wrong/broken tool template' })
  @ApiResponse({ status: 200, description: 'Feedback received.' })
  reportTemplate(
    @Req() req: { user: { id: string; email?: string } },
    @Body() dto: TemplateReportDto,
  ) {
    this.logger.warn('Template feedback', {
      toolId: dto.toolId,
      endpoint: dto.endpoint,
      statusCode: dto.statusCode,
      error: dto.error,
      note: dto.note,
      userId: req.user.id,
    });
    return { received: true };
  }
}
