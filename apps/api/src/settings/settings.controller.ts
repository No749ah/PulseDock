import { Body, Controller, Get, Put, Post, Req, UseGuards, Res, HttpCode } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { AuthGuard } from '../common/auth.guard'
import { SettingsService } from './settings.service'
import { BackupService, BackupDocument } from './backup.service'
import { UpdateRetentionDto } from './settings.dto'

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly backupService: BackupService,
  ) {}

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

  @Get('backup')
  @ApiOperation({ summary: 'Export full account backup as JSON', description: 'Downloads all monitors, folders, tags, alert channels, status pages, and settings as a portable JSON document.' })
  @ApiResponse({ status: 200, description: 'Backup document returned as downloadable JSON file.' })
  async exportBackup(
    @Req() req: { user: { id: string } },
    @Res() res: Response,
  ) {
    const doc = await this.backupService.exportBackup(req.user.id)
    const filename = `pulsedock-backup-${new Date().toISOString().slice(0, 10)}.json`
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(JSON.stringify(doc, null, 2))
  }

  @Post('backup/restore')
  @HttpCode(200)
  @ApiOperation({ summary: 'Restore from backup', description: 'Imports monitors, folders, tags, alert channels, and status pages from a previously exported backup document. Existing items are skipped (no duplicates). Status pages are always restored as unpublished.' })
  @ApiResponse({ status: 200, description: 'Restore summary returned.' })
  async restoreBackup(
    @Req() req: { user: { id: string } },
    @Body() doc: BackupDocument,
  ) {
    return this.backupService.restoreBackup(req.user.id, doc)
  }
}
