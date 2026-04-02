import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorsDiagnosticsController } from './monitors-diagnostics.controller';

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

function makeDiagnosticsService() {
  return {
    getHealthScore: vi.fn(),
    checkRate: vi.fn(),
    monitorCoverage: vi.fn(),
    getHealthSummary: vi.fn(),
    allHealthScores: vi.fn(),
    healthScoreLeaderboard: vi.fn(),
    checkSchedule: vi.fn(),
    intervalOptimizer: vi.fn(),
    getSslSummary: vi.fn(),
    getSecurityHeadersSummary: vi.fn(),
    ctLogHistory: vi.fn(),
    redirectChainStats: vi.fn(),
  };
}

describe('MonitorsDiagnosticsController', () => {
  let controller: MonitorsDiagnosticsController;
  let service: ReturnType<typeof makeDiagnosticsService>;

  beforeEach(() => {
    service = makeDiagnosticsService();
    controller = new MonitorsDiagnosticsController(service as never);
  });

  // ─── healthScore ──────────────────────────────────────────────────────────

  it('healthScore() delegates to diagnosticsService.getHealthScore', async () => {
    service.getHealthScore.mockResolvedValue({ score: 87, grade: 'A', breakdown: {} });
    const result = await controller.healthScore(makeReq(), 'm-1');
    expect(service.getHealthScore).toHaveBeenCalledWith('user-1', 'm-1');
    expect(result).toEqual(expect.objectContaining({ score: 87, grade: 'A' }));
  });

  it('healthScore() passes the correct monitor id', async () => {
    service.getHealthScore.mockResolvedValue({ score: 50, grade: 'C' });
    await controller.healthScore(makeReq(), 'mon-xyz');
    expect(service.getHealthScore).toHaveBeenCalledWith('user-1', 'mon-xyz');
  });

  // ─── checkRate ───────────────────────────────────────────────────────────

  it('checkRate() delegates to diagnosticsService.checkRate', async () => {
    service.checkRate.mockResolvedValue({ intervalSec: 60, isThrottled: false });
    const result = await controller.checkRate(makeReq(), 'm-1');
    expect(service.checkRate).toHaveBeenCalledWith('user-1', 'm-1');
    expect(result).toEqual(expect.objectContaining({ intervalSec: 60 }));
  });

  // ─── monitorCoverage ─────────────────────────────────────────────────────

  it('monitorCoverage() delegates to diagnosticsService.monitorCoverage', async () => {
    service.monitorCoverage.mockResolvedValue({ score: 80, gaps: [] });
    const result = await controller.monitorCoverage(makeReq());
    expect(service.monitorCoverage).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ score: 80, gaps: [] });
  });

  // ─── healthSummary ───────────────────────────────────────────────────────

  it('healthSummary() delegates to diagnosticsService.getHealthSummary', async () => {
    service.getHealthSummary.mockResolvedValue({ scores: [], overall: { avg: 0 } });
    await controller.healthSummary(makeReq());
    expect(service.getHealthSummary).toHaveBeenCalledWith('user-1');
  });

  // ─── healthScores ────────────────────────────────────────────────────────

  it('healthScores() delegates to diagnosticsService.allHealthScores', async () => {
    service.allHealthScores.mockResolvedValue([{ monitorId: 'm-1', score: 90 }]);
    const result = await controller.healthScores(makeReq());
    expect(service.allHealthScores).toHaveBeenCalledWith('user-1');
    expect(result).toHaveLength(1);
  });

  // ─── healthScoreLeaderboard ──────────────────────────────────────────────

  it('healthScoreLeaderboard() delegates to diagnosticsService.healthScoreLeaderboard', async () => {
    service.healthScoreLeaderboard.mockResolvedValue([]);
    await controller.healthScoreLeaderboard(makeReq());
    expect(service.healthScoreLeaderboard).toHaveBeenCalledWith('user-1');
  });

  // ─── checkSchedule ───────────────────────────────────────────────────────

  it('checkSchedule() delegates to diagnosticsService.checkSchedule', async () => {
    service.checkSchedule.mockResolvedValue({ monitors: [], hourlyBuckets: [] });
    await controller.checkSchedule(makeReq());
    expect(service.checkSchedule).toHaveBeenCalledWith('user-1');
  });

  // ─── intervalOptimizer ───────────────────────────────────────────────────

  it('intervalOptimizer() delegates to diagnosticsService.intervalOptimizer', async () => {
    service.intervalOptimizer.mockResolvedValue({ recommendations: [] });
    await controller.intervalOptimizer(makeReq());
    expect(service.intervalOptimizer).toHaveBeenCalledWith('user-1');
  });

  // ─── sslSummary ──────────────────────────────────────────────────────────

  it('sslSummary() delegates to diagnosticsService.getSslSummary', async () => {
    service.getSslSummary.mockResolvedValue({ total: 0, expired: 0, certs: [] });
    const result = await controller.sslSummary(makeReq());
    expect(service.getSslSummary).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(expect.objectContaining({ total: 0 }));
  });

  // ─── securityHeadersSummary ──────────────────────────────────────────────

  it('securityHeadersSummary() delegates to diagnosticsService.getSecurityHeadersSummary', async () => {
    service.getSecurityHeadersSummary.mockResolvedValue({ gradeDistribution: {}, monitors: [] });
    await controller.securityHeadersSummary(makeReq());
    expect(service.getSecurityHeadersSummary).toHaveBeenCalledWith('user-1');
  });

  // ─── ctLogHistory ────────────────────────────────────────────────────────

  it('ctLogHistory() delegates to diagnosticsService.ctLogHistory', async () => {
    service.ctLogHistory.mockResolvedValue({ entries: [] });
    await controller.ctLogHistory(makeReq(), 'm-1');
    expect(service.ctLogHistory).toHaveBeenCalledWith('user-1', 'm-1');
  });

  // ─── redirectChainStats ──────────────────────────────────────────────────

  it('redirectChainStats() delegates to diagnosticsService.redirectChainStats', async () => {
    service.redirectChainStats.mockResolvedValue({ avgHops: 1, maxHops: 3 });
    const result = await controller.redirectChainStats(makeReq(), 'm-1');
    expect(service.redirectChainStats).toHaveBeenCalledWith('user-1', 'm-1');
    expect(result).toEqual(expect.objectContaining({ avgHops: 1 }));
  });

  // ─── user isolation ──────────────────────────────────────────────────────

  it('passes correct userId from request to all service calls', async () => {
    service.getHealthScore.mockResolvedValue({});
    await controller.healthScore({ user: { id: 'user-42' } }, 'mon-1');
    expect(service.getHealthScore).toHaveBeenCalledWith('user-42', 'mon-1');
  });

  it('monitorCoverage() uses correct userId', async () => {
    service.monitorCoverage.mockResolvedValue({});
    await controller.monitorCoverage({ user: { id: 'other-user' } });
    expect(service.monitorCoverage).toHaveBeenCalledWith('other-user');
  });
});
