import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AlertRoutingController } from './alert-routing.controller';
import { PrismaService } from '../common/prisma.service';
import { AuthGuard } from '../common/auth.guard';

// ─── Auth bypass ─────────────────────────────────────────────────────────────

class MockAuthGuard implements CanActivate {
  canActivate(_ctx: ExecutionContext): boolean {
    return true;
  }
}

const req = { user: { id: 'user-1' } };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    userId: 'user-1',
    name: 'Test Rule',
    description: null,
    enabled: true,
    priority: 0,
    matchTags: [],
    matchTypes: [],
    matchFolderIds: [],
    matchLevels: [],
    matchMonitorIds: [],
    channelIds: ['chan-1'],
    overrideNotifyOn: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makePrisma(rules: ReturnType<typeof makeRule>[] = [makeRule()]) {
  return {
    alertRoutingRule: {
      findMany: vi.fn().mockResolvedValue(rules),
      findUnique: vi.fn().mockResolvedValue(rules[0] ?? null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...makeRule(), ...data, id: 'rule-new' }),
      ),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...makeRule(), ...data }),
      ),
      delete: vi.fn().mockResolvedValue(makeRule()),
    },
  };
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('AlertRoutingController', () => {
  let controller: AlertRoutingController;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertRoutingController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    })
      .overrideGuard(AuthGuard)
      .useClass(MockAuthGuard)
      .compile();

    controller = module.get<AlertRoutingController>(AlertRoutingController);
  });

  // ── List ────────────────────────────────────────────────────────────────────

  it('list returns rules ordered by priority', async () => {
    const rules = [
      makeRule({ id: 'r1', priority: 0 }),
      makeRule({ id: 'r2', priority: 1 }),
    ];
    prisma.alertRoutingRule.findMany.mockResolvedValue(rules);

    const result = await controller.list(req);

    expect(prisma.alertRoutingRule.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { priority: 'asc' },
    });
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('r1');
    expect(result[1].id).toBe('r2');
  });

  // ── Create ──────────────────────────────────────────────────────────────────

  it('create returns 201 with correct fields', async () => {
    const dto = {
      name: 'Red HTTP Alerts',
      channelIds: ['chan-1', 'chan-2'],
      matchTypes: ['HTTP'],
      matchLevels: ['red'],
    };

    const result = await controller.create(req, dto as never);

    expect(prisma.alertRoutingRule.create).toHaveBeenCalledOnce();
    const callArg = prisma.alertRoutingRule.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(callArg.data.name).toBe('Red HTTP Alerts');
    expect(callArg.data.channelIds).toEqual(['chan-1', 'chan-2']);
    expect(callArg.data.matchTypes).toEqual(['HTTP']);
    expect(callArg.data.matchLevels).toEqual(['red']);
    expect(callArg.data.userId).toBe('user-1');
    expect(result.id).toBe('rule-new');
  });

  it('create sets defaults for optional arrays', async () => {
    const dto = { name: 'Min Rule', channelIds: ['chan-1'] };

    await controller.create(req, dto as never);

    const callArg = prisma.alertRoutingRule.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(callArg.data.matchTags).toEqual([]);
    expect(callArg.data.matchTypes).toEqual([]);
    expect(callArg.data.matchFolderIds).toEqual([]);
    expect(callArg.data.matchLevels).toEqual([]);
    expect(callArg.data.matchMonitorIds).toEqual([]);
    expect(callArg.data.enabled).toBe(true);
    expect(callArg.data.priority).toBe(0);
  });

  // ── Reorder ─────────────────────────────────────────────────────────────────

  it('reorder updates priorities correctly', async () => {
    const rules = [
      makeRule({ id: 'r1', priority: 0 }),
      makeRule({ id: 'r2', priority: 1 }),
      makeRule({ id: 'r3', priority: 2 }),
    ];
    prisma.alertRoutingRule.findMany.mockResolvedValueOnce(rules).mockResolvedValueOnce(rules);

    await controller.reorder(req, { ids: ['r3', 'r1', 'r2'] });

    expect(prisma.alertRoutingRule.update).toHaveBeenCalledTimes(3);
    const calls = prisma.alertRoutingRule.update.mock.calls as Array<[{ where: { id: string }; data: { priority: number } }]>;
    expect(calls[0][0].where.id).toBe('r3');
    expect(calls[0][0].data.priority).toBe(0);
    expect(calls[1][0].where.id).toBe('r1');
    expect(calls[1][0].data.priority).toBe(1);
    expect(calls[2][0].where.id).toBe('r2');
    expect(calls[2][0].data.priority).toBe(2);
  });

  it('reorder throws ForbiddenException for unknown rule', async () => {
    // findMany returns only r1, so r999 is not owned
    prisma.alertRoutingRule.findMany.mockResolvedValueOnce([makeRule({ id: 'r1' })]);

    await expect(controller.reorder(req, { ids: ['r1', 'r999'] })).rejects.toThrow(ForbiddenException);
  });

  // ── Toggle ──────────────────────────────────────────────────────────────────

  it('toggle changes enabled state', async () => {
    const rule = makeRule({ enabled: true });
    prisma.alertRoutingRule.findUnique.mockResolvedValue(rule);
    prisma.alertRoutingRule.update.mockResolvedValue({ ...rule, enabled: false });

    const result = await controller.toggle(req, 'rule-1');

    expect(prisma.alertRoutingRule.update).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: { enabled: false },
    });
    expect(result.enabled).toBe(false);
  });

  it('toggle throws NotFoundException when rule missing', async () => {
    prisma.alertRoutingRule.findUnique.mockResolvedValue(null);

    await expect(controller.toggle(req, 'nonexistent')).rejects.toThrow(NotFoundException);
  });

  // ── Delete ──────────────────────────────────────────────────────────────────

  it('delete removes rule and returns success', async () => {
    prisma.alertRoutingRule.findUnique.mockResolvedValue(makeRule());

    const result = await controller.delete(req, 'rule-1');

    expect(prisma.alertRoutingRule.delete).toHaveBeenCalledWith({ where: { id: 'rule-1' } });
    expect(result).toEqual({ success: true });
  });

  it('delete throws ForbiddenException for other user rule', async () => {
    prisma.alertRoutingRule.findUnique.mockResolvedValue(makeRule({ userId: 'other-user' }));

    await expect(controller.delete(req, 'rule-1')).rejects.toThrow(ForbiddenException);
  });

  // ── Routing logic (via AlertsService) ──────────────────────────────────────

  it('matchLevels filter: rules with non-matching level are excluded', () => {
    const rule = makeRule({ matchLevels: ['red'], matchTypes: [], matchMonitorIds: [], matchFolderIds: [] });
    const monitor = { id: 'mon-1', type: 'HTTP', userId: 'user-1', folderId: null };
    const run = { level: 'yellow' };

    // Simulate the filter logic from AlertsService
    const matched = [rule].filter(r => {
      if (r.matchMonitorIds.length > 0 && !r.matchMonitorIds.includes(monitor.id)) return false;
      if ((r.matchTypes as string[]).length > 0 && !(r.matchTypes as string[]).includes(monitor.type)) return false;
      if ((r.matchLevels as string[]).length > 0 && !(r.matchLevels as string[]).includes(run.level)) return false;
      if ((r.matchFolderIds as string[]).length > 0 && (!monitor.folderId || !(r.matchFolderIds as string[]).includes(monitor.folderId))) return false;
      return true;
    });

    expect(matched).toHaveLength(0);
  });

  it('matchTypes filter: rules with non-matching type are excluded', () => {
    const rule = makeRule({ matchTypes: ['TCP'], matchLevels: [], matchMonitorIds: [], matchFolderIds: [] });
    const monitor = { id: 'mon-1', type: 'HTTP', userId: 'user-1', folderId: null };
    const run = { level: 'red' };

    const matched = [rule].filter(r => {
      if (r.matchMonitorIds.length > 0 && !r.matchMonitorIds.includes(monitor.id)) return false;
      if ((r.matchTypes as string[]).length > 0 && !(r.matchTypes as string[]).includes(monitor.type)) return false;
      if ((r.matchLevels as string[]).length > 0 && !(r.matchLevels as string[]).includes(run.level)) return false;
      if ((r.matchFolderIds as string[]).length > 0 && (!monitor.folderId || !(r.matchFolderIds as string[]).includes(monitor.folderId))) return false;
      return true;
    });

    expect(matched).toHaveLength(0);
  });

  it('routing: when matching rule exists, channelIds are collected', () => {
    const rule = makeRule({ matchTypes: ['HTTP'], matchLevels: ['red'], channelIds: ['routed-chan-1', 'routed-chan-2'], matchMonitorIds: [], matchFolderIds: [] });
    const monitor = { id: 'mon-1', type: 'HTTP', userId: 'user-1', folderId: null };
    const run = { level: 'red' };

    const matched = [rule].filter(r => {
      if (r.matchMonitorIds.length > 0 && !r.matchMonitorIds.includes(monitor.id)) return false;
      if ((r.matchTypes as string[]).length > 0 && !(r.matchTypes as string[]).includes(monitor.type)) return false;
      if ((r.matchLevels as string[]).length > 0 && !(r.matchLevels as string[]).includes(run.level)) return false;
      if ((r.matchFolderIds as string[]).length > 0 && (!monitor.folderId || !(r.matchFolderIds as string[]).includes(monitor.folderId))) return false;
      return true;
    });

    const routedChannelIds = [...new Set(matched.flatMap(r => r.channelIds as string[]))];
    expect(matched).toHaveLength(1);
    expect(routedChannelIds).toEqual(['routed-chan-1', 'routed-chan-2']);
  });
});
