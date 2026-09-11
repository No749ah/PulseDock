import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AlertsService } from '../alerts/alerts.service';
import { CreateEscalationPolicyDto, UpdateEscalationPolicyDto } from './escalation.dto';
import type { AlertChannel, AlertChannelType } from '../types';

interface EscalationStep {
  delayMinutes: number;
  channelId: string;
}

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
  ) {}

  /**
   * List all escalation policies for a user.
   */
  async list(userId: string) {
    return this.prisma.escalationPolicy.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single escalation policy by ID.
   */
  async findOne(userId: string, id: string) {
    const policy = await this.prisma.escalationPolicy.findFirst({
      where: { id, userId },
    });
    if (!policy) throw new NotFoundException('Escalation policy not found');
    return policy;
  }

  /**
   * Create a new escalation policy.
   */
  async create(userId: string, dto: CreateEscalationPolicyDto) {
    return this.prisma.escalationPolicy.create({
      data: {
        userId,
        name: dto.name,
        steps: (dto.steps ?? []) as unknown as Parameters<typeof this.prisma.escalationPolicy.create>[0]['data']['steps'],
      },
    });
  }

  /**
   * Update an existing escalation policy.
   */
  async update(userId: string, id: string, dto: UpdateEscalationPolicyDto) {
    const existing = await this.prisma.escalationPolicy.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Escalation policy not found');

    return this.prisma.escalationPolicy.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.steps !== undefined && { steps: dto.steps as unknown as Parameters<typeof this.prisma.escalationPolicy.update>[0]['data']['steps'] }),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Delete an escalation policy.
   */
  async remove(userId: string, id: string) {
    const existing = await this.prisma.escalationPolicy.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Escalation policy not found');

    await this.prisma.escalationPolicy.delete({ where: { id } });
  }

  /**
   * Check all MonitorAlert records with escalation policies and trigger escalation
   * steps if the monitor is still down and the delay threshold has passed.
   * Called by the checks scheduler on each tick.
   */
  async checkAllEscalations(): Promise<void> {
    const now = new Date();

    // Find all monitor↔channel links with an escalation policy
    const monitorAlerts = await this.prisma.monitorAlert.findMany({
      where: { escalationPolicyId: { not: null } },
      include: {
        escalationPolicy: true,
        monitor: {
          select: {
            id: true,
            name: true,
            target: true,
            type: true,
            userId: true,
            mutedUntil: true,
          },
        },
        alertChannel: true,
      },
    });

    for (const ma of monitorAlerts) {
      if (!ma.escalationPolicy) continue;

      const steps = ma.escalationPolicy.steps as unknown as EscalationStep[];
      if (!steps || steps.length === 0) continue;

      // Skip if monitor is muted
      if (ma.monitor.mutedUntil && ma.monitor.mutedUntil > now) continue;

      // Get the most recent run to check current status
      const lastRun = await this.prisma.monitorRun.findFirst({
        where: { monitorId: ma.monitorId },
        orderBy: { checkedAt: 'desc' },
      });

      if (!lastRun) continue;

      // Only escalate when monitor is currently unhealthy
      if (lastRun.ok) {
        // Monitor recovered — reset escalation state if needed
        if (ma.escalationStep > 0 || ma.escalatedAt !== null) {
          await this.prisma.monitorAlert.update({
            where: { monitorId_alertChannelId: { monitorId: ma.monitorId, alertChannelId: ma.alertChannelId } },
            data: { escalationStep: 0, escalatedAt: null },
          });
        }
        continue;
      }

      // Find the first failing run in the current outage streak (to determine "down since")
      const firstFail = await this.prisma.monitorRun.findFirst({
        where: {
          monitorId: ma.monitorId,
          ok: false,
          checkedAt: { lte: now },
        },
        orderBy: { checkedAt: 'asc' },
      });

      if (!firstFail) continue;

      const downSinceMs = now.getTime() - firstFail.checkedAt.getTime();
      const downSinceMinutes = downSinceMs / 60_000;

      // Determine which step to check next
      const nextStepIndex = ma.escalationStep; // 0-based: 0 = first step not yet triggered
      if (nextStepIndex >= steps.length) continue; // all steps already triggered

      const nextStep = steps[nextStepIndex];
      if (downSinceMinutes < nextStep.delayMinutes) continue; // not time yet

      // Fetch the channel to notify
      const channel = await this.prisma.alertChannel.findFirst({
        where: { id: nextStep.channelId, userId: ma.monitor.userId },
      });

      if (!channel) {
        this.logger.warn(`Escalation step channel ${nextStep.channelId} not found for policy ${ma.escalationPolicyId}`);
        // Still advance the step index to avoid getting stuck
        await this.prisma.monitorAlert.update({
          where: { monitorId_alertChannelId: { monitorId: ma.monitorId, alertChannelId: ma.alertChannelId } },
          data: {
            escalationStep: nextStepIndex + 1,
            escalatedAt: ma.escalatedAt ?? now,
          },
        });
        continue;
      }

      // Build alert text for escalation
      const downMins = Math.round(downSinceMinutes);
      const text = `🚨 [ESCALATION Step ${nextStepIndex + 1}] ${ma.monitor.name} has been DOWN for ${downMins} minute${downMins !== 1 ? 's' : ''}. Policy: ${ma.escalationPolicy.name}`;

      try {
        const alertChannel: AlertChannel = {
          id: channel.id,
          userId: channel.userId,
          name: channel.name,
          type: channel.type as AlertChannelType,
          config: channel.configJson as Record<string, unknown>,
          createdAt: (channel.createdAt instanceof Date ? channel.createdAt.toISOString() : channel.createdAt as string) ?? new Date().toISOString(),
          alertGrouping: false,
          groupWindowSec: 300,
          groupByFolder: false,
          groupByTag: false,
          messageTemplate: null,
        };
        await this.alerts.sendToChannel(
          alertChannel,
          text,
          {
            monitor: { name: ma.monitor.name, target: ma.monitor.target },
            run: { level: 'red', message: `Escalation step ${nextStepIndex + 1} — down for ${downMins}min`, latencyMs: lastRun.latencyMs },
            escalation: { step: nextStepIndex + 1, policyName: ma.escalationPolicy.name, downMinutes: downMins },
          },
          ma.monitorId,
          ma.monitor.name,
        );

        await this.prisma.monitorAlert.update({
          where: { monitorId_alertChannelId: { monitorId: ma.monitorId, alertChannelId: ma.alertChannelId } },
          data: {
            escalationStep: nextStepIndex + 1,
            escalatedAt: ma.escalatedAt ?? now,
          },
        });

        this.logger.log(`Escalation step ${nextStepIndex + 1} fired for monitor ${ma.monitor.name} via channel ${channel.name}`);
      } catch (err) {
        this.logger.error(`Escalation step ${nextStepIndex + 1} failed for monitor ${ma.monitor.id}: ${String(err)}`);
      }
    }
  }

  /**
   * Reset escalation state for all MonitorAlert records on a monitor.
   * Called when a monitor recovers.
   */
  async resetForMonitor(monitorId: string): Promise<void> {
    await this.prisma.monitorAlert.updateMany({
      where: { monitorId, escalationStep: { gt: 0 } },
      data: { escalationStep: 0, escalatedAt: null },
    });
  }
}
