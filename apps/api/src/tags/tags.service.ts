import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const tags = await this.prisma.tag.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { monitorTags: true } } },
    });
    return tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      monitorCount: t._count.monitorTags,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  async create(userId: string, body: { name: string; color?: string }) {
    const exists = await this.prisma.tag.findFirst({ where: { userId, name: body.name } });
    if (exists) throw new ConflictException(`Tag "${body.name}" already exists`);
    const tag = await this.prisma.tag.create({
      data: { userId, name: body.name, color: body.color ?? '#6366f1' },
    });
    return { id: tag.id, name: tag.name, color: tag.color, monitorCount: 0, createdAt: tag.createdAt.toISOString() };
  }

  async update(userId: string, tagId: string, body: { name?: string; color?: string }) {
    const tag = await this.prisma.tag.findFirst({ where: { id: tagId, userId } });
    if (!tag) throw new NotFoundException('Tag not found');
    if (body.name && body.name !== tag.name) {
      const exists = await this.prisma.tag.findFirst({ where: { userId, name: body.name, id: { not: tagId } } });
      if (exists) throw new ConflictException(`Tag "${body.name}" already exists`);
    }
    const updated = await this.prisma.tag.update({
      where: { id: tagId },
      data: { name: body.name ?? tag.name, color: body.color ?? tag.color },
    });
    return { id: updated.id, name: updated.name, color: updated.color, createdAt: updated.createdAt.toISOString() };
  }

  async remove(userId: string, tagId: string) {
    const tag = await this.prisma.tag.findFirst({ where: { id: tagId, userId } });
    if (!tag) throw new NotFoundException('Tag not found');
    await this.prisma.tag.delete({ where: { id: tagId } });
    return { ok: true };
  }
}
