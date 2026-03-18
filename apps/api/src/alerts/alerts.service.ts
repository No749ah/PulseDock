import { createHmac } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { MailerService } from '../common/mailer.service';
import type { AlertChannel, Monitor, MonitorLevel, MonitorRun } from '../types';
import { MetricsService } from '../common/metrics.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private readonly realtime: Pick<RealtimeEvents, 'alertTriggered'>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly mailer: MailerService,
    private readonly notifications: NotificationsService,
    @Optional() realtime?: RealtimeEvents,
  ) {
    this.realtime = realtime ?? { alertTriggered: () => undefined };
  }

  /**
   * Maps a monitor run level to a notification event type.
   * green = recovery, yellow = degraded, red = down
   */
  private levelToEventType(level: MonitorLevel): 'down' | 'recovery' | 'degraded' {
    if (level === 'green') return 'recovery';
    if (level === 'yellow') return 'degraded';
    return 'down';
  }

  /**
   * Computes the HMAC-SHA256 signature for a webhook body.
   * Receivers should verify: X-PulseDock-Signature == sha256=<hex>
   */
  private webhookSignature(secret: string, body: string): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  /** Build a Discord embed payload for a monitor alert. */
  private buildDiscordEmbed(channel: AlertChannel, text: string, extra?: unknown): Record<string, unknown> {
    const ctx = extra as { monitor?: { name?: string; type?: string; target?: string }; run?: { level?: string; message?: string; latencyMs?: number; checkedAt?: string }; test?: boolean } | undefined;
    const run = ctx?.run;
    const monitor = ctx?.monitor;
    const isTest = ctx?.test === true;

    const level = run?.level ?? (isTest ? 'green' : 'red');
    const color = level === 'green' ? 0x3fb950 : level === 'yellow' ? 0xd29922 : 0xf85149;
    const emoji = level === 'green' ? '✅' : level === 'yellow' ? '⚠️' : '🚨';
    const statusLabel = level === 'green' ? 'Recovered' : level === 'yellow' ? 'Degraded' : 'Down';

    const cfg = channel.config as Record<string, unknown>;
    const username = typeof cfg.username === 'string' && cfg.username ? cfg.username : 'PulseDock';
    const avatarUrl = typeof cfg.avatarUrl === 'string' && cfg.avatarUrl ? cfg.avatarUrl : undefined;

    // Custom message template support: {monitor}, {status}, {message}, {latency}
    let description = typeof cfg.messageTemplate === 'string' && cfg.messageTemplate
      ? cfg.messageTemplate
          .replace('{monitor}', monitor?.name ?? 'Unknown')
          .replace('{status}', statusLabel)
          .replace('{message}', run?.message ?? text)
          .replace('{latency}', run?.latencyMs != null ? `${run.latencyMs}ms` : '—')
      : run?.message ?? text;

    const fields: Array<{ name: string; value: string; inline: boolean }> = [];

    if (monitor?.name) fields.push({ name: 'Monitor', value: monitor.name, inline: true });
    if (monitor?.type) fields.push({ name: 'Type', value: monitor.type.replace('_', ' '), inline: true });
    if (run?.latencyMs != null) fields.push({ name: 'Latency', value: `${run.latencyMs}ms`, inline: true });
    if (monitor?.target) fields.push({ name: 'Target', value: `\`${monitor.target}\``, inline: false });

    const embed: Record<string, unknown> = {
      title: `${emoji} ${monitor?.name ?? 'Monitor'} — ${statusLabel}`,
      description,
      color,
      fields,
      timestamp: run?.checkedAt ?? new Date().toISOString(),
      footer: { text: 'PulseDock' },
    };

    // Build mention string (role or user ping)
    const mentionParts: string[] = [];
    if (typeof cfg.mentionRoleId === 'string' && cfg.mentionRoleId) mentionParts.push(`<@&${cfg.mentionRoleId}>`);
    if (typeof cfg.mentionUserId === 'string' && cfg.mentionUserId) mentionParts.push(`<@${cfg.mentionUserId}>`);
    const mention = mentionParts.length > 0 ? mentionParts.join(' ') : undefined;

    const payload: Record<string, unknown> = {
      username,
      embeds: [embed],
    };
    if (avatarUrl) payload.avatar_url = avatarUrl;
    if (mention) payload.content = mention;

    return payload;
  }

  private async send(channel: AlertChannel, text: string, extra?: unknown) {
    if (channel.type === 'webhook' && typeof channel.config.url === 'string') {
      const body = JSON.stringify({ text, extra });
      const headers: Record<string, string> = { 'content-type': 'application/json' };

      if (typeof channel.config.secret === 'string' && channel.config.secret.length > 0) {
        headers['x-pulsedock-signature'] = this.webhookSignature(channel.config.secret, body);
      }

      await fetch(channel.config.url, { method: 'POST', headers, body });
      return;
    }

    if (channel.type === 'discord' && typeof channel.config.webhookUrl === 'string') {
      const payload = this.buildDiscordEmbed(channel, text, extra);
      const resp = await fetch(channel.config.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`Discord webhook returned ${resp.status}: ${body}`);
      }
      return;
    }

    if (channel.type === 'slack' && typeof channel.config.webhookUrl === 'string') {
      // Slack Block Kit message
      const ctx = extra as { monitor?: { name?: string; target?: string }; run?: { level?: string; message?: string; latencyMs?: number }; test?: boolean } | undefined;
      const run = ctx?.run;
      const monitor = ctx?.monitor;
      const level = run?.level ?? 'red';
      const emoji = level === 'green' ? ':white_check_mark:' : level === 'yellow' ? ':warning:' : ':rotating_light:';
      const blocks = [
        { type: 'header', text: { type: 'plain_text', text: `${emoji} ${monitor?.name ?? 'Monitor'} Alert`, emoji: true } },
        { type: 'section', fields: [
          { type: 'mrkdwn', text: `*Status:*\n${run?.level?.toUpperCase() ?? 'UNKNOWN'}` },
          { type: 'mrkdwn', text: `*Message:*\n${run?.message ?? text}` },
          ...(run?.latencyMs != null ? [{ type: 'mrkdwn', text: `*Latency:*\n${run.latencyMs}ms` }] : []),
          ...(monitor?.target ? [{ type: 'mrkdwn', text: `*Target:*\n${monitor.target}` }] : []),
        ]},
        { type: 'context', elements: [{ type: 'mrkdwn', text: 'Sent by PulseDock' }] },
      ];
      await fetch(channel.config.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, blocks }),
      });
      return;
    }

    if (channel.type === 'telegram' && typeof channel.config.botToken === 'string' && typeof channel.config.chatId === 'string') {
      const parseMode = typeof channel.config.parseMode === 'string' ? channel.config.parseMode : 'HTML';
      const ctx = extra as { monitor?: { name?: string; target?: string }; run?: { level?: string; message?: string; latencyMs?: number }; test?: boolean } | undefined;
      const run = ctx?.run;
      const monitor = ctx?.monitor;

      let msgText = text;
      if (parseMode === 'HTML' && run && monitor) {
        const emoji = run.level === 'green' ? '✅' : run.level === 'yellow' ? '⚠️' : '🚨';
        const status = run.level === 'green' ? 'Recovered' : run.level === 'yellow' ? 'Degraded' : 'Down';
        msgText = `${emoji} <b>${monitor.name}</b> — ${status}\n<code>${run.message}</code>`;
        if (run.latencyMs != null) msgText += `\nLatency: <b>${run.latencyMs}ms</b>`;
        if (monitor.target) msgText += `\nTarget: <code>${monitor.target}</code>`;
      }

      await fetch(`https://api.telegram.org/bot${channel.config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: channel.config.chatId, text: msgText, parse_mode: parseMode }),
      });
      return;
    }

    if (channel.type === 'email' && typeof channel.config.to === 'string') {
      await this.mailer.sendAlertEmail(channel.config.to, text, extra);
      return;
    }
  }

  private async sendWithRetry(channel: AlertChannel, text: string, extra?: unknown) {
    const delays = [200, 800, 2000];
    let lastError: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        await this.send(channel, text, extra);
        this.metrics.inc('alertsSent');
        return;
      } catch (error) {
        lastError = error;
        if (attempt < delays.length) {
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        }
      }
    }

    this.metrics.inc('alertsFailed');
    throw lastError;
  }

  async notifyMonitorFailure(monitor: Monitor, run: MonitorRun, context?: { levelChanged?: boolean; previousLevel?: string | null; failureStreak?: number }) {
    // Suppress alerts during active maintenance windows
    const now = new Date();
    const activeMaintenance = await this.prisma.maintenanceWindow.findFirst({
      where: {
        userId: monitor.userId,
        monitors: { some: { monitorId: monitor.id } },
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
    });
    if (activeMaintenance) {
      this.logger.log(
        `Suppressing alert for monitor "${monitor.name}" (id=${monitor.id}): active maintenance window "${activeMaintenance.name}"`,
      );
      return;
    }

    // Check notification preferences before dispatching alerts
    const eventType = this.levelToEventType(run.level);
    const shouldSend = await this.notifications.shouldNotify(monitor.userId, eventType);

    if (!shouldSend) {
      this.logger.debug(
        `Suppressed alert for monitor "${monitor.name}" (userId=${monitor.userId}, level=${run.level}, eventType=${eventType}) — notification preferences`,
      );
      return;
    }

    const links = await this.prisma.monitorAlert.findMany({
      where: { monitorId: monitor.id },
      include: { alertChannel: true },
    });

    const levelChanged = context?.levelChanged ?? true;
    const previousLevel = context?.previousLevel ?? null;
    const failureStreak = context?.failureStreak ?? 1;
    const isVersionMonitor = monitor.type === 'GIT_RELEASE' || monitor.type === 'DOCKER_IMAGE';
    const alertNow = new Date();

    // Filter channels based on notifyOn setting
    const eligibleLinks = links.filter((l) => {
      if (l.alertChannel.userId !== monitor.userId) return false;
      const notifyOn: string = (l.notifyOn as string) || 'ON_CHANGE';

      switch (notifyOn) {
        case 'ON_CHANGE':
          // Only fire when status changed (new failure or recovery)
          return levelChanged;
        case 'ALWAYS':
          // Every non-green run (or every check for version monitors)
          return run.level !== 'green';
        case 'FIRST_ONLY':
          // Only first failure in a streak (streak === 1)
          return failureStreak === 1;
        case 'DAILY_DIGEST': {
          // At most once per 24h per monitor+channel
          const lastNotified = l.lastNotifiedAt;
          if (!lastNotified) return true;
          const hoursSince = (alertNow.getTime() - lastNotified.getTime()) / 3_600_000;
          return hoursSince >= 24;
        }
        case 'VERSION_ANY':
          // Version monitors: fire when not up-to-date (yellow or red)
          return isVersionMonitor && run.level !== 'green';
        case 'VERSION_MAJOR':
          // Version monitors: fire only on major version behind (red)
          return isVersionMonitor && run.level === 'red';
        default:
          return levelChanged;
      }
    });

    // Update lastNotifiedAt for DAILY_DIGEST channels that are firing
    const dailyDigestIds = eligibleLinks
      .filter((l) => (l.notifyOn as string) === 'DAILY_DIGEST')
      .map((l) => l.alertChannelId);
    if (dailyDigestIds.length > 0) {
      await this.prisma.monitorAlert.updateMany({
        where: { monitorId: monitor.id, alertChannelId: { in: dailyDigestIds } },
        data: { lastNotifiedAt: alertNow },
      });
    }

    const channels: AlertChannel[] = eligibleLinks.map((l) => ({
      id: l.alertChannel.id,
      userId: l.alertChannel.userId,
      name: l.alertChannel.name,
      type: l.alertChannel.type as AlertChannel['type'],
      config: (l.alertChannel.configJson as Record<string, unknown>) ?? {},
      createdAt: l.alertChannel.createdAt.toISOString(),
    }));

    const levelEmoji = run.level === 'red' ? '🚨' : run.level === 'yellow' ? '⚠️' : '✅';
    const text = `${levelEmoji} PulseDock: ${monitor.name} is ${run.level.toUpperCase()} (${run.message})`;

    this.realtime.alertTriggered(monitor.userId, {
      monitor: {
        id: monitor.id,
        name: monitor.name,
      },
      run,
      channelCount: channels.length,
      sentAt: new Date().toISOString(),
    });

    for (const channel of channels) {
      try {
        await this.sendWithRetry(channel, text, { monitor, run });
      } catch (error) {
        this.logger.error(`Alert channel failed: ${channel.name}`, error instanceof Error ? error.stack : String(error));
      }
    }
  }

  async notifyTest(channel: AlertChannel) {
    const text = '✅ PulseDock test notification: this channel is configured correctly.';
    await this.sendWithRetry(channel, text, { test: true, at: new Date().toISOString() });
  }
}
