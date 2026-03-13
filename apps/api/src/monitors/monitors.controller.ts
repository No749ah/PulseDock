import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { MonitorsService } from './monitors.service';
import { CreateMonitorDto, DiscoverVersionDto, ImportMonitorsDto, RunMonitorDto, TestVersionConnectionDto, UpdateMonitorDto } from './monitors.dto';

@ApiTags('Monitors')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/monitors')
export class MonitorsController {
  constructor(private readonly monitorsService: MonitorsService) {}

  @Get()
  @ApiOperation({ summary: 'List monitors', description: 'Returns all monitors for the authenticated user.' })
  @ApiResponse({ status: 200, description: 'Monitor list returned.' })
  list(@Req() req: { user: { id: string } }) {
    return this.monitorsService.list(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create monitor', description: 'Create a new uptime or version monitor.' })
  @ApiResponse({ status: 201, description: 'Monitor created.' })
  create(
    @Req() req: { user: { id: string } },
    @Body() body: CreateMonitorDto,
  ) {
    return this.monitorsService.create(req.user.id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Monitor updated.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  update(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: UpdateMonitorDto) {
    return this.monitorsService.update(req.user.id, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Monitor deleted.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.monitorsService.remove(req.user.id, id);
  }

  @Post('run')
  @ApiOperation({ summary: 'Trigger manual check', description: 'Run a monitor check immediately without waiting for the schedule.' })
  @ApiResponse({ status: 200, description: 'Check triggered.' })
  runNow(@Req() req: { user: { id: string } }, @Body() body: RunMonitorDto) {
    return this.monitorsService.runNow(req.user.id, body.monitorId);
  }

  @Post('version-test')
  @ApiOperation({ summary: 'Test version source connection', description: 'Probe a version source (GitHub, Docker Hub, etc.) and return the latest version without saving.' })
  @ApiResponse({ status: 200, description: 'Test result returned.' })
  versionTest(@Body() body: TestVersionConnectionDto) {
    return this.monitorsService.testVersionConnection(body);
  }

  @Post('version-discover')
  @ApiOperation({ summary: 'Auto-discover current deployed version', description: 'Probe a running application to detect its deployed version via common endpoints.' })
  @ApiResponse({ status: 200, description: 'Discovery result returned.' })
  versionDiscover(@Body() body: DiscoverVersionDto) {
    return this.monitorsService.discoverCurrentVersion(body);
  }

  @Get('runs')
  @ApiOperation({ summary: 'Recent check runs', description: 'Returns recent check results across all monitors for the authenticated user.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results (default: 10)' })
  @ApiResponse({ status: 200, description: 'Recent runs returned.' })
  getRecentRuns(
    @Req() req: { user: { id: string } },
    @Query('limit') limit?: string,
  ) {
    return this.monitorsService.getRecentRuns(req.user.id, Number(limit) || 10);
  }

  @Get(':id/runs')
  @ApiOperation({ summary: 'Check run history for a monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Run history returned.' })
  monitorRuns(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.monitorsService.monitorRuns(req.user.id, id);
  }

  @Get('version-summary')
  @ApiOperation({ summary: 'Version check summary', description: 'Returns aggregate stats and per-monitor version status (green/yellow/red).' })
  @ApiResponse({ status: 200, description: 'Version summary returned.' })
  versionSummary(@Req() req: { user: { id: string } }) {
    return this.monitorsService.versionSummary(req.user.id);
  }

  @Get('export')
  @ApiOperation({
    summary: 'Export monitors',
    description: 'Returns all monitors as a portable JSON document (no IDs or timestamps). Suitable for backup and re-import.',
  })
  @ApiResponse({ status: 200, description: 'Export document returned.' })
  exportMonitors(@Req() req: { user: { id: string } }) {
    return this.monitorsService.exportMonitors(req.user.id);
  }

  @Post('import')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Import monitors',
    description: 'Bulk-creates monitors from a previously exported document. Existing monitors are not modified.',
  })
  @ApiResponse({ status: 200, description: 'Import result returned.' })
  importMonitors(@Req() req: { user: { id: string } }, @Body() body: ImportMonitorsDto) {
    return this.monitorsService.importMonitors(req.user.id, body.monitors);
  }

  @Get(':id/alerts')
  @ApiOperation({ summary: 'List alert channels assigned to a monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Assigned alert channels returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  listAlerts(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.monitorsService.listMonitorAlerts(req.user.id, id);
  }

  @Post(':id/alerts/:channelId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Assign an alert channel to a monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiParam({ name: 'channelId', description: 'Alert channel ID' })
  @ApiResponse({ status: 200, description: 'Alert channel assigned.' })
  @ApiResponse({ status: 404, description: 'Monitor or channel not found.' })
  addAlert(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('channelId') channelId: string,
  ) {
    return this.monitorsService.addMonitorAlert(req.user.id, id, channelId);
  }

  @Delete(':id/alerts/:channelId')
  @ApiOperation({ summary: 'Unassign an alert channel from a monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiParam({ name: 'channelId', description: 'Alert channel ID' })
  @ApiResponse({ status: 200, description: 'Alert channel unassigned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  removeAlert(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('channelId') channelId: string,
  ) {
    return this.monitorsService.removeMonitorAlert(req.user.id, id, channelId);
  }
}
