import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../common/prisma.service';
import { MailerService } from '../common/mailer.service';
import { ScheduleModule } from '@nestjs/schedule';

const mockPrisma = {
  scheduledReport: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  monitor: { findMany: vi.fn() },
  monitorRun: { findMany: vi.fn() },
  incident: { count: vi.fn() },
  $queryRaw: vi.fn(),
};

const mockMailer = { sendUptimeReport: vi.fn() };

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailerService, useValue: mockMailer },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('getReport (findAll)', () => {
    it("returns the user's scheduled report", async () => {
      const userId = 'user-123';
      const mockReport = {
        id: 'report-1',
        userId,
        enabled: true,
        frequency: 'weekly',
        dayOfWeek: 1,
        hourUtc: 8,
        lastSentAt: null,
      };
      mockPrisma.scheduledReport.findUnique.mockResolvedValue(mockReport);

      const result = await service.getReport(userId);

      expect(mockPrisma.scheduledReport.findUnique).toHaveBeenCalledWith({ where: { userId } });
      expect(result).toEqual(mockReport);
    });

    it('returns null when no report exists for the user', async () => {
      mockPrisma.scheduledReport.findUnique.mockResolvedValue(null);
      const result = await service.getReport('no-user');
      expect(result).toBeNull();
    });
  });

  describe('upsertReport (create / update)', () => {
    it('creates a new report with correct userId', async () => {
      const userId = 'user-abc';
      const dto = { enabled: true, frequency: 'weekly', dayOfWeek: 1, hourUtc: 9 };
      const mockCreated = { id: 'report-new', userId, ...dto, lastSentAt: null };
      mockPrisma.scheduledReport.upsert.mockResolvedValue(mockCreated);

      const result = await service.upsertReport(userId, dto);

      expect(mockPrisma.scheduledReport.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          create: expect.objectContaining({ userId }),
        }),
      );
      expect(result.userId).toBe(userId);
    });

    it('updates report settings', async () => {
      const userId = 'user-abc';
      const dto = { frequency: 'daily' };
      const mockUpdated = {
        id: 'report-new',
        userId,
        enabled: true,
        frequency: 'daily',
        dayOfWeek: 1,
        hourUtc: 8,
        lastSentAt: null,
      };
      mockPrisma.scheduledReport.upsert.mockResolvedValue(mockUpdated);

      const result = await service.upsertReport(userId, dto);

      expect(mockPrisma.scheduledReport.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ frequency: 'daily' }),
        }),
      );
      expect(result.frequency).toBe('daily');
    });
  });

  describe('deleteReport (remove)', () => {
    it('removes the report', async () => {
      const userId = 'user-del';
      mockPrisma.scheduledReport.delete.mockResolvedValue({ id: 'report-del' });

      await service.deleteReport(userId);

      expect(mockPrisma.scheduledReport.delete).toHaveBeenCalledWith({ where: { userId } });
    });

    it('does not throw when report does not exist', async () => {
      mockPrisma.scheduledReport.delete.mockRejectedValue(new Error('Record not found'));
      await expect(service.deleteReport('no-such-user')).resolves.toBeUndefined();
    });
  });

  describe('isDue / shouldSendReport logic', () => {
    it('returns true when a weekly report is due on the correct day and hour', () => {
      // Monday (day=1) at 08:00 UTC — report set for Mon at 8
      const now = new Date('2026-03-16T08:05:00Z'); // Monday
      const report = {
        frequency: 'weekly',
        dayOfWeek: 1,
        hourUtc: 8,
        lastSentAt: null, // never sent
      };

      // Access private method via cast
      const isDue = (service as any).isDue(report, now, now.getUTCHours(), now.getUTCDay());
      expect(isDue).toBe(true);
    });

    it('returns false when weekly report was already sent today (within tolerance)', () => {
      const now = new Date('2026-03-16T08:05:00Z'); // Monday 08:05 UTC
      // Sent 30 minutes ago — not yet eligible again
      const lastSentAt = new Date('2026-03-16T07:35:00Z');
      const report = {
        frequency: 'weekly',
        dayOfWeek: 1,
        hourUtc: 8,
        lastSentAt,
      };

      const isDue = (service as any).isDue(report, now, now.getUTCHours(), now.getUTCDay());
      expect(isDue).toBe(false);
    });

    it('returns false when the report is not scheduled for the current hour', () => {
      const now = new Date('2026-03-16T10:00:00Z'); // Monday 10:00 UTC
      const report = {
        frequency: 'weekly',
        dayOfWeek: 1,
        hourUtc: 8, // configured for 8, not 10
        lastSentAt: null,
      };

      const isDue = (service as any).isDue(report, now, now.getUTCHours(), now.getUTCDay());
      expect(isDue).toBe(false);
    });

    it('returns false for weekly report when current day does not match', () => {
      const now = new Date('2026-03-17T08:00:00Z'); // Tuesday
      const report = {
        frequency: 'weekly',
        dayOfWeek: 1, // Monday
        hourUtc: 8,
        lastSentAt: null,
      };

      const isDue = (service as any).isDue(report, now, now.getUTCHours(), now.getUTCDay());
      expect(isDue).toBe(false);
    });

    it('returns true for daily report when 24h have passed', () => {
      const now = new Date('2026-03-16T08:00:00Z');
      const lastSentAt = new Date('2026-03-15T08:00:00Z'); // exactly 24h ago
      const report = {
        frequency: 'daily',
        dayOfWeek: 1,
        hourUtc: 8,
        lastSentAt,
      };

      const isDue = (service as any).isDue(report, now, now.getUTCHours(), now.getUTCDay());
      expect(isDue).toBe(true);
    });
  });

  describe('sendDueReports', () => {
    it('sends a report and updates lastSentAt when report is due', async () => {
      const userId = 'user-report';
      const now = new Date('2026-03-16T08:00:00Z'); // Monday 08:00 UTC (getUTCDay=1)
      vi.setSystemTime(now);

      const report = {
        id: 'rep-1',
        userId,
        enabled: true,
        frequency: 'weekly',
        dayOfWeek: 1,
        hourUtc: 8,
        lastSentAt: null,
        user: { id: userId, email: 'user@example.com' },
      };

      mockPrisma.scheduledReport.findMany.mockResolvedValue([report]);
      mockPrisma.monitor.findMany.mockResolvedValue([
        { id: 'mon-1', name: 'API', type: 'HTTP' },
      ]);
      mockPrisma.$queryRaw.mockResolvedValue([
        { monitorId: 'mon-1', ok: true, level: 'green' },
      ]);
      mockPrisma.monitorRun.findMany.mockResolvedValue([
        { ok: true, level: 'green' },
        { ok: true, level: 'green' },
      ]);
      mockPrisma.incident.count.mockResolvedValue(0);
      mockMailer.sendUptimeReport.mockResolvedValue(undefined);
      mockPrisma.scheduledReport.update.mockResolvedValue({ ...report, lastSentAt: now });

      await service.sendDueReports();

      expect(mockMailer.sendUptimeReport).toHaveBeenCalledTimes(1);
      expect(mockMailer.sendUptimeReport).toHaveBeenCalledWith(
        'user@example.com',
        expect.objectContaining({ frequency: 'weekly', totalMonitors: 1 }),
      );
      expect(mockPrisma.scheduledReport.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rep-1' } }),
      );

      vi.useRealTimers();
    });

    it('skips reports that are not yet due', async () => {
      const now = new Date('2026-03-17T10:00:00Z'); // wrong hour
      vi.setSystemTime(now);

      const report = {
        id: 'rep-2',
        userId: 'user-2',
        enabled: true,
        frequency: 'weekly',
        dayOfWeek: 1,
        hourUtc: 8, // configured for 8, current is 10
        lastSentAt: null,
        user: { id: 'user-2', email: 'u2@example.com' },
      };
      mockPrisma.scheduledReport.findMany.mockResolvedValue([report]);

      await service.sendDueReports();

      expect(mockMailer.sendUptimeReport).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('handles mailer errors gracefully and continues', async () => {
      const now = new Date('2026-03-17T09:00:00Z'); // Monday 09
      vi.setSystemTime(now);

      const report = {
        id: 'rep-3',
        userId: 'user-3',
        enabled: true,
        frequency: 'daily',
        dayOfWeek: 1,
        hourUtc: 9,
        lastSentAt: null,
        user: { id: 'user-3', email: 'u3@example.com' },
      };
      mockPrisma.scheduledReport.findMany.mockResolvedValue([report]);
      mockPrisma.monitor.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.incident.count.mockResolvedValue(0);
      mockMailer.sendUptimeReport.mockRejectedValue(new Error('SMTP error'));

      // Should not throw
      await expect(service.sendDueReports()).resolves.toBeUndefined();
      vi.useRealTimers();
    });

    it('computes zero uptimeMonitors correctly when no monitors exist', async () => {
      const now = new Date('2026-03-16T08:00:00Z'); // Sunday 08
      vi.setSystemTime(now);

      const report = {
        id: 'rep-4',
        userId: 'user-4',
        enabled: true,
        frequency: 'daily',
        dayOfWeek: 0,
        hourUtc: 8,
        lastSentAt: null,
        user: { id: 'user-4', email: 'u4@example.com' },
      };
      mockPrisma.scheduledReport.findMany.mockResolvedValue([report]);
      mockPrisma.monitor.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.incident.count.mockResolvedValue(2);
      mockMailer.sendUptimeReport.mockResolvedValue(undefined);
      mockPrisma.scheduledReport.update.mockResolvedValue({});

      await service.sendDueReports();

      expect(mockMailer.sendUptimeReport).toHaveBeenCalledWith(
        'u4@example.com',
        expect.objectContaining({
          totalMonitors: 0,
          overallUptimePct: 100,
          activeIncidents: 2,
        }),
      );
      vi.useRealTimers();
    });

    it('returns true for daily report with no lastSentAt (first send)', () => {
      const now = new Date('2026-03-16T08:00:00Z');
      const report = {
        frequency: 'daily',
        dayOfWeek: 1,
        hourUtc: 8,
        lastSentAt: null,
      };

      const isDue = (service as any).isDue(report, now, now.getUTCHours(), now.getUTCDay());
      expect(isDue).toBe(true);
    });

    it('returns false for daily report when less than 23h since last send', () => {
      const now = new Date('2026-03-16T08:00:00Z');
      const lastSentAt = new Date('2026-03-15T10:00:00Z'); // only 22h ago
      const report = {
        frequency: 'daily',
        dayOfWeek: 1,
        hourUtc: 8,
        lastSentAt,
      };

      const isDue = (service as any).isDue(report, now, now.getUTCHours(), now.getUTCDay());
      expect(isDue).toBe(false);
    });

    it('returns true for weekly report when 167+ hours have passed since last send', () => {
      const now = new Date('2026-03-23T08:00:00Z'); // Monday
      const lastSentAt = new Date('2026-03-16T07:00:00Z'); // 169h ago
      const report = {
        frequency: 'weekly',
        dayOfWeek: 1,
        hourUtc: 8,
        lastSentAt,
      };

      const isDue = (service as any).isDue(report, now, now.getUTCHours(), now.getUTCDay());
      expect(isDue).toBe(true);
    });

    it('upsertReport uses defaults when dto fields are undefined', async () => {
      const userId = 'user-def';
      mockPrisma.scheduledReport.upsert.mockResolvedValue({
        id: 'rep-def', userId, enabled: true, frequency: 'weekly', dayOfWeek: 1, hourUtc: 8, lastSentAt: null,
      });
      const result = await service.upsertReport(userId, {});
      expect(mockPrisma.scheduledReport.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ enabled: true, frequency: 'weekly', dayOfWeek: 1, hourUtc: 8 }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('sends report with daily frequency and correct periodLabel', async () => {
      const now = new Date('2026-03-16T09:00:00Z');
      vi.setSystemTime(now);

      const report = {
        id: 'rep-daily',
        userId: 'user-daily',
        enabled: true,
        frequency: 'daily',
        dayOfWeek: 1,
        hourUtc: 9,
        lastSentAt: null,
        user: { id: 'user-daily', email: 'daily@example.com' },
      };

      mockPrisma.scheduledReport.findMany.mockResolvedValue([report]);
      mockPrisma.monitor.findMany.mockResolvedValue([
        { id: 'mon-1', name: 'API', type: 'HTTP' },
      ]);
      mockPrisma.$queryRaw.mockResolvedValue([
        { monitorId: 'mon-1', ok: false, level: null },
      ]);
      mockPrisma.monitorRun.findMany.mockResolvedValue([
        { ok: true, level: null },
        { ok: false, level: null },
      ]);
      mockPrisma.incident.count.mockResolvedValue(1);
      mockMailer.sendUptimeReport.mockResolvedValue(undefined);
      mockPrisma.scheduledReport.update.mockResolvedValue({});

      await service.sendDueReports();

      expect(mockMailer.sendUptimeReport).toHaveBeenCalledWith(
        'daily@example.com',
        expect.objectContaining({
          frequency: 'daily',
          periodLabel: 'Last 24 hours',
        }),
      );
      vi.useRealTimers();
    });

    it('computes yellow and red health buckets correctly', async () => {
      const now = new Date('2026-03-16T08:00:00Z'); // Monday
      vi.setSystemTime(now);

      const report = {
        id: 'rep-health',
        userId: 'user-health',
        enabled: true,
        frequency: 'weekly',
        dayOfWeek: 1,
        hourUtc: 8,
        lastSentAt: null,
        user: { id: 'user-health', email: 'health@example.com' },
      };

      mockPrisma.scheduledReport.findMany.mockResolvedValue([report]);
      mockPrisma.monitor.findMany.mockResolvedValue([
        { id: 'mon-g', name: 'Green', type: 'HTTP' },
        { id: 'mon-y', name: 'Yellow', type: 'TCP' },
        { id: 'mon-r', name: 'Red', type: 'SSL_CERT' },
        { id: 'mon-no', name: 'NoRun', type: 'HEARTBEAT' },
        { id: 'mon-non-uptime', name: 'Version', type: 'VERSION' },
      ]);
      mockPrisma.$queryRaw.mockResolvedValue([
        { monitorId: 'mon-g', ok: true, level: 'green' },
        { monitorId: 'mon-y', ok: false, level: 'yellow' },
        { monitorId: 'mon-r', ok: false, level: 'red' },
        // mon-no has no latest run
      ]);
      mockPrisma.monitorRun.findMany
        .mockResolvedValueOnce([{ ok: true, level: 'green' }])   // mon-g
        .mockResolvedValueOnce([{ ok: false, level: 'yellow' }]) // mon-y
        .mockResolvedValueOnce([{ ok: false, level: 'red' }])    // mon-r
        .mockResolvedValueOnce([]);                                // mon-no (no runs)
      mockPrisma.incident.count.mockResolvedValue(0);
      mockMailer.sendUptimeReport.mockResolvedValue(undefined);
      mockPrisma.scheduledReport.update.mockResolvedValue({});

      await service.sendDueReports();

      expect(mockMailer.sendUptimeReport).toHaveBeenCalledWith(
        'health@example.com',
        expect.objectContaining({
          greenCount: 1,
          yellowCount: 1,
          redCount: 1,
        }),
      );
      vi.useRealTimers();
    });

    it('computes status from ok flag when level is null', async () => {
      const now = new Date('2026-03-16T08:00:00Z');
      vi.setSystemTime(now);

      const report = {
        id: 'rep-nolevel',
        userId: 'user-nolevel',
        enabled: true,
        frequency: 'weekly',
        dayOfWeek: 1,
        hourUtc: 8,
        lastSentAt: null,
        user: { id: 'user-nolevel', email: 'nolevel@example.com' },
      };

      mockPrisma.scheduledReport.findMany.mockResolvedValue([report]);
      mockPrisma.monitor.findMany.mockResolvedValue([
        { id: 'mon-ok', name: 'OkMon', type: 'HTTP' },
        { id: 'mon-fail', name: 'FailMon', type: 'HTTP' },
      ]);
      mockPrisma.$queryRaw.mockResolvedValue([
        { monitorId: 'mon-ok', ok: true, level: null },
        { monitorId: 'mon-fail', ok: false, level: null },
      ]);
      mockPrisma.monitorRun.findMany
        .mockResolvedValueOnce([{ ok: true, level: null }])
        .mockResolvedValueOnce([{ ok: false, level: null }]);
      mockPrisma.incident.count.mockResolvedValue(0);
      mockMailer.sendUptimeReport.mockResolvedValue(undefined);
      mockPrisma.scheduledReport.update.mockResolvedValue({});

      await service.sendDueReports();

      expect(mockMailer.sendUptimeReport).toHaveBeenCalledWith(
        'nolevel@example.com',
        expect.objectContaining({
          greenCount: 1,
          redCount: 1,
          topMonitors: expect.arrayContaining([
            expect.objectContaining({ name: 'OkMon', status: 'green' }),
            expect.objectContaining({ name: 'FailMon', status: 'red' }),
          ]),
        }),
      );
      vi.useRealTimers();
    });

    it('uses PUBLIC_URL env var for dashboardUrl when set', async () => {
      const now = new Date('2026-03-16T08:00:00Z');
      vi.setSystemTime(now);
      const originalEnv = process.env.PUBLIC_URL;
      process.env.PUBLIC_URL = 'https://pulse.example.com';

      const report = {
        id: 'rep-env',
        userId: 'user-env',
        enabled: true,
        frequency: 'weekly',
        dayOfWeek: 1,
        hourUtc: 8,
        lastSentAt: null,
        user: { id: 'user-env', email: 'env@example.com' },
      };

      mockPrisma.scheduledReport.findMany.mockResolvedValue([report]);
      mockPrisma.monitor.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.incident.count.mockResolvedValue(0);
      mockMailer.sendUptimeReport.mockResolvedValue(undefined);
      mockPrisma.scheduledReport.update.mockResolvedValue({});

      await service.sendDueReports();

      expect(mockMailer.sendUptimeReport).toHaveBeenCalledWith(
        'env@example.com',
        expect.objectContaining({
          dashboardUrl: 'https://pulse.example.com/dashboard',
        }),
      );

      if (originalEnv === undefined) delete process.env.PUBLIC_URL;
      else process.env.PUBLIC_URL = originalEnv;
      vi.useRealTimers();
    });

    it('skips monitors with no runs in computeReportData', async () => {
      const now = new Date('2026-03-16T08:00:00Z'); // Monday UTC (day=1)
      vi.setSystemTime(now);

      const report = {
        id: 'rep-5',
        userId: 'user-5',
        enabled: true,
        frequency: 'weekly',
        dayOfWeek: 1,
        hourUtc: 8,
        lastSentAt: null,
        user: { id: 'user-5', email: 'u5@example.com' },
      };
      mockPrisma.scheduledReport.findMany.mockResolvedValue([report]);
      mockPrisma.monitor.findMany.mockResolvedValue([
        { id: 'mon-a', name: 'No-run', type: 'HTTP' },
      ]);
      // No latest runs for this monitor
      mockPrisma.$queryRaw.mockResolvedValue([]);
      // findMany for period runs also empty
      mockPrisma.monitorRun.findMany.mockResolvedValue([]);
      mockPrisma.incident.count.mockResolvedValue(0);
      mockMailer.sendUptimeReport.mockResolvedValue(undefined);
      mockPrisma.scheduledReport.update.mockResolvedValue({});

      await service.sendDueReports();

      expect(mockMailer.sendUptimeReport).toHaveBeenCalledWith(
        'u5@example.com',
        expect.objectContaining({ overallUptimePct: 100, topMonitors: [] }),
      );
      vi.useRealTimers();
    });
  });
});
