import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards, DefaultValuePipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../common/auth.guard';
import { RequireScope } from '../common/require-scope.decorator';
import { ScopeGuard } from '../common/scope.guard';
import { ApiKeyScope } from '../apikeys/apikeys.dto';
import { MonitorsService } from './monitors.service';
import { BulkActionDto, CreateMonitorDto, DiscoverVersionDto, ImportExternalDto, ImportMonitorsDto, RunMonitorDto, TestVersionConnectionDto, UpdateMonitorDto } from './monitors.dto';

@ApiTags('Monitors')
@ApiBearerAuth()
@UseGuards(AuthGuard, ScopeGuard)
@Controller('v1/monitors')
export class MonitorsController {
  constructor(private readonly monitorsService: MonitorsService) {}

  @Get()
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'List monitors', description: 'Returns all monitors for the authenticated user.' })
  @ApiQuery({ name: 'tag', required: false, description: 'Filter monitors by tag name.' })
  @ApiResponse({ status: 200, description: 'Monitor list returned.' })
  list(@Req() req: { user: { id: string } }, @Query('tag') tag?: string) {
    return this.monitorsService.list(req.user.id, tag);
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @RequireScope(ApiKeyScope.WRITE)
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
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @RequireScope(ApiKeyScope.WRITE)
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

  @Post('bulk')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Bulk action on monitors', description: 'Apply enable, disable, delete, or run-now to multiple monitors at once.' })
  @ApiResponse({ status: 200, description: 'Bulk action applied.' })
  bulk(@Req() req: { user: { id: string } }, @Body() body: BulkActionDto) {
    return this.monitorsService.bulkAction(req.user.id, body.ids, body.action, body.tagId);
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

  @Get('plugins')
  @ApiOperation({ summary: 'List monitor plugins', description: 'Returns available monitor check plugins and their config field metadata.' })
  @ApiResponse({ status: 200, description: 'Plugin metadata returned.' })
  listPlugins() {
    return this.monitorsService.listPlugins();
  }

  @Get('runs')
  @ApiOperation({ summary: 'Recent check runs', description: 'Returns recent check results across all monitors for the authenticated user.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results (default: 10)' })
  @ApiQuery({ name: 'since', required: false, description: 'ISO-8601 timestamp — only return runs after this time' })
  @ApiResponse({ status: 200, description: 'Recent runs returned.' })
  getRecentRuns(
    @Req() req: { user: { id: string } },
    @Query('limit') limit?: string,
    @Query('since') since?: string,
  ) {
    const sinceDate = since ? new Date(since) : undefined;
    return this.monitorsService.getRecentRuns(req.user.id, Number(limit) || 10, sinceDate);
  }

  @Get(':id/runs')
  @ApiOperation({ summary: 'Check run history for a monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Run history returned.' })
  monitorRuns(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.monitorsService.monitorRuns(req.user.id, id);
  }

  @Get(':id/uptime')
  @ApiOperation({ summary: 'Uptime & SLA stats for a monitor', description: 'Returns time-window uptime %, incident count, MTTR, MTBF, and downtime for a configurable period.' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'period', required: false, enum: ['1d', '7d', '30d', '90d'], description: 'Time window (default: 30d)' })
  @ApiResponse({ status: 200, description: 'Uptime stats returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  monitorUptime(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('period', new DefaultValuePipe('30d')) period: string,
  ) {
    const validPeriods = ['1d', '7d', '30d', '90d'] as const;
    const safePeriod = validPeriods.includes(period as '1d' | '7d' | '30d' | '90d') ? (period as '1d' | '7d' | '30d' | '90d') : '30d';
    return this.monitorsService.monitorUptime(req.user.id, id, safePeriod);
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

  @Post('import-external')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Import from external service',
    description: 'Parse and import monitors from an Uptime Robot JSON export, BetterUptime JSON export, or a generic CSV file. Duplicate targets (same URL already monitored) are automatically skipped.',
  })
  @ApiResponse({ status: 200, description: 'Import result with count of imported, skipped, and errors.' })
  importExternal(@Req() req: { user: { id: string } }, @Body() body: ImportExternalDto) {
    return this.monitorsService.importExternal(req.user.id, body.source, body.payload);
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
    @Body() body: { notifyOn?: string },
  ) {
    return this.monitorsService.addMonitorAlert(req.user.id, id, channelId, body?.notifyOn);
  }

  @Patch(':id/alerts/:channelId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update notifyOn setting for an assigned alert channel' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiParam({ name: 'channelId', description: 'Alert channel ID' })
  @ApiResponse({ status: 200, description: 'notifyOn updated.' })
  updateAlert(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('channelId') channelId: string,
    @Body() body: { notifyOn: string },
  ) {
    return this.monitorsService.updateMonitorAlertNotifyOn(req.user.id, id, channelId, body.notifyOn);
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

  // ── Dependencies ──────────────────────────────────────────────────────────

  @Get(':id/dependencies')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'List dependencies for a monitor',
    description:
      'Returns all monitors that this monitor depends on. When a dependency is down, alerts on this monitor are suppressed.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Dependencies returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  listDependencies(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.monitorsService.listDependencies(req.user.id, id);
  }

  @Post(':id/dependencies/:dependsOnId')
  @HttpCode(200)
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({
    summary: 'Add a dependency to a monitor',
    description:
      'Mark another monitor as a dependency. Alerts on this monitor are suppressed while the dependency is down.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiParam({ name: 'dependsOnId', description: 'ID of the monitor this one depends on' })
  @ApiResponse({ status: 200, description: 'Dependency added.' })
  @ApiResponse({ status: 400, description: 'Self-dependency or circular dependency.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  addDependency(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('dependsOnId') dependsOnId: string,
  ) {
    return this.monitorsService.addDependency(req.user.id, id, dependsOnId);
  }

  @Delete(':id/dependencies/:dependsOnId')
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Remove a dependency from a monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiParam({ name: 'dependsOnId', description: 'ID of the dependency to remove' })
  @ApiResponse({ status: 200, description: 'Dependency removed.' })
  @ApiResponse({ status: 404, description: 'Dependency not found.' })
  removeDependency(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('dependsOnId') dependsOnId: string,
  ) {
    return this.monitorsService.removeDependency(req.user.id, id, dependsOnId);
  }
}
