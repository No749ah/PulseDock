import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../common/auth.guard';
import { RequireScope } from '../common/require-scope.decorator';
import { ScopeGuard } from '../common/scope.guard';
import { ApiKeyScope } from '../apikeys/apikeys.dto';
import { MonitorsCrudService } from './monitors-crud.service';
import { PlanService } from '../settings/plan.service';
import { PrismaService } from '../common/prisma.service';
import { BulkActionDto, BulkCreateFromUrlsDto, BulkEditDto, CreateMonitorDto, DiscoverVersionDto, RunMonitorDto, TestVersionConnectionDto, UpdateMonitorDto } from './monitors.dto';
import { PlaygroundDto } from './playground.dto';

@ApiTags('Monitors')
@ApiBearerAuth()
@UseGuards(AuthGuard, ScopeGuard)
@Controller('v1/monitors')
export class MonitorsController {
  constructor(
    private readonly crudService: MonitorsCrudService,
    private readonly planService: PlanService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────

  @Get()
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'List monitors', description: 'Returns all monitors for the authenticated user.' })
  @ApiQuery({ name: 'tag', required: false, description: 'Filter monitors by tag name.' })
  @ApiResponse({ status: 200, description: 'Monitor list returned.' })
  list(@Req() req: { user: { id: string } }, @Query('tag') tag?: string) {
    return this.crudService.list(req.user.id, tag);
  }

  @Get(':id')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Get a single monitor', description: 'Returns full monitor details including mute status and active acknowledgement.' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Monitor returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async getOne(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.crudService.getOne(req.user.id, id);
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
    return this.crudService.create(req.user.id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Monitor updated.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  update(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: UpdateMonitorDto) {
    return this.crudService.update(req.user.id, id, body);
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
    return this.crudService.clone(req.user.id, id);
  }

  @Delete(':id')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Delete monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Monitor deleted.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.crudService.remove(req.user.id, id);
  }

  // ─── Run / Playground ─────────────────────────────────────────────────

  @Post('run')
  @ApiOperation({ summary: 'Trigger manual check', description: 'Run a monitor check immediately without waiting for the schedule.' })
  @ApiResponse({ status: 200, description: 'Check triggered.' })
  runNow(@Req() req: { user: { id: string } }, @Body() body: RunMonitorDto) {
    return this.crudService.runNow(req.user.id, body.monitorId);
  }

  @Post('playground')
  @HttpCode(200)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @RequireScope(ApiKeyScope.WRITE)
  @ApiOperation({ summary: 'Playground check', description: 'Run a one-off HTTP check against any URL and see the full result (status, headers, latency, body, SSL info, timing breakdown) without creating a monitor.' })
  @ApiResponse({ status: 200, description: 'Playground result returned.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded.' })
  runPlayground(@Req() req: { user: { id: string } }, @Body() body: PlaygroundDto) {
    return this.crudService.runPlayground(body, req.user.id);
  }

  // ─── Bulk Operations ──────────────────────────────────────────────────

  @Post('bulk')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Bulk action on monitors', description: 'Apply enable, disable, delete, or run-now to multiple monitors at once.' })
  @ApiResponse({ status: 200, description: 'Bulk action applied.' })
  bulk(@Req() req: { user: { id: string } }, @Body() body: BulkActionDto) {
    return this.crudService.bulkAction(req.user.id, body.ids, body.action, body.tagId, body.value);
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
    return this.crudService.bulkEdit(req.user.id, body);
  }

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
    return this.crudService.bulkCreateFromUrls(req.user.id, body);
  }

  // ─── Version Detection ────────────────────────────────────────────────

  @Post('version-test')
  @ApiOperation({ summary: 'Test version source connection', description: 'Probe a version source (GitHub, Docker Hub, etc.) and return the latest version without saving.' })
  @ApiResponse({ status: 200, description: 'Test result returned.' })
  versionTest(@Body() body: TestVersionConnectionDto) {
    return this.crudService.testVersionConnection(body);
  }

  @Post('version-discover')
  @ApiOperation({ summary: 'Auto-discover current deployed version', description: 'Probe a running application to detect its deployed version via common endpoints.' })
  @ApiResponse({ status: 200, description: 'Discovery result returned.' })
  versionDiscover(@Body() body: DiscoverVersionDto) {
    return this.crudService.discoverCurrentVersion(body);
  }

  @Get('version-summary')
  @ApiOperation({ summary: 'Version check summary', description: 'Returns aggregate stats and per-monitor version status (green/yellow/red).' })
  @ApiResponse({ status: 200, description: 'Version summary returned.' })
  versionSummary(@Req() req: { user: { id: string } }) {
    return this.crudService.versionSummary(req.user.id);
  }

  @Get('version-drift')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Version drift report', description: 'Analyzes semver gap for each version monitor — shows which services are most out-of-date.' })
  @ApiResponse({ status: 200, description: 'Drift report returned.' })
  versionDriftReport(@Req() req: { user: { id: string } }) {
    return this.crudService.versionDriftReport(req.user.id);
  }

  // ─── Plugins ──────────────────────────────────────────────────────────

  @Get('plugins')
  @ApiOperation({ summary: 'List monitor plugins', description: 'Returns available monitor check plugins and their config field metadata.' })
  @ApiResponse({ status: 200, description: 'Plugin metadata returned.' })
  listPlugins() {
    return this.crudService.listPlugins();
  }

  // ─── Compare (POST — legacy) ─────────────────────────────────────────

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
        const uptime = await this.crudService.monitorUptime(req.user.id, id, safePeriod);

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
}
