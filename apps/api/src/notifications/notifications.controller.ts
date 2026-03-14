import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { NotificationsService } from './notifications.service';
import { NotificationPreferenceResponseDto, UpdateNotificationPreferenceDto } from './notifications.dto';

interface AuthRequest {
  user: { sub: string };
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
    return this.notificationsService.getPreference(req.user.sub);
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
    return this.notificationsService.updatePreference(req.user.sub, dto);
  }
}
