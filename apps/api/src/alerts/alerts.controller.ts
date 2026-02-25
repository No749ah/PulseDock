import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { AlertsService } from './alerts.service';
import type { AlertChannelType } from '../types';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateAlertChannelDto, TestAlertChannelDto, UpdateAlertChannelDto } from './alerts.dto';

@UseGuards(AuthGuard)
@Controller('v1/alert-channels')
export class AlertsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertsService: AlertsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
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
  async create(
    @Req() req: { user: { id: string } },
    @Body() body: CreateAlertChannelDto,
  ) {
    const channel = await this.prisma.alertChannel.create({
      data: {
        userId: req.user.id,
        name: body.name,
        type: body.type,
        configJson: (body.config ?? {}) as any,
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
  async update(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: UpdateAlertChannelDto) {
    const current = await this.prisma.alertChannel.findFirst({ where: { id, userId: req.user.id } });
    if (!current) throw new NotFoundException('channel not found');

    const updated = await this.prisma.alertChannel.update({
      where: { id },
      data: {
        name: body.name ?? current.name,
        type: body.type ?? current.type,
        configJson: (body.config ?? current.configJson) as any,
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
  async remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const current = await this.prisma.alertChannel.findFirst({ where: { id, userId: req.user.id } });
    if (!current) throw new NotFoundException('channel not found');

    await this.prisma.monitorAlert.deleteMany({ where: { alertChannelId: id } });
    await this.prisma.alertChannel.delete({ where: { id } });
    await this.audit.log('alert_channel.delete', req.user.id, req.user.id, { channelId: id });
    return { ok: true };
  }

  @Post('test')
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
