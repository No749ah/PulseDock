import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { AuthGuard } from '../common/auth.guard';
import { AlertsService } from './alerts.service';
import type { AlertChannelType } from '../types';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { PlanService } from '../settings/plan.service';
import { CreateAlertChannelDto, PreviewPayloadDto, TestAlertChannelDto, UpdateAlertChannelDto } from './alerts.dto';

@ApiTags('Alerts')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/alert-channels')
export class AlertsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertsService: AlertsService,
    private readonly audit: AuditService,
    private readonly planService: PlanService,
  ) {}

  /** Maps a Prisma AlertChannel row to the AlertChannel domain type. */
  private mapChannel(c: {
    id: string;
    userId: string;
    name: string;
    type: string;
    configJson: import('@prisma/client').Prisma.JsonValue;
    createdAt: Date;
    alertGrouping: boolean;
    groupWindowSec: number;
    groupByFolder: boolean;
    groupByTag: boolean;
    messageTemplate?: string | null;
    scheduleJson?: import('@prisma/client').Prisma.JsonValue | null;
    batchWindowSec?: number | null;
  }): import('../types').AlertChannel {
    return {
      id: c.id,
      userId: c.userId,
      name: c.name,
      type: c.type as import('../types').AlertChannelType,
      config: (c.configJson as Record<string, unknown>) ?? {},
      createdAt: c.createdAt.toISOString(),
      alertGrouping: c.alertGrouping,
      groupWindowSec: c.groupWindowSec,
      groupByFolder: c.groupByFolder,
      groupByTag: c.groupByTag,
      messageTemplate: c.messageTemplate ?? null,
      scheduleJson: c.scheduleJson ?? null,
      batchWindowSec: c.batchWindowSec ?? null,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List alert channels', description: 'Returns all configured alert channels for the authenticated user.' })
  @ApiResponse({ status: 200, description: 'Alert channels returned.' })
  async list(@Req() req: { user: { id: string } }) {
    const channels = await this.prisma.alertChannel.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { deliveryLogs: true } } },
    });
    return channels.map((c) => ({
      id: c.id,
      userId: c.userId,
      name: c.name,
      type: c.type,
      config: (c.configJson as Record<string, unknown>) ?? {},
      createdAt: c.createdAt.toISOString(),
      alertGrouping: c.alertGrouping,
      groupWindowSec: c.groupWindowSec,
      groupByFolder: c.groupByFolder,
      groupByTag: c.groupByTag,
      messageTemplate: c.messageTemplate ?? null,
      scheduleJson: c.scheduleJson ?? null,
      batchWindowSec: c.batchWindowSec ?? null,
      deliveryCount: c._count.deliveryLogs,
    }));
  }

  @Post()
  @ApiOperation({ summary: 'Create alert channel', description: 'Create a new notification channel (Discord, Slack, Telegram, webhook, email).' })
  @ApiResponse({ status: 201, description: 'Alert channel created.' })
  @ApiResponse({ status: 403, description: 'Plan alert-channels limit reached.' })
  async create(
    @Req() req: { user: { id: string } },
    @Body() body: CreateAlertChannelDto,
  ) {
    const check = await this.planService.checkLimit(req.user.id, 'alert-channels');
    if (!check.allowed) {
      throw new ForbiddenException({
        message: 'Plan limit reached: upgrade to PRO for more alert channels',
        code: 'PLAN_LIMIT',
        resource: 'alert-channels',
        current: check.current,
        limit: check.limit,
        plan: check.plan,
      });
    }
    const createData: Parameters<typeof this.prisma.alertChannel.create>[0]['data'] = {
      userId: req.user.id,
      name: body.name,
      type: body.type,
      configJson: (body.config ?? {}) as Prisma.InputJsonValue,
      alertGrouping: body.alertGrouping ?? false,
      groupWindowSec: body.groupWindowSec ?? 300,
      groupByFolder: body.groupByFolder ?? true,
      groupByTag: body.groupByTag ?? false,
      messageTemplate: (body as { messageTemplate?: string }).messageTemplate ?? null,
      scheduleJson: ('scheduleJson' in body ? ((body as { scheduleJson?: unknown }).scheduleJson ?? Prisma.JsonNull) : Prisma.JsonNull) as Prisma.InputJsonValue,
      batchWindowSec: body.batchWindowSec ?? null,
    };
    const channel = await this.prisma.alertChannel.create({ data: createData });

    await this.audit.log('alert_channel.create', req.user.id, req.user.id, { channelId: channel.id, type: channel.type });

    return {
      id: channel.id,
      userId: channel.userId,
      name: channel.name,
      type: channel.type,
      config: (channel.configJson as Record<string, unknown>) ?? {},
      createdAt: channel.createdAt.toISOString(),
      alertGrouping: channel.alertGrouping,
      groupWindowSec: channel.groupWindowSec,
      groupByFolder: channel.groupByFolder,
      groupByTag: channel.groupByTag,
      messageTemplate: channel.messageTemplate ?? null,
      scheduleJson: channel.scheduleJson ?? null,
      batchWindowSec: channel.batchWindowSec ?? null,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update alert channel' })
  @ApiParam({ name: 'id', description: 'Alert channel ID' })
  @ApiResponse({ status: 200, description: 'Alert channel updated.' })
  @ApiResponse({ status: 404, description: 'Channel not found.' })
  async update(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: UpdateAlertChannelDto) {
    const current = await this.prisma.alertChannel.findFirst({ where: { id, userId: req.user.id } });
    if (!current) throw new NotFoundException('channel not found');

    const updateData: Parameters<typeof this.prisma.alertChannel.update>[0]['data'] = {
      name: body.name ?? current.name,
      type: body.type ?? current.type,
      configJson: (body.config ?? current.configJson) as Prisma.InputJsonValue,
      ...(body.alertGrouping !== undefined && { alertGrouping: body.alertGrouping }),
      ...(body.groupWindowSec !== undefined && { groupWindowSec: body.groupWindowSec }),
      ...(body.groupByFolder !== undefined && { groupByFolder: body.groupByFolder }),
      ...(body.groupByTag !== undefined && { groupByTag: body.groupByTag }),
      ...('messageTemplate' in body && { messageTemplate: (body as { messageTemplate?: string | null }).messageTemplate ?? null }),
      scheduleJson: ('scheduleJson' in body ? ((body as { scheduleJson?: unknown }).scheduleJson ?? Prisma.JsonNull) : (current.scheduleJson ?? Prisma.JsonNull)) as Prisma.InputJsonValue,
      ...('batchWindowSec' in body && { batchWindowSec: body.batchWindowSec ?? null }),
    };
    const updated = await this.prisma.alertChannel.update({ where: { id }, data: updateData });

    await this.audit.log('alert_channel.update', req.user.id, req.user.id, { channelId: id });
    return {
      id: updated.id,
      userId: updated.userId,
      name: updated.name,
      type: updated.type,
      config: (updated.configJson as Record<string, unknown>) ?? {},
      createdAt: updated.createdAt.toISOString(),
      alertGrouping: updated.alertGrouping,
      groupWindowSec: updated.groupWindowSec,
      groupByFolder: updated.groupByFolder,
      groupByTag: updated.groupByTag,
      messageTemplate: updated.messageTemplate ?? null,
      scheduleJson: updated.scheduleJson ?? null,
      batchWindowSec: updated.batchWindowSec ?? null,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete alert channel' })
  @ApiParam({ name: 'id', description: 'Alert channel ID' })
  @ApiResponse({ status: 200, description: 'Alert channel deleted.' })
  @ApiResponse({ status: 404, description: 'Channel not found.' })
  async remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const current = await this.prisma.alertChannel.findFirst({ where: { id, userId: req.user.id } });
    if (!current) throw new NotFoundException('channel not found');

    await this.prisma.monitorAlert.deleteMany({ where: { alertChannelId: id } });
    await this.prisma.alertChannel.delete({ where: { id } });
    await this.audit.log('alert_channel.delete', req.user.id, req.user.id, { channelId: id });
    return { ok: true };
  }

  @Get('analytics')
  @ApiOperation({
    summary: 'Get alert delivery analytics',
    description: 'Returns aggregated analytics from alert delivery logs: daily counts, top alerting monitors, channel reliability stats.',
  })
  @ApiResponse({ status: 200, description: 'Alert analytics returned.' })
  async analytics(@Req() req: { user: { id: string } }) {
    const channels = await this.prisma.alertChannel.findMany({
      where: { userId: req.user.id },
      select: { id: true, name: true, type: true },
    });
    const channelIds = channels.map((c) => c.id);

    if (channelIds.length === 0) {
      return { dailyCounts: [], topMonitors: [], channelStats: [], totals: { success: 0, failed: 0, total: 0 } };
    }

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Fetch all delivery logs for the past 30 days
    const logs = await this.prisma.alertDeliveryLog.findMany({
      where: { alertChannelId: { in: channelIds }, createdAt: { gte: since30d } },
      select: { alertChannelId: true, status: true, monitorId: true, monitorName: true, createdAt: true, durationMs: true },
      orderBy: { createdAt: 'asc' },
    });

    // Daily counts (last 30 days)
    const dayBuckets = new Map<string, { success: number; failed: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dayBuckets.set(key, { success: 0, failed: 0 });
    }
    for (const log of logs) {
      const key = log.createdAt.toISOString().slice(0, 10);
      const bucket = dayBuckets.get(key);
      if (bucket) {
        if (log.status === 'success') bucket.success++;
        else bucket.failed++;
      }
    }
    const dailyCounts = Array.from(dayBuckets.entries()).map(([date, counts]) => ({ date, ...counts, total: counts.success + counts.failed }));

    // Top alerting monitors
    const monitorCounts = new Map<string, { monitorId: string; monitorName: string; count: number; failed: number }>();
    for (const log of logs) {
      if (!log.monitorId) continue;
      const key = log.monitorId;
      const entry = monitorCounts.get(key) ?? { monitorId: log.monitorId, monitorName: log.monitorName ?? log.monitorId, count: 0, failed: 0 };
      entry.count++;
      if (log.status === 'failed') entry.failed++;
      monitorCounts.set(key, entry);
    }
    const topMonitors = Array.from(monitorCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Channel reliability stats
    const channelMap = new Map(channels.map((c) => [c.id, c]));
    const channelCounts = new Map<string, { success: number; failed: number; totalMs: number; count: number }>();
    for (const log of logs) {
      const entry = channelCounts.get(log.alertChannelId) ?? { success: 0, failed: 0, totalMs: 0, count: 0 };
      if (log.status === 'success') entry.success++;
      else entry.failed++;
      if (log.durationMs) { entry.totalMs += log.durationMs; entry.count++; }
      channelCounts.set(log.alertChannelId, entry);
    }
    const channelStats = channels.map((ch) => {
      const counts = channelCounts.get(ch.id) ?? { success: 0, failed: 0, totalMs: 0, count: 0 };
      const total = counts.success + counts.failed;
      return {
        channelId: ch.id,
        channelName: ch.name,
        channelType: ch.type,
        successRate: total === 0 ? 100 : Math.round((counts.success / total) * 1000) / 10,
        totalDeliveries: total,
        successCount: counts.success,
        failedCount: counts.failed,
        avgDurationMs: counts.count === 0 ? null : Math.round(counts.totalMs / counts.count),
      };
    }).filter((c) => c.totalDeliveries > 0);

    const totals = logs.reduce(
      (acc, l) => { if (l.status === 'success') acc.success++; else acc.failed++; acc.total++; return acc; },
      { success: 0, failed: 0, total: 0 },
    );

    return { dailyCounts, topMonitors, channelStats, totals };
  }

  @Get('noise-analysis')
  @ApiOperation({
    summary: 'Alert noise analysis',
    description: 'Analyzes alert delivery patterns to identify noisy monitors and provide actionable recommendations to reduce alert fatigue.',
  })
  @ApiResponse({ status: 200, description: 'Noise analysis report returned.' })
  async noiseAnalysis(
    @Req() req: { user: { id: string } },
    @Query('days') days?: string,
  ) {
    const periodDays = Math.min(30, Math.max(1, parseInt(days ?? '7', 10) || 7));
    return this.alertsService.noiseAnalysis(req.user.id, periodDays);
  }

  @Get('deliveries')
  @ApiOperation({
    summary: 'Get global alert delivery history',
    description: 'Returns recent delivery logs across all alert channels for the authenticated user.'
  })
  @ApiResponse({ status: 200, description: 'Global delivery logs returned.' })
  async globalDeliveries(@Req() req: { user: { id: string } }) {
    const channels = await this.prisma.alertChannel.findMany({
      where: { userId: req.user.id },
      select: { id: true, name: true, type: true },
    });
    const channelIds = channels.map(c => c.id);
    const channelMap = new Map(channels.map(c => [c.id, { name: c.name, type: c.type }]));

    if (channelIds.length === 0) {
      return { total: 0, successCount: 0, failedCount: 0, deliveries: [] };
    }

    const [logs, total, successCount, failedCount] = await Promise.all([
      this.prisma.alertDeliveryLog.findMany({
        where: { alertChannelId: { in: channelIds } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.alertDeliveryLog.count({ where: { alertChannelId: { in: channelIds } } }),
      this.prisma.alertDeliveryLog.count({ where: { alertChannelId: { in: channelIds }, status: 'success' } }),
      this.prisma.alertDeliveryLog.count({ where: { alertChannelId: { in: channelIds }, status: 'failed' } }),
    ]);

    return {
      total,
      successCount,
      failedCount,
      deliveries: logs.map(l => ({
        id: l.id,
        channelId: l.alertChannelId,
        channelName: channelMap.get(l.alertChannelId)?.name ?? 'Unknown',
        channelType: channelMap.get(l.alertChannelId)?.type ?? 'unknown',
        status: l.status,
        trigger: l.trigger,
        monitorId: l.monitorId,
        monitorName: l.monitorName,
        errorMessage: l.errorMessage,
        durationMs: l.durationMs,
        createdAt: l.createdAt.toISOString(),
        isGrouped: l.isGrouped,
        groupedCount: l.groupedCount,
      })),
    };
  }

  @Get(':id/delivery-stats')
  @ApiOperation({ summary: 'Get alert channel delivery stats', description: 'Returns aggregated delivery statistics and recent logs for a specific alert channel.' })
  @ApiParam({ name: 'id', description: 'Alert channel ID' })
  @ApiResponse({ status: 200, description: 'Delivery stats returned.' })
  @ApiResponse({ status: 404, description: 'Channel not found.' })
  async deliveryStats(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.alertsService.deliveryStats(req.user.id, id);
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Get alert delivery history', description: 'Returns the last 50 delivery log entries for a specific alert channel.' })
  @ApiParam({ name: 'id', description: 'Alert channel ID' })
  @ApiResponse({ status: 200, description: 'Delivery logs returned.' })
  @ApiResponse({ status: 404, description: 'Channel not found.' })
  async deliveries(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const channel = await this.prisma.alertChannel.findFirst({ where: { id, userId: req.user.id } });
    if (!channel) throw new NotFoundException('channel not found');

    const logs = await this.prisma.alertDeliveryLog.findMany({
      where: { alertChannelId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const successCount = await this.prisma.alertDeliveryLog.count({ where: { alertChannelId: id, status: 'success' } });
    const failedCount = await this.prisma.alertDeliveryLog.count({ where: { alertChannelId: id, status: 'failed' } });

    return {
      channelId: id,
      channelName: channel.name,
      successCount,
      failedCount,
      deliveries: logs.map((l) => ({
        id: l.id,
        status: l.status,
        trigger: l.trigger,
        monitorId: l.monitorId,
        monitorName: l.monitorName,
        errorMessage: l.errorMessage,
        durationMs: l.durationMs,
        createdAt: l.createdAt.toISOString(),
        isGrouped: l.isGrouped,
        groupedCount: l.groupedCount,
      })),
    };
  }

  @Post('test')
  @ApiOperation({ summary: 'Send test notification', description: 'Send a test message through the specified alert channel to verify connectivity.' })
  @ApiResponse({ status: 200, description: 'Test notification dispatched.' })
  @ApiResponse({ status: 404, description: 'Channel not found.' })
  async test(@Req() req: { user: { id: string } }, @Body() body: TestAlertChannelDto) {
    const channel = await this.prisma.alertChannel.findFirst({ where: { id: body.channelId, userId: req.user.id } });
    if (!channel) throw new NotFoundException('channel not found');

    await this.audit.log('alert_channel.test', req.user.id, req.user.id, { channelId: channel.id });
    await this.alertsService.notifyTest(this.mapChannel(channel));
    return { ok: true };
  }

  @Post(':id/preview-payload')
  @ApiOperation({
    summary: 'Preview webhook payload template',
    description: 'Renders the payload template with sample data and returns the output. Validates whether the result is valid JSON.',
  })
  @ApiParam({ name: 'id', description: 'Alert channel ID' })
  @ApiResponse({ status: 200, description: 'Rendered preview returned.' })
  @ApiResponse({ status: 404, description: 'Channel not found.' })
  async previewPayload(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: PreviewPayloadDto,
  ): Promise<{ rendered: string; valid: boolean; error?: string }> {
    const channel = await this.prisma.alertChannel.findFirst({ where: { id, userId: req.user.id } });
    if (!channel) throw new NotFoundException('channel not found');

    return this.alertsService.previewPayload(this.mapChannel(channel), body.template);
  }

  @Post(':id/retry-delivery/:deliveryId')
  @ApiOperation({
    summary: 'Retry a failed alert delivery',
    description: 'Re-sends the alert for a specific failed delivery log entry and records a new delivery log.',
  })
  @ApiParam({ name: 'id', description: 'Alert channel ID' })
  @ApiParam({ name: 'deliveryId', description: 'AlertDeliveryLog ID to retry' })
  @ApiResponse({ status: 200, description: 'Retry result returned.' })
  @ApiResponse({ status: 404, description: 'Channel not found.' })
  async retryDelivery(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const channel = await this.prisma.alertChannel.findFirst({ where: { id, userId: req.user.id } });
    if (!channel) throw new NotFoundException('channel not found');

    return this.alertsService.retryDelivery(deliveryId, this.mapChannel(channel));
  }

  @Post(':id/retry-all-failed')
  @ApiOperation({
    summary: 'Retry all failed deliveries',
    description: 'Retries all failed delivery log entries for a channel from the last 24 hours (max 10).',
  })
  @ApiParam({ name: 'id', description: 'Alert channel ID' })
  @ApiResponse({ status: 200, description: 'Retry results returned.' })
  @ApiResponse({ status: 404, description: 'Channel not found.' })
  async retryAllFailed(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ): Promise<{ results: Array<{ deliveryId: string; success: boolean; error?: string }> }> {
    const channel = await this.prisma.alertChannel.findFirst({ where: { id, userId: req.user.id } });
    if (!channel) throw new NotFoundException('channel not found');

    const results = await this.alertsService.retryAllFailed(this.mapChannel(channel));
    return { results };
  }

  @Post('test-all')
  @ApiOperation({
    summary: 'Test all alert channels',
    description:
      'Sends a test notification through every alert channel owned by the user. ' +
      'Returns a result per channel: ok=true if the test passed, ok=false with an error message on failure.',
  })
  @ApiResponse({ status: 200, description: 'Test results per channel.' })
  async testAll(@Req() req: { user: { id: string } }) {
    const channels = await this.prisma.alertChannel.findMany({ where: { userId: req.user.id } });

    const results = await Promise.allSettled(
      channels.map(async (channel) => {
        try {
          await this.alertsService.notifyTest(this.mapChannel(channel));
          return { channelId: channel.id, name: channel.name, type: channel.type, ok: true, error: null };
        } catch (err) {
          return {
            channelId: channel.id,
            name: channel.name,
            type: channel.type,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    await this.audit.log('alert_channel.test_all', req.user.id, req.user.id, { channelCount: channels.length });

    return {
      tested: channels.length,
      results: results.map((r) => (r.status === 'fulfilled' ? r.value : { ok: false, error: String((r as PromiseRejectedResult).reason) })),
    };
  }
}
