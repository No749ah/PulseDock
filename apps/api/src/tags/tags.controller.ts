import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { TagsService } from './tags.service';
import { CreateTagDto, UpdateTagDto } from './tags.dto';

@ApiTags('Tags')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  @ApiOperation({ summary: 'List tags', description: 'Returns all tags for the authenticated user.' })
  @ApiResponse({ status: 200, description: 'Tag list.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  list(@Req() req: { user: { id: string } }) {
    return this.tagsService.list(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create tag', description: 'Creates a new monitor tag. Tags can be applied to monitors for grouping and filtering.' })
  @ApiResponse({ status: 201, description: 'Tag created.' })
  @ApiResponse({ status: 400, description: 'Validation error — name is required.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  create(@Req() req: { user: { id: string } }, @Body() body: CreateTagDto) {
    return this.tagsService.create(req.user.id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update tag', description: 'Updates the name or color of an existing tag.' })
  @ApiParam({ name: 'id', description: 'Tag CUID' })
  @ApiResponse({ status: 200, description: 'Updated tag.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 404, description: 'Tag not found.' })
  update(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: UpdateTagDto) {
    return this.tagsService.update(req.user.id, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete tag', description: 'Deletes a tag and removes it from all monitors.' })
  @ApiParam({ name: 'id', description: 'Tag CUID' })
  @ApiResponse({ status: 200, description: '`{ ok: true }` on success.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({ status: 404, description: 'Tag not found.' })
  remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.tagsService.remove(req.user.id, id);
  }
}
