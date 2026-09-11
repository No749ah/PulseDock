import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { RequireScope } from '../common/require-scope.decorator';
import { ScopeGuard } from '../common/scope.guard';
import { ApiKeyScope } from '../apikeys/apikeys.dto';
import { MonitorsDiagnosticsService } from './monitors-diagnostics.service';

@ApiTags('Monitors')
@ApiBearerAuth()
@UseGuards(AuthGuard, ScopeGuard)
@Controller('v1/monitors')
export class MonitorsDiagnosticsController {
  constructor(
    private readonly diagnosticsService: MonitorsDiagnosticsService,
  ) {}

  // ─── Health Score (single monitor) ────────────────────────────────────

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
    return this.diagnosticsService.getHealthScore(req.user.id, id);
  }

  // ─── Check Rate ───────────────────────────────────────────────────────

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
    return this.diagnosticsService.checkRate(req.user.id, id);
  }

  // ─── Coverage ─────────────────────────────────────────────────────────

  @Get('coverage')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Monitor configuration coverage analysis',
    description: 'Analyzes how well monitors are configured: alert channels, SLA targets, descriptions, runbook URLs, etc. Returns per-monitor gaps and aggregate score.',
  })
  @ApiResponse({ status: 200, description: 'Coverage analysis returned.' })
  monitorCoverage(@Req() req: { user: { id: string } }) {
    return this.diagnosticsService.monitorCoverage(req.user.id);
  }

  // ─── Health Summary ───────────────────────────────────────────────────

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
    return this.diagnosticsService.getHealthSummary(req.user.id);
  }

  // ─── Health Scores (batch) ────────────────────────────────────────────

  @Get('health-scores')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Get health scores for all monitors (batch)' })
  @ApiResponse({ status: 200, description: 'Batch health scores returned.' })
  healthScores(@Req() req: { user: { id: string } }) {
    return this.diagnosticsService.allHealthScores(req.user.id);
  }

  // ─── Health Score Leaderboard ─────────────────────────────────────────

  @Get('health-scores/leaderboard')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({
    summary: 'Health score leaderboard',
    description: 'Returns enriched health scores for all monitors with grade, uptime%, incident count, SLA compliance, and improvement hints. Sorted best→worst. No-data monitors appear last.',
  })
  @ApiResponse({ status: 200, description: 'Leaderboard returned.' })
  healthScoreLeaderboard(@Req() req: { user: { id: string } }) {
    return this.diagnosticsService.healthScoreLeaderboard(req.user.id);
  }

  // ─── Check Schedule ───────────────────────────────────────────────────

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
    return this.diagnosticsService.checkSchedule(req.user.id);
  }

  // ─── Interval Optimizer ───────────────────────────────────────────────

  @Get('interval-optimizer')
  @RequireScope(ApiKeyScope.READ)
  @ApiOperation({ summary: 'Check interval optimizer', description: 'Analyzes each monitor\'s check interval vs incident history and recommends optimal check frequency.' })
  @ApiResponse({ status: 200, description: 'Interval recommendations returned.' })
  intervalOptimizer(@Req() req: { user: { id: string } }) {
    return this.diagnosticsService.intervalOptimizer(req.user.id);
  }

  // ─── SSL Summary ──────────────────────────────────────────────────────

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
    return this.diagnosticsService.getSslSummary(req.user.id);
  }

  // ─── Security Headers Summary ─────────────────────────────────────────

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
    return this.diagnosticsService.getSecurityHeadersSummary(req.user.id);
  }

  // ─── CT Log History ───────────────────────────────────────────────────

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
    return this.diagnosticsService.ctLogHistory(req.user.id, id);
  }

  // ─── Redirect Chain Stats ────────────────────────────────────────────

  @Get(':id/redirect-chain-stats')
  @ApiOperation({ summary: 'Redirect chain statistics for a monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Redirect chain statistics.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  redirectChainStats(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.diagnosticsService.redirectChainStats(req.user.id, id);
  }
}
