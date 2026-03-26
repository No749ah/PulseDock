import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { AuthGuard } from '../common/auth.guard';
import { AlertsService } from './alerts.service';
import type { AlertChannelType } from '../types';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { PlanService } from '../settings/plan.service';
import { CreateAlertChannelDto, TestAlertChannelDto, UpdateAlertChannelDto } from './alerts.dto';

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

  @Get()
  @ApiOperation({ summary: 'List alert channels', description: 'Returns all configured alert channels for the authenticated user.' })
  @ApiResponse({ status: 200, description: 'Alert channels returned.' })
  async list(@Req() req: { user: { id: string } }) {
    const channels = await this.prisma.alertChannel.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
    return channels.map((c) => ({
      id: c.id,
      userId: c.userId,
      name: c.name,
      type: c.type,
      config: (c.configJson as Record<string, unknown>) ?? {},
      createdAt: c.createdAt.toISOString(),
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
    const channel = await this.prisma.alertChannel.create({
      data: {
        userId: req.user.id,
        name: body.name,
        type: body.type,
        configJson: (body.config ?? {}) as Prisma.InputJsonValue,
      },
    });

    await this.audit.log('alert_channel.create', req.user.id, req.user.id, { channelId: channel.id, type: channel.type });

    return {
      id: channel.id,
      userId: channel.userId,
      name: channel.name,
      type: channel.type,
      config: (channel.configJson as Record<string, unknown>) ?? {},
      createdAt: channel.createdAt.toISOString(),
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

    const updated = await this.prisma.alertChannel.update({
      where: { id },
      data: {
        name: body.name ?? current.name,
        type: body.type ?? current.type,
        configJson: (body.config ?? current.configJson) as Prisma.InputJsonValue,
      },
    });

    await this.audit.log('alert_channel.update', req.user.id, req.user.id, { channelId: id });
    return {
      id: updated.id,
      userId: updated.userId,
      name: updated.name,
      type: updated.type,
      config: (updated.configJson as Record<string, unknown>) ?? {},
      createdAt: updated.createdAt.toISOString(),
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
      })),
    };
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
    await this.alertsService.notifyTest({
      id: channel.id,
      userId: channel.userId,
      name: channel.name,
      type: channel.type as AlertChannelType,
      config: (channel.configJson as Record<string, unknown>) ?? {},
      createdAt: channel.createdAt.toISOString(),
    });
    return { ok: true };
  }
}
