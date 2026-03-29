import { Injectable, NotFoundException, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateDeploymentDto, UpdateDeploymentDto } from './deployments.dto';

@Injectable()
export class DeploymentsService {
  private readonly logger = new Logger(DeploymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a deployment event and auto-annotates linked monitors.
   */
  async create(userId: string, dto: CreateDeploymentDto) {
    const event = await this.prisma.deploymentEvent.create({
      data: {
        userId,
        service: dto.service,
        environment: dto.environment ?? 'production',
        version: dto.version,
        status: dto.status ?? 'STARTED',
        deployedBy: dto.deployedBy,
        commitSha: dto.commitSha,
        commitMessage: dto.commitMessage,
        branch: dto.branch,
        sourceUrl: dto.sourceUrl,
        notes: dto.notes,
        durationMs: dto.durationMs,
        monitorIds: dto.monitorIds ?? [],
        suppressAlerts: dto.suppressAlerts ?? false,
        suppressUntil: dto.suppressUntil ? new Date(dto.suppressUntil) : undefined,
      },
    });

    // Auto-annotate linked monitors
    if (event.monitorIds.length > 0) {
      const statusEmoji: Record<string, string> = {
        STARTED: '🚀',
        SUCCESS: '✅',
        FAILED: '❌',
        ROLLBACK: '↩️',
      };
      const colorMap: Record<string, string> = {
        STARTED: 'blue',
        SUCCESS: 'green',
        FAILED: 'red',
        ROLLBACK: 'yellow',
      };
      const text = `${statusEmoji[event.status] ?? '🚀'} Deployed ${event.service}${event.version ? ` ${event.version}` : ''} (${event.status.toLowerCase()})`;
      await Promise.allSettled(
        event.monitorIds.map((monitorId) =>
          this.prisma.monitorAnnotation.create({
            data: {
              monitorId,
              userId,
              text,
              color: colorMap[event.status] ?? 'blue',
              annotatedAt: event.createdAt,
            },
          }),
        ),
      );
    }

    return event;
  }

  /**
   * Lists deployment events for a user with optional filtering.
   */
  async list(
    userId: string,
    filters: { service?: string; environment?: string; status?: string; days?: number } = {},
  ) {
    const since = filters.days
      ? new Date(Date.now() - filters.days * 86400000)
      : undefined;

    return this.prisma.deploymentEvent.findMany({
      where: {
        userId,
        ...(filters.service ? { service: filters.service } : {}),
        ...(filters.environment ? { environment: filters.environment } : {}),
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns a single deployment event.
   * @throws NotFoundException if not found or not owned by userId
   */
  async findOne(userId: string, id: string) {
    const event = await this.prisma.deploymentEvent.findFirst({
      where: { id, userId },
    });
    if (!event) throw new NotFoundException(`Deployment event ${id} not found`);
    return event;
  }

  /**
   * Updates a deployment event's mutable fields.
   */
  async update(userId: string, id: string, dto: UpdateDeploymentDto) {
    await this.findOne(userId, id);
    return this.prisma.deploymentEvent.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.durationMs !== undefined ? { durationMs: dto.durationMs } : {}),
        ...(dto.version !== undefined ? { version: dto.version } : {}),
      },
    });
  }

  /**
   * Deletes a deployment event.
   */
  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.deploymentEvent.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Receives a webhook from CI/CD systems using a deploy token.
   * @throws UnauthorizedException if token is invalid
   */
  async receiveWebhook(deployToken: string, dto: CreateDeploymentDto) {
    const user = await this.prisma.user.findUnique({ where: { deployToken } });
    if (!user) throw new UnauthorizedException('Invalid deploy token');
    return this.create(user.id, dto);
  }

  /**
   * Generates a new deploy token for the user and saves it.
   * @returns { token: string }
   */
  async generateDeployToken(userId: string) {
    const token = `pd_deploy_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    await this.prisma.user.update({ where: { id: userId }, data: { deployToken: token } });
    return { token };
  }

  /**
   * Lists deployments that have a specific monitor in their monitorIds array.
   */
  async listByMonitor(userId: string, monitorId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    return this.prisma.deploymentEvent.findMany({
      where: {
        userId,
        createdAt: { gte: since },
        monitorIds: { has: monitorId },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns a summary of deployment activity for the user (last N days).
   * Includes total count, per-status counts, active environments, and most-deployed services.
   */
  async getSummary(userId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const events = await this.prisma.deploymentEvent.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { status: true, environment: true, service: true, createdAt: true },
    });

    const total = events.length;
    const byStatus = { STARTED: 0, SUCCESS: 0, FAILED: 0, ROLLBACK: 0 };
    const envCounts: Record<string, number> = {};
    const serviceCounts: Record<string, number> = {};

    for (const ev of events) {
      byStatus[ev.status] = (byStatus[ev.status] ?? 0) + 1;
      envCounts[ev.environment] = (envCounts[ev.environment] ?? 0) + 1;
      serviceCounts[ev.service] = (serviceCounts[ev.service] ?? 0) + 1;
    }

    const topServices = Object.entries(serviceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([service, count]) => ({ service, count }));

    const successRate = total > 0
      ? Math.round(((byStatus.SUCCESS) / total) * 100)
      : null;

    return {
      days,
      total,
      byStatus,
      successRate,
      environments: Object.keys(envCounts),
      topServices,
    };
  }

  /**
   * Compares avg latency 30 minutes before vs after a specific deployment.
   */
  async getMonitorImpact(userId: string, monitorId: string, deploymentId: string) {
    const event = await this.findOne(userId, deploymentId);
    const deployedAt = event.createdAt;
    const windowMs = 30 * 60 * 1000;
    const beforeStart = new Date(deployedAt.getTime() - windowMs);
    const afterEnd = new Date(deployedAt.getTime() + windowMs);

    const [beforeRuns, afterRuns] = await Promise.all([
      this.prisma.monitorRun.findMany({
        where: { monitorId, checkedAt: { gte: beforeStart, lt: deployedAt }, ok: true },
        select: { latencyMs: true },
      }),
      this.prisma.monitorRun.findMany({
        where: { monitorId, checkedAt: { gte: deployedAt, lte: afterEnd }, ok: true },
        select: { latencyMs: true },
      }),
    ]);

    const avg = (runs: { latencyMs: number | null }[]) => {
      const valid = runs.filter((r) => r.latencyMs !== null);
      if (!valid.length) return null;
      return Math.round(valid.reduce((s, r) => s + (r.latencyMs ?? 0), 0) / valid.length);
    };

    const before = avg(beforeRuns);
    const after = avg(afterRuns);
    const deltaMs = before !== null && after !== null ? after - before : null;
    const deltaPct =
      before !== null && before > 0 && deltaMs !== null
        ? Math.round((deltaMs / before) * 100)
        : null;

    return {
      deploymentId,
      deployedAt,
      service: event.service,
      version: event.version,
      before,
      after,
      deltaMs,
      deltaPct,
      checksBefore: beforeRuns.length,
      checksAfter: afterRuns.length,
    };
  }
}
