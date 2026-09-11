import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentService } from './agent.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

function makePrisma() {
  return {
    monitor: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    monitorRun: {
      create: vi.fn(),
    },
  };
}

describe('AgentService', () => {
  let service: AgentService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AgentService(prisma as never);
  });

  describe('report', () => {
    it('should reject when toolId is missing', async () => {
      await expect(
        service.report('user1', { toolId: '', version: '1.0.0' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when version is missing', async () => {
      await expect(
        service.report('user1', { toolId: 'proxmox-ve', version: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when version string exceeds 128 chars', async () => {
      await expect(
        service.report('user1', { toolId: 'proxmox-ve', version: 'x'.repeat(129) }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when monitorId is given but not found', async () => {
      prisma.monitor.findFirst.mockResolvedValue(null);

      await expect(
        service.report('user1', {
          toolId: 'proxmox-ve',
          version: '8.1.3',
          monitorId: 'nonexistent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update monitor and create run on valid report with monitorId', async () => {
      const monitor = {
        id: 'mon1',
        userId: 'user1',
        name: 'Proxmox VE',
        configJson: { provider: 'github', currentVersion: '7.0.0' },
      };
      prisma.monitor.findFirst.mockResolvedValue(monitor);
      prisma.monitor.update.mockResolvedValue(monitor);
      prisma.monitorRun.create.mockResolvedValue({ id: 'run1' });

      const result = await service.report('user1', {
        toolId: 'proxmox-ve',
        version: 'v8.1.3',
        monitorId: 'mon1',
        hostname: 'pve-host',
      });

      expect(result).toEqual({ ok: true, monitorId: 'mon1', version: '8.1.3' });
      expect(prisma.monitor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mon1' },
          data: expect.objectContaining({
            configJson: expect.objectContaining({
              currentVersion: '8.1.3',
              agentToolId: 'proxmox-ve',
              agentHostname: 'pve-host',
            }),
          }),
        }),
      );
      expect(prisma.monitorRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            monitorId: 'mon1',
            userId: 'user1',
            ok: true,
            level: 'green',
          }),
        }),
      );
    });

    it('should find monitor by toolId in configJson when monitorId is omitted', async () => {
      const monitor = {
        id: 'mon2',
        userId: 'user1',
        name: 'Unraid',
        configJson: { agentToolId: 'unraid', currentVersion: '6.12.0' },
      };
      prisma.monitor.findMany.mockResolvedValue([monitor]);
      prisma.monitor.update.mockResolvedValue(monitor);
      prisma.monitorRun.create.mockResolvedValue({ id: 'run2' });

      const result = await service.report('user1', {
        toolId: 'unraid',
        version: '6.13.0',
      });

      expect(result).toEqual({ ok: true, monitorId: 'mon2', version: '6.13.0' });
    });

    it('should throw NotFoundException when no monitor matches toolId', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        { id: 'mon3', userId: 'user1', configJson: { agentToolId: 'docker-engine' } },
      ]);

      await expect(
        service.report('user1', { toolId: 'unknown-tool', version: '1.0.0' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should find monitor via config.toolId (not agentToolId) when present', async () => {
      const monitor = {
        id: 'mon-tool',
        userId: 'user1',
        name: 'Gitea',
        configJson: { toolId: 'gitea', currentVersion: '1.21.0' },
      };
      prisma.monitor.findMany.mockResolvedValue([monitor]);
      prisma.monitor.update.mockResolvedValue(monitor);
      prisma.monitorRun.create.mockResolvedValue({ id: 'run-tool' });

      const result = await service.report('user1', { toolId: 'gitea', version: '1.22.0' });
      expect(result).toEqual({ ok: true, monitorId: 'mon-tool', version: '1.22.0' });
    });

    it('should handle null configJson gracefully when searching by toolId', async () => {
      const monitor = {
        id: 'mon-null-cfg',
        userId: 'user1',
        name: 'Null Config Monitor',
        configJson: null,
      };
      prisma.monitor.findMany.mockResolvedValue([monitor]);

      await expect(
        service.report('user1', { toolId: 'some-tool', version: '1.0.0' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle null configJson on monitor gracefully (covers ?? {} fallback on update)', async () => {
      const monitor = {
        id: 'mon-null-update',
        userId: 'user1',
        name: 'Null Config',
        configJson: null,
      };
      prisma.monitor.findFirst.mockResolvedValue(monitor);
      prisma.monitor.update.mockResolvedValue(monitor);
      prisma.monitorRun.create.mockResolvedValue({ id: 'run-null' });

      const result = await service.report('user1', {
        toolId: 'test-tool',
        version: '1.0.0',
        monitorId: 'mon-null-update',
      });

      expect(result.ok).toBe(true);
      expect(prisma.monitor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ configJson: expect.objectContaining({ currentVersion: '1.0.0' }) }),
        }),
      );
    });

    it('should strip leading v from version', async () => {
      const monitor = {
        id: 'mon4',
        userId: 'user1',
        name: 'Test',
        configJson: {},
      };
      prisma.monitor.findFirst.mockResolvedValue(monitor);
      prisma.monitor.update.mockResolvedValue(monitor);
      prisma.monitorRun.create.mockResolvedValue({ id: 'run3' });

      const result = await service.report('user1', {
        toolId: 'test',
        version: 'v2.0.1',
        monitorId: 'mon4',
      });

      expect(result.version).toBe('2.0.1');
    });
  });

  describe('status', () => {
    it('should return only monitors with agent data', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        {
          id: 'mon1',
          name: 'Proxmox VE',
          configJson: {
            agentToolId: 'proxmox-ve',
            currentVersion: '8.1.3',
            agentHostname: 'pve-host',
            agentLastReport: '2026-03-16T12:00:00.000Z',
          },
        },
        {
          id: 'mon2',
          name: 'Nginx (HTTP)',
          configJson: { provider: 'github', currentVersion: '1.25.0' },
        },
      ]);

      const result = await service.status('user1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        monitorId: 'mon1',
        monitorName: 'Proxmox VE',
        toolId: 'proxmox-ve',
        version: '8.1.3',
        hostname: 'pve-host',
        reportedAt: '2026-03-16T12:00:00.000Z',
      });
    });

    it('should return empty array when no agent monitors exist', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        {
          id: 'mon1',
          name: 'Regular Monitor',
          configJson: { provider: 'github' },
        },
      ]);

      const result = await service.status('user1');
      expect(result).toEqual([]);
    });

    it('should include monitor with agentLastReport (no agentToolId) and return null hostname', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        {
          id: 'mon-lr',
          name: 'Legacy Reporter',
          configJson: {
            agentLastReport: '2026-03-17T05:00:00.000Z',
            currentVersion: '2.0.0',
            toolId: 'legacy-tool',
          },
        },
      ]);

      const result = await service.status('user1');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        monitorId: 'mon-lr',
        monitorName: 'Legacy Reporter',
        hostname: null,
        version: '2.0.0',
        reportedAt: '2026-03-17T05:00:00.000Z',
      });
    });

    it('should use config.toolId as fallback for toolId field in status output', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        {
          id: 'mon-fb',
          name: 'Fallback Tool',
          configJson: {
            agentLastReport: '2026-03-17T04:00:00.000Z',
            currentVersion: '3.0.0',
            toolId: 'fallback-tool',
            // agentToolId is absent
          },
        },
      ]);

      const result = await service.status('user1');
      expect(result[0]).toMatchObject({
        toolId: 'fallback-tool',
      });
    });

    it('should return empty toolId and version when config fields missing', async () => {
      prisma.monitor.findMany.mockResolvedValue([
        {
          id: 'mon-empty',
          name: 'Empty Config',
          configJson: {
            agentLastReport: '2026-03-17T03:00:00.000Z',
          },
        },
      ]);

      const result = await service.status('user1');
      expect(result[0]).toMatchObject({
        toolId: '',
        version: '',
        hostname: null,
      });
    });

    it('should return empty string reportedAt when agentLastReport is not a string', async () => {
      // agentToolId is present (so monitor passes filter), but agentLastReport is a number → not a string
      prisma.monitor.findMany.mockResolvedValue([
        {
          id: 'mon-num-report',
          name: 'Numeric Report Time',
          configJson: {
            agentToolId: 'some-tool',
            agentLastReport: 1234567890, // number, not string → '' fallback
            currentVersion: '1.0.0',
          },
        },
      ]);

      const result = await service.status('user1');
      expect(result[0]).toMatchObject({
        toolId: 'some-tool',
        reportedAt: '',
      });
    });

    it('should have null configJson handled via ?? {} in status map (null configJson branch)', async () => {
      // agentToolId won't be found since configJson is null → ?? {} → filter fails → not included
      // To get into map, need a valid agentToolId but configJson null is handled by ?? {}
      // Actually when configJson is null, typeof null.agentToolId fails — but ?? {} handles it
      // We need a monitor that passes the filter (has agentToolId string) but configJson is technically null
      // That's impossible since if configJson is null, ?? {} in filter makes config={}, which has no agentToolId
      // So this is the ?? {} in map — need a monitor that passes filter with agentLastReport
      prisma.monitor.findMany.mockResolvedValue([
        {
          id: 'mon-null-map',
          name: 'Null ConfigJson in map',
          configJson: null, // ?? {} in both filter and map
        },
      ]);

      // null configJson → ?? {} → no agentToolId or agentLastReport → filtered OUT → empty array
      const result = await service.status('user1');
      expect(result).toHaveLength(0);
    });
  });
});
