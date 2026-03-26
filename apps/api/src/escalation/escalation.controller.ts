import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { EscalationService } from './escalation.service';
import { CreateEscalationPolicyDto, UpdateEscalationPolicyDto } from './escalation.dto';

@ApiTags('escalation')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/escalation-policies')
export class EscalationController {
  constructor(private readonly service: EscalationService) {}

  @Get()
  @ApiOperation({ summary: 'List escalation policies', description: 'Returns all escalation policies for the authenticated user.' })
  @ApiResponse({ status: 200, description: 'List of escalation policies' })
  list(@Req() req: { user: { id: string } }) {
    return this.service.list(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get escalation policy', description: 'Returns a single escalation policy by ID.' })
  @ApiParam({ name: 'id', description: 'Escalation policy ID' })
  @ApiResponse({ status: 200, description: 'Escalation policy found' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.service.findOne(req.user.id, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create escalation policy', description: 'Creates a new escalation policy with configurable steps.' })
  @ApiResponse({ status: 201, description: 'Policy created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  create(@Req() req: { user: { id: string } }, @Body() dto: CreateEscalationPolicyDto) {
    return this.service.create(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update escalation policy', description: 'Updates name or steps of an existing escalation policy.' })
  @ApiParam({ name: 'id', description: 'Escalation policy ID' })
  @ApiResponse({ status: 200, description: 'Policy updated' })
  @ApiResponse({ status: 404, description: 'Not found' })
  update(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateEscalationPolicyDto,
  ) {
    return this.service.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete escalation policy', description: 'Deletes an escalation policy. Existing MonitorAlert links will have escalation policy cleared.' })
  @ApiParam({ name: 'id', description: 'Escalation policy ID' })
  @ApiResponse({ status: 204, description: 'Policy deleted' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    await this.service.remove(req.user.id, id);
  }
}
