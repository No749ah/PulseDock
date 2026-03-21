import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

/** App name for email branding — override via APP_NAME environment variable. */
const APP_NAME = process.env.APP_NAME ?? 'PulseDock';
/** App URL for email links — override via APP_URL environment variable. */
const APP_URL = process.env.APP_URL ?? 'https://oc-dev-test.no749ah.com';
/** App GitHub URL for footer link — override via GITHUB_URL environment variable. */
const GITHUB_URL = process.env.GITHUB_URL ?? 'https://github.com/No749ah/PulseDock';

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
                <span style="font-size:20px;font-weight:700;color:#f1f5f9;letter-spacing:-0.3px;">${APP_NAME}</span>
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
                You're receiving this because you have an account on ${APP_NAME}.<br/>
                <a href="${GITHUB_URL}" style="color:#3b82f6;text-decoration:none;">Open source</a> &nbsp;·&nbsp;
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
/**
 * Service for sending transactional emails via SMTP.
 *
 * All email is sent through a nodemailer transporter configured via environment
 * variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM). When SMTP
 * is not configured, delivery is silently skipped and logged as `[mail-disabled]`.
 *
 * Every public method returns `{ sent: boolean }` so callers can log whether the
 * email was actually dispatched without throwing on missing SMTP config.
 *
 * HTML emails use a shared branded layout (`htmlLayout`) with the PulseDock logo
 * and dark theme styling tested against major email clients.
 */
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  /**
   * Creates a nodemailer transporter from environment variables.
   * Returns null when SMTP is not configured, causing all sends to be no-ops.
   */
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

  /**
   * Core delivery method: sends a plain-text + HTML email.
   * Falls back silently (returns `{ sent: false }`) when SMTP is not configured.
   *
   * @param to      - Recipient email address
   * @param subject - Email subject line
   * @param text    - Plain-text fallback body
   * @param html    - HTML body (uses branded htmlLayout wrapper)
   */
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

  /**
   * Sends a team invitation email with a 7-day accept link.
   *
   * @param to        - Invitee's email address
   * @param inviteUrl - One-time accept URL (includes signed token)
   */
  async sendInviteEmail(to: string, inviteUrl: string) {
    const subject = `You've been invited to ${APP_NAME}`;

    const text = [
      `You've been invited to ${APP_NAME}.`,
      ``,
      `Open this link to accept your invitation:`,
      inviteUrl,
      ``,
      `This link expires in 7 days.`,
    ].join('\n');

    const html = htmlLayout(subject, `
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f1f5f9;">You've been invited</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#94a3b8;line-height:1.6;">
        You've been invited to join <strong style="color:#e2e8f0;">${APP_NAME}</strong> — version intelligence &amp; uptime monitoring.
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

  /**
   * Sends a password reset email with a 15-minute single-use reset link.
   *
   * @param to       - Account holder's email address
   * @param resetUrl - Signed reset URL (token valid for 15 minutes, invalidated on use)
   */
  async sendPasswordResetEmail(to: string, resetUrl: string) {
    const subject = `Reset your ${APP_NAME} password`;

    const text = [
      `A password reset was requested for your ${APP_NAME} account.`,
      ``,
      `Reset link (expires in 15 minutes):`,
      resetUrl,
      ``,
      `If you didn't request this, ignore this email — your account is safe.`,
    ].join('\n');

    const html = htmlLayout(subject, `
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f1f5f9;">Reset your password</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#94a3b8;line-height:1.6;">
        We received a request to reset the password for your ${APP_NAME} account.
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

  /**
   * Sends an email verification message for new account registrations.
   * Users must click the link before accessing the dashboard.
   *
   * @param to        - New user's email address
   * @param verifyUrl - Single-use email verification URL
   */
  async sendEmailVerificationEmail(to: string, verifyUrl: string) {
    const subject = `Verify your ${APP_NAME} email address`;

    const text = [
      `Thanks for signing up for ${APP_NAME}!`,
      ``,
      `Please verify your email address by opening this link:`,
      verifyUrl,
      ``,
      `This link expires in 24 hours.`,
    ].join('\n');

    const html = htmlLayout(subject, `
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f1f5f9;">Verify your email</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#94a3b8;line-height:1.6;">
        Thanks for signing up for ${APP_NAME}! Click the button below to verify your email address and activate your account.
      </p>
      ${btnPrimary(verifyUrl, 'Verify Email Address')}
      ${divider()}
      <p style="margin:0;font-size:12px;color:#475569;">
        This link expires in <strong style="color:#94a3b8;">24 hours</strong>. If you didn't create a ${APP_NAME} account, you can safely ignore this email.
      </p>
    `);

    return this.deliver(to, subject, text, html);
  }

  // ───────── New Login Alert ─────────

  /**
   * Notifies the account holder when a new login is detected from an unfamiliar IP/device.
   * Triggered by AuthService after session creation when anomaly detection fires.
   *
   * @param to      - Account holder's email address
   * @param context - Login metadata: IP address, user agent string, and ISO timestamp
   */
  async sendNewLoginEmail(
    to: string,
    context: { ipAddress: string | null; userAgent: string | null; timestamp: string },
  ) {
    const subject = `New login detected on your ${APP_NAME} account`;
    const ip = context.ipAddress ?? 'unknown';
    const ua = context.userAgent ?? 'unknown';

    const text = [
      `A new login was detected on your ${APP_NAME} account.`,
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
        A login was detected on your ${APP_NAME} account from an unrecognized location or device.
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

  /**
   * Sends a monitor alert notification email when a check fails or recovers.
   * Called by AlertsService when the email alert channel fires.
   *
   * @param to        - Recipient email address (from alert channel config)
   * @param alertText - Human-readable alert message (e.g. "🚨 monitor 'API' is DOWN")
   * @param extra     - Optional additional metadata to include in the email (JSON-serializable)
   */
  async sendAlertEmail(to: string, alertText: string, extra?: unknown) {
    const subject = `${APP_NAME} Alert`;

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
          This is a test notification from ${APP_NAME}. Your alert channel is configured correctly.
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
          Log in to ${APP_NAME} to view full monitor history and acknowledge this alert.
        </p>
      `
    );

    return this.deliver(to, subject, text, html);
  }

  // ───────── Scheduled Uptime Report ─────────

  /**
   * Sends a scheduled uptime summary report email.
   * Called by the ReportsService cron job (runs every 15 minutes, dispatches due reports).
   *
   * @param to   - Report recipient email address
   * @param data - Aggregated uptime metrics for the report period
   */
  async sendUptimeReport(to: string, data: {
    frequency: string;
    periodLabel: string;
    overallUptimePct: number;
    totalMonitors: number;
    uptimeMonitors: number;
    greenCount: number;
    yellowCount: number;
    redCount: number;
    topMonitors: Array<{ name: string; uptimePct: number; status: string }>;
    activeIncidents: number;
    dashboardUrl: string;
  }) {
    const isWeekly = data.frequency === 'weekly';
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const subject = isWeekly
      ? `${APP_NAME} Weekly Report — Week of ${dateStr}`
      : `${APP_NAME} Daily Report — ${dateStr}`;

    const uptimeColor =
      data.overallUptimePct >= 99 ? '#22c55e'
      : data.overallUptimePct >= 95 ? '#f59e0b'
      : '#ef4444';

    const statusRows = data.topMonitors
      .slice(0, 10)
      .map((m) => {
        const color = m.status === 'green' || m.uptimePct >= 99 ? '#22c55e'
          : m.status === 'yellow' || m.uptimePct >= 95 ? '#f59e0b'
          : '#ef4444';
        const label = m.status === 'green' ? 'UP' : m.status === 'yellow' ? 'DEGRADED' : 'DOWN';
        return `<tr>
          <td style="padding:6px 8px;font-size:13px;color:#e2e8f0;border-bottom:1px solid #1e293b;">${m.name}</td>
          <td style="padding:6px 8px;font-size:12px;border-bottom:1px solid #1e293b;text-align:center;">
            <span style="background:${color}22;color:${color};border:1px solid ${color}44;border-radius:999px;padding:2px 8px;font-weight:700;font-size:11px;letter-spacing:0.4px;">${label}</span>
          </td>
          <td style="padding:6px 8px;font-size:13px;color:${color};font-weight:600;border-bottom:1px solid #1e293b;text-align:right;">${m.uptimePct.toFixed(1)}%</td>
        </tr>`;
      })
      .join('');

    const degradedAlert = (data.yellowCount + data.redCount) > 0
      ? `<div style="background:#ef444422;border:1px solid #ef444444;border-radius:8px;padding:12px 16px;margin:16px 0;">
          <p style="margin:0;font-size:13px;color:#fca5a5;font-weight:600;">⚠️ ${data.yellowCount + data.redCount} monitor${(data.yellowCount + data.redCount) > 1 ? 's are' : ' is'} degraded or down</p>
        </div>`
      : '';

    const html = htmlLayout(subject, `
      <h1 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#94a3b8;">
        ${isWeekly ? 'Weekly' : 'Daily'} Uptime Report
      </h1>
      <p style="margin:0 0 24px;font-size:13px;color:#475569;">${data.periodLabel}</p>

      <!-- Big uptime number -->
      <div style="text-align:center;padding:20px;background:#1e293b;border-radius:12px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;">Overall Uptime</p>
        <p style="margin:0;font-size:48px;font-weight:800;color:${uptimeColor};line-height:1;">${data.overallUptimePct.toFixed(2)}%</p>
      </div>

      <!-- Stat row -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr>
          <td style="padding:4px;">
            <div style="background:#1e293b;border-radius:8px;padding:12px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#f1f5f9;">${data.totalMonitors}</p>
              <p style="margin:2px 0 0;font-size:11px;color:#64748b;">Total Monitors</p>
            </div>
          </td>
          <td style="padding:4px;">
            <div style="background:#1e293b;border-radius:8px;padding:12px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#22c55e;">${data.greenCount}</p>
              <p style="margin:2px 0 0;font-size:11px;color:#64748b;">Healthy</p>
            </div>
          </td>
          <td style="padding:4px;">
            <div style="background:#1e293b;border-radius:8px;padding:12px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:${data.activeIncidents > 0 ? '#ef4444' : '#f1f5f9'}">${data.activeIncidents}</p>
              <p style="margin:2px 0 0;font-size:11px;color:#64748b;">Active Incidents</p>
            </div>
          </td>
        </tr>
      </table>

      ${degradedAlert}

      <!-- Monitor table -->
      ${data.topMonitors.length > 0 ? `
        ${divider()}
        <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Monitor Status</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th style="padding:6px 8px;font-size:11px;color:#475569;text-align:left;border-bottom:1px solid #1e293b;">Monitor</th>
              <th style="padding:6px 8px;font-size:11px;color:#475569;text-align:center;border-bottom:1px solid #1e293b;">Status</th>
              <th style="padding:6px 8px;font-size:11px;color:#475569;text-align:right;border-bottom:1px solid #1e293b;">Uptime</th>
            </tr>
          </thead>
          <tbody>
            ${statusRows}
          </tbody>
        </table>
      ` : ''}

      ${divider()}
      ${btnPrimary(data.dashboardUrl, 'Open Dashboard')}
      <p style="margin:12px 0 0;font-size:11px;color:#475569;">
        To change frequency or disable reports, go to Account → Scheduled Reports.
      </p>
    `);

    const text = [
      subject,
      '',
      `Overall Uptime: ${data.overallUptimePct.toFixed(2)}%`,
      `Total Monitors: ${data.totalMonitors} | Healthy: ${data.greenCount} | Active Incidents: ${data.activeIncidents}`,
      '',
      ...data.topMonitors.map((m) => `${m.name}: ${m.uptimePct.toFixed(1)}% (${m.status})`),
      '',
      `Dashboard: ${data.dashboardUrl}`,
    ].join('\n');

    return this.deliver(to, subject, text, html);
  }

  // ───────── Status Page Subscriber Update ─────────

  /**
   * Sends a status update notification to a status page subscriber.
   * Triggered when an incident is created or the page transitions to outage/degraded.
   *
   * @param to   - Subscriber's email address
   * @param opts - Update content: page details, headline, body text, optional unsubscribe URL
   */
  async sendStatusPageUpdateEmail(to: string, opts: {
    pageTitle: string;
    pageSlug: string;
    pageUrl: string;
    subject: string;
    headline: string;
    body: string;
    statusColor?: string;
    unsubscribeUrl?: string;
  }): Promise<{ sent: boolean }> {
    const { pageTitle, pageUrl, subject, headline, body, statusColor = '#f59e0b', unsubscribeUrl } = opts;
    const text = [
      `${headline}`,
      ``,
      `${body}`,
      ``,
      `View the status page: ${pageUrl}`,
      unsubscribeUrl ? `\nYou are receiving this because you subscribed to updates for "${pageTitle}". Unsubscribe: ${unsubscribeUrl}` : '',
    ].join('\n');

    const html = htmlLayout(subject, `
      <div style="display:inline-block;background:${statusColor}22;border:1px solid ${statusColor}44;border-radius:6px;padding:4px 12px;margin-bottom:20px;">
        <span style="font-size:12px;font-weight:700;color:${statusColor};text-transform:uppercase;letter-spacing:0.08em;">Status Update</span>
      </div>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f1f5f9;">${headline}</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#94a3b8;line-height:1.6;">${body.replace(/\n/g, '<br>')}</p>
      ${btnPrimary(pageUrl, `View ${pageTitle} Status`)}
      ${divider()}
      ${unsubscribeUrl
        ? `<p style="margin:0;font-size:11px;color:#475569;">
            You received this because you subscribed to status updates for <strong style="color:#94a3b8;">${pageTitle}</strong>.
            <a href="${unsubscribeUrl}" style="color:#3b82f6;">Unsubscribe</a>
           </p>`
        : `<p style="margin:0;font-size:11px;color:#475569;">Status update for <strong style="color:#94a3b8;">${pageTitle}</strong></p>`
      }
    `);

    return this.deliver(to, subject, text, html);
  }

  // ───────── Account Lockout ─────────

  /**
   * Notifies a user that their account has been locked due to excessive failed login attempts.
   * The lock expires automatically at `lockedUntil`.
   *
   * @param to          - Account holder's email address
   * @param lockedUntil - Timestamp when the lock automatically expires (15 minutes from lockout)
   * @param ipAddress   - Optional IP address that triggered the lockout (for user awareness)
   */
  async sendAccountLockedEmail(to: string, lockedUntil: Date, ipAddress?: string | null) {
    const subject = `Your ${APP_NAME} account has been temporarily locked`;
    const text = `Your ${APP_NAME} account was temporarily locked due to 5 consecutive failed login attempts.\n\nThe lockout will expire at: ${lockedUntil.toUTCString()}\n\nIf this wasn't you, please change your password immediately after regaining access.`;

    const unlockTime = lockedUntil.toUTCString();

    const html = htmlLayout(subject, `
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ef4444;">🔒 Account temporarily locked</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#94a3b8;line-height:1.6;">
        Your account was locked after <strong style="color:#f1f5f9;">5 consecutive failed login attempts</strong>.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
        ${metaRow('Locked until', unlockTime)}
        ${ipAddress ? metaRow('Attempted from', ipAddress) : ''}
      </table>
      ${divider()}
      <p style="margin:0 0 12px;font-size:14px;color:#94a3b8;line-height:1.6;">
        Your account will automatically unlock after 15 minutes. If you did not make these attempts,
        please change your password immediately after regaining access.
      </p>
      <p style="margin:0;font-size:12px;color:#475569;">
        If you believe your account has been compromised, contact your instance administrator.
      </p>
    `);

    return this.deliver(to, subject, text, html);
  }
}
