import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { StatusPagesService } from '../status-pages/status-pages.service';
import { IncidentStatus, IncidentSeverity } from '@prisma/client';

export interface CreateIncidentDto {
  title: string;
  description?: string;
  severity?: IncidentSeverity;
  monitorIds?: string[];
}

export interface UpdateIncidentDto {
  title?: string;
  description?: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  monitorIds?: string[];
  rootCause?: string | null;
  postmortemNotes?: string | null;
}

export interface AddUpdateDto {
  body: string;
  status: IncidentStatus;
}

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly statusPagesService: StatusPagesService,
  ) {}

  /**
   * Returns all incidents for the given user, with the latest update and linked monitors.
   * Active incidents are ordered first (status ASC), then by creation date DESC.
   *
   * @param userId - Owner's user ID
   */
  async findAll(userId: string) {
    return this.prisma.incident.findMany({
      where: { userId },
      include: {
        updates: { orderBy: { createdAt: 'desc' }, take: 1 },
        monitors: { include: { monitor: { select: { id: true, name: true, type: true } } } },
        _count: { select: { updates: true } },
      },
      orderBy: [
        // Active incidents first
        { status: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Returns a single incident with all timeline updates and linked monitors.
   *
   * @param userId - Owner's user ID
   * @param id     - Incident ID
   * @throws NotFoundException if the incident does not exist or does not belong to `userId`
   */
  async findOne(userId: string, id: string) {
    const incident = await this.prisma.incident.findFirst({
      where: { id, userId },
      include: {
        updates: { orderBy: { createdAt: 'desc' } },
        monitors: { include: { monitor: { select: { id: true, name: true, type: true, target: true } } } },
      },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  /**
   * Creates a new incident with an initial "Incident created" timeline update.
   * Optionally links the incident to one or more monitors.
   * Fires an audit log entry on success.
   *
   * @param userId - Owner's user ID
   * @param dto    - Create payload (title, description, severity, monitorIds)
   * @throws BadRequestException if title is empty
   */
  async create(userId: string, dto: CreateIncidentDto) {
    if (!dto.title?.trim()) throw new BadRequestException('title is required');

    const incident = await this.prisma.incident.create({
      data: {
        userId,
        title: dto.title.trim().slice(0, 255),
        description: dto.description?.trim().slice(0, 2000) ?? null,
        severity: dto.severity ?? IncidentSeverity.MEDIUM,
        status: IncidentStatus.INVESTIGATING,
        updates: {
          create: {
            body: `Incident created: ${dto.title.trim()}`,
            status: IncidentStatus.INVESTIGATING,
          },
        },
        monitors: dto.monitorIds?.length
          ? {
              createMany: {
                data: dto.monitorIds.map((monitorId) => ({ monitorId })),
                skipDuplicates: true,
              },
            }
          : undefined,
      },
      include: {
        updates: true,
        monitors: { include: { monitor: { select: { id: true, name: true } } } },
      },
    });

    await this.audit.log('incident.created', userId, userId, {
      incidentId: incident.id,
      title: incident.title,
      severity: incident.severity,
    });

    // Notify status page subscribers
    this.statusPagesService.notifySubscribersOfIncident(incident.id, 'created').catch((err) =>
      this.logger.warn(`Subscriber notification failed for incident ${incident.id}: ${err instanceof Error ? err.message : String(err)}`),
    );

    return incident;
  }

  /**
   * Updates an incident's fields (title, description, status, severity, linked monitors).
   * Automatically sets `resolvedAt` when status transitions to RESOLVED,
   * and clears it when re-opened from a resolved state.
   * Monitor linkage is replaced atomically when `monitorIds` is provided.
   * Fires an audit log entry on success.
   *
   * @param userId - Owner's user ID
   * @param id     - Incident ID
   * @param dto    - Partial update payload
   * @throws NotFoundException if the incident does not belong to `userId`
   */
  async update(userId: string, id: string, dto: UpdateIncidentDto) {
    const existing = await this.prisma.incident.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Incident not found');
    if (existing.status === IncidentStatus.RESOLVED && dto.status && dto.status !== IncidentStatus.RESOLVED) {
      // Allow reopening
    }

    const resolvedAt =
      dto.status === IncidentStatus.RESOLVED && existing.status !== IncidentStatus.RESOLVED
        ? new Date()
        : dto.status && dto.status !== IncidentStatus.RESOLVED
          ? null
          : undefined;

    // Handle monitor linking updates
    if (dto.monitorIds !== undefined) {
      await this.prisma.incidentMonitor.deleteMany({ where: { incidentId: id } });
      if (dto.monitorIds.length > 0) {
        await this.prisma.incidentMonitor.createMany({
          data: dto.monitorIds.map((monitorId) => ({ incidentId: id, monitorId })),
          skipDuplicates: true,
        });
      }
    }

    const updated = await this.prisma.incident.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title.trim().slice(0, 255) } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim().slice(0, 2000) ?? null } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.severity ? { severity: dto.severity } : {}),
        ...(resolvedAt !== undefined ? { resolvedAt } : {}),
        ...(dto.rootCause !== undefined ? { rootCause: dto.rootCause?.trim().slice(0, 5000) ?? null } : {}),
        ...(dto.postmortemNotes !== undefined ? { postmortemNotes: dto.postmortemNotes?.trim().slice(0, 10000) ?? null } : {}),
      },
      include: {
        updates: { orderBy: { createdAt: 'desc' } },
        monitors: { include: { monitor: { select: { id: true, name: true } } } },
      },
    });

    await this.audit.log('incident.updated', userId, userId, {
      incidentId: id,
      changes: dto,
    });

    // Notify subscribers when incident is resolved
    if (dto.status === IncidentStatus.RESOLVED && existing.status !== IncidentStatus.RESOLVED) {
      this.statusPagesService.notifySubscribersOfIncident(id, 'resolved').catch((err) =>
        this.logger.warn(`Subscriber resolve notification failed for incident ${id}: ${err instanceof Error ? err.message : String(err)}`),
      );
    }

    return updated;
  }

  /**
   * Appends a timeline update to an incident and syncs the incident's status to match.
   * If the new status is RESOLVED and the incident was not previously resolved,
   * `resolvedAt` is set to now. If re-opened, `resolvedAt` is cleared.
   *
   * @param userId      - Owner's user ID
   * @param incidentId  - Target incident ID
   * @param dto         - Update payload (body text + new status)
   * @throws NotFoundException if the incident does not belong to `userId`
   * @throws BadRequestException if body is empty
   */
  async addUpdate(userId: string, incidentId: string, dto: AddUpdateDto) {
    const incident = await this.prisma.incident.findFirst({ where: { id: incidentId, userId } });
    if (!incident) throw new NotFoundException('Incident not found');
    if (!dto.body?.trim()) throw new BadRequestException('body is required');

    const update = await this.prisma.incidentUpdate.create({
      data: {
        incidentId,
        body: dto.body.trim().slice(0, 2000),
        status: dto.status,
      },
    });

    // Also update the incident status to match
    await this.prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: dto.status,
        resolvedAt:
          dto.status === IncidentStatus.RESOLVED && incident.status !== IncidentStatus.RESOLVED
            ? new Date()
            : dto.status !== IncidentStatus.RESOLVED
              ? null
              : undefined,
      },
    });

    return update;
  }

  /**
   * Permanently deletes an incident and all its associated data (cascade).
   * Fires an audit log entry on success.
   *
   * @param userId - Owner's user ID
   * @param id     - Incident ID
   * @throws NotFoundException if the incident does not belong to `userId`
   */
  async delete(userId: string, id: string) {
    const incident = await this.prisma.incident.findFirst({ where: { id, userId } });
    if (!incident) throw new NotFoundException('Incident not found');

    await this.prisma.incident.delete({ where: { id } });
    await this.audit.log('incident.deleted', userId, userId, { incidentId: id, title: incident.title });
  }

  /**
   * Returns the last 50 incidents (with updates + monitor names) for a public status page.
   * No authentication required — exposes only non-sensitive fields.
   * Used by the public status-page API and incident-history widgets.
   *
   * @param targetUserId - The workspace owner whose incidents are displayed
   */
  async getPublicIncidents(targetUserId: string) {
    return this.prisma.incident.findMany({
      where: { userId: targetUserId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        severity: true,
        resolvedAt: true,
        createdAt: true,
        updatedAt: true,
        updates: {
          select: { id: true, body: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        monitors: {
          select: { monitor: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });
  }
}
