import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlaybooksService } from './playbooks.service';
import { CreatePlaybookDto, UpdatePlaybookDto, AttachPlaybookDto, MarkStepDto } from './playbooks.dto';

@ApiTags('playbooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1')
export class PlaybooksController {
  constructor(private readonly svc: PlaybooksService) {}

  @Get('playbooks')
  @ApiOperation({ summary: 'List incident playbooks' })
  findAll(@Req() req: { user: { id: string } }) {
    return this.svc.findAll(req.user.id);
  }

  @Post('playbooks')
  @ApiOperation({ summary: 'Create incident playbook' })
  create(@Req() req: { user: { id: string } }, @Body() dto: CreatePlaybookDto) {
    return this.svc.create(req.user.id, dto);
  }

  @Get('playbooks/:id')
  @ApiOperation({ summary: 'Get single playbook' })
  findOne(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.svc.findOne(req.user.id, id);
  }

  @Patch('playbooks/:id')
  @ApiOperation({ summary: 'Update playbook' })
  update(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: UpdatePlaybookDto) {
    return this.svc.update(req.user.id, id, dto);
  }

  @Delete('playbooks/:id')
  @ApiOperation({ summary: 'Delete playbook' })
  remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.svc.delete(req.user.id, id);
  }

  @Post('monitors/:id/playbook')
  @ApiOperation({ summary: 'Attach or detach playbook from monitor' })
  attachToMonitor(
    @Req() req: { user: { id: string } },
    @Param('id') monitorId: string,
    @Body() dto: AttachPlaybookDto,
  ) {
    return this.svc.attachToMonitor(req.user.id, monitorId, dto.playbookId);
  }

  @Get('incidents/:id/playbook')
  @ApiOperation({ summary: 'Get playbook for incident' })
  getForIncident(@Req() req: { user: { id: string } }, @Param('id') incidentId: string) {
    return this.svc.getForIncident(req.user.id, incidentId);
  }

  @Patch('incidents/:id/playbook-step/:stepId')
  @ApiOperation({ summary: 'Mark playbook step done/undone' })
  markStep(
    @Req() req: { user: { id: string } },
    @Param('id') incidentId: string,
    @Param('stepId') stepId: string,
    @Body() dto: MarkStepDto,
  ) {
    return this.svc.markStep(req.user.id, incidentId, stepId, dto.done);
  }
}
