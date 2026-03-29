import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { ServiceGroupsService } from './service-groups.service';
import { CreateServiceGroupDto, UpdateServiceGroupDto } from './service-groups.dto';

@ApiTags('service-groups')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/service-groups')
export class ServiceGroupsController {
  constructor(private readonly serviceGroupsService: ServiceGroupsService) {}

  @Get()
  @ApiOperation({ summary: 'List service groups' })
  list(@Req() req: { user: { id: string } }) {
    return this.serviceGroupsService.list(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a service group' })
  create(@Req() req: { user: { id: string } }, @Body() dto: CreateServiceGroupDto) {
    return this.serviceGroupsService.create(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a service group' })
  @ApiParam({ name: 'id', description: 'Service group ID' })
  update(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: UpdateServiceGroupDto) {
    return this.serviceGroupsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a service group' })
  @ApiParam({ name: 'id', description: 'Service group ID' })
  async remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    await this.serviceGroupsService.remove(req.user.id, id);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get aggregate status for a service group' })
  @ApiParam({ name: 'id', description: 'Service group ID' })
  getStatus(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.serviceGroupsService.getStatus(req.user.id, id);
  }
}
