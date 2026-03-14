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
  @ApiResponse({ status: 200, description: 'Tag list returned.' })
  list(@Req() req: { user: { id: string } }) {
    return this.tagsService.list(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create tag' })
  @ApiResponse({ status: 201, description: 'Tag created.' })
  create(@Req() req: { user: { id: string } }, @Body() body: CreateTagDto) {
    return this.tagsService.create(req.user.id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update tag' })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 200, description: 'Tag updated.' })
  @ApiResponse({ status: 404, description: 'Tag not found.' })
  update(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: UpdateTagDto) {
    return this.tagsService.update(req.user.id, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete tag' })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 200, description: 'Tag deleted.' })
  @ApiResponse({ status: 404, description: 'Tag not found.' })
  remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    return this.tagsService.remove(req.user.id, id);
  }
}
