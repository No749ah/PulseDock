import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

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

  async sendInviteEmail(to: string, inviteUrl: string) {
    const from = process.env.MAIL_FROM ?? 'noreply@pulsedock.local';
    const transporter = this.transporter();

    const subject = 'PulseDock invite';
    const text = `You were invited to PulseDock. Open this link: ${inviteUrl}`;

    if (!transporter) {
      this.logger.warn(`[mail-disabled] invite to ${to}: ${inviteUrl}`);
      return { sent: false };
    }

    await transporter.sendMail({ from, to, subject, text });
    return { sent: true };
  }

  async sendPasswordResetEmail(to: string, resetUrl: string) {
    const from = process.env.MAIL_FROM ?? 'noreply@pulsedock.local';
    const transporter = this.transporter();

    const subject = 'PulseDock password reset';
    const text = `Reset your PulseDock password via: ${resetUrl}`;

    if (!transporter) {
      this.logger.warn(`[mail-disabled] password reset for ${to}: ${resetUrl}`);
      return { sent: false };
    }

    await transporter.sendMail({ from, to, subject, text });
    return { sent: true };
  }

  async sendEmailVerificationEmail(to: string, verifyUrl: string) {
    const from = process.env.MAIL_FROM ?? 'noreply@pulsedock.local';
    const transporter = this.transporter();

    const subject = 'Verify your PulseDock email';
    const text = `Please verify your PulseDock email address by opening this link: ${verifyUrl}`;

    if (!transporter) {
      this.logger.warn(`[mail-disabled] email verification for ${to}: ${verifyUrl}`);
      return { sent: false };
    }

    await transporter.sendMail({ from, to, subject, text });
    return { sent: true };
  }

  async sendAlertEmail(to: string, alertText: string, extra?: unknown) {
    const from = process.env.MAIL_FROM ?? 'noreply@pulsedock.local';
    const transporter = this.transporter();

    const subject = 'PulseDock Alert';
    const body = extra
      ? `${alertText}\n\n---\n${JSON.stringify(extra, null, 2)}`
      : alertText;

    if (!transporter) {
      this.logger.warn(`[mail-disabled] alert to ${to}: ${alertText}`);
      return { sent: false };
    }

    await transporter.sendMail({ from, to, subject: subject, text: body });
    return { sent: true };
  }
}
