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

  private async send(channel: AlertChannel, text: string, extra?: unknown) {
    if (channel.type === 'webhook' && typeof channel.config.url === 'string') {
      await fetch(channel.config.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, extra }) });
      return;
    }

    if ((channel.type === 'discord' || channel.type === 'slack') && typeof channel.config.webhookUrl === 'string') {
      const payload = channel.type === 'discord' ? { content: text } : { text };
      await fetch(channel.config.webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      return;
    }

    if (channel.type === 'telegram' && typeof channel.config.botToken === 'string' && typeof channel.config.chatId === 'string') {
      await fetch(`https://api.telegram.org/bot${channel.config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: channel.config.chatId, text }),
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

  async notifyMonitorFailure(monitor: Monitor, run: MonitorRun) {
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

    const channels: AlertChannel[] = links
      .filter((l) => l.alertChannel.userId === monitor.userId)
      .map((l) => ({
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
