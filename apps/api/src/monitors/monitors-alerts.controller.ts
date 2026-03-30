import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../common/auth.guard';
import { RequireScope } from '../common/require-scope.decorator';
import { ScopeGuard } from '../common/scope.guard';
import { ApiKeyScope } from '../apikeys/apikeys.dto';
import { MonitorsCrudService } from './monitors-crud.service';
import { PrismaService } from '../common/prisma.service';
import { SimulateAlertsDto } from './monitors.dto';

@ApiTags('Monitors')
@ApiBearerAuth()
@UseGuards(AuthGuard, ScopeGuard)
@Controller('v1/monitors')
export class MonitorsAlertsController {
  constructor(
    private readonly crudService: MonitorsCrudService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Alerts ───────────────────────────────────────────────────────────

  @Get(':id/alerts')
  @ApiOperation({ summary: 'List alert channels assigned to a monitor' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Assigned alert channels returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  listAlerts(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.crudService.listMonitorAlerts(req.user.id, id);
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
    return this.crudService.addMonitorAlert(req.user.id, id, channelId, body?.notifyOn, body?.repeatIntervalMin);
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
      await this.crudService.updateMonitorAlertNotifyOn(req.user.id, id, channelId, body.notifyOn);
    }
    if ('escalationPolicyId' in body) {
      await this.crudService.updateMonitorAlertEscalationPolicy(req.user.id, id, channelId, body.escalationPolicyId ?? null);
    }
    if ('repeatIntervalMin' in body) {
      await this.crudService.updateMonitorAlertRepeatInterval(req.user.id, id, channelId, body.repeatIntervalMin ?? null);
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
    return this.crudService.removeMonitorAlert(req.user.id, id, channelId);
  }

  // ─── Alert Simulation ────────────────────────────────────────────────

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
    return this.crudService.simulateAlerts(req.user.id, id, body);
  }

  // ─── Alert Delivery History ───────────────────────────────────────────

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
}
