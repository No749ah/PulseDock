import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import type { MonitorType } from '../types';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { runExtractorPipeline, normalizeExtractors } from '../checks/version-extractor.util';

@Injectable()
export class MonitorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checksService: ChecksService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeEvents,
  ) {}

  private sanitizeConfig(
    config: Record<string, unknown> | null | undefined,
    monitorType?: MonitorType,
  ) {
    const c = { ...(config ?? {}) } as Record<string, unknown>;

    const hasToken = typeof c.token === 'string' && String(c.token).trim().length > 0;
    const hasAppToken = typeof c.appToken === 'string' && String(c.appToken).trim().length > 0;
    const hasOpenvpnPassword = typeof c.openvpnPassword === 'string' && String(c.openvpnPassword).trim().length > 0;

    if (monitorType !== 'HEARTBEAT' && 'token' in c) delete c.token;
    if ('appToken' in c) delete c.appToken;
    if ('openvpnPassword' in c) delete c.openvpnPassword;

    c.hasRepoToken = monitorType === 'HEARTBEAT' ? false : hasToken;
    c.hasHeartbeatToken = monitorType === 'HEARTBEAT' ? hasToken : false;
    c.hasAppToken = hasAppToken;
    c.hasOpenvpnPassword = hasOpenvpnPassword;

    return c;
  }

  /**
   * Returns a list of all registered check plugins (for version/type selection in the UI).
   * @returns Array of available plugin descriptors
   */
  listPlugins() {
    return this.checksService.listPlugins();
  }

  /**
   * Returns all monitors belonging to the authenticated user, optionally filtered by tag.
   * Performs a single query with nested includes to avoid N+1 queries.
   * @param userId - The authenticated user's ID
   * @param tagFilter - Optional tag name to filter monitors by
   * @returns Array of monitor objects with sanitized config, alert channels, and tags
   */
  async list(userId: string, tagFilter?: string) {
    // Performance: single query with nested include avoids N+1
    const monitors = await this.prisma.monitor.findMany({
      where: {
        userId,
        ...(tagFilter ? { monitorTags: { some: { tag: { name: tagFilter } } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        monitorAlerts: { include: { alertChannel: { select: { id: true, name: true, type: true } } } },
        monitorTags: { include: { tag: true } },
        runs: { take: 1, orderBy: { checkedAt: 'desc' } },
        escalationPolicy: { select: { id: true, name: true } },
      },
    });

    return monitors.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.name,
      type: m.type,
      target: m.target,
      intervalSec: m.intervalSec,
      timeoutMs: m.timeoutMs,
      confirmations: m.confirmations,
      config: this.sanitizeConfig((m.configJson as Record<string, unknown> | null) ?? {}, m.type as MonitorType),
      alertChannelIds: m.monitorAlerts.map((ma) => ma.alertChannelId),
      alertChannels: m.monitorAlerts.map((ma) => ({ id: ma.alertChannelId, name: ma.alertChannel.name, type: ma.alertChannel.type, notifyOn: ma.notifyOn })),
      folderId: m.folderId,
      tags: m.monitorTags.map((mt) => ({ id: mt.tag.id, name: mt.tag.name, color: mt.tag.color })),
      enabled: m.enabled,
      slaTarget: m.slaTarget,
      slaPeriodDays: m.slaPeriodDays,
      slaBreachAlertedAt: m.slaBreachAlertedAt?.toISOString() ?? null,
      escalationPolicyId: m.escalationPolicyId ?? null,
      escalationPolicy: m.escalationPolicy ?? null,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  /**
   * Creates a new monitor for the authenticated user.
   * For HEARTBEAT monitors, a unique token is auto-generated if not provided.
   * Emits a real-time monitorCreated event via Socket.IO and logs to audit trail.
   * @param userId - The authenticated user's ID
   * @param body - Monitor creation data (name, target, type, config, alertChannelIds, tags, etc.)
   * @returns The newly created monitor with sanitized config and tag info
   */
  async create(userId: string, body: {
    name: string;
    description?: string;
    target: string;
    type: MonitorType;
    intervalSec?: number;
    timeoutMs?: number;
    confirmations?: number;
    config?: Record<string, unknown>;
    alertChannelIds?: string[];
    folderId?: string | null;
    tags?: string[];
    enabled?: boolean;
    slaTarget?: number;
    slaPeriodDays?: number;
    escalationPolicyId?: string;
  }) {
    const config: Record<string, unknown> = { ...(body.config ?? {}) };
    if (body.type === 'HEARTBEAT') {
      if (typeof config.token !== 'string' || !config.token.trim()) {
        config.token = randomUUID();
      }
      const timeoutRaw = Number(config.timeoutMin ?? 5);
      config.timeoutMin = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 5;
    }

    const created = await this.prisma.monitor.create({
      data: {
        userId,
        name: body.name,
        description: body.description ?? null,
        target: body.target,
        type: body.type,
        intervalSec: body.intervalSec ?? 60,
        timeoutMs: body.timeoutMs ?? 5000,
        confirmations: Math.max(1, Math.min(10, body.confirmations ?? 1)),
        configJson: config as Prisma.InputJsonValue,
        enabled: body.enabled ?? true,
        folderId: body.folderId ?? null,
        slaTarget: body.slaTarget ?? null,
        slaPeriodDays: body.slaPeriodDays ?? null,
        escalationPolicyId: body.escalationPolicyId ?? null,
        monitorAlerts: {
          create: (body.alertChannelIds ?? []).map((alertChannelId) => ({ alertChannelId })),
        },
      },
    });

    // Handle tags
    const createdTags: Array<{ id: string; name: string; color: string }> = [];
    if (body.tags && body.tags.length > 0) {
      for (const tagName of body.tags) {
        const tag = await this.prisma.tag.upsert({
          where: { userId_name: { userId, name: tagName } },
          create: { userId, name: tagName },
          update: {},
        });
        await this.prisma.monitorTag.create({ data: { monitorId: created.id, tagId: tag.id } });
        createdTags.push({ id: tag.id, name: tag.name, color: tag.color });
      }
    }

    await this.audit.log('monitor.create', userId, userId, { monitorId: created.id, type: created.type, target: created.target });

    const response = {
      id: created.id,
      userId: created.userId,
      name: created.name,
      type: created.type,
      target: created.target,
      intervalSec: created.intervalSec,
      timeoutMs: created.timeoutMs,
      confirmations: created.confirmations,
      config: this.sanitizeConfig((created.configJson as Record<string, unknown> | null) ?? {}, created.type as MonitorType),
      alertChannelIds: body.alertChannelIds ?? [],
      folderId: created.folderId,
      tags: createdTags,
      enabled: created.enabled,
      slaTarget: created.slaTarget,
      slaPeriodDays: created.slaPeriodDays,
      slaBreachAlertedAt: created.slaBreachAlertedAt?.toISOString() ?? null,
      escalationPolicyId: created.escalationPolicyId ?? null,
      createdAt: created.createdAt.toISOString(),
    };

    this.realtime.monitorCreated(userId, response);
    return response;
  }

  /**
   * Updates an existing monitor owned by the authenticated user.
   * Merges provided config with existing config (partial update).
   * Replaces alert channel assignments and tags when provided.
   * Emits a real-time monitorUpdated event and logs to audit trail.
   * @param userId - The authenticated user's ID
   * @param monitorId - The ID of the monitor to update
   * @param body - Fields to update (all optional)
   * @returns The updated monitor object
   * @throws NotFoundException if monitor not found or not owned by user
   */
  async update(userId: string, monitorId: string, body: {
    name?: string;
    description?: string | null;
    target?: string;
    type?: MonitorType;
    intervalSec?: number;
    timeoutMs?: number;
    confirmations?: number;
    config?: Record<string, unknown>;
    alertChannelIds?: string[];
    folderId?: string | null;
    enabled?: boolean;
    tags?: string[];
    slaTarget?: number | null;
    slaPeriodDays?: number | null;
    escalationPolicyId?: string | null;
  }) {
    const current = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!current) throw new NotFoundException('monitor not found');

    const currentConfig = (current.configJson as Record<string, unknown> | null) ?? {};
    const mergedConfig = body.config ? { ...currentConfig, ...body.config } : { ...currentConfig };

    const nextType = body.type ?? current.type;
    if (nextType === 'HEARTBEAT') {
      if (typeof mergedConfig.token !== 'string' || !String(mergedConfig.token).trim()) {
        mergedConfig.token = randomUUID();
      }
      const timeoutRaw = Number(mergedConfig.timeoutMin ?? 5);
      mergedConfig.timeoutMin = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 5;
    }

    await this.prisma.monitor.update({
      where: { id: monitorId },
      data: {
        name: body.name ?? current.name,
        ...(body.description !== undefined ? { description: body.description } : {}),
        target: body.target ?? current.target,
        type: body.type ?? current.type,
        intervalSec: body.intervalSec ?? current.intervalSec,
        timeoutMs: body.timeoutMs ?? current.timeoutMs,
        confirmations: body.confirmations !== undefined ? Math.max(1, Math.min(10, body.confirmations)) : current.confirmations,
        configJson: mergedConfig as Prisma.InputJsonValue,
        folderId: body.folderId === undefined ? current.folderId : body.folderId,
        enabled: body.enabled ?? current.enabled,
        ...(body.slaTarget !== undefined ? { slaTarget: body.slaTarget } : {}),
        ...(body.slaPeriodDays !== undefined ? { slaPeriodDays: body.slaPeriodDays } : {}),
        ...(body.escalationPolicyId !== undefined ? { escalationPolicyId: body.escalationPolicyId } : {}),
      },
    });

    if (body.alertChannelIds) {
      await this.prisma.monitorAlert.deleteMany({ where: { monitorId } });
      if (body.alertChannelIds.length > 0) {
        await this.prisma.monitorAlert.createMany({
          data: body.alertChannelIds.map((alertChannelId) => ({ monitorId, alertChannelId })),
        });
      }
    }

    if (body.tags !== undefined) {
      await this.prisma.monitorTag.deleteMany({ where: { monitorId } });
      for (const tagName of body.tags) {
        const tag = await this.prisma.tag.upsert({
          where: { userId_name: { userId, name: tagName } },
          create: { userId, name: tagName },
          update: {},
        });
        await this.prisma.monitorTag.create({ data: { monitorId, tagId: tag.id } });
      }
    }

    await this.audit.log('monitor.update', userId, userId, { monitorId });
    const updated = await this.list(userId).then((items) => items.find((m) => m.id === monitorId));
    if (updated) this.realtime.monitorUpdated(userId, updated);
    return updated;
  }

  /**
   * Exports all monitors for the user as a portable JSON object.
   * Sensitive config (tokens, passwords) is sanitized before export.
   * @param userId - The authenticated user's ID
   * @returns Export envelope with version, timestamp, and monitor list
   */
  async exportMonitors(userId: string) {
    const monitors = await this.list(userId);
    return {
      version: '1',
      exportedAt: new Date().toISOString(),
      monitors: monitors.map((m) => ({
        name: m.name,
        type: m.type,
        target: m.target,
        intervalSec: m.intervalSec,
        timeoutMs: m.timeoutMs,
        confirmations: m.confirmations,
        config: m.config,
        enabled: m.enabled,
      })),
    };
  }

  /**
   * Imports monitors from a previously exported JSON array.
   * Creates each monitor in sequence; collects errors per item without failing the batch.
   * @param userId - The authenticated user's ID
   * @param items - Array of monitor definitions to import
   * @returns Summary of { imported, errors } with per-item error details
   */
  async importMonitors(userId: string, items: Array<{
    name: string;
    target: string;
    type: MonitorType;
    intervalSec?: number;
    timeoutMs?: number;
    confirmations?: number;
    config?: Record<string, unknown>;
    enabled?: boolean;
  }>) {
    const created = [];
    const errors: Array<{ index: number; name: string; error: string }> = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      try {
        const monitor = await this.create(userId, {
          name: item.name,
          target: item.target,
          type: item.type,
          intervalSec: item.intervalSec,
          timeoutMs: item.timeoutMs,
          confirmations: item.confirmations,
          config: item.config,
        });
        if (item.enabled === false) {
          await this.update(userId, monitor.id, { enabled: false });
        }
        created.push(monitor);
      } catch (err) {
        errors.push({ index: i, name: item.name, error: err instanceof Error ? err.message : String(err) });
      }
    }

    await this.audit.log('monitor.import', userId, userId, { imported: created.length, errors: errors.length });
    return { imported: created.length, errors };
  }

  /**
   * Deletes a monitor owned by the authenticated user.
   * Cascades deletion of related runs, alerts, and tag associations.
   * Emits a real-time monitorDeleted event and logs to audit trail.
   * @param userId - The authenticated user's ID
   * @param monitorId - The ID of the monitor to delete
   * @returns { ok: true } on success
   * @throws NotFoundException if monitor not found or not owned by user
   */
  async remove(userId: string, monitorId: string) {
    const current = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!current) throw new NotFoundException('monitor not found');
    await this.prisma.monitor.delete({ where: { id: monitorId } });
    await this.audit.log('monitor.delete', userId, userId, { monitorId });
    this.realtime.monitorDeleted(userId, { id: monitorId });
    return { ok: true };
  }

  /**
   * Performs a bulk action (enable, disable, delete, or run) on multiple monitors.
   * Verifies ownership of all IDs before executing; silently skips unowned IDs.
   * @param userId - The authenticated user's ID
   * @param ids - Array of monitor IDs to act on
   * @param action - One of: 'enable' | 'disable' | 'delete' | 'run'
   * @returns { ok, affected } with count of successfully processed monitors
   */
  async bulkAction(userId: string, ids: string[], action: 'enable' | 'disable' | 'delete' | 'run' | 'add-tag' | 'remove-tag', tagId?: string) {
    if (!ids.length) return { ok: true, affected: 0 };
    // Verify ownership of all IDs first
    const monitors = await this.prisma.monitor.findMany({ where: { id: { in: ids }, userId } });
    const ownedIds = monitors.map((m) => m.id);
    if (!ownedIds.length) return { ok: true, affected: 0 };

    if (action === 'delete') {
      await this.prisma.monitor.deleteMany({ where: { id: { in: ownedIds }, userId } });
      for (const id of ownedIds) {
        await this.audit.log('monitor.delete', userId, userId, { monitorId: id, bulk: true });
        this.realtime.monitorDeleted(userId, { id });
      }
      return { ok: true, affected: ownedIds.length };
    }

    if (action === 'enable' || action === 'disable') {
      const enabled = action === 'enable';
      await this.prisma.monitor.updateMany({ where: { id: { in: ownedIds }, userId }, data: { enabled } });
      await this.audit.log(`monitor.bulk_${action}`, userId, userId, { ids: ownedIds });
      return { ok: true, affected: ownedIds.length };
    }

    if (action === 'run') {
      const results = await Promise.allSettled(ownedIds.map((id) => this.runNow(userId, id)));
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      return { ok: true, affected: succeeded };
    }

    if ((action === 'add-tag' || action === 'remove-tag') && tagId) {
      // Verify the tag belongs to this user
      const tag = await this.prisma.tag.findFirst({ where: { id: tagId, userId } });
      if (!tag) return { ok: false, affected: 0 };

      if (action === 'add-tag') {
        // Upsert MonitorTag for each monitor (skip if already tagged)
        let affected = 0;
        for (const monitorId of ownedIds) {
          try {
            await this.prisma.monitorTag.upsert({
              where: { monitorId_tagId: { monitorId, tagId } },
              update: {},
              create: { monitorId, tagId },
            });
            affected++;
          } catch {
            // skip conflicts
          }
        }
        await this.audit.log('monitor.bulk_add_tag', userId, userId, { ids: ownedIds, tagId });
        return { ok: true, affected };
      }

      if (action === 'remove-tag') {
        const result = await this.prisma.monitorTag.deleteMany({
          where: { monitorId: { in: ownedIds }, tagId },
        });
        await this.audit.log('monitor.bulk_remove_tag', userId, userId, { ids: ownedIds, tagId });
        return { ok: true, affected: result.count };
      }
    }

    return { ok: false, affected: 0 };
  }

  /**
   * Returns all alert channels assigned to a specific monitor.
   * @param userId - The authenticated user's ID
   * @param monitorId - The monitor to list alerts for
   * @returns Array of alert channel objects with notifyOn setting
   * @throws NotFoundException if monitor not found or not owned by user
   */
  async listMonitorAlerts(userId: string, monitorId: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    const assignments = await this.prisma.monitorAlert.findMany({
      where: { monitorId },
      include: { alertChannel: true },
    });

    return assignments.map((a) => ({
      id: a.alertChannel.id,
      name: a.alertChannel.name,
      type: a.alertChannel.type,
      config: (a.alertChannel.configJson as Record<string, unknown>) ?? {},
      createdAt: a.alertChannel.createdAt.toISOString(),
      notifyOn: a.notifyOn,
    }));
  }

  /**
   * Assigns an alert channel to a monitor (upsert — safe to call multiple times).
   * Defaults notifyOn to VERSION_ANY for version monitors, ON_CHANGE for uptime monitors.
   * @param userId - The authenticated user's ID
   * @param monitorId - The target monitor ID
   * @param channelId - The alert channel ID to assign
   * @param notifyOn - Optional notification trigger setting (defaults based on monitor type)
   * @returns { ok: true } on success
   * @throws NotFoundException if monitor or channel not found / not owned by user
   */
  async addMonitorAlert(userId: string, monitorId: string, channelId: string, notifyOn?: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    const channel = await this.prisma.alertChannel.findFirst({ where: { id: channelId, userId } });
    if (!channel) throw new NotFoundException('alert channel not found');

    // Default notifyOn based on monitor type
    const isVersion = monitor.type === 'GIT_RELEASE' || monitor.type === 'DOCKER_IMAGE';
    const defaultNotifyOn = isVersion ? 'VERSION_ANY' : 'ON_CHANGE';
    const resolvedNotifyOn = notifyOn ?? defaultNotifyOn;

    await this.prisma.monitorAlert.upsert({
      where: { monitorId_alertChannelId: { monitorId, alertChannelId: channelId } },
      create: { monitorId, alertChannelId: channelId, notifyOn: resolvedNotifyOn },
      update: {},
    });

    await this.audit.log('monitor.alert.add', userId, userId, { monitorId, channelId, notifyOn: resolvedNotifyOn });
    return { ok: true };
  }

  /**
   * Updates the notifyOn setting for an existing monitor-channel assignment.
   * Valid values: ON_CHANGE | ALWAYS | FIRST_ONLY | DAILY_DIGEST | VERSION_ANY | VERSION_MAJOR
   * @param userId - The authenticated user's ID
   * @param monitorId - The target monitor ID
   * @param channelId - The alert channel ID
   * @param notifyOn - The new notification trigger setting
   * @returns { ok: true } on success
   * @throws NotFoundException if monitor not owned by user
   * @throws BadRequestException if notifyOn value is invalid
   */
  async updateMonitorAlertNotifyOn(userId: string, monitorId: string, channelId: string, notifyOn: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    const validValues = ['ON_CHANGE', 'ALWAYS', 'FIRST_ONLY', 'DAILY_DIGEST', 'VERSION_ANY', 'VERSION_MAJOR'];
    if (!validValues.includes(notifyOn)) throw new BadRequestException(`Invalid notifyOn value: ${notifyOn}`);

    await this.prisma.monitorAlert.update({
      where: { monitorId_alertChannelId: { monitorId, alertChannelId: channelId } },
      data: { notifyOn },
    });

    await this.audit.log('monitor.alert.update', userId, userId, { monitorId, channelId, notifyOn });
    return { ok: true };
  }

  /**
   * Removes an alert channel assignment from a monitor.
   * @param userId - The authenticated user's ID
   * @param monitorId - The target monitor ID
   * @param channelId - The alert channel ID to unassign
   * @returns { ok: true } on success
   * @throws NotFoundException if monitor not owned by user
   */
  async removeMonitorAlert(userId: string, monitorId: string, channelId: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    await this.prisma.monitorAlert.deleteMany({
      where: { monitorId, alertChannelId: channelId },
    });

    await this.audit.log('monitor.alert.remove', userId, userId, { monitorId, channelId });
    return { ok: true };
  }

  /**
   * Triggers an immediate on-demand check for a monitor, bypassing the scheduler.
   * @param userId - The authenticated user's ID
   * @param monitorId - The monitor to run immediately
   * @returns The MonitorRun result from the check
   * @throws NotFoundException if monitor not found or not owned by user
   */
  /**
   * Snoozes a monitor by creating a maintenance window for the specified duration.
   * While the maintenance window is active, alert delivery is suppressed for this monitor.
   * @param userId - The authenticated user's ID
   * @param monitorId - The monitor to snooze
   * @param hours - Number of hours to snooze (1, 4, 8, 24, or 168 for 7 days)
   * @returns The created maintenance window
   * @throws NotFoundException if monitor not found or not owned by user
   */
  async snooze(userId: string, monitorId: string, hours: number) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');
    const validHours = [1, 4, 8, 24, 168];
    const snoozeHours = validHours.includes(hours) ? hours : 1;
    const now = new Date();
    const endsAt = new Date(now.getTime() + snoozeHours * 60 * 60 * 1000);
    const label = snoozeHours === 168 ? '7 days' : snoozeHours === 1 ? '1 hour' : `${snoozeHours} hours`;
    const window = await this.prisma.maintenanceWindow.create({
      data: {
        name: `Snoozed — ${monitor.name} (${label})`,
        startsAt: now,
        endsAt,
        userId,
        monitors: { create: [{ monitorId }] },
      },
      include: { monitors: { select: { monitorId: true } } },
    });
    await this.audit.log('monitor.snooze', userId, userId, { monitorId, hours: snoozeHours });
    return { ok: true, windowId: window.id, endsAt: endsAt.toISOString() };
  }

  async runNow(userId: string, monitorId: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');
    await this.audit.log('monitor.run_now', userId, userId, { monitorId });
    return this.checksService.runMonitor({
      id: monitor.id,
      userId: monitor.userId,
      name: monitor.name,
      type: monitor.type,
      target: monitor.target,
      intervalSec: monitor.intervalSec,
      timeoutMs: monitor.timeoutMs,
      confirmations: monitor.confirmations,
      config: (monitor.configJson as Record<string, unknown> | null) ?? {},
      alertChannelIds: [],
      folderId: monitor.folderId,
      enabled: monitor.enabled,
      createdAt: monitor.createdAt.toISOString(),
      slaTarget: monitor.slaTarget ?? null,
      slaPeriodDays: monitor.slaPeriodDays ?? null,
      slaBreachAlertedAt: monitor.slaBreachAlertedAt ? monitor.slaBreachAlertedAt.toISOString() : null,
    });
  }

  /**
   * Returns recent monitor check runs across all uptime monitors for the user.
   * Excludes version monitors (GIT_RELEASE, DOCKER_IMAGE) — use versionSummary for those.
   * @param userId - The authenticated user's ID
   * @param limit - Max number of runs to return (default: 10)
   * @param since - Optional lower bound for checkedAt timestamp
   * @returns Array of run result objects ordered by checkedAt desc
   */
  async getRecentRuns(userId: string, limit = 10, since?: Date) {
    const runs = await this.prisma.monitorRun.findMany({
      where: {
        monitor: {
          userId,
          type: { notIn: ['GIT_RELEASE', 'DOCKER_IMAGE'] },
        },
        ...(since ? { checkedAt: { gte: since } } : {}),
      },
      orderBy: { checkedAt: 'desc' },
      take: limit,
      include: { monitor: { select: { type: true } } },
    });
    return runs.map((r) => ({
      id: r.id,
      userId: r.userId,
      monitorId: r.monitorId,
      monitorType: r.monitor?.type ?? null,
      checkedAt: r.checkedAt.toISOString(),
      ok: r.ok,
      statusCode: r.status,
      latencyMs: r.latencyMs,
      message: r.message,
      level: (r.level as 'green' | 'yellow' | 'red'),
    }));
  }

  /**
   * Returns up to 200 most recent check runs across all monitors for the user.
   * @param userId - The authenticated user's ID
   * @returns Array of run result objects ordered by checkedAt desc
   */
  async runs(userId: string) {
    const runs = await this.prisma.monitorRun.findMany({
      where: { userId },
      orderBy: { checkedAt: 'desc' },
      take: 200,
      include: { monitor: { select: { type: true, name: true } } },
    });
    return runs.map((r) => ({
      id: r.id,
      userId: r.userId,
      monitorId: r.monitorId,
      monitorType: r.monitor?.type ?? null,
      monitorName: r.monitor?.name ?? null,
      checkedAt: r.checkedAt.toISOString(),
      ok: r.ok,
      statusCode: r.status,
      latencyMs: r.latencyMs,
      message: r.message,
      level: r.level as 'green' | 'yellow' | 'red',
    }));
  }

  /**
   * Returns up to 200 most recent runs for a specific monitor.
   * @param userId - The authenticated user's ID
   * @param monitorId - The monitor to fetch runs for
   * @returns Array of run result objects for that monitor, ordered by checkedAt desc
   * @throws NotFoundException if monitor not found or not owned by user
   */
  async monitorRuns(userId: string, monitorId: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    const runs = await this.prisma.monitorRun.findMany({
      where: { userId, monitorId },
      orderBy: { checkedAt: 'desc' },
      take: 200,
    });

    return runs.map((r) => ({
      id: r.id,
      monitorId: r.monitorId,
      checkedAt: r.checkedAt.toISOString(),
      ok: r.ok,
      statusCode: r.status,
      latencyMs: r.latencyMs,
      message: r.message,
      level: r.level as 'green' | 'yellow' | 'red',
    }));
  }

  /**
   * Calculates uptime statistics for a monitor over a given time period.
   * Computes uptimePct, incident list, MTTR, MTBF, and average latency.
   * @param userId - The authenticated user's ID
   * @param monitorId - The monitor to calculate uptime for
   * @param period - Time window: '1d' | '7d' | '30d' | '90d' (default: '30d')
   * @returns Uptime stats object with incident list and SLA metrics
   * @throws NotFoundException if monitor not found or not owned by user
   */
  async monitorUptime(userId: string, monitorId: string, period: '1d' | '7d' | '30d' | '90d' = '30d') {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    const periodDays: Record<string, number> = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
    const days = periodDays[period] ?? 30;
    const from = new Date(Date.now() - days * 86400_000);
    const to = new Date();

    const runs = await this.prisma.monitorRun.findMany({
      where: { userId, monitorId, checkedAt: { gte: from } },
      orderBy: { checkedAt: 'asc' },
      select: { ok: true, checkedAt: true, latencyMs: true },
    });

    const totalChecks = runs.length;
    const failedChecks = runs.filter((r) => !r.ok).length;
    const successChecks = totalChecks - failedChecks;

    // Time-window uptime: percentage of seconds the service was up within the period.
    // Approximation: allocate each check's "window" as half the interval before + half after,
    // clamped to the period boundaries. For the simple case with uniform intervals we
    // use the fraction of successful checks, which is accurate for fixed-interval monitors.
    const uptimePct = totalChecks === 0 ? 100 : Math.round((successChecks / totalChecks) * 10000) / 100;

    // Incident detection: consecutive failed runs form an incident.
    // Returns array of { start, end, durationSec } for each contiguous failure run.
    const incidents: Array<{ start: string; end: string; durationSec: number }> = [];
    let incidentStart: Date | null = null;
    let incidentLast: Date | null = null;
    for (const run of runs) {
      if (!run.ok) {
        if (!incidentStart) incidentStart = run.checkedAt;
        incidentLast = run.checkedAt;
      } else {
        if (incidentStart && incidentLast) {
          incidents.push({
            start: incidentStart.toISOString(),
            end: incidentLast.toISOString(),
            durationSec: Math.round((incidentLast.getTime() - incidentStart.getTime()) / 1000),
          });
        }
        incidentStart = null;
        incidentLast = null;
      }
    }
    // Close open incident at period end
    if (incidentStart && incidentLast) {
      incidents.push({
        start: incidentStart.toISOString(),
        end: incidentLast.toISOString(),
        durationSec: Math.round((incidentLast.getTime() - incidentStart.getTime()) / 1000),
      });
    }

    const totalDowntimeSec = incidents.reduce((sum, i) => sum + i.durationSec, 0);

    // MTTR: mean time to recovery (average incident duration)
    const mttrSec = incidents.length > 0 ? Math.round(totalDowntimeSec / incidents.length) : 0;

    // MTBF: mean time between failures = total uptime / number of incidents
    const periodSec = days * 86400;
    const uptimeSec = periodSec - totalDowntimeSec;
    const mtbfSec = incidents.length > 0 ? Math.round(uptimeSec / incidents.length) : uptimeSec;

    // Average latency
    const withLatency = runs.filter((r) => r.latencyMs !== null);
    const avgLatencyMs =
      withLatency.length > 0
        ? Math.round(withLatency.reduce((sum, r) => sum + (r.latencyMs as number), 0) / withLatency.length)
        : null;

    return {
      monitorId,
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      uptimePct,
      totalChecks,
      failedChecks,
      successChecks,
      totalDowntimeSec,
      incidents: incidents.length,
      incidentList: incidents,
      mttrSec,
      mtbfSec,
      avgLatencyMs,
    };
  }

  /**
   * Returns time-bucketed chart data for a monitor over a given period.
   * Each bucket contains: timestamp (bucket start), avgLatencyMs, p95LatencyMs, uptimePct, checkCount.
   * Granularity auto-scales based on period: 1d=5min, 7d=1h, 30d=6h, 90d=1d.
   *
   * @param userId - The authenticated user's ID
   * @param monitorId - The monitor to chart
   * @param period - Time window: '1d' | '7d' | '30d' | '90d' (default: '30d')
   * @returns Array of chart buckets
   * @throws NotFoundException if monitor not found
   */
  async monitorChart(userId: string, monitorId: string, period: '1d' | '7d' | '30d' | '90d' = '7d') {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    const periodDays: Record<string, number> = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
    const days = periodDays[period] ?? 7;
    const from = new Date(Date.now() - days * 86400_000);
    const to = new Date();

    // Bucket sizes in minutes: 1d=5min, 7d=60min, 30d=360min, 90d=1440min
    const bucketMinutes: Record<string, number> = { '1d': 5, '7d': 60, '30d': 360, '90d': 1440 };
    const bucketMs = (bucketMinutes[period] ?? 60) * 60_000;

    const runs = await this.prisma.monitorRun.findMany({
      where: { userId, monitorId, checkedAt: { gte: from } },
      orderBy: { checkedAt: 'asc' },
      select: { ok: true, checkedAt: true, latencyMs: true, level: true },
    });

    // Build bucket map
    const buckets = new Map<number, { latencies: number[]; total: number; ok: number }>();
    const fromMs = from.getTime();
    for (const run of runs) {
      const runMs = run.checkedAt.getTime();
      const bucketTs = Math.floor((runMs - fromMs) / bucketMs) * bucketMs + fromMs;
      let bucket = buckets.get(bucketTs);
      if (!bucket) {
        bucket = { latencies: [], total: 0, ok: 0 };
        buckets.set(bucketTs, bucket);
      }
      bucket.total++;
      if (run.ok) bucket.ok++;
      if (run.latencyMs !== null) bucket.latencies.push(run.latencyMs);
    }

    // Build result sorted by time
    const result = Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, b]) => {
        const sorted = [...b.latencies].sort((a, c) => a - c);
        const avgLatency = b.latencies.length > 0
          ? Math.round(b.latencies.reduce((s, v) => s + v, 0) / b.latencies.length)
          : null;
        const p95Idx = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
        const p95Latency = sorted.length > 0 ? sorted[p95Idx] : null;
        return {
          ts: new Date(ts).toISOString(),
          uptimePct: b.total === 0 ? 100 : Math.round((b.ok / b.total) * 10000) / 100,
          checkCount: b.total,
          avgLatencyMs: avgLatency,
          p95LatencyMs: p95Latency,
        };
      });

    return {
      monitorId,
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      bucketMinutes: bucketMinutes[period] ?? 60,
      points: result,
    };
  }

  private parseGithubRepo(input: string) {
    const cleaned = input.replace(/^https?:\/\/github.com\//i, '').replace(/\.git$/, '');
    const [owner, repo] = cleaned.split('/');
    if (!owner || !repo) return null;
    return { owner, repo };
  }

  private parseGitlabTarget(target: string, host?: string) {
    const fallbackHost = (host ?? 'gitlab.com').replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (target.startsWith('gitlab:')) {
      const projectPath = target.slice('gitlab:'.length).trim();
      if (!projectPath) return null;
      return { host: fallbackHost, projectPath };
    }
    const m = target.match(/^https?:\/\/([^/]+)\/(.+)$/i);
    if (m) return { host: m[1], projectPath: m[2].replace(/\.git$/, '').replace(/\/$/, '') };

    // Allow plain group/project input when provider=gitlab
    if (target.includes('/')) {
      return { host: fallbackHost, projectPath: target.replace(/\.git$/, '').replace(/^\/+|\/+$/g, '') };
    }

    return null;
  }

  private pickPreferredTag(tags: Array<{ name?: string }>) {
    const nonNightly = tags.find((t) => t.name && !t.name.toLowerCase().includes('nightly'));
    return nonNightly?.name ?? tags[0]?.name ?? null;
  }

  private isSensibleVersionValue(value: string): boolean {
    const v = String(value).trim();
    if (!v) return false;
    if (v.length > 64) return false;

    // Accept semantic-ish versions like 1.2.3, v2.33.3, 2.33.3-linux-amd64
    if (/^v?\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?$/i.test(v)) return true;

    // Accept loose numeric version tokens embedded in strings (e.g. "version=2.33.3")
    if (/v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?/i.test(v)) return true;

    return false;
  }

  private extractVersionFromText(text: string): string | null {
    const source = String(text ?? '');
    if (!source) return null;

    const tokenRe = /v?\d+\.\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?/gi;
    const candidates: Array<{ value: string; score: number }> = [];

    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(source)) !== null) {
      const value = m[0];
      const idx = m.index;
      const before = source.slice(Math.max(0, idx - 60), idx).toLowerCase();
      const after = source.slice(idx + value.length, idx + value.length + 60).toLowerCase();
      const ctx = `${before} ${after}`;

      // Always ignore anything near "latest" markers
      if (ctx.includes('latest')) continue;

      let score = 0;
      if (ctx.includes('versionstring')) score += 7;
      if (ctx.includes('serverversion')) score += 6;
      if (ctx.includes('databaseversion')) score += 3;
      if (ctx.includes('version')) score += 3;
      if (ctx.includes('build')) score += 1;

      if (this.isSensibleVersionValue(value)) score += 2;

      candidates.push({ value, score });
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.value.length - a.value.length;
    });

    return candidates[0]?.value ?? null;
  }

  private extractVersionFromPayload(payload: unknown): string | null {
    if (!payload) return null;
    if (typeof payload === 'string') {
      return this.extractVersionFromText(payload);
    }
    if (Array.isArray(payload)) {
      for (const item of payload) {
        const v = this.extractVersionFromPayload(item);
        if (v) return v;
      }
      return null;
    }
    if (typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;
      const directKeySet = new Set([
        'version',
        'appversion',
        'app_version',
        'release',
        'tag',
        'buildversion',
        'serverversion',
        'databaseversion',
        'imagetag',
      ]);

      for (const [key, value] of Object.entries(obj)) {
        const normalized = key.replace(/[^a-z0-9_]/gi, '').toLowerCase();

        // Never use "latest" fields for deployed/current version detection.
        if (normalized.includes('latest')) continue;

        if (directKeySet.has(normalized) && typeof value === 'string' && this.isSensibleVersionValue(value)) {
          const m = value.match(/v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?/i);
          return m ? m[0] : value;
        }

        // Fallback: accept any key that looks version-like but is not "latest*"
        if (normalized.includes('version') && typeof value === 'string' && this.isSensibleVersionValue(value)) {
          const m = value.match(/v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?/i);
          return m ? m[0] : value;
        }
      }

      const nested = ['data', 'build', 'info', 'meta', 'runtime', 'dependencies'];
      for (const key of nested) {
        const v = this.extractVersionFromPayload(obj[key]);
        if (v) return v;
      }
    }
    return null;
  }

  private async detectDeployedVersion(input: { appUrl?: string; appToken?: string; appVersionEndpoint?: string; appAuthType?: 'none' | 'token' | 'openvpn'; openvpnUsername?: string; openvpnPassword?: string; endpointFallbacks?: string[]; jsonPath?: string; jsonPathExtractors?: string[] }) {
    if (!input.appUrl) {
      return {
        currentVersion: null as string | null,
        tried: [] as string[],
        detectedFrom: null as string | null,
        authFailed: false,
        authMode: null as string | null,
      };
    }

    const base = input.appUrl.replace(/\/$/, '');
    const custom = String(input.appVersionEndpoint ?? '').trim();
    const registryFallbacks = (input.endpointFallbacks ?? []).filter((s) => typeof s === 'string' && s.trim());
    const defaultCandidates = [
      '/version',
      '/api/version',
      '/api/v1/version',
      '/api/system/version',
      '/api/v1/health',
      '/api/v1/info',
      '/health',
      '/api/health',
      '/status',
      '/actuator/info',
      '/actuator/health',
    ];
    // Priority: explicit custom endpoint first, then registry fallbacks, then generic defaults
    const candidates = custom
      ? [custom, ...registryFallbacks]
      : registryFallbacks.length > 0
        ? registryFallbacks
        : defaultCandidates;

    const token = String(input.appToken ?? '').trim();
    const authType = (input.appAuthType ?? 'token') as 'none' | 'token' | 'openvpn';
    const ovpnUser = String(input.openvpnUsername ?? '').trim();
    const ovpnPass = String(input.openvpnPassword ?? '').trim();
    const basic = ovpnUser || ovpnPass ? Buffer.from(`${ovpnUser}:${ovpnPass}`).toString('base64') : '';

    const authModes: Array<{ label: string; apply: (h: Record<string, string>) => void }> =
      authType === 'none'
        ? [{ label: 'no-auth', apply: () => {} }]
        : authType === 'openvpn'
          ? [
              { label: 'openvpn-basic', apply: (h) => { if (basic) h.authorization = `Basic ${basic}`; } },
              { label: 'openvpn-headers', apply: (h) => { if (ovpnUser) h['x-openvpn-username'] = ovpnUser; if (ovpnPass) h['x-openvpn-password'] = ovpnPass; } },
            ]
          : [
              { label: 'authorization-bearer', apply: (h) => { if (token) h.authorization = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`; } },
              { label: 'authorization-raw', apply: (h) => { if (token) h.authorization = token; } },
              { label: 'x-api-key', apply: (h) => { if (token) h['x-api-key'] = token; } },
              { label: 'x-access-token', apply: (h) => { if (token) h['x-access-token'] = token; } },
              { label: 'token', apply: (h) => { if (token) h.token = token; } },
            ];

    const tried: string[] = [];
    let authFailed = false;

    for (const path of candidates) {
      const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;

      for (const mode of authModes) {
        const headers: Record<string, string> = { 'User-Agent': 'PulseDock' };
        mode.apply(headers);

        tried.push(`${url} [${mode.label}]`);

        try {
          const resp = await fetch(url, { headers });
          if (!resp.ok) {
            if (resp.status === 401 || resp.status === 403) authFailed = true;
            continue;
          }

          const contentType = resp.headers.get('content-type') ?? '';
          const body = contentType.includes('application/json') ? await resp.json() : await resp.text();
          const extractors = normalizeExtractors(input.jsonPath, input.jsonPathExtractors);
          const version = extractors.length > 0
            ? (runExtractorPipeline(body, extractors) ?? this.extractVersionFromPayload(body))
            : this.extractVersionFromPayload(body);

          if (version) {
            return {
              currentVersion: version,
              tried,
              detectedFrom: url,
              authFailed: false,
              authMode: mode.label,
            };
          }
        } catch {
          continue;
        }
      }
    }

    return { currentVersion: null as string | null, tried, detectedFrom: null as string | null, authFailed, authMode: null as string | null };
  }

  /**
   * Tests connectivity and version retrieval for a version-monitored source (GitHub, GitLab, Docker Hub, npm, etc.).
   * Used by the UI's "Test Connection" button before saving a version monitor.
   * @param input.provider - The version source provider
   * @param input.target - The target identifier (repo path, package name, image name, etc.)
   * @param input.token - Optional API token for authenticated requests
   * @param input.host - Optional custom GitLab host
   * @returns { ok, message, latestVersion } — ok=false if the connection failed
   * @throws Error when an upstream request fails unexpectedly
   */
  async testVersionConnection(input: { provider: 'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'maven' | 'helm'; target: string; token?: string; host?: string }) {
    if (input.provider === 'github') {
      const repo = this.parseGithubRepo(input.target);
      if (!repo) return { ok: false, message: 'Invalid GitHub target. Use owner/repo or GitHub URL.' };
      const headers: Record<string, string> = { 'User-Agent': 'PulseDock' };
      if (input.token) headers.authorization = `Bearer ${input.token}`;

      const releaseResp = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`, { headers });
      if (releaseResp.ok) {
        const data = await releaseResp.json() as { tag_name?: string };
        return { ok: true, message: 'GitHub release endpoint reachable', latestVersion: data.tag_name ?? null, source: 'releases/latest' };
      }

      if (releaseResp.status === 404) {
        const tagsResp = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/tags?per_page=1`, { headers });
        if (!tagsResp.ok) return { ok: false, message: `GitHub API ${tagsResp.status} (no releases and tags lookup failed)` };
        const tags = await tagsResp.json() as Array<{ name?: string }>;
        const picked = this.pickPreferredTag(tags);
        return { ok: true, message: 'No GitHub releases found; using latest non-nightly tag fallback', latestVersion: picked, source: 'tags' };
      }

      return { ok: false, message: `GitHub API ${releaseResp.status}`, unauthorized: releaseResp.status === 401 || releaseResp.status === 403 };
    }

    if (input.provider === 'gitlab') {
      const parsed = this.parseGitlabTarget(input.target, input.host);
      if (!parsed) return { ok: false, message: 'Invalid GitLab target. Use gitlab:group/project or GitLab URL.' };
      const headers: Record<string, string> = { 'User-Agent': 'PulseDock' };
      if (input.token) headers['PRIVATE-TOKEN'] = input.token;
      const encodedPath = encodeURIComponent(parsed.projectPath);
      const resp = await fetch(`https://${parsed.host}/api/v4/projects/${encodedPath}/releases/permalink/latest`, { headers });
      if (!resp.ok) return { ok: false, message: `GitLab API ${resp.status}`, unauthorized: resp.status === 401 || resp.status === 403 };
      const data = await resp.json() as { tag_name?: string };
      return { ok: true, message: 'GitLab connection successful', latestVersion: data.tag_name ?? null };
    }

    if (input.provider === 'npm') {
      const pkg = input.target.trim();
      if (!pkg) return { ok: false, message: 'Invalid npm package name.' };
      const resp = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`, {
        headers: { 'User-Agent': 'PulseDock', Accept: 'application/json' },
      });
      if (!resp.ok) return { ok: false, message: `npm registry ${resp.status}` };
      const data = await resp.json() as { version?: string; name?: string };
      return { ok: true, message: 'npm registry reachable', latestVersion: data.version ?? null };
    }

    if (input.provider === 'pypi') {
      const pkg = input.target.trim();
      if (!pkg) return { ok: false, message: 'Invalid PyPI package name.' };
      const resp = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`, {
        headers: { 'User-Agent': 'PulseDock', Accept: 'application/json' },
      });
      if (!resp.ok) return { ok: false, message: `PyPI API ${resp.status}` };
      const data = await resp.json() as { info?: { version?: string } };
      return { ok: true, message: 'PyPI API reachable', latestVersion: data.info?.version ?? null };
    }

    if (input.provider === 'cargo') {
      const pkg = input.target.trim();
      if (!pkg) return { ok: false, message: 'Invalid crate name.' };
      const resp = await fetch(`https://crates.io/api/v1/crates/${encodeURIComponent(pkg)}`, {
        headers: { 'User-Agent': 'PulseDock/1.0 (https://github.com/No749ah/PulseDock)', Accept: 'application/json' },
      });
      if (!resp.ok) return { ok: false, message: `crates.io API ${resp.status}` };
      const data = await resp.json() as { crate?: { max_stable_version?: string; newest_version?: string } };
      return { ok: true, message: 'crates.io API reachable', latestVersion: data.crate?.max_stable_version ?? data.crate?.newest_version ?? null };
    }

    if (input.provider === 'apt') {
      const pkg = input.target.trim().toLowerCase();
      if (!pkg) return { ok: false, message: 'Invalid APT package name.' };

      const resp = await fetch(`https://sources.debian.org/api/src/${encodeURIComponent(pkg)}/`, {
        headers: { 'User-Agent': 'PulseDock' },
      });
      if (!resp.ok) return { ok: false, message: `Debian Sources API ${resp.status}` };

      const data = await resp.json() as { versions?: Array<{ version?: string; suites?: string[] }> };
      const versions = (data.versions ?? []).map((v) => v.version).filter((v): v is string => Boolean(v));
      const stable = versions.find((v) => !/(alpha|beta|rc|nightly|dev|pre)/i.test(v));
      return { ok: true, message: 'APT package lookup successful', latestVersion: stable ?? versions[0] ?? null };
    }

    if (input.provider === 'maven') {
      const parts = input.target.trim().split(':');
      if (parts.length < 2) return { ok: false, message: 'Invalid Maven target. Use "groupId:artifactId" format.' };
      const [groupId, artifactId] = parts;
      const resp = await fetch(
        `https://search.maven.org/solrsearch/select?q=g:${encodeURIComponent(groupId)}+AND+a:${encodeURIComponent(artifactId)}&core=gav&rows=1&wt=json`,
        { headers: { 'User-Agent': 'PulseDock', Accept: 'application/json' } },
      );
      if (!resp.ok) return { ok: false, message: `Maven Central API ${resp.status}` };
      const data = await resp.json() as { response?: { docs?: Array<{ v?: string }> } };
      const latestVersion = data.response?.docs?.[0]?.v ?? null;
      if (!latestVersion) return { ok: false, message: 'No Maven artifact version found. Check groupId:artifactId.' };
      return { ok: true, message: 'Maven Central reachable', latestVersion };
    }

    if (input.provider === 'helm') {
      const parts = input.target.trim().split('/');
      if (parts.length < 2) return { ok: false, message: 'Invalid Helm target. Use "repoName/chartName" format.' };
      const [repoName, chartName] = parts;
      const resp = await fetch(
        `https://artifacthub.io/api/v1/packages/helm/${encodeURIComponent(repoName)}/${encodeURIComponent(chartName)}`,
        { headers: { 'User-Agent': 'PulseDock', Accept: 'application/json' } },
      );
      if (!resp.ok) return { ok: false, message: `Artifact Hub API ${resp.status}` };
      const data = await resp.json() as { version?: string; app_version?: string };
      const latestVersion = data.app_version ?? data.version ?? null;
      if (!latestVersion) return { ok: false, message: 'No Helm chart version found.' };
      return { ok: true, message: 'Artifact Hub reachable', latestVersion };
    }

    const image = input.target.includes('/') ? input.target : `library/${input.target}`;
    const resp = await fetch(`https://hub.docker.com/v2/repositories/${image}/tags?page_size=1&page=1&ordering=last_updated`);
    if (!resp.ok) return { ok: false, message: `Docker API ${resp.status}` };
    const data = await resp.json() as { results?: Array<{ name: string }> };
    return { ok: true, message: 'Docker Hub connection successful', latestVersion: data.results?.[0]?.name ?? null };
  }

  /**
   * Attempts to auto-discover the currently deployed version of an application.
   * Strategy: (1) probe the app's version endpoint, (2) fall back to latest release from provider,
   * (3) return strategy='manual' if neither succeeds.
   * @param input - Connection details including provider, target, appUrl, auth config, etc.
   * @returns { currentVersion, strategy, tried, detectedFrom } — strategy indicates how version was found
   * @throws Error when probing endpoints fails unexpectedly
   */
  async discoverCurrentVersion(input: { provider: 'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'maven' | 'helm'; target: string; token?: string; host?: string; appUrl?: string; appToken?: string; appVersionEndpoint?: string; appAuthType?: 'none' | 'token' | 'openvpn'; openvpnUsername?: string; openvpnPassword?: string; endpointFallbacks?: string[]; jsonPath?: string; jsonPathExtractors?: string[] }) {
    const hasAppUrl = Boolean(input.appUrl && input.appUrl.trim());
    const deployed = await this.detectDeployedVersion({
      appUrl: input.appUrl,
      appToken: input.appToken,
      appVersionEndpoint: input.appVersionEndpoint,
      appAuthType: input.appAuthType,
      openvpnUsername: input.openvpnUsername,
      openvpnPassword: input.openvpnPassword,
      endpointFallbacks: input.endpointFallbacks,
      jsonPath: input.jsonPath,
      jsonPathExtractors: input.jsonPathExtractors,
    });
    if (deployed.currentVersion) {
      return {
        currentVersion: deployed.currentVersion,
        strategy: 'deployed-endpoint',
        tried: deployed.tried,
        detectedFrom: deployed.detectedFrom,
        authMode: deployed.authMode,
      };
    }

    if (hasAppUrl) {
      return {
        currentVersion: null,
        strategy: 'manual',
        authFailed: deployed.authFailed,
        message: deployed.authFailed
          ? 'Application endpoint requires valid auth token (401/403). Check token or auth header format.'
          : 'No application version endpoint returned a usable version. Add app token/custom endpoint or enter current version manually.',
        tried: deployed.tried,
      };
    }

    const probes = await this.testVersionConnection(input);
    if (probes.ok) return { currentVersion: probes.latestVersion ?? null, strategy: 'latest-release-probe', tried: deployed.tried };
    return {
      currentVersion: null,
      strategy: 'manual',
      suggestions: input.provider === 'docker'
        ? ['latest', 'stable', 'main', 'master']
        : ['v1.0.0', 'v0.1.0', 'main'],
      message: 'Auto-discovery failed. Please provide current version manually or a custom app version endpoint.',
      tried: deployed.tried,
    };
  }

  /**
   * Returns a summary of all version monitors (GIT_RELEASE, DOCKER_IMAGE) for the user.
   * Includes aggregate stats (total, green, yellow, red) and per-monitor current/latest status.
   * Used by the dashboard's version overview widget.
   * @param userId - The authenticated user's ID
   * @returns { stats, items } — stats is a count breakdown; items is the per-monitor detail list
   * @throws Error when monitor summary query fails
   */
  async versionSummary(userId: string) {
    // Performance: single query with nested include avoids N+1
    const monitors = await this.prisma.monitor.findMany({
      where: { userId, type: { in: ['GIT_RELEASE', 'DOCKER_IMAGE'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        monitorAlerts: { include: { alertChannel: { select: { id: true, name: true, type: true } } } },
        runs: {
          take: 1,
          orderBy: { checkedAt: 'desc' },
        },
      },
    });

    const rows = monitors.map((m) => {
      const latest = m.runs[0] ?? null;
      const config = (m.configJson as Record<string, unknown> | null) ?? {};
      return {
        id: m.id,
        name: m.name,
        type: m.type,
        target: m.target,
        currentVersion: String(config.currentVersion ?? config.currentTag ?? '').replace(/^v(?=\d)/i, ''),
        latestMessage: latest?.message ?? 'No run yet',
        level: (latest?.level as 'green' | 'yellow' | 'red' | undefined) ?? 'yellow',
        checkedAt: latest?.checkedAt?.toISOString() ?? null,
        intervalSec: m.intervalSec,
        alertChannels: m.monitorAlerts.map((ma) => ({ id: ma.alertChannelId, name: ma.alertChannel.name, type: ma.alertChannel.type, notifyOn: ma.notifyOn })),
      };
    });

    return {
      stats: {
        total: rows.length,
        green: rows.filter((r) => r.level === 'green').length,
        yellow: rows.filter((r) => r.level === 'yellow').length,
        red: rows.filter((r) => r.level === 'red').length,
      },
      items: rows,
    };
  }

  // ── External import parsers ─────────────────────────────────────────────────

  /**
   * Parse an Uptime Robot JSON export and return a normalised monitor list.
   * Uptime Robot monitor types: 1=HTTP(S), 2=Keyword, 3=Ping, 4=Port, 5=Heartbeat
   * We map type 1 and 2 → HTTP; skip unsupported types.
   */
  private parseUptimeRobot(raw: unknown): Array<{
    name: string; target: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';
    intervalSec?: number; enabled?: boolean;
  }> {
    const data = raw as Record<string, unknown>;
    const monitors: unknown[] = Array.isArray(data['monitors'])
      ? (data['monitors'] as unknown[])
      : Array.isArray(raw)
        ? (raw as unknown[])
        : [];

    const results: ReturnType<MonitorsService['parseUptimeRobot']> = [];

    for (const m of monitors) {
      const mon = m as Record<string, unknown>;
      const urlRaw = (mon['url'] ?? mon['target'] ?? '') as string;
      const name = (mon['friendly_name'] ?? mon['name'] ?? urlRaw) as string;
      const type = (mon['type'] as number) ?? 1;
      // Only import HTTP-like monitors (type 1 = HTTP, 2 = Keyword)
      if (![1, 2].includes(type)) continue;
      const interval = (mon['interval'] as number) ?? 300;
      // status: 2=up, else paused/down — treat non-2 as disabled
      const status = (mon['status'] as number) ?? 2;

      if (!urlRaw || !/^https?:\/\//i.test(urlRaw)) continue;

      results.push({
        name: String(name).slice(0, 255),
        target: urlRaw,
        type: 'HTTP',
        intervalSec: Math.max(10, interval),
        enabled: status === 2,
      });
    }
    return results;
  }

  /**
   * Parse a BetterUptime JSON export.
   * BetterUptime API format: { data: [{ id, attributes: { url, pronounceable_name, check_type, call, request_interval_seconds, paused } }] }
   * Also accepts a plain array of attribute objects.
   */
  private parseBetterUptime(raw: unknown): Array<{
    name: string; target: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';
    intervalSec?: number; enabled?: boolean;
  }> {
    const data = raw as Record<string, unknown>;

    // Support both { data: [...] } and plain array
    let items: unknown[] = [];
    if (Array.isArray(data['data'])) {
      items = data['data'] as unknown[];
    } else if (Array.isArray(raw)) {
      items = raw as unknown[];
    }

    const results: ReturnType<MonitorsService['parseBetterUptime']> = [];

    for (const item of items) {
      const entry = item as Record<string, unknown>;
      // Support both nested { attributes: {...} } and flat objects
      const attrs = (entry['attributes'] as Record<string, unknown>) ?? entry;

      const url = (attrs['url'] ?? '') as string;
      const name = (attrs['pronounceable_name'] ?? attrs['name'] ?? url) as string;
      const checkType = (attrs['check_type'] ?? 'status') as string;
      const paused = (attrs['paused'] ?? false) as boolean;
      const interval = (attrs['request_interval_seconds'] ?? attrs['interval'] ?? 180) as number;

      // Only import HTTP-type checks
      if (!['status', 'expected_status_code', 'keyword'].includes(checkType)) continue;
      if (!url || !/^https?:\/\//i.test(url)) continue;

      results.push({
        name: String(name).slice(0, 255),
        target: url,
        type: 'HTTP',
        intervalSec: Math.max(10, interval as number),
        enabled: !paused,
      });
    }
    return results;
  }

  /**
   * Parse an Uptime Kuma JSON backup export.
   * Format: { monitorList: [{ name, url, type, interval, active }] }
   * @param raw - Raw parsed JSON from Uptime Kuma backup
   */
  private parseUptimeKuma(raw: unknown): Array<{
    name: string; target: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';
    intervalSec?: number; enabled?: boolean;
  }> {
    const data = raw as Record<string, unknown>;
    let items: unknown[] = [];

    // Uptime Kuma backup: { monitorList: [...] } or { monitors: [...] } or plain array
    if (Array.isArray(data['monitorList'])) {
      items = data['monitorList'] as unknown[];
    } else if (Array.isArray(data['monitors'])) {
      items = data['monitors'] as unknown[];
    } else if (Array.isArray(raw)) {
      items = raw as unknown[];
    }

    const results: Array<{
      name: string; target: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';
      intervalSec?: number; enabled?: boolean;
    }> = [];

    for (const item of items) {
      const entry = item as Record<string, unknown>;
      // Uptime Kuma monitor types: 1=HTTP, 2=Port, 3=Ping, etc.
      const monType = entry['type'] as string | number | undefined;
      const url = (entry['url'] ?? '') as string;
      const hostname = (entry['hostname'] ?? '') as string;
      const name = (entry['name'] ?? url ?? hostname) as string;
      const interval = (entry['interval'] ?? 60) as number;
      const active = entry['active'] !== false && entry['active'] !== 0;

      // Import HTTP monitors (type = 'http' or 1) — skip ping/port/etc.
      if (monType !== undefined && monType !== 'http' && monType !== 1 && monType !== 'HTTP') {
        continue;
      }

      const target = url || (hostname ? `http://${hostname}` : '');
      if (!target || !/^https?:\/\//i.test(target)) continue;

      results.push({
        name: String(name).slice(0, 255),
        target,
        type: 'HTTP',
        intervalSec: Math.max(10, Number(interval) || 60),
        enabled: active,
      });
    }
    return results;
  }

  /**
   * Parse a generic CSV export where the first row is headers.
   * Looks for columns: name/Name, url/URL/target/Target, interval/Interval
   */
  private parseCsv(csv: string): Array<{
    name: string; target: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';
    intervalSec?: number; enabled?: boolean;
  }> {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = (lines[0] ?? '').split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
    const nameIdx = headers.findIndex((h) => ['name', 'friendly_name', 'monitor name'].includes(h));
    const urlIdx = headers.findIndex((h) => ['url', 'target', 'address', 'website'].includes(h));
    const intervalIdx = headers.findIndex((h) => ['interval', 'check interval', 'request_interval_seconds'].includes(h));
    const pausedIdx = headers.findIndex((h) => ['paused', 'status', 'enabled'].includes(h));

    if (urlIdx === -1) return [];

    const results: ReturnType<MonitorsService['parseCsv']> = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = (lines[i] ?? '').split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      const url = cols[urlIdx] ?? '';
      if (!url || !/^https?:\/\//i.test(url)) continue;

      const name = nameIdx >= 0 ? (cols[nameIdx] ?? url) : url;
      const interval = intervalIdx >= 0 ? parseInt(cols[intervalIdx] ?? '300', 10) : 300;
      const pausedRaw = pausedIdx >= 0 ? (cols[pausedIdx] ?? '') : '';
      const enabled = !['paused', 'false', '0', 'disabled'].includes(pausedRaw.toLowerCase());

      results.push({
        name: name.slice(0, 255),
        target: url,
        type: 'HTTP',
        intervalSec: isNaN(interval) ? 300 : Math.max(10, interval),
        enabled,
      });
    }
    return results;
  }

  /**
   * Imports monitors from an external monitoring tool export (Uptime Robot, Better Uptime, or CSV).
   * Skips duplicates based on target URL. Collects per-item errors without failing the whole batch.
   * @param userId - The authenticated user's ID
   * @param source - Import source format: 'uptime-robot' | 'better-uptime' | 'csv'
   * @param payload - The raw export data (JSON object or CSV string)
   * @returns { imported, skipped, errors, message } with import summary
   */
  async importExternal(
    userId: string,
    source: 'uptime-robot' | 'better-uptime' | 'uptime-kuma' | 'csv',
    payload: unknown,
  ) {
    let items: Array<{
      name: string; target: string; type: 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';
      intervalSec?: number; enabled?: boolean;
    }>;

    switch (source) {
      case 'uptime-robot':
        items = this.parseUptimeRobot(payload);
        break;
      case 'better-uptime':
        items = this.parseBetterUptime(payload);
        break;
      case 'uptime-kuma':
        items = this.parseUptimeKuma(payload);
        break;
      case 'csv':
        items = this.parseCsv(typeof payload === 'string' ? payload : JSON.stringify(payload));
        break;
      default:
        items = [];
    }

    if (!items.length) {
      return { imported: 0, skipped: 0, errors: [], message: 'No importable monitors found in the provided data.' };
    }

    const created = [];
    const errors: Array<{ index: number; name: string; error: string }> = [];
    let skipped = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      try {
        // Skip duplicates (same target already exists for this user)
        const existing = await this.prisma.monitor.findFirst({ where: { userId, target: item.target } });
        if (existing) { skipped++; continue; }

        const monitor = await this.create(userId, {
          name: item.name,
          target: item.target,
          type: item.type,
          intervalSec: item.intervalSec,
        });
        if (item.enabled === false) {
          await this.update(userId, monitor.id, { enabled: false });
        }
        created.push(monitor);
      } catch (err) {
        errors.push({ index: i, name: item?.name ?? '?', error: err instanceof Error ? err.message : String(err) });
      }
    }

    await this.audit.log('monitor.import_external', userId, userId, {
      source,
      imported: created.length,
      skipped,
      errors: errors.length,
    });

    return {
      imported: created.length,
      skipped,
      errors,
      message: `Imported ${created.length} monitor${created.length !== 1 ? 's' : ''}${skipped ? `, skipped ${skipped} duplicate${skipped !== 1 ? 's' : ''}` : ''}.`,
    };
  }

  // ── Dependencies ───────────────────────────────────────────────────────────

  /**
   * List all monitors that `monitorId` depends on (i.e. alert suppression parents).
   * @param userId - Authenticated user ID
   * @param monitorId - The dependent monitor
   * @returns Array of dependency monitor summaries
   */
  async listDependencies(userId: string, monitorId: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const deps = await this.prisma.monitorDependency.findMany({
      where: { monitorId },
      include: {
        dependsOn: {
          select: { id: true, name: true, type: true, target: true, enabled: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return deps.map((d) => ({
      id: d.id,
      monitorId: d.monitorId,
      dependsOnId: d.dependsOnId,
      createdAt: d.createdAt,
      dependsOn: d.dependsOn,
    }));
  }

  /**
   * Add a dependency: `monitorId` depends on `dependsOnId`.
   * Alerts on `monitorId` are suppressed while `dependsOnId` is down.
   * @param userId - Authenticated user ID
   * @param monitorId - The monitor to add the dependency to
   * @param dependsOnId - The monitor to depend on
   * @throws BadRequestException if self-dependency or circular dependency
   * @throws NotFoundException if either monitor not found
   */
  async addDependency(userId: string, monitorId: string, dependsOnId: string) {
    if (monitorId === dependsOnId) {
      throw new BadRequestException('A monitor cannot depend on itself');
    }

    // Verify both monitors belong to this user
    const [monitor, dep] = await Promise.all([
      this.prisma.monitor.findFirst({ where: { id: monitorId, userId } }),
      this.prisma.monitor.findFirst({ where: { id: dependsOnId, userId } }),
    ]);
    if (!monitor) throw new NotFoundException('Monitor not found');
    if (!dep) throw new NotFoundException('Dependency monitor not found');

    // Prevent circular dependency: check if dependsOnId already depends on monitorId
    const circular = await this.prisma.monitorDependency.findFirst({
      where: { monitorId: dependsOnId, dependsOnId: monitorId },
    });
    if (circular) {
      throw new BadRequestException('Circular dependency detected');
    }

    const result = await this.prisma.monitorDependency.upsert({
      where: { monitorId_dependsOnId: { monitorId, dependsOnId } },
      create: { monitorId, dependsOnId },
      update: {},
      include: { dependsOn: { select: { id: true, name: true, type: true, target: true } } },
    });

    return result;
  }

  /**
   * Remove a dependency from a monitor.
   * @param userId - Authenticated user ID
   * @param monitorId - The dependent monitor
   * @param dependsOnId - The dependency to remove
   */
  async removeDependency(userId: string, monitorId: string, dependsOnId: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    await this.prisma.monitorDependency.deleteMany({
      where: { monitorId, dependsOnId },
    });
    return { ok: true };
  }

  /**
   * Calculates SLO error budget consumption for a monitor.
   * Shows how much of the allowed downtime budget has been used, burn rates, and projected exhaustion.
   * @param monitorId - The monitor to calculate error budget for
   * @param userId - The authenticated user's ID
   * @param opts - { slaTarget: number (0–100), period: string (e.g. '30d') }
   * @returns Error budget stats including consumed %, burn rates, and projected exhaustion date
   * @throws NotFoundException if monitor not found or not owned by user
   */
  async getErrorBudget(
    monitorId: string,
    userId: string,
    opts: { slaTarget: number; period: string },
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    // Parse period string (e.g. '30d' → 30 days)
    const periodMatch = opts.period.match(/^(\d+)d$/);
    const periodDays = periodMatch ? parseInt(periodMatch[1], 10) : 30;
    const totalMinutes = periodDays * 24 * 60;

    const slaTarget = Math.min(100, Math.max(0, opts.slaTarget));
    const allowedDownPct = (100 - slaTarget) / 100; // e.g. 0.001 for 99.9%
    const allowedDownMinutes = totalMinutes * allowedDownPct;

    const now = new Date();
    const periodStart = new Date(now.getTime() - periodDays * 86_400_000);

    // Query runs for full period (same pattern as monitorUptime)
    const periodRuns = await this.prisma.monitorRun.findMany({
      where: { monitorId, userId, checkedAt: { gte: periodStart } },
      select: { ok: true },
    });

    const totalChecks = periodRuns.length;
    const failedChecks = periodRuns.filter((r) => !r.ok).length;

    // Proportion-based downtime (consistent with monitorUptime uptimePct calculation)
    const actualDownMinutes =
      totalChecks === 0 ? 0 : (failedChecks / totalChecks) * totalMinutes;
    const remainingDownMinutes = Math.max(0, allowedDownMinutes - actualDownMinutes);
    const budgetConsumedPct =
      allowedDownMinutes > 0 ? (actualDownMinutes / allowedDownMinutes) * 100 : 0;
    const budgetRemainingPct = Math.max(0, 100 - budgetConsumedPct);
    const actualUptimePct =
      totalChecks === 0
        ? 100
        : ((totalChecks - failedChecks) / totalChecks) * 100;

    // Burn rate: actual failure fraction / expected failure fraction
    // 1.0 = on track; >1 = burning faster than expected
    const calcBurnRate = (windowRuns: Array<{ ok: boolean }>): number => {
      if (windowRuns.length === 0) return 0;
      const failFrac = windowRuns.filter((r) => !r.ok).length / windowRuns.length;
      if (allowedDownPct === 0) return failFrac === 0 ? 0 : 999;
      return failFrac / allowedDownPct;
    };

    // Query windowed burn rates in parallel
    const [runs1h, runs6h, runs24h] = await Promise.all([
      this.prisma.monitorRun.findMany({
        where: { monitorId, userId, checkedAt: { gte: new Date(now.getTime() - 3_600_000) } },
        select: { ok: true },
      }),
      this.prisma.monitorRun.findMany({
        where: { monitorId, userId, checkedAt: { gte: new Date(now.getTime() - 6 * 3_600_000) } },
        select: { ok: true },
      }),
      this.prisma.monitorRun.findMany({
        where: { monitorId, userId, checkedAt: { gte: new Date(now.getTime() - 24 * 3_600_000) } },
        select: { ok: true },
      }),
    ]);

    const burnRate = calcBurnRate(periodRuns);
    const burnRate1h = calcBurnRate(runs1h);
    const burnRate6h = calcBurnRate(runs6h);
    const burnRate24h = calcBurnRate(runs24h);

    // Status thresholds
    let status: 'healthy' | 'warning' | 'critical' | 'exhausted';
    if (budgetConsumedPct >= 100) status = 'exhausted';
    else if (budgetConsumedPct > 80) status = 'critical';
    else if (budgetConsumedPct >= 50) status = 'warning';
    else status = 'healthy';

    // Projected exhaustion date (uses 24h burn rate as the most recent signal)
    let projectedExhaustionDate: string | null = null;
    const activeBurnRate = burnRate24h > 0 ? burnRate24h : burnRate;
    if (budgetConsumedPct < 100 && activeBurnRate > 1 && allowedDownMinutes > 0) {
      const remainingBudgetFraction = budgetRemainingPct / 100;
      const minutesToExhaust = (remainingBudgetFraction * totalMinutes) / activeBurnRate;
      projectedExhaustionDate = new Date(
        now.getTime() + minutesToExhaust * 60_000,
      ).toISOString();
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const round3 = (n: number) => Math.round(n * 1000) / 1000;

    return {
      monitorId,
      period: opts.period,
      slaTarget,
      totalMinutes,
      allowedDownMinutes: round2(allowedDownMinutes),
      actualDownMinutes: round2(actualDownMinutes),
      remainingDownMinutes: round2(remainingDownMinutes),
      budgetConsumedPct: round2(budgetConsumedPct),
      budgetRemainingPct: round2(budgetRemainingPct),
      actualUptimePct: round3(actualUptimePct),
      burnRate: round2(burnRate),
      burnRate1h: round2(burnRate1h),
      burnRate6h: round2(burnRate6h),
      burnRate24h: round2(burnRate24h),
      status,
      projectedExhaustionDate,
    };
  }

  // ─── Monitor Events (Annotations) ────────────────────────────────────────

  /**
   * List events/annotations for a monitor, newest first (max 100).
   * @param userId - The requesting user
   * @param monitorId - The monitor to fetch events for
   */
  async listEvents(userId: string, monitorId: string) {
    // Verify ownership
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');
    return this.prisma.monitorEvent.findMany({
      where: { monitorId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, message: true, eventType: true, createdAt: true, userId: true },
    });
  }

  /**
   * Create a new event/annotation on a monitor timeline.
   * @param userId - The user creating the event
   * @param monitorId - The monitor to annotate
   * @param message - Short annotation label
   * @param eventType - Type of event for color-coding
   */
  async createEvent(userId: string, monitorId: string, message: string, eventType = 'note') {
    // Verify ownership
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');
    return this.prisma.monitorEvent.create({
      data: { monitorId, userId, message, eventType },
      select: { id: true, message: true, eventType: true, createdAt: true, userId: true },
    });
  }

  /**
   * Delete an event/annotation. Only the event creator or monitor owner can delete.
   * @param userId - The requesting user
   * @param monitorId - The monitor that owns the event
   * @param eventId - The event to delete
   */
  async deleteEvent(userId: string, monitorId: string, eventId: string) {
    const event = await this.prisma.monitorEvent.findUnique({
      where: { id: eventId },
      select: { id: true, monitorId: true, userId: true },
    });
    if (!event || event.monitorId !== monitorId) {
      throw new NotFoundException('Event not found');
    }
    // Verify the user owns the monitor
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');
    await this.prisma.monitorEvent.delete({ where: { id: eventId } });
    return { ok: true };
  }

  /**
   * Check if any of the monitor's dependencies are currently down.
   * Used by alert logic to suppress alerts during parent outages.
   * @param monitorId - The monitor to check
   * @returns true if any dependency is currently unhealthy
   */
  async hasDependencyDown(monitorId: string): Promise<boolean> {
    const deps = await this.prisma.monitorDependency.findMany({
      where: { monitorId },
      select: { dependsOnId: true },
    });

    if (!deps.length) return false;

    for (const { dependsOnId } of deps) {
      const lastRun = await this.prisma.monitorRun.findFirst({
        where: { monitorId: dependsOnId },
        orderBy: { checkedAt: 'desc' },
        select: { ok: true },
      });
      if (lastRun && !lastRun.ok) {
        return true;
      }
    }

    return false;
  }

  // ─── Monitor Health Score ──────────────────────────────────────────────────

  /**
   * Computes a composite health score (0–100) for a monitor.
   *
   * Formula breakdown (100 pts total):
   *   - Uptime       40 pts  — 7-day uptime % (linear from 90%→100%)
   *   - Latency      20 pts  — P95 latency trend: current 7d vs prior 7d
   *   - SLA          20 pts  — Error budget consumption against slaTarget
   *   - Streak       20 pts  — Days since last downtime event
   *
   * Grade thresholds: A 85–100, B 70–84, C 50–69, D 25–49, F 0–24
   *
   * @param userId    - The authenticated user's ID
   * @param monitorId - The monitor to score
   * @returns { score, grade, breakdown }
   * @throws NotFoundException if monitor not found or not owned by user
   */
  async getHealthScore(
    userId: string,
    monitorId: string,
  ): Promise<{
    score: number;
    grade: string;
    breakdown: {
      uptime: number;
      latency: number;
      sla: number;
      streak: number;
    };
  }> {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
      select: {
        id: true,
        type: true,
        slaTarget: true,
        slaPeriodDays: true,
        slaBreachAlertedAt: true,
      },
    });
    if (!monitor) throw new NotFoundException('monitor not found');

    const now = new Date();
    const window7d = 7 * 86_400_000;
    const since14d = new Date(now.getTime() - 2 * window7d);

    // Fetch 14d of run data (ok + latencyMs + checkedAt)
    const allRuns = await this.prisma.monitorRun.findMany({
      where: { monitorId, userId, checkedAt: { gte: since14d } },
      orderBy: { checkedAt: 'asc' },
      select: { ok: true, latencyMs: true, checkedAt: true },
    });

    const boundary7d = new Date(now.getTime() - window7d);
    const recentRuns = allRuns.filter((r) => r.checkedAt >= boundary7d);
    const priorRuns = allRuns.filter((r) => r.checkedAt < boundary7d);

    // ── 1. Uptime score (40 pts) ─────────────────────────────────────────────
    // Linear mapping: 90% → 0 pts, 100% → 40 pts
    let uptimeScore = 40;
    if (recentRuns.length > 0) {
      const uptimePct =
        (recentRuns.filter((r) => r.ok).length / recentRuns.length) * 100;
      // Below 90% = 0, 90–100% = linear scale
      const clamped = Math.max(0, uptimePct - 90);
      uptimeScore = Math.round((clamped / 10) * 40);
    }

    // ── 2. Latency trend score (20 pts) ──────────────────────────────────────
    // Version monitors (GIT_RELEASE, DOCKER_IMAGE) have no latency → full pts
    const isVersionMonitor =
      monitor.type === 'GIT_RELEASE' || monitor.type === 'DOCKER_IMAGE';

    let latencyScore = 20;
    if (!isVersionMonitor) {
      const p95 = (runs: Array<{ latencyMs: number | null }>): number | null => {
        const values = runs
          .map((r) => r.latencyMs)
          .filter((v): v is number => v !== null)
          .sort((a, b) => a - b);
        if (values.length === 0) return null;
        const idx = Math.ceil(values.length * 0.95) - 1;
        return values[Math.max(0, idx)];
      };

      const recentP95 = p95(recentRuns);
      const priorP95 = p95(priorRuns);

      if (recentP95 !== null && priorP95 !== null && priorP95 > 0) {
        const changePct = ((recentP95 - priorP95) / priorP95) * 100;
        if (changePct > 50) {
          latencyScore = 0; // major degradation
        } else if (changePct > 10) {
          latencyScore = 10; // slight degradation
        } else {
          latencyScore = 20; // stable / improving
        }
      } else if (recentP95 === null) {
        latencyScore = 20; // no data → full pts
      }
    }

    // ── 3. SLA compliance score (20 pts) ─────────────────────────────────────
    // If no slaTarget configured → full pts
    let slaScore = 20;
    if (monitor.slaTarget !== null && monitor.slaTarget !== undefined) {
      const slaTarget = monitor.slaTarget;
      const allowedDownPct = (100 - slaTarget) / 100;
      const totalChecks = recentRuns.length;
      const failedChecks = recentRuns.filter((r) => !r.ok).length;
      const actualDownPct =
        totalChecks === 0 ? 0 : failedChecks / totalChecks;

      if (allowedDownPct <= 0) {
        // Target is 100% uptime
        slaScore = failedChecks === 0 ? 20 : 0;
      } else {
        const budgetConsumedPct = (actualDownPct / allowedDownPct) * 100;
        if (budgetConsumedPct >= 100) {
          slaScore = 0; // breached
        } else if (budgetConsumedPct >= 50) {
          slaScore = 10; // 50% consumed
        } else {
          slaScore = 20; // within budget
        }
      }
    }

    // ── 4. Incident-free streak score (20 pts) ────────────────────────────────
    // Find last downtime event (ok=false) in the 14d window; check current status
    let streakScore = 20;
    const lastFailRun = [...allRuns]
      .reverse()
      .find((r) => !r.ok);

    const lastRun = allRuns[allRuns.length - 1] ?? null;
    const isCurrentlyDown = lastRun !== null && !lastRun.ok;

    if (isCurrentlyDown) {
      streakScore = 0;
    } else if (lastFailRun) {
      const daysSinceFail =
        (now.getTime() - lastFailRun.checkedAt.getTime()) / 86_400_000;
      if (daysSinceFail >= 7) {
        streakScore = 20;
      } else if (daysSinceFail >= 3) {
        streakScore = 10;
      } else {
        streakScore = 5;
      }
    }
    // else: no failures found → 20 pts (already set)

    // ── Final score + grade ───────────────────────────────────────────────────
    const score = uptimeScore + latencyScore + slaScore + streakScore;

    let grade: string;
    if (score >= 85) grade = 'A';
    else if (score >= 70) grade = 'B';
    else if (score >= 50) grade = 'C';
    else if (score >= 25) grade = 'D';
    else grade = 'F';

    return {
      score,
      grade,
      breakdown: {
        uptime: uptimeScore,
        latency: latencyScore,
        sla: slaScore,
        streak: streakScore,
      },
    };
  }

  /**
   * Returns health scores for all monitors belonging to the user,
   * plus an aggregate summary (average, count per grade).
   *
   * @param userId - The authenticated user's ID
   * @returns { scores: [...], overall: { avg, a, b, c, d, f } }
   */
  async getHealthSummary(userId: string): Promise<{
    scores: Array<{ monitorId: string; name: string; score: number; grade: string }>;
    overall: { avg: number; a: number; b: number; c: number; d: number; f: number };
  }> {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      select: { id: true, name: true },
    });

    const scores = await Promise.all(
      monitors.map(async (m) => {
        try {
          const hs = await this.getHealthScore(userId, m.id);
          return { monitorId: m.id, name: m.name, score: hs.score, grade: hs.grade };
        } catch {
          return { monitorId: m.id, name: m.name, score: 0, grade: 'F' };
        }
      }),
    );

    const gradeCount = { a: 0, b: 0, c: 0, d: 0, f: 0 };
    for (const s of scores) {
      const g = s.grade.toLowerCase() as keyof typeof gradeCount;
      gradeCount[g] = (gradeCount[g] ?? 0) + 1;
    }

    const avg =
      scores.length === 0
        ? 0
        : Math.round((scores.reduce((sum, s) => sum + s.score, 0) / scores.length) * 10) / 10;

    return { scores, overall: { avg, ...gradeCount } };
  }
}
