import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { MonitorsService } from './monitors.service';
import { CreateMonitorDto, DiscoverVersionDto, RunMonitorDto, TestVersionConnectionDto, UpdateMonitorDto } from './monitors.dto';

@UseGuards(AuthGuard)
@Controller('v1/monitors')
export class MonitorsController {
  constructor(private readonly monitorsService: MonitorsService) {}

  @Get()
  list(@Req() req: { user: { id: string } }) {
    return this.monitorsService.list(req.user.id);
  }

  @Post()
  create(
    @Req() req: { user: { id: string } },
    @Body() body: CreateMonitorDto,
  ) {
    return this.monitorsService.create(req.user.id, body);
  }

  @Patch(':id')
  update(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: UpdateMonitorDto) {
    return this.monitorsService.update(req.user.id, id, body);
  }

  @Delete(':id')
  remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.monitorsService.remove(req.user.id, id);
  }

  @Post('run')
  runNow(@Req() req: { user: { id: string } }, @Body() body: RunMonitorDto) {
    return this.monitorsService.runNow(req.user.id, body.monitorId);
  }

  @Post('version-test')
  versionTest(@Body() body: TestVersionConnectionDto) {
    return this.monitorsService.testVersionConnection(body);
  }

  @Post('version-discover')
  versionDiscover(@Body() body: DiscoverVersionDto) {
    return this.monitorsService.discoverCurrentVersion(body);
  }

  @Get('runs')
  getRecentRuns(
    @Req() req: { user: { id: string } },
    @Query('limit') limit?: string,
  ) {
    return this.monitorsService.getRecentRuns(req.user.id, Number(limit) || 10);
  }

  @Get(':id/runs')
  monitorRuns(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.monitorsService.monitorRuns(req.user.id, id);
  }

  @Get('version-summary')
  versionSummary(@Req() req: { user: { id: string } }) {
    return this.monitorsService.versionSummary(req.user.id);
  }
}
