import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
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
import { PlanService } from '../settings/plan.service';

interface AuthRequest {
  user: { id: string };
}

@ApiTags('Status Pages')
@Controller('v1')
export class StatusPagesController {
  constructor(
    private readonly statusPagesService: StatusPagesService,
    private readonly planService: PlanService,
  ) {}

  // ── Authenticated routes ──────────────────────────────────────────────────

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('status-pages')
  @ApiOperation({ summary: 'List my status pages', description: 'Returns all status pages owned by the authenticated user, ordered by createdAt descending. Strips passwordHash (replaced with hasPassword boolean).' })
  @ApiResponse({ status: 200, description: 'Array of status pages with hasPassword flag.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  list(@Req() req: AuthRequest) {
    return this.statusPagesService.findAll(req.user.id);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post('status-pages')
  @ApiOperation({ summary: 'Create a status page', description: 'Creates a new status page. Auto-generates a unique slug from the title if not provided. Appends a timestamp suffix if slug is already taken.' })
  @ApiResponse({ status: 201, description: 'Created status page.' })
  @ApiResponse({ status: 400, description: 'Validation error — title is required.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Plan status-pages limit reached.' })
  async create(@Req() req: AuthRequest, @Body() body: CreateStatusPageDto) {
    const check = await this.planService.checkLimit(req.user.id, 'status-pages');
    if (!check.allowed) {
      throw new ForbiddenException({
        message: 'Plan limit reached: upgrade to PRO for more status pages',
        code: 'PLAN_LIMIT',
        resource: 'status-pages',
        current: check.current,
        limit: check.limit,
        plan: check.plan,
      });
    }
    return this.statusPagesService.create(req.user.id, body);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('status-pages/:id')
  @ApiOperation({ summary: 'Get a status page by ID', description: 'Returns a single status page with its full layout. Ownership is enforced.' })
  @ApiParam({ name: 'id', description: 'Status page CUID' })
  @ApiResponse({ status: 200, description: 'Status page with layout and hasPassword flag.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied — page belongs to another user.' })
  @ApiResponse({ status: 404, description: 'Status page not found.' })
  findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.statusPagesService.findOne(req.user.id, id);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Patch('status-pages/:id')
  @ApiOperation({ summary: 'Update a status page', description: 'Partially updates a status page. Accepts title, description, layout, slug, isPublished, password, notifyWebhookUrl, and page settings. Saves a version history snapshot on each call.' })
  @ApiParam({ name: 'id', description: 'Status page CUID' })
  @ApiResponse({ status: 200, description: 'Updated status page.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  @ApiResponse({ status: 404, description: 'Status page not found.' })
  // Read body directly from request to bypass the global ValidationPipe which
  // strips unknown/nested fields from the deeply-nested `layout` JSON.
  update(@Req() req: AuthRequest & { body?: unknown }, @Param('id') id: string) {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const keys = Object.keys(body);
    console.error(`[PATCH-DEBUG] id=${id} bodyKeys=[${keys}] hasLayout=${!!body.layout} rawType=${typeof req.body} rawKeys=${req.body ? Object.keys(req.body as object) : 'N/A'}`);
    return this.statusPagesService.update(req.user.id, id, body as unknown as UpdateStatusPageDto);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post('status-pages/:id/publish')
  @ApiOperation({ summary: 'Toggle publish state of a status page', description: 'Toggles isPublished between true and false. Published pages are accessible at /status/:slug.' })
  @ApiParam({ name: 'id', description: 'Status page CUID' })
  @ApiResponse({ status: 200, description: 'Updated status page with new isPublished value.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  @ApiResponse({ status: 404, description: 'Status page not found.' })
  publish(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.statusPagesService.publish(req.user.id, id);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Delete('status-pages/:id')
  @ApiOperation({ summary: 'Delete a status page', description: 'Permanently deletes a status page and all its history snapshots and subscribers.' })
  @ApiParam({ name: 'id', description: 'Status page CUID' })
  @ApiResponse({ status: 200, description: '`{ deleted: true }` on success.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  @ApiResponse({ status: 404, description: 'Status page not found.' })
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.statusPagesService.remove(req.user.id, id);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('status-pages/:id/preview')
  @ApiOperation({ summary: 'Preview data for a status page (auth required)', description: 'Returns the full public-like data (monitors, incidents, maintenance, recent checks) for the owner\'s page regardless of publish state. Used by the editor\'s preview mode.' })
  @ApiParam({ name: 'id', description: 'Status page CUID' })
  @ApiResponse({ status: 200, description: 'Full preview data matching the public endpoint format.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  @ApiResponse({ status: 404, description: 'Status page not found.' })
  getPreview(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.statusPagesService.findPreview(req.user.id, id);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('status-pages/:id/preview/widget/:widgetId')
  @ApiOperation({ summary: 'Live widget data for preview (auth required)', description: 'Returns live resolved widget data for the owner\'s status page, regardless of publish state. Used by the SSR preview page.' })
  @ApiParam({ name: 'id', description: 'Status page CUID' })
  @ApiParam({ name: 'widgetId', description: 'Widget ID within the layout' })
  @ApiQuery({ name: 'range', required: false, description: 'Time range: 24h | 7d | 30d | 90d' })
  @ApiResponse({ status: 200, description: 'Widget-specific data object.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  @ApiResponse({ status: 404, description: 'Status page or widget not found.' })
  getPreviewWidgetData(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('widgetId') widgetId: string,
    @Query('range') range?: string,
  ) {
    return this.statusPagesService.getPreviewWidgetData(req.user.id, id, widgetId, range);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('status-pages/:id/history')
  @ApiOperation({ summary: 'Get version history for a status page', description: 'Returns the last 10 saved snapshots (savedAt, label, layout). Use to restore a previous version.' })
  @ApiParam({ name: 'id', description: 'Status page CUID' })
  @ApiResponse({ status: 200, description: 'Array of history entries ordered by savedAt descending.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  @ApiResponse({ status: 404, description: 'Status page not found.' })
  getHistory(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.statusPagesService.getHistory(req.user.id, id);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post('status-pages/:id/history/:historyId/restore')
  @ApiOperation({ summary: 'Restore a status page to a previous saved version', description: 'Saves the current layout as a pre-restore snapshot, then applies the selected history entry\'s layout.' })
  @ApiParam({ name: 'id', description: 'Status page CUID' })
  @ApiParam({ name: 'historyId', description: 'History entry CUID to restore from' })
  @ApiResponse({ status: 200, description: 'Updated status page with restored layout.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 403, description: 'Access denied.' })
  @ApiResponse({ status: 404, description: 'Status page or history entry not found.' })
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
  @ApiOperation({ summary: 'Check if a slug is available', description: 'Validates format and checks uniqueness. Pass excludeId when editing an existing page to allow the page to keep its own slug.' })
  @ApiQuery({ name: 'slug', required: true, description: 'Candidate slug (3–80 chars, lowercase alphanumeric + hyphens)' })
  @ApiQuery({ name: 'excludeId', required: false, description: 'Status page ID to exclude from the uniqueness check (for edits)' })
  @ApiResponse({ status: 200, description: '`{ available, valid, slug?, reason? }` — valid=false when format check fails.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  async checkSlug(
    @Req() req: AuthRequest,
    @Query('slug') slug: string,
    @Query('excludeId') excludeId?: string,
  ) {
    return this.statusPagesService.checkSlugAvailability(req.user.id, slug, excludeId);
  }

  // ── Public routes (no auth) ───────────────────────────────────────────────
  // IMPORTANT: static routes must come before parameterized :slug routes

  @Get('public/status/unsubscribe')
  @ApiOperation({
    summary: 'Unsubscribe from status page updates (public)',
    description: 'Removes the subscriber identified by the one-time unsubscribe token from status page notifications.',
  })
  @ApiQuery({ name: 'token', description: 'Unsubscribe token from the notification email' })
  @ApiResponse({ status: 200, description: 'Successfully unsubscribed.' })
  @ApiResponse({ status: 404, description: 'Invalid or expired unsubscribe token.' })
  async unsubscribe(@Query('token') token: string) {
    await this.statusPagesService.unsubscribe(token);
    return { message: 'Successfully unsubscribed' };
  }

  @Get('public/status/:slug')
  @ApiOperation({
    summary: 'Get published status page by slug (public)',
    description: 'Returns page layout and live monitor data. No auth required. Supply ?password= for password-protected pages.',
  })
  @ApiParam({ name: 'slug', description: 'Page slug', example: 'my-services' })
  @ApiQuery({ name: 'password', required: false, description: 'Password for password-protected pages' })
  @ApiResponse({ status: 200, description: 'Published status page with live monitor data, incidents, and maintenance.' })
  @ApiResponse({ status: 401, description: 'Page is password-protected and the supplied password is wrong or missing.' })
  @ApiResponse({ status: 404, description: 'Page not found or not published.' })
  findPublic(@Param('slug') slug: string, @Query('password') password?: string) {
    return this.statusPagesService.findPublic(slug, password);
  }

  @Post('public/status/:slug/subscribe')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Subscribe to status page updates (public)',
    description: 'Adds email to the subscriber list for outage/degraded email notifications. Returns 409 if already subscribed.',
  })
  @ApiParam({ name: 'slug', description: 'Page slug', example: 'my-services' })
  @ApiResponse({ status: 201, description: '`{ subscribed: true }` when successfully added.' })
  @ApiResponse({ status: 409, description: 'Email is already subscribed to this page.' })
  @ApiResponse({ status: 404, description: 'Page not found or not published.' })
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
    description: 'Returns real-time data for a specific widget on a published status page. The response shape depends on the widget type (uptimePct, dataPoints, grid, etc.).',
  })
  @ApiParam({ name: 'slug', description: 'Page slug', example: 'my-services' })
  @ApiParam({ name: 'widgetId', description: 'Widget ID within the layout', example: 'w_abc123' })
  @ApiQuery({ name: 'password', required: false, description: 'Password for password-protected pages' })
  @ApiQuery({ name: 'range', required: false, description: 'Time range for time-based widgets: 24h | 7d | 30d | 90d (default: 7d)' })
  @ApiResponse({ status: 200, description: 'Widget-specific data object.' })
  @ApiResponse({ status: 401, description: 'Page is password-protected and password is wrong/missing.' })
  @ApiResponse({ status: 404, description: 'Page, widget, or published status not found.' })
  getWidgetData(
    @Param('slug') slug: string,
    @Param('widgetId') widgetId: string,
    @Query('password') password?: string,
    @Query('range') range?: string,
  ) {
    return this.statusPagesService.getWidgetData(slug, widgetId, password, range);
  }

  @Get('public/status/:slug/feed.xml')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'RSS feed for status page incidents (public)',
    description: 'Returns an RSS 2.0 feed of recent incidents for the given status page. Cached for 5 minutes. No auth required.',
  })
  @ApiParam({ name: 'slug', description: 'Page slug', example: 'my-services' })
  @ApiResponse({ status: 200, description: 'RSS 2.0 XML document.' })
  @ApiResponse({ status: 404, description: 'Page not found or not published.' })
  async getRssFeed(@Param('slug') slug: string, @Res() res: Response) {
    const xml = await this.statusPagesService.getRssFeed(slug);
    res.send(xml);
  }

  @Get('public/status/:slug/json')
  @Header('Cache-Control', 'public, max-age=30')
  @Header('Access-Control-Allow-Origin', '*')
  @ApiOperation({
    summary: 'Get status page as structured JSON (public)',
    description:
      'Returns current overall status, individual monitor statuses, active incidents, and upcoming maintenance as machine-readable JSON. Suitable for third-party integrations, badge generators, and automation. No auth required for published pages.',
  })
  @ApiParam({ name: 'slug', description: 'Page slug' })
  @ApiQuery({ name: 'password', required: false, description: 'Password if page is protected' })
  @ApiResponse({ status: 200, description: 'Structured JSON status summary.' })
  @ApiResponse({ status: 401, description: 'Incorrect password.' })
  @ApiResponse({ status: 404, description: 'Page not found or not published.' })
  getPublicJson(@Param('slug') slug: string, @Query('password') password?: string) {
    return this.statusPagesService.getPublicJson(slug, password);
  }
}
