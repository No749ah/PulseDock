import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentController } from './agent.controller';

function makeAgentService() {
  return {
    report: vi.fn(),
    status: vi.fn(),
  };
}

function makeReq(userId = 'user-1') {
  return {
    user: { id: userId, email: 'user@example.com', role: 'user' },
    headers: { 'user-agent': 'test-agent' },
    ip: '127.0.0.1',
  };
}

describe('AgentController', () => {
  let controller: AgentController;
  let agentService: ReturnType<typeof makeAgentService>;

  beforeEach(() => {
    agentService = makeAgentService();
    controller = new AgentController(agentService as never);
  });

  describe('report()', () => {
    it('delegates to agentService.report with user id from request', async () => {
      const body = { toolId: 'proxmox-ve', version: '8.1.3', hostname: 'pve-node' };
      const expected = { ok: true, monitorId: 'mon-1', version: '8.1.3' };
      agentService.report.mockResolvedValue(expected);

      const result = await controller.report(makeReq() as never, body);

      expect(agentService.report).toHaveBeenCalledWith('user-1', body);
      expect(result).toEqual(expected);
    });

    it('passes body through unchanged including optional monitorId', async () => {
      const body = { toolId: 'docker-engine', version: 'v24.0.5', monitorId: 'mon-42' };
      agentService.report.mockResolvedValue({ ok: true, monitorId: 'mon-42', version: '24.0.5' });

      await controller.report(makeReq('user-99') as never, body);

      expect(agentService.report).toHaveBeenCalledWith('user-99', body);
    });
  });

  describe('status()', () => {
    it('delegates to agentService.status with user id from request', async () => {
      const expected = [
        {
          monitorId: 'mon-1',
          monitorName: 'Proxmox VE',
          toolId: 'proxmox-ve',
          version: '8.1.3',
          hostname: 'pve-host',
          reportedAt: '2026-03-17T05:00:00.000Z',
        },
      ];
      agentService.status.mockResolvedValue(expected);

      const result = await controller.status(makeReq() as never);

      expect(agentService.status).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(expected);
    });

    it('returns empty array when no agent monitors exist', async () => {
      agentService.status.mockResolvedValue([]);

      const result = await controller.status(makeReq('user-2') as never);

      expect(agentService.status).toHaveBeenCalledWith('user-2');
      expect(result).toEqual([]);
    });
  });
});
