import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { CreateMaintenanceWindowDto, UpdateMaintenanceWindowDto } from './maintenance.dto';
import { MaintenanceService } from './maintenance.service';

import { AuthenticatedRequest } from '../common/auth.types';

@ApiTags('Maintenance Windows')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/maintenance')
export class MaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

  @Get('effectiveness')
  @ApiOperation({ summary: 'Maintenance window effectiveness report', description: 'For each past one-shot window: checks run during the window, baseline failure rate, suppressed alerts, and post-maintenance recovery time.' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Look-back period in days (1–365, default 90)' })
  @ApiResponse({ status: 200, description: 'Effectiveness report returned.' })
  effectiveness(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: string,
  ) {
    const d = parseInt(days ?? '90', 10);
    return this.service.effectiveness(req.user.id, Number.isFinite(d) ? d : 90);
  }

  @Get()
  @ApiOperation({ summary: 'List all maintenance windows', description: 'Returns all maintenance windows for the authenticated user, ordered by startsAt ascending. Includes `isActive` computed flag.' })
  @ApiResponse({ status: 200, description: 'Array of maintenance windows with monitorIds and isActive flag.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.user.id);
  }

  @Get('active')
  @ApiOperation({ summary: 'List currently active maintenance windows', description: 'Returns only windows whose startsAt ≤ now ≤ endsAt. Used internally by alert suppression logic.' })
  @ApiResponse({ status: 200, description: 'Array of currently active maintenance windows.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  listActive(@Req() req: AuthenticatedRequest) {
    return this.service.listActive(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single maintenance window by ID' })
  @ApiParam({ name: 'id', description: 'MaintenanceWindow CUID', example: 'clfxyz456' })
  @ApiResponse({ status: 200, description: 'Maintenance window with monitorIds and isActive flag.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied — window belongs to another user.' })
  @ApiResponse({ status: 404, description: 'Maintenance window not found.' })
  getOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.getOne(id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a maintenance window', description: 'Creates a maintenance window. During active windows, alerts for linked monitors are suppressed.' })
  @ApiResponse({ status: 201, description: 'Created maintenance window.' })
  @ApiResponse({ status: 400, description: 'Validation error — name, startsAt, and endsAt are required; endsAt must be after startsAt.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateMaintenanceWindowDto) {
    return this.service.create(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a maintenance window', description: 'Partially updates a maintenance window. Providing monitorIds replaces all linked monitors.' })
  @ApiParam({ name: 'id', description: 'MaintenanceWindow CUID', example: 'clfxyz456' })
  @ApiResponse({ status: 200, description: 'Updated maintenance window.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  @ApiResponse({ status: 404, description: 'Maintenance window not found.' })
  update(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateMaintenanceWindowDto,
  ) {
    return this.service.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a maintenance window', description: 'Permanently deletes the maintenance window and unlinks all associated monitors.' })
  @ApiParam({ name: 'id', description: 'MaintenanceWindow CUID', example: 'clfxyz456' })
  @ApiResponse({ status: 200, description: '`{ ok: true }` on success.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  @ApiResponse({ status: 404, description: 'Maintenance window not found.' })
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.remove(id, req.user.id);
  }
}
