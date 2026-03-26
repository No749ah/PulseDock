import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted so mock refs are available when vi.mock factory runs
const { mockSendMail, mockCreateTransport } = vi.hoisted(() => {
  const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-msg-id' });
  const mockCreateTransport = vi.fn().mockReturnValue({ sendMail: mockSendMail });
  return { mockSendMail, mockCreateTransport };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
}));

import { MailerService } from './mailer.service';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MailerService', () => {
  let svc: MailerService;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    vi.clearAllMocks();
    svc = new MailerService();
  });

  afterEach(() => {
    Object.keys(process.env).forEach((k) => {
      if (!(k in savedEnv)) delete process.env[k];
    });
    Object.assign(process.env, savedEnv);
  });

  // ---- no SMTP config → disabled path ----

  describe('SMTP not configured', () => {
    beforeEach(() => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
    });

    it('sendInviteEmail returns { sent: false }', async () => {
      const result = await svc.sendInviteEmail('a@b.com', 'https://x/invite');
      expect(result).toEqual({ sent: false });
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('sendPasswordResetEmail returns { sent: false }', async () => {
      const result = await svc.sendPasswordResetEmail('a@b.com', 'https://x/reset');
      expect(result).toEqual({ sent: false });
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('sendEmailVerificationEmail returns { sent: false }', async () => {
      const result = await svc.sendEmailVerificationEmail('a@b.com', 'https://x/verify');
      expect(result).toEqual({ sent: false });
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('sendNewLoginEmail returns { sent: false } with valid context', async () => {
      const result = await svc.sendNewLoginEmail('a@b.com', {
        ipAddress: '1.2.3.4',
        userAgent: 'Chrome',
        timestamp: '2026-01-01T00:00:00Z',
      });
      expect(result).toEqual({ sent: false });
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('sendNewLoginEmail handles null ip/userAgent', async () => {
      const result = await svc.sendNewLoginEmail('a@b.com', {
        ipAddress: null,
        userAgent: null,
        timestamp: '2026-01-01T00:00:00Z',
      });
      expect(result).toEqual({ sent: false });
    });

    it('sendAlertEmail returns { sent: false }', async () => {
      const result = await svc.sendAlertEmail('a@b.com', 'Monitor down');
      expect(result).toEqual({ sent: false });
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('sendAlertEmail with extra returns { sent: false }', async () => {
      const result = await svc.sendAlertEmail('a@b.com', 'Alert!', { code: 500 });
      expect(result).toEqual({ sent: false });
    });
  });

  // ---- SMTP configured → sends emails ----

  describe('SMTP configured', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';
      process.env.MAIL_FROM = 'noreply@example.com';
      mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
      svc = new MailerService();
    });

    it('sendInviteEmail calls sendMail, returns { sent: true }', async () => {
      const result = await svc.sendInviteEmail('user@example.com', 'https://x/invite/abc');
      expect(result).toEqual({ sent: true });
      expect(mockSendMail).toHaveBeenCalledOnce();
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.to).toBe('user@example.com');
      expect(args.subject).toBe("You've been invited to PulseDock");
      expect(args.text).toContain('https://x/invite/abc');
      expect(args.html).toContain('https://x/invite/abc');
    });

    it('sendPasswordResetEmail calls sendMail, returns { sent: true }', async () => {
      const result = await svc.sendPasswordResetEmail('user@example.com', 'https://x/reset/xyz');
      expect(result).toEqual({ sent: true });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.subject).toBe('Reset your PulseDock password');
      expect(args.text).toContain('https://x/reset/xyz');
      expect(args.html).toContain('https://x/reset/xyz');
    });

    it('sendEmailVerificationEmail calls sendMail, returns { sent: true }', async () => {
      const result = await svc.sendEmailVerificationEmail('user@example.com', 'https://x/verify/tok');
      expect(result).toEqual({ sent: true });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.subject).toBe('Verify your PulseDock email address');
      expect(args.text).toContain('https://x/verify/tok');
      expect(args.html).toContain('https://x/verify/tok');
    });

    it('sendNewLoginEmail calls sendMail with IP/UA in body', async () => {
      const result = await svc.sendNewLoginEmail('user@example.com', {
        ipAddress: '10.0.0.1',
        userAgent: 'Chrome/120',
        timestamp: '2026-01-01T00:00:00.000Z',
      });
      expect(result).toEqual({ sent: true });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.subject).toBe('New login detected on your PulseDock account');
      expect(args.text).toContain('10.0.0.1');
      expect(args.text).toContain('Chrome/120');
    });

    it('sendNewLoginEmail uses "unknown" for null ip/ua', async () => {
      await svc.sendNewLoginEmail('user@example.com', {
        ipAddress: null,
        userAgent: null,
        timestamp: '2026-01-01T00:00:00Z',
      });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.text).toContain('unknown');
    });

    it('sendAlertEmail sends text + html when no extra', async () => {
      const result = await svc.sendAlertEmail('user@example.com', 'Monitor down');
      expect(result).toEqual({ sent: true });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.subject).toBe('PulseDock Alert');
      expect(args.text).toContain('Monitor down');
      expect(args.html).toContain('PulseDock');
    });

    it('sendAlertEmail appends JSON when extra given', async () => {
      await svc.sendAlertEmail('user@example.com', 'Alert!', { code: 500 });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.text).toContain('Alert!');
      expect(args.text).toContain('"code": 500');
    });

    it('sendAlertEmail renders test notification HTML when extra.test is true', async () => {
      await svc.sendAlertEmail('user@example.com', '✅ test', { test: true });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).toContain('Test notification');
    });

    it('sendAlertEmail renders monitor name in HTML when monitor info provided', async () => {
      await svc.sendAlertEmail('user@example.com', '🚨 My API is RED', {
        monitor: { name: 'My API' },
        run: { level: 'red', message: 'Connection refused' },
      });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).toContain('My API');
      expect(args.html).toContain('DOWN');
    });

    it('sendAlertEmail uses DEGRADED label and yellow color for yellow level', async () => {
      await svc.sendAlertEmail('user@example.com', '⚠️ Slow response', {
        monitor: { name: 'API Monitor' },
        run: { level: 'yellow', message: 'Latency high' },
      });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).toContain('DEGRADED');
      expect(args.html).toContain('#f59e0b');
    });

    it('sendAlertEmail uses RECOVERED label and green color for green level', async () => {
      await svc.sendAlertEmail('user@example.com', '✅ Recovered', {
        monitor: { name: 'API Monitor' },
        run: { level: 'green', message: 'Back to normal' },
      });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).toContain('RECOVERED');
      expect(args.html).toContain('#22c55e');
    });

    it('uses MAIL_FROM env as from address', async () => {
      process.env.MAIL_FROM = 'custom@domain.com';
      svc = new MailerService();
      await svc.sendAlertEmail('user@example.com', 'test');
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.from).toBe('custom@domain.com');
    });

    it('defaults from to noreply@pulsedock.local when MAIL_FROM unset', async () => {
      delete process.env.MAIL_FROM;
      svc = new MailerService();
      await svc.sendAlertEmail('user@example.com', 'test');
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.from).toBe('noreply@pulsedock.local');
    });

    it('sets secure:true for port 465', async () => {
      process.env.SMTP_PORT = '465';
      svc = new MailerService();
      await svc.sendAlertEmail('user@example.com', 'test');
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: true, port: 465 }),
      );
    });

    it('sets secure:false for port 587', async () => {
      process.env.SMTP_PORT = '587';
      svc = new MailerService();
      await svc.sendAlertEmail('user@example.com', 'test');
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: false, port: 587 }),
      );
    });
  });

  // ─── sendUptimeReport() ────────────────────────────────────────────────────

  describe('sendUptimeReport()', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';
      process.env.MAIL_FROM = 'noreply@example.com';
      mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
      svc = new MailerService();
    });

    const baseData = {
      frequency: 'daily' as const,
      periodLabel: 'March 24, 2026',
      overallUptimePct: 99.95,
      totalMonitors: 10,
      uptimeMonitors: 9,
      greenCount: 8,
      yellowCount: 1,
      redCount: 1,
      topMonitors: [
        { name: 'API', uptimePct: 100, status: 'green' },
        { name: 'Web', uptimePct: 95.5, status: 'yellow' },
        { name: 'DB', uptimePct: 80.0, status: 'red' },
      ],
      activeIncidents: 2,
      dashboardUrl: 'https://example.com/dashboard',
    };

    it('sends daily report with correct subject', async () => {
      const result = await svc.sendUptimeReport('admin@example.com', baseData);
      expect(result).toEqual({ sent: true });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.subject).toContain('Daily Report');
      expect(args.to).toBe('admin@example.com');
    });

    it('sends weekly report with correct subject', async () => {
      await svc.sendUptimeReport('admin@example.com', { ...baseData, frequency: 'weekly' });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.subject).toContain('Weekly Report');
    });

    it('includes uptime percentage in text body', async () => {
      await svc.sendUptimeReport('admin@example.com', baseData);
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.text).toContain('99.95%');
    });

    it('includes monitor statuses in HTML', async () => {
      await svc.sendUptimeReport('admin@example.com', baseData);
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).toContain('API');
      expect(args.html).toContain('Web');
      expect(args.html).toContain('DB');
      expect(args.html).toContain('UP');
      expect(args.html).toContain('DEGRADED');
      expect(args.html).toContain('DOWN');
    });

    it('shows degraded alert when yellow+red > 0', async () => {
      await svc.sendUptimeReport('admin@example.com', baseData);
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).toContain('degraded or down');
    });

    it('hides degraded alert when all green', async () => {
      await svc.sendUptimeReport('admin@example.com', {
        ...baseData,
        yellowCount: 0,
        redCount: 0,
      });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).not.toContain('degraded or down');
    });

    it('uses green color for 99%+ uptime', async () => {
      await svc.sendUptimeReport('admin@example.com', baseData);
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).toContain('#22c55e'); // green for 99.95%
    });

    it('uses yellow color for 95-99% uptime', async () => {
      await svc.sendUptimeReport('admin@example.com', { ...baseData, overallUptimePct: 97.5 });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).toContain('#f59e0b');
    });

    it('uses red color for <95% uptime', async () => {
      await svc.sendUptimeReport('admin@example.com', { ...baseData, overallUptimePct: 90.0 });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).toContain('#ef4444');
    });

    it('includes dashboard URL in text and HTML', async () => {
      await svc.sendUptimeReport('admin@example.com', baseData);
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.text).toContain('https://example.com/dashboard');
      expect(args.html).toContain('https://example.com/dashboard');
    });

    it('handles empty topMonitors array', async () => {
      await svc.sendUptimeReport('admin@example.com', { ...baseData, topMonitors: [] });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).not.toContain('Monitor Status');
    });

    it('uses singular form for 1 degraded monitor', async () => {
      await svc.sendUptimeReport('admin@example.com', {
        ...baseData,
        yellowCount: 1,
        redCount: 0,
      });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).toContain('is degraded or down');
    });

    it('returns { sent: false } when SMTP not configured', async () => {
      delete process.env.SMTP_HOST;
      svc = new MailerService();
      const result = await svc.sendUptimeReport('admin@example.com', baseData);
      expect(result).toEqual({ sent: false });
    });
  });

  // ─── sendStatusPageUpdateEmail() ────────────────────────────────────────────

  describe('sendStatusPageUpdateEmail()', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';
      process.env.MAIL_FROM = 'noreply@example.com';
      mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
      svc = new MailerService();
    });

    const baseOpts = {
      pageTitle: 'Acme Status',
      pageSlug: 'acme',
      pageUrl: 'https://status.acme.com',
      subject: 'Acme Status Update',
      headline: 'API Outage Detected',
      body: 'Our API endpoint is experiencing elevated error rates.\nWe are investigating.',
    };

    it('sends status update email with correct subject', async () => {
      const result = await svc.sendStatusPageUpdateEmail('sub@example.com', baseOpts);
      expect(result).toEqual({ sent: true });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.subject).toBe('Acme Status Update');
      expect(args.to).toBe('sub@example.com');
    });

    it('includes headline and body in HTML', async () => {
      await svc.sendStatusPageUpdateEmail('sub@example.com', baseOpts);
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).toContain('API Outage Detected');
      expect(args.html).toContain('elevated error rates');
    });

    it('includes page URL in text body', async () => {
      await svc.sendStatusPageUpdateEmail('sub@example.com', baseOpts);
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.text).toContain('https://status.acme.com');
    });

    it('includes unsubscribe link when provided', async () => {
      await svc.sendStatusPageUpdateEmail('sub@example.com', {
        ...baseOpts,
        unsubscribeUrl: 'https://status.acme.com/unsub/abc123',
      });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).toContain('Unsubscribe');
      expect(args.html).toContain('https://status.acme.com/unsub/abc123');
      expect(args.text).toContain('https://status.acme.com/unsub/abc123');
    });

    it('omits unsubscribe section when no URL', async () => {
      await svc.sendStatusPageUpdateEmail('sub@example.com', baseOpts);
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).not.toContain('Unsubscribe');
    });

    it('uses custom statusColor when provided', async () => {
      await svc.sendStatusPageUpdateEmail('sub@example.com', {
        ...baseOpts,
        statusColor: '#ef4444',
      });
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).toContain('#ef4444');
    });

    it('defaults statusColor to yellow when not provided', async () => {
      await svc.sendStatusPageUpdateEmail('sub@example.com', baseOpts);
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).toContain('#f59e0b');
    });

    it('converts newlines in body to <br> in HTML', async () => {
      await svc.sendStatusPageUpdateEmail('sub@example.com', baseOpts);
      const args = mockSendMail.mock.calls[0][0] as Record<string, string>;
      expect(args.html).toContain('<br>');
    });

    it('returns { sent: false } when SMTP not configured', async () => {
      delete process.env.SMTP_HOST;
      svc = new MailerService();
      const result = await svc.sendStatusPageUpdateEmail('sub@example.com', baseOpts);
      expect(result).toEqual({ sent: false });
    });
  });

  // ─── sendAccountLockedEmail() ────────────────────────────────────────────────

  describe('sendAccountLockedEmail()', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';
      process.env.MAIL_FROM = 'noreply@example.com';
      mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
      svc = new MailerService();
    });

    it('calls deliver with lockout subject', async () => {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      const result = await svc.sendAccountLockedEmail('victim@example.com', lockedUntil);
      expect(result).toEqual({ sent: true });
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'victim@example.com',
          subject: expect.stringContaining('locked'),
        }),
      );
    });

    it('includes IP address in HTML when provided', async () => {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      await svc.sendAccountLockedEmail('victim@example.com', lockedUntil, '192.168.1.1');
      const callArgs = mockSendMail.mock.calls[0][0] as { html: string };
      expect(callArgs.html).toContain('192.168.1.1');
    });

    it('omits IP row when ipAddress is not provided', async () => {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      await svc.sendAccountLockedEmail('victim@example.com', lockedUntil);
      const callArgs = mockSendMail.mock.calls[0][0] as { html: string };
      // IP row should not appear when not provided
      expect(callArgs.html).not.toContain('Attempted from');
    });

    it('includes lockout time in plain-text body', async () => {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      await svc.sendAccountLockedEmail('victim@example.com', lockedUntil);
      const callArgs = mockSendMail.mock.calls[0][0] as { text: string };
      expect(callArgs.text).toContain(lockedUntil.toUTCString());
    });

    it('returns { sent: false } when SMTP not configured', async () => {
      delete process.env.SMTP_HOST;
      svc = new MailerService();
      const result = await svc.sendAccountLockedEmail('victim@example.com', new Date());
      expect(result).toEqual({ sent: false });
    });
  });

  describe('sendDigestEmail', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';
      process.env.MAIL_FROM = 'noreply@example.com';
      mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
      svc = new MailerService();
    });

    const items = [
      { eventType: 'down' as const, monitorName: 'API', message: '🚨 down', createdAt: new Date('2026-03-26T10:00:00Z') },
      { eventType: 'recovery' as const, monitorName: 'Web', message: '✅ recovered', createdAt: new Date('2026-03-26T10:30:00Z') },
    ];

    it('sends hourly digest with correct subject', async () => {
      await svc.sendDigestEmail('digest@example.com', 'hourly_digest', items);
      const call = mockSendMail.mock.calls[0][0] as { subject: string };
      expect(call.subject).toContain('Hourly Alert Digest');
      expect(call.subject).toContain('2 events');
    });

    it('sends daily digest with correct subject', async () => {
      await svc.sendDigestEmail('digest@example.com', 'daily_digest', items);
      const call = mockSendMail.mock.calls[0][0] as { subject: string };
      expect(call.subject).toContain('Daily Alert Digest');
    });

    it('includes monitor names and event types in HTML', async () => {
      await svc.sendDigestEmail('digest@example.com', 'hourly_digest', items);
      const call = mockSendMail.mock.calls[0][0] as { html: string };
      expect(call.html).toContain('API');
      expect(call.html).toContain('DOWN');
      expect(call.html).toContain('RECOVERED');
    });

    it('includes event summary in plain text', async () => {
      await svc.sendDigestEmail('digest@example.com', 'hourly_digest', items);
      const call = mockSendMail.mock.calls[0][0] as { text: string };
      expect(call.text).toContain('[DOWN]');
      expect(call.text).toContain('[RECOVERED]');
    });

    it('uses singular "event" when only 1 item', async () => {
      await svc.sendDigestEmail('digest@example.com', 'hourly_digest', [items[0]]);
      const call = mockSendMail.mock.calls[0][0] as { subject: string };
      expect(call.subject).toContain('1 event');
      expect(call.subject).not.toContain('1 events');
    });

    it('returns { sent: false } when SMTP not configured', async () => {
      delete process.env.SMTP_HOST;
      svc = new MailerService();
      const result = await svc.sendDigestEmail('digest@example.com', 'hourly_digest', items);
      expect(result).toEqual({ sent: false });
    });
  });
});
