import { describe, it, expect, vi } from 'vitest';
import { VersionDetectionService } from './version-detection.service';

type MockRun = { checkedAt: Date; level: string };
type MockMonitor = {
  id: string;
  name: string;
  type: string;
  configJson: Record<string, unknown> | null;
  runs: MockRun[];
};

function buildService(monitors: MockMonitor[]): VersionDetectionService {
  const prisma = {
    monitor: { findMany: vi.fn().mockResolvedValue(monitors) },
  };
  return new VersionDetectionService(prisma as never);
}

function makeMonitor(
  id: string,
  name: string,
  currentVersion: string | null,
  latestVersion: string | null,
  level: 'green' | 'yellow' | 'red' = 'yellow',
): MockMonitor {
  return {
    id,
    name,
    type: 'GIT_RELEASE',
    configJson: {
      ...(currentVersion ? { currentVersion } : {}),
      ...(latestVersion ? { latestVersion } : {}),
    },
    runs: [{ checkedAt: new Date(), level }],
  };
}

describe('VersionDetectionService.driftReport', () => {
  it('returns empty result for no monitors', async () => {
    const svc = buildService([]);
    const r = await svc.driftReport('user-1');
    expect(r.versions).toHaveLength(0);
    expect(r.summary.total).toBe(0);
    expect(r.summary.upToDate).toBe(0);
  });

  it('detects major version behind', async () => {
    const svc = buildService([makeMonitor('1', 'Grafana', '9.0.0', '11.0.0', 'red')]);
    const r = await svc.driftReport('user-1');
    expect(r.versions[0].drift.kind).toBe('major');
    expect(r.versions[0].drift.majorBehind).toBe(2);
    expect(r.summary.majorBehind).toBe(1);
  });

  it('detects minor version behind', async () => {
    const svc = buildService([makeMonitor('2', 'Prometheus', 'v2.40.0', 'v2.44.0', 'red')]);
    const r = await svc.driftReport('user-1');
    expect(r.versions[0].drift.kind).toBe('minor');
    expect(r.versions[0].drift.minorBehind).toBe(4);
    expect(r.summary.minorBehind).toBe(1);
  });

  it('detects patch version behind', async () => {
    const svc = buildService([makeMonitor('3', 'Redis', '7.2.1', '7.2.5', 'red')]);
    const r = await svc.driftReport('user-1');
    expect(r.versions[0].drift.kind).toBe('patch');
    expect(r.versions[0].drift.patchBehind).toBe(4);
    expect(r.summary.patchBehind).toBe(1);
  });

  it('marks up-to-date when versions match', async () => {
    const svc = buildService([makeMonitor('4', 'Nginx', '1.24.0', '1.24.0', 'green')]);
    const r = await svc.driftReport('user-1');
    expect(r.versions[0].drift.kind).toBe('up-to-date');
    expect(r.summary.upToDate).toBe(1);
  });

  it('marks unknown when versions are null', async () => {
    const svc = buildService([makeMonitor('5', 'CustomApp', null, null)]);
    const r = await svc.driftReport('user-1');
    expect(r.versions[0].drift.kind).toBe('unknown');
    expect(r.summary.unknown).toBe(1);
  });

  it('sorts by severity: major first, then minor, then patch', async () => {
    const svc = buildService([
      makeMonitor('a', 'A', '1.0.0', '1.0.5', 'red'),
      makeMonitor('b', 'B', '1.0.0', '2.0.0', 'red'),
      makeMonitor('c', 'C', '1.0.0', '1.5.0', 'red'),
    ]);
    const r = await svc.driftReport('user-1');
    expect(r.versions[0].drift.kind).toBe('major');
    expect(r.versions[1].drift.kind).toBe('minor');
    expect(r.versions[2].drift.kind).toBe('patch');
  });

  it('computes correct drift scores', async () => {
    const svc = buildService([
      makeMonitor('x', 'X', '1.0.0', '3.0.0', 'red'), // 2 major = score 200
    ]);
    const r = await svc.driftReport('user-1');
    expect(r.versions[0].drift.driftScore).toBe(200);
    expect(r.summary.avgDriftScore).toBe(200);
  });
});
