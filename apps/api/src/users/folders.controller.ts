import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { AuthGuard } from '../common/auth.guard';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateFolderDto, UpdateFolderDto } from './folders.dto';

class MuteFolderDto {
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes!: number;
}

@ApiTags('Folders')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/folders')
export class FoldersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List folders/projects',
    description: 'Returns all folders for the authenticated user with per-folder monitor stats (count, health summary).',
  })
  @ApiResponse({ status: 200, description: 'Folder list returned with monitor stats.' })
  async list(@Req() req: { user: { id: string } }) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [folders, monitors] = await Promise.all([
      this.prisma.folder.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.monitor.findMany({
        where: { userId: req.user.id, folderId: { not: null } },
        include: {
          runs: {
            where: { checkedAt: { gte: cutoff } },
            select: { ok: true },
            orderBy: { checkedAt: 'desc' },
            take: 100,
          },
        },
      }),
    ]);

    return folders.map((f) => {
      const folderMonitors = monitors.filter((m) => m.folderId === f.id);
      const totalMonitors = folderMonitors.length;
      const enabledMonitors = folderMonitors.filter((m) => m.enabled);

      // Compute per-monitor last status and aggregate
      let healthy = 0;
      let degraded = 0;
      let down = 0;

      for (const m of enabledMonitors) {
        if (m.runs.length === 0) {
          degraded++;
          continue;
        }
        const latestRun = m.runs[0];
        const recentRuns = m.runs.slice(0, 5);
        const failCount = recentRuns.filter((r: { ok: boolean }) => !r.ok).length;

        if (!latestRun.ok) {
          down++;
        } else if (failCount >= 2) {
          degraded++;
        } else {
          healthy++;
        }
      }

      // 24h uptime% across all monitors in folder
      const allRuns = folderMonitors.flatMap((m) => m.runs);
      const uptimePct =
        allRuns.length > 0
          ? Math.round((allRuns.filter((r: { ok: boolean }) => r.ok).length / allRuns.length) * 1000) / 10
          : null;

      const overallStatus: 'operational' | 'degraded' | 'outage' | 'empty' =
        totalMonitors === 0
          ? 'empty'
          : down > 0
            ? 'outage'
            : degraded > 0
              ? 'degraded'
              : 'operational';

      return {
        id: f.id,
        userId: f.userId,
        name: f.name,
        createdAt: f.createdAt.toISOString(),
        stats: {
          totalMonitors,
          enabledMonitors: enabledMonitors.length,
          healthy,
          degraded,
          down,
          uptimePct,
          overallStatus,
        },
      };
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create folder/project', description: 'Create a new folder to group monitors.' })
  @ApiResponse({ status: 201, description: 'Folder created.' })
  async create(@Req() req: { user: { id: string } }, @Body() body: CreateFolderDto) {
    const folder = await this.prisma.folder.create({
      data: {
        userId: req.user.id,
        name: body.name,
      },
    });
    await this.audit.log('folder.create', req.user.id, req.user.id, { folderId: folder.id, name: folder.name });
    return {
      id: folder.id,
      userId: folder.userId,
      name: folder.name,
      createdAt: folder.createdAt.toISOString(),
      stats: {
        totalMonitors: 0,
        enabledMonitors: 0,
        healthy: 0,
        degraded: 0,
        down: 0,
        uptimePct: null,
        overallStatus: 'empty' as const,
      },
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update folder/project' })
  @ApiParam({ name: 'id', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'Folder updated.' })
  @ApiResponse({ status: 404, description: 'Folder not found.' })
  async update(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: UpdateFolderDto) {
    const folder = await this.prisma.folder.findFirst({ where: { id, userId: req.user.id } });
    if (!folder) throw new NotFoundException('folder not found');

    const updated = await this.prisma.folder.update({ where: { id }, data: { name: body.name ?? folder.name } });
    await this.audit.log('folder.update', req.user.id, req.user.id, { folderId: id });
    return { id: updated.id, userId: updated.userId, name: updated.name, createdAt: updated.createdAt.toISOString() };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete folder/project' })
  @ApiParam({ name: 'id', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'Folder deleted.' })
  @ApiResponse({ status: 404, description: 'Folder not found.' })
  async remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id, userId: req.user.id } });
    if (!folder) throw new NotFoundException('folder not found');
    await this.prisma.folder.delete({ where: { id } });
    await this.audit.log('folder.delete', req.user.id, req.user.id, { folderId: id });
    return { ok: true };
  }

  @Post(':id/mute')
  @ApiOperation({
    summary: 'Mute all monitors in a folder',
    description: 'Mutes all monitors in the folder for the given number of minutes (1–1440). Alert delivery is suppressed on all monitors in the folder until the mute expires.',
  })
  @ApiParam({ name: 'id', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'All monitors in folder muted. Returns count and mutedUntil.' })
  @ApiResponse({ status: 404, description: 'Folder not found.' })
  async muteFolder(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: MuteFolderDto) {
    const folder = await this.prisma.folder.findFirst({ where: { id, userId: req.user.id } });
    if (!folder) throw new NotFoundException('folder not found');

    const mutedUntil = new Date(Date.now() + body.minutes * 60_000);
    const result = await this.prisma.monitor.updateMany({
      where: { folderId: id, userId: req.user.id },
      data: { mutedUntil },
    });

    await this.audit.log('folder.mute', req.user.id, req.user.id, {
      folderId: id,
      folderName: folder.name,
      minutes: body.minutes,
      monitorCount: result.count,
    });

    return { ok: true, mutedUntil: mutedUntil.toISOString(), monitorCount: result.count };
  }

  @Delete(':id/mute')
  @ApiOperation({
    summary: 'Unmute all monitors in a folder',
    description: 'Clears the mute on all monitors in the folder, re-enabling alert delivery.',
  })
  @ApiParam({ name: 'id', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'All monitors in folder unmuted.' })
  @ApiResponse({ status: 404, description: 'Folder not found.' })
  async unmuteFolder(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id, userId: req.user.id } });
    if (!folder) throw new NotFoundException('folder not found');

    const result = await this.prisma.monitor.updateMany({
      where: { folderId: id, userId: req.user.id },
      data: { mutedUntil: null },
    });

    await this.audit.log('folder.unmute', req.user.id, req.user.id, {
      folderId: id,
      folderName: folder.name,
      monitorCount: result.count,
    });

    return { ok: true, monitorCount: result.count };
  }

  @Get(':id/mute-status')
  @ApiOperation({
    summary: 'Get mute status for all monitors in a folder',
    description: 'Returns mute status for each monitor in the folder, plus a summary of how many are muted.',
  })
  @ApiParam({ name: 'id', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'Mute status returned.' })
  @ApiResponse({ status: 404, description: 'Folder not found.' })
  async getFolderMuteStatus(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id, userId: req.user.id } });
    if (!folder) throw new NotFoundException('folder not found');

    const monitors = await this.prisma.monitor.findMany({
      where: { folderId: id, userId: req.user.id },
      select: { id: true, name: true, mutedUntil: true, enabled: true },
    });

    const now = new Date();
    const monitorsWithStatus = monitors.map((m) => ({
      id: m.id,
      name: m.name,
      enabled: m.enabled,
      isMuted: m.mutedUntil != null && m.mutedUntil > now,
      mutedUntil: m.mutedUntil?.toISOString() ?? null,
    }));

    const mutedCount = monitorsWithStatus.filter((m) => m.isMuted).length;
    const allMuted = monitors.length > 0 && mutedCount === monitors.length;
    const anyMuted = mutedCount > 0;

    return {
      folderId: id,
      folderName: folder.name,
      totalMonitors: monitors.length,
      mutedCount,
      allMuted,
      anyMuted,
      monitors: monitorsWithStatus,
    };
  }
}
