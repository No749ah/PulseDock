import { Controller, Post, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DemoService } from './demo.service';

@ApiTags('Demo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  /**
   * Seeds the authenticated user's account with demo monitors, an alert channel,
   * and a sample status page. Idempotent — returns `alreadySeeded: true` if the
   * user already has sufficient data.
   *
   * @returns Object with created resource IDs and `alreadySeeded` flag
   */
  @Post('seed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Seed demo data', description: 'Populates the account with sample monitors, alert channel, and status page for onboarding.' })
  @ApiResponse({ status: 200, description: 'Demo data created (or skipped if already seeded)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async seed(@Req() req: { user: { id: string } }) {
    return this.demoService.seed(req.user.id);
  }
}
