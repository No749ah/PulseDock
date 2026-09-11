import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DependenciesController } from './dependencies.controller';

function makeService() {
  return {
    getDependencyGraph: vi.fn(),
    getDependenciesForMonitor: vi.fn(),
    setDependencies: vi.fn(),
    removeDependency: vi.fn(),
    getImpactAnalysis: vi.fn(),
  };
}

const req = { user: { id: 'u1' } };

describe('DependenciesController', () => {
  let ctrl: DependenciesController;
  let svc: ReturnType<typeof makeService>;

  beforeEach(() => {
    svc = makeService();
    ctrl = new DependenciesController(svc as never);
  });

  it('getGraph delegates to service', async () => {
    svc.getDependencyGraph.mockResolvedValue({ nodes: [], edges: [] });
    const result = await ctrl.getGraph(req);
    expect(svc.getDependencyGraph).toHaveBeenCalledWith('u1');
    expect(result.nodes).toEqual([]);
  });

  it('getDependencies delegates to service', async () => {
    svc.getDependenciesForMonitor.mockResolvedValue([{ id: 'dep1' }]);
    const result = await ctrl.getDependencies(req, 'mon1');
    expect(svc.getDependenciesForMonitor).toHaveBeenCalledWith('u1', 'mon1');
    expect(result).toHaveLength(1);
  });

  it('setDependencies delegates to service', async () => {
    svc.setDependencies.mockResolvedValue(undefined);
    const dto = { dependsOnIds: ['mon2', 'mon3'] };
    await ctrl.setDependencies(req, 'mon1', dto);
    expect(svc.setDependencies).toHaveBeenCalledWith('u1', 'mon1', dto);
  });

  it('removeDependency delegates to service', async () => {
    svc.removeDependency.mockResolvedValue(undefined);
    await ctrl.removeDependency(req, 'mon1', 'mon2');
    expect(svc.removeDependency).toHaveBeenCalledWith('u1', 'mon1', 'mon2');
  });

  it('getImpact delegates to service', async () => {
    svc.getImpactAnalysis.mockResolvedValue({ monitor: { id: 'mon1' }, affectedDownstream: [], rootCauses: [] });
    const result = await ctrl.getImpact(req, 'mon1');
    expect(svc.getImpactAnalysis).toHaveBeenCalledWith('u1', 'mon1');
    expect(result.monitor.id).toBe('mon1');
  });
});
