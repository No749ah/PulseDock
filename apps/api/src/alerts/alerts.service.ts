import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { AlertChannel, Monitor, MonitorRun } from '../types';
import { MetricsService } from '../common/metrics.service';

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

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
    if (channel.type === 'email') {
      console.log(`[email] ${String(channel.config.to ?? 'unknown')}: ${text}`);
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

    const text = `🚨 PulseDock: ${monitor.name} is ${run.level.toUpperCase()} (${run.message})`;

    for (const channel of channels) {
      try {
        await this.sendWithRetry(channel, text, { monitor, run });
      } catch (error) {
        console.error('alert channel failed', channel.name, error);
      }
    }
  }

  async notifyTest(channel: AlertChannel) {
    const text = '✅ PulseDock test notification: this channel is configured correctly.';
    await this.sendWithRetry(channel, text, { test: true, at: new Date().toISOString() });
  }
}
