import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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
  create(@Req() req: AuthRequest, @Body() body: CreateStatusPageDto) {
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

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('status-pages/:id/history')
  @ApiOperation({ summary: 'Get version history (last 10 saves) for a status page' })
  @ApiParam({ name: 'id', description: 'Status page CUID' })
  getHistory(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.statusPagesService.getHistory(req.user.id, id);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post('status-pages/:id/history/:historyId/restore')
  @ApiOperation({ summary: 'Restore a status page to a previous saved version' })
  @ApiParam({ name: 'id', description: 'Status page CUID' })
  @ApiParam({ name: 'historyId', description: 'History entry CUID' })
  restoreHistory(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('historyId') historyId: string,
  ) {
    return this.statusPagesService.restoreHistory(req.user.id, id, historyId);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('status-pages/slug-check')
  @ApiOperation({ summary: 'Check if a slug is available for the current user' })
  @ApiQuery({ name: 'slug', required: true })
  @ApiQuery({ name: 'excludeId', required: false })
  async checkSlug(
    @Req() req: AuthRequest,
    @Query('slug') slug: string,
    @Query('excludeId') excludeId?: string,
  ) {
    return this.statusPagesService.checkSlugAvailability(req.user.id, slug, excludeId);
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

  @Get('public/status/:slug/feed.xml')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'RSS feed for status page incidents (public)',
    description: 'Returns an RSS 2.0 feed of incidents for the given status page. No auth required.',
  })
  @ApiParam({ name: 'slug', description: 'Page slug' })
  async getRssFeed(@Param('slug') slug: string, @Res() res: Response) {
    const xml = await this.statusPagesService.getRssFeed(slug);
    res.send(xml);
  }
}
