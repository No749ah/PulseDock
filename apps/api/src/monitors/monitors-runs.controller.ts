import { Controller, DefaultValuePipe, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { RequireScope } from '../common/require-scope.decorator';
import { ScopeGuard } from '../common/scope.guard';
import { ApiKeyScope } from '../apikeys/apikeys.dto';
import { MonitorsCrudService } from './monitors-crud.service';

@ApiTags('Monitors')
@ApiBearerAuth()
@UseGuards(AuthGuard, ScopeGuard)
@Controller('v1/monitors')
export class MonitorsRunsController {
  constructor(private readonly crudService: MonitorsCrudService) {}

  // ─── Runs ─────────────────────────────────────────────────────────────

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
    return this.crudService.getRecentRuns(req.user.id, Number(limit) || 10, sinceDate);
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
    return this.crudService.monitorRuns(req.user.id, id, { limit, before, status });
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
    const { csv, filename } = await this.crudService.exportMonitorRuns(req.user.id, id);
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

    const { data, filename, totalCount } = await this.crudService.exportMonitorRunsEnhanced(req.user.id, id, {
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

  // ─── Uptime & Chart ──────────────────────────────────────────────────

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
    return this.crudService.monitorUptime(req.user.id, id, safePeriod);
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
    return this.crudService.monitorChart(req.user.id, id, safePeriod);
  }

  // ─── Latency Budget ──────────────────────────────────────────────────

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
    return this.crudService.getLatencyBudgetReport(req.user.id, id);
  }

  // ─── Live Feed ────────────────────────────────────────────────────────

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
    return this.crudService.liveFeed(req.user.id, { limit, since, level, type });
  }
}
