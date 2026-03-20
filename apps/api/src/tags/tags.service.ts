import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * Service for managing monitor tags (labels / categories).
 *
 * Tags are scoped per user and can be assigned to multiple monitors.
 * They are used for filtering on the monitors page and for scope-based
 * widget configuration on status pages.
 *
 * Endpoints: GET/POST/PATCH/DELETE /v1/tags
 */
@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns all tags belonging to a user, ordered alphabetically by name.
   * Includes a `monitorCount` field showing how many monitors use each tag.
   *
   * @param userId - Authenticated user ID
   */
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

  /**
   * Creates a new tag for a user.
   * Names must be unique per user (case-sensitive).
   *
   * @param userId - Authenticated user ID
   * @param body   - Tag data: name (required) and optional hex color (default: #6366f1)
   * @throws ConflictException if a tag with the same name already exists for this user
   */
  async create(userId: string, body: { name: string; color?: string }) {
    const exists = await this.prisma.tag.findFirst({ where: { userId, name: body.name } });
    if (exists) throw new ConflictException(`Tag "${body.name}" already exists`);
    const tag = await this.prisma.tag.create({
      data: { userId, name: body.name, color: body.color ?? '#6366f1' },
    });
    return { id: tag.id, name: tag.name, color: tag.color, monitorCount: 0, createdAt: tag.createdAt.toISOString() };
  }

  /**
   * Updates a tag's name and/or color.
   * Validates uniqueness of the new name against the user's other tags.
   *
   * @param userId - Authenticated user ID
   * @param tagId  - Tag to update
   * @param body   - Partial update: optional new name and/or color
   * @throws NotFoundException if the tag doesn't exist for this user
   * @throws ConflictException if the new name conflicts with another tag
   */
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

  /**
   * Deletes a tag. All MonitorTag pivot rows are cascade-deleted by Prisma.
   *
   * @param userId - Authenticated user ID
   * @param tagId  - Tag to delete
   * @throws NotFoundException if the tag doesn't exist for this user
   */
  async remove(userId: string, tagId: string) {
    const tag = await this.prisma.tag.findFirst({ where: { id: tagId, userId } });
    if (!tag) throw new NotFoundException('Tag not found');
    await this.prisma.tag.delete({ where: { id: tagId } });
    return { ok: true };
  }
}
