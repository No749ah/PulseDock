import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CronExpressionParser } from 'cron-parser';
import { PrismaService } from '../common/prisma.service';
import type { MonitorType } from '../types';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { VersionDetectionService } from './version-detection.service';

@Injectable()
export class MonitorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checksService: ChecksService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeEvents,
    private readonly versionDetection: VersionDetectionService,
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
        acknowledgements: { where: { clearedAt: null }, take: 1 },
      },
    });

    return monitors.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.name,
      description: m.description,
      runbookUrl: m.runbookUrl,
      type: m.type,
      target: m.target,
      intervalSec: m.intervalSec,
      timeoutMs: m.timeoutMs,
      confirmations: m.confirmations,
      retryCount: m.retryCount,
      config: this.sanitizeConfig((m.configJson as Record<string, unknown> | null) ?? {}, m.type as MonitorType),
      alertChannelIds: m.monitorAlerts.map((ma) => ma.alertChannelId),
      alertChannels: m.monitorAlerts.map((ma) => ({ id: ma.alertChannelId, name: ma.alertChannel.name, type: ma.alertChannel.type, notifyOn: ma.notifyOn })),
      folderId: m.folderId,
      tags: m.monitorTags.map((mt) => ({ id: mt.tag.id, name: mt.tag.name, color: mt.tag.color })),
      enabled: m.enabled,
      slaTarget: m.slaTarget,
      slaPeriodDays: m.slaPeriodDays,
      slaBreachAlertedAt: m.slaBreachAlertedAt?.toISOString() ?? null,
      autoIncident: m.autoIncident,
      autoIncidentSeverity: m.autoIncidentSeverity,
      activeAutoIncidentId: m.activeAutoIncidentId,
      isFlapping: m.isFlapping,
      flapDetectionEnabled: m.flapDetectionEnabled,
      flapWindow: m.flapWindow,
      flapThreshold: m.flapThreshold,
      flapAlertedAt: m.flapAlertedAt?.toISOString() ?? null,
      pausedUntil: m.pausedUntil?.toISOString() ?? null,
      mutedUntil: m.mutedUntil?.toISOString() ?? null,
      latencyAlertMs: m.latencyAlertMs ?? null,
      anomalyDetection: m.anomalyDetection,
      anomalyMultiplier: m.anomalyMultiplier,
      cronExpression: m.cronExpression ?? null,
      scheduleEnabled: m.scheduleEnabled,
      scheduleDays: m.scheduleDays,
      scheduleStartHour: m.scheduleStartHour,
      scheduleEndHour: m.scheduleEndHour,
      sliLatencyTarget: m.sliLatencyTarget ?? null,
      sliLatencyWindow: m.sliLatencyWindow,
      shareToken: m.shareToken ?? null,
      trackedHeaders: (m as typeof m & { trackedHeaders?: string | null }).trackedHeaders ?? null,
      headerBaseline: (m as typeof m & { headerBaseline?: unknown }).headerBaseline ?? null,
      headerBaselineSetAt: (m as typeof m & { headerBaselineSetAt?: Date | null }).headerBaselineSetAt?.toISOString() ?? null,
      statusWebhookUrl: (m as typeof m & { statusWebhookUrl?: string | null }).statusWebhookUrl ?? null,
      isAcknowledged: (m as typeof m & { acknowledgements?: unknown[] }).acknowledgements?.length > 0,

      createdAt: m.createdAt.toISOString(),
    }));
  }

  /**
   * Returns a single monitor by ID with full detail including mute state, active acknowledgement, and tags.
   * @param userId - The authenticated user's ID
   * @param monitorId - The monitor ID to retrieve
   */
  async getOne(userId: string, monitorId: string) {
    const m = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
      include: {
        monitorAlerts: { include: { alertChannel: { select: { id: true, name: true, type: true } } } },
        monitorTags: { include: { tag: true } },
        runs: { take: 1, orderBy: { checkedAt: 'desc' } },
        acknowledgements: { where: { clearedAt: null }, take: 1, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!m) throw new NotFoundException('monitor not found');

    return {
      id: m.id,
      userId: m.userId,
      name: m.name,
      description: m.description,
      runbookUrl: m.runbookUrl,
      type: m.type,
      target: m.target,
      intervalSec: m.intervalSec,
      timeoutMs: m.timeoutMs,
      confirmations: m.confirmations,
      retryCount: m.retryCount,
      config: this.sanitizeConfig((m.configJson as Record<string, unknown> | null) ?? {}, m.type as MonitorType),
      alertChannelIds: m.monitorAlerts.map((ma) => ma.alertChannelId),
      alertChannels: m.monitorAlerts.map((ma) => ({ id: ma.alertChannelId, name: ma.alertChannel.name, type: ma.alertChannel.type, notifyOn: ma.notifyOn })),
      folderId: m.folderId,
      tags: m.monitorTags.map((mt) => ({ id: mt.tag.id, name: mt.tag.name, color: mt.tag.color })),
      enabled: m.enabled,
      slaTarget: m.slaTarget,
      slaPeriodDays: m.slaPeriodDays,
      slaBreachAlertedAt: m.slaBreachAlertedAt?.toISOString() ?? null,
      autoIncident: m.autoIncident,
      autoIncidentSeverity: m.autoIncidentSeverity,
      activeAutoIncidentId: m.activeAutoIncidentId,
      isFlapping: m.isFlapping,
      flapDetectionEnabled: m.flapDetectionEnabled,
      flapWindow: m.flapWindow,
      flapThreshold: m.flapThreshold,
      flapAlertedAt: m.flapAlertedAt?.toISOString() ?? null,
      pausedUntil: m.pausedUntil?.toISOString() ?? null,
      mutedUntil: m.mutedUntil?.toISOString() ?? null,
      latencyAlertMs: m.latencyAlertMs ?? null,
      isAcknowledged: m.acknowledgements.length > 0,
      activeAck: m.acknowledgements[0] ? {
        id: m.acknowledgements[0].id,
        note: m.acknowledgements[0].note,
        acknowledgedAt: m.acknowledgements[0].acknowledgedAt.toISOString(),
      } : null,
      anomalyDetection: m.anomalyDetection,
      anomalyMultiplier: m.anomalyMultiplier,
      cronExpression: m.cronExpression ?? null,
      scheduleEnabled: m.scheduleEnabled,
      scheduleDays: m.scheduleDays,
      scheduleStartHour: m.scheduleStartHour,
      scheduleEndHour: m.scheduleEndHour,
      shareToken: m.shareToken ?? null,
      trackedHeaders: (m as typeof m & { trackedHeaders?: string | null }).trackedHeaders ?? null,
      headerBaseline: (m as typeof m & { headerBaseline?: unknown }).headerBaseline ?? null,
      headerBaselineSetAt: (m as typeof m & { headerBaselineSetAt?: Date | null }).headerBaselineSetAt?.toISOString() ?? null,
      statusWebhookUrl: (m as typeof m & { statusWebhookUrl?: string | null }).statusWebhookUrl ?? null,
      createdAt: m.createdAt.toISOString(),
    };
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
    runbookUrl?: string;
    target: string;
    type: MonitorType;
    intervalSec?: number;
    timeoutMs?: number;
    confirmations?: number;
    retryCount?: number;
    config?: Record<string, unknown>;
    alertChannelIds?: string[];
    folderId?: string | null;
    tags?: string[];
    enabled?: boolean;
    slaTarget?: number;
    slaPeriodDays?: number;
    autoIncident?: boolean;
    autoIncidentSeverity?: string;
    flapDetectionEnabled?: boolean;
    flapWindow?: number;
    flapThreshold?: number;
    latencyAlertMs?: number | null;
    anomalyDetection?: boolean;
    anomalyMultiplier?: number;
    cronExpression?: string | null;
    scheduleEnabled?: boolean;
    scheduleDays?: string;
    scheduleStartHour?: number;
    scheduleEndHour?: number;
    sliLatencyTarget?: number;
    sliLatencyWindow?: number;
    trackedHeaders?: string | null;
    rtoMinutes?: number | null;
    statusWebhookSecret?: string | null;
    statusWebhookUrl?: string | null;
  }) {
    // Validate cron expression if provided
    if (body.cronExpression) {
      try {
        CronExpressionParser.parse(body.cronExpression, { tz: 'UTC' });
      } catch {
        throw new BadRequestException(`Invalid cron expression: "${body.cronExpression}". Expected 5-field cron (e.g. "*/5 * * * *").`);
      }
    }

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
        runbookUrl: body.runbookUrl ?? null,
        target: body.target,
        type: body.type,
        intervalSec: body.intervalSec ?? 60,
        timeoutMs: body.timeoutMs ?? 5000,
        confirmations: Math.max(1, Math.min(10, body.confirmations ?? 1)),
        retryCount: Math.max(0, Math.min(3, body.retryCount ?? 0)),
        configJson: config as Prisma.InputJsonValue,
        enabled: body.enabled ?? true,
        folderId: body.folderId ?? null,
        slaTarget: body.slaTarget ?? null,
        slaPeriodDays: body.slaPeriodDays ?? null,
        sliLatencyTarget: body.sliLatencyTarget ?? null,
        sliLatencyWindow: body.sliLatencyWindow ?? 7,
        autoIncident: body.autoIncident ?? false,
        autoIncidentSeverity: body.autoIncidentSeverity ?? 'MEDIUM',
        flapDetectionEnabled: body.flapDetectionEnabled ?? true,
        flapWindow: body.flapWindow ?? 10,
        flapThreshold: body.flapThreshold ?? 0.5,
        latencyAlertMs: body.latencyAlertMs ?? null,
        anomalyDetection: body.anomalyDetection ?? false,
        anomalyMultiplier: body.anomalyMultiplier ?? 2.0,
        cronExpression: body.cronExpression ?? null,
        scheduleEnabled: body.scheduleEnabled ?? false,
        scheduleDays: body.scheduleDays ?? '1,2,3,4,5',
        scheduleStartHour: body.scheduleStartHour ?? 8,
        scheduleEndHour: body.scheduleEndHour ?? 18,
        ...(body.trackedHeaders !== undefined ? { trackedHeaders: body.trackedHeaders ?? null } : {}),
        ...(body.rtoMinutes !== undefined ? { rtoMinutes: body.rtoMinutes ?? null } : {}),
        ...(body.statusWebhookUrl !== undefined ? { statusWebhookUrl: body.statusWebhookUrl ?? null } : {}),
        ...(body.statusWebhookSecret !== undefined ? { statusWebhookSecret: body.statusWebhookSecret ?? null } : {}),
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
      description: created.description,
      runbookUrl: created.runbookUrl,
      type: created.type,
      target: created.target,
      intervalSec: created.intervalSec,
      timeoutMs: created.timeoutMs,
      confirmations: created.confirmations,
      retryCount: created.retryCount,
      config: this.sanitizeConfig((created.configJson as Record<string, unknown> | null) ?? {}, created.type as MonitorType),
      alertChannelIds: body.alertChannelIds ?? [],
      folderId: created.folderId,
      tags: createdTags,
      enabled: created.enabled,
      slaTarget: created.slaTarget,
      slaPeriodDays: created.slaPeriodDays,
      slaBreachAlertedAt: created.slaBreachAlertedAt?.toISOString() ?? null,
      autoIncident: created.autoIncident,
      autoIncidentSeverity: created.autoIncidentSeverity,
      activeAutoIncidentId: created.activeAutoIncidentId,
      isFlapping: created.isFlapping,
      flapDetectionEnabled: created.flapDetectionEnabled,
      flapWindow: created.flapWindow,
      flapThreshold: created.flapThreshold,
      flapAlertedAt: created.flapAlertedAt?.toISOString() ?? null,
      latencyAlertMs: created.latencyAlertMs ?? null,
      anomalyDetection: created.anomalyDetection,
      anomalyMultiplier: created.anomalyMultiplier,
      cronExpression: created.cronExpression ?? null,
      scheduleEnabled: created.scheduleEnabled,
      scheduleDays: created.scheduleDays,
      scheduleStartHour: created.scheduleStartHour,
      scheduleEndHour: created.scheduleEndHour,
      sliLatencyTarget: created.sliLatencyTarget ?? null,
      sliLatencyWindow: created.sliLatencyWindow,
      trackedHeaders: (created as typeof created & { trackedHeaders?: string | null }).trackedHeaders ?? null,
      statusWebhookUrl: (created as typeof created & { statusWebhookUrl?: string | null }).statusWebhookUrl ?? null,
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
    runbookUrl?: string | null;
    target?: string;
    type?: MonitorType;
    intervalSec?: number;
    timeoutMs?: number;
    confirmations?: number;
    retryCount?: number;
    config?: Record<string, unknown>;
    alertChannelIds?: string[];
    folderId?: string | null;
    enabled?: boolean;
    tags?: string[];
    slaTarget?: number | null;
    slaPeriodDays?: number | null;
    autoIncident?: boolean;
    autoIncidentSeverity?: string;
    flapDetectionEnabled?: boolean;
    flapWindow?: number;
    flapThreshold?: number;
    latencyAlertMs?: number | null;
    anomalyDetection?: boolean;
    anomalyMultiplier?: number;
    cronExpression?: string | null;
    scheduleEnabled?: boolean;
    scheduleDays?: string;
    scheduleStartHour?: number;
    scheduleEndHour?: number;
    sliLatencyTarget?: number | null;
    sliLatencyWindow?: number;
    trackedHeaders?: string | null;
    rtoMinutes?: number | null;
    statusWebhookSecret?: string | null;
    statusWebhookUrl?: string | null;
  }) {
    // Validate cron expression if provided
    if (body.cronExpression) {
      try {
        CronExpressionParser.parse(body.cronExpression, { tz: 'UTC' });
      } catch {
        throw new BadRequestException(`Invalid cron expression: "${body.cronExpression}". Expected 5-field cron (e.g. "*/5 * * * *").`);
      }
    }

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
        ...(body.runbookUrl !== undefined ? { runbookUrl: body.runbookUrl } : {}),
        target: body.target ?? current.target,
        type: body.type ?? current.type,
        intervalSec: body.intervalSec ?? current.intervalSec,
        timeoutMs: body.timeoutMs ?? current.timeoutMs,
        confirmations: body.confirmations !== undefined ? Math.max(1, Math.min(10, body.confirmations)) : current.confirmations,
        retryCount: body.retryCount !== undefined ? Math.max(0, Math.min(3, body.retryCount)) : current.retryCount,
        configJson: mergedConfig as Prisma.InputJsonValue,
        folderId: body.folderId === undefined ? current.folderId : body.folderId,
        enabled: body.enabled ?? current.enabled,
        ...(body.slaTarget !== undefined ? { slaTarget: body.slaTarget } : {}),
        ...(body.slaPeriodDays !== undefined ? { slaPeriodDays: body.slaPeriodDays } : {}),
        ...(body.autoIncident !== undefined ? { autoIncident: body.autoIncident } : {}),
        ...(body.autoIncidentSeverity !== undefined ? { autoIncidentSeverity: body.autoIncidentSeverity } : {}),
        ...(body.flapDetectionEnabled !== undefined ? { flapDetectionEnabled: body.flapDetectionEnabled } : {}),
        ...(body.flapWindow !== undefined ? { flapWindow: body.flapWindow } : {}),
        ...(body.flapThreshold !== undefined ? { flapThreshold: body.flapThreshold } : {}),
        ...(body.latencyAlertMs !== undefined ? { latencyAlertMs: body.latencyAlertMs } : {}),
        ...(body.anomalyDetection !== undefined ? { anomalyDetection: body.anomalyDetection } : {}),
        ...(body.anomalyMultiplier !== undefined ? { anomalyMultiplier: body.anomalyMultiplier } : {}),
        ...(body.cronExpression !== undefined ? { cronExpression: body.cronExpression } : {}),
        ...(body.scheduleEnabled !== undefined ? { scheduleEnabled: body.scheduleEnabled } : {}),
        ...(body.scheduleDays !== undefined ? { scheduleDays: body.scheduleDays } : {}),
        ...(body.scheduleStartHour !== undefined ? { scheduleStartHour: body.scheduleStartHour } : {}),
        ...(body.scheduleEndHour !== undefined ? { scheduleEndHour: body.scheduleEndHour } : {}),
        ...(body.sliLatencyTarget !== undefined ? { sliLatencyTarget: body.sliLatencyTarget } : {}),
        ...(body.sliLatencyWindow !== undefined ? { sliLatencyWindow: body.sliLatencyWindow } : {}),
        ...(body.trackedHeaders !== undefined ? { trackedHeaders: body.trackedHeaders ?? null } : {}),
        ...(body.rtoMinutes !== undefined ? { rtoMinutes: body.rtoMinutes ?? null } : {}),
        ...(body.statusWebhookUrl !== undefined ? { statusWebhookUrl: body.statusWebhookUrl ?? null } : {}),
        ...(body.statusWebhookSecret !== undefined ? { statusWebhookSecret: body.statusWebhookSecret ?? null } : {}),
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
   * Clones a monitor: creates a copy with the same config, alert channels, and tags.
   * The clone is created as disabled to avoid accidental alerting, with "Copy of <name>".
   * @param userId - The authenticated user's ID
   * @param monitorId - The source monitor ID to clone
   * @returns The newly created monitor clone
   */
  async clone(userId: string, monitorId: string) {
    const source = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
      include: {
        monitorAlerts: true,
        monitorTags: true,
      },
    });
    if (!source) throw new NotFoundException('monitor not found');

    const cloned = await this.prisma.monitor.create({
      data: {
        userId,
        name: `Copy of ${source.name}`,
        description: source.description,
        runbookUrl: source.runbookUrl,
        type: source.type,
        target: source.target,
        intervalSec: source.intervalSec,
        timeoutMs: source.timeoutMs,
        confirmations: source.confirmations,
        retryCount: source.retryCount,
        configJson: source.configJson ?? Prisma.DbNull,
        enabled: false, // start disabled — user enables when ready
        folderId: source.folderId,
        slaTarget: source.slaTarget,
        slaPeriodDays: source.slaPeriodDays,
        autoIncident: source.autoIncident,
        autoIncidentSeverity: source.autoIncidentSeverity,
        flapDetectionEnabled: source.flapDetectionEnabled,
        flapWindow: source.flapWindow,
        flapThreshold: source.flapThreshold,
        latencyAlertMs: source.latencyAlertMs,
        anomalyDetection: source.anomalyDetection,
        anomalyMultiplier: source.anomalyMultiplier,
        monitorAlerts: {
          create: source.monitorAlerts.map((a) => ({
            alertChannelId: a.alertChannelId,
            notifyOn: a.notifyOn,
          })),
        },
        monitorTags: {
          create: source.monitorTags.map((t) => ({ tagId: t.tagId })),
        },
      },
      include: {
        monitorAlerts: { include: { alertChannel: { select: { id: true, name: true, type: true } } } },
        monitorTags: { include: { tag: true } },
      },
    });

    await this.audit.log('monitor.clone', userId, userId, { sourceId: monitorId, cloneId: cloned.id });
    this.realtime.monitorCreated(userId, { id: cloned.id, name: cloned.name });

    return {
      id: cloned.id,
      userId: cloned.userId,
      name: cloned.name,
      description: cloned.description,
      runbookUrl: cloned.runbookUrl,
      type: cloned.type,
      target: cloned.target,
      intervalSec: cloned.intervalSec,
      timeoutMs: cloned.timeoutMs,
      confirmations: cloned.confirmations,
      retryCount: cloned.retryCount,
      config: this.sanitizeConfig((cloned.configJson as Record<string, unknown> | null) ?? {}, cloned.type as MonitorType),
      alertChannelIds: (cloned as typeof cloned & { monitorAlerts?: { alertChannelId: string; notifyOn: string; alertChannel: { name: string; type: string } }[] }).monitorAlerts?.map((ma) => ma.alertChannelId) ?? [],
      alertChannels: (cloned as typeof cloned & { monitorAlerts?: { alertChannelId: string; notifyOn: string; alertChannel: { id?: string; name: string; type: string } }[] }).monitorAlerts?.map((ma) => ({ id: ma.alertChannelId, name: ma.alertChannel.name, type: ma.alertChannel.type, notifyOn: ma.notifyOn })) ?? [],
      folderId: cloned.folderId,
      tags: (cloned as typeof cloned & { monitorTags?: { tag: { id: string; name: string; color: string } }[] }).monitorTags?.map((mt) => ({ id: mt.tag.id, name: mt.tag.name, color: mt.tag.color })) ?? [],
      enabled: cloned.enabled,
      slaTarget: cloned.slaTarget,
      slaPeriodDays: cloned.slaPeriodDays,
      slaBreachAlertedAt: null,
      autoIncident: cloned.autoIncident,
      autoIncidentSeverity: cloned.autoIncidentSeverity,
      activeAutoIncidentId: null,
      isFlapping: false,
      flapDetectionEnabled: cloned.flapDetectionEnabled,
      flapWindow: cloned.flapWindow,
      flapThreshold: cloned.flapThreshold,
      flapAlertedAt: null,
      pausedUntil: null,
      mutedUntil: null,
      latencyAlertMs: cloned.latencyAlertMs ?? null,
      isAcknowledged: false,
      anomalyDetection: cloned.anomalyDetection,
      anomalyMultiplier: cloned.anomalyMultiplier,
      createdAt: cloned.createdAt.toISOString(),
    };
  }

  /**
   * Performs a bulk action (enable, disable, delete, or run) on multiple monitors.
   * Verifies ownership of all IDs before executing; silently skips unowned IDs.
   * @param userId - The authenticated user's ID
   * @param ids - Array of monitor IDs to act on
   * @param action - One of: 'enable' | 'disable' | 'delete' | 'run'
   * @returns { ok, affected } with count of successfully processed monitors
   */
  async bulkAction(userId: string, ids: string[], action: 'enable' | 'disable' | 'delete' | 'run' | 'add-tag' | 'remove-tag' | 'update-interval' | 'update-timeout' | 'update-confirmations' | 'pause', tagId?: string, value?: number) {
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

    // Bulk update interval / timeout / confirmations
    if (action === 'update-interval' && value !== undefined) {
      const safeValue = Math.max(10, Math.min(86400, Math.round(value)));
      await this.prisma.monitor.updateMany({ where: { id: { in: ownedIds }, userId }, data: { intervalSec: safeValue } });
      await this.audit.log('monitor.bulk_update_interval', userId, userId, { ids: ownedIds, intervalSec: safeValue });
      return { ok: true, affected: ownedIds.length };
    }

    if (action === 'update-timeout' && value !== undefined) {
      const safeValue = Math.max(1000, Math.min(60000, Math.round(value)));
      await this.prisma.monitor.updateMany({ where: { id: { in: ownedIds }, userId }, data: { timeoutMs: safeValue } });
      await this.audit.log('monitor.bulk_update_timeout', userId, userId, { ids: ownedIds, timeoutMs: safeValue });
      return { ok: true, affected: ownedIds.length };
    }

    if (action === 'update-confirmations' && value !== undefined) {
      const safeValue = Math.max(1, Math.min(10, Math.round(value)));
      await this.prisma.monitor.updateMany({ where: { id: { in: ownedIds }, userId }, data: { confirmations: safeValue } });
      await this.audit.log('monitor.bulk_update_confirmations', userId, userId, { ids: ownedIds, confirmations: safeValue });
      return { ok: true, affected: ownedIds.length };
    }

    // Bulk pause: value = duration in minutes (1-1440, default 60)
    if (action === 'pause') {
      const durationMin = value !== undefined ? Math.max(1, Math.min(1440, Math.round(value))) : 60;
      const pausedUntil = new Date(Date.now() + durationMin * 60 * 1000);
      await this.prisma.monitor.updateMany({ where: { id: { in: ownedIds }, userId }, data: { pausedUntil } });
      await this.audit.log('monitor.bulk_pause', userId, userId, { ids: ownedIds, durationMin, pausedUntil: pausedUntil.toISOString() });
      return { ok: true, affected: ownedIds.length };
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
      include: { alertChannel: true, escalationPolicy: { select: { id: true, name: true } } },
    });

    return assignments.map((a) => ({
      // Legacy flat fields for backward compatibility
      id: a.alertChannel.id,
      name: a.alertChannel.name,
      type: a.alertChannel.type,
      config: (a.alertChannel.configJson as Record<string, unknown>) ?? {},
      createdAt: a.alertChannel.createdAt.toISOString(),
      notifyOn: a.notifyOn,
      // Nested shape expected by frontend
      alertChannelId: a.alertChannelId,
      alertChannel: { id: a.alertChannel.id, name: a.alertChannel.name, type: a.alertChannel.type },
      // Escalation
      escalationPolicyId: a.escalationPolicyId ?? null,
      escalationPolicy: a.escalationPolicy ? { id: a.escalationPolicy.id, name: a.escalationPolicy.name } : null,
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
  /**
   * Assigns or clears an escalation policy for a monitor alert channel link.
   * @param userId - The authenticated user's ID
   * @param monitorId - The monitor ID
   * @param channelId - The alert channel ID
   * @param policyId - The escalation policy ID, or null to clear
   */
  async updateMonitorAlertEscalationPolicy(userId: string, monitorId: string, channelId: string, policyId: string | null) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    if (policyId !== null) {
      const policy = await this.prisma.escalationPolicy.findFirst({ where: { id: policyId, userId } });
      if (!policy) throw new NotFoundException('escalation policy not found');
    }

    await this.prisma.monitorAlert.update({
      where: { monitorId_alertChannelId: { monitorId, alertChannelId: channelId } },
      data: { escalationPolicyId: policyId },
    });

    await this.audit.log('monitor.alert.escalation_set', userId, userId, { monitorId, channelId, policyId });
    return { ok: true };
  }

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
      retryCount: monitor.retryCount,
      config: (monitor.configJson as Record<string, unknown> | null) ?? {},
      alertChannelIds: [],
      folderId: monitor.folderId,
      enabled: monitor.enabled,
      description: monitor.description ?? null,
      runbookUrl: monitor.runbookUrl ?? null,
      createdAt: monitor.createdAt.toISOString(),
      slaTarget: monitor.slaTarget ?? null,
      slaPeriodDays: monitor.slaPeriodDays ?? null,
      slaBreachAlertedAt: monitor.slaBreachAlertedAt ? monitor.slaBreachAlertedAt.toISOString() : null,
      autoIncident: monitor.autoIncident,
      autoIncidentSeverity: monitor.autoIncidentSeverity,
      activeAutoIncidentId: monitor.activeAutoIncidentId,
      isFlapping: monitor.isFlapping,
      flapDetectionEnabled: monitor.flapDetectionEnabled,
      flapWindow: monitor.flapWindow,
      flapThreshold: monitor.flapThreshold,
      flapAlertedAt: monitor.flapAlertedAt?.toISOString() ?? null,
      pausedUntil: (monitor as typeof monitor & { pausedUntil?: Date | null }).pausedUntil?.toISOString() ?? null,
      mutedUntil: monitor.mutedUntil?.toISOString() ?? null,
      latencyAlertMs: (monitor as typeof monitor & { latencyAlertMs?: number | null }).latencyAlertMs ?? null,
      anomalyDetection: (monitor as typeof monitor & { anomalyDetection?: boolean }).anomalyDetection ?? false,
      anomalyMultiplier: (monitor as typeof monitor & { anomalyMultiplier?: number }).anomalyMultiplier ?? 2.0,
      sliLatencyTarget: monitor.sliLatencyTarget ?? null,
      sliLatencyWindow: monitor.sliLatencyWindow,
      scheduleEnabled: (monitor as typeof monitor & { scheduleEnabled?: boolean }).scheduleEnabled ?? false,
      scheduleDays: (monitor as typeof monitor & { scheduleDays?: string }).scheduleDays ?? '1,2,3,4,5',
      scheduleStartHour: (monitor as typeof monitor & { scheduleStartHour?: number }).scheduleStartHour ?? 8,
      scheduleEndHour: (monitor as typeof monitor & { scheduleEndHour?: number }).scheduleEndHour ?? 18,
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
  async monitorRuns(
    userId: string,
    monitorId: string,
    opts?: { limit?: string; before?: string; status?: string },
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    const take = Math.min(500, Math.max(1, parseInt(opts?.limit ?? '100', 10) || 100));

    // Build filter
    const where: {
      userId: string;
      monitorId: string;
      checkedAt?: { lt: Date };
      ok?: boolean;
    } = { userId, monitorId };

    if (opts?.before) {
      const d = new Date(opts.before);
      if (!isNaN(d.getTime())) where.checkedAt = { lt: d };
    }

    if (opts?.status === 'ok') { where.ok = true; (where as Record<string, unknown>)['level'] = 'green'; }
    else if (opts?.status === 'failed') where.ok = false;
    else if (opts?.status === 'degraded') { where.ok = true; (where as Record<string, unknown>)['level'] = 'yellow'; }

    const runs = await this.prisma.monitorRun.findMany({
      where,
      orderBy: { checkedAt: 'desc' },
      take: take + 1, // fetch one extra to determine hasMore
    });

    const hasMore = runs.length > take;
    const page = hasMore ? runs.slice(0, take) : runs;

    return {
      runs: page.map((r) => ({
        id: r.id,
        monitorId: r.monitorId,
        checkedAt: r.checkedAt.toISOString(),
        ok: r.ok,
        statusCode: r.status,
        latencyMs: r.latencyMs,
        message: r.message,
        level: r.level as 'green' | 'yellow' | 'red',
        responseBody: r.responseBody ?? null,
        timings: (r as typeof r & { timingsJson?: unknown }).timingsJson ?? null,
        securityAuditJson: (r as typeof r & { securityAuditJson?: unknown }).securityAuditJson ?? null,
        responseSizeBytes: (r as typeof r & { responseSizeBytes?: number | null }).responseSizeBytes ?? null,
        redirectChain: (r as typeof r & { redirectChain?: string[] }).redirectChain ?? [],
      })),
      hasMore,
      total: await this.prisma.monitorRun.count({ where: { userId, monitorId, ...(opts?.status === 'ok' ? { ok: true, level: 'green' } : opts?.status === 'failed' ? { ok: false } : opts?.status === 'degraded' ? { ok: true, level: 'yellow' } : {}) } }),
      nextCursor: hasMore ? page[page.length - 1]?.checkedAt.toISOString() : null,
    };
  }

  /**
   * Exports all check run history for a monitor as a CSV string.
   * Returns up to 10,000 most recent runs (newest first).
   * @param userId - The authenticated user's ID
   * @param monitorId - The monitor to export runs for
   * @returns Object with csv string and filename for Content-Disposition header
   * @throws NotFoundException if monitor not found or not owned by user
   */
  async exportMonitorRuns(userId: string, monitorId: string): Promise<{ csv: string; filename: string; monitorName: string }> {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    const runs = await this.prisma.monitorRun.findMany({
      where: { userId, monitorId },
      orderBy: { checkedAt: 'desc' },
      take: 10_000,
    });

    const header = ['id', 'checkedAt', 'ok', 'statusCode', 'latencyMs', 'level', 'message', 'dnsMs', 'tcpMs', 'tlsMs', 'ttfbMs', 'downloadMs', 'responseSizeBytes', 'responseBody'].join(',');
    const rows = runs.map((r) => {
      const msg = (r.message ?? '').replace(/"/g, '""'); // escape quotes
      const body = (r.responseBody ?? '').replace(/"/g, '""');
      const timings = r.timingsJson as { dnsMs?: number | null; tcpMs?: number | null; tlsMs?: number | null; ttfbMs?: number | null; downloadMs?: number | null } | null;
      const sizeBytes = (r as typeof r & { responseSizeBytes?: number | null }).responseSizeBytes ?? '';
      return [
        r.id,
        r.checkedAt.toISOString(),
        r.ok ? '1' : '0',
        r.status ?? '',
        r.latencyMs ?? '',
        r.level ?? '',
        `"${msg}"`,
        timings?.dnsMs ?? '',
        timings?.tcpMs ?? '',
        timings?.tlsMs ?? '',
        timings?.ttfbMs ?? '',
        timings?.downloadMs ?? '',
        sizeBytes,
        body ? `"${body}"` : '',
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    const safeName = monitor.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const dateStr = new Date().toISOString().slice(0, 10);
    return { csv, filename: `pulsedock-runs-${safeName}-${dateStr}.csv`, monitorName: monitor.name };
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

    // RTO analysis: for each incident with a known duration, check if it breached the RTO target
    let rtoBreaches = 0;
    let rtoCompliant = 0;
    const rto = (monitor as typeof monitor & { rtoMinutes?: number | null }).rtoMinutes ?? null;
    if (rto !== null && rto > 0) {
      for (const incident of incidents) {
        if (incident.durationSec > 0) {
          const durationMin = incident.durationSec / 60;
          if (durationMin > rto) {
            rtoBreaches++;
          } else {
            rtoCompliant++;
          }
        }
      }
    }
    const rtoTotal = rtoBreaches + rtoCompliant;
    const rtoCompliancePct = rto !== null && rtoTotal > 0 ? Math.round((rtoCompliant / rtoTotal) * 100) : null;

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
      rtoMinutes: rto,
      rtoBreaches,
      rtoCompliant,
      rtoCompliancePct,
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

  // ── Version detection delegation ────────────────────────────────────────────

  async testVersionConnection(input: { provider: 'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'maven' | 'helm'; target: string; token?: string; host?: string }) {
    return this.versionDetection.testVersionConnection(input);
  }

  async discoverCurrentVersion(input: { provider: 'github' | 'gitlab' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'maven' | 'helm'; target: string; token?: string; host?: string; appUrl?: string; appToken?: string; appVersionEndpoint?: string; appAuthType?: 'none' | 'token' | 'openvpn'; openvpnUsername?: string; openvpnPassword?: string; endpointFallbacks?: string[]; jsonPath?: string; jsonPathExtractors?: string[] }) {
    return this.versionDetection.discoverCurrentVersion(input);
  }

  async versionSummary(userId: string) {
    return this.versionDetection.versionSummary(userId);
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

  /**
   * Returns the SLO/SLI report for a given monitor.
   * Includes uptime SLO, latency SLI (if configured), and error budget overview.
   */
  async getSloReport(userId: string, monitorId: string) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    const periodDays = monitor.slaPeriodDays ?? 30;
    const slaTarget = monitor.slaTarget ?? 99.9;
    const now = new Date();
    const from = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // --- Uptime SLO ---
    const uptimeRuns = await this.prisma.monitorRun.findMany({
      where: { monitorId, checkedAt: { gte: from } },
      select: { ok: true, checkedAt: true },
    });

    const totalChecks = uptimeRuns.length;
    const okChecks = uptimeRuns.filter((r) => r.ok).length;
    const failedChecks = totalChecks - okChecks;
    const actualUptime = totalChecks === 0 ? 100 : (okChecks / totalChecks) * 100;

    const periodMinutes = periodDays * 24 * 60;
    const uptimeBudgetMinutes = ((100 - slaTarget) / 100) * periodMinutes;
    const uptimeBurnedMinutes = totalChecks === 0 ? 0 : (failedChecks / totalChecks) * periodMinutes;
    const uptimeRemainingMinutes = uptimeBudgetMinutes - uptimeBurnedMinutes;
    const uptimeBurnRate = uptimeBudgetMinutes === 0 ? 0 : uptimeBurnedMinutes / uptimeBudgetMinutes;

    let uptimeStatus: 'ok' | 'warning' | 'breached';
    if (actualUptime < slaTarget) {
      uptimeStatus = 'breached';
    } else if (uptimeRemainingMinutes < uptimeBudgetMinutes * 0.1) {
      uptimeStatus = 'warning';
    } else {
      uptimeStatus = 'ok';
    }

    // --- Latency SLI ---
    let latencyResult: {
      target: number;
      p50: number;
      p95: number;
      p99: number;
      status: 'ok' | 'warning' | 'breached';
      window: number;
      totalChecks: number;
      exceedingChecks: number;
    } | null = null;

    let latencyBudgetPct = 5.0;
    let latencyBurnedPct = 0;
    let latencyBurnRate = 0;

    if (monitor.sliLatencyTarget) {
      const latencyWindow = monitor.sliLatencyWindow ?? 7;
      const latencyFrom = new Date(now.getTime() - latencyWindow * 24 * 60 * 60 * 1000);

      const latencyRuns = await this.prisma.monitorRun.findMany({
        where: { monitorId, checkedAt: { gte: latencyFrom }, latencyMs: { not: null } },
        select: { latencyMs: true },
        orderBy: { latencyMs: 'asc' },
      });

      const latencies = latencyRuns.map((r) => r.latencyMs as number).sort((a, b) => a - b);
      const latTotal = latencies.length;

      const getPercentile = (arr: number[], pct: number): number => {
        if (arr.length === 0) return 0;
        const idx = Math.ceil((pct / 100) * arr.length) - 1;
        return arr[Math.max(0, Math.min(idx, arr.length - 1))];
      };

      const p50 = getPercentile(latencies, 50);
      const p95 = getPercentile(latencies, 95);
      const p99 = getPercentile(latencies, 99);
      const exceedingChecks = latencies.filter((l) => l >= monitor.sliLatencyTarget!).length;

      let latencyStatus: 'ok' | 'warning' | 'breached';
      if (p95 >= monitor.sliLatencyTarget) {
        latencyStatus = 'breached';
      } else if (p95 >= monitor.sliLatencyTarget * 0.85) {
        latencyStatus = 'warning';
      } else {
        latencyStatus = 'ok';
      }

      latencyBudgetPct = 5.0;
      latencyBurnedPct = latTotal === 0 ? 0 : (exceedingChecks / latTotal) * 100;
      latencyBurnRate = latencyBudgetPct === 0 ? 0 : latencyBurnedPct / latencyBudgetPct;

      latencyResult = {
        target: monitor.sliLatencyTarget,
        p50,
        p95,
        p99,
        status: latencyStatus,
        window: latencyWindow,
        totalChecks: latTotal,
        exceedingChecks,
      };
    }

    // --- Overall Health ---
    let overallHealth: 'ok' | 'warning' | 'breached';
    if (uptimeStatus === 'breached' || (latencyResult && latencyResult.status === 'breached')) {
      overallHealth = 'breached';
    } else if (uptimeStatus === 'warning' || (latencyResult && latencyResult.status === 'warning')) {
      overallHealth = 'warning';
    } else {
      overallHealth = 'ok';
    }

    return {
      monitorId,
      period: {
        days: periodDays,
        from: from.toISOString(),
        to: now.toISOString(),
      },
      uptime: {
        target: slaTarget,
        actual: Math.round(actualUptime * 10000) / 10000,
        status: uptimeStatus,
        totalChecks,
        failedChecks,
        remainingBudgetMinutes: Math.round(uptimeRemainingMinutes * 100) / 100,
      },
      ...(latencyResult ? { latency: latencyResult } : {}),
      errorBudget: {
        uptimeBudgetMinutes: Math.round(uptimeBudgetMinutes * 100) / 100,
        uptimeBurnedMinutes: Math.round(uptimeBurnedMinutes * 100) / 100,
        uptimeBurnRate: Math.round(uptimeBurnRate * 100) / 100,
        latencyBudgetPct: Math.round(latencyBudgetPct * 100) / 100,
        latencyBurnedPct: Math.round(latencyBurnedPct * 100) / 100,
        latencyBurnRate: Math.round(latencyBurnRate * 100) / 100,
        overallHealth,
      },
    };
  }

  /**
   * Returns a lightweight SLO summary for all monitors with an SLA target set.
   * Used on the dashboard to show overall SLO health at a glance.
   */
  async getSloSummary(userId: string) {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId, slaTarget: { not: null } },
      select: {
        id: true,
        name: true,
        type: true,
        slaTarget: true,
        slaPeriodDays: true,
        sliLatencyTarget: true,
        sliLatencyWindow: true,
      },
    });

    if (monitors.length === 0) {
      return { monitors: [], summary: { total: 0, ok: 0, warning: 0, breached: 0 } };
    }

    const now = new Date();
    const results = await Promise.all(
      monitors.map(async (m) => {
        try {
          const periodDays = m.slaPeriodDays ?? 30;
          const slaTarget = m.slaTarget ?? 99.9;
          const from = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

          const runs = await this.prisma.monitorRun.findMany({
            where: { monitorId: m.id, checkedAt: { gte: from } },
            select: { ok: true },
          });

          const totalChecks = runs.length;
          const okChecks = runs.filter((r) => r.ok).length;
          const actualUptime = totalChecks === 0 ? 100 : (okChecks / totalChecks) * 100;

          const periodMinutes = periodDays * 24 * 60;
          const budgetMinutes = ((100 - slaTarget) / 100) * periodMinutes;
          const burnedMinutes = totalChecks === 0 ? 0 : ((totalChecks - okChecks) / totalChecks) * periodMinutes;
          const budgetRemainingPct = budgetMinutes === 0 ? 100 : Math.max(0, ((budgetMinutes - burnedMinutes) / budgetMinutes) * 100);

          let status: 'ok' | 'warning' | 'breached';
          if (actualUptime < slaTarget) {
            status = 'breached';
          } else if (budgetRemainingPct < 10) {
            status = 'warning';
          } else {
            status = 'ok';
          }

          return {
            monitorId: m.id,
            name: m.name,
            type: m.type,
            slaTarget,
            periodDays,
            actualUptime: Math.round(actualUptime * 10000) / 10000,
            totalChecks,
            status,
            budgetRemainingPct: Math.round(budgetRemainingPct * 10) / 10,
            hasLatencySli: m.sliLatencyTarget != null,
          };
        } catch {
          return null;
        }
      }),
    );

    const valid = results.filter((r): r is NonNullable<typeof r> => r !== null);
    const summary = {
      total: valid.length,
      ok: valid.filter((r) => r.status === 'ok').length,
      warning: valid.filter((r) => r.status === 'warning').length,
      breached: valid.filter((r) => r.status === 'breached').length,
    };

    return { monitors: valid, summary };
  }

  // ─── Latency Distribution ────────────────────────────────────────────────

  async getLatencyDistribution(
    userId: string,
    monitorId: string,
    period: '24h' | '7d' | '30d' = '7d',
  ) {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
      select: { id: true },
    });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const periodMs: Record<string, number> = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };
    const rangeMs = periodMs[period] ?? periodMs['7d'];
    const since = new Date(Date.now() - rangeMs);

    const allRuns = await this.prisma.monitorRun.findMany({
      where: { monitorId, userId, checkedAt: { gte: since } },
      select: { ok: true, latencyMs: true, checkedAt: true },
      orderBy: { checkedAt: 'asc' },
    });

    const totalChecks = allRuns.length;
    const successRuns = allRuns.filter((r) => r.ok && r.latencyMs !== null);
    const successChecks = successRuns.length;

    const latencies = successRuns.map((r) => r.latencyMs as number);
    latencies.sort((a, b) => a - b);

    // Buckets
    const bucketDefs: Array<{ rangeLabel: string; from: number; to: number }> = [
      { rangeLabel: '0-50ms', from: 0, to: 50 },
      { rangeLabel: '50-100ms', from: 50, to: 100 },
      { rangeLabel: '100-200ms', from: 100, to: 200 },
      { rangeLabel: '200-500ms', from: 200, to: 500 },
      { rangeLabel: '500-1s', from: 500, to: 1000 },
      { rangeLabel: '1-2s', from: 1000, to: 2000 },
      { rangeLabel: '2-5s', from: 2000, to: 5000 },
      { rangeLabel: '5s+', from: 5000, to: Infinity },
    ];

    const buckets = bucketDefs.map((b) => {
      const count = latencies.filter((l) => l >= b.from && l < b.to).length;
      const pct = successChecks === 0 ? 0 : Math.round((count / successChecks) * 1000) / 10;
      return { rangeLabel: b.rangeLabel, from: b.from, to: b.to === Infinity ? -1 : b.to, count, pct };
    });

    // Percentiles
    function percentile(sorted: number[], p: number): number | null {
      if (sorted.length === 0) return null;
      const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
      return sorted[idx];
    }

    const percentiles = {
      p50: percentile(latencies, 50),
      p75: percentile(latencies, 75),
      p90: percentile(latencies, 90),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    };

    // Hourly avg (0-23 UTC)
    const hourlyBuckets: Array<number[]> = Array.from({ length: 24 }, () => []);
    for (const run of successRuns) {
      const hour = (run.checkedAt as Date).getUTCHours();
      hourlyBuckets[hour].push(run.latencyMs as number);
    }

    const hourlyAvg = hourlyBuckets.map((vals, hour) => {
      if (vals.length === 0) return { hour, avgMs: null, p95Ms: null, count: 0 };
      const sorted = [...vals].sort((a, b) => a - b);
      const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
      const p95Idx = Math.max(0, Math.ceil(0.95 * sorted.length) - 1);
      return { hour, avgMs: avg, p95Ms: sorted[p95Idx], count: vals.length };
    });

    const checkedRangeMap: Record<string, string> = {
      '24h': 'Last 24 hours',
      '7d': 'Last 7 days',
      '30d': 'Last 30 days',
    };

    return {
      buckets,
      percentiles,
      hourlyAvg,
      totalChecks,
      successChecks,
      checkedRange: checkedRangeMap[period] ?? 'Last 7 days',
    };
  }

  /**
   * Returns a period-over-period comparison for a monitor's latency and uptime.
   * Compares the current period (last N days) against the prior period (same length before that).
   * @param userId - The authenticated user's ID
   * @param monitorId - The monitor to compare
   * @param period - Comparison window: '24h' | '7d' | '30d'
   */
  async getPeriodComparison(userId: string, monitorId: string, period: '24h' | '7d' | '30d' = '7d') {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId }, select: { id: true } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const periodMs: Record<string, number> = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };
    const rangeMs = periodMs[period] ?? periodMs['7d'];
    const now = Date.now();
    const currentFrom = new Date(now - rangeMs);
    const priorTo = new Date(now - rangeMs);
    const priorFrom = new Date(now - 2 * rangeMs);

    function computePeriodStats(runs: Array<{ ok: boolean; latencyMs: number | null }>) {
      const total = runs.length;
      const successes = runs.filter((r) => r.ok);
      const uptime = total === 0 ? null : Math.round((successes.length / total) * 10000) / 100;
      const latencies = successes.filter((r) => r.latencyMs !== null).map((r) => r.latencyMs as number).sort((a, b) => a - b);
      const avg = latencies.length === 0 ? null : Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length);
      const p95 = latencies.length === 0 ? null : latencies[Math.max(0, Math.ceil(0.95 * latencies.length) - 1)];
      const p50 = latencies.length === 0 ? null : latencies[Math.max(0, Math.ceil(0.5 * latencies.length) - 1)];
      return { total, successCount: successes.length, uptime, avgMs: avg, p50Ms: p50, p95Ms: p95 };
    }

    const [currentRuns, priorRuns] = await Promise.all([
      this.prisma.monitorRun.findMany({ where: { monitorId, userId, checkedAt: { gte: currentFrom } }, select: { ok: true, latencyMs: true } }),
      this.prisma.monitorRun.findMany({ where: { monitorId, userId, checkedAt: { gte: priorFrom, lt: priorTo } }, select: { ok: true, latencyMs: true } }),
    ]);

    const current = computePeriodStats(currentRuns);
    const prior = computePeriodStats(priorRuns);

    function pctChange(curr: number | null, prev: number | null): number | null {
      if (curr === null || prev === null || prev === 0) return null;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    }

    return {
      period,
      current,
      prior,
      delta: {
        uptimePct: pctChange(current.uptime, prior.uptime),
        avgMsPct: pctChange(current.avgMs, prior.avgMs),
        p95MsPct: pctChange(current.p95Ms, prior.p95Ms),
      },
    };
  }

  // ─── Status Transitions ───────────────────────────────────────────────────

  /**
   * Returns a list of status transition events for a monitor over a given period.
   * Each transition represents a change in health level (e.g. green → red, red → green).
   * Useful for post-mortem analysis and incident root-cause investigation.
   *
   * @param userId    - Authenticated user ID (ownership check)
   * @param monitorId - Monitor ID
   * @param period    - Lookback window: 24h | 7d | 30d (default 7d)
   * @returns List of transitions + summary stats (total outages, total downtime, MTTR, MTBF)
   */
  async getStatusTransitions(
    userId: string,
    monitorId: string,
    period: '24h' | '7d' | '30d' = '7d',
  ) {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
      select: { id: true, name: true },
    });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const periodMs: Record<string, number> = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };
    const rangeMs = periodMs[period] ?? periodMs['7d'];
    const since = new Date(Date.now() - rangeMs);

    // Load all runs in period, ordered oldest→newest
    const runs = await this.prisma.monitorRun.findMany({
      where: { monitorId, userId, checkedAt: { gte: since } },
      select: { ok: true, level: true, message: true, latencyMs: true, checkedAt: true },
      orderBy: { checkedAt: 'asc' },
    });

    if (runs.length === 0) {
      return {
        transitions: [],
        summary: { totalOutages: 0, totalDowntimeSec: 0, avgRecoveryTimeSec: null, mtbfSec: null },
        period,
        totalRuns: 0,
      };
    }

    // Walk the run list and detect level changes
    type Transition = {
      from: string;
      to: string;
      at: string;
      message: string | null;
      latencyMs: number | null;
      durationSec: number | null; // duration in previous state
    };

    const transitions: Transition[] = [];
    let prevLevel = runs[0].level ?? (runs[0].ok ? 'green' : 'red');
    let prevAt = new Date(runs[0].checkedAt).getTime();

    for (let i = 1; i < runs.length; i++) {
      const run = runs[i];
      const currentLevel = run.level ?? (run.ok ? 'green' : 'red');
      const currentAt = new Date(run.checkedAt).getTime();

      if (currentLevel !== prevLevel) {
        transitions.push({
          from: prevLevel,
          to: currentLevel,
          at: new Date(currentAt).toISOString(),
          message: run.message ?? null,
          latencyMs: run.latencyMs ?? null,
          durationSec: Math.round((currentAt - prevAt) / 1000),
        });
        prevLevel = currentLevel;
        prevAt = currentAt;
      }
    }

    // Summary stats
    const outageTransitions = transitions.filter((t) => t.from === 'green' && t.to !== 'green');
    const recoveryTransitions = transitions.filter((t) => t.from !== 'green' && t.to === 'green');

    const totalOutages = outageTransitions.length;

    // Total downtime: sum of durations of non-green → green transitions
    const totalDowntimeSec = recoveryTransitions.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);

    const avgRecoveryTimeSec = recoveryTransitions.length > 0
      ? Math.round(totalDowntimeSec / recoveryTransitions.length)
      : null;

    // MTBF: time between outage starts
    let mtbfSec: number | null = null;
    if (outageTransitions.length >= 2) {
      const outageTimestamps = outageTransitions.map((t) => new Date(t.at).getTime());
      let intervalSum = 0;
      for (let i = 1; i < outageTimestamps.length; i++) {
        intervalSum += outageTimestamps[i] - outageTimestamps[i - 1];
      }
      mtbfSec = Math.round(intervalSum / (outageTimestamps.length - 1) / 1000);
    }

    const checkedRangeMap: Record<string, string> = {
      '24h': 'Last 24 hours',
      '7d': 'Last 7 days',
      '30d': 'Last 30 days',
    };

    return {
      transitions,
      summary: { totalOutages, totalDowntimeSec, avgRecoveryTimeSec, mtbfSec },
      period,
      checkedRange: checkedRangeMap[period] ?? 'Last 7 days',
      totalRuns: runs.length,
      currentStatus: prevLevel,
    };
  }

  // ─── Bulk Create from URL List ────────────────────────────────────────────

  /**
   * Bulk-creates HTTP monitors from a list of URLs.
   * Validates each URL, derives a name from the hostname, deduplicates by target.
   *
   * @param userId  - Authenticated user ID
   * @param body    - { urls, folderId?, alertChannelIds?, intervalSec? }
   * @returns       { created, skipped, errors }
   */
  async bulkCreateFromUrls(
    userId: string,
    body: {
      urls: string[];
      folderId?: string;
      alertChannelIds?: string[];
      intervalSec?: number;
    },
  ): Promise<{ created: number; skipped: number; errors: Array<{ url: string; error: string }> }> {
    let created = 0;
    let skipped = 0;
    const errors: Array<{ url: string; error: string }> = [];

    for (const rawUrl of body.urls) {
      const url = rawUrl.trim();
      if (!url) continue;

      // Validate URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          errors.push({ url, error: 'Only HTTP/HTTPS URLs are supported' });
          continue;
        }
      } catch {
        errors.push({ url, error: 'Invalid URL' });
        continue;
      }

      // Derive name from hostname
      const name = parsedUrl.hostname;

      // Deduplicate: skip if a monitor with the same target already exists for this user
      const existing = await this.prisma.monitor.findFirst({
        where: { userId, target: url },
        select: { id: true },
      });

      if (existing) {
        skipped++;
        continue;
      }

      try {
        await this.create(userId, {
          name,
          target: url,
          type: 'HTTP',
          intervalSec: body.intervalSec ?? 60,
          alertChannelIds: body.alertChannelIds ?? [],
          folderId: body.folderId ?? null,
        });
        created++;
      } catch (err) {
        errors.push({ url, error: err instanceof Error ? err.message : 'Failed to create monitor' });
      }
    }

    return { created, skipped, errors };
  }

  // ─── Response Diff ────────────────────────────────────────────────────────

  /**
   * Returns the response bodies of a failing run and the most recent passing run before it.
   *
   * @param userId    - Authenticated user ID (ownership check)
   * @param monitorId - Monitor ID
   * @param runId     - ID of the failing run
   * @param baseRunId - (optional) explicit base run ID; if omitted, finds the most recent OK run before the failing run
   */
  async getResponseDiff(
    userId: string,
    monitorId: string,
    runId: string,
    baseRunId?: string,
  ): Promise<{
    failedBody: string | null;
    baseBody: string | null;
    runId: string;
    baseRunId: string | null;
  }> {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
      select: { id: true },
    });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const failedRun = await this.prisma.monitorRun.findFirst({
      where: { id: runId, monitorId, userId },
      select: { id: true, ok: true, checkedAt: true, responseBody: true },
    });
    if (!failedRun) throw new NotFoundException('Run not found');

    let resolvedBaseRunId: string | null = null;
    let baseBody: string | null = null;

    if (baseRunId) {
      const baseRun = await this.prisma.monitorRun.findFirst({
        where: { id: baseRunId, monitorId, userId },
        select: { id: true, responseBody: true },
      });
      if (baseRun) {
        resolvedBaseRunId = baseRun.id;
        baseBody = baseRun.responseBody ?? null;
      }
    } else {
      // Find most recent OK run before the failing run that has a responseBody
      const baseRun = await this.prisma.monitorRun.findFirst({
        where: {
          monitorId,
          userId,
          ok: true,
          responseBody: { not: null },
          checkedAt: { lt: failedRun.checkedAt },
        },
        orderBy: { checkedAt: 'desc' },
        select: { id: true, responseBody: true },
      });
      if (baseRun) {
        resolvedBaseRunId = baseRun.id;
        baseBody = baseRun.responseBody ?? null;
      }
    }

    return {
      failedBody: failedRun.responseBody ?? null,
      baseBody,
      runId: failedRun.id,
      baseRunId: resolvedBaseRunId,
    };
  }

  /**
   * Toggle the pinned state of a monitor. Pinned monitors appear at the top of the list.
   * @throws NotFoundException if monitor not found or not owned by the user
   */
  async togglePin(userId: string, monitorId: string): Promise<{ pinned: boolean }> {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');
    const updated = await this.prisma.monitor.update({
      where: { id: monitorId },
      data: { pinned: !monitor.pinned },
    });
    return { pinned: updated.pinned };
  }

  /**
   * Returns a SSL / TLS certificate inventory for all SSL_CERT and HTTP monitors.
   * Parses days-remaining from the latest run message for SSL_CERT monitors.
   * HTTP monitors return certificate details live on the `/certificate` endpoint;
   * here we only return their latest run status.
   *
   * @param userId - Owner's user ID
   */
  async getSslSummary(userId: string): Promise<{
    total: number;
    expired: number;
    critical: number;
    warning: number;
    healthy: number;
    certs: Array<{
      monitorId: string;
      name: string;
      target: string;
      type: string;
      enabled: boolean;
      folderId: string | null;
      folderName: string | null;
      status: string;
      daysRemaining: number | null;
      expiresAt: string | null;
      lastCheckedAt: string | null;
      lastMessage: string;
      level: string;
    }>;
  }> {
    // Fetch all SSL_CERT + HTTP monitors
    const monitors = await this.prisma.monitor.findMany({
      where: { userId, type: { in: ['SSL_CERT', 'HTTP', 'BROWSER'] } },
      select: {
        id: true,
        name: true,
        target: true,
        type: true,
        enabled: true,
        folderId: true,
        folder: { select: { name: true } },
        runs: {
          orderBy: { checkedAt: 'desc' },
          take: 1,
          select: { level: true, message: true, checkedAt: true, ok: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const daysRemainingRegex = /expires?\s+in\s+(\d+)\s*days?/i;
    const expiresAtRegex = /\((\d{4}-\d{2}-\d{2})\)/;
    const expiredRegex = /expired?\s+(\d+)\s*days?\s*ago/i;

    const certs = monitors.map((m) => {
      const latestRun = m.runs[0] ?? null;
      const message = latestRun?.message ?? '';
      const level = latestRun?.level ?? 'unknown';

      let daysRemaining: number | null = null;
      let expiresAt: string | null = null;

      if (m.type === 'SSL_CERT') {
        // Try to parse days from message like "SSL cert expires in 42 days (2025-12-31)"
        const daysMatch = daysRemainingRegex.exec(message);
        if (daysMatch) daysRemaining = parseInt(daysMatch[1], 10);

        const expiredMatch = expiredRegex.exec(message);
        if (expiredMatch) daysRemaining = -parseInt(expiredMatch[1], 10);

        const dateMatch = expiresAtRegex.exec(message);
        if (dateMatch) expiresAt = dateMatch[1];

        // If level is red and no days parsed, assume expired/unknown
        if (daysRemaining === null && level === 'red' && message.toLowerCase().includes('expir')) {
          daysRemaining = 0;
        }
      }

      return {
        monitorId: m.id,
        name: m.name,
        target: m.target,
        type: m.type,
        enabled: m.enabled,
        folderId: m.folderId,
        folderName: m.folder?.name ?? null,
        status: latestRun?.ok ? 'up' : latestRun ? 'down' : 'unknown',
        daysRemaining,
        expiresAt,
        lastCheckedAt: latestRun?.checkedAt?.toISOString() ?? null,
        lastMessage: message,
        level,
      };
    });

    // Sort: expired first, then by daysRemaining ascending (soonest first), then unknown, then HTTP without days
    certs.sort((a, b) => {
      const aHasDays = a.daysRemaining !== null;
      const bHasDays = b.daysRemaining !== null;
      if (aHasDays && bHasDays) return (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0);
      if (aHasDays) return -1;
      if (bHasDays) return 1;
      return a.name.localeCompare(b.name);
    });

    const sslCerts = certs.filter((c) => c.type === 'SSL_CERT');
    const expired = sslCerts.filter((c) => c.daysRemaining !== null && c.daysRemaining < 0).length;
    const critical = sslCerts.filter((c) => c.daysRemaining !== null && c.daysRemaining >= 0 && c.daysRemaining < 10).length;
    const warning = sslCerts.filter((c) => c.daysRemaining !== null && c.daysRemaining >= 10 && c.daysRemaining <= 30).length;
    const healthy = sslCerts.filter((c) => c.daysRemaining !== null && c.daysRemaining > 30).length;

    return {
      total: certs.length,
      expired,
      critical,
      warning,
      healthy,
      certs,
    };
  }

  /**
   * Returns redirect chain statistics for a monitor based on the last 100 runs.
   */
  async redirectChainStats(userId: string, monitorId: string): Promise<{
    hasRedirects: boolean;
    avgRedirects: number;
    maxRedirects: number;
    commonChains: Array<{ chain: string[]; count: number }>;
  }> {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const runs = await this.prisma.monitorRun.findMany({
      where: { monitorId },
      orderBy: { checkedAt: 'desc' },
      take: 100,
      select: { redirectChain: true },
    });

    const withRedirects = runs.filter(r => (r as typeof r & { redirectChain: string[] }).redirectChain.length > 0);
    if (withRedirects.length === 0) {
      return { hasRedirects: false, avgRedirects: 0, maxRedirects: 0, commonChains: [] };
    }

    const counts: Record<string, { chain: string[]; count: number }> = {};
    for (const r of withRedirects) {
      const chain = (r as typeof r & { redirectChain: string[] }).redirectChain;
      const key = JSON.stringify(chain);
      if (!counts[key]) counts[key] = { chain, count: 0 };
      counts[key].count++;
    }

    const commonChains = Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const totalRedirects = withRedirects.reduce((sum, r) => sum + (r as typeof r & { redirectChain: string[] }).redirectChain.length, 0);
    const maxRedirects = withRedirects.reduce((max, r) => Math.max(max, (r as typeof r & { redirectChain: string[] }).redirectChain.length), 0);

    return {
      hasRedirects: true,
      avgRedirects: Math.round((totalRedirects / withRedirects.length) * 10) / 10,
      maxRedirects,
      commonChains,
    };
  }
}
