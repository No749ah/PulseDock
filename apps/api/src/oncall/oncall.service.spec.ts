import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { OnCallService } from './oncall.service';
import { PrismaService } from '../common/prisma.service';

const OWNER_ID = 'user-1';
const OTHER_ID = 'user-2';

const mockSchedule = {
  id: 'sched-1',
  userId: OWNER_ID,
  name: 'Primary On-Call',
  description: null,
  timezone: 'UTC',
  rotationDays: 7,
  createdAt: new Date(),
  updatedAt: new Date(),
  participants: [
    { id: 'p-1', scheduleId: 'sched-1', userId: 'alice', order: 0, createdAt: new Date() },
    { id: 'p-2', scheduleId: 'sched-1', userId: 'bob', order: 1, createdAt: new Date() },
  ],
  policies: [],
};

const mockPolicy = {
  id: 'policy-1',
  userId: OWNER_ID,
  name: 'Default Policy',
  description: null,
  scheduleId: null,
  escalateAfterMin: 15,
  maxEscalations: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
  steps: [],
  schedule: null,
};

const mockPrisma = {
  onCallSchedule: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  onCallParticipant: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
  escalationPolicy: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

describe('OnCallService', () => {
  let service: OnCallService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnCallService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OnCallService>(OnCallService);
    vi.clearAllMocks();
  });

  // ─── Schedule Tests ────────────────────────────────────────────────────────

  it('should create a schedule', async () => {
    mockPrisma.onCallSchedule.create.mockResolvedValue(mockSchedule);
    const result = await service.createSchedule(OWNER_ID, { name: 'Primary On-Call' });
    expect(result).toEqual(mockSchedule);
    expect(mockPrisma.onCallSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: OWNER_ID, name: 'Primary On-Call' }) }),
    );
  });

  it('should list schedules for a user', async () => {
    mockPrisma.onCallSchedule.findMany.mockResolvedValue([mockSchedule]);
    const result = await service.findAllSchedules(OWNER_ID);
    expect(result).toHaveLength(1);
    expect(mockPrisma.onCallSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: OWNER_ID } }),
    );
  });

  it('should throw NotFoundException for unknown schedule', async () => {
    mockPrisma.onCallSchedule.findUnique.mockResolvedValue(null);
    await expect(service.findSchedule(OWNER_ID, 'bad-id')).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException if schedule belongs to another user', async () => {
    mockPrisma.onCallSchedule.findUnique.mockResolvedValue({ ...mockSchedule, userId: OTHER_ID });
    await expect(service.findSchedule(OWNER_ID, 'sched-1')).rejects.toThrow(ForbiddenException);
  });

  it('should delete a schedule', async () => {
    mockPrisma.onCallSchedule.findUnique.mockResolvedValue(mockSchedule);
    mockPrisma.onCallSchedule.delete.mockResolvedValue(mockSchedule);
    await service.deleteSchedule(OWNER_ID, 'sched-1');
    expect(mockPrisma.onCallSchedule.delete).toHaveBeenCalledWith({ where: { id: 'sched-1' } });
  });

  // ─── getCurrentOnCall Tests ────────────────────────────────────────────────

  it('should return null when no participants', () => {
    const empty = { ...mockSchedule, participants: [] };
    const result = service.getCurrentOnCall(empty as any);
    expect(result).toBeNull();
  });

  it('should return correct participant at EPOCH (slot 0)', () => {
    const EPOCH = new Date('2026-01-05T00:00:00Z').getTime();
    const result = service.getCurrentOnCall(mockSchedule as any, EPOCH);
    expect(result).toEqual(mockSchedule.participants[0]);
  });

  it('should rotate to next participant after one rotation period', () => {
    const EPOCH = new Date('2026-01-05T00:00:00Z').getTime();
    const oneWeekMs = 7 * 86400 * 1000;
    // After one full rotation cycle, we're on slot 1 (bob)
    const result = service.getCurrentOnCall(mockSchedule as any, EPOCH + oneWeekMs);
    expect(result).toEqual(mockSchedule.participants[1]);
  });

  // ─── Escalation Policy Tests ───────────────────────────────────────────────

  it('should create an escalation policy', async () => {
    mockPrisma.escalationPolicy.create.mockResolvedValue(mockPolicy);
    const result = await service.createPolicy(OWNER_ID, { name: 'Default Policy' });
    expect(result).toEqual(mockPolicy);
    expect(mockPrisma.escalationPolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: OWNER_ID, name: 'Default Policy' }) }),
    );
  });

  it('should throw NotFoundException for unknown policy', async () => {
    mockPrisma.escalationPolicy.findUnique.mockResolvedValue(null);
    await expect(service.findPolicy(OWNER_ID, 'bad-id')).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException if policy belongs to another user', async () => {
    mockPrisma.escalationPolicy.findUnique.mockResolvedValue({ ...mockPolicy, userId: OTHER_ID });
    await expect(service.findPolicy(OWNER_ID, 'policy-1')).rejects.toThrow(ForbiddenException);
  });

  it('should list policies for a user', async () => {
    mockPrisma.escalationPolicy.findMany.mockResolvedValue([mockPolicy]);
    const result = await service.findAllPolicies(OWNER_ID);
    expect(result).toHaveLength(1);
    expect(mockPrisma.escalationPolicy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: OWNER_ID } }),
    );
  });

  // ─── updateSchedule ───────────────────────────────────────────────────────

  it('should update a schedule', async () => {
    mockPrisma.onCallSchedule.findUnique.mockResolvedValue(mockSchedule);
    const updated = { ...mockSchedule, name: 'New Name' };
    mockPrisma.onCallSchedule.update.mockResolvedValue(updated);
    const result = await service.updateSchedule(OWNER_ID, 'sched-1', { name: 'New Name' });
    expect(result.name).toBe('New Name');
    expect(mockPrisma.onCallSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sched-1' } }),
    );
  });

  // ─── addParticipant / removeParticipant ───────────────────────────────────

  it('should add a participant to a schedule', async () => {
    mockPrisma.onCallSchedule.findUnique.mockResolvedValue(mockSchedule);
    const participant = { id: 'p-3', scheduleId: 'sched-1', userId: 'carol', order: 2, createdAt: new Date() };
    mockPrisma.onCallParticipant.upsert.mockResolvedValue(participant);
    const result = await service.addParticipant(OWNER_ID, 'sched-1', { userId: 'carol', order: 2 });
    expect(result).toEqual(participant);
    expect(mockPrisma.onCallParticipant.upsert).toHaveBeenCalled();
  });

  it('should remove a participant from a schedule', async () => {
    mockPrisma.onCallSchedule.findUnique.mockResolvedValue(mockSchedule);
    const participant = { id: 'p-1', scheduleId: 'sched-1', userId: 'alice', order: 0, createdAt: new Date() };
    mockPrisma.onCallParticipant.findUnique.mockResolvedValue(participant);
    mockPrisma.onCallParticipant.delete.mockResolvedValue(participant);
    await service.removeParticipant(OWNER_ID, 'sched-1', 'p-1');
    expect(mockPrisma.onCallParticipant.delete).toHaveBeenCalledWith({ where: { id: 'p-1' } });
  });

  it('should throw NotFoundException when removing non-existent participant', async () => {
    mockPrisma.onCallSchedule.findUnique.mockResolvedValue(mockSchedule);
    mockPrisma.onCallParticipant.findUnique.mockResolvedValue(null);
    await expect(service.removeParticipant(OWNER_ID, 'sched-1', 'bad-id')).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when participant belongs to different schedule', async () => {
    mockPrisma.onCallSchedule.findUnique.mockResolvedValue(mockSchedule);
    const participant = { id: 'p-9', scheduleId: 'other-sched', userId: 'alice', order: 0, createdAt: new Date() };
    mockPrisma.onCallParticipant.findUnique.mockResolvedValue(participant);
    await expect(service.removeParticipant(OWNER_ID, 'sched-1', 'p-9')).rejects.toThrow(NotFoundException);
  });

  // ─── getScheduleWithCurrentOnCall ─────────────────────────────────────────

  it('should return schedule with current on-call participant', async () => {
    mockPrisma.onCallSchedule.findUnique.mockResolvedValue(mockSchedule);
    const result = await service.getScheduleWithCurrentOnCall(OWNER_ID, 'sched-1');
    expect(result).toHaveProperty('currentOnCall');
    expect(result.id).toBe('sched-1');
  });

  // ─── updatePolicy / deletePolicy ─────────────────────────────────────────

  it('should update an escalation policy', async () => {
    mockPrisma.escalationPolicy.findUnique.mockResolvedValue(mockPolicy);
    const updated = { ...mockPolicy, name: 'Updated Policy', escalateAfterMin: 30 };
    mockPrisma.escalationPolicy.update.mockResolvedValue(updated);
    const result = await service.updatePolicy(OWNER_ID, 'policy-1', { name: 'Updated Policy', escalateAfterMin: 30 });
    expect(result.name).toBe('Updated Policy');
    expect(result.escalateAfterMin).toBe(30);
    expect(mockPrisma.escalationPolicy.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'policy-1' } }),
    );
  });

  it('should delete an escalation policy', async () => {
    mockPrisma.escalationPolicy.findUnique.mockResolvedValue(mockPolicy);
    mockPrisma.escalationPolicy.delete.mockResolvedValue(mockPolicy);
    await service.deletePolicy(OWNER_ID, 'policy-1');
    expect(mockPrisma.escalationPolicy.delete).toHaveBeenCalledWith({ where: { id: 'policy-1' } });
  });

  it('should create policy with steps', async () => {
    const policyWithSteps = { ...mockPolicy, steps: [{ id: 's-1', stepOrder: 1, waitMinutes: 5, notifyEmail: 'admin@test.com' }] };
    mockPrisma.escalationPolicy.create.mockResolvedValue(policyWithSteps);
    const result = await service.createPolicy(OWNER_ID, {
      name: 'Policy With Steps',
      steps: [{ stepOrder: 1, waitMinutes: 5, notifyEmail: 'admin@test.com' }],
    });
    expect(result.steps).toHaveLength(1);
  });
});
