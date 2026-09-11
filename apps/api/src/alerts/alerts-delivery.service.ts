import { createHmac } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { MailerService } from '../common/mailer.service';
import type { AlertChannel } from '../types';
import { MetricsService } from '../common/metrics.service';

@Injectable()
export class AlertsDeliveryService {
  private readonly logger = new Logger(AlertsDeliveryService.name);

  /** In-memory batch queue for alert batching / digest mode (resets on restart — acceptable). */
  readonly alertBatchQueue = new Map<string, {
    channelId: string;
    channel: AlertChannel;
    windowMs: number;
    alerts: Array<{ monitorName: string; level: string; message: string; timestamp: Date }>;
    timer: ReturnType<typeof setTimeout>;
  }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Maps a monitor run level to a notification event type.
   * green = recovery, yellow = degraded, red = down
   */
  levelToEventType(level: string): 'down' | 'recovery' | 'degraded' {
    if (level === 'green') return 'recovery';
    if (level === 'yellow') return 'degraded';
    return 'down';
  }

  /**
   * Computes the HMAC-SHA256 signature for a webhook body.
   * Receivers should verify: X-PulseDock-Signature == sha256=<hex>
   */
  webhookSignature(secret: string, body: string): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  /** Build a Discord embed payload for a monitor alert. */
  buildDiscordEmbed(channel: AlertChannel, text: string, extra?: unknown): Record<string, unknown> {
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

  /**
   * Renders a Mustache-style payload template string with alert context variables.
   * Supports: {{monitor.name}}, {{monitor.type}}, {{monitor.target}}, {{monitor.runbookUrl}},
   *           {{run.level}}, {{run.message}}, {{run.latencyMs}}, {{run.checkedAt}},
   *           {{run.statusCode}}, {{run.ok}}, {{text}}, {{timestamp}}, {{channelName}}
   *
   * @param template - The template string with {{variable}} placeholders
   * @param ctx - Rendering context containing monitor, run, and text data
   * @returns Rendered string with all known placeholders substituted
   */
  renderPayloadTemplate(template: string, ctx: { text: string; channel: AlertChannel; extra?: unknown }): string {
    const extra = ctx.extra as { monitor?: Record<string, unknown>; run?: Record<string, unknown> } | undefined;
    const monitor = extra?.monitor ?? {};
    const run = extra?.run ?? {};
    const vars: Record<string, string> = {
      text: ctx.text,
      timestamp: new Date().toISOString(),
      channelName: ctx.channel.name,
      'monitor.name': String(monitor.name ?? ''),
      'monitor.type': String(monitor.type ?? ''),
      'monitor.target': String(monitor.target ?? ''),
      'monitor.runbookUrl': String(monitor.runbookUrl ?? ''),
      'monitor.id': String(monitor.id ?? ''),
      'run.level': String(run.level ?? ''),
      'run.message': String(run.message ?? ''),
      'run.latencyMs': String(run.latencyMs ?? ''),
      'run.checkedAt': String(run.checkedAt ?? ''),
      'run.statusCode': String(run.statusCode ?? ''),
      'run.ok': String(run.ok ?? ''),
    };
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key: string) => vars[key] ?? '');
  }

  /**
   * Sends an alert through a concrete channel transport.
   * Supports webhook, Discord, Slack, Telegram, and email channel types.
   *
   * @param channel - The configured alert channel
   * @param text - Plain-text fallback message
   * @param extra - Optional structured payload used by rich channel formatters
   * @returns Resolves when the outbound request has been dispatched
   * @throws Error when the underlying channel request fails (e.g., non-2xx Discord response)
   */
  async send(channel: AlertChannel, text: string, extra?: unknown) {
    // Apply channel-level message template ({{token}} substitution) before any transport
    if (channel.messageTemplate && channel.messageTemplate.trim().length > 0) {
      try {
        text = this.renderPayloadTemplate(channel.messageTemplate, { text, channel, extra });
      } catch {
        // Template render failed — keep original text
      }
    }

    if (channel.type === 'webhook' && typeof channel.config.url === 'string') {
      // Use custom payload template if configured, otherwise fall back to default payload
      let body: string;
      if (typeof channel.config.payloadTemplate === 'string' && channel.config.payloadTemplate.trim().length > 0) {
        try {
          body = this.renderPayloadTemplate(channel.config.payloadTemplate, { text, channel, extra });
        } catch {
          // Template render failed — fall back to default payload
          body = JSON.stringify({ text, extra });
        }
      } else {
        body = JSON.stringify({ text, extra });
      }
      const headers: Record<string, string> = { 'content-type': 'application/json' };

      // Merge user-defined custom headers (e.g., Authorization, X-API-Key)
      // Sanitise: only string values, skip reserved headers that could break delivery
      const RESERVED_HEADERS = new Set(['content-type', 'content-length', 'transfer-encoding', 'host']);
      if (channel.config.customHeaders && typeof channel.config.customHeaders === 'object' && !Array.isArray(channel.config.customHeaders)) {
        for (const [k, v] of Object.entries(channel.config.customHeaders as Record<string, unknown>)) {
          if (typeof k === 'string' && typeof v === 'string' && !RESERVED_HEADERS.has(k.toLowerCase())) {
            headers[k] = v;
          }
        }
      }

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
      // Only apply HTML formatting if no channel-level messageTemplate was applied
      // (when messageTemplate is set, `text` is already the user's custom message)
      if (parseMode === 'HTML' && run && monitor && !channel.messageTemplate?.trim()) {
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

    if (channel.type === 'pagerduty' && typeof channel.config.integrationKey === 'string') {
      const ctx = extra as { run?: { level?: string }; monitor?: { name?: string; target?: string }; monitorId?: string; test?: boolean } | undefined;
      const level = (ctx?.run?.level ?? 'red') as string;
      const monitorId = (extra as Record<string, unknown> | undefined)?.monitorId as string | undefined
        ?? ctx?.monitor?.name
        ?? 'unknown';
      const eventAction = level === 'green' ? 'resolve' : 'trigger';
      const severity = level === 'red' ? 'critical' : level === 'yellow' ? 'warning' : 'info';
      const body = JSON.stringify({
        routing_key: channel.config.integrationKey,
        event_action: eventAction,
        dedup_key: monitorId,
        payload: {
          summary: text,
          severity,
          source: ctx?.monitor?.target ?? 'PulseDock',
          custom_details: ctx,
        },
      });
      const resp = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      if (!resp.ok) {
        const respBody = await resp.text().catch(() => '');
        throw new Error(`PagerDuty returned ${resp.status}: ${respBody}`);
      }
      return;
    }

    if (channel.type === 'opsgenie' && typeof channel.config.apiKey === 'string') {
      const ctx = extra as { run?: { level?: string }; monitor?: { name?: string; target?: string }; monitorId?: string; test?: boolean } | undefined;
      const level = (ctx?.run?.level ?? 'red') as string;
      const monitorId = (extra as Record<string, unknown> | undefined)?.monitorId as string | undefined
        ?? ctx?.monitor?.name
        ?? 'unknown';
      const region = channel.config.region === 'eu' ? 'eu' : 'us';
      const baseUrl = region === 'eu' ? 'https://api.eu.opsgenie.com/v2/alerts' : 'https://api.opsgenie.com/v2/alerts';
      const authHeader = `GenieKey ${channel.config.apiKey}`;

      if (level === 'green') {
        // Close/resolve the alert via alias
        const resp = await fetch(`${baseUrl}/${encodeURIComponent(monitorId)}/close`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Authorization': authHeader },
          body: JSON.stringify({ note: text }),
        });
        if (!resp.ok && resp.status !== 404) {
          const respBody = await resp.text().catch(() => '');
          throw new Error(`OpsGenie close returned ${resp.status}: ${respBody}`);
        }
      } else {
        const priority = level === 'red' ? 'P1' : level === 'yellow' ? 'P2' : 'P3';
        const body = JSON.stringify({
          message: text,
          alias: monitorId,
          description: text,
          priority,
          details: ctx as Record<string, unknown>,
        });
        const resp = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Authorization': authHeader },
          body,
        });
        if (!resp.ok) {
          const respBody = await resp.text().catch(() => '');
          throw new Error(`OpsGenie returned ${resp.status}: ${respBody}`);
        }
      }
      return;
    }

    if (
      channel.type === 'sms' &&
      typeof channel.config.accountSid === 'string' &&
      typeof channel.config.authToken === 'string' &&
      typeof channel.config.from === 'string' &&
      typeof channel.config.to === 'string'
    ) {
      // Twilio SMS via REST API (no SDK required)
      const { accountSid, authToken, from, to: toNumber } = channel.config as {
        accountSid: string;
        authToken: string;
        from: string;
        to: string;
      };
      const ctx = extra as {
        monitor?: { name?: string };
        run?: { level?: string; message?: string };
        test?: boolean;
      } | undefined;
      const level = ctx?.run?.level ?? 'red';
      const emoji = level === 'green' ? '✅' : level === 'yellow' ? '⚠️' : '🚨';
      const smsBody = `${emoji} PulseDock: ${ctx?.monitor?.name ?? 'Monitor'} — ${text.slice(0, 120)}`;

      const params = new URLSearchParams({
        From: from,
        To: toNumber,
        Body: smsBody,
      });
      const creds = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${creds}`,
          },
          body: params.toString(),
        },
      );
      if (!resp.ok) {
        const respBody = await resp.text().catch(() => '');
        throw new Error(`Twilio SMS returned ${resp.status}: ${respBody}`);
      }
      return;
    }

    if (channel.type === 'teams' && typeof channel.config.webhookUrl === 'string') {
      const ctx = extra as {
        monitor?: { name?: string; type?: string; target?: string };
        run?: { level?: string; message?: string; latencyMs?: number; checkedAt?: string };
        test?: boolean;
      } | undefined;
      const run = ctx?.run;
      const monitor = ctx?.monitor;
      const level = run?.level ?? 'red';
      const emoji = level === 'green' ? '✅' : level === 'yellow' ? '⚠️' : '🚨';
      const statusLabel = level === 'green' ? 'Recovered' : level === 'yellow' ? 'Degraded' : 'Down';
      const themeColor = level === 'green' ? '3fb950' : level === 'yellow' ? 'd29922' : 'f85149';

      // Microsoft Teams Adaptive Card payload (works with both old Connectors and new workflows)
      const facts: Array<{ name: string; value: string }> = [];
      if (monitor?.name) facts.push({ name: 'Monitor', value: monitor.name });
      if (monitor?.type) facts.push({ name: 'Type', value: monitor.type.replace('_', ' ') });
      if (run?.latencyMs != null) facts.push({ name: 'Latency', value: `${run.latencyMs}ms` });
      if (monitor?.target) facts.push({ name: 'Target', value: monitor.target });
      if (run?.checkedAt) facts.push({ name: 'Time', value: new Date(run.checkedAt).toUTCString() });

      const teamsPayload = {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor,
        summary: `${emoji} ${monitor?.name ?? 'Monitor'} — ${statusLabel}`,
        sections: [
          {
            activityTitle: `${emoji} **${monitor?.name ?? 'Monitor'} — ${statusLabel}**`,
            activitySubtitle: 'PulseDock Alert',
            activityText: run?.message ?? text,
            facts,
            markdown: true,
          },
        ],
      };

      const resp = await fetch(channel.config.webhookUrl as string, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(teamsPayload),
      });
      if (!resp.ok) {
        const respBody = await resp.text().catch(() => '');
        throw new Error(`Microsoft Teams webhook returned ${resp.status}: ${respBody}`);
      }
      return;
    }

    // ── ntfy ─────────────────────────────────────────────────────────────────
    // Config: { topicUrl: string, token?: string }
    // topicUrl is the full topic URL e.g. https://ntfy.sh/my-alerts or https://ntfy.example.com/alerts
    if (channel.type === 'ntfy' && typeof channel.config.topicUrl === 'string') {
      const ctx = extra as {
        monitor?: { name?: string; type?: string; target?: string };
        run?: { level?: string; message?: string; latencyMs?: number };
        test?: boolean;
      } | undefined;
      const run = ctx?.run;
      const monitor = ctx?.monitor;
      const level = run?.level ?? 'red';
      const priority = level === 'red' ? '5' : level === 'yellow' ? '3' : '2';
      const emoji = level === 'green' ? '✅' : level === 'yellow' ? '⚠️' : '🚨';
      const statusLabel = level === 'green' ? 'Recovered' : level === 'yellow' ? 'Degraded' : 'Down';
      const title = `${emoji} ${monitor?.name ?? 'Monitor'} — ${statusLabel}`;
      const msgText = run?.message ?? text;

      const headers: Record<string, string> = {
        'content-type': 'text/plain; charset=utf-8',
        'X-Title': title,
        'X-Priority': priority,
        'X-Tags': level === 'green' ? 'white_check_mark' : level === 'yellow' ? 'warning' : 'rotating_light',
      };
      if (typeof channel.config.token === 'string' && channel.config.token.length > 0) {
        headers['Authorization'] = `Bearer ${channel.config.token}`;
      }

      const resp = await fetch(channel.config.topicUrl as string, {
        method: 'POST',
        headers,
        body: msgText,
      });
      if (!resp.ok) {
        const respBody = await resp.text().catch(() => '');
        throw new Error(`ntfy returned ${resp.status}: ${respBody}`);
      }
      return;
    }

    // ── Gotify ─────────────────────────────────────────────────────────────────
    // Config: { serverUrl: string, appToken: string, priority?: number }
    // serverUrl e.g. https://gotify.example.com (no trailing slash)
    if (
      channel.type === 'gotify' &&
      typeof channel.config.serverUrl === 'string' &&
      typeof channel.config.appToken === 'string'
    ) {
      const ctx = extra as {
        monitor?: { name?: string; type?: string; target?: string };
        run?: { level?: string; message?: string; latencyMs?: number };
        test?: boolean;
      } | undefined;
      const run = ctx?.run;
      const monitor = ctx?.monitor;
      const level = run?.level ?? 'red';
      const defaultPriority = level === 'red' ? 9 : level === 'yellow' ? 5 : 1;
      const priority =
        typeof channel.config.priority === 'number' ? channel.config.priority : defaultPriority;
      const emoji = level === 'green' ? '✅' : level === 'yellow' ? '⚠️' : '🚨';
      const statusLabel = level === 'green' ? 'Recovered' : level === 'yellow' ? 'Degraded' : 'Down';
      const title = `${emoji} ${monitor?.name ?? 'Monitor'} — ${statusLabel}`;
      const msgText = run?.message ?? text;

      const serverUrl = (channel.config.serverUrl as string).replace(/\/$/, '');
      const resp = await fetch(`${serverUrl}/message`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Gotify-Key': channel.config.appToken as string,
        },
        body: JSON.stringify({ title, message: msgText, priority }),
      });
      if (!resp.ok) {
        const respBody = await resp.text().catch(() => '');
        throw new Error(`Gotify returned ${resp.status}: ${respBody}`);
      }
      return;
    }

    // ── Matrix ────────────────────────────────────────────────────────────────
    if (
      channel.type === 'matrix' &&
      typeof channel.config.homeserverUrl === 'string' &&
      typeof channel.config.accessToken === 'string' &&
      typeof channel.config.roomId === 'string'
    ) {
      const baseUrl = (channel.config.homeserverUrl as string).replace(/\/$/, '');
      const roomId = channel.config.roomId as string;
      const matrixToken = channel.config.accessToken as string;

      const matrixExtra = extra as { run?: { level?: string }; monitor?: { name?: string } } | undefined;
      const matrixLevel = matrixExtra?.run?.level ?? 'red';
      const matrixMonitorName = matrixExtra?.monitor?.name ?? 'Monitor';

      const levelEmoji = matrixLevel === 'red' ? '🔴' : matrixLevel === 'yellow' ? '🟡' : '🟢';
      const levelLabel = matrixLevel === 'red' ? 'DOWN' : matrixLevel === 'yellow' ? 'DEGRADED' : 'RECOVERED';

      const plainBody = `${levelEmoji} [PulseDock] ${levelLabel}: ${matrixMonitorName}\n${text}`;
      const htmlBody =
        `<p>${levelEmoji} <strong>[PulseDock] ${levelLabel}:</strong> ${matrixMonitorName}</p>` +
        `<p>${text.replace(/\n/g, '<br/>')}</p>`;

      const txnId = `pulsedock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const matrixUrl = `${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`;

      const matrixResp = await fetch(matrixUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${matrixToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          msgtype: 'm.text',
          body: plainBody,
          format: 'org.matrix.custom.html',
          formatted_body: htmlBody,
        }),
      });
      if (!matrixResp.ok) {
        const matrixBody = await matrixResp.text().catch(() => '');
        throw new Error(`Matrix returned ${matrixResp.status}: ${matrixBody}`);
      }
      return;
    }

    // ── Rocket.Chat ──────────────────────────────────────────────────────────
    if (channel.type === 'rocketchat' && typeof channel.config.webhookUrl === 'string') {
      const ctx = extra as {
        monitor?: { name?: string; type?: string; target?: string };
        run?: { level?: string; message?: string; latencyMs?: number; checkedAt?: string };
        test?: boolean;
      } | undefined;
      const run = ctx?.run;
      const monitor = ctx?.monitor;
      const level = run?.level ?? 'red';
      const emoji = level === 'green' ? '✅' : level === 'yellow' ? '⚠️' : '🚨';
      const statusLabel = level === 'green' ? 'Recovered' : level === 'yellow' ? 'Degraded' : 'Down';
      const color = level === 'green' ? '#3fb950' : level === 'yellow' ? '#d29922' : '#f85149';

      const fields: Array<{ title: string; value: string; short: boolean }> = [];
      if (monitor?.name) fields.push({ title: 'Monitor', value: monitor.name, short: true });
      if (monitor?.type) fields.push({ title: 'Type', value: monitor.type.replace('_', ' '), short: true });
      if (run?.latencyMs != null) fields.push({ title: 'Latency', value: `${run.latencyMs}ms`, short: true });
      if (monitor?.target) fields.push({ title: 'Target', value: monitor.target, short: false });

      const rcPayload = {
        text: `${emoji} **PulseDock Alert** — ${monitor?.name ?? 'Monitor'} is ${statusLabel}`,
        attachments: [
          {
            color,
            title: `${statusLabel}: ${monitor?.name ?? 'Monitor'}`,
            text: run?.message ?? text,
            fields,
            ts: new Date().toISOString(),
            footer: 'PulseDock',
          },
        ],
      };

      const rcResp = await fetch(channel.config.webhookUrl as string, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(rcPayload),
      });
      if (!rcResp.ok) {
        const rcBody = await rcResp.text().catch(() => '');
        throw new Error(`Rocket.Chat webhook returned ${rcResp.status}: ${rcBody}`);
      }
      return;
    }

    // ── Apprise ───────────────────────────────────────────────────────────────
    if (channel.type === 'apprise' && typeof channel.config.serverUrl === 'string') {
      const ctx = extra as {
        run?: { level?: string; message?: string };
        monitor?: { name?: string };
        test?: boolean;
      } | undefined;
      const run = ctx?.run;
      const monitor = ctx?.monitor;
      const level = run?.level ?? 'red';
      const levelLabel = level === 'green' ? 'Recovered' : level === 'yellow' ? 'Degraded' : 'Down';
      const appriseType = level === 'green' ? 'success' : level === 'yellow' ? 'warning' : 'failure';

      const baseUrl = (channel.config.serverUrl as string).replace(/\/$/, '');
      const tag = typeof channel.config.tag === 'string' && channel.config.tag.trim() ? channel.config.tag.trim() : null;
      const appriseUrl = tag ? `${baseUrl}/notify/${encodeURIComponent(tag)}` : `${baseUrl}/notify`;

      const apprisePayload = {
        title: `[PulseDock] ${monitor?.name ?? 'Monitor'} — ${levelLabel}`,
        body: run?.message ?? text,
        type: appriseType,
      };

      const appriseResp = await fetch(appriseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(apprisePayload),
      });
      if (!appriseResp.ok) {
        const appriseBody = await appriseResp.text().catch(() => '');
        throw new Error(`Apprise returned ${appriseResp.status}: ${appriseBody}`);
      }
      return;
    }

    // ── Mattermost ─────────────────────────────────────────────────────────────
    if (channel.type === 'mattermost' && typeof channel.config.webhookUrl === 'string') {
      const ctx = extra as {
        run?: { level?: string; message?: string; latencyMs?: number; checkedAt?: string };
        monitor?: { name?: string; type?: string; target?: string };
        test?: boolean;
      } | undefined;
      const run = ctx?.run;
      const monitor = ctx?.monitor;
      const level = run?.level ?? 'red';
      const levelLabel = level === 'green' ? 'RECOVERED' : level === 'yellow' ? 'DEGRADED' : 'DOWN';
      const color = level === 'green' ? '#36a64f' : level === 'yellow' ? '#ffa500' : '#cc0000';
      const emoji = level === 'green' ? ':white_check_mark:' : level === 'yellow' ? ':warning:' : ':red_circle:';
      const username = typeof channel.config.username === 'string' && channel.config.username.trim() ? channel.config.username.trim() : 'PulseDock';
      const iconUrl = typeof channel.config.iconUrl === 'string' && channel.config.iconUrl.trim() ? channel.config.iconUrl.trim() : undefined;

      const fields: Array<{ short: boolean; title: string; value: string }> = [];
      if (monitor?.name) fields.push({ title: 'Monitor', value: monitor.name, short: true });
      if (monitor?.type) fields.push({ title: 'Type', value: monitor.type.replace('_', ' '), short: true });
      if (run?.latencyMs != null) fields.push({ title: 'Latency', value: `${run.latencyMs}ms`, short: true });
      if (monitor?.target) fields.push({ title: 'Target', value: monitor.target, short: false });

      const payload: Record<string, unknown> = {
        username,
        attachments: [
          {
            fallback: `${emoji} [PulseDock] ${monitor?.name ?? 'Monitor'} — ${levelLabel}: ${run?.message ?? text}`,
            color,
            title: `${emoji} ${monitor?.name ?? 'Monitor'} — ${levelLabel}`,
            text: run?.message ?? text,
            fields,
            footer: 'PulseDock',
            ts: run?.checkedAt ? Math.floor(new Date(run.checkedAt).getTime() / 1000) : Math.floor(Date.now() / 1000),
          },
        ],
      };
      if (iconUrl) payload.icon_url = iconUrl;
      if (typeof channel.config.channel === 'string' && channel.config.channel.trim()) {
        payload.channel = channel.config.channel.trim();
      }

      const mmResp = await fetch(channel.config.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!mmResp.ok) {
        const mmBody = await mmResp.text().catch(() => '');
        throw new Error(`Mattermost webhook returned ${mmResp.status}: ${mmBody}`);
      }
      return;
    }

    // ── Zulip ──────────────────────────────────────────────────────────────────
    if (
      channel.type === 'zulip' &&
      typeof channel.config.serverUrl === 'string' &&
      typeof channel.config.botEmail === 'string' &&
      typeof channel.config.botApiKey === 'string'
    ) {
      const ctx = extra as {
        run?: { level?: string; message?: string; latencyMs?: number };
        monitor?: { name?: string; type?: string; target?: string };
        test?: boolean;
      } | undefined;
      const run = ctx?.run;
      const monitor = ctx?.monitor;
      const level = run?.level ?? 'red';
      const levelLabel = level === 'green' ? 'RECOVERED' : level === 'yellow' ? 'DEGRADED' : 'DOWN';
      const emoji = level === 'green' ? ':check_mark:' : level === 'yellow' ? ':warning:' : ':red_circle:';

      const baseUrl = (channel.config.serverUrl as string).replace(/\/$/, '');
      const messageType = typeof channel.config.messageType === 'string' && channel.config.messageType === 'direct' ? 'direct' : 'stream';
      const streamName = typeof channel.config.stream === 'string' && channel.config.stream.trim() ? channel.config.stream.trim() : 'general';
      const topic = typeof channel.config.topic === 'string' && channel.config.topic.trim() ? channel.config.topic.trim() : 'PulseDock Alerts';
      const dmTo = typeof channel.config.dmTo === 'string' && channel.config.dmTo.trim() ? channel.config.dmTo.trim() : channel.config.botEmail;

      const facts: string[] = [];
      if (monitor?.name) facts.push(`**Monitor:** ${monitor.name}`);
      if (monitor?.type) facts.push(`**Type:** ${monitor.type.replace('_', ' ')}`);
      if (run?.latencyMs != null) facts.push(`**Latency:** ${run.latencyMs}ms`);
      if (monitor?.target) facts.push(`**Target:** ${monitor.target}`);

      const content =
        `${emoji} **[PulseDock] ${monitor?.name ?? 'Monitor'} — ${levelLabel}**\n` +
        (run?.message ?? text) +
        (facts.length > 0 ? '\n\n' + facts.join(' | ') : '');

      const params = new URLSearchParams({
        type: messageType,
        to: messageType === 'direct' ? dmTo : streamName,
        content,
      });
      if (messageType === 'stream') params.set('topic', topic);

      const credentials = Buffer.from(`${channel.config.botEmail}:${channel.config.botApiKey}`).toString('base64');
      const zulipResp = await fetch(`${baseUrl}/api/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'authorization': `Basic ${credentials}`,
        },
        body: params.toString(),
      });
      if (!zulipResp.ok) {
        const zulipBody = await zulipResp.text().catch(() => '');
        throw new Error(`Zulip API returned ${zulipResp.status}: ${zulipBody}`);
      }
      return;
    }
  }

  /**
   * Queues an alert for batch delivery. If no timer is running for the channel, starts one.
   * Only called for DOWN/DEGRADED events when batchWindowSec > 0.
   */
  queueBatchAlert(
    channel: AlertChannel,
    monitorName: string,
    level: string,
    message: string,
  ): void {
    const batchWindowSec = channel.batchWindowSec ?? 0;
    if (batchWindowSec <= 0) return;
    const windowMs = batchWindowSec * 1000;
    const existing = this.alertBatchQueue.get(channel.id);
    if (existing) {
      existing.alerts.push({ monitorName, level, message, timestamp: new Date() });
      this.logger.debug(`[BatchAlert] Queued alert for channel ${channel.id} (${channel.name}), total: ${existing.alerts.length}`);
    } else {
      const timer = setTimeout(() => { this.flushBatch(channel.id); }, windowMs);
      this.alertBatchQueue.set(channel.id, {
        channelId: channel.id,
        channel,
        windowMs,
        alerts: [{ monitorName, level, message, timestamp: new Date() }],
        timer,
      });
      this.logger.debug(`[BatchAlert] Started batch window (${batchWindowSec}s) for channel ${channel.id} (${channel.name})`);
    }
  }

  /**
   * Flushes the pending batch for a channel and delivers a batched notification.
   */
  async flushBatch(channelId: string): Promise<void> {
    const batch = this.alertBatchQueue.get(channelId);
    if (!batch || batch.alerts.length === 0) {
      this.alertBatchQueue.delete(channelId);
      return;
    }
    this.alertBatchQueue.delete(channelId);
    clearTimeout(batch.timer);

    const { channel, alerts, windowMs } = batch;
    const n = alerts.length;
    const windowSec = Math.round(windowMs / 1000);
    const subject = `🔴 ${n} monitor${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} attention`;

    this.logger.log(`[BatchAlert] Flushing ${n} batched alert(s) for channel ${channel.id} (${channel.name})`);

    if (channel.type === 'email') {
      const rows = alerts.map(a =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #333;">${a.monitorName}</td><td style="padding:6px 12px;border-bottom:1px solid #333;">${a.level.toUpperCase()}</td><td style="padding:6px 12px;border-bottom:1px solid #333;">${a.message}</td></tr>`
      ).join('');
      const html = `<h2 style="color:#f85149;">${subject}</h2><table style="border-collapse:collapse;width:100%;font-family:monospace;font-size:13px;"><thead><tr><th style="text-align:left;padding:6px 12px;background:#1e1e1e;color:#ccc;">Monitor</th><th style="text-align:left;padding:6px 12px;background:#1e1e1e;color:#ccc;">Level</th><th style="text-align:left;padding:6px 12px;background:#1e1e1e;color:#ccc;">Message</th></tr></thead><tbody>${rows}</tbody></table><p style="color:#666;font-size:12px;margin-top:12px;">Batched from last ${windowSec}s — PulseDock</p>`;
      const textFallback = `${subject}\n\n${alerts.map(a => `• ${a.monitorName} — ${a.level.toUpperCase()}: ${a.message}`).join('\n')}\n\nBatched from last ${windowSec}s`;
      try {
        await this.mailer.sendAlertEmail(
          channel.config.to as string,
          textFallback,
          { batchedHtml: html, batchedAlerts: alerts, subject },
        );
      } catch (err) {
        this.logger.error(`[BatchAlert] Email batch delivery failed for channel ${channel.id}`, err instanceof Error ? err.stack : String(err));
      }
      return;
    }

    // Slack / Discord / Webhook / others: text-based batched message
    const bulletLines = alerts.map(a => `• ${a.monitorName} — ${a.message}`).join('\n');
    const footerLine = `_Batched from last ${windowSec}s_`;

    let batchText: string;
    if (channel.type === 'slack') {
      batchText = `${subject}\n${bulletLines}\n${footerLine}`;
    } else if (channel.type === 'discord') {
      batchText = `**${subject}**\n${bulletLines}\n${footerLine}`;
    } else {
      batchText = `${subject}\n${bulletLines}\nBatched from last ${windowSec}s`;
    }

    try {
      await this.sendWithRetry(channel, batchText, {
        batchedAlerts: alerts,
        batchWindowSec: windowSec,
        subject,
      }, { monitorId: 'batch', monitorName: subject, trigger: 'batch_flush' });
    } catch (err) {
      this.logger.error(`[BatchAlert] Batch delivery failed for channel ${channel.id}`, err instanceof Error ? err.stack : String(err));
    }
  }

  /**
   * Retry helper with exponential backoff.
   * Delays: 1s → 2s → 4s (2^(attempt-1) seconds).
   * Logs each failed attempt. Throws after maxRetries exhausted.
   */
  async sendWithRetryFn(fn: () => Promise<void>, maxRetries = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await fn();
        return;
      } catch (err) {
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        this.logger.warn(
          `Webhook delivery attempt ${attempt}/${maxRetries} failed: ${err instanceof Error ? err.message : String(err)}${attempt < maxRetries ? ` — retrying in ${delayMs}ms` : ' — giving up'}`,
        );
        if (attempt === maxRetries) throw err;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  /**
   * Sends an alert via the given channel with exponential backoff retries.
   * Records the delivery outcome (success/failure) to the AlertDeliveryLog table.
   * Increments the `alertsSent` or `alertsFailed` metric counter accordingly.
   *
   * @param channel - The alert channel configuration (webhook, discord, slack, telegram, email)
   * @param text - The plain-text notification body
   * @param extra - Optional structured context (monitor, run, test flag) passed to the sender
   * @param deliveryMeta - Optional metadata for audit logging (monitorId, monitorName, trigger)
   * @param maxRetries - Maximum delivery attempts before giving up (default: 3)
   * @throws The last encountered error after all retry attempts are exhausted
   */
  async sendWithRetry(
    channel: AlertChannel,
    text: string,
    extra?: unknown,
    deliveryMeta?: { monitorId?: string; monitorName?: string; trigger?: string },
    maxRetries = 3,
  ) {
    let lastError: unknown;
    const startMs = Date.now();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.send(channel, text, extra);
        this.metrics.inc('alertsSent');
        // Log success
        this.prisma.alertDeliveryLog.create({
          data: {
            alertChannelId: channel.id,
            monitorId: deliveryMeta?.monitorId ?? null,
            monitorName: deliveryMeta?.monitorName ?? null,
            status: 'success',
            trigger: deliveryMeta?.trigger ?? 'monitor_failure',
            durationMs: Date.now() - startMs,
          },
        }).catch(() => { /* non-critical */ });
        return;
      } catch (error) {
        lastError = error;
        const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s → 2s → 4s
        this.logger.warn(
          `Alert delivery attempt ${attempt}/${maxRetries} failed for channel "${channel.id}" (type=${channel.type}): ${error instanceof Error ? error.message : String(error)}${attempt < maxRetries ? ` — retrying in ${delayMs}ms` : ' — giving up'}`,
        );
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    this.metrics.inc('alertsFailed');
    // Log failure
    this.prisma.alertDeliveryLog.create({
      data: {
        alertChannelId: channel.id,
        monitorId: deliveryMeta?.monitorId ?? null,
        monitorName: deliveryMeta?.monitorName ?? null,
        status: 'failed',
        trigger: deliveryMeta?.trigger ?? 'monitor_failure',
        errorMessage: lastError instanceof Error ? lastError.message : String(lastError),
        durationMs: Date.now() - startMs,
      },
    }).catch(() => { /* non-critical */ });
    throw lastError;
  }

  /**
   * Sends a test notification through a given alert channel to verify configuration.
   * Uses the same retry logic as production alerts (3 attempts with exponential backoff).
   * @param channel - The alert channel to test (webhook, discord, slack, telegram, email)
   * @throws Error if all delivery attempts fail
   */
  async notifyTest(channel: AlertChannel) {
    const text = '✅ PulseDock test notification: this channel is configured correctly.';
    await this.sendWithRetry(channel, text, { test: true, at: new Date().toISOString() }, { trigger: 'test' });
  }

  /**
   * Send an alert to a specific channel with retry logic.
   * Exposed for use by the escalation service.
   *
   * @param channel - The channel to notify
   * @param text - Alert message text
   * @param extra - Optional extra context (forwarded to delivery)
   * @param monitorId - Optional monitor ID for delivery log
   * @param monitorName - Optional monitor name for delivery log
   */
  async sendToChannel(
    channel: AlertChannel,
    text: string,
    extra?: unknown,
    monitorId?: string,
    monitorName?: string,
  ): Promise<void> {
    await this.sendWithRetry(
      channel,
      text,
      extra,
      { monitorId, monitorName, trigger: 'escalation' },
    );
  }

  /**
   * Renders a preview of the payload template with sample data.
   * Used by the preview endpoint — does not send any real alert.
   *
   * @param channel - The alert channel (for context)
   * @param template - Optional template override; if empty, uses the channel's configured template or default payload
   * @returns { rendered, valid, error? }
   */
  previewPayload(
    channel: AlertChannel,
    template?: string,
  ): { rendered: string; valid: boolean; error?: string } {
    const sampleContext = {
      text: '🚨 Monitor "My API" is DOWN',
      channel,
      extra: {
        monitor: { id: 'mon_123', name: 'My API', target: 'https://api.example.com', type: 'HTTP' },
        run: { level: 'red', message: 'Connection refused', latencyMs: null as null, statusCode: 503 },
        test: false,
      },
    };

    const tmpl = template?.trim()
      ? template.trim()
      : (typeof channel.config.payloadTemplate === 'string' && channel.config.payloadTemplate.trim()
          ? channel.config.payloadTemplate
          : '');

    let rendered: string;
    if (tmpl) {
      try {
        rendered = this.renderPayloadTemplate(tmpl, sampleContext);
      } catch (err) {
        return {
          rendered: '',
          valid: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    } else {
      // Default payload
      rendered = JSON.stringify({ text: sampleContext.text, extra: sampleContext.extra }, null, 2);
    }

    let valid = false;
    let parseError: string | undefined;
    try {
      JSON.parse(rendered);
      valid = true;
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }

    return { rendered, valid, ...(parseError ? { error: parseError } : {}) };
  }

  /**
   * Retries a single failed delivery by its log ID.
   * Re-sends the original payload (stored text) and records a new delivery log entry.
   *
   * @param deliveryId - ID of the AlertDeliveryLog record to retry
   * @param channel - The owning alert channel
   * @returns { success, error? }
   */
  async retryDelivery(
    deliveryId: string,
    channel: AlertChannel,
  ): Promise<{ success: boolean; error?: string }> {
    const log = await this.prisma.alertDeliveryLog.findUnique({ where: { id: deliveryId } });
    if (!log || log.alertChannelId !== channel.id) {
      return { success: false, error: 'Delivery log not found or does not belong to this channel' };
    }

    const retryText = log.monitorName
      ? `↻ Retry: 🚨 Monitor "${log.monitorName}" alert (retry of delivery ${deliveryId})`
      : `↻ Retry alert (retry of delivery ${deliveryId})`;

    try {
      await this.sendWithRetry(
        channel,
        retryText,
        { retry: true, originalDeliveryId: deliveryId, monitorId: log.monitorId, monitorName: log.monitorName },
        { monitorId: log.monitorId ?? undefined, monitorName: log.monitorName ?? undefined, trigger: 'retry' },
        1, // single attempt for manual retries
      );
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Retries all failed deliveries for a channel from the last 24 hours (max 10).
   *
   * @param channel - The alert channel
   * @returns Array of retry results per delivery ID
   */
  async retryAllFailed(
    channel: AlertChannel,
  ): Promise<Array<{ deliveryId: string; success: boolean; error?: string }>> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const failedLogs = await this.prisma.alertDeliveryLog.findMany({
      where: {
        alertChannelId: channel.id,
        status: 'failed',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const results: Array<{ deliveryId: string; success: boolean; error?: string }> = [];
    for (const log of failedLogs) {
      const result = await this.retryDelivery(log.id, channel);
      results.push({ deliveryId: log.id, ...result });
    }
    return results;
  }
}
