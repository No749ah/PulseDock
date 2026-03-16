import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
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
}

export interface AddUpdateDto {
  body: string;
  status: IncidentStatus;
}

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

    return incident;
  }

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

    return updated;
  }

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

  async delete(userId: string, id: string) {
    const incident = await this.prisma.incident.findFirst({ where: { id, userId } });
    if (!incident) throw new NotFoundException('Incident not found');

    await this.prisma.incident.delete({ where: { id } });
    await this.audit.log('incident.deleted', userId, userId, { incidentId: id, title: incident.title });
  }

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
