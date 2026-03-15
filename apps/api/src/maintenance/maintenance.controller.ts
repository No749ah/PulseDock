import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { CreateMaintenanceWindowDto, UpdateMaintenanceWindowDto } from './maintenance.dto';
import { MaintenanceService } from './maintenance.service';

interface AuthenticatedRequest {
  user: { id: string };
}

@ApiTags('Maintenance Windows')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/maintenance')
export class MaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

  @Get()
  @ApiOperation({ summary: 'List all maintenance windows for the current user' })
  @ApiResponse({ status: 200, description: 'Array of maintenance windows' })
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.user.id);
  }

  @Get('active')
  @ApiOperation({ summary: 'List currently active maintenance windows' })
  @ApiResponse({ status: 200, description: 'Array of currently active windows' })
  listActive(@Req() req: AuthenticatedRequest) {
    return this.service.listActive(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single maintenance window by ID' })
  @ApiParam({ name: 'id', description: 'Maintenance window ID' })
  @ApiResponse({ status: 200, description: 'Maintenance window' })
  @ApiResponse({ status: 404, description: 'Not found' })
  getOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.getOne(id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a maintenance window' })
  @ApiResponse({ status: 201, description: 'Created maintenance window' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateMaintenanceWindowDto) {
    return this.service.create(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a maintenance window' })
  @ApiParam({ name: 'id', description: 'Maintenance window ID' })
  @ApiResponse({ status: 200, description: 'Updated maintenance window' })
  @ApiResponse({ status: 404, description: 'Not found' })
  update(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateMaintenanceWindowDto,
  ) {
    return this.service.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a maintenance window' })
  @ApiParam({ name: 'id', description: 'Maintenance window ID' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Not found' })
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.remove(id, req.user.id);
  }
}
