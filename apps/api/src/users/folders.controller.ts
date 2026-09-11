import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { AuthGuard } from '../common/auth.guard';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateFolderDto, MoveFolderDto, UpdateFolderDto } from './folders.dto';

class MuteFolderDto {
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes!: number;
}

/** Max nesting depth to prevent unbounded recursion */
const MAX_DEPTH = 5;

interface FolderNode {
  id: string;
  userId: string;
  parentId: string | null;
  name: string;
  position: number;
  createdAt: string;
  depth: number;
  path: string[];
  stats: {
    totalMonitors: number;
    enabledMonitors: number;
    healthy: number;
    degraded: number;
    down: number;
    uptimePct: number | null;
    overallStatus: 'operational' | 'degraded' | 'outage' | 'empty';
  };
  children: FolderNode[];
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

  /**
   * Build a tree from a flat list of folders.
   * Each node gets: depth, path (ancestor names), children, stats.
   */
  private buildTree(
    folders: Array<{ id: string; userId: string; parentId: string | null; name: string; position: number; createdAt: Date }>,
    monitorsByFolder: Map<string, Array<{ enabled: boolean; runs: Array<{ ok: boolean }> }>>,
  ): FolderNode[] {
    const nodeMap = new Map<string, FolderNode>();

    // Create nodes
    for (const f of folders) {
      const folderMonitors = monitorsByFolder.get(f.id) ?? [];
      const enabledMonitors = folderMonitors.filter((m) => m.enabled);
      let healthy = 0;
      let degraded = 0;
      let down = 0;

      for (const m of enabledMonitors) {
        if (m.runs.length === 0) { degraded++; continue; }
        const recentRuns = m.runs.slice(0, 5);
        const failCount = recentRuns.filter((r) => !r.ok).length;
        if (!m.runs[0].ok) down++;
        else if (failCount >= 2) degraded++;
        else healthy++;
      }

      const allRuns = folderMonitors.flatMap((m) => m.runs);
      const uptimePct = allRuns.length > 0
        ? Math.round((allRuns.filter((r) => r.ok).length / allRuns.length) * 1000) / 10
        : null;

      const overallStatus: 'operational' | 'degraded' | 'outage' | 'empty' =
        folderMonitors.length === 0 ? 'empty'
          : down > 0 ? 'outage'
            : degraded > 0 ? 'degraded'
              : 'operational';

      nodeMap.set(f.id, {
        id: f.id,
        userId: f.userId,
        parentId: f.parentId,
        name: f.name,
        position: f.position,
        createdAt: f.createdAt.toISOString(),
        depth: 0,
        path: [],
        stats: {
          totalMonitors: folderMonitors.length,
          enabledMonitors: enabledMonitors.length,
          healthy, degraded, down, uptimePct, overallStatus,
        },
        children: [],
      });
    }

    // Build tree
    const roots: FolderNode[] = [];
    for (const node of nodeMap.values()) {
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // Compute depth + path, sort children
    const walk = (nodes: FolderNode[], depth: number, pathNames: string[]) => {
      nodes.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
      for (const n of nodes) {
        n.depth = depth;
        n.path = [...pathNames, n.name];
        walk(n.children, depth + 1, n.path);

        // Bubble up child stats to parent
        for (const child of n.children) {
          n.stats.totalMonitors += child.stats.totalMonitors;
          n.stats.enabledMonitors += child.stats.enabledMonitors;
          n.stats.healthy += child.stats.healthy;
          n.stats.degraded += child.stats.degraded;
          n.stats.down += child.stats.down;
        }
        // Recalculate overall status after bubbling
        if (n.stats.totalMonitors > 0) {
          n.stats.overallStatus = n.stats.down > 0 ? 'outage'
            : n.stats.degraded > 0 ? 'degraded'
              : 'operational';
        }
      }
    };
    walk(roots, 0, []);

    return roots;
  }

  /**
   * Check if moving folderId under newParentId would create a cycle.
   */
  private async wouldCreateCycle(userId: string, folderId: string, newParentId: string | null): Promise<boolean> {
    if (!newParentId) return false;
    if (newParentId === folderId) return true;

    const folders = await this.prisma.folder.findMany({
      where: { userId },
      select: { id: true, parentId: true },
    });
    const parentMap = new Map(folders.map((f) => [f.id, f.parentId]));

    // Walk up from newParentId — if we reach folderId, it's a cycle
    let current: string | null | undefined = newParentId;
    const visited = new Set<string>();
    while (current) {
      if (current === folderId) return true;
      if (visited.has(current)) return true; // existing cycle protection
      visited.add(current);
      current = parentMap.get(current) ?? null;
    }
    return false;
  }

  /**
   * Get depth of a folder by walking up parentId chain.
   */
  private async getDepth(userId: string, folderId: string | null): Promise<number> {
    if (!folderId) return 0;
    const folders = await this.prisma.folder.findMany({
      where: { userId },
      select: { id: true, parentId: true },
    });
    const parentMap = new Map(folders.map((f) => [f.id, f.parentId]));

    let depth = 0;
    let current: string | null | undefined = folderId;
    while (current) {
      depth++;
      current = parentMap.get(current) ?? null;
    }
    return depth;
  }

  @Get()
  @ApiOperation({
    summary: 'List folders as tree',
    description: 'Returns all folders for the authenticated user as a nested tree with per-folder and aggregated monitor stats. Stats bubble up from children to parents.',
  })
  @ApiResponse({ status: 200, description: 'Folder tree returned with monitor stats.' })
  async list(@Req() req: { user: { id: string } }) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [folders, monitors] = await Promise.all([
      this.prisma.folder.findMany({ where: { userId: req.user.id }, orderBy: { position: 'asc' } }),
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

    const monitorsByFolder = new Map<string, Array<{ enabled: boolean; runs: Array<{ ok: boolean }> }>>();
    for (const m of monitors) {
      if (!m.folderId) continue;
      const list = monitorsByFolder.get(m.folderId) ?? [];
      list.push({ enabled: m.enabled, runs: m.runs });
      monitorsByFolder.set(m.folderId, list);
    }

    return this.buildTree(folders, monitorsByFolder);
  }

  @Get('flat')
  @ApiOperation({
    summary: 'List folders flat',
    description: 'Returns all folders as a flat list with depth and path info. Useful for dropdowns/selectors.',
  })
  @ApiResponse({ status: 200, description: 'Flat folder list returned.' })
  async listFlat(@Req() req: { user: { id: string } }) {
    const folders = await this.prisma.folder.findMany({
      where: { userId: req.user.id },
      orderBy: { position: 'asc' },
      include: { _count: { select: { monitors: true } } },
    });

    // Build path info
    const parentMap = new Map(folders.map((f) => [f.id, f.parentId]));
    const nameMap = new Map(folders.map((f) => [f.id, f.name]));

    const getPath = (id: string): string[] => {
      const parts: string[] = [];
      let current: string | null | undefined = id;
      while (current) {
        parts.unshift(nameMap.get(current) ?? '');
        current = parentMap.get(current) ?? null;
      }
      return parts;
    };

    const getDepth = (id: string): number => {
      let depth = 0;
      let current: string | null | undefined = parentMap.get(id) ?? null;
      while (current) {
        depth++;
        current = parentMap.get(current) ?? null;
      }
      return depth;
    };

    return folders.map((f) => ({
      id: f.id,
      parentId: f.parentId,
      name: f.name,
      position: f.position,
      depth: getDepth(f.id),
      path: getPath(f.id),
      pathString: getPath(f.id).join(' / '),
      monitorCount: f._count.monitors,
      createdAt: f.createdAt.toISOString(),
    }));
  }

  @Post()
  @ApiOperation({ summary: 'Create folder', description: 'Create a new folder. Optionally nest it under a parent folder (max depth: 5).' })
  @ApiResponse({ status: 201, description: 'Folder created.' })
  @ApiResponse({ status: 400, description: 'Max nesting depth exceeded or parent not found.' })
  async create(@Req() req: { user: { id: string } }, @Body() body: CreateFolderDto) {
    // Validate parent exists and check depth
    if (body.parentId) {
      const parent = await this.prisma.folder.findFirst({ where: { id: body.parentId, userId: req.user.id } });
      if (!parent) throw new NotFoundException('Parent folder not found');

      const parentDepth = await this.getDepth(req.user.id, body.parentId);
      if (parentDepth >= MAX_DEPTH) {
        throw new BadRequestException(`Max nesting depth of ${MAX_DEPTH} exceeded`);
      }
    }

    const folder = await this.prisma.folder.create({
      data: {
        userId: req.user.id,
        name: body.name,
        parentId: body.parentId ?? null,
      },
    });
    await this.audit.log('folder.create', req.user.id, req.user.id, {
      folderId: folder.id,
      name: folder.name,
      parentId: folder.parentId,
    });
    return {
      id: folder.id,
      userId: folder.userId,
      parentId: folder.parentId,
      name: folder.name,
      position: folder.position,
      createdAt: folder.createdAt.toISOString(),
      depth: body.parentId ? (await this.getDepth(req.user.id, folder.id)) - 1 : 0,
      stats: {
        totalMonitors: 0,
        enabledMonitors: 0,
        healthy: 0,
        degraded: 0,
        down: 0,
        uptimePct: null,
        overallStatus: 'empty' as const,
      },
      children: [],
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update folder', description: 'Update folder name, parent, or position. Validates against circular references and max depth.' })
  @ApiParam({ name: 'id', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'Folder updated.' })
  @ApiResponse({ status: 400, description: 'Circular reference or max depth exceeded.' })
  @ApiResponse({ status: 404, description: 'Folder not found.' })
  async update(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: UpdateFolderDto) {
    const folder = await this.prisma.folder.findFirst({ where: { id, userId: req.user.id } });
    if (!folder) throw new NotFoundException('Folder not found');

    // Validate parentId change
    if (body.parentId !== undefined) {
      if (body.parentId !== null) {
        const parent = await this.prisma.folder.findFirst({ where: { id: body.parentId, userId: req.user.id } });
        if (!parent) throw new NotFoundException('Parent folder not found');

        if (await this.wouldCreateCycle(req.user.id, id, body.parentId)) {
          throw new BadRequestException('Cannot move folder into its own descendant (circular reference)');
        }

        const parentDepth = await this.getDepth(req.user.id, body.parentId);
        if (parentDepth >= MAX_DEPTH) {
          throw new BadRequestException(`Max nesting depth of ${MAX_DEPTH} exceeded`);
        }
      }
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.parentId !== undefined) data.parentId = body.parentId;
    if (body.position !== undefined) data.position = body.position;

    const updated = await this.prisma.folder.update({ where: { id }, data });
    await this.audit.log('folder.update', req.user.id, req.user.id, {
      folderId: id,
      changes: Object.keys(data),
    });

    return {
      id: updated.id,
      userId: updated.userId,
      parentId: updated.parentId,
      name: updated.name,
      position: updated.position,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  @Post(':id/move')
  @ApiOperation({
    summary: 'Move folder to new parent',
    description: 'Move a folder (and all its children) to a new parent or to root. Validates circular references and max depth.',
  })
  @ApiParam({ name: 'id', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'Folder moved.' })
  @ApiResponse({ status: 400, description: 'Circular reference or max depth exceeded.' })
  @ApiResponse({ status: 404, description: 'Folder not found.' })
  async move(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: MoveFolderDto) {
    const folder = await this.prisma.folder.findFirst({ where: { id, userId: req.user.id } });
    if (!folder) throw new NotFoundException('Folder not found');

    const newParentId = body.parentId ?? null;

    if (newParentId) {
      const parent = await this.prisma.folder.findFirst({ where: { id: newParentId, userId: req.user.id } });
      if (!parent) throw new NotFoundException('Target parent folder not found');

      if (await this.wouldCreateCycle(req.user.id, id, newParentId)) {
        throw new BadRequestException('Cannot move folder into its own descendant');
      }

      const parentDepth = await this.getDepth(req.user.id, newParentId);
      if (parentDepth >= MAX_DEPTH) {
        throw new BadRequestException(`Max nesting depth of ${MAX_DEPTH} exceeded`);
      }
    }

    const data: Record<string, unknown> = { parentId: newParentId };
    if (body.position !== undefined) data.position = body.position;

    const updated = await this.prisma.folder.update({ where: { id }, data });
    await this.audit.log('folder.move', req.user.id, req.user.id, {
      folderId: id,
      fromParentId: folder.parentId,
      toParentId: newParentId,
    });

    return {
      id: updated.id,
      parentId: updated.parentId,
      name: updated.name,
      position: updated.position,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete folder', description: 'Delete a folder. Child folders and their monitors are also deleted (cascade).' })
  @ApiParam({ name: 'id', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'Folder deleted.' })
  @ApiResponse({ status: 404, description: 'Folder not found.' })
  async remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id, userId: req.user.id } });
    if (!folder) throw new NotFoundException('Folder not found');

    // Unlink monitors from this folder and all children before delete
    // (prevents cascade deleting monitors — they should become "unfiled")
    const allFolderIds = await this.getDescendantIds(req.user.id, id);
    allFolderIds.push(id);

    await this.prisma.monitor.updateMany({
      where: { userId: req.user.id, folderId: { in: allFolderIds } },
      data: { folderId: null },
    });

    await this.prisma.folder.delete({ where: { id } });
    await this.audit.log('folder.delete', req.user.id, req.user.id, {
      folderId: id,
      deletedFolderCount: allFolderIds.length,
    });
    return { ok: true, unfiledMonitors: true };
  }

  private async getDescendantIds(userId: string, parentId: string): Promise<string[]> {
    const children = await this.prisma.folder.findMany({
      where: { userId, parentId },
      select: { id: true },
    });
    const ids: string[] = [];
    for (const child of children) {
      ids.push(child.id);
      const grandchildren = await this.getDescendantIds(userId, child.id);
      ids.push(...grandchildren);
    }
    return ids;
  }

  @Post(':id/mute')
  @ApiOperation({
    summary: 'Mute all monitors in a folder (and subfolders)',
    description: 'Mutes all monitors in the folder and its subfolders for the given number of minutes (1–1440).',
  })
  @ApiParam({ name: 'id', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'All monitors in folder tree muted.' })
  @ApiResponse({ status: 404, description: 'Folder not found.' })
  async muteFolder(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: MuteFolderDto) {
    const folder = await this.prisma.folder.findFirst({ where: { id, userId: req.user.id } });
    if (!folder) throw new NotFoundException('Folder not found');

    const allFolderIds = [id, ...(await this.getDescendantIds(req.user.id, id))];
    const mutedUntil = new Date(Date.now() + body.minutes * 60_000);
    const result = await this.prisma.monitor.updateMany({
      where: { folderId: { in: allFolderIds }, userId: req.user.id },
      data: { mutedUntil },
    });

    await this.audit.log('folder.mute', req.user.id, req.user.id, {
      folderId: id,
      folderName: folder.name,
      minutes: body.minutes,
      monitorCount: result.count,
      includedSubfolders: allFolderIds.length - 1,
    });

    return { ok: true, mutedUntil: mutedUntil.toISOString(), monitorCount: result.count };
  }

  @Delete(':id/mute')
  @ApiOperation({
    summary: 'Unmute all monitors in a folder (and subfolders)',
    description: 'Clears mute on all monitors in the folder and its subfolders.',
  })
  @ApiParam({ name: 'id', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'All monitors in folder tree unmuted.' })
  @ApiResponse({ status: 404, description: 'Folder not found.' })
  async unmuteFolder(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id, userId: req.user.id } });
    if (!folder) throw new NotFoundException('Folder not found');

    const allFolderIds = [id, ...(await this.getDescendantIds(req.user.id, id))];
    const result = await this.prisma.monitor.updateMany({
      where: { folderId: { in: allFolderIds }, userId: req.user.id },
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
    summary: 'Get mute status for all monitors in a folder tree',
    description: 'Returns mute status for each monitor in the folder and its subfolders.',
  })
  @ApiParam({ name: 'id', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'Mute status returned.' })
  @ApiResponse({ status: 404, description: 'Folder not found.' })
  async getFolderMuteStatus(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id, userId: req.user.id } });
    if (!folder) throw new NotFoundException('Folder not found');

    const allFolderIds = [id, ...(await this.getDescendantIds(req.user.id, id))];
    const monitors = await this.prisma.monitor.findMany({
      where: { folderId: { in: allFolderIds }, userId: req.user.id },
      select: { id: true, name: true, folderId: true, mutedUntil: true, enabled: true },
    });

    const now = new Date();
    const monitorsWithStatus = monitors.map((m) => ({
      id: m.id,
      name: m.name,
      folderId: m.folderId,
      enabled: m.enabled,
      isMuted: m.mutedUntil != null && m.mutedUntil > now,
      mutedUntil: m.mutedUntil?.toISOString() ?? null,
    }));

    const mutedCount = monitorsWithStatus.filter((m) => m.isMuted).length;

    return {
      folderId: id,
      folderName: folder.name,
      totalMonitors: monitors.length,
      includedSubfolders: allFolderIds.length - 1,
      mutedCount,
      allMuted: monitors.length > 0 && mutedCount === monitors.length,
      anyMuted: mutedCount > 0,
      monitors: monitorsWithStatus,
    };
  }
}
