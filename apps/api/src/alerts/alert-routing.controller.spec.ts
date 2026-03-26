import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertRoutingController } from './alert-routing.controller';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

const baseRule = {
  id: 'rule-1',
  userId: 'user-1',
  name: 'Prod Alerts',
  description: null,
  enabled: true,
  priority: 0,
  matchTags: [],
  matchTypes: ['HTTP'],
  matchFolderIds: [],
  matchLevels: ['red'],
  matchMonitorIds: [],
  channelIds: ['ch-1'],
  overrideNotifyOn: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    alertRoutingRule: {
      findMany: vi.fn().mockResolvedValue([baseRule]),
      create: vi.fn().mockResolvedValue(baseRule),
      update: vi.fn().mockResolvedValue(baseRule),
      findUnique: vi.fn().mockResolvedValue(baseRule),
      delete: vi.fn().mockResolvedValue(baseRule),
      ...overrides,
    },
  };
}

describe('AlertRoutingController', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let ctrl: AlertRoutingController;

  beforeEach(() => {
    prisma = makePrisma();
    ctrl = new AlertRoutingController(prisma as never);
  });

  it('list() returns rules ordered by priority', async () => {
    const result = await ctrl.list(makeReq());
    expect(prisma.alertRoutingRule.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { priority: 'asc' },
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('create() saves rule with correct userId', async () => {
    const dto = {
      name: 'My Rule',
      channelIds: ['ch-1'],
      matchTypes: ['HTTP'],
      matchLevels: ['red'],
    };
    const result = await ctrl.create(makeReq(), dto as never);
    expect(prisma.alertRoutingRule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', name: 'My Rule' }) }),
    );
    expect(result).toEqual(baseRule);
  });

  it('update() throws NotFoundException when rule not found', async () => {
    prisma.alertRoutingRule.findUnique.mockResolvedValue(null);
    await expect(ctrl.update(makeReq(), 'bad-id', { name: 'x' } as never)).rejects.toThrow(NotFoundException);
  });

  it('update() throws ForbiddenException when rule belongs to another user', async () => {
    prisma.alertRoutingRule.findUnique.mockResolvedValue({ ...baseRule, userId: 'other-user' });
    await expect(ctrl.update(makeReq(), 'rule-1', { name: 'x' } as never)).rejects.toThrow(ForbiddenException);
  });

  it('toggle() flips enabled flag', async () => {
    const updated = { ...baseRule, enabled: false };
    prisma.alertRoutingRule.update.mockResolvedValue(updated);
    const result = await ctrl.toggle(makeReq(), 'rule-1') as typeof baseRule;
    expect(prisma.alertRoutingRule.update).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: { enabled: false }, // flips from true
    });
    expect(result.enabled).toBe(false);
  });

  it('toggle() throws NotFoundException when rule not found', async () => {
    prisma.alertRoutingRule.findUnique.mockResolvedValue(null);
    await expect(ctrl.toggle(makeReq(), 'bad-id')).rejects.toThrow(NotFoundException);
  });

  it('delete() removes rule for correct user', async () => {
    const result = await ctrl.delete(makeReq(), 'rule-1') as { success: boolean };
    expect(prisma.alertRoutingRule.delete).toHaveBeenCalledWith({ where: { id: 'rule-1' } });
    expect(result.success).toBe(true);
  });

  it('delete() throws ForbiddenException for another user\'s rule', async () => {
    prisma.alertRoutingRule.findUnique.mockResolvedValue({ ...baseRule, userId: 'other' });
    await expect(ctrl.delete(makeReq(), 'rule-1')).rejects.toThrow(ForbiddenException);
  });

  it('reorder() updates priority in correct order', async () => {
    const rule2 = { ...baseRule, id: 'rule-2', priority: 1 };
    prisma.alertRoutingRule.findMany.mockResolvedValue([baseRule, rule2]);
    await ctrl.reorder(makeReq(), { ids: ['rule-2', 'rule-1'] });
    expect(prisma.alertRoutingRule.update).toHaveBeenCalledWith({ where: { id: 'rule-2' }, data: { priority: 0 } });
    expect(prisma.alertRoutingRule.update).toHaveBeenCalledWith({ where: { id: 'rule-1' }, data: { priority: 1 } });
  });

  it('reorder() throws ForbiddenException when a rule ID does not belong to user', async () => {
    prisma.alertRoutingRule.findMany.mockResolvedValue([baseRule]); // only owns rule-1
    await expect(ctrl.reorder(makeReq(), { ids: ['rule-1', 'rule-foreign'] })).rejects.toThrow(ForbiddenException);
  });
});
