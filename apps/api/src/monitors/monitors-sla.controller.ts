import { Controller, DefaultValuePipe, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { RequireScope } from '../common/require-scope.decorator';
import { ScopeGuard } from '../common/scope.guard';
import { ApiKeyScope } from '../apikeys/apikeys.dto';
import { MonitorsSlaService } from './monitors-sla.service';

@ApiTags('Monitors')
@ApiBearerAuth()
@UseGuards(AuthGuard, ScopeGuard)
@Controller('v1/monitors')
export class MonitorsSlaController {
  constructor(
    private readonly slaService: MonitorsSlaService,
  ) {}

  // ─── SLA Dashboard ────────────────────────────────────────────────────

  @Get('sla-dashboard')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'SLA compliance dashboard for all monitors', description: 'Returns SLA compliance stats, error budget, and monthly history for all enabled monitors.' })
  @ApiResponse({ status: 200, description: 'SLA dashboard data.' })
  slaDashboard(@Req() req: { user: { id: string } }) {
    return this.slaService.slaDashboard(req.user.id);
  }

  // ─── SLA By Tag ───────────────────────────────────────────────────────

  @Get('sla-by-tag')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'SLA compliance aggregated by tag',
    description: 'Returns weighted uptime% and SLA compliance counts grouped by tag for the current calendar month. Useful for answering "What is my Database tier\'s SLA this month?".',
  })
  @ApiResponse({ status: 200, description: 'Per-tag SLA summary array.' })
  slaByTag(@Req() req: { user: { id: string } }) {
    return this.slaService.slaByTag(req.user.id);
  }

  // ─── SLA Compliance Report ────────────────────────────────────────────

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
    return this.slaService.slaComplianceReport(req.user.id, n);
  }

  // ─── SLO Report ───────────────────────────────────────────────────────

  @Get(':id/slo-report')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'SLO/SLI report', description: 'Returns the SLO report for a monitor, including uptime SLO, latency SLI (if configured), and error budget overview.' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'SLO report returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  getSloReport(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.slaService.getSloReport(req.user.id, id);
  }

  // ─── SLO Summary ──────────────────────────────────────────────────────

  @Get('slo-summary')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'SLO health summary', description: 'Returns a lightweight SLO status summary for all monitors with an SLA target configured. Used on the dashboard.' })
  @ApiResponse({ status: 200, description: 'SLO summary returned.' })
  getSloSummary(@Req() req: { user: { id: string } }) {
    return this.slaService.getSloSummary(req.user.id);
  }

  // ─── SLA Budget Forecast ──────────────────────────────────────────────

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
    return this.slaService.slaBudgetForecast(req.user.id, id);
  }

  // ─── Error Budget ─────────────────────────────────────────────────────

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
    return this.slaService.getErrorBudget(id, req.user.id, { slaTarget: safeSlaTarget, period: safePeriod });
  }

  // ─── Uptime Certificate (HTML) ────────────────────────────────────────

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
    const html = await this.slaService.uptimeCertificate(req.user.id, id, safeMonths);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(html);
  }

  // ─── Uptime Certificate (JSON) ────────────────────────────────────────

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
    return this.slaService.generateUptimeCertificate(req.user.id, id, {
      periodDays: ([7, 30, 90, 365] as const).includes(days as 7 | 30 | 90 | 365) ? days : 30,
      title,
    });
  }
}
