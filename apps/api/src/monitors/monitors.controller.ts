import * as tls from 'tls';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Patch, Post, Query, Req, Res, UseGuards, DefaultValuePipe } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../common/auth.guard';
import { RequireScope } from '../common/require-scope.decorator';
import { ScopeGuard } from '../common/scope.guard';
import { ApiKeyScope } from '../apikeys/apikeys.dto';
import { MonitorsService } from './monitors.service';
import { PlanService } from '../settings/plan.service';
import { PrismaService } from '../common/prisma.service';
import { BulkActionDto, BulkCreateFromUrlsDto, BulkEditDto, CreateMonitorDto, CreateMonitorEventDto, DiscoverVersionDto, ImportExternalDto, ImportFromComposeDto, ImportMonitorsDto, RunMonitorDto, SimulateAlertsDto, TestVersionConnectionDto, UpdateMonitorDto } from './monitors.dto';
import { MuteMonitorDto } from './dto/mute-monitor.dto';
import { PauseMonitorDto } from './dto/pause-monitor.dto';
import { AcknowledgeMonitorDto } from './dto/acknowledge-monitor.dto';
import { OpenApiImportDto, OpenApiPreviewDto } from './import-openapi.dto';
import { PlaygroundDto } from './playground.dto';

@ApiTags('Monitors')
@ApiBearerAuth()
@UseGuards(AuthGuard, ScopeGuard)
@Controller('v1/monitors')
export class MonitorsController {
  constructor(
    private readonly monitorsService: MonitorsService,
    private readonly planService: PlanService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'List monitors', description: 'Returns all monitors for the authenticated user.' })
  @ApiQuery({ name: 'tag', required: false, description: 'Filter monitors by tag name.' })
  @ApiResponse({ status: 200, description: 'Monitor list returned.' })
  list(@Req() req: { user: { id: string } }, @Query('tag') tag?: string) {
    return this.monitorsService.list(req.user.id, tag);
  }

  @Get(':id')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Get a single monitor', description: 'Returns full monitor details including mute status and active acknowledgement.' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Monitor returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async getOne(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.monitorsService.getOne(req.user.id, id);
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Create monitor', description: 'Create a new uptime or version monitor.' })
  @ApiResponse({ status: 201, description: 'Monitor created.' })
  @ApiResponse({ status: 403, description: 'Plan monitor limit reached.' })
  async create(
    @Req() req: { user: { id: string } },
    @Body() body: CreateMonitorDto,
  ) {
    const check = await this.planService.checkLimit(req.user.id, 'monitors');
    if (!check.allowed) {
      throw new ForbiddenException({
        message: `Plan limit reached: upgrade to PRO for more monitors`,
        code: 'PLAN_LIMIT',
        resource: 'monitors',
        current: check.current,
        limit: check.limit,
        plan: check.plan,
      });
    }
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

  @Post(':id/clone')
  @HttpCode(201)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Clone a monitor', description: 'Duplicate an existing monitor, including its config, alert channel assignments, and tags. The clone is created as disabled with "Copy of <name>".' })
  @ApiParam({ name: 'id', description: 'Monitor ID to clone' })
  @ApiResponse({ status: 201, description: 'Cloned monitor returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  @ApiResponse({ status: 403, description: 'Plan monitor limit reached.' })
  async clone(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const check = await this.planService.checkLimit(req.user.id, 'monitors');
    if (!check.allowed) {
      throw new ForbiddenException({ message: 'Plan limit reached', code: 'PLAN_LIMIT', resource: 'monitors' });
    }
    return this.monitorsService.clone(req.user.id, id);
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

  @Post('playground')
  @HttpCode(200)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Playground check', description: 'Run a one-off HTTP check against any URL and see the full result (status, headers, latency, body, SSL info, timing breakdown) without creating a monitor.' })
  @ApiResponse({ status: 200, description: 'Playground result returned.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded.' })
  runPlayground(@Req() req: { user: { id: string } }, @Body() body: PlaygroundDto) {
    return this.monitorsService.runPlayground(body, req.user.id);
  }

  @Post(':id/snooze')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Snooze monitor alerts', description: 'Create a maintenance window to suppress alerts for this monitor for a specified number of hours (1, 4, 8, 24, or 168).' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Snooze applied.' })
  snooze(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: { hours: number }) {
    return this.monitorsService.snooze(req.user.id, id, body.hours ?? 1);
  }

  @Post('bulk')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Bulk action on monitors', description: 'Apply enable, disable, delete, or run-now to multiple monitors at once.' })
  @ApiResponse({ status: 200, description: 'Bulk action applied.' })
  bulk(@Req() req: { user: { id: string } }, @Body() body: BulkActionDto) {
    return this.monitorsService.bulkAction(req.user.id, body.ids, body.action, body.tagId, body.value);
  }

  @Patch('bulk-edit')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({
    summary: 'Bulk edit monitors',
    description: 'Update one or more fields across multiple monitors at once. Only provided fields are updated — omit a field to leave it unchanged.',
  })
  @ApiResponse({ status: 200, description: 'Bulk edit applied. Returns count of affected monitors and any per-monitor errors.' })
  bulkEdit(@Req() req: { user: { id: string } }, @Body() body: BulkEditDto) {
    return this.monitorsService.bulkEdit(req.user.id, body);
  }

  @Post('compare')
  @HttpCode(200)
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Compare multiple monitors side by side' })
  @ApiResponse({ status: 200, description: 'Comparison data returned.' })
  async compare(
    @Req() req: { user: { id: string } },
    @Body() body: { monitorIds: string[]; period?: string },
  ) {
    const { monitorIds, period = '30d' } = body;
    if (!Array.isArray(monitorIds) || monitorIds.length < 2 || monitorIds.length > 5) {
      throw new BadRequestException('Provide 2–5 monitor IDs');
    }

    const results = await Promise.all(
      monitorIds.map(async (id) => {
        const monitor = await this.prisma.monitor.findFirst({
          where: { id, userId: req.user.id },
          select: { id: true, name: true, type: true, target: true, enabled: true },
        });
        if (!monitor) return null;

        const lastRun = await this.prisma.monitorRun.findFirst({
          where: { monitorId: id, userId: req.user.id },
          orderBy: { checkedAt: 'desc' },
          select: { level: true },
        });

        const validPeriods = ['1d', '7d', '30d', '90d'];
        const safePeriod = validPeriods.includes(period) ? (period as '1d' | '7d' | '30d' | '90d') : '30d';
        const uptime = await this.monitorsService.monitorUptime(req.user.id, id, safePeriod);

        return {
          id: monitor.id,
          name: monitor.name,
          type: monitor.type,
          target: monitor.target,
          level: lastRun?.level ?? 'green',
          enabled: monitor.enabled,
          uptimePct: uptime.uptimePct,
          avgLatencyMs: uptime.avgLatencyMs,
          incidents: uptime.incidents,
          totalDowntimeSec: uptime.totalDowntimeSec,
          mttrSec: uptime.mttrSec,
          totalChecks: uptime.totalChecks,
        };
      }),
    );

    return { monitors: results.filter(Boolean), period };
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

  @Get(':id/health-score')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Get monitor health score (0-100)',
    description: 'Returns a composite health score (0–100) and letter grade (A–F) for a monitor, based on uptime, latency trend, SLA compliance, and incident-free streak.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({
    status: 200,
    description: 'Health score returned.',
    schema: {
      example: {
        score: 87,
        grade: 'A',
        breakdown: { uptime: 40, latency: 18, sla: 20, streak: 9 },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  healthScore(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.monitorsService.getHealthScore(req.user.id, id);
  }

  @Get(':id/check-rate')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Get effective check rate for a monitor',
    description: 'Returns throttleMs, maxChecksPerHour, checks in the last hour, effective checks/hour, and whether the monitor is currently rate-limited.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({
    status: 200,
    description: 'Check rate information returned.',
    schema: {
      example: {
        intervalSec: 60,
        throttleMs: 5000,
        maxChecksPerHour: 30,
        checksLastHour: 12,
        effectiveChecksPerHour: 30,
        isThrottled: false,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  checkRate(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.monitorsService.checkRate(req.user.id, id);
  }

  @Get(':id/metric-history')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Get custom metric capture history',
    description: 'Returns time-series of numeric values captured from HTTP response body via the monitor metricPath JSONPath. Only populated when metricPath is configured.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max data points (default 200)' })
  @ApiQuery({ name: 'periodDays', required: false, description: 'Rolling window in days (default 30)' })
  @ApiResponse({ status: 200, description: 'Metric history returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  metricHistory(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('periodDays') periodDays?: string,
  ) {
    return this.monitorsService.metricHistory(req.user.id, id, {
      limit: limit ? Math.min(500, Math.max(1, parseInt(limit, 10))) : undefined,
      periodDays: periodDays ? Math.min(365, Math.max(1, parseInt(periodDays, 10))) : undefined,
    });
  }

  @Get(':id/runs')
  @ApiOperation({
    summary: 'Check run history for a monitor',
    description: 'Returns paginated check run history. Supports status filter (all/ok/failed) and cursor-based pagination via `before` (checkedAt ISO timestamp of oldest run on current page).',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max runs to return (1-500, default 100)' })
  @ApiQuery({ name: 'before', required: false, description: 'Cursor: return runs older than this checkedAt ISO timestamp' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter: all | ok | failed | degraded (default: all)' })
  @ApiResponse({ status: 200, description: 'Run history returned.' })
  monitorRuns(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('status') status?: string,
  ) {
    return this.monitorsService.monitorRuns(req.user.id, id, { limit, before, status });
  }

  @Get(':id/runs/export')
  @ApiOperation({
    summary: 'Export check run history as CSV',
    description: 'Exports all check run history for a monitor as a CSV file (up to 10,000 most recent runs). Useful for audits, SLA reports, and offline analysis.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'CSV file download.' })
  async exportMonitorRuns(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { csv, filename } = await this.monitorsService.exportMonitorRuns(req.user.id, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(csv);
  }

  @Get(':id/runs/export-enhanced')
  @ApiOperation({
    summary: 'Enhanced export of check run history',
    description: 'Exports check run history for a monitor in CSV or JSON format. Supports optional HTTP timing columns and assertion failure details. Limit: 10,000 rows.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'format', required: false, enum: ['csv', 'json'], description: 'Output format (default: csv)' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days of history to export (default: 30)' })
  @ApiQuery({ name: 'includeTimings', required: false, description: 'Include HTTP timing breakdown columns (default: false)' })
  @ApiQuery({ name: 'includeAssertions', required: false, description: 'Include assertion failure details (default: false)' })
  @ApiResponse({ status: 200, description: 'File download (CSV or JSON).' })
  async exportMonitorRunsEnhanced(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('format') format: string = 'csv',
    @Query('days', new DefaultValuePipe(30)) days: number,
    @Query('includeTimings') includeTimingsRaw: string = 'false',
    @Query('includeAssertions') includeAssertionsRaw: string = 'false',
    @Res() res: Response,
  ) {
    const resolvedFormat = format === 'json' ? 'json' : 'csv';
    const includeTimings = includeTimingsRaw === 'true' || includeTimingsRaw === '1';
    const includeAssertions = includeAssertionsRaw === 'true' || includeAssertionsRaw === '1';
    const daysNum = Math.max(1, Math.min(365, Number(days) || 30));

    const { data, filename, totalCount } = await this.monitorsService.exportMonitorRunsEnhanced(req.user.id, id, {
      format: resolvedFormat,
      days: daysNum,
      includeTimings,
      includeAssertions,
    });

    const contentType = resolvedFormat === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Total-Count', String(totalCount));
    res.send(data);
  }

  @Get(':id/latency-budget')
  @ApiOperation({
    summary: 'Latency budget report',
    description: 'Returns a latency budget consumption report for the current calendar month. Tracks what % of checks exceeded the configured P95 latency budget.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Latency budget report returned.' })
  async getLatencyBudgetReport(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.monitorsService.getLatencyBudgetReport(req.user.id, id);
  }

  @Get(':id/error-budget')
  @ApiOperation({
    summary: 'SLO error budget',
    description: 'Returns error budget consumption, burn rates, and projected exhaustion for a monitor against a given SLA target.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'slaTarget', required: false, description: 'SLA target percentage (default: 99.9)' })
  @ApiQuery({ name: 'period', required: false, description: 'Period string, e.g. 30d (default: 30d)' })
  @ApiResponse({ status: 200, description: 'Error budget stats returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  errorBudget(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('slaTarget') slaTarget?: string,
    @Query('period') period?: string,
  ) {
    const target = parseFloat(slaTarget ?? '99.9');
    const safeSlaTarget = Number.isFinite(target) && target > 0 && target <= 100 ? target : 99.9;
    const safePeriod = /^\d+d$/.test(period ?? '') ? (period as string) : '30d';
    return this.monitorsService.getErrorBudget(id, req.user.id, { slaTarget: safeSlaTarget, period: safePeriod });
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

  @Get(':id/chart')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Chart data for a monitor',
    description: 'Returns time-bucketed latency and uptime data for charting. Granularity auto-scales: 1d=5min, 7d=1h, 30d=6h, 90d=1d buckets.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'period', required: false, enum: ['1d', '7d', '30d', '90d'], description: 'Time window (default: 7d)' })
  @ApiResponse({ status: 200, description: 'Chart buckets returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  monitorChart(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('period', new DefaultValuePipe('7d')) period: string,
  ) {
    const validPeriods = ['1d', '7d', '30d', '90d'] as const;
    const safePeriod = validPeriods.includes(period as '1d' | '7d' | '30d' | '90d') ? (period as '1d' | '7d' | '30d' | '90d') : '7d';
    return this.monitorsService.monitorChart(req.user.id, id, safePeriod);
  }

  @Get('version-summary')
  @ApiOperation({ summary: 'Version check summary', description: 'Returns aggregate stats and per-monitor version status (green/yellow/red).' })
  @ApiResponse({ status: 200, description: 'Version summary returned.' })
  versionSummary(@Req() req: { user: { id: string } }) {
    return this.monitorsService.versionSummary(req.user.id);
  }

  @Get('coverage')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Monitor configuration coverage analysis',
    description: 'Analyzes how well monitors are configured: alert channels, SLA targets, descriptions, runbook URLs, etc. Returns per-monitor gaps and aggregate score.',
  })
  @ApiResponse({ status: 200, description: 'Coverage analysis returned.' })
  monitorCoverage(@Req() req: { user: { id: string } }) {
    return this.monitorsService.monitorCoverage(req.user.id);
  }

  @Get('health-summary')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Health score summary for all monitors',
    description: 'Returns composite health scores (0–100) and grade (A–F) for all monitors, plus an overall aggregate.',
  })
  @ApiResponse({
    status: 200,
    description: 'Health summary returned.',
    schema: {
      example: {
        scores: [{ monitorId: 'abc', name: 'My API', score: 87, grade: 'A' }],
        overall: { avg: 82.3, a: 5, b: 3, c: 1, d: 0, f: 0 },
      },
    },
  })
  healthSummary(@Req() req: { user: { id: string } }) {
    return this.monitorsService.getHealthSummary(req.user.id);
  }

  @Get('health-scores')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Get health scores for all monitors (batch)' })
  @ApiResponse({ status: 200, description: 'Batch health scores returned.' })
  healthScores(@Req() req: { user: { id: string } }) {
    return this.monitorsService.allHealthScores(req.user.id);
  }

  @Get('latency-bench')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Latency benchmarks',
    description: 'Returns P50/P75/P95/P99 latency benchmarks for all HTTP and BROWSER monitors. Compares current 7-day period vs previous 7-day period.',
  })
  @ApiResponse({ status: 200, description: 'Latency benchmark data returned.' })
  latencyBench(@Req() req: { user: { id: string } }) {
    return this.monitorsService.latencyBenchmark(req.user.id);
  }

  @Get('health-scores/leaderboard')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Health score leaderboard',
    description: 'Returns enriched health scores for all monitors with grade, uptime%, incident count, SLA compliance, and improvement hints. Sorted best→worst. No-data monitors appear last.',
  })
  @ApiResponse({ status: 200, description: 'Leaderboard returned.' })
  healthScoreLeaderboard(@Req() req: { user: { id: string } }) {
    return this.monitorsService.healthScoreLeaderboard(req.user.id);
  }

  @Get('ssl-summary')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'SSL / TLS certificate inventory',
    description:
      'Returns an inventory of all SSL_CERT, HTTP, and BROWSER monitors with certificate expiry information. ' +
      'SSL_CERT monitors include parsed days-remaining from their latest check run. ' +
      'Sorted by urgency: expired first, then soonest expiry.',
  })
  @ApiResponse({
    status: 200,
    description: 'Certificate inventory returned.',
    schema: {
      example: {
        total: 5,
        expired: 0,
        critical: 1,
        warning: 2,
        healthy: 2,
        certs: [{ monitorId: 'abc', name: 'My Site', target: 'https://example.com', type: 'SSL_CERT', daysRemaining: 7, expiresAt: '2025-04-05', level: 'red' }],
      },
    },
  })
  sslSummary(@Req() req: { user: { id: string } }) {
    return this.monitorsService.getSslSummary(req.user.id);
  }

  // ─── Security Headers Fleet Summary ──────────────────────────────────────

  @Get('security-headers')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Security headers fleet summary',
    description:
      'Aggregates the latest security header audit results from all HTTP and BROWSER monitors. ' +
      'Returns grade distribution (A–F), per-header fleet coverage rates, and per-monitor rows ' +
      'sorted by score ascending (worst first) so you can quickly triage the most at-risk endpoints. ' +
      'Only monitors that have had at least one successful check with security header auditing enabled ' +
      'will have audit data; others are included with grade=null.',
  })
  @ApiResponse({ status: 200, description: 'Security headers fleet summary returned.' })
  securityHeadersSummary(@Req() req: { user: { id: string } }) {
    return this.monitorsService.getSecurityHeadersSummary(req.user.id);
  }

  @Get('latency-heatmap')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Fleet latency heatmap',
    description: 'Returns per-monitor x per-day average latency heatmap. HTTP/BROWSER monitors only. Grade A (<200ms) through F (>=2000ms).',
  })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Number of days (1-90, default 30)' })
  @ApiResponse({ status: 200, description: 'Latency heatmap returned.' })
  latencyHeatmap(
    @Req() req: { user: { id: string } },
    @Query('days') days?: string,
  ) {
    const d = parseInt(days ?? '30', 10);
    return this.monitorsService.latencyHeatmap(req.user.id, Number.isFinite(d) ? d : 30);
  }

  @Get('heatmap')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Uptime heatmap', description: 'Returns a per-monitor × per-day uptime heatmap for the last N days (1-90). Each cell contains uptimePct, total checks, and failed checks. Monitors ordered by pinned-first then creation date.' })
  @ApiQuery({ name: 'days', required: false, description: '1-90 (default 30)' })
  @ApiResponse({ status: 200, description: 'Heatmap data returned.' })
  uptimeHeatmap(
    @Req() req: { user: { id: string } },
    @Query('days') daysParam?: string,
  ) {
    const days = Math.min(90, Math.max(1, parseInt(daysParam ?? '30', 10) || 30));
    return this.monitorsService.uptimeHeatmap(req.user.id, days);
  }

  @Get('live-feed')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Real-time live check feed',
    description:
      'Returns recent check runs across all monitors for live ops console display. ' +
      'Supports incremental polling via `since` (ISO timestamp) to fetch only new runs. ' +
      'Returns run items plus live stats (checks/min, failure rate, avg latency). ' +
      'Use `level` to filter by green/yellow/red. Use `type` to filter by monitor type.',
  })
  @ApiQuery({ name: 'limit', required: false, description: 'Max runs to return (default 100, max 200)' })
  @ApiQuery({ name: 'since', required: false, description: 'ISO timestamp — only return runs after this time (for incremental polling)' })
  @ApiQuery({ name: 'level', required: false, description: 'Filter by level: green | yellow | red' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by monitor type (e.g. HTTP, TCP, SSL)' })
  @ApiResponse({ status: 200, description: 'Live feed items and stats returned.' })
  liveFeed(
    @Req() req: { user: { id: string } },
    @Query('limit') limitParam?: string,
    @Query('since') since?: string,
    @Query('level') level?: string,
    @Query('type') type?: string,
  ) {
    const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 100)) : 100;
    return this.monitorsService.liveFeed(req.user.id, { limit, since, level, type });
  }

  @Get('status-timeline')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Multi-monitor status timeline',
    description:
      'Returns a Gantt-style status timeline for all monitors. Each monitor has a list of segments ' +
      '(start, end, level) showing when it was green/yellow/red. Use hours param to control window size (1-168h, default 24h). ' +
      'Ideal for visualizing correlated outages across services.',
  })
  @ApiQuery({ name: 'hours', required: false, description: 'Window size in hours: 1–168 (default 24)' })
  @ApiResponse({ status: 200, description: 'Status timeline returned.' })
  statusTimeline(
    @Req() req: { user: { id: string } },
    @Query('hours') hoursParam?: string,
  ) {
    const hours = Math.min(168, Math.max(1, parseInt(hoursParam ?? '24', 10) || 24));
    return this.monitorsService.statusTimeline(req.user.id, hours);
  }

  @Get('check-schedule')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Fleet check schedule overview',
    description:
      'Returns a fleet-level scheduling overview: estimated checks-per-hour per monitor, ' +
      '24-bucket hourly load distribution (UTC), peak/quiet hours, total fleet check rate, ' +
      'and next-check estimate per monitor. Useful for identifying scheduling hotspots and optimizing intervals.',
  })
  @ApiResponse({ status: 200, description: 'Check schedule overview returned.' })
  checkSchedule(@Req() req: { user: { id: string } }) {
    return this.monitorsService.checkSchedule(req.user.id);
  }

  @Get('trends')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Monitor trend analysis', description: 'Returns week-over-week uptime and latency trends for all monitors. Compares current 7 days vs prior 7 days.' })
  @ApiResponse({ status: 200, description: 'Trend data returned.' })
  monitorTrends(@Req() req: { user: { id: string } }) {
    return this.monitorsService.monitorTrends(req.user.id);
  }

  @Get('dependency-graph')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Monitor dependency graph',
    description:
      'Returns a full dependency topology graph for all monitors. ' +
      'Nodes include live status, latency, and 7-day uptime. ' +
      'Edges represent alert-suppression dependencies (source depends on target). ' +
      'inDegree = blast radius (how many monitors would be suppressed if this one goes down). ' +
      'outDegree = how many dependencies this monitor has. ' +
      'Useful for rendering infrastructure topology maps and understanding failure blast radius.',
  })
  @ApiResponse({ status: 200, description: 'Dependency graph data returned.' })
  dependencyGraph(@Req() req: { user: { id: string } }) {
    return this.monitorsService.dependencyGraph(req.user.id);
  }

  @Get('export')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Export monitor configurations as JSON or YAML' })
  @ApiQuery({ name: 'format', required: false, description: 'json (default) or yaml' })
  @ApiQuery({ name: 'ids', required: false, description: 'Comma-separated monitor IDs to export (omit = all)' })
  @ApiQuery({ name: 'includeAlertChannels', required: false, description: 'Include alert channel names (default: false)' })
  async exportMonitorsConfig(
    @Req() req: { user: { id: string } },
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('ids') ids?: string,
    @Query('includeAlertChannels') includeAlertChannels?: string,
  ) {
    const result = await this.monitorsService.exportMonitorsConfig(req.user.id, {
      format: format === 'yaml' ? 'yaml' : 'json',
      ids: ids ? ids.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      includeAlertChannels: includeAlertChannels === 'true',
    });
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(result.content);
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

  @Post('import-config')
  @HttpCode(200)
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Import monitor configurations from JSON or YAML' })
  @ApiResponse({ status: 200, description: 'Import result returned.' })
  importMonitorsConfig(
    @Req() req: { user: { id: string } },
    @Body() body: { format: string; content: string; dryRun?: boolean; overwriteExisting?: boolean },
  ) {
    return this.monitorsService.importMonitorsConfig(req.user.id, {
      format: body.format === 'yaml' ? 'yaml' : 'json',
      content: body.content,
      dryRun: body.dryRun ?? false,
      overwriteExisting: body.overwriteExisting ?? false,
    });
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

  @Post('import-from-compose')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Parse a Docker Compose YAML and suggest monitors',
    description: 'Returns suggested monitors based on service images and port mappings. Does not create monitors.',
  })
  @ApiResponse({ status: 200, description: 'Suggested monitors array' })
  @ApiResponse({ status: 400, description: 'Invalid YAML' })
  importFromCompose(@Req() req: { user: { id: string } }, @Body() body: ImportFromComposeDto) {
    return this.monitorsService.importFromCompose(body.compose);
  }

  @Post('import-from-openapi/preview')
  @HttpCode(200)
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Preview monitors from OpenAPI/Swagger spec',
    description: 'Parses an OpenAPI 3.x or Swagger 2.x spec and returns monitor suggestions without creating them.',
  })
  @ApiResponse({ status: 200, description: 'Suggestions array returned.' })
  @ApiResponse({ status: 400, description: 'Invalid spec or URL fetch failed.' })
  importFromOpenApiPreview(@Req() req: { user: { id: string } }, @Body() body: OpenApiPreviewDto) {
    return this.monitorsService.previewFromOpenApi(body);
  }

  @Post('import-from-openapi')
  @HttpCode(200)
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({
    summary: 'Import monitors from OpenAPI/Swagger spec',
    description: 'Creates monitors for selected paths from an OpenAPI/Swagger spec.',
  })
  @ApiResponse({ status: 200, description: 'Created monitors returned.' })
  @ApiResponse({ status: 400, description: 'Invalid spec or URL fetch failed.' })
  importFromOpenApi(@Req() req: { user: { id: string } }, @Body() body: OpenApiImportDto) {
    return this.monitorsService.importFromOpenApi(req.user.id, body);
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
    @Body() body: { notifyOn?: string; repeatIntervalMin?: number },
  ) {
    return this.monitorsService.addMonitorAlert(req.user.id, id, channelId, body?.notifyOn, body?.repeatIntervalMin);
  }

  @Patch(':id/alerts/:channelId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update notifyOn setting for an assigned alert channel' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiParam({ name: 'channelId', description: 'Alert channel ID' })
  @ApiResponse({ status: 200, description: 'notifyOn updated.' })
  async updateAlert(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('channelId') channelId: string,
    @Body() body: { notifyOn?: string; escalationPolicyId?: string | null; repeatIntervalMin?: number | null },
  ) {
    if (body.notifyOn !== undefined) {
      await this.monitorsService.updateMonitorAlertNotifyOn(req.user.id, id, channelId, body.notifyOn);
    }
    if ('escalationPolicyId' in body) {
      await this.monitorsService.updateMonitorAlertEscalationPolicy(req.user.id, id, channelId, body.escalationPolicyId ?? null);
    }
    if ('repeatIntervalMin' in body) {
      await this.monitorsService.updateMonitorAlertRepeatInterval(req.user.id, id, channelId, body.repeatIntervalMin ?? null);
    }
    return { ok: true };
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

  // ─── Monitor Events (Timeline Annotations) ────────────────────────────────

  @Get(':id/events')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'List monitor timeline events',
    description: 'Returns timestamped annotations pinned to this monitor timeline (deploys, notes, maintenance, etc.). Newest first, max 100.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Events returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  listEvents(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.monitorsService.listEvents(req.user.id, id);
  }

  @Post(':id/events')
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({
    summary: 'Create a monitor timeline event',
    description: 'Pin a timestamped annotation to this monitor\'s timeline. Useful for marking deploys, config changes, or incidents.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 201, description: 'Event created.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  createEvent(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: CreateMonitorEventDto,
  ) {
    return this.monitorsService.createEvent(req.user.id, id, dto.message, dto.eventType ?? 'note');
  }

  @Delete(':id/events/:eventId')
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Delete a monitor timeline event' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiParam({ name: 'eventId', description: 'Event ID to delete' })
  @ApiResponse({ status: 200, description: 'Event deleted.' })
  @ApiResponse({ status: 404, description: 'Event not found.' })
  deleteEvent(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('eventId') eventId: string,
  ) {
    return this.monitorsService.deleteEvent(req.user.id, id, eventId);
  }

  // ─── Security Advisories ──────────────────────────────────────────────────

  @Get(':id/security')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Security advisories for a version monitor',
    description:
      'Queries OSV.dev for known security vulnerabilities affecting the currently tracked version. ' +
      'Supports npm, PyPI, Cargo, GitHub repos. Returns up to 10 most recent advisories.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Advisory list returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async securityAdvisories(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id, userId: req.user.id },
      select: { id: true, type: true, target: true, configJson: true },
    });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const config = (monitor.configJson as Record<string, unknown> | null) ?? {};
    const provider = String(config['provider'] ?? '').toLowerCase();
    const target = String(config['target'] ?? monitor.target ?? '').trim();

    // Determine OSV ecosystem + package name
    let ecosystem: string | null = null;
    let packageName: string | null = null;

    if (provider === 'npm') {
      ecosystem = 'npm';
      packageName = target;
    } else if (provider === 'pypi') {
      ecosystem = 'PyPI';
      packageName = target;
    } else if (provider === 'cargo') {
      ecosystem = 'crates.io';
      packageName = target;
    } else if (provider === 'github' && target.includes('/')) {
      // For GitHub, use GitHub Advisory Database via OSV
      ecosystem = 'GitHub Actions'; // fallback; we use package query
      const parts = target.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').split('/');
      if (parts.length >= 2) {
        packageName = `${parts[0]}/${parts[1]}`;
      }
    }

    if (!ecosystem || !packageName) {
      return {
        supported: false,
        reason: 'Security advisories are available for npm, PyPI, Cargo, and GitHub monitors.',
        advisories: [],
      };
    }

    try {
      // Query OSV.dev for known vulnerabilities
      const osvBody: Record<string, unknown> = {
        package: { name: packageName, ecosystem },
      };

      const osvResp = await fetch('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(osvBody),
        signal: AbortSignal.timeout(8000),
      });

      if (!osvResp.ok) {
        return { supported: true, source: 'osv.dev', advisories: [], error: `OSV API returned ${osvResp.status}` };
      }

      const osvData = await osvResp.json() as {
        vulns?: Array<{
          id: string;
          summary?: string;
          details?: string;
          severity?: Array<{ type: string; score: string }>;
          affected?: Array<{ ranges?: Array<{ type: string; events?: Array<{ introduced?: string; fixed?: string }> }> }>;
          published?: string;
          modified?: string;
          references?: Array<{ type: string; url: string }>;
          aliases?: string[];
        }>;
      };

      const vulns = (osvData.vulns ?? []).slice(0, 10);

      return {
        supported: true,
        source: 'osv.dev',
        total: osvData.vulns?.length ?? 0,
        advisories: vulns.map((v) => {
          const cvss = v.severity?.find((s) => s.type === 'CVSS_V3')?.score ?? v.severity?.[0]?.score ?? null;
          const cveId = v.aliases?.find((a) => a.startsWith('CVE-')) ?? null;
          const fixedInRef = v.affected?.[0]?.ranges?.[0]?.events?.find((e) => e.fixed);
          return {
            id: v.id,
            cveId,
            summary: v.summary ?? null,
            cvss,
            publishedAt: v.published ?? null,
            fixedIn: fixedInRef?.fixed ?? null,
            url: v.references?.find((r) => r.type === 'ADVISORY' || r.type === 'WEB')?.url ?? `https://osv.dev/vulnerability/${v.id}`,
          };
        }),
      };
    } catch {
      return { supported: true, source: 'osv.dev', advisories: [], error: 'Failed to query OSV API' };
    }
  }

// ─── Release Notes ────────────────────────────────────────────────────────

  @Get(':id/release-notes')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Fetch release notes for a version monitor',
    description:
      'For GitHub-backed version monitors: fetches the release notes (body) of the latest release tag. Returns null for non-GitHub or non-version monitors.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'version', required: false, description: 'Specific version tag to fetch notes for (defaults to latest)' })
  @ApiResponse({ status: 200, description: 'Release notes returned (or null if unavailable).' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async releaseNotes(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('version') version?: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id, userId: req.user.id },
      select: { id: true, type: true, target: true, configJson: true },
    });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const config = (monitor.configJson as Record<string, unknown> | null) ?? {};
    const provider = String(config['provider'] ?? '');

    if (!['github'].includes(provider) || !['GIT_RELEASE', 'DOCKER_IMAGE'].includes(monitor.type)) {
      return { available: false, reason: 'Release notes are only available for GitHub version monitors.' };
    }

    const target = String(config['target'] ?? monitor.target ?? '').trim();
    // target is "owner/repo"
    const parts = target.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').split('/');
    if (parts.length < 2) {
      return { available: false, reason: 'Cannot parse repository from monitor target.' };
    }
    const [owner, repo] = parts;

    const token = config['token'] ? String(config['token']) : (process.env.GITHUB_TOKEN ?? '');
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      let releaseUrl: string;
      if (version) {
        releaseUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(version)}`;
      } else {
        releaseUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
      }

      const resp = await fetch(releaseUrl, { headers });
      if (!resp.ok) {
        return { available: false, reason: `GitHub API returned ${resp.status}` };
      }

      const release = await resp.json() as {
        tag_name?: string;
        name?: string;
        body?: string;
        published_at?: string;
        html_url?: string;
        prerelease?: boolean;
        assets?: Array<{ name: string; download_count: number; size: number; browser_download_url: string }>;
      };

      return {
        available: true,
        version: release.tag_name ?? null,
        releaseName: release.name ?? null,
        body: release.body ? release.body.slice(0, 10000) : null,
        publishedAt: release.published_at ?? null,
        url: release.html_url ?? null,
        prerelease: release.prerelease ?? false,
        assetCount: release.assets?.length ?? 0,
      };
    } catch {
      return { available: false, reason: 'Failed to fetch release notes from GitHub.' };
    }
  }

// ─── Linked Incidents ────────────────────────────────────────────────────

  @Get(':id/incidents')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Incidents linked to a monitor',
    description: 'Returns all formal incidents that reference this monitor, ordered by most recent first.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max incidents to return (1-100, default 20)' })
  @ApiResponse({ status: 200, description: 'Incidents returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async monitorIncidents(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id, userId: req.user.id }, select: { id: true } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const take = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));

    const links = await this.prisma.incidentMonitor.findMany({
      where: { monitorId: id },
      include: {
        incident: {
          select: {
            id: true,
            title: true,
            status: true,
            severity: true,
            createdAt: true,
            resolvedAt: true,
            autoCreated: true,
          },
        },
      },
      orderBy: { incident: { createdAt: 'desc' } },
      take,
    });

    return {
      total: links.length,
      incidents: links.map((l) => ({
        id: l.incident.id,
        title: l.incident.title,
        status: l.incident.status,
        severity: l.incident.severity,
        autoCreated: l.incident.autoCreated,
        createdAt: l.incident.createdAt,
        resolvedAt: l.incident.resolvedAt,
        durationSec: l.incident.resolvedAt
          ? Math.floor((new Date(l.incident.resolvedAt).getTime() - new Date(l.incident.createdAt).getTime()) / 1000)
          : null,
      })),
    };
  }

// ─── Alert Delivery History ───────────────────────────────────────────────

  @Get(':id/deliveries')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Alert delivery history for a monitor',
    description: 'Returns the last 100 alert delivery log entries for a specific monitor, including channel info, status, trigger, and duration.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({
    status: 200,
    description: 'Delivery history returned.',
    schema: {
      example: {
        total: 5,
        successCount: 4,
        failedCount: 1,
        deliveries: [
          {
            id: 'clxyz',
            channelId: 'ch-1',
            channelName: 'Slack Alerts',
            channelType: 'slack',
            status: 'success',
            trigger: 'monitor_failure',
            errorMessage: null,
            durationMs: 145,
            createdAt: '2026-03-26T08:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async listDeliveries(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id, userId: req.user.id } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const logs = await this.prisma.alertDeliveryLog.findMany({
      where: { monitorId: id },
      include: { alertChannel: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const deliveries = logs.map((log) => ({
      id: log.id,
      channelId: log.alertChannelId,
      channelName: log.alertChannel.name,
      channelType: log.alertChannel.type,
      status: log.status,
      trigger: log.trigger ?? null,
      errorMessage: log.errorMessage ?? null,
      durationMs: log.durationMs ?? null,
      createdAt: log.createdAt.toISOString(),
    }));

    const successCount = deliveries.filter((d) => d.status === 'success').length;
    const failedCount = deliveries.filter((d) => d.status === 'failed').length;

    return {
      total: deliveries.length,
      successCount,
      failedCount,
      deliveries,
    };
  }

  // ─── Certificate Details ──────────────────────────────────────────────────

  @Get(':id/certificate')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Live TLS certificate details for a monitor',
    description:
      'Fetches the live TLS certificate for the monitor target. Works for HTTP and SSL_CERT monitors. ' +
      'Returns subject, issuer, SANs, validity dates, days remaining, fingerprint, and TLS protocol.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Certificate details returned.' })
  @ApiResponse({ status: 400, description: 'Monitor type does not support certificate inspection.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async certificateDetails(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id, userId: req.user.id },
      select: { id: true, type: true, target: true, timeoutMs: true },
    });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const supportedTypes = ['HTTP', 'SSL_CERT', 'BROWSER'];
    if (!supportedTypes.includes(monitor.type)) {
      return {
        supported: false,
        reason: `Certificate inspection is only available for HTTP and SSL_CERT monitors (got ${monitor.type}).`,
      };
    }

    // Extract hostname from target
    let hostname: string;
    try {
      const raw = monitor.target.startsWith('http') ? monitor.target : `https://${monitor.target}`;
      hostname = new URL(raw).hostname;
    } catch {
      return { supported: false, reason: 'Cannot parse hostname from monitor target.' };
    }

    const timeoutMs = Math.min(monitor.timeoutMs ?? 10000, 15000);
    const started = Date.now();

    return new Promise<Record<string, unknown>>((resolve) => {
      const socket = tls.connect(
        { host: hostname, port: 443, servername: hostname, rejectUnauthorized: false, timeout: timeoutMs },
        () => {
          const cert = socket.getPeerCertificate(true);
          const protocol = socket.getProtocol() ?? null;
          const cipher = socket.getCipher();
          socket.end();

          const latencyMs = Date.now() - started;

          if (!cert || !cert.valid_to) {
            resolve({ supported: true, available: false, reason: 'Certificate metadata unavailable', latencyMs });
            return;
          }

          const validFrom = new Date(cert.valid_from);
          const validTo = new Date(cert.valid_to);
          const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

          // Subject
          const subjectCN = Array.isArray(cert.subject?.CN) ? cert.subject.CN[0] : (cert.subject?.CN ?? null);
          const subjectO = Array.isArray(cert.subject?.O) ? cert.subject.O[0] : (cert.subject?.O ?? null);

          // Issuer
          const issuerCN = Array.isArray(cert.issuer?.CN) ? cert.issuer.CN[0] : (cert.issuer?.CN ?? null);
          const issuerO = Array.isArray(cert.issuer?.O) ? cert.issuer.O[0] : (cert.issuer?.O ?? null);

          // SANs
          const sanString = (cert.subjectaltname ?? '') as string;
          const sans = sanString
            ? sanString.split(', ').map((s) => s.replace(/^DNS:|^IP Address:/i, '').trim()).filter(Boolean)
            : [];

          // Fingerprint
          const fingerprint = cert.fingerprint256 ?? cert.fingerprint ?? null;

          // Serial number
          const serialNumber = cert.serialNumber ?? null;

          // Key usage
          const keyUsage = cert.ext_key_usage ? (cert.ext_key_usage as string[]) : [];

          // Issuer cert (chain depth indicator)
          const isCA = !!(cert.issuerCertificate && cert.issuerCertificate !== cert);

          const grade =
            daysRemaining < 0 ? 'expired' :
            daysRemaining <= 7 ? 'critical' :
            daysRemaining <= 30 ? 'warning' :
            protocol?.startsWith('TLSv1.3') || protocol?.startsWith('TLSv1.2') ? 'good' :
            'fair';

          resolve({
            supported: true,
            available: true,
            latencyMs,
            hostname,
            subject: { CN: subjectCN, O: subjectO },
            issuer: { CN: issuerCN, O: issuerO },
            sans,
            validFrom: validFrom.toISOString(),
            validTo: validTo.toISOString(),
            daysRemaining,
            fingerprint,
            serialNumber,
            keyUsage,
            protocol,
            cipher: cipher ? { name: cipher.name, version: cipher.version } : null,
            isChained: isCA,
            grade,
            status: daysRemaining < 0 ? 'expired' : daysRemaining <= 7 ? 'critical' : daysRemaining <= 30 ? 'expiring' : 'valid',
          });
        },
      );

      socket.setTimeout(timeoutMs, () => {
        socket.destroy();
        resolve({ supported: true, available: false, reason: 'TLS connection timed out', latencyMs: Date.now() - started });
      });

      socket.on('error', (err) => {
        resolve({ supported: true, available: false, reason: err.message, latencyMs: Date.now() - started });
      });
    });
  }

  // ─── Mute ─────────────────────────────────────────────────────────────────

  @Post(':id/mute')
  @HttpCode(200)
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Mute monitor alerts', description: 'Suppress all alerts for this monitor for the specified number of minutes (1-1440).' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Monitor muted. Returns mutedUntil timestamp.' })
  @ApiResponse({ status: 400, description: 'Invalid minutes value.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async muteMonitor(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: MuteMonitorDto,
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id, userId: req.user.id } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const mutedUntil = new Date(Date.now() + body.minutes * 60_000);
    await this.prisma.monitor.update({ where: { id }, data: { mutedUntil } });
    return { mutedUntil: mutedUntil.toISOString() };
  }

  @Delete(':id/mute')
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Unmute monitor', description: 'Clear the mute on a monitor, re-enabling alert delivery.' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Monitor unmuted.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async unmuteMonitor(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id, userId: req.user.id } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    await this.prisma.monitor.update({ where: { id }, data: { mutedUntil: null } });
    return { mutedUntil: null };
  }

  // ─── Pause (temporary check suspension) ──────────────────────────────────

  @Post(':id/pause')
  @HttpCode(200)
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({
    summary: 'Pause monitor checks',
    description: 'Stop all checks on a monitor for the specified duration. Unlike muting (which suppresses alerts but still runs checks), pausing stops check execution entirely. Checks automatically resume when the pause expires. Useful for deployment windows or scheduled maintenance.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Monitor paused. Returns pausedUntil timestamp.' })
  @ApiResponse({ status: 400, description: 'Invalid minutes value.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async pauseMonitor(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: PauseMonitorDto,
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id, userId: req.user.id } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const pausedUntil = new Date(Date.now() + body.minutes * 60_000);
    await this.prisma.monitor.update({ where: { id }, data: { pausedUntil } });
    return { pausedUntil: pausedUntil.toISOString() };
  }

  @Delete(':id/pause')
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Resume monitor checks', description: 'Clear the pause on a monitor, immediately resuming check execution.' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Monitor resumed.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async resumeMonitor(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id, userId: req.user.id } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    await this.prisma.monitor.update({ where: { id }, data: { pausedUntil: null } });
    return { pausedUntil: null };
  }

  // ─── Acknowledge ──────────────────────────────────────────────────────────

  @Post(':id/acknowledge')
  @HttpCode(200)
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Acknowledge monitor alert', description: 'Create an acknowledgement for the current alert on this monitor, suppressing further notifications until cleared or the monitor recovers.' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Acknowledgement created.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async acknowledgeMonitor(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: AcknowledgeMonitorDto,
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id, userId: req.user.id } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const ack = await this.prisma.alertAcknowledgement.create({
      data: {
        monitorId: id,
        userId: req.user.id,
        note: body.note ?? null,
        clearedAt: null,
      },
    });

    return {
      id: ack.id,
      monitorId: ack.monitorId,
      userId: ack.userId,
      note: ack.note,
      acknowledgedAt: ack.acknowledgedAt.toISOString(),
      clearedAt: null,
      createdAt: ack.createdAt.toISOString(),
    };
  }

  @Delete(':id/acknowledge')
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Clear monitor acknowledgement', description: 'Clear the active acknowledgement on this monitor, re-enabling alert notifications.' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Acknowledgement cleared.' })
  @ApiResponse({ status: 404, description: 'Monitor or active acknowledgement not found.' })
  async clearAcknowledgement(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id, userId: req.user.id } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const activeAck = await this.prisma.alertAcknowledgement.findFirst({
      where: { monitorId: id, clearedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeAck) throw new NotFoundException('No active acknowledgement found');

    const updated = await this.prisma.alertAcknowledgement.update({
      where: { id: activeAck.id },
      data: { clearedAt: new Date() },
    });

    return {
      id: updated.id,
      monitorId: updated.monitorId,
      userId: updated.userId,
      note: updated.note,
      acknowledgedAt: updated.acknowledgedAt.toISOString(),
      clearedAt: updated.clearedAt!.toISOString(),
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Reset the stored DNS baseline for a DNS monitor with detectChanges enabled.
   * The next successful check will re-establish a new baseline automatically.
   */
  @Post(':id/dns-baseline/reset')
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Reset DNS record baseline', description: 'Clears the stored DNS record baseline for a DNS monitor with change detection enabled. The next successful check will establish a new baseline.' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Baseline cleared.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async resetDnsBaseline(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id, userId: req.user.id } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const currentConfig = (monitor.configJson ?? {}) as Record<string, unknown>;
    const { dnsBaseline: _removed, dnsBaselineSetAt: _removedAt, ...restConfig } = currentConfig;

    await this.prisma.monitor.update({
      where: { id },
      data: { configJson: restConfig as Prisma.InputJsonValue },
    });

    return { ok: true, message: 'DNS baseline cleared — will be re-established on next successful check.' };
  }

  /**
   * Reset the stored content hash baseline for an HTTP/BROWSER monitor with detectContentChanges enabled.
   * The next successful check will re-establish a new baseline automatically.
   */
  @Post(':id/content-baseline/reset')
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Reset content change baseline', description: 'Clears the stored content hash baseline for an HTTP/BROWSER monitor with content change detection enabled. The next successful check will establish a new baseline.' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Baseline cleared.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async resetContentBaseline(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id, userId: req.user.id } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const currentConfig = (monitor.configJson ?? {}) as Record<string, unknown>;
    const { contentHash: _removed, contentHashSetAt: _removedAt, ...restConfig } = currentConfig;

    await this.prisma.monitor.update({
      where: { id },
      data: { configJson: restConfig as Prisma.InputJsonValue },
    });

    return { ok: true, message: 'Content baseline cleared — will be re-established on next successful check.' };
  }

  @Post(':id/header-baseline/reset')
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Reset response header baseline', description: 'Clears the stored response header baseline for an HTTP/BROWSER monitor with header tracking enabled. The next successful check will establish a new baseline.' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Header baseline cleared.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async resetHeaderBaseline(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id, userId: req.user.id } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    await this.prisma.monitor.update({
      where: { id },
      data: { headerBaseline: Prisma.DbNull, headerBaselineSetAt: null },
    });

    return { ok: true, message: 'Header baseline cleared — will be re-established on next successful check.' };
  }

  @Get(':id/slo-report')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'SLO/SLI report', description: 'Returns the SLO report for a monitor, including uptime SLO, latency SLI (if configured), and error budget overview.' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'SLO report returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  getSloReport(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.monitorsService.getSloReport(req.user.id, id);
  }

  @Get('slo-summary')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'SLO health summary', description: 'Returns a lightweight SLO status summary for all monitors with an SLA target configured. Used on the dashboard.' })
  @ApiResponse({ status: 200, description: 'SLO summary returned.' })
  getSloSummary(@Req() req: { user: { id: string } }) {
    return this.monitorsService.getSloSummary(req.user.id);
  }

  @Get('sla-dashboard')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'SLA compliance dashboard for all monitors', description: 'Returns SLA compliance stats, error budget, and monthly history for all enabled monitors.' })
  @ApiResponse({ status: 200, description: 'SLA dashboard data.' })
  slaDashboard(@Req() req: { user: { id: string } }) {
    return this.monitorsService.slaDashboard(req.user.id);
  }

  @Get('sla-by-tag')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'SLA compliance aggregated by tag',
    description: 'Returns weighted uptime% and SLA compliance counts grouped by tag for the current calendar month. Useful for answering "What is my Database tier\'s SLA this month?".',
  })
  @ApiResponse({ status: 200, description: 'Per-tag SLA summary array.' })
  slaByTag(@Req() req: { user: { id: string } }) {
    return this.monitorsService.slaByTag(req.user.id);
  }

  @Get('sla-compliance-report')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'SLA compliance report',
    description: 'Generates a structured SLA compliance report for all monitors with an SLA target. Returns per-monitor monthly breakdown, incident counts, downtime estimates, and error budget consumption. Use ?months=N (1–12) to set the report period.',
  })
  @ApiQuery({ name: 'months', required: false, description: 'Number of months to cover (1–12, default 3)' })
  @ApiResponse({ status: 200, description: 'Compliance report data returned.' })
  slaComplianceReport(
    @Req() req: { user: { id: string } },
    @Query('months') months?: string,
  ) {
    const n = Math.max(1, Math.min(12, parseInt(months ?? '3', 10) || 3));
    return this.monitorsService.slaComplianceReport(req.user.id, n);
  }

  @Get(':id/sla-forecast')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'SLA error budget forecast for current month',
    description: 'Uses the current month\'s observed uptime rate to project whether the monitor will breach its SLA target by month end. Returns projected uptime%, error budget exhaustion date, breach prediction, and a full daily breakdown (actual + projected).',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'SLA forecast returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  slaBudgetForecast(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.monitorsService.slaBudgetForecast(req.user.id, id);
  }

  @Get(':id/status-transitions')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Get status transition history for a monitor',
    description: 'Returns a list of level-change events (green→red, red→green, etc.) over the given period. Useful for incident root-cause analysis and post-mortems. Includes summary stats: total outages, total downtime, MTTR, MTBF.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'period', enum: ['24h', '7d', '30d'], required: false, description: 'Lookback window (default 7d)' })
  @ApiResponse({ status: 200, description: 'Status transition list and summary returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  getStatusTransitions(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('period') period?: string,
  ) {
    const validPeriods = ['24h', '7d', '30d'] as const;
    const safePeriod = validPeriods.includes(period as '24h' | '7d' | '30d')
      ? (period as '24h' | '7d' | '30d')
      : '7d';
    return this.monitorsService.getStatusTransitions(req.user.id, id, safePeriod);
  }

  @Get(':id/latency-distribution')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Get latency distribution and hourly patterns for a monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'period', enum: ['24h', '7d', '30d'], required: false })
  @ApiResponse({ status: 200, description: 'Latency distribution data' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  getLatencyDistribution(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('period') period?: string,
  ) {
    const validPeriods = ['24h', '7d', '30d'] as const;
    const safePeriod = validPeriods.includes(period as '24h' | '7d' | '30d')
      ? (period as '24h' | '7d' | '30d')
      : '7d';
    return this.monitorsService.getLatencyDistribution(req.user.id, id, safePeriod);
  }

  @Get(':id/period-comparison')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Period-over-period latency and uptime comparison for a monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'period', enum: ['24h', '7d', '30d'], required: false, description: 'Comparison window (default: 7d)' })
  @ApiResponse({ status: 200, description: 'Current vs prior period stats with % deltas' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  getPeriodComparison(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('period') period?: string,
  ) {
    const validPeriods = ['24h', '7d', '30d'] as const;
    const safePeriod = validPeriods.includes(period as '24h' | '7d' | '30d')
      ? (period as '24h' | '7d' | '30d')
      : '7d';
    return this.monitorsService.getPeriodComparison(req.user.id, id, safePeriod);
  }

  // ─── Bulk Create from URL List ────────────────────────────────────────────

  @Post('bulk-create-from-urls')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({
    summary: 'Bulk create HTTP monitors from a URL list',
    description: 'Accepts a list of HTTP/HTTPS URLs (max 50), validates each, derives a name from the hostname, and creates one HTTP monitor per URL. Skips duplicates (same target already monitored).',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk create result.',
    schema: {
      example: { created: 3, skipped: 1, errors: [{ url: 'not-a-url', error: 'Invalid URL' }] },
    },
  })
  bulkCreateFromUrls(
    @Req() req: { user: { id: string } },
    @Body() body: BulkCreateFromUrlsDto,
  ) {
    return this.monitorsService.bulkCreateFromUrls(req.user.id, body);
  }

  // ─── Share Token (public status.json) ────────────────────────────────────

  @Post(':id/share-token')
  @HttpCode(200)
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({
    summary: 'Generate or refresh share token',
    description: 'Generates (or regenerates) a unique share token for this monitor. The token enables access to `GET /v1/public/monitor/:token/status.json` without authentication. Useful for embedding status in README files, CI/CD scripts, or dashboards.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Share token generated.', schema: { example: { shareToken: 'pd_share_xxxxxxxx' } } })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async generateShareToken(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id, userId: req.user.id }, select: { id: true } });
    if (!monitor) throw new NotFoundException('Monitor not found');
    // Generate a random share token with prefix
    const bytes = randomBytes(16).toString('hex');
    const shareToken = `pd_share_${bytes}`;
    await this.prisma.monitor.update({ where: { id }, data: { shareToken } });
    return { shareToken };
  }

  @Delete(':id/share-token')
  @HttpCode(200)
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({
    summary: 'Revoke share token',
    description: 'Revokes the share token for this monitor, disabling the public status.json endpoint.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Share token revoked.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async revokeShareToken(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id, userId: req.user.id }, select: { id: true } });
    if (!monitor) throw new NotFoundException('Monitor not found');
    await this.prisma.monitor.update({ where: { id }, data: { shareToken: null } });
    return { shareToken: null };
  }

  // ─── Response Body Diff ───────────────────────────────────────────────────

  @Get(':id/response-diff')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Get response body diff for a failing run',
    description: 'Returns the response bodies of a failing run and the most recent passing run before it, for client-side diff display.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'runId', required: true, description: 'ID of the failing run to compare' })
  @ApiQuery({ name: 'baseRunId', required: false, description: 'ID of the baseline (passing) run. If omitted, finds the most recent OK run before the failing run.' })
  @ApiResponse({
    status: 200,
    description: 'Diff bodies returned.',
    schema: {
      example: {
        failedBody: '{"status":"error"}',
        baseBody: '{"status":"ok"}',
        runId: 'run-abc',
        baseRunId: 'run-xyz',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Monitor or run not found.' })
  getResponseDiff(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('runId') runId: string,
    @Query('baseRunId') baseRunId?: string,
  ) {
    return this.monitorsService.getResponseDiff(req.user.id, id, runId, baseRunId);
  }

  @Post(':id/pin')
  @HttpCode(200)
  @ApiOperation({ summary: 'Toggle monitor pinned state' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Returns updated pinned state.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async togglePin(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ): Promise<{ pinned: boolean }> {
    return this.monitorsService.togglePin(req.user.id, id);
  }

  @Get(':id/redirect-chain-stats')
  @ApiOperation({ summary: 'Redirect chain statistics for a monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Redirect chain statistics.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  redirectChainStats(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.monitorsService.redirectChainStats(req.user.id, id);
  }

  // ─── CT Log History ──────────────────────────────────────────────────────

  @Get(':id/ct-log-history')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'CT log check history for a monitor',
    description: 'Returns the last 50 CT log check results for a CT_LOG monitor, showing certificate counts and detected domains per run.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'CT log history returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  ctLogHistory(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.monitorsService.ctLogHistory(req.user.id, id);
  }

  // ─── Geo Distribution Stats ───────────────────────────────────────────────────────

  @Get(':id/geo-stats')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Geo-distribution stats for a monitor',
    description: 'Returns per-region latency and availability stats for monitors with geoRegions configured.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'periodDays', required: false, type: Number, description: 'Number of days to look back (default 7)' })
  @ApiResponse({ status: 200, description: 'Geo stats returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  geoStats(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('periodDays') periodDays?: string,
  ) {
    return this.monitorsService.geoStats(req.user.id, id, periodDays ? parseInt(periodDays, 10) : 7);
  }

  // ─── Daily Latency Percentile History ────────────────────────────────────────────

  @Get(':id/latency-history')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Daily P50/P95/P99 latency history',
    description: 'Returns per-day latency percentiles (P50, P95, P99) and uptime% for the last N days. Useful for rendering multi-line performance trend charts.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Number of days to look back (default 30, max 90)' })
  @ApiResponse({ status: 200, description: 'Daily latency history returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  latencyHistory(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    return this.monitorsService.latencyHistory(req.user.id, id, days ? parseInt(days, 10) : 30);
  }

  // ─── Monitor Correlation Analysis ─────────────────────────────────────────────────

  @Get('correlation')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Monitor failure correlation analysis',
    description: 'Computes pairwise Jaccard similarity of failure windows across all monitors. Identifies which monitors tend to fail together, enabling faster root cause analysis. Groups highly-correlated monitors (≥40% similarity) into failure clusters.',
  })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Look-back period in days (1–90, default 7)' })
  @ApiResponse({ status: 200, description: 'Correlation analysis returned.' })
  correlation(
    @Req() req: { user: { id: string } },
    @Query('days') days?: string,
  ) {
    return this.monitorsService.monitorCorrelation(req.user.id, days ? parseInt(days, 10) : 7);
  }

  // ─── Failure Pattern Analysis ─────────────────────────────────────────────────────

  @Get(':id/failure-patterns')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Failure pattern analysis for a monitor',
    description: 'Groups failed check messages into normalized patterns. Returns frequency, first/last seen, and a weekly trend for each pattern. Useful for diagnosing recurring failure causes.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'periodDays', required: false, type: Number, description: 'Number of days to look back (default 30, max 365)' })
  @ApiResponse({ status: 200, description: 'Failure pattern analysis returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  failurePatterns(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('periodDays') periodDays?: string,
  ) {
    return this.monitorsService.failurePatterns(req.user.id, id, periodDays ? parseInt(periodDays, 10) : 30);
  }

  // ─── Alert Rules Simulator ────────────────────────────────────────────────

  @Post(':id/simulate-alerts')
  @HttpCode(200)
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Simulate alert rules',
    description: 'Replays the last 7 days of check history through a configurable alert ruleset. Returns how many alerts would have fired, a noise score, and a timeline of simulated events.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Simulation result returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  simulateAlerts(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: SimulateAlertsDto,
  ) {
    return this.monitorsService.simulateAlerts(req.user.id, id, body);
  }

  // ─── Fleet Health Report ────────────────────────────────────────────────

  @Get('fleet-report')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Fleet health report',
    description:
      'Returns an executive-level health overview of the entire monitor fleet: fleet score/grade, reliability tiers, at-risk monitors, incident velocity trend, type distribution, coverage gaps, and top/worst performers.',
  })
  @ApiResponse({ status: 200, description: 'Fleet health report returned.' })
  fleetHealthReport(@Req() req: { user: { id: string } }) {
    return this.monitorsService.fleetHealthReport(req.user.id);
  }

  // ─── Anomaly Report ────────────────────────────────────────────────────

  @Get('anomaly-report')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Fleet-wide anomaly report',
    description:
      'Detects significant behavioral changes across all monitors by comparing the current period against the prior period of equal duration. Identifies uptime regressions, latency spikes, flapping, failure bursts, and recoveries. Results sorted by severity (critical → low).',
  })
  @ApiQuery({ name: 'hours', required: false, type: Number, enum: [24, 48, 168], description: 'Lookback window in hours: 24 (1d), 48 (2d), or 168 (7d). Default: 24.' })
  @ApiResponse({ status: 200, description: 'Anomaly report returned.' })
  anomalyReport(
    @Req() req: { user: { id: string } },
    @Query('hours', new DefaultValuePipe(24)) hours: string,
  ) {
    const h = parseInt(hours as string, 10);
    const validH = ([24, 48, 168] as const).includes(h as 24 | 48 | 168) ? (h as 24 | 48 | 168) : 24;
    return this.monitorsService.anomalyReport(req.user.id, validH);
  }

  // ─── Config Change History ──────────────────────────────────────────────

  @Get(':id/config-history')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Get config change history for a monitor',
    description:
      'Returns a field-level audit trail of all configuration changes made to a monitor. Newest entries first. Each entry includes changed fields with before/after values and a human-readable summary.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max entries to return (default 50, max 200)' })
  @ApiResponse({ status: 200, description: 'Config change history entries, newest first.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  getConfigHistory(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.monitorsService.getConfigHistory(req.user.id, id, limit ? parseInt(limit, 10) : 50);
  }

  // ─── Uptime Certificate ──────────────────────────────────────────────────

  @Get(':id/uptime-certificate')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Generate a printable uptime certificate for a monitor',
    description:
      'Returns a self-contained HTML document (printable to PDF) certifying the monitor\'s uptime achievement over the specified period. Includes monthly breakdown, SLA compliance status, and a unique certificate ID.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'months', required: false, enum: [1, 3, 6, 12], description: 'Period in months (default 1)' })
  @ApiResponse({ status: 200, description: 'HTML certificate returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  async uptimeCertificate(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Res() res: import('express').Response,
    @Query('months') months?: string,
  ) {
    const m = parseInt(months ?? '1', 10);
    const safeMonths = ([1, 3, 6, 12] as const).includes(m as 1 | 3 | 6 | 12) ? m : 1;
    const html = await this.monitorsService.uptimeCertificate(req.user.id, id, safeMonths);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(html);
  }

  // ─── Uptime Certificate (structured JSON) ────────────────────────────────

  @Get(':id/uptime-certificate/data')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Generate uptime certificate data (JSON)',
    description: 'Returns structured certificate data including SLA compliance, latency stats, incident count, and downtime. Accepts periodDays=7|30|90|365.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'periodDays', required: false, enum: [7, 30, 90, 365], description: 'Period in days (default 30)' })
  @ApiQuery({ name: 'title', required: false, description: 'Custom certificate title' })
  @ApiResponse({ status: 200, description: 'Certificate data returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async uptimeCertificateData(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('periodDays', new DefaultValuePipe('30')) periodDays: string,
    @Query('title') title?: string,
  ) {
    const days = parseInt(periodDays, 10);
    return this.monitorsService.generateUptimeCertificate(req.user.id, id, {
      periodDays: ([7, 30, 90, 365] as const).includes(days as 7 | 30 | 90 | 365) ? days : 30,
      title,
    });
  }

  // ─── Downtime Cost Report ──────────────────────────────────────────────────

  @Get('downtime-cost-report')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Fleet-level downtime cost report',
    description:
      'Returns financial impact summary for all monitors with downtimeCostPerHour configured. Analyzes last 30 days of check history. Includes per-monitor breakdown with incident counts and worst-incident cost.',
  })
  @ApiResponse({ status: 200, description: 'Downtime cost report returned.' })
  downtimeCostReport(@Req() req: { user: { id: string } }) {
    return this.monitorsService.downtimeCostReport(req.user.id);
  }

  // ─── Downtime Cost History ─────────────────────────────────────────────────

  @Get(':id/downtime-cost-history')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Daily downtime cost history for a monitor',
    description: 'Returns time-series of daily cost impact for a single monitor. Requires downtimeCostPerHour to be set for meaningful cost values.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Lookback window in days (1–90, default 30)' })
  @ApiResponse({ status: 200, description: 'Daily cost history returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  downtimeCostHistory(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    const d = parseInt(days ?? '30', 10);
    return this.monitorsService.downtimeCostHistory(id, req.user.id, Number.isFinite(d) ? d : 30);
  }

  // ─── Assertion Stats ──────────────────────────────────────────────────────

  @Get(':id/assertion-stats')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Per-assertion-type failure statistics for a monitor',
    description: 'Returns failure counts and percentages for bodyContains, jsonPath, and headerAssertion checks over the specified period.',
  })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Lookback window in days (1–90, default 30)' })
  @ApiResponse({ status: 200, description: 'Assertion stats returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  getAssertionStats(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    const d = parseInt(days ?? '30', 10);
    return this.monitorsService.getAssertionStats(req.user.id, id, Number.isFinite(d) ? d : 30);
  }

  // ─── Tag Analytics ────────────────────────────────────────────────────────

  @Get('tag-analytics')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Per-tag health analytics',
    description: 'Returns aggregated uptime, incident counts, and health classification grouped by tag for all monitors. Sorted by average uptime ascending (worst first). Untagged monitors appear last.',
  })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Lookback window in days (1–90, default 7)' })
  @ApiResponse({ status: 200, description: 'Tag analytics returned.' })
  getTagAnalytics(
    @Req() req: { user: { id: string } },
    @Query('days') days?: string,
  ) {
    const d = parseInt(days ?? '7', 10);
    return this.monitorsService.getTagAnalytics(req.user.id, Number.isFinite(d) ? d : 7);
  }
}
