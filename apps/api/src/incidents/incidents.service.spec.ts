import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IncidentsService } from './incidents.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { IncidentStatus, IncidentSeverity } from '@prisma/client';

const mockIncident = {
  id: 'inc-1',
  userId: 'user-1',
  title: 'API degraded',
  description: 'High error rate on API',
  status: IncidentStatus.INVESTIGATING,
  severity: IncidentSeverity.HIGH,
  resolvedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  updates: [],
  monitors: [],
  _count: { updates: 0 },
};

function makePrisma(overrides: Partial<{
  incidentFindMany: ReturnType<typeof vi.fn>;
  incidentFindFirst: ReturnType<typeof vi.fn>;
  incidentCreate: ReturnType<typeof vi.fn>;
  incidentUpdate: ReturnType<typeof vi.fn>;
  incidentDelete: ReturnType<typeof vi.fn>;
  incidentMonitorDelete: ReturnType<typeof vi.fn>;
  incidentMonitorCreate: ReturnType<typeof vi.fn>;
  incidentUpdateCreate: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    incident: {
      findMany: overrides.incidentFindMany ?? vi.fn().mockResolvedValue([mockIncident]),
      findFirst: overrides.incidentFindFirst ?? vi.fn().mockResolvedValue(mockIncident),
      create: overrides.incidentCreate ?? vi.fn().mockResolvedValue({ ...mockIncident, updates: [{ id: 'upd-1', body: 'Incident created', status: IncidentStatus.INVESTIGATING, createdAt: new Date() }] }),
      update: overrides.incidentUpdate ?? vi.fn().mockResolvedValue(mockIncident),
      delete: overrides.incidentDelete ?? vi.fn().mockResolvedValue(mockIncident),
    },
    incidentMonitor: {
      deleteMany: overrides.incidentMonitorDelete ?? vi.fn().mockResolvedValue({ count: 0 }),
      createMany: overrides.incidentMonitorCreate ?? vi.fn().mockResolvedValue({ count: 0 }),
    },
    incidentUpdate: {
      create: overrides.incidentUpdateCreate ?? vi.fn().mockResolvedValue({ id: 'upd-1', body: 'Investigating', status: IncidentStatus.INVESTIGATING, createdAt: new Date() }),
    },
  };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function makeStatusPages() {
  return {
    notifySubscribersOfIncident: vi.fn().mockResolvedValue(undefined),
  };
}

describe('IncidentsService', () => {
  let service: IncidentsService;
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;
  let statusPages: ReturnType<typeof makeStatusPages>;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    statusPages = makeStatusPages();
    service = new IncidentsService(prisma as never, audit as never, statusPages as never);
  });

  // ── findAll ──────────────────────────────────────────────
  describe('findAll', () => {
    it('returns list of incidents for user', async () => {
      const result = await service.findAll('user-1');
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(result).toEqual([mockIncident]);
    });
  });

  // ── findOne ──────────────────────────────────────────────
  describe('findOne', () => {
    it('returns incident by id', async () => {
      const result = await service.findOne('user-1', 'inc-1');
      expect(result).toMatchObject({ id: 'inc-1' });
    });

    it('throws NotFoundException when incident not found', async () => {
      prisma.incident.findFirst = vi.fn().mockResolvedValue(null);
      await expect(service.findOne('user-1', 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ───────────────────────────────────────────────
  describe('create', () => {
    it('creates incident with defaults', async () => {
      await service.create('user-1', { title: 'API down' });
      expect(prisma.incident.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: 'API down', severity: IncidentSeverity.MEDIUM }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith('incident.created', 'user-1', 'user-1', expect.any(Object));
    });

    it('creates incident with custom severity and monitors', async () => {
      await service.create('user-1', {
        title: 'Critical outage',
        severity: IncidentSeverity.CRITICAL,
        monitorIds: ['mon-1', 'mon-2'],
      });
      expect(prisma.incident.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ severity: IncidentSeverity.CRITICAL }),
        }),
      );
    });

    it('throws BadRequestException for empty title', async () => {
      await expect(service.create('user-1', { title: '' })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for whitespace-only title', async () => {
      await expect(service.create('user-1', { title: '   ' })).rejects.toThrow(BadRequestException);
    });
  });

  // ── update ───────────────────────────────────────────────
  describe('update', () => {
    it('updates incident fields', async () => {
      await service.update('user-1', 'inc-1', { title: 'Updated title', severity: IncidentSeverity.LOW });
      expect(prisma.incident.update).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith('incident.updated', 'user-1', 'user-1', expect.any(Object));
    });

    it('sets resolvedAt when status changes to RESOLVED', async () => {
      await service.update('user-1', 'inc-1', { status: IncidentStatus.RESOLVED });
      const call = (prisma.incident.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.data.resolvedAt).toBeInstanceOf(Date);
    });

    it('clears resolvedAt when status changes from RESOLVED back to active', async () => {
      prisma.incident.findFirst = vi.fn().mockResolvedValue({ ...mockIncident, status: IncidentStatus.RESOLVED, resolvedAt: new Date() });
      await service.update('user-1', 'inc-1', { status: IncidentStatus.INVESTIGATING });
      const call = (prisma.incident.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.data.resolvedAt).toBeNull();
    });

    it('throws NotFoundException when incident not found', async () => {
      prisma.incident.findFirst = vi.fn().mockResolvedValue(null);
      await expect(service.update('user-1', 'bad-id', { title: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('updates monitor links when monitorIds provided', async () => {
      await service.update('user-1', 'inc-1', { monitorIds: ['mon-1'] });
      expect(prisma.incidentMonitor.deleteMany).toHaveBeenCalledWith({ where: { incidentId: 'inc-1' } });
      expect(prisma.incidentMonitor.createMany).toHaveBeenCalled();
    });

    it('clears monitor links when monitorIds is empty array', async () => {
      await service.update('user-1', 'inc-1', { monitorIds: [] });
      expect(prisma.incidentMonitor.deleteMany).toHaveBeenCalled();
      expect(prisma.incidentMonitor.createMany).not.toHaveBeenCalled();
    });
  });

  // ── addUpdate ────────────────────────────────────────────
  describe('addUpdate', () => {
    it('adds an update and syncs incident status', async () => {
      const result = await service.addUpdate('user-1', 'inc-1', {
        body: 'We identified the root cause',
        status: IncidentStatus.IDENTIFIED,
      });
      expect(prisma.incidentUpdate.create).toHaveBeenCalled();
      expect(prisma.incident.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'inc-1' }, data: expect.objectContaining({ status: IncidentStatus.IDENTIFIED }) }),
      );
      expect(result).toMatchObject({ id: 'upd-1' });
    });

    it('sets resolvedAt when update marks incident RESOLVED', async () => {
      await service.addUpdate('user-1', 'inc-1', { body: 'Fixed', status: IncidentStatus.RESOLVED });
      const call = (prisma.incident.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.data.resolvedAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException for unknown incident', async () => {
      prisma.incident.findFirst = vi.fn().mockResolvedValue(null);
      await expect(service.addUpdate('user-1', 'bad-id', { body: 'x', status: IncidentStatus.INVESTIGATING })).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for empty body', async () => {
      await expect(service.addUpdate('user-1', 'inc-1', { body: '', status: IncidentStatus.INVESTIGATING })).rejects.toThrow(BadRequestException);
    });
  });

  // ── delete ───────────────────────────────────────────────
  describe('delete', () => {
    it('deletes incident and logs audit', async () => {
      await service.delete('user-1', 'inc-1');
      expect(prisma.incident.delete).toHaveBeenCalledWith({ where: { id: 'inc-1' } });
      expect(audit.log).toHaveBeenCalledWith('incident.deleted', 'user-1', 'user-1', expect.any(Object));
    });

    it('throws NotFoundException for unknown incident', async () => {
      prisma.incident.findFirst = vi.fn().mockResolvedValue(null);
      await expect(service.delete('user-1', 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getPublicIncidents ───────────────────────────────────
  describe('getPublicIncidents', () => {
    it('fetches incidents for a user', async () => {
      await service.getPublicIncidents('user-1');
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
    });
  });

  // ── Branch coverage: update() description null branch (line 135) ─────────
  describe('update() — description null branch', () => {
    it('sets description to null when description is passed as null', async () => {
      // dto.description !== undefined → true (null !== undefined)
      // dto.description?.trim() → undefined (null?.trim() === undefined)
      // ?? null → null (hits the null fallback branch)
      await service.update('user-1', 'inc-1', { description: null as unknown as string });
      const call = (prisma.incident.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // The spread should include description: null
      expect(call.data).toHaveProperty('description', null);
    });
  });

  // ── Branch coverage: addUpdate() resolvedAt=undefined branch (line 175) ──
  describe('addUpdate() — already RESOLVED stays RESOLVED', () => {
    it('passes resolvedAt=undefined when status stays RESOLVED (keeps existing resolvedAt)', async () => {
      // Incident is already RESOLVED, and new update status is also RESOLVED
      // → neither branch matches, resolvedAt should be undefined (not spread into data)
      const resolvedAt = new Date();
      prisma.incident.findFirst = vi.fn().mockResolvedValue({
        ...mockIncident,
        status: IncidentStatus.RESOLVED,
        resolvedAt,
      });
      await service.addUpdate('user-1', 'inc-1', { body: 'Still resolved', status: IncidentStatus.RESOLVED });
      const call = (prisma.incident.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // resolvedAt should be undefined (not null, not a new Date)
      expect(call.data.resolvedAt).toBeUndefined();
    });
  });

  // ── Post-mortem fields ────────────────────────────────────────────────────
  describe('update() — post-mortem fields', () => {
    it('saves rootCause when provided', async () => {
      await service.update('user-1', 'inc-1', { rootCause: 'Database ran out of connections' });
      const call = (prisma.incident.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.data).toHaveProperty('rootCause', 'Database ran out of connections');
    });

    it('saves postmortemNotes when provided', async () => {
      await service.update('user-1', 'inc-1', { postmortemNotes: 'Increase connection pool size' });
      const call = (prisma.incident.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.data).toHaveProperty('postmortemNotes', 'Increase connection pool size');
    });

    it('sets rootCause to null when passed null', async () => {
      await service.update('user-1', 'inc-1', { rootCause: null });
      const call = (prisma.incident.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.data).toHaveProperty('rootCause', null);
    });

    it('does not include rootCause when not in dto', async () => {
      await service.update('user-1', 'inc-1', { title: 'Updated title' });
      const call = (prisma.incident.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.data).not.toHaveProperty('rootCause');
    });

    it('truncates rootCause to 5000 chars', async () => {
      const longString = 'x'.repeat(6000);
      await service.update('user-1', 'inc-1', { rootCause: longString });
      const call = (prisma.incident.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect((call.data.rootCause as string).length).toBe(5000);
    });

    it('truncates postmortemNotes to 10000 chars', async () => {
      const longString = 'y'.repeat(12000);
      await service.update('user-1', 'inc-1', { postmortemNotes: longString });
      const call = (prisma.incident.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect((call.data.postmortemNotes as string).length).toBe(10000);
    });
  });
});
