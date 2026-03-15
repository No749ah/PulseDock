import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

// ─────────────────────────────────────────────────────────────────────────────
// Shared HTML email layout
// ─────────────────────────────────────────────────────────────────────────────

function htmlLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#0a0f14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f14;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">

          <!-- Logo / wordmark -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <span style="display:inline-flex;align-items:center;gap:8px;">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="14" cy="14" r="14" fill="#3b82f6"/>
                  <path d="M8 14a6 6 0 1 1 12 0 6 6 0 0 1-12 0zm6-3v3l2 2" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span style="font-size:20px;font-weight:700;color:#f1f5f9;letter-spacing:-0.3px;">PulseDock</span>
              </span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#111827;border-radius:12px;border:1px solid #1e293b;padding:32px 32px 28px;color:#e2e8f0;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:20px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#475569;line-height:1.6;">
                You're receiving this because you have an account on PulseDock.<br/>
                <a href="https://github.com/No749ah/PulseDock" style="color:#3b82f6;text-decoration:none;">Open source</a> &nbsp;·&nbsp;
                Self-hosted version intelligence &amp; uptime monitoring.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function btnPrimary(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;padding:12px 28px;margin:20px 0 8px;">${label}</a>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #1e293b;margin:24px 0;" />`;
}

function metaRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:4px 0;font-size:13px;color:#94a3b8;width:120px;">${label}</td>
    <td style="padding:4px 0;font-size:13px;color:#e2e8f0;word-break:break-all;">${value}</td>
  </tr>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  private transporter() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) return null;

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  private async deliver(to: string, subject: string, text: string, html: string): Promise<{ sent: boolean }> {
    const from = process.env.MAIL_FROM ?? 'noreply@pulsedock.local';
    const transporter = this.transporter();

    if (!transporter) {
      this.logger.warn(`[mail-disabled] to=${to} subject="${subject}"`);
      return { sent: false };
    }

    await transporter.sendMail({ from, to, subject, text, html });
    return { sent: true };
  }

  // ───────── Invite ─────────

  async sendInviteEmail(to: string, inviteUrl: string) {
    const subject = "You've been invited to PulseDock";

    const text = [
      `You've been invited to PulseDock.`,
      ``,
      `Open this link to accept your invitation:`,
      inviteUrl,
      ``,
      `This link expires in 7 days.`,
    ].join('\n');

    const html = htmlLayout(subject, `
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f1f5f9;">You've been invited</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#94a3b8;line-height:1.6;">
        You've been invited to join <strong style="color:#e2e8f0;">PulseDock</strong> — version intelligence &amp; uptime monitoring.
        Click the button below to set up your account.
      </p>
      ${btnPrimary(inviteUrl, 'Accept Invitation')}
      ${divider()}
      <p style="margin:0;font-size:12px;color:#475569;">
        This invitation link expires in 7 days. If you didn't expect this email, you can safely ignore it.
      </p>
    `);

    return this.deliver(to, subject, text, html);
  }

  // ───────── Password Reset ─────────

  async sendPasswordResetEmail(to: string, resetUrl: string) {
    const subject = 'Reset your PulseDock password';

    const text = [
      `A password reset was requested for your PulseDock account.`,
      ``,
      `Reset link (expires in 15 minutes):`,
      resetUrl,
      ``,
      `If you didn't request this, ignore this email — your account is safe.`,
    ].join('\n');

    const html = htmlLayout(subject, `
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f1f5f9;">Reset your password</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#94a3b8;line-height:1.6;">
        We received a request to reset the password for your PulseDock account.
        Click the button below to choose a new password.
      </p>
      ${btnPrimary(resetUrl, 'Reset Password')}
      ${divider()}
      <p style="margin:0;font-size:12px;color:#475569;">
        This link expires in <strong style="color:#94a3b8;">15 minutes</strong>. If you didn't request a password reset, you can safely ignore this email.
      </p>
    `);

    return this.deliver(to, subject, text, html);
  }

  // ───────── Email Verification ─────────

  async sendEmailVerificationEmail(to: string, verifyUrl: string) {
    const subject = 'Verify your PulseDock email address';

    const text = [
      `Thanks for signing up for PulseDock!`,
      ``,
      `Please verify your email address by opening this link:`,
      verifyUrl,
      ``,
      `This link expires in 24 hours.`,
    ].join('\n');

    const html = htmlLayout(subject, `
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f1f5f9;">Verify your email</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#94a3b8;line-height:1.6;">
        Thanks for signing up for PulseDock! Click the button below to verify your email address and activate your account.
      </p>
      ${btnPrimary(verifyUrl, 'Verify Email Address')}
      ${divider()}
      <p style="margin:0;font-size:12px;color:#475569;">
        This link expires in <strong style="color:#94a3b8;">24 hours</strong>. If you didn't create a PulseDock account, you can safely ignore this email.
      </p>
    `);

    return this.deliver(to, subject, text, html);
  }

  // ───────── New Login Alert ─────────

  async sendNewLoginEmail(
    to: string,
    context: { ipAddress: string | null; userAgent: string | null; timestamp: string },
  ) {
    const subject = 'New login detected on your PulseDock account';
    const ip = context.ipAddress ?? 'unknown';
    const ua = context.userAgent ?? 'unknown';

    const text = [
      `A new login was detected on your PulseDock account.`,
      ``,
      `Time:             ${context.timestamp}`,
      `IP address:       ${ip}`,
      `Device/browser:   ${ua}`,
      ``,
      `If this was you, no action is needed.`,
      `If you did not log in, please change your password immediately and revoke unknown sessions in Account Settings.`,
    ].join('\n');

    const html = htmlLayout(subject, `
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f1f5f9;">New login detected</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#94a3b8;line-height:1.6;">
        A login was detected on your PulseDock account from an unrecognized location or device.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
        ${metaRow('Time', context.timestamp)}
        ${metaRow('IP address', ip)}
        ${metaRow('Browser/Device', ua)}
      </table>
      ${divider()}
      <p style="margin:0 0 12px;font-size:14px;color:#e2e8f0;">
        <strong>Was this you?</strong> No action is needed.
      </p>
      <p style="margin:0;font-size:14px;color:#e2e8f0;">
        <strong>Wasn't you?</strong> Change your password immediately and revoke unknown sessions in Account → Active Sessions.
      </p>
    `);

    return this.deliver(to, subject, text, html);
  }

  // ───────── Alert Notification ─────────

  async sendAlertEmail(to: string, alertText: string, extra?: unknown) {
    const subject = 'PulseDock Alert';

    const text = extra
      ? `${alertText}\n\n---\n${JSON.stringify(extra, null, 2)}`
      : alertText;

    // Extract structured data from extra if available (monitor failure payload)
    const monitorName = (extra as { monitor?: { name?: string } } | undefined)?.monitor?.name;
    const runMessage = (extra as { run?: { message?: string; level?: string } } | undefined)?.run?.message;
    const runLevel = (extra as { run?: { level?: string } } | undefined)?.run?.level;
    const isTest = (extra as { test?: boolean } | undefined)?.test === true;

    const levelColor = runLevel === 'red' ? '#ef4444' : runLevel === 'yellow' ? '#f59e0b' : '#22c55e';
    const levelLabel = runLevel === 'red' ? 'DOWN' : runLevel === 'yellow' ? 'DEGRADED' : runLevel === 'green' ? 'RECOVERED' : 'ALERT';

    const html = htmlLayout(subject, isTest
      ? `
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#22c55e;">✅ Test notification</h1>
        <p style="margin:0;font-size:15px;color:#94a3b8;line-height:1.6;">
          This is a test notification from PulseDock. Your alert channel is configured correctly.
        </p>
      `
      : `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <span style="display:inline-block;background:${levelColor}22;color:${levelColor};font-size:12px;font-weight:700;letter-spacing:0.5px;padding:3px 10px;border-radius:999px;border:1px solid ${levelColor}44;">${levelLabel}</span>
        </div>
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#f1f5f9;">${monitorName ?? 'Monitor alert'}</h1>
        ${runMessage ? `<p style="margin:0 0 20px;font-size:15px;color:#94a3b8;line-height:1.6;">${runMessage}</p>` : ''}
        <p style="margin:0;font-size:14px;color:#64748b;">${alertText}</p>
        ${divider()}
        <p style="margin:0;font-size:12px;color:#475569;">
          Log in to PulseDock to view full monitor history and acknowledge this alert.
        </p>
      `
    );

    return this.deliver(to, subject, text, html);
  }
}
