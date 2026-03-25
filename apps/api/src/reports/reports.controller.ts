import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { ReportsService } from './reports.service';
import { ScheduledReportResponseDto, UpsertReportDto } from './reports.dto';

interface AuthRequest {
  user: { id: string };
}

@ApiTags('Scheduled Reports')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'Get scheduled report config', description: 'Returns the current user\'s scheduled report configuration, or 204 if not configured.' })
  @ApiResponse({ status: 200, description: 'Report config', type: ScheduledReportResponseDto })
  @ApiResponse({ status: 204, description: 'No report config found' })
  async getReport(@Req() req: AuthRequest) {
    const report = await this.reportsService.getReport(req.user.id);
    if (!report) return null;
    return report;
  }

  @Put()
  @ApiOperation({ summary: 'Create or update scheduled report config', description: 'Upserts the scheduled report configuration for the current user.' })
  @ApiResponse({ status: 200, description: 'Created/updated report config', type: ScheduledReportResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  upsertReport(@Req() req: AuthRequest, @Body() dto: UpsertReportDto) {
    return this.reportsService.upsertReport(req.user.id, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete scheduled report config', description: 'Removes the scheduled report configuration. No more reports will be sent.' })
  @ApiResponse({ status: 204, description: 'Report config deleted' })
  async deleteReport(@Req() req: AuthRequest) {
    await this.reportsService.deleteReport(req.user.id);
  }

  @Post('send-now')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Send test report now', description: 'Immediately sends a test uptime report (last 7 days) to the current user\'s email.' })
  @ApiResponse({ status: 204, description: 'Report sent' })
  async sendNow(@Req() req: AuthRequest) {
    await this.reportsService.sendNow(req.user.id);
  }
}
