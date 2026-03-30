import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { Body, Controller, Delete, HttpCode, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../common/auth.guard';
import { RequireScope } from '../common/require-scope.decorator';
import { ScopeGuard } from '../common/scope.guard';
import { ApiKeyScope } from '../apikeys/apikeys.dto';
import { MonitorsCrudService } from './monitors-crud.service';
import { PrismaService } from '../common/prisma.service';
import { MuteMonitorDto } from './dto/mute-monitor.dto';
import { PauseMonitorDto } from './dto/pause-monitor.dto';
import { AcknowledgeMonitorDto } from './dto/acknowledge-monitor.dto';

@ApiTags('Monitors')
@ApiBearerAuth()
@UseGuards(AuthGuard, ScopeGuard)
@Controller('v1/monitors')
export class MonitorsStateController {
  constructor(
    private readonly crudService: MonitorsCrudService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Snooze ───────────────────────────────────────────────────────────

  @Post(':id/snooze')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Snooze monitor alerts', description: 'Create a maintenance window to suppress alerts for this monitor for a specified number of hours (1, 4, 8, 24, or 168).' })
  @ApiParam({ name: 'id', description: 'Monitor ID' })
  @ApiResponse({ status: 200, description: 'Snooze applied.' })
  snooze(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: { hours: number }) {
    return this.crudService.snooze(req.user.id, id, body.hours ?? 1);
  }

  // ─── Mute ─────────────────────────────────────────────────────────────

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

  // ─── Pause ────────────────────────────────────────────────────────────

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

  // ─── Acknowledge ──────────────────────────────────────────────────────

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

  // ─── Pin ──────────────────────────────────────────────────────────────

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
    return this.crudService.togglePin(req.user.id, id);
  }

  // ─── Baseline Resets ──────────────────────────────────────────────────

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

  // ─── Share Token ──────────────────────────────────────────────────────

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
}
