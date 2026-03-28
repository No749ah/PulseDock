import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { IncidentsService } from './incidents.service';

function makeService(overrides: {
  incidentFindFirst?: () => unknown;
  monitorRunCount?: (args: { where: { ok?: boolean } }) => number;
  monitorRunFindFirst?: () => unknown;
  incidentUpdate?: () => unknown;
} = {}) {
  const prismaMock = {
    incident: {
      findFirst: vi.fn(overrides.incidentFindFirst ?? (() => null)),
      update: vi.fn(overrides.incidentUpdate ?? (() => ({}))),
    },
    monitorRun: {
      count: vi.fn((args: { where?: { ok?: boolean } } = {}) => {
        if (overrides.monitorRunCount) return overrides.monitorRunCount(args as { where: { ok?: boolean } });
        return args?.where?.ok === false ? 2 : 10;
      }),
      findFirst: vi.fn(overrides.monitorRunFindFirst ?? (() => null)),
    },
  };
  return new IncidentsService(
    prismaMock as never,
    null as never,
    null as never,
  );
}

const resolvedIncident = {
  id: 'inc1',
  userId: 'user1',
  title: 'API Outage',
  description: 'API was down',
  status: 'RESOLVED',
  severity: 'HIGH',
  rootCause: null,
  postmortemNotes: null,
  createdAt: new Date('2026-01-01T10:00:00Z'),
  resolvedAt: new Date('2026-01-01T11:30:00Z'), // 90 min outage
  updatedAt: new Date('2026-01-01T11:30:00Z'),
  updates: [
    { id: 'u1', body: 'Incident detected', status: 'INVESTIGATING', createdAt: new Date('2026-01-01T10:00:00Z') },
    { id: 'u2', body: 'Root cause identified', status: 'IDENTIFIED', createdAt: new Date('2026-01-01T10:45:00Z') },
    { id: 'u3', body: 'Issue resolved', status: 'RESOLVED', createdAt: new Date('2026-01-01T11:30:00Z') },
  ],
  monitors: [
    { monitorId: 'mon1', monitor: { id: 'mon1', name: 'API Health', type: 'HTTP', target: 'https://api.example.com' } },
  ],
};

describe('IncidentsService.generatePostmortem', () => {
  it('throws NotFoundException when incident not found', async () => {
    const svc = makeService({ incidentFindFirst: () => null });
    await expect(svc.generatePostmortem('user1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('returns markdown with correct title and duration', async () => {
    const svc = makeService({ incidentFindFirst: () => resolvedIncident });
    const result = await svc.generatePostmortem('user1', 'inc1');
    expect(result.markdown).toContain('# Post-Mortem: API Outage');
    expect(result.markdown).toContain('1h 30m');
    expect(result.markdown).toContain('HIGH');
  });

  it('includes timeline updates in generated markdown', async () => {
    const svc = makeService({ incidentFindFirst: () => resolvedIncident });
    const result = await svc.generatePostmortem('user1', 'inc1');
    expect(result.markdown).toContain('Incident detected');
    expect(result.markdown).toContain('Root cause identified');
    expect(result.markdown).toContain('Issue resolved');
    expect(result.markdown).toContain('INVESTIGATING');
  });

  it('saves postmortem when postmortemNotes is null and returns saved: true', async () => {
    const updateMock = vi.fn(() => ({}));
    const svc = makeService({
      incidentFindFirst: () => resolvedIncident,
      incidentUpdate: updateMock,
    });
    const result = await svc.generatePostmortem('user1', 'inc1');
    expect(result.saved).toBe(true);
    expect(updateMock).toHaveBeenCalledOnce();
  });

  it('does NOT overwrite existing postmortemNotes and returns saved: false', async () => {
    const existingNotes = 'Already written notes';
    const updateMock = vi.fn(() => ({}));
    const svc = makeService({
      incidentFindFirst: () => ({ ...resolvedIncident, postmortemNotes: existingNotes }),
      incidentUpdate: updateMock,
    });
    const result = await svc.generatePostmortem('user1', 'inc1');
    expect(result.saved).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
    // existing notes should appear in the Lessons Learned section
    expect(result.markdown).toContain(existingNotes);
  });
});
