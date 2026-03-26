import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { AuthGuard } from '../common/auth.guard';
import { PrismaService } from '../common/prisma.service';
import {
  CreateAlertRoutingRuleDto,
  ReorderAlertRoutingRulesDto,
  UpdateAlertRoutingRuleDto,
} from './dto/alert-routing-rule.dto';

export class SimulateRoutingDto {
  @IsString()
  monitorId!: string;

  @IsString()
  @IsIn(['green', 'yellow', 'red'])
  level!: string;
}

@ApiTags('Alert Routing Rules')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/alert-routing-rules')
export class AlertRoutingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List alert routing rules ordered by priority' })
  async list(@Req() req: { user: { id: string } }) {
    return this.prisma.alertRoutingRule.findMany({
      where: { userId: req.user.id },
      orderBy: { priority: 'asc' },
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new alert routing rule' })
  async create(@Req() req: { user: { id: string } }, @Body() dto: CreateAlertRoutingRuleDto) {
    const rule = await this.prisma.alertRoutingRule.create({
      data: {
        userId: req.user.id,
        name: dto.name,
        description: dto.description ?? null,
        enabled: dto.enabled ?? true,
        priority: dto.priority ?? 0,
        matchTags: dto.matchTags ?? [],
        matchTypes: dto.matchTypes ?? [],
        matchFolderIds: dto.matchFolderIds ?? [],
        matchLevels: dto.matchLevels ?? [],
        matchMonitorIds: dto.matchMonitorIds ?? [],
        channelIds: dto.channelIds,
        overrideNotifyOn: dto.overrideNotifyOn ?? null,
      },
    });
    return rule;
  }

  @Patch('reorder')
  @ApiOperation({ summary: 'Reorder rules by assigning priority values' })
  async reorder(@Req() req: { user: { id: string } }, @Body() dto: ReorderAlertRoutingRulesDto) {
    // Verify all rules belong to the user
    const rules = await this.prisma.alertRoutingRule.findMany({
      where: { id: { in: dto.ids }, userId: req.user.id },
      select: { id: true },
    });
    const ownedIds = new Set(rules.map((r) => r.id));
    for (const id of dto.ids) {
      if (!ownedIds.has(id)) {
        throw new ForbiddenException(`Rule ${id} not found or access denied`);
      }
    }

    await Promise.all(
      dto.ids.map((id, index) =>
        this.prisma.alertRoutingRule.update({
          where: { id },
          data: { priority: index },
        }),
      ),
    );

    return this.prisma.alertRoutingRule.findMany({
      where: { userId: req.user.id },
      orderBy: { priority: 'asc' },
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an alert routing rule' })
  async update(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateAlertRoutingRuleDto,
  ) {
    const existing = await this.prisma.alertRoutingRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Rule not found');
    if (existing.userId !== req.user.id) throw new ForbiddenException('Access denied');

    return this.prisma.alertRoutingRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.matchTags !== undefined && { matchTags: dto.matchTags }),
        ...(dto.matchTypes !== undefined && { matchTypes: dto.matchTypes }),
        ...(dto.matchFolderIds !== undefined && { matchFolderIds: dto.matchFolderIds }),
        ...(dto.matchLevels !== undefined && { matchLevels: dto.matchLevels }),
        ...(dto.matchMonitorIds !== undefined && { matchMonitorIds: dto.matchMonitorIds }),
        ...(dto.channelIds !== undefined && { channelIds: dto.channelIds }),
        ...(dto.overrideNotifyOn !== undefined && { overrideNotifyOn: dto.overrideNotifyOn || null }),
      },
    });
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Toggle a routing rule enabled/disabled' })
  async toggle(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const existing = await this.prisma.alertRoutingRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Rule not found');
    if (existing.userId !== req.user.id) throw new ForbiddenException('Access denied');

    return this.prisma.alertRoutingRule.update({
      where: { id },
      data: { enabled: !existing.enabled },
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an alert routing rule' })
  async delete(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const existing = await this.prisma.alertRoutingRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Rule not found');
    if (existing.userId !== req.user.id) throw new ForbiddenException('Access denied');

    await this.prisma.alertRoutingRule.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Simulate which routing rules would match and which channels would receive
   * an alert for a given monitor + level combination.
   * Useful for testing routing rules before going live.
   */
  @Post('simulate')
  @ApiOperation({
    summary: 'Simulate alert routing',
    description:
      'Dry-runs all routing rules for a given monitor + alert level. Returns matching rules and the channels they would route to, without sending any actual notifications.',
  })
  @ApiResponse({ status: 200, description: 'Simulation result returned.' })
  @ApiResponse({ status: 404, description: 'Monitor not found.' })
  async simulate(@Req() req: { user: { id: string } }, @Body() dto: SimulateRoutingDto) {
    // Load the monitor
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: dto.monitorId, userId: req.user.id },
      select: { id: true, name: true, type: true, folderId: true },
    });
    if (!monitor) throw new NotFoundException('Monitor not found');

    // Load all enabled routing rules for this user
    const rules = await this.prisma.alertRoutingRule.findMany({
      where: { userId: req.user.id, enabled: true },
      orderBy: { priority: 'asc' },
    });

    // Load monitor tags for tag-based matching
    let monitorTagNames: string[] = [];
    if (rules.some((r) => r.matchTags.length > 0)) {
      const tagRows = await this.prisma.monitorTag.findMany({
        where: { monitorId: monitor.id },
        include: { tag: { select: { name: true } } },
      });
      monitorTagNames = tagRows.map((t) => t.tag.name);
    }

    // Evaluate each rule
    const ruleResults = rules.map((rule) => {
      const checks: Array<{ condition: string; passed: boolean; reason: string }> = [];

      if (rule.matchMonitorIds.length > 0) {
        const passed = rule.matchMonitorIds.includes(monitor.id);
        checks.push({ condition: 'matchMonitorIds', passed, reason: passed ? `Monitor ID in list` : `Monitor ID not in [${rule.matchMonitorIds.join(', ')}]` });
      }
      if (rule.matchTypes.length > 0) {
        const passed = rule.matchTypes.includes(monitor.type);
        checks.push({ condition: 'matchTypes', passed, reason: passed ? `Type "${monitor.type}" matched` : `Type "${monitor.type}" not in [${rule.matchTypes.join(', ')}]` });
      }
      if (rule.matchLevels.length > 0) {
        const passed = rule.matchLevels.includes(dto.level);
        checks.push({ condition: 'matchLevels', passed, reason: passed ? `Level "${dto.level}" matched` : `Level "${dto.level}" not in [${rule.matchLevels.join(', ')}]` });
      }
      if (rule.matchFolderIds.length > 0) {
        const passed = !!monitor.folderId && rule.matchFolderIds.includes(monitor.folderId);
        checks.push({ condition: 'matchFolderIds', passed, reason: passed ? `Folder ID matched` : monitor.folderId ? `Folder ID not in list` : `Monitor has no folder` });
      }
      if (rule.matchTags.length > 0) {
        const passed = rule.matchTags.some((t) => monitorTagNames.includes(t));
        checks.push({
          condition: 'matchTags',
          passed,
          reason: passed
            ? `Tag "${rule.matchTags.find((t) => monitorTagNames.includes(t))}" matched`
            : `None of tags [${rule.matchTags.join(', ')}] on monitor (has: [${monitorTagNames.join(', ')}])`,
        });
      }

      const matched = checks.length === 0 || checks.every((c) => c.passed);
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        priority: rule.priority,
        matched,
        checks,
        channelIds: matched ? rule.channelIds : [],
      };
    });

    const matchedRules = ruleResults.filter((r) => r.matched);
    const routedChannelIds = [...new Set(matchedRules.flatMap((r) => r.channelIds))];

    // Load channel metadata for context
    const channels = routedChannelIds.length > 0
      ? await this.prisma.alertChannel.findMany({
          where: { id: { in: routedChannelIds }, userId: req.user.id },
          select: { id: true, name: true, type: true },
        })
      : [];

    // Also load the monitor's directly-linked channels (fallback when no rules match)
    const directLinks = matchedRules.length === 0
      ? await this.prisma.monitorAlert.findMany({
          where: { monitorId: monitor.id },
          include: { alertChannel: { select: { id: true, name: true, type: true } } },
        })
      : [];

    return {
      monitor: { id: monitor.id, name: monitor.name, type: monitor.type, folderId: monitor.folderId },
      simulatedLevel: dto.level,
      monitorTags: monitorTagNames,
      totalRules: rules.length,
      matchedRulesCount: matchedRules.length,
      routing: ruleResults,
      routedChannels: channels,
      // If no rules matched, the system falls back to the monitor's directly-linked channels
      fallback: matchedRules.length === 0 ? {
        active: true,
        description: 'No routing rules matched — alert would go to channels directly linked to this monitor.',
        channels: directLinks.map((l) => ({ id: l.alertChannel.id, name: l.alertChannel.name, type: l.alertChannel.type })),
      } : null,
    };
  }
}
