import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { CreateStatusPageDto, UpdateStatusPageDto } from './status-pages.dto';
import { StatusPagesService } from './status-pages.service';

interface AuthRequest {
  user: { id: string };
}

@ApiTags('Status Pages')
@Controller('v1')
export class StatusPagesController {
  constructor(private readonly statusPagesService: StatusPagesService) {}

  // ── Authenticated routes ──────────────────────────────────────────────────

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('status-pages')
  @ApiOperation({ summary: 'List my status pages' })
  @ApiResponse({ status: 200, description: 'List of status pages owned by the authenticated user' })
  list(@Req() req: AuthRequest) {
    return this.statusPagesService.findAll(req.user.id);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post('status-pages')
  @ApiOperation({ summary: 'Create a status page' })
  @ApiResponse({ status: 201, description: 'Status page created' })
  create(@Req() req: AuthRequest, @Body() body: CreateStatusPageDto, @Req() rawReq: import('express').Request) {
    // Temporary debug: log raw body to diagnose browser sending empty title
    const logger = new (require('@nestjs/common').Logger)('StatusPagesController');
    logger.debug(`POST /v1/status-pages — body: ${JSON.stringify(body)} | content-type: ${rawReq.headers['content-type']} | user: ${req.user.id}`);
    return this.statusPagesService.create(req.user.id, body);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('status-pages/:id')
  @ApiOperation({ summary: 'Get a status page by ID' })
  @ApiParam({ name: 'id', description: 'Status page CUID' })
  findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.statusPagesService.findOne(req.user.id, id);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Patch('status-pages/:id')
  @ApiOperation({ summary: 'Update a status page layout / title / description' })
  @ApiParam({ name: 'id', description: 'Status page CUID' })
  update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: UpdateStatusPageDto) {
    return this.statusPagesService.update(req.user.id, id, body);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post('status-pages/:id/publish')
  @ApiOperation({ summary: 'Toggle publish state of a status page' })
  @ApiParam({ name: 'id', description: 'Status page CUID' })
  publish(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.statusPagesService.publish(req.user.id, id);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Delete('status-pages/:id')
  @ApiOperation({ summary: 'Delete a status page' })
  @ApiParam({ name: 'id', description: 'Status page CUID' })
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.statusPagesService.remove(req.user.id, id);
  }

  // ── Public routes (no auth) ───────────────────────────────────────────────

  @Get('public/status/:slug')
  @ApiOperation({
    summary: 'Get published status page by slug (public)',
    description: 'Returns page layout and live monitor data. No auth required.',
  })
  @ApiParam({ name: 'slug', description: 'Page slug' })
  @ApiQuery({ name: 'password', required: false, description: 'Password if page is protected' })
  findPublic(@Param('slug') slug: string, @Query('password') password?: string) {
    return this.statusPagesService.findPublic(slug, password);
  }

  @Post('public/status/:slug/subscribe')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Subscribe to status page updates (public)',
    description: 'Adds email to subscriber list. Returns 201 on success, 409 if already subscribed.',
  })
  @ApiParam({ name: 'slug', description: 'Page slug' })
  async subscribe(
    @Param('slug') slug: string,
    @Body() body: { email: string },
  ) {
    const result = await this.statusPagesService.subscribeToStatusPage(slug, body.email);
    if (result.alreadySubscribed) {
      throw new ConflictException('Already subscribed');
    }
    return { subscribed: true };
  }

  @Get('public/status/:slug/widget/:widgetId')
  @ApiOperation({
    summary: 'Get live data for a single widget (public)',
    description: 'Returns real-time data for a specific widget on a published status page.',
  })
  @ApiParam({ name: 'slug', description: 'Page slug' })
  @ApiParam({ name: 'widgetId', description: 'Widget ID within the layout' })
  @ApiQuery({ name: 'password', required: false })
  getWidgetData(
    @Param('slug') slug: string,
    @Param('widgetId') widgetId: string,
    @Query('password') password?: string,
  ) {
    return this.statusPagesService.getWidgetData(slug, widgetId, password);
  }
}
