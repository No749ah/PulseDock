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
});
