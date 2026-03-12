import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/auth.guard';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateFolderDto, UpdateFolderDto } from './folders.dto';

@ApiTags('Folders')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('v1/folders')
export class FoldersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List folders/projects', description: 'Returns all folders for the authenticated user.' })
  @ApiResponse({ status: 200, description: 'Folder list returned.' })
  async list(@Req() req: { user: { id: string } }) {
    const folders = await this.prisma.folder.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
    return folders.map((f) => ({
      id: f.id,
      userId: f.userId,
      name: f.name,
      createdAt: f.createdAt.toISOString(),
    }));
  }

  @Post()
  @ApiOperation({ summary: 'Create folder/project', description: 'Create a new folder to group monitors.' })
  @ApiResponse({ status: 201, description: 'Folder created.' })
  async create(@Req() req: { user: { id: string } }, @Body() body: CreateFolderDto) {
    const folder = await this.prisma.folder.create({
      data: {
        userId: req.user.id,
        name: body.name,
      },
    });
    await this.audit.log('folder.create', req.user.id, req.user.id, { folderId: folder.id, name: folder.name });
    return {
      id: folder.id,
      userId: folder.userId,
      name: folder.name,
      createdAt: folder.createdAt.toISOString(),
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update folder/project' })
  @ApiParam({ name: 'id', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'Folder updated.' })
  @ApiResponse({ status: 404, description: 'Folder not found.' })
  async update(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: UpdateFolderDto) {
    const folder = await this.prisma.folder.findFirst({ where: { id, userId: req.user.id } });
    if (!folder) throw new NotFoundException('folder not found');

    const updated = await this.prisma.folder.update({ where: { id }, data: { name: body.name ?? folder.name } });
    await this.audit.log('folder.update', req.user.id, req.user.id, { folderId: id });
    return { id: updated.id, userId: updated.userId, name: updated.name, createdAt: updated.createdAt.toISOString() };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete folder/project' })
  @ApiParam({ name: 'id', description: 'Folder ID' })
  @ApiResponse({ status: 200, description: 'Folder deleted.' })
  @ApiResponse({ status: 404, description: 'Folder not found.' })
  async remove(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id, userId: req.user.id } });
    if (!folder) throw new NotFoundException('folder not found');
    await this.prisma.folder.delete({ where: { id } });
    await this.audit.log('folder.delete', req.user.id, req.user.id, { folderId: id });
    return { ok: true };
  }
}
