import { Injectable, Logger, Optional } from '@nestjs/common';
import { isChannelActive } from './alert-channel-schedule';
import { PrismaService } from '../common/prisma.service';
import type { AlertChannel, Monitor, MonitorRun } from '../types';
import { MetricsService } from '../common/metrics.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { NotificationsService } from '../notifications/notifications.service';
import { AlertsDeliveryService } from './alerts-delivery.service';

@Injectable()
export class AlertsRoutingService {
  private readonly logger = new Logger(AlertsRoutingService.name);
  private readonly realtime: Pick<RealtimeEvents, 'alertTriggered'>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly notifications: NotificationsService,
    private readonly delivery: AlertsDeliveryService,
    @Optional() realtime?: RealtimeEvents,
  ) {
    this.realtime = realtime ?? { alertTriggered: () => undefined };
  }

  /**
   * Dispatches alert notifications for a monitor check result.
   * Respects active maintenance windows (suppresses alerts during maintenance).
   * Respects user notification preferences (shouldNotify check).
   * Filters eligible alert channels based on their notifyOn setting
   * (ON_CHANGE, ALWAYS, FIRST_ONLY, DAILY_DIGEST, VERSION_ANY, VERSION_MAJOR).
   * Emits a real-time alertTriggered event via Socket.IO.
   * @param monitor - The monitor that was checked
   * @param run - The resulting check run (contains level, message, latencyMs)
   * @param context - Optional context: levelChanged, previousLevel, failureStreak
   */
  async notifyMonitorFailure(monitor: Monitor, run: MonitorRun, context?: { levelChanged?: boolean; previousLevel?: string | null; failureStreak?: number; isFlapping?: boolean }) {
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

    // Suppress alerts if monitor is muted
    const mutedUntil = monitor.mutedUntil ? new Date(monitor.mutedUntil) : null;
    if (mutedUntil && mutedUntil > now) {
      this.logger.log(`Monitor ${monitor.id} is muted until ${mutedUntil.toISOString()}, suppressing alert`);
      return;
    }

    // On recovery, auto-clear active acknowledgements and reset escalation state
    if (run.level === 'green') {
      await this.prisma.alertAcknowledgement.updateMany({
        where: { monitorId: monitor.id, clearedAt: null },
        data: { clearedAt: now },
      });
      // Reset escalation step counters so the next outage starts fresh
      await this.prisma.monitorAlert.updateMany({
        where: { monitorId: monitor.id, escalationStep: { gt: 0 } },
        data: { escalationStep: 0, escalatedAt: null },
      });
    } else {
      // Suppress alerts if monitor has an active acknowledgement (only for non-recovery)
      const activeAck = await this.prisma.alertAcknowledgement.findFirst({
        where: { monitorId: monitor.id, clearedAt: null },
      });
      if (activeAck) {
        this.logger.log(`Monitor ${monitor.id} alert is acknowledged, suppressing`);
        return;
      }
    }

    // Suppress alerts if any dependency monitor is currently down
    const deps = await this.prisma.monitorDependency.findMany({
      where: { monitorId: monitor.id },
      select: { dependsOnId: true, dependsOn: { select: { name: true } } },
    });
    if (deps.length > 0) {
      for (const dep of deps) {
        const lastRun = await this.prisma.monitorRun.findFirst({
          where: { monitorId: dep.dependsOnId },
          orderBy: { checkedAt: 'desc' },
          select: { ok: true },
        });
        if (lastRun && !lastRun.ok) {
          this.logger.log(
            `Suppressing alert for monitor "${monitor.name}" (id=${monitor.id}): dependency "${dep.dependsOn.name}" is currently down`,
          );
          return;
        }
      }
    }

    // Check notification preferences before dispatching alerts
    const eventType = this.delivery.levelToEventType(run.level);
    const shouldSend = await this.notifications.shouldNotify(monitor.userId, eventType);

    if (!shouldSend) {
      // Check if this user has digest frequency — if so, queue for later delivery
      const pref = await this.prisma.notificationPreference.findUnique({
        where: { userId: monitor.userId },
        select: { frequency: true },
      }).catch(() => null);

      if (pref?.frequency === 'hourly_digest' || pref?.frequency === 'daily_digest') {
        const digestEventType = eventType === 'down' ? 'down' : eventType === 'recovery' ? 'recovery' : 'degraded';
        const levelEmoji = run.level === 'green' ? '✅' : run.level === 'yellow' ? '⚠️' : '🚨';
        const message = `${levelEmoji} ${monitor.name}: ${run.message ?? run.level}${run.latencyMs != null ? ` (${run.latencyMs}ms)` : ''}`;
        await this.notifications.enqueueForDigest(
          monitor.userId,
          digestEventType as 'down' | 'recovery' | 'degraded',
          monitor.id,
          monitor.name,
          message,
        );
        this.logger.debug(
          `Queued digest notification for monitor "${monitor.name}" (userId=${monitor.userId}, frequency=${pref.frequency})`,
        );
      } else {
        this.logger.debug(
          `Suppressed alert for monitor "${monitor.name}" (userId=${monitor.userId}, level=${run.level}, eventType=${eventType}) — notification preferences`,
        );
      }
      return;
    }

    // Load routing rules for this user, ordered by priority
    const routingRules = await this.prisma.alertRoutingRule.findMany({
      where: { userId: monitor.userId, enabled: true },
      orderBy: { priority: 'asc' },
    });

    // Find matching rules for this monitor+run (load tags for tag-based matching)
    let monitorTagNames: string[] = [];
    if (routingRules.some(r => r.matchTags.length > 0)) {
      const tagRows = await this.prisma.monitorTag.findMany({
        where: { monitorId: monitor.id },
        include: { tag: { select: { name: true } } },
      });
      monitorTagNames = tagRows.map(t => t.tag.name);
    }

    const matchedRules = routingRules.filter(rule => {
      if (rule.matchMonitorIds.length > 0 && !rule.matchMonitorIds.includes(monitor.id)) return false;
      if (rule.matchTypes.length > 0 && !rule.matchTypes.includes(monitor.type)) return false;
      if (rule.matchLevels.length > 0 && !rule.matchLevels.includes(run.level)) return false;
      if (rule.matchFolderIds.length > 0 && (!monitor.folderId || !rule.matchFolderIds.includes(monitor.folderId))) return false;
      if (rule.matchTags.length > 0 && !rule.matchTags.some(t => monitorTagNames.includes(t))) return false;
      return true;
    });

    // If any rules matched, collect channels from rules
    let routedChannelIds: string[] | null = null;
    if (matchedRules.length > 0) {
      routedChannelIds = [...new Set(matchedRules.flatMap(r => r.channelIds))];
      this.logger.log(`Routing alert for monitor ${monitor.id} via ${matchedRules.length} rules to channels: ${routedChannelIds.join(', ')}`);
    }

    const links = await this.prisma.monitorAlert.findMany({
      where: {
        monitorId: monitor.id,
        ...(routedChannelIds !== null && { alertChannelId: { in: routedChannelIds } }),
      },
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
        case 'REPEAT_EVERY_N': {
          // Repeat while monitor stays down, at configurable interval (default 30 min)
          // Always fire on first failure (no lastNotifiedAt), then repeat every N minutes
          if (run.level === 'green') return false; // never repeat on green
          const lastNotified = l.lastNotifiedAt;
          if (!lastNotified) return true; // first failure → always fire
          const intervalMin = l.repeatIntervalMin ?? 30;
          const intervalMs = Math.max(1, intervalMin) * 60_000;
          return alertNow.getTime() - lastNotified.getTime() >= intervalMs;
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

    // Update lastNotifiedAt for DAILY_DIGEST and REPEAT_EVERY_N channels that are firing
    const trackLastNotifiedIds = eligibleLinks
      .filter((l) => (l.notifyOn as string) === 'DAILY_DIGEST' || (l.notifyOn as string) === 'REPEAT_EVERY_N')
      .map((l) => l.alertChannelId);
    if (trackLastNotifiedIds.length > 0) {
      await this.prisma.monitorAlert.updateMany({
        where: { monitorId: monitor.id, alertChannelId: { in: trackLastNotifiedIds } },
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
      alertGrouping: l.alertChannel.alertGrouping,
      groupWindowSec: l.alertChannel.groupWindowSec,
      groupByFolder: l.alertChannel.groupByFolder,
      groupByTag: l.alertChannel.groupByTag,
      messageTemplate: l.alertChannel.messageTemplate ?? null,
      scheduleJson: l.alertChannel.scheduleJson ?? null,
      batchWindowSec: l.alertChannel.batchWindowSec ?? null,
    }));

    const isFlapping = context?.isFlapping ?? false;
    const levelEmoji = isFlapping ? '🔁' : run.level === 'red' ? '🚨' : run.level === 'yellow' ? '⚠️' : '✅';
    let text = isFlapping
      ? `🔁 PulseDock: ${monitor.name} is FLAPPING — rapidly alternating between up and down. Alerts suppressed until stable.`
      : `${levelEmoji} PulseDock: ${monitor.name} is ${run.level.toUpperCase()} (${run.message})`;
    if (!isFlapping && monitor.runbookUrl) {
      text += ` | Runbook: ${monitor.runbookUrl}`;
    }

    this.realtime.alertTriggered(monitor.userId, {
      monitor: {
        id: monitor.id,
        name: monitor.name,
      },
      run,
      channelCount: channels.length,
      sentAt: new Date().toISOString(),
    });

    const extra = {
      monitor: {
        ...monitor,
        runbookUrl: monitor.runbookUrl ?? undefined,
      },
      run,
      runbookUrl: monitor.runbookUrl ?? undefined,
    };
    const isRecovery = run.level === 'green';

    for (const channel of channels) {
      // Check per-channel active schedule — silently drop if outside window
      if (!isChannelActive((channel as AlertChannel & { scheduleJson?: unknown }).scheduleJson)) {
        this.logger.log(`[AlertSchedule] Channel ${channel.id} (${channel.name}) is outside active window — skipping`);
        continue;
      }
      try {
        const trigger = isFlapping ? 'monitor_flapping' : isRecovery ? 'monitor_recovery' : 'monitor_failure';
        if (isRecovery || isFlapping) {
          // Recovery and flapping alerts always send directly — never batched
          await this.delivery.sendWithRetry(channel, text, extra, {
            monitorId: monitor.id,
            monitorName: monitor.name,
            trigger,
          });
        } else if ((channel.batchWindowSec ?? 0) > 0) {
          // Non-recovery with batch window — queue for batch delivery
          this.delivery.queueBatchAlert(channel, monitor.name, run.level, run.message ?? run.level);
        } else {
          // Non-recovery failure alerts go through grouping
          await this.notifyWithGrouping(channel, monitor, run, text, extra);
        }
      } catch (error) {
        this.logger.error(`Alert channel failed: ${channel.name}`, error instanceof Error ? error.stack : String(error));
      }
    }

  }

  /**
   * Sends a grouped summary alert for a pending AlertGroup.
   * Looks up monitor names and folder name, formats the grouped text, sends via sendWithRetry,
   * and marks the group as sent.
   */
  async sendGroupedAlert(group: { id: string; channelId: string; userId: string; monitorIds: string; groupKey: string }): Promise<void> {
    const monitorIds = JSON.parse(group.monitorIds) as string[];
    if (monitorIds.length === 0) return;

    // Load channel
    const channelRow = await this.prisma.alertChannel.findUnique({ where: { id: group.channelId } });
    if (!channelRow) return;

    const channel: AlertChannel = {
      id: channelRow.id,
      userId: channelRow.userId,
      name: channelRow.name,
      type: channelRow.type as AlertChannel['type'],
      config: (channelRow.configJson as Record<string, unknown>) ?? {},
      createdAt: channelRow.createdAt.toISOString(),
      alertGrouping: channelRow.alertGrouping,
      groupWindowSec: channelRow.groupWindowSec,
      groupByFolder: channelRow.groupByFolder,
      groupByTag: channelRow.groupByTag,
      messageTemplate: channelRow.messageTemplate ?? null,
    };

    // Load monitors to get their names
    const monitors = await this.prisma.monitor.findMany({
      where: { id: { in: monitorIds } },
      select: { id: true, name: true, folderId: true },
    });
    const monitorNames = monitors.map((m) => m.name);

    // Get folder name if applicable
    let locationLabel = 'your account';
    if (group.groupKey.startsWith('folder:')) {
      const folderId = group.groupKey.slice('folder:'.length);
      const folder = await this.prisma.folder.findUnique({ where: { id: folderId }, select: { name: true } });
      if (folder) locationLabel = `folder "${folder.name}"`;
    } else if (group.groupKey.startsWith('tag:')) {
      const tagId = group.groupKey.slice('tag:'.length);
      const tag = await this.prisma.tag.findUnique({ where: { id: tagId }, select: { name: true } });
      if (tag) locationLabel = `tag "${tag.name}"`;
    }

    const MAX_NAMES = 5;
    const displayNames = monitorNames.length > MAX_NAMES
      ? [...monitorNames.slice(0, MAX_NAMES), `+${monitorNames.length - MAX_NAMES} more`]
      : monitorNames;
    const text = `⚠️ Alert storm: ${monitorNames.length} monitors DOWN in ${locationLabel} — ${displayNames.join(', ')}`;

    const startMs = Date.now();
    try {
      await this.delivery.send(channel, text, { grouped: true, count: monitorNames.length, monitorIds });
      this.metrics.inc('alertsSent');
      this.prisma.alertDeliveryLog.create({
        data: {
          alertChannelId: channel.id,
          monitorId: null,
          monitorName: null,
          status: 'success',
          trigger: 'grouped_alert',
          durationMs: Date.now() - startMs,
          isGrouped: true,
          groupedCount: monitorNames.length,
        },
      }).catch(() => { /* non-critical */ });
    } catch (error) {
      this.metrics.inc('alertsFailed');
      this.prisma.alertDeliveryLog.create({
        data: {
          alertChannelId: channel.id,
          monitorId: null,
          monitorName: null,
          status: 'failed',
          trigger: 'grouped_alert',
          errorMessage: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startMs,
          isGrouped: true,
          groupedCount: monitorNames.length,
        },
      }).catch(() => { /* non-critical */ });
      this.logger.warn(`Grouped alert send failed for group ${group.id}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Mark as sent
    await this.prisma.alertGroup.update({
      where: { id: group.id },
      data: { sentAt: new Date() },
    });
  }

  /**
   * Check if alert grouping is enabled for the channel.
   * If yes: accumulate the monitor into a pending group. If the group threshold
   * is met (>=3 monitors) OR the window has expired and group has >=2 monitors,
   * send a grouped summary alert. Otherwise suppress the individual alert.
   * If no: send the alert directly.
   */
  async notifyWithGrouping(
    channel: AlertChannel,
    monitor: Monitor,
    run: MonitorRun,
    text: string,
    extra?: unknown,
  ): Promise<void> {
    if (!channel.alertGrouping) {
      await this.delivery.sendWithRetry(channel, text, extra, {
        monitorId: monitor.id,
        monitorName: monitor.name,
        trigger: 'monitor_failure',
      });
      return;
    }

    // Determine group key
    let groupKey: string | null = null;

    if (channel.groupByFolder && monitor.folderId) {
      groupKey = `folder:${monitor.folderId}`;
    } else if (channel.groupByTag) {
      // Load first tag for this monitor
      const firstTag = await this.prisma.monitorTag.findFirst({
        where: { monitorId: monitor.id },
        include: { tag: { select: { id: true } } },
        orderBy: { tag: { name: 'asc' } },
      });
      if (firstTag) {
        groupKey = `tag:${firstTag.tag.id}`;
      }
    }

    if (!groupKey) {
      // No grouping key — send directly
      await this.delivery.sendWithRetry(channel, text, extra, {
        monitorId: monitor.id,
        monitorName: monitor.name,
        trigger: 'monitor_failure',
      });
      return;
    }

    const windowStart = new Date(Date.now() - channel.groupWindowSec * 1000);

    // Find existing pending group within window
    const existingGroup = await this.prisma.alertGroup.findFirst({
      where: {
        channelId: channel.id,
        groupKey,
        sentAt: null,
        firstAlertAt: { gte: windowStart },
      },
      orderBy: { firstAlertAt: 'asc' },
    });

    let currentGroup: { id: string; channelId: string; userId: string; monitorIds: string; groupKey: string };

    if (existingGroup) {
      const ids = JSON.parse(existingGroup.monitorIds) as string[];
      if (!ids.includes(monitor.id)) {
        ids.push(monitor.id);
      }
      const updated = await this.prisma.alertGroup.update({
        where: { id: existingGroup.id },
        data: {
          monitorIds: JSON.stringify(ids),
          lastAlertAt: new Date(),
          level: run.level,
        },
      });
      currentGroup = { id: updated.id, channelId: updated.channelId, userId: updated.userId, monitorIds: updated.monitorIds, groupKey: updated.groupKey };
    } else {
      const created = await this.prisma.alertGroup.create({
        data: {
          userId: channel.userId,
          channelId: channel.id,
          groupKey,
          monitorIds: JSON.stringify([monitor.id]),
          level: run.level,
        },
      });
      currentGroup = { id: created.id, channelId: created.channelId, userId: created.userId, monitorIds: created.monitorIds, groupKey: created.groupKey };
    }

    const monitorIds = JSON.parse(currentGroup.monitorIds) as string[];

    if (monitorIds.length >= 3) {
      // Threshold met — send grouped alert immediately
      await this.sendGroupedAlert(currentGroup);
    } else {
      // Schedule a deferred check after windowSec
      const windowMs = channel.groupWindowSec * 1000;
      const groupId = currentGroup.id;
      setTimeout(() => {
        this.prisma.alertGroup.findUnique({ where: { id: groupId } })
          .then(async (g) => {
            if (!g || g.sentAt !== null) return;
            const ids = JSON.parse(g.monitorIds) as string[];
            if (ids.length >= 2) {
              await this.sendGroupedAlert({ id: g.id, channelId: g.channelId, userId: g.userId, monitorIds: g.monitorIds, groupKey: g.groupKey });
            } else if (ids.length === 1) {
              // Only one monitor — send directly as individual alert
              const channelRow = await this.prisma.alertChannel.findUnique({ where: { id: g.channelId } });
              if (!channelRow) return;
              const ch: AlertChannel = {
                id: channelRow.id,
                userId: channelRow.userId,
                name: channelRow.name,
                type: channelRow.type as AlertChannel['type'],
                config: (channelRow.configJson as Record<string, unknown>) ?? {},
                createdAt: channelRow.createdAt.toISOString(),
                alertGrouping: channelRow.alertGrouping,
                groupWindowSec: channelRow.groupWindowSec,
                groupByFolder: channelRow.groupByFolder,
                groupByTag: channelRow.groupByTag,
                messageTemplate: channelRow.messageTemplate ?? null,
              };
              await this.delivery.sendWithRetry(ch, text, extra, {
                monitorId: monitor.id,
                monitorName: monitor.name,
                trigger: 'monitor_failure',
              });
              await this.prisma.alertGroup.update({
                where: { id: g.id },
                data: { sentAt: new Date() },
              });
            }
          })
          .catch((err: unknown) => {
            this.logger.warn(`Deferred group check failed for group ${groupId}: ${err instanceof Error ? err.message : String(err)}`);
          });
      }, windowMs);
    }
  }

  /**
   * Cleanup cron: every minute, find pending AlertGroups whose window has expired
   * and send them if they have >=2 monitors.
   */
  async flushExpiredAlertGroups(): Promise<void> {
    const now = new Date();
    // Find all pending groups where firstAlertAt is old enough
    const channels = await this.prisma.alertChannel.findMany({
      where: { alertGrouping: true },
      select: { id: true, groupWindowSec: true },
    });

    for (const ch of channels) {
      const windowStart = new Date(now.getTime() - ch.groupWindowSec * 1000);
      const expiredGroups = await this.prisma.alertGroup.findMany({
        where: {
          channelId: ch.id,
          sentAt: null,
          firstAlertAt: { lt: windowStart },
        },
      });

      for (const g of expiredGroups) {
        const ids = JSON.parse(g.monitorIds) as string[];
        if (ids.length >= 2) {
          await this.sendGroupedAlert({ id: g.id, channelId: g.channelId, userId: g.userId, monitorIds: g.monitorIds, groupKey: g.groupKey });
        } else {
          // Mark as sent without alerting (single monitor will have been sent via deferred setTimeout)
          await this.prisma.alertGroup.update({ where: { id: g.id }, data: { sentAt: now } });
        }
      }
    }
  }

  /**
   * Sends SLA breach alert to all alert channels for a monitor.
   * Fires when rolling uptime drops below the configured SLA target.
   */
  async notifySlaBreached(
    monitorId: string,
    monitorName: string,
    userId: string,
    actualPct: number,
    targetPct: number,
    periodDays: number,
  ): Promise<void> {
    const text = `⚠️ SLA Breach: ${monitorName} — uptime ${actualPct}% is below target ${targetPct}% (last ${periodDays}d)`;
    await this.sendSlaNotification(monitorId, monitorName, userId, text, 'sla_breach');
  }

  /**
   * Sends SLA recovered alert to all alert channels for a monitor.
   * Fires when rolling uptime recovers above the configured SLA target.
   */
  async notifySlaRecovered(
    monitorId: string,
    monitorName: string,
    userId: string,
    actualPct: number,
    targetPct: number,
    periodDays: number,
  ): Promise<void> {
    const text = `✅ SLA Recovered: ${monitorName} — uptime back at ${actualPct}% (target ${targetPct}%, last ${periodDays}d)`;
    await this.sendSlaNotification(monitorId, monitorName, userId, text, 'sla_recovered');
  }

  /**
   * Internal helper: sends a plain-text notification to all alert channels for a monitor.
   */
  async sendSlaNotification(
    monitorId: string,
    monitorName: string,
    userId: string,
    text: string,
    trigger: string,
  ): Promise<void> {
    const links = await this.prisma.monitorAlert.findMany({
      where: { monitorId },
      include: { alertChannel: true },
    });

    const channels: AlertChannel[] = links
      .filter((l) => l.alertChannel.userId === userId)
      .map((l) => ({
        id: l.alertChannel.id,
        userId: l.alertChannel.userId,
        name: l.alertChannel.name,
        type: l.alertChannel.type as AlertChannel['type'],
        config: (l.alertChannel.configJson as Record<string, unknown>) ?? {},
        createdAt: l.alertChannel.createdAt.toISOString(),
        alertGrouping: l.alertChannel.alertGrouping ?? false,
        groupWindowSec: l.alertChannel.groupWindowSec ?? 300,
        groupByFolder: l.alertChannel.groupByFolder ?? false,
        groupByTag: l.alertChannel.groupByTag ?? false,
        messageTemplate: l.alertChannel.messageTemplate ?? null,
      }));

    for (const channel of channels) {
      try {
        await this.delivery.sendWithRetry(channel, text, undefined, { monitorId, monitorName, trigger });
      } catch (error) {
        this.logger.error(`SLA alert channel failed: ${channel.name}`, error instanceof Error ? error.stack : String(error));
      }
    }
  }

  /**
   * Sends a burn-rate alert when the error budget is being consumed too fast.
   *
   * Uses the multi-window model (1h short window + 6h long window) to reduce noise.
   * Fires when both windows exceed the burn-rate threshold simultaneously.
   *
   * @param monitorId   - Monitor UUID
   * @param monitorName - Human-readable name
   * @param userId      - Owner user ID
   * @param burnRate1h  - Error budget burn rate over the last 1 hour (1.0 = sustainable)
   * @param burnRate6h  - Error budget burn rate over the last 6 hours
   * @param budgetConsumedPct - Percentage of total error budget already consumed
   * @param slaTarget   - SLA target % (e.g. 99.9)
   */
  async notifyBurnRateAlert(
    monitorId: string,
    monitorName: string,
    userId: string,
    burnRate1h: number,
    burnRate6h: number,
    budgetConsumedPct: number,
    slaTarget: number,
  ): Promise<void> {
    const severity = burnRate1h >= 14.4 ? '🔴 Critical' : burnRate1h >= 6 ? '🟠 High' : '🟡 Elevated';
    const text =
      `${severity} Burn Rate Alert: ${monitorName} — error budget consuming ` +
      `${burnRate1h.toFixed(1)}× faster than sustainable (1h), ${burnRate6h.toFixed(1)}× (6h). ` +
      `Budget ${budgetConsumedPct.toFixed(1)}% consumed. SLA target: ${slaTarget}%`;
    await this.sendSlaNotification(monitorId, monitorName, userId, text, 'sla_burn_rate');
  }
}
