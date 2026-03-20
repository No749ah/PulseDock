import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  CreateOnCallScheduleDto,
  UpdateOnCallScheduleDto,
  AddParticipantDto,
  CreateEscalationPolicyDto,
  UpdateEscalationPolicyDto,
} from './oncall.dto';
import { OnCallParticipant, OnCallSchedule } from '@prisma/client';

type ScheduleWithParticipants = OnCallSchedule & {
  participants: OnCallParticipant[];
};

@Injectable()
export class OnCallService {
  private readonly logger = new Logger(OnCallService.name);

  // Fixed epoch for rotation calculations: first Monday of 2026
  private readonly ROTATION_EPOCH = new Date('2026-01-05T00:00:00Z').getTime();

  constructor(private readonly prisma: PrismaService) {}

  // ─── Schedule CRUD ────────────────────────────────────────────────────────

  async createSchedule(userId: string, dto: CreateOnCallScheduleDto) {
    return this.prisma.onCallSchedule.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        timezone: dto.timezone ?? 'UTC',
        rotationDays: dto.rotationDays ?? 7,
      },
      include: { participants: true, policies: true },
    });
  }

  async findAllSchedules(userId: string) {
    return this.prisma.onCallSchedule.findMany({
      where: { userId },
      include: { participants: true, policies: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findSchedule(userId: string, id: string) {
    const schedule = await this.prisma.onCallSchedule.findUnique({
      where: { id },
      include: {
        participants: { orderBy: { order: 'asc' } },
        policies: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
      },
    });
    if (!schedule) throw new NotFoundException('Schedule not found');
    if (schedule.userId !== userId) throw new ForbiddenException('Access denied');
    return schedule;
  }

  async updateSchedule(userId: string, id: string, dto: UpdateOnCallScheduleDto) {
    await this.findSchedule(userId, id);
    return this.prisma.onCallSchedule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.rotationDays !== undefined && { rotationDays: dto.rotationDays }),
      },
      include: { participants: { orderBy: { order: 'asc' } }, policies: true },
    });
  }

  async deleteSchedule(userId: string, id: string) {
    await this.findSchedule(userId, id);
    await this.prisma.onCallSchedule.delete({ where: { id } });
  }

  // ─── Participants ─────────────────────────────────────────────────────────

  async addParticipant(userId: string, scheduleId: string, dto: AddParticipantDto) {
    await this.findSchedule(userId, scheduleId);
    return this.prisma.onCallParticipant.upsert({
      where: { scheduleId_order: { scheduleId, order: dto.order } },
      create: { scheduleId, userId: dto.userId, order: dto.order },
      update: { userId: dto.userId },
    });
  }

  async removeParticipant(userId: string, scheduleId: string, participantId: string) {
    await this.findSchedule(userId, scheduleId);
    const participant = await this.prisma.onCallParticipant.findUnique({
      where: { id: participantId },
    });
    if (!participant || participant.scheduleId !== scheduleId) {
      throw new NotFoundException('Participant not found');
    }
    await this.prisma.onCallParticipant.delete({ where: { id: participantId } });
  }

  // ─── Current On-Call Calculation ──────────────────────────────────────────

  getCurrentOnCall(schedule: ScheduleWithParticipants, now = Date.now()) {
    if (!schedule.participants.length) return null;
    const slotMs = schedule.rotationDays * 86400 * 1000;
    const idx =
      Math.floor((now - this.ROTATION_EPOCH) / slotMs) %
      schedule.participants.length;
    return schedule.participants[idx < 0 ? 0 : idx];
  }

  async getScheduleWithCurrentOnCall(userId: string, id: string) {
    const schedule = await this.findSchedule(userId, id);
    const currentOnCall = this.getCurrentOnCall(schedule);
    return { ...schedule, currentOnCall };
  }

  // ─── Escalation Policy CRUD ───────────────────────────────────────────────

  async createPolicy(userId: string, dto: CreateEscalationPolicyDto) {
    // Verify schedule ownership if provided
    if (dto.scheduleId) {
      await this.findSchedule(userId, dto.scheduleId);
    }

    return this.prisma.escalationPolicy.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        scheduleId: dto.scheduleId,
        escalateAfterMin: dto.escalateAfterMin ?? 15,
        maxEscalations: dto.maxEscalations ?? 3,
        steps: dto.steps
          ? {
              create: dto.steps.map((s) => ({
                stepOrder: s.stepOrder,
                waitMinutes: s.waitMinutes,
                notifyEmail: s.notifyEmail,
              })),
            }
          : undefined,
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
  }

  async findAllPolicies(userId: string) {
    return this.prisma.escalationPolicy.findMany({
      where: { userId },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        schedule: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPolicy(userId: string, id: string) {
    const policy = await this.prisma.escalationPolicy.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        schedule: { select: { id: true, name: true } },
      },
    });
    if (!policy) throw new NotFoundException('Escalation policy not found');
    if (policy.userId !== userId) throw new ForbiddenException('Access denied');
    return policy;
  }

  async updatePolicy(userId: string, id: string, dto: UpdateEscalationPolicyDto) {
    await this.findPolicy(userId, id);
    if (dto.scheduleId) {
      await this.findSchedule(userId, dto.scheduleId);
    }
    return this.prisma.escalationPolicy.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.scheduleId !== undefined && { scheduleId: dto.scheduleId }),
        ...(dto.escalateAfterMin !== undefined && { escalateAfterMin: dto.escalateAfterMin }),
        ...(dto.maxEscalations !== undefined && { maxEscalations: dto.maxEscalations }),
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
  }

  async deletePolicy(userId: string, id: string) {
    await this.findPolicy(userId, id);
    await this.prisma.escalationPolicy.delete({ where: { id } });
  }
}
