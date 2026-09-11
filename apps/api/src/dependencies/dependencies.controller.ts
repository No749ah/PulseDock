import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DependenciesService } from './dependencies.service';
import { SetDependenciesDto } from './dependencies.dto';

@ApiTags('dependencies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1')
export class DependenciesController {
  constructor(private readonly svc: DependenciesService) {}

  @Get('dependencies/graph')
  @ApiOperation({ summary: 'Get full dependency graph for all monitors' })
  getGraph(@Req() req: { user: { id: string } }) {
    return this.svc.getDependencyGraph(req.user.id);
  }

  @Get('monitors/:id/dependencies')
  @ApiOperation({ summary: 'Get dependencies for a monitor' })
  getDependencies(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.svc.getDependenciesForMonitor(req.user.id, id);
  }

  @Post('monitors/:id/dependencies')
  @ApiOperation({ summary: 'Set all dependencies for a monitor (replaces existing)' })
  setDependencies(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: SetDependenciesDto,
  ) {
    return this.svc.setDependencies(req.user.id, id, dto);
  }

  @Delete('monitors/:id/dependencies/:dependsOnId')
  @ApiOperation({ summary: 'Remove a single dependency' })
  removeDependency(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('dependsOnId') dependsOnId: string,
  ) {
    return this.svc.removeDependency(req.user.id, id, dependsOnId);
  }

  @Get('monitors/:id/impact')
  @ApiOperation({ summary: 'Get impact analysis for a monitor' })
  getImpact(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.svc.getImpactAnalysis(req.user.id, id);
  }
}
