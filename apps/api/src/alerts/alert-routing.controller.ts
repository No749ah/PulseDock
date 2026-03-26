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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { PrismaService } from '../common/prisma.service';
import {
  CreateAlertRoutingRuleDto,
  ReorderAlertRoutingRulesDto,
  UpdateAlertRoutingRuleDto,
} from './dto/alert-routing-rule.dto';

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
}
