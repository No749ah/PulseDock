import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { DeploymentsService } from './deployments.service';
import { CreateDeploymentDto, UpdateDeploymentDto } from './deployments.dto';

@ApiTags('deployments')
@Controller('v1/deployments')
export class DeploymentsController {
  constructor(private readonly svc: DeploymentsService) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create deployment event' })
  create(@Req() req: { user: { id: string } }, @Body() dto: CreateDeploymentDto) {
    return this.svc.create(req.user.id, dto);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List deployment events' })
  @ApiQuery({ name: 'service', required: false })
  @ApiQuery({ name: 'environment', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'days', required: false, type: Number })
  list(
    @Req() req: { user: { id: string } },
    @Query('service') service?: string,
    @Query('environment') environment?: string,
    @Query('status') status?: string,
    @Query('days') days?: string,
  ) {
    return this.svc.list(req.user.id, {
      service,
      environment,
      status,
      days: days ? parseInt(days, 10) : 30,
    });
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a deployment event' })
  findOne(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.svc.findOne(req.user.id, id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a deployment event' })
  update(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateDeploymentDto,
  ) {
    return this.svc.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a deployment event' })
  remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.svc.remove(req.user.id, id);
  }

  @Post('token/generate')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a deploy token for CI/CD webhooks' })
  generateToken(@Req() req: { user: { id: string } }) {
    return this.svc.generateDeployToken(req.user.id);
  }
}

@ApiTags('public')
@Controller('v1/public/deployments')
export class PublicDeploymentsController {
  constructor(private readonly svc: DeploymentsService) {}

  @Post('receive')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Receive a deployment event from CI/CD (token-authenticated)' })
  @ApiResponse({ status: 201, description: 'Deployment event created' })
  @ApiResponse({ status: 401, description: 'Invalid deploy token' })
  receive(
    @Headers('x-deploy-token') deployToken: string,
    @Body() dto: CreateDeploymentDto,
  ) {
    return this.svc.receiveWebhook(deployToken, dto);
  }
}
