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

describe('AlertRoutingController.simulate', () => {
  const baseMonitor = {
    id: 'mon-1', name: 'API Health', type: 'HTTP', folderId: null,
  };
  const baseChannel = { id: 'ch-1', name: 'Slack #alerts', type: 'SLACK' };
  const baseRule = {
    id: 'rule-1', userId: 'user-1', name: 'HTTP Errors', enabled: true, priority: 0,
    matchMonitorIds: [], matchTypes: ['HTTP'], matchLevels: ['red'], matchFolderIds: [], matchTags: [],
    channelIds: ['ch-1'], overrideNotifyOn: null,
  };

  function makeSimPrisma() {
    return {
      monitor: { findFirst: vi.fn().mockResolvedValue(baseMonitor) },
      alertRoutingRule: { findMany: vi.fn().mockResolvedValue([baseRule]) },
      monitorTag: { findMany: vi.fn().mockResolvedValue([]) },
      alertChannel: { findMany: vi.fn().mockResolvedValue([baseChannel]) },
      monitorAlert: { findMany: vi.fn().mockResolvedValue([]) },
    };
  }

  it('returns matched rules and routed channels for a matching scenario', async () => {
    const prisma = makeSimPrisma();
    const ctrl = new AlertRoutingController(prisma as never);
    const result = await ctrl.simulate(makeReq(), { monitorId: 'mon-1', level: 'red' });
    expect(result.matchedRulesCount).toBe(1);
    expect(result.routedChannels).toHaveLength(1);
    expect(result.routedChannels[0].name).toBe('Slack #alerts');
    expect(result.fallback).toBeNull();
  });

  it('returns fallback when no rules match', async () => {
    const prisma = makeSimPrisma();
    prisma.alertRoutingRule.findMany.mockResolvedValue([]);
    prisma.monitorAlert.findMany.mockResolvedValue([{
      monitorId: 'mon-1', alertChannelId: 'ch-1',
      alertChannel: baseChannel,
    }]);
    const ctrl = new AlertRoutingController(prisma as never);
    const result = await ctrl.simulate(makeReq(), { monitorId: 'mon-1', level: 'red' });
    expect(result.matchedRulesCount).toBe(0);
    expect(result.fallback).not.toBeNull();
    expect(result.fallback!.active).toBe(true);
    expect(result.fallback!.channels).toHaveLength(1);
  });

  it('returns 404 when monitor not found', async () => {
    const prisma = makeSimPrisma();
    prisma.monitor.findFirst.mockResolvedValue(null);
    const ctrl = new AlertRoutingController(prisma as never);
    await expect(ctrl.simulate(makeReq(), { monitorId: 'bad-id', level: 'red' })).rejects.toThrow(NotFoundException);
  });

  it('marks rule as not-matched when level filter does not apply', async () => {
    const prisma = makeSimPrisma();
    prisma.alertRoutingRule.findMany.mockResolvedValue([{
      ...baseRule, matchLevels: ['yellow'], // only yellow, but we simulate red
    }]);
    const ctrl = new AlertRoutingController(prisma as never);
    const result = await ctrl.simulate(makeReq(), { monitorId: 'mon-1', level: 'red' });
    expect(result.matchedRulesCount).toBe(0);
    expect(result.routing[0].matched).toBe(false);
    expect(result.routing[0].checks.some((c) => c.condition === 'matchLevels' && !c.passed)).toBe(true);
  });

  it('includes tag matching in check trace', async () => {
    const prisma = makeSimPrisma();
    prisma.alertRoutingRule.findMany.mockResolvedValue([{
      ...baseRule, matchTags: ['production'], matchTypes: [], matchLevels: [],
    }]);
    prisma.monitorTag.findMany.mockResolvedValue([{ tag: { name: 'production' } }]);
    const ctrl = new AlertRoutingController(prisma as never);
    const result = await ctrl.simulate(makeReq(), { monitorId: 'mon-1', level: 'red' });
    expect(result.matchedRulesCount).toBe(1);
    const tagCheck = result.routing[0].checks.find((c) => c.condition === 'matchTags');
    expect(tagCheck?.passed).toBe(true);
  });
});
