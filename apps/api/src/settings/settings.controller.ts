import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../common/auth.guard'
import { SettingsService } from './settings.service'
import { UpdateRetentionDto } from './settings.dto'

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('retention')
  @ApiOperation({ summary: 'Get data retention settings' })
  getRetention(@Req() req: { user: { id: string } }) {
    return this.settingsService.getRetention(req.user.id)
  }

  @Put('retention')
  @ApiOperation({ summary: 'Update data retention settings' })
  updateRetention(@Req() req: { user: { id: string } }, @Body() dto: UpdateRetentionDto) {
    return this.settingsService.updateRetention(req.user.id, dto)
  }
}
