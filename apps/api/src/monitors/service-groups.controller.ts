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
  list(@Req() req: Request) {
    const userId = (req as any).user.sub;
    return this.serviceGroupsService.list(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a service group' })
  create(@Req() req: Request, @Body() dto: CreateServiceGroupDto) {
    const userId = (req as any).user.sub;
    return this.serviceGroupsService.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a service group' })
  @ApiParam({ name: 'id', description: 'Service group ID' })
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateServiceGroupDto) {
    const userId = (req as any).user.sub;
    return this.serviceGroupsService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a service group' })
  @ApiParam({ name: 'id', description: 'Service group ID' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user.sub;
    await this.serviceGroupsService.remove(userId, id);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get aggregate status for a service group' })
  @ApiParam({ name: 'id', description: 'Service group ID' })
  getStatus(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user.sub;
    return this.serviceGroupsService.getStatus(userId, id);
  }
}
