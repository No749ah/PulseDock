import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { NotificationsService } from './notifications.service';
import { NotificationPreferenceResponseDto, UpdateNotificationPreferenceDto } from './notifications.dto';

interface AuthRequest {
  user: { id: string };
}

@ApiTags('Notification Preferences')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/notification-preferences')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get notification preferences',
    description:
      'Returns the current user\'s notification preferences. ' +
      'A default record is created on first access.',
  })
  @ApiResponse({ status: 200, description: 'Notification preferences', type: NotificationPreferenceResponseDto })
  getPreference(@Req() req: AuthRequest) {
    return this.notificationsService.getPreference(req.user.id);
  }

  @Patch()
  @ApiOperation({
    summary: 'Update notification preferences',
    description:
      'Partially updates notification preferences. ' +
      'Only the fields included in the request body are changed.',
  })
  @ApiResponse({ status: 200, description: 'Updated notification preferences', type: NotificationPreferenceResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  updatePreference(@Req() req: AuthRequest, @Body() dto: UpdateNotificationPreferenceDto) {
    return this.notificationsService.updatePreference(req.user.id, dto);
  }

  @Get('digest-queue')
  @ApiOperation({
    summary: 'Get digest queue (pending + recently sent)',
    description:
      'Returns pending (unsent) and recently sent digest notifications for the current user. ' +
      'Only relevant when frequency is set to hourly_digest, daily_digest, or weekly_digest.',
  })
  @ApiResponse({ status: 200, description: 'Digest queue with pending and sent items' })
  async getDigestQueue(@Req() req: AuthRequest) {
    return this.notificationsService.getDigestQueue(req.user.id);
  }

  @Post('digest-queue/test')
  @ApiOperation({
    summary: 'Trigger digest delivery immediately (test/debug)',
    description: 'Manually triggers digest processing for the current user. Useful for testing digest delivery.',
  })
  @ApiResponse({ status: 200, description: 'Digest triggered' })
  async triggerDigest(@Req() req: AuthRequest) {
    const pref = await this.notificationsService.getPreference(req.user.id);
    if (pref.frequency === 'hourly_digest') {
      await this.notificationsService.sendHourlyDigests();
    } else if (pref.frequency === 'daily_digest') {
      await this.notificationsService.sendDailyDigests();
    } else if (pref.frequency === 'weekly_digest') {
      await this.notificationsService.sendWeeklyDigests();
    }
    return { triggered: true, frequency: pref.frequency };
  }
}
