import { Controller, DefaultValuePipe, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { RequireScope } from '../common/require-scope.decorator';
import { ScopeGuard } from '../common/scope.guard';
import { ApiKeyScope } from '../apikeys/apikeys.dto';
import { MonitorsComparisonService } from './monitors-comparison.service';

@ApiTags('Monitors')
@ApiBearerAuth()
@UseGuards(AuthGuard, ScopeGuard)
@Controller('v1/monitors')
export class MonitorsComparisonController {
  constructor(
    private readonly comparisonService: MonitorsComparisonService,
  ) {}

  // ─── Compare Monitors ─────────────────────────────────────────────────

  @Get('compare')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Compare 2-4 monitors side by side with statistical analysis' })
  @ApiQuery({ name: 'ids', description: 'Comma-separated monitor IDs (2-4)', required: true })
  @ApiQuery({ name: 'days', description: 'Period in days (1-90)', required: false })
  @ApiResponse({ status: 200, description: 'Comparison data for selected monitors' })
  compareMonitors(
    @Req() req: { user: { id: string } },
    @Query('ids') ids: string,
    @Query('days', new DefaultValuePipe(7)) days: number,
  ) {
    const monitorIds = ids.split(',').map((s) => s.trim()).filter(Boolean);
    return this.comparisonService.compareMonitors(req.user.id, monitorIds, +days);
  }

  // ─── Latency Distribution ─────────────────────────────────────────────

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
    return this.comparisonService.getLatencyDistribution(req.user.id, id, safePeriod);
  }

  // ─── Period Comparison ────────────────────────────────────────────────

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
    return this.comparisonService.getPeriodComparison(req.user.id, id, safePeriod);
  }

  // ─── Status Transitions ──────────────────────────────────────────────

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
    return this.comparisonService.getStatusTransitions(req.user.id, id, safePeriod);
  }
}
