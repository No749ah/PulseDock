import * as tls from 'tls';
import * as https from 'https';
import * as http from 'http';
import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CronExpressionParser } from 'cron-parser';
import { PrismaService } from '../common/prisma.service';
import type { MonitorType } from '../types';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { VersionDetectionService } from './version-detection.service';
import type { PlaygroundDto, PlaygroundResult } from './playground.dto';
import { extractByPath } from '../checks/version-extractor.util';

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
      headerAssertions: (m as typeof m & { headerAssertions?: unknown }).headerAssertions ?? null,
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
      headerAssertions: (m as typeof m & { headerAssertions?: unknown }).headerAssertions ?? null,
      throttleMs: (m as typeof m & { throttleMs?: number | null }).throttleMs ?? null,
      maxChecksPerHour: (m as typeof m & { maxChecksPerHour?: number | null }).maxChecksPerHour ?? null,
      geoRegions: (m as typeof m & { geoRegions?: string[] }).geoRegions ?? [],
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
    throttleMs?: number;
    maxChecksPerHour?: number;
    geoRegions?: string[];
    metricPath?: string | null;
    metricName?: string | null;
    metricUnit?: string | null;
    metricAlertMin?: number | null;
    metricAlertMax?: number | null;
    headerAssertions?: Array<{ header: string; op: string; value?: string }> | null;
    graphqlQuery?: string | null;
    graphqlVariables?: string | null;
    graphqlDataPath?: string | null;
    graphqlExpectedValue?: string | null;
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
        ...(body.throttleMs !== undefined ? { throttleMs: body.throttleMs } : {}),
        ...(body.maxChecksPerHour !== undefined ? { maxChecksPerHour: body.maxChecksPerHour } : {}),
        ...(body.geoRegions !== undefined ? { geoRegions: body.geoRegions } : {}),
        ...(body.metricPath !== undefined ? { metricPath: body.metricPath ?? null } : {}),
        ...(body.metricName !== undefined ? { metricName: body.metricName ?? null } : {}),
        ...(body.metricUnit !== undefined ? { metricUnit: body.metricUnit ?? null } : {}),
        ...(body.metricAlertMin !== undefined ? { metricAlertMin: body.metricAlertMin ?? null } : {}),
        ...(body.metricAlertMax !== undefined ? { metricAlertMax: body.metricAlertMax ?? null } : {}),
        ...(body.headerAssertions !== undefined ? { headerAssertions: body.headerAssertions == null ? Prisma.JsonNull : (body.headerAssertions as unknown as Prisma.InputJsonValue) } : {}),
        ...(body.graphqlQuery !== undefined ? { graphqlQuery: body.graphqlQuery ?? null } : {}),
        ...(body.graphqlVariables !== undefined ? { graphqlVariables: body.graphqlVariables ?? null } : {}),
        ...(body.graphqlDataPath !== undefined ? { graphqlDataPath: body.graphqlDataPath ?? null } : {}),
        ...(body.graphqlExpectedValue !== undefined ? { graphqlExpectedValue: body.graphqlExpectedValue ?? null } : {}),
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
    throttleMs?: number | null;
    maxChecksPerHour?: number | null;
    geoRegions?: string[];
    metricPath?: string | null;
    metricName?: string | null;
    metricUnit?: string | null;
    metricAlertMin?: number | null;
    metricAlertMax?: number | null;
    headerAssertions?: Array<{ header: string; op: string; value?: string }> | null;
    graphqlQuery?: string | null;
    graphqlVariables?: string | null;
    graphqlDataPath?: string | null;
    graphqlExpectedValue?: string | null;
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
        ...(body.throttleMs !== undefined ? { throttleMs: body.throttleMs } : {}),
        ...(body.maxChecksPerHour !== undefined ? { maxChecksPerHour: body.maxChecksPerHour } : {}),
        ...(body.geoRegions !== undefined ? { geoRegions: body.geoRegions } : {}),
        ...(body.metricPath !== undefined ? { metricPath: body.metricPath ?? null } : {}),
        ...(body.metricName !== undefined ? { metricName: body.metricName ?? null } : {}),
        ...(body.metricUnit !== undefined ? { metricUnit: body.metricUnit ?? null } : {}),
        ...(body.metricAlertMin !== undefined ? { metricAlertMin: body.metricAlertMin ?? null } : {}),
        ...(body.metricAlertMax !== undefined ? { metricAlertMax: body.metricAlertMax ?? null } : {}),
        ...(body.headerAssertions !== undefined ? { headerAssertions: body.headerAssertions == null ? Prisma.JsonNull : (body.headerAssertions as unknown as Prisma.InputJsonValue) } : {}),
        ...(body.graphqlQuery !== undefined ? { graphqlQuery: body.graphqlQuery ?? null } : {}),
        ...(body.graphqlVariables !== undefined ? { graphqlVariables: body.graphqlVariables ?? null } : {}),
        ...(body.graphqlDataPath !== undefined ? { graphqlDataPath: body.graphqlDataPath ?? null } : {}),
        ...(body.graphqlExpectedValue !== undefined ? { graphqlExpectedValue: body.graphqlExpectedValue ?? null } : {}),
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
  async exportMonitors(userId: string, opts?: { format?: 'json' | 'yaml'; ids?: string[]; includeAlertChannels?: boolean }) {
    // Legacy: called without opts returns plain JSON object for backward compat
    if (!opts || (!opts.format && !opts.ids && !opts.includeAlertChannels)) {
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
    return this.exportMonitorsConfig(userId, {
      format: opts.format ?? 'json',
      ids: opts.ids,
      includeAlertChannels: opts.includeAlertChannels ?? false,
    });
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
   * Bulk edit multiple monitors at once — updates any combination of fields across all selected monitors.
   * Only fields explicitly provided in the body are updated (undefined = skip).
   * @param userId - The authenticated user's ID
   * @param body - IDs + field overrides to apply
   * @returns Count of affected monitors and list of errors per monitor ID
   */
  async bulkEdit(userId: string, body: {
    ids: string[];
    intervalSec?: number;
    timeoutMs?: number;
    confirmations?: number;
    retryCount?: number;
    flapDetectionEnabled?: boolean;
    latencyAlertMs?: number | null;
    slaTarget?: number | null;
    enabled?: boolean;
    folderId?: string | null;
    alertChannelIds?: string[];
  }): Promise<{ ok: boolean; affected: number; errors: Array<{ id: string; error: string }> }> {
    if (!body.ids.length) return { ok: true, affected: 0, errors: [] };

    // Verify ownership
    const monitors = await this.prisma.monitor.findMany({ where: { id: { in: body.ids }, userId }, select: { id: true } });
    const ownedIds = monitors.map((m) => m.id);
    if (!ownedIds.length) return { ok: true, affected: 0, errors: [] };

    // Build the update data — only include fields that were provided
    const data: Record<string, unknown> = {};
    if (body.intervalSec !== undefined) data.intervalSec = Math.max(10, Math.min(86400, body.intervalSec));
    if (body.timeoutMs !== undefined) data.timeoutMs = Math.max(100, Math.min(60000, body.timeoutMs));
    if (body.confirmations !== undefined) data.confirmations = Math.max(1, Math.min(10, body.confirmations));
    if (body.retryCount !== undefined) data.retryCount = Math.max(0, Math.min(3, body.retryCount));
    if (body.flapDetectionEnabled !== undefined) data.flapDetectionEnabled = body.flapDetectionEnabled;
    if (body.latencyAlertMs !== undefined) data.latencyAlertMs = body.latencyAlertMs;
    if (body.slaTarget !== undefined) data.slaTarget = body.slaTarget;
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.folderId !== undefined) data.folderId = body.folderId;

    const errors: Array<{ id: string; error: string }> = [];

    if (Object.keys(data).length > 0) {
      await this.prisma.monitor.updateMany({
        where: { id: { in: ownedIds }, userId },
        data: data as Parameters<typeof this.prisma.monitor.updateMany>[0]['data'],
      });
    }

    // Alert channels require per-monitor updates (replace existing assignments)
    if (body.alertChannelIds !== undefined) {
      for (const monitorId of ownedIds) {
        try {
          await this.prisma.monitorAlert.deleteMany({ where: { monitorId } });
          if (body.alertChannelIds.length > 0) {
            await this.prisma.monitorAlert.createMany({
              data: body.alertChannelIds.map((alertChannelId) => ({ monitorId, alertChannelId })),
            });
          }
        } catch (err) {
          errors.push({ id: monitorId, error: err instanceof Error ? err.message : 'Failed to update alert channels' });
        }
      }
    }

    await this.audit.log('monitor.bulk_edit', userId, userId, {
      ids: ownedIds,
      fields: Object.keys(data),
      alertChannelIds: body.alertChannelIds,
    });

    for (const monitorId of ownedIds) {
      this.realtime.monitorUpdated(userId, { id: monitorId });
    }

    return { ok: true, affected: ownedIds.length, errors };
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
      repeatIntervalMin: a.repeatIntervalMin ?? null,
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
  async addMonitorAlert(userId: string, monitorId: string, channelId: string, notifyOn?: string, repeatIntervalMin?: number) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    const channel = await this.prisma.alertChannel.findFirst({ where: { id: channelId, userId } });
    if (!channel) throw new NotFoundException('alert channel not found');

    // Default notifyOn based on monitor type
    const isVersion = monitor.type === 'GIT_RELEASE' || monitor.type === 'DOCKER_IMAGE';
    const defaultNotifyOn = isVersion ? 'VERSION_ANY' : 'ON_CHANGE';
    const resolvedNotifyOn = notifyOn ?? defaultNotifyOn;

    const repeatVal = (resolvedNotifyOn === 'REPEAT_EVERY_N' && repeatIntervalMin != null)
      ? Math.min(1440, Math.max(1, repeatIntervalMin))
      : null;

    await this.prisma.monitorAlert.upsert({
      where: { monitorId_alertChannelId: { monitorId, alertChannelId: channelId } },
      create: { monitorId, alertChannelId: channelId, notifyOn: resolvedNotifyOn, repeatIntervalMin: repeatVal },
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

    const validValues = ['ON_CHANGE', 'ALWAYS', 'FIRST_ONLY', 'DAILY_DIGEST', 'REPEAT_EVERY_N', 'VERSION_ANY', 'VERSION_MAJOR'];
    if (!validValues.includes(notifyOn)) throw new BadRequestException(`Invalid notifyOn value: ${notifyOn}`);

    await this.prisma.monitorAlert.update({
      where: { monitorId_alertChannelId: { monitorId, alertChannelId: channelId } },
      data: { notifyOn },
    });

    await this.audit.log('monitor.alert.update', userId, userId, { monitorId, channelId, notifyOn });
    return { ok: true };
  }

  /**
   * Updates the repeat interval (minutes) for a REPEAT_EVERY_N channel assignment.
   * @param userId - The authenticated user's ID
   * @param monitorId - The target monitor ID
   * @param channelId - The alert channel ID
   * @param intervalMin - Minutes between repeat alerts (1–1440), or null to use default (30 min)
   */
  async updateMonitorAlertRepeatInterval(userId: string, monitorId: string, channelId: string, intervalMin: number | null) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('monitor not found');

    const clamped = intervalMin != null ? Math.min(1440, Math.max(1, intervalMin)) : null;
    await this.prisma.monitorAlert.update({
      where: { monitorId_alertChannelId: { monitorId, alertChannelId: channelId } },
      data: { repeatIntervalMin: clamped },
    });

    await this.audit.log('monitor.alert.repeat_interval_set', userId, userId, { monitorId, channelId, intervalMin: clamped });
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
        headerAssertionsFailed: (r as typeof r & { headerAssertionsFailed?: unknown }).headerAssertionsFailed ?? null,
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

  async testVersionConnection(input: { provider: 'github' | 'gitlab' | 'forgejo' | 'gitea' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'nuget' | 'rubygems' | 'gem' | 'go' | 'golang' | 'gomod' | 'maven' | 'helm'; target: string; token?: string; host?: string }) {
    return this.versionDetection.testVersionConnection(input);
  }

  async discoverCurrentVersion(input: { provider: 'github' | 'gitlab' | 'forgejo' | 'gitea' | 'docker' | 'apt' | 'npm' | 'pypi' | 'cargo' | 'nuget' | 'rubygems' | 'gem' | 'go' | 'golang' | 'gomod' | 'maven' | 'helm'; target: string; token?: string; host?: string; appUrl?: string; appToken?: string; appVersionEndpoint?: string; appAuthType?: 'none' | 'token' | 'openvpn'; openvpnUsername?: string; openvpnPassword?: string; endpointFallbacks?: string[]; jsonPath?: string; jsonPathExtractors?: string[] }) {
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

  // ─── Export / Import (GitOps) ─────────────────────────────────────────────

  /**
   * Exports monitor configurations as JSON or YAML (GitOps format).
   */
  async exportMonitorsConfig(userId: string, opts: { format: 'json' | 'yaml'; ids?: string[]; includeAlertChannels: boolean }) {
    const where = opts.ids?.length ? { userId, id: { in: opts.ids } } : { userId };
    const monitors = await this.prisma.monitor.findMany({
      where,
      include: {
        monitorAlerts: { include: { alertChannel: { select: { name: true } } } },
        monitorTags: { include: { tag: true } },
        folder: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const exported = monitors.map(m => ({
      name: m.name,
      type: m.type,
      target: m.target,
      intervalSec: m.intervalSec,
      enabled: m.enabled,
      timeoutMs: m.timeoutMs,
      retryCount: m.retryCount ?? 0,
      confirmations: m.confirmations ?? 1,
      tags: m.monitorTags.map((t: { tag: { name: string } }) => t.tag.name),
      folder: m.folder?.name ?? null,
      config: (m.configJson ?? {}) as Record<string, unknown>,
      slaTarget: m.slaTarget ?? null,
      ...(opts.includeAlertChannels && {
        alertChannelNames: m.monitorAlerts.map((ma: { alertChannel: { name: string } }) => ma.alertChannel.name),
      }),
    }));

    const payload = { version: '1', exportedAt: new Date().toISOString(), monitors: exported };
    const dateStr = new Date().toISOString().split('T')[0];

    if (opts.format === 'yaml') {
      const yaml = await import('js-yaml');
      return {
        content: yaml.dump(payload),
        contentType: 'application/yaml',
        filename: `pulsedock-monitors-${dateStr}.yaml`,
      };
    }

    return {
      content: JSON.stringify(payload, null, 2),
      contentType: 'application/json',
      filename: `pulsedock-monitors-${dateStr}.json`,
    };
  }

  /**
   * Imports monitor configurations from a JSON or YAML config string.
   */
  async importMonitorsConfig(userId: string, opts: { format: 'json' | 'yaml'; content: string; dryRun?: boolean; overwriteExisting?: boolean }) {
    let parsed: { version: string; monitors: unknown[] };

    try {
      if (opts.format === 'yaml') {
        const yaml = await import('js-yaml');
        parsed = yaml.load(opts.content) as typeof parsed;
      } else {
        parsed = JSON.parse(opts.content) as typeof parsed;
      }
    } catch {
      throw new BadRequestException('Invalid config format — could not parse JSON/YAML');
    }

    if (!parsed?.monitors || !Array.isArray(parsed.monitors)) {
      throw new BadRequestException('Invalid config: missing monitors array');
    }

    const results: { name: string; id?: string; action: 'created' | 'updated' | 'skipped' | 'error'; error?: string }[] = [];

    for (const raw of parsed.monitors) {
      const m = raw as Record<string, unknown>;
      if (!m.name || !m.type || !m.target) {
        results.push({ name: String(m.name ?? 'unknown'), action: 'error', error: 'Missing required fields: name, type, target' });
        continue;
      }

      const existing = await this.prisma.monitor.findFirst({ where: { userId, name: String(m.name) } });

      if (existing && !opts.overwriteExisting) {
        results.push({ name: String(m.name), id: existing.id, action: 'skipped' });
        continue;
      }

      if (opts.dryRun) {
        results.push({ name: String(m.name), action: existing ? 'updated' : 'created' });
        continue;
      }

      const data = {
        userId,
        name: String(m.name),
        type: String(m.type) as MonitorType,
        target: String(m.target),
        intervalSec: Number(m.intervalSec ?? 60),
        enabled: Boolean(m.enabled ?? true),
        timeoutMs: Number(m.timeoutMs ?? 5000),
        retryCount: Number(m.retryCount ?? 0),
        confirmations: Number(m.confirmations ?? 1),
        slaTarget: m.slaTarget ? Number(m.slaTarget) : null,
        configJson: ((m.config as Record<string, unknown>) ?? {}) as Prisma.InputJsonValue,
      };

      try {
        if (existing && opts.overwriteExisting) {
          const updated = await this.prisma.monitor.update({ where: { id: existing.id }, data });
          results.push({ name: String(m.name), id: updated.id, action: 'updated' });
        } else {
          const created = await this.prisma.monitor.create({ data });
          results.push({ name: String(m.name), id: created.id, action: 'created' });
        }
      } catch (e) {
        results.push({ name: String(m.name), action: 'error', error: e instanceof Error ? e.message : 'Unknown error' });
      }
    }

    return {
      created: results.filter(r => r.action === 'created').length,
      updated: results.filter(r => r.action === 'updated').length,
      skipped: results.filter(r => r.action === 'skipped').length,
      errors: results.filter(r => r.action === 'error').map(r => `${r.name}: ${r.error}`),
      monitors: results,
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

  // ─── Monitor Health Score (v2: uptime/latency/incidents/flapping) ─────────

  /**
   * Computes a 0–100 health score for a single monitor.
   * Components:
   *   - Uptime (50 pts): based on last 24h uptime %
   *   - Latency (30 pts): p95 latency vs 7d baseline
   *   - Incidents (20 pts): deducted per active incident
   *   - Flapping penalty (-15): if monitor.isFlapping
   *
   * Returns null score when no runs in last 24h.
   */
  async healthScore(
    userId: string,
    monitorId: string,
  ): Promise<{
    score: number | null;
    breakdown: { uptime: number; latency: number; incidents: number; flapping: number; total: number } | null;
  }> {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const runs24h = await this.prisma.monitorRun.findMany({
      where: { monitorId, checkedAt: { gte: since24h } },
      select: { ok: true, latencyMs: true },
      orderBy: { checkedAt: 'desc' },
    });

    if (runs24h.length === 0) return { score: null, breakdown: null };

    // Uptime component (50 pts max)
    const okCount = runs24h.filter(r => r.ok).length;
    const uptimePct = (okCount / runs24h.length) * 100;
    const uptimeScore = Math.round((uptimePct / 100) * 50);

    // Latency component (30 pts max)
    const runs7d = await this.prisma.monitorRun.findMany({
      where: { monitorId, checkedAt: { gte: since7d }, latencyMs: { not: null } },
      select: { latencyMs: true },
      orderBy: { checkedAt: 'desc' },
      take: 500,
    });

    let latencyScore = 30;
    if (runs7d.length >= 10) {
      const latencies = runs7d.map(r => r.latencyMs!).sort((a, b) => a - b);
      const p95Idx = Math.floor(latencies.length * 0.95);
      const baselineP95 = latencies[p95Idx] ?? latencies[latencies.length - 1];

      const recent = runs24h.filter(r => r.latencyMs != null).map(r => r.latencyMs!).sort((a, b) => a - b);
      if (recent.length > 0) {
        const recentP95Idx = Math.floor(recent.length * 0.95);
        const recentP95 = recent[recentP95Idx] ?? recent[recent.length - 1];
        if (baselineP95 > 0) {
          const penalty = Math.floor(((recentP95 - baselineP95) / baselineP95) * 30);
          latencyScore = Math.max(0, 30 - Math.max(0, penalty));
        }
      }
    }

    // Incident component (20 pts max)
    const activeIncidents = await this.prisma.incident.count({
      where: {
        userId,
        status: { not: 'RESOLVED' },
        monitors: { some: { monitorId } },
      },
    });
    const incidentScore = Math.max(0, 20 - activeIncidents * 10);

    // Flapping penalty (-15 if flapping)
    const flappingPenalty = monitor.isFlapping ? 15 : 0;

    const total = Math.max(0, Math.min(100, uptimeScore + latencyScore + incidentScore - flappingPenalty));

    return {
      score: total,
      breakdown: { uptime: uptimeScore, latency: latencyScore, incidents: incidentScore, flapping: flappingPenalty === 0 ? 0 : -flappingPenalty, total },
    };
  }

  /**
   * Batch health scores for all monitors belonging to a user.
   * Skips the per-monitor latency computation for performance — gives full 30 pts.
   */
  async allHealthScores(userId: string): Promise<{ monitorId: string; score: number | null }[]> {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      select: { id: true, isFlapping: true },
    });

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const runStats = await this.prisma.monitorRun.groupBy({
      by: ['monitorId'],
      where: { userId, checkedAt: { gte: since24h } },
      _count: { _all: true },
    });

    const okStats = await this.prisma.monitorRun.groupBy({
      by: ['monitorId'],
      where: { userId, checkedAt: { gte: since24h }, ok: true },
      _count: { _all: true },
    });

    const activeIncidentsByMonitor = await this.prisma.incidentMonitor.groupBy({
      by: ['monitorId'],
      where: {
        incident: { userId, status: { not: 'RESOLVED' } },
      },
      _count: { _all: true },
    });

    return monitors.map(m => {
      const total = runStats.find(r => r.monitorId === m.id)?._count._all ?? 0;
      if (total === 0) return { monitorId: m.id, score: null };

      const ok = okStats.find(r => r.monitorId === m.id)?._count._all ?? 0;
      const uptimeScore = Math.round((ok / total) * 50);
      const incidentCount = activeIncidentsByMonitor.find(r => r.monitorId === m.id)?._count._all ?? 0;
      const incidentScore = Math.max(0, 20 - incidentCount * 10);
      const flappingPenalty = m.isFlapping ? 15 : 0;
      // Latency: skip in batch for performance, give full 30 pts
      const score = Math.max(0, Math.min(100, uptimeScore + 30 + incidentScore - flappingPenalty));
      return { monitorId: m.id, score };
    });
  }

  // ─── Uptime Heatmap ───────────────────────────────────────────────────────

  /**
   * Returns a per-monitor × per-day uptime heatmap for the last N days.
   * Each cell has: uptimePct (0-100 | null), total checks, failed checks.
   * Used by the /monitors/heatmap page.
   */
  async uptimeHeatmap(userId: string, days: number): Promise<{
    monitors: Array<{
      id: string;
      name: string;
      type: string;
      folder: string | null;
      days: Array<{ date: string; uptimePct: number | null; total: number; failed: number }>;
    }>;
    dates: string[];
  }> {
    const clampedDays = Math.min(90, Math.max(1, days));

    // Load all uptime monitors for the user
    const monitors = await this.prisma.monitor.findMany({
      where: {
        userId,
        type: { in: ['HTTP', 'TCP', 'SSL_CERT', 'HEARTBEAT', 'DNS', 'PING', 'SMTP', 'BROWSER'] },
      },
      select: { id: true, name: true, type: true, folder: { select: { name: true } } },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'asc' }],
    });

    // Build date list (oldest first, newest last)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const since = new Date(today);
    since.setUTCDate(today.getUTCDate() - clampedDays + 1);

    const dates: string[] = [];
    for (let i = 0; i < clampedDays; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }

    if (monitors.length === 0) {
      return { monitors: [], dates };
    }

    const monitorIds = monitors.map(m => m.id);

    // Single bulk query: all runs in the time window
    const runs = await this.prisma.monitorRun.findMany({
      where: {
        userId,
        monitorId: { in: monitorIds },
        checkedAt: { gte: since },
      },
      select: { monitorId: true, checkedAt: true, level: true },
    });

    // Aggregate into monitorId → date → { total, failed }
    const agg = new Map<string, Map<string, { total: number; failed: number }>>();
    for (const run of runs) {
      const dateStr = run.checkedAt.toISOString().slice(0, 10);
      if (!agg.has(run.monitorId)) agg.set(run.monitorId, new Map());
      const dayMap = agg.get(run.monitorId)!;
      if (!dayMap.has(dateStr)) dayMap.set(dateStr, { total: 0, failed: 0 });
      const cell = dayMap.get(dateStr)!;
      cell.total++;
      if (run.level !== 'green') cell.failed++;
    }

    const result = monitors.map(m => ({
      id: m.id,
      name: m.name,
      type: m.type,
      folder: m.folder?.name ?? null,
      days: dates.map(date => {
        const cell = agg.get(m.id)?.get(date);
        if (!cell || cell.total === 0) return { date, uptimePct: null, total: 0, failed: 0 };
        const uptimePct = Math.round(((cell.total - cell.failed) / cell.total) * 10000) / 100;
        return { date, uptimePct, total: cell.total, failed: cell.failed };
      }),
    }));

    return { monitors: result, dates };
  }

  // ─── Global Status Timeline ───────────────────────────────────────────────

  /**
   * Returns a multi-monitor status timeline for a given period.
   * Each monitor has a list of segments: { start, end, level } computed from
   * the status-transition history of its MonitorRuns.
   *
   * Used by the /monitors/timeline frontend page.
   */
  async statusTimeline(userId: string, hours: number): Promise<{
    monitors: Array<{
      id: string;
      name: string;
      type: string;
      folder: string | null;
      segments: Array<{ start: string; end: string; level: 'green' | 'yellow' | 'red' }>;
      currentLevel: string;
      uptimePct: number;
    }>;
    from: string;
    to: string;
    totalHours: number;
  }> {
    const clampedHours = Math.min(168, Math.max(1, hours)); // 1h–7d
    const to = new Date();
    const from = new Date(to.getTime() - clampedHours * 60 * 60 * 1000);

    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        type: true,
        folder: { select: { name: true } },
      },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'asc' }],
    });

    if (monitors.length === 0) {
      return { monitors: [], from: from.toISOString(), to: to.toISOString(), totalHours: clampedHours };
    }

    const monitorIds = monitors.map(m => m.id);

    // Load all runs within the window + a small lookback buffer for the preceding state
    const bufferFrom = new Date(from.getTime() - 30 * 60 * 1000); // 30min lookback
    const runs = await this.prisma.monitorRun.findMany({
      where: {
        monitorId: { in: monitorIds },
        checkedAt: { gte: bufferFrom },
      },
      select: { monitorId: true, checkedAt: true, level: true },
      orderBy: { checkedAt: 'asc' },
    });

    // Group by monitor
    const runsByMonitor = new Map<string, Array<{ checkedAt: Date; level: string }>>();
    for (const m of monitors) runsByMonitor.set(m.id, []);
    for (const r of runs) {
      runsByMonitor.get(r.monitorId)?.push({ checkedAt: r.checkedAt, level: r.level ?? 'green' });
    }

    const result = monitors.map(m => {
      const monitorRuns = runsByMonitor.get(m.id) ?? [];

      // Filter to only runs within window (use buffer runs to establish initial state)
      const bufferRuns = monitorRuns.filter(r => r.checkedAt < from);
      const windowRuns = monitorRuns.filter(r => r.checkedAt >= from);

      // Determine starting state from most recent buffer run (or 'green' if none)
      const initialLevel = bufferRuns.length > 0
        ? (bufferRuns[bufferRuns.length - 1].level as 'green' | 'yellow' | 'red')
        : 'green';

      // Build segments from state transitions
      const segments: Array<{ start: string; end: string; level: 'green' | 'yellow' | 'red' }> = [];

      if (windowRuns.length === 0) {
        // No data in window
        segments.push({ start: from.toISOString(), end: to.toISOString(), level: initialLevel });
      } else {
        let segStart = from;
        let currentLevel: 'green' | 'yellow' | 'red' = initialLevel;

        for (const run of windowRuns) {
          const runLevel = run.level as 'green' | 'yellow' | 'red';
          if (runLevel !== currentLevel) {
            segments.push({ start: segStart.toISOString(), end: run.checkedAt.toISOString(), level: currentLevel });
            segStart = run.checkedAt;
            currentLevel = runLevel;
          }
        }
        // Final segment to end of window
        segments.push({ start: segStart.toISOString(), end: to.toISOString(), level: currentLevel });
      }

      // Calculate uptime% from window runs
      const windowTotal = windowRuns.length;
      const windowOk = windowRuns.filter(r => r.level === 'green').length;
      const uptimePct = windowTotal > 0 ? Math.round((windowOk / windowTotal) * 10000) / 100 : 100;
      const currentLevel = windowRuns.length > 0
        ? windowRuns[windowRuns.length - 1].level
        : initialLevel;

      return {
        id: m.id,
        name: m.name,
        type: m.type,
        folder: m.folder?.name ?? null,
        segments,
        currentLevel,
        uptimePct,
      };
    });

    return {
      monitors: result,
      from: from.toISOString(),
      to: to.toISOString(),
      totalHours: clampedHours,
    };
  }

  // ─── CT Log History ──────────────────────────────────────────────────────

  async ctLogHistory(userId: string, monitorId: string): Promise<{
    entries: Array<{
      checkedAt: Date;
      newCertCount: number;
      domains: string[];
      message: string;
      level: string;
    }>;
  }> {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const runs = await this.prisma.monitorRun.findMany({
      where: { monitorId },
      orderBy: { checkedAt: 'desc' },
      take: 50,
      select: { checkedAt: true, message: true, level: true },
    });

    return {
      entries: runs.map((r) => {
        const msg = r.message ?? '';
        // Try to parse cert count from message: "N new certificate(s) found..."
        const countMatch = msg.match(/^(\d+) new certificate/i);
        const newCertCount = countMatch ? parseInt(countMatch[1], 10) : 0;

        // Extract domain list from message: "...: domain1, domain2 (+N more)"
        const domainsMatch = msg.match(/:\s+(.+?)(\s+\(\+\d+ more\))?$/);
        const domains = domainsMatch
          ? domainsMatch[1].split(',').map((d) => d.trim()).filter(Boolean)
          : [];

        return {
          checkedAt: r.checkedAt,
          message: msg,
          newCertCount,
          domains,
          level: r.level ?? 'green',
        };
      }),
    };
  }

  /**
   * Returns effective check rate information for a monitor.
   * Includes throttleMs, maxChecksPerHour, checksLastHour, and whether the monitor
   * is currently throttled (checksLastHour >= maxChecksPerHour).
   */
  async checkRate(userId: string, monitorId: string): Promise<{
    intervalSec: number;
    throttleMs: number | null;
    maxChecksPerHour: number | null;
    checksLastHour: number;
    effectiveChecksPerHour: number;
    isThrottled: boolean;
  }> {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
      select: {
        intervalSec: true,
        throttleMs: true,
        maxChecksPerHour: true,
      },
    });

    if (!monitor) throw new NotFoundException('Monitor not found');

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const checksLastHour = await this.prisma.monitorRun.count({
      where: { monitorId, checkedAt: { gte: since } },
    });

    const intervalBasedRate = Math.floor(3600 / monitor.intervalSec);
    const effectiveChecksPerHour = monitor.maxChecksPerHour !== null
      ? Math.min(intervalBasedRate, monitor.maxChecksPerHour)
      : intervalBasedRate;

    const isThrottled = monitor.maxChecksPerHour !== null
      ? checksLastHour >= monitor.maxChecksPerHour
      : false;

    return {
      intervalSec: monitor.intervalSec,
      throttleMs: monitor.throttleMs,
      maxChecksPerHour: monitor.maxChecksPerHour,
      checksLastHour,
      effectiveChecksPerHour,
      isThrottled,
    };
  }

  /**
   * Analyzes monitoring configuration completeness.
   * Returns per-monitor coverage gaps and an aggregate coverage score (0-100).
   */
  async monitorCoverage(userId: string): Promise<{
    coverageScore: number;
    totalMonitors: number;
    monitorsWithAlerts: number;
    monitorsWithSla: number;
    monitorsWithDescription: number;
    monitorsWithRunbook: number;
    monitorsWithTags: number;
    monitorsEnabled: number;
    gaps: Array<{
      id: string;
      name: string;
      type: string;
      missingAlerts: boolean;
      missingSla: boolean;
      missingDescription: boolean;
      missingRunbook: boolean;
      missingTags: boolean;
      coverageScore: number;
    }>;
    generatedAt: string;
  }> {
    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        type: true,
        enabled: true,
        description: true,
        runbookUrl: true,
        slaTarget: true,
        _count: { select: { monitorAlerts: true, monitorTags: true } },
      },
      orderBy: [{ pinned: 'desc' }, { name: 'asc' }],
    });

    if (monitors.length === 0) {
      return {
        coverageScore: 100,
        totalMonitors: 0,
        monitorsWithAlerts: 0,
        monitorsWithSla: 0,
        monitorsWithDescription: 0,
        monitorsWithRunbook: 0,
        monitorsWithTags: 0,
        monitorsEnabled: 0,
        gaps: [],
        generatedAt: new Date().toISOString(),
      };
    }

    // Coverage criteria weights (out of 5 points per monitor):
    // - has alert channels: 2 pts (most critical)
    // - has SLA target: 1 pt
    // - has description: 1 pt
    // - has runbook URL: 1 pt
    const WEIGHTS = { alerts: 2, sla: 1, description: 1, runbook: 1 };
    const MAX_SCORE = WEIGHTS.alerts + WEIGHTS.sla + WEIGHTS.description + WEIGHTS.runbook;

    const gaps = monitors.map(m => {
      const missingAlerts = m._count.monitorAlerts === 0;
      const missingSla = m.slaTarget == null;
      const missingDescription = !m.description?.trim();
      const missingRunbook = !m.runbookUrl?.trim();
      const missingTags = m._count.monitorTags === 0;

      const pts =
        (missingAlerts ? 0 : WEIGHTS.alerts) +
        (missingSla ? 0 : WEIGHTS.sla) +
        (missingDescription ? 0 : WEIGHTS.description) +
        (missingRunbook ? 0 : WEIGHTS.runbook);
      const coverageScore = Math.round((pts / MAX_SCORE) * 100);

      return {
        id: m.id,
        name: m.name,
        type: m.type,
        missingAlerts,
        missingSla,
        missingDescription,
        missingRunbook,
        missingTags,
        coverageScore,
      };
    });

    const totalMonitors = monitors.length;
    const monitorsWithAlerts = monitors.filter(m => m._count.monitorAlerts > 0).length;
    const monitorsWithSla = monitors.filter(m => m.slaTarget != null).length;
    const monitorsWithDescription = monitors.filter(m => m.description?.trim()).length;
    const monitorsWithRunbook = monitors.filter(m => m.runbookUrl?.trim()).length;
    const monitorsWithTags = monitors.filter(m => m._count.monitorTags > 0).length;
    const monitorsEnabled = monitors.filter(m => m.enabled).length;

    const avgCoverage = gaps.reduce((s, g) => s + g.coverageScore, 0) / totalMonitors;
    const coverageScore = Math.round(avgCoverage);

    return {
      coverageScore,
      totalMonitors,
      monitorsWithAlerts,
      monitorsWithSla,
      monitorsWithDescription,
      monitorsWithRunbook,
      monitorsWithTags,
      monitorsEnabled,
      gaps: gaps.sort((a, b) => a.coverageScore - b.coverageScore), // worst first
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Week-over-week trend analysis for all monitors.
   * Compares current 7 days vs prior 7 days: uptime% and avg latency.
   * Returns trend direction: 'improving' | 'degrading' | 'stable' | 'new'
   */
  async monitorTrends(userId: string): Promise<{
    monitors: Array<{
      id: string;
      name: string;
      type: string;
      enabled: boolean;
      folder: string | null;
      currentUptimePct: number | null;
      previousUptimePct: number | null;
      uptimeDelta: number | null;
      uptimeTrend: 'improving' | 'degrading' | 'stable' | 'new';
      currentAvgLatencyMs: number | null;
      previousAvgLatencyMs: number | null;
      latencyDeltaPct: number | null;
      latencyTrend: 'improving' | 'degrading' | 'stable' | 'new';
      currentChecks: number;
      previousChecks: number;
    }>;
    generatedAt: string;
  }> {
    const now = new Date();
    const currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const previousStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const monitors = await this.prisma.monitor.findMany({
      where: { userId },
      select: { id: true, name: true, type: true, enabled: true, folderId: true, folder: { select: { name: true } } },
      orderBy: { pinned: 'desc' },
    });

    if (monitors.length === 0) {
      return { monitors: [], generatedAt: now.toISOString() };
    }

    const monitorIds = monitors.map(m => m.id);

    // Fetch all runs for both periods in one query
    const allRuns = await this.prisma.monitorRun.findMany({
      where: {
        monitorId: { in: monitorIds },
        checkedAt: { gte: previousStart },
      },
      select: { monitorId: true, ok: true, latencyMs: true, checkedAt: true },
    });

    // Group by monitorId and period
    const byMonitor = new Map<string, { current: typeof allRuns; previous: typeof allRuns }>();
    for (const id of monitorIds) {
      byMonitor.set(id, { current: [], previous: [] });
    }
    for (const run of allRuns) {
      const bucket = byMonitor.get(run.monitorId);
      if (!bucket) continue;
      if (run.checkedAt >= currentStart) {
        bucket.current.push(run);
      } else {
        bucket.previous.push(run);
      }
    }

    const UPTIME_DELTA_THRESHOLD = 2; // pp — less than 2pp change = stable
    const LATENCY_DELTA_THRESHOLD = 10; // % — less than 10% change = stable

    const result = monitors.map(m => {
      const { current, previous } = byMonitor.get(m.id) ?? { current: [], previous: [] };

      const calcUptime = (runs: typeof allRuns) => {
        if (runs.length === 0) return null;
        return Math.round((runs.filter(r => r.ok).length / runs.length) * 1000) / 10;
      };
      const calcAvgLatency = (runs: typeof allRuns) => {
        const withLatency = runs.filter(r => r.latencyMs != null);
        if (withLatency.length === 0) return null;
        return Math.round(withLatency.reduce((s, r) => s + r.latencyMs!, 0) / withLatency.length);
      };

      const currentUptimePct = calcUptime(current);
      const previousUptimePct = calcUptime(previous);
      const currentAvgLatencyMs = calcAvgLatency(current);
      const previousAvgLatencyMs = calcAvgLatency(previous);

      const uptimeDelta = (currentUptimePct != null && previousUptimePct != null)
        ? Math.round((currentUptimePct - previousUptimePct) * 10) / 10
        : null;

      const latencyDeltaPct = (currentAvgLatencyMs != null && previousAvgLatencyMs != null && previousAvgLatencyMs > 0)
        ? Math.round(((currentAvgLatencyMs - previousAvgLatencyMs) / previousAvgLatencyMs) * 1000) / 10
        : null;

      const uptimeTrend: 'improving' | 'degrading' | 'stable' | 'new' =
        previous.length === 0 ? 'new' :
        uptimeDelta == null ? 'stable' :
        uptimeDelta > UPTIME_DELTA_THRESHOLD ? 'improving' :
        uptimeDelta < -UPTIME_DELTA_THRESHOLD ? 'degrading' : 'stable';

      const latencyTrend: 'improving' | 'degrading' | 'stable' | 'new' =
        previous.length === 0 ? 'new' :
        latencyDeltaPct == null ? 'stable' :
        latencyDeltaPct < -LATENCY_DELTA_THRESHOLD ? 'improving' :  // lower latency = improving
        latencyDeltaPct > LATENCY_DELTA_THRESHOLD ? 'degrading' : 'stable';

      return {
        id: m.id,
        name: m.name,
        type: m.type,
        enabled: m.enabled,
        folder: m.folder?.name ?? null,
        currentUptimePct,
        previousUptimePct,
        uptimeDelta,
        uptimeTrend,
        currentAvgLatencyMs,
        previousAvgLatencyMs,
        latencyDeltaPct,
        latencyTrend,
        currentChecks: current.length,
        previousChecks: previous.length,
      };
    });

    return { monitors: result, generatedAt: now.toISOString() };
  }

  // ─── Geo-Distribution Stats ───────────────────────────────────────────────────────

  async geoStats(
    userId: string,
    monitorId: string,
    periodDays = 7,
  ): Promise<{
    regions: Array<{
      region: string;
      totalRuns: number;
      okRuns: number;
      uptimePct: number;
      avgLatencyMs: number | null;
      p95LatencyMs: number | null;
    }>;
    hasGeoData: boolean;
  }> {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
    });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const runs = await this.prisma.monitorRun.findMany({
      where: {
        monitorId,
        checkedAt: { gte: since },
        geoRegion: { not: null },
      },
      select: { ok: true, latencyMs: true, geoRegion: true },
    });

    if (runs.length === 0) {
      return { regions: [], hasGeoData: false };
    }

    // Group by region
    const regionMap = new Map<string, { ok: number; total: number; latencies: number[] }>();
    for (const run of runs) {
      const region = run.geoRegion!;
      if (!regionMap.has(region)) regionMap.set(region, { ok: 0, total: 0, latencies: [] });
      const entry = regionMap.get(region)!;
      entry.total++;
      if (run.ok) entry.ok++;
      if (run.latencyMs !== null) entry.latencies.push(run.latencyMs);
    }

    const regions = Array.from(regionMap.entries()).map(([region, data]) => {
      const uptimePct = data.total > 0 ? Math.round((data.ok / data.total) * 1000) / 10 : 0;
      const avgLatencyMs = data.latencies.length > 0
        ? Math.round(data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length)
        : null;

      let p95LatencyMs: number | null = null;
      if (data.latencies.length > 0) {
        const sorted = [...data.latencies].sort((a, b) => a - b);
        const p95Index = Math.ceil(sorted.length * 0.95) - 1;
        p95LatencyMs = sorted[Math.max(0, p95Index)];
      }

      return { region, totalRuns: data.total, okRuns: data.ok, uptimePct, avgLatencyMs, p95LatencyMs };
    });

    return { regions, hasGeoData: true };
  }

  /**
   * Returns per-day P50 / P95 / P99 latency and uptime% for the last N days.
   * Useful for rendering a multi-line trend chart on the Performance tab.
   * Days with zero successful latency data return null for all percentile fields.
   *
   * @param userId  - Owner's user ID
   * @param monitorId - Target monitor
   * @param days    - Number of days to look back (1–90, default 30)
   */
  async latencyHistory(userId: string, monitorId: string, days: number = 30): Promise<{
    days: Array<{
      date: string; // YYYY-MM-DD UTC
      p50: number | null;
      p95: number | null;
      p99: number | null;
      avgMs: number | null;
      uptimePct: number | null;
      totalChecks: number;
    }>;
  }> {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const clampedDays = Math.min(Math.max(1, days), 90);
    const since = new Date(Date.now() - clampedDays * 24 * 60 * 60 * 1000);

    const runs = await this.prisma.monitorRun.findMany({
      where: { monitorId, checkedAt: { gte: since } },
      select: { ok: true, latencyMs: true, checkedAt: true },
      orderBy: { checkedAt: 'asc' },
    });

    // Group by UTC date
    const buckets = new Map<string, { latencies: number[]; ok: number; total: number }>();

    // Pre-fill all days so we get entries even for days with no data
    for (let i = 0; i < clampedDays; i++) {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      if (!buckets.has(key)) buckets.set(key, { latencies: [], ok: 0, total: 0 });
    }

    for (const run of runs) {
      const key = run.checkedAt.toISOString().split('T')[0];
      if (!buckets.has(key)) buckets.set(key, { latencies: [], ok: 0, total: 0 });
      const b = buckets.get(key)!;
      b.total++;
      if (run.ok) b.ok++;
      if (run.latencyMs !== null) b.latencies.push(run.latencyMs);
    }

    const pct = (arr: number[], p: number): number | null => {
      if (arr.length === 0) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.max(0, Math.ceil(sorted.length * (p / 100)) - 1)];
    };

    const result = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, b]) => ({
        date,
        p50: pct(b.latencies, 50),
        p95: pct(b.latencies, 95),
        p99: pct(b.latencies, 99),
        avgMs: b.latencies.length > 0
          ? Math.round(b.latencies.reduce((s, v) => s + v, 0) / b.latencies.length)
          : null,
        uptimePct: b.total > 0 ? Math.round((b.ok / b.total) * 1000) / 10 : null,
        totalChecks: b.total,
      }));

    return { days: result };
  }

  /**
   * Analyzes failed MonitorRun records for a monitor and groups them into
   * normalized error patterns (by stripping dynamic values like IPs, timestamps,
   * HTTP status codes, UUIDs). Returns frequency, first/last seen, and a
   * 7-bucket weekly trend for each distinct pattern.
   *
   * @param userId     - Owner's user ID
   * @param monitorId  - Target monitor
   * @param periodDays - Look-back window in days (1–365, default 30)
   */
  async failurePatterns(userId: string, monitorId: string, periodDays: number = 30): Promise<{
    totalFailures: number;
    uniquePatterns: number;
    patterns: Array<{
      pattern: string;
      count: number;
      percentage: number;
      firstSeen: Date;
      lastSeen: Date;
      exampleMessage: string;
      weeklyTrend: number[]; // 7 buckets, oldest→newest
    }>;
  }> {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const days = Math.min(Math.max(1, periodDays), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const failedRuns = await this.prisma.monitorRun.findMany({
      where: { monitorId, ok: false, checkedAt: { gte: since } },
      select: { message: true, checkedAt: true },
      orderBy: { checkedAt: 'asc' },
    });

    if (failedRuns.length === 0) {
      return { totalFailures: 0, uniquePatterns: 0, patterns: [] };
    }

    // ── Normalize message into a pattern ────────────────────────────────────
    const normalize = (msg: string): string => {
      return (msg ?? '')
        .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<IP>') // IPv4
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>') // UUID
        .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, '<TS>') // ISO timestamps
        .replace(/\b\d{10,13}\b/g, '<EPOCH>') // Unix epoch timestamps
        .replace(/\bhttps?:\/\/[^\s"')]+/g, '<URL>') // URLs
        .replace(/\bport \d+\b/gi, 'port <PORT>') // port numbers
        .replace(/\b(status|code|http)\s*[:=]?\s*\d{3}\b/gi, (m) => m.replace(/\d{3}/, '<CODE>')) // HTTP codes
        .replace(/in \d+(\.\d+)?ms/gi, 'in <MS>ms') // timing values
        .replace(/\btimeout after \d+/gi, 'timeout after <N>') // timeout values
        .replace(/\b\d{5,}\b/g, '<NUM>') // large numbers
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
    };

    // ── Build pattern buckets ────────────────────────────────────────────────
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const bucketCount = 7;
    const bucketDurationMs = (days * 24 * 60 * 60 * 1000) / bucketCount;

    const patternMap = new Map<string, {
      count: number;
      firstSeen: Date;
      lastSeen: Date;
      exampleMessage: string;
      weekly: number[];
    }>();

    for (const run of failedRuns) {
      const pattern = normalize(run.message ?? 'Unknown error');
      const existing = patternMap.get(pattern);
      const checkedMs = run.checkedAt.getTime();
      const bucketIdx = Math.min(
        bucketCount - 1,
        Math.floor((checkedMs - since.getTime()) / bucketDurationMs),
      );

      if (!existing) {
        patternMap.set(pattern, {
          count: 1,
          firstSeen: run.checkedAt,
          lastSeen: run.checkedAt,
          exampleMessage: run.message ?? 'Unknown error',
          weekly: Array(bucketCount).fill(0).map((_, i) => (i === bucketIdx ? 1 : 0)),
        });
      } else {
        existing.count++;
        if (run.checkedAt < existing.firstSeen) existing.firstSeen = run.checkedAt;
        if (run.checkedAt > existing.lastSeen) existing.lastSeen = run.checkedAt;
        existing.weekly[bucketIdx]++;
      }
    }

    const totalFailures = failedRuns.length;
    const patterns = Array.from(patternMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([pattern, data]) => ({
        pattern,
        count: data.count,
        percentage: Math.round((data.count / totalFailures) * 1000) / 10,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
        exampleMessage: data.exampleMessage,
        weeklyTrend: data.weekly,
      }));

    return { totalFailures, uniquePatterns: patternMap.size, patterns };
  }

  // ── Import from Docker Compose ──────────────────────────────────────────────

  /**
   * Parses a docker-compose YAML string and returns suggested monitors for each service.
   * Does NOT persist anything — returns suggestions only.
   */
  importFromCompose(compose: string): SuggestedMonitor[] {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require('js-yaml') as typeof import('js-yaml');

    let parsed: unknown;
    try {
      parsed = yaml.load(compose);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Invalid YAML: ${msg}`);
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('services' in parsed) ||
      typeof (parsed as Record<string, unknown>).services !== 'object'
    ) {
      return [];
    }

    const services = (parsed as { services: Record<string, unknown> }).services;
    const suggestions: SuggestedMonitor[] = [];

    for (const [serviceName, serviceDef] of Object.entries(services)) {
      if (!serviceDef || typeof serviceDef !== 'object') continue;

      const svc = serviceDef as {
        image?: string;
        ports?: Array<string | { published?: string | number; target?: string | number }>;
      };

      const image = (svc.image ?? '').toLowerCase();

      // Parse port mappings → list of host ports
      const hostPorts: number[] = [];
      if (Array.isArray(svc.ports)) {
        for (const p of svc.ports) {
          if (typeof p === 'string') {
            // "hostPort:containerPort" or just "containerPort"
            const parts = p.split(':');
            const hostPart = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
            const portNum = parseInt(hostPart.replace(/[^0-9]/g, ''), 10);
            if (!isNaN(portNum)) hostPorts.push(portNum);
          } else if (typeof p === 'object' && p !== null) {
            const pub = p.published;
            if (pub !== undefined) {
              const portNum = typeof pub === 'number' ? pub : parseInt(String(pub), 10);
              if (!isNaN(portNum)) hostPorts.push(portNum);
            }
          }
        }
      }

      const firstPort = hostPorts[0];
      const hasPort = (port: number) => hostPorts.includes(port);

      // Helper: build HTTP target
      const httpTarget = (port: number) => `http://localhost:${port}`;
      // Helper: build TCP target
      const tcpTarget = (port: number) => `localhost:${port}`;

      // ── Image-based heuristics ───────────────────────────────────────────
      if (/nginx|traefik|caddy|haproxy/.test(image)) {
        const port = hasPort(443) ? 443 : hasPort(80) ? 80 : firstPort;
        if (port !== undefined) {
          const proto = port === 443 ? 'https' : 'http';
          suggestions.push({
            name: serviceName,
            type: 'HTTP',
            target: `${proto}://localhost:${port}`,
            reason: `${image.match(/nginx|traefik|caddy|haproxy/)?.[0] ?? 'proxy'} image detected on port ${port}`,
            intervalSec: 60,
          });
        }
        continue;
      }

      if (/postgres/.test(image)) {
        const port = firstPort ?? 5432;
        suggestions.push({
          name: serviceName,
          type: 'TCP',
          target: tcpTarget(port),
          reason: `postgres image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      if (/redis/.test(image)) {
        const port = firstPort ?? 6379;
        suggestions.push({
          name: serviceName,
          type: 'TCP',
          target: tcpTarget(port),
          reason: `redis image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      if (/mysql|mariadb/.test(image)) {
        const port = firstPort ?? 3306;
        suggestions.push({
          name: serviceName,
          type: 'TCP',
          target: tcpTarget(port),
          reason: `${image.match(/mysql|mariadb/)?.[0] ?? 'mysql'} image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      if (/mongo/.test(image)) {
        const port = firstPort ?? 27017;
        suggestions.push({
          name: serviceName,
          type: 'TCP',
          target: tcpTarget(port),
          reason: `mongo image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      if (/rabbitmq/.test(image)) {
        const tcpPort = firstPort ?? 5672;
        suggestions.push({
          name: serviceName,
          type: 'TCP',
          target: tcpTarget(tcpPort),
          reason: `rabbitmq image detected on port ${tcpPort}`,
          intervalSec: 60,
        });
        // Also suggest management UI if port 15672 is mapped
        if (hasPort(15672)) {
          suggestions.push({
            name: `${serviceName}-management`,
            type: 'HTTP',
            target: httpTarget(15672),
            reason: `rabbitmq management UI on port 15672`,
            intervalSec: 60,
          });
        }
        continue;
      }

      if (/elasticsearch/.test(image)) {
        const port = firstPort ?? 9200;
        suggestions.push({
          name: serviceName,
          type: 'HTTP',
          target: httpTarget(port),
          reason: `elasticsearch image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      if (/grafana/.test(image)) {
        const port = firstPort ?? 3000;
        suggestions.push({
          name: serviceName,
          type: 'HTTP',
          target: httpTarget(port),
          reason: `grafana image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      if (/prometheus/.test(image)) {
        const port = firstPort ?? 9090;
        suggestions.push({
          name: serviceName,
          type: 'HTTP',
          target: httpTarget(port),
          reason: `prometheus image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      if (/minio/.test(image)) {
        const port = hasPort(9001) ? 9001 : firstPort ?? 9000;
        suggestions.push({
          name: serviceName,
          type: 'HTTP',
          target: httpTarget(port),
          reason: `minio image detected on port ${port}`,
          intervalSec: 60,
        });
        continue;
      }

      // ── Port-based fallback heuristics ───────────────────────────────────
      if (hasPort(80) || hasPort(443)) {
        const port = hasPort(443) ? 443 : 80;
        const proto = port === 443 ? 'https' : 'http';
        suggestions.push({
          name: serviceName,
          type: 'HTTP',
          target: `${proto}://localhost:${port}`,
          reason: `port ${port} exposed (HTTP)`,
          intervalSec: 60,
        });
        continue;
      }

      if (firstPort !== undefined) {
        suggestions.push({
          name: serviceName,
          type: 'TCP',
          target: tcpTarget(firstPort),
          reason: `port ${firstPort} exposed`,
          intervalSec: 60,
        });
        continue;
      }

      // No ports → skip
    }

    return suggestions;
  }

  // ─── Alert Rules Simulator ────────────────────────────────────────────────

  async simulateAlerts(
    userId: string,
    monitorId: string,
    config: {
      confirmations?: number;
      flapDetection?: boolean;
      flapWindow?: number;
      flapThreshold?: number;
      scheduleStartHour?: number;
      scheduleEndHour?: number;
    },
  ) {
    const monitor = await this.prisma.monitor.findFirst({ where: { id: monitorId, userId } });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const runs = await this.prisma.monitorRun.findMany({
      where: {
        monitorId,
        checkedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        userId,
      },
      orderBy: { checkedAt: 'asc' },
      take: 10000,
      select: { ok: true, checkedAt: true },
    });

    const result = simulateAlertRules(
      runs.map((r) => ({ ok: r.ok, checkedAt: r.checkedAt.toISOString() })),
      config,
    );

    return {
      ...result,
      currentConfig: {
        confirmations: monitor.confirmations,
        flapDetection: monitor.flapDetectionEnabled,
        flapWindow: monitor.flapWindow,
        flapThreshold: monitor.flapThreshold,
      },
    };
  }

  /**
   * Returns the time-series history of captured metric values for a monitor.
   * Only meaningful for HTTP/BROWSER monitors with metricPath configured.
   * Returns up to `limit` data points (default 200) ordered by checkedAt desc.
   */
  async metricHistory(userId: string, monitorId: string, opts: { limit?: number; periodDays?: number } = {}): Promise<{
    metricName: string | null;
    metricUnit: string | null;
    metricPath: string | null;
    metricAlertMin: number | null;
    metricAlertMax: number | null;
    points: Array<{ checkedAt: string; value: number; level: string }>;
    stats: { min: number | null; max: number | null; avg: number | null; latest: number | null; count: number };
  }> {
    const monitor = await this.prisma.monitor.findFirst({
      where: { id: monitorId, userId },
      select: { metricPath: true, metricName: true, metricUnit: true, metricAlertMin: true, metricAlertMax: true },
    });
    if (!monitor) throw new NotFoundException('Monitor not found');

    const { limit = 200, periodDays = 30 } = opts;
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const runs = await this.prisma.monitorRun.findMany({
      where: { monitorId, checkedAt: { gte: since }, capturedMetricValue: { not: null } },
      orderBy: { checkedAt: 'desc' },
      take: limit,
      select: { checkedAt: true, capturedMetricValue: true, level: true },
    });

    const points = runs
      .filter((r): r is typeof r & { capturedMetricValue: number } => r.capturedMetricValue !== null)
      .map((r) => ({ checkedAt: r.checkedAt.toISOString(), value: r.capturedMetricValue, level: r.level }));

    const values = points.map((p) => p.value);
    const stats = {
      min: values.length > 0 ? Math.min(...values) : null,
      max: values.length > 0 ? Math.max(...values) : null,
      avg: values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null,
      latest: points[0]?.value ?? null,
      count: points.length,
    };

    return {
      metricName: monitor.metricName,
      metricUnit: monitor.metricUnit,
      metricPath: monitor.metricPath,
      metricAlertMin: monitor.metricAlertMin,
      metricAlertMax: monitor.metricAlertMax,
      points,
      stats,
    };
  }

  /**
   * SLA compliance dashboard for all enabled monitors.
   * Returns current-month uptime, error budget usage, and 3-month history.
   */
  async slaDashboard(userId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monitors = await this.prisma.monitor.findMany({
      where: { userId, enabled: true },
      select: {
        id: true,
        name: true,
        type: true,
        folderId: true,
        slaTarget: true,
      },
    });

    // Helper: compute uptime % for a monitor in a given period
    const computeUptime = async (
      monitorId: string,
      from: Date,
      to: Date,
    ): Promise<{ totalRuns: number; failedRuns: number; uptimePct: number }> => {
      const runs = await this.prisma.monitorRun.findMany({
        where: { monitorId, checkedAt: { gte: from, lt: to } },
        select: { ok: true },
      });
      const totalRuns = runs.length;
      const failedRuns = runs.filter((r) => !r.ok).length;
      const uptimePct = totalRuns === 0 ? 100 : ((totalRuns - failedRuns) / totalRuns) * 100;
      return { totalRuns, failedRuns, uptimePct: Math.round(uptimePct * 10000) / 10000 };
    };

    // Build 3-month history labels
    const historyMonths: Array<{ label: string; start: Date; end: Date }> = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      historyMonths.push({ label, start: d, end });
    }

    const monitorsData = await Promise.all(
      monitors.map(async (m) => {
        const slaTarget = m.slaTarget != null ? Number(m.slaTarget) : null;

        // Current month stats
        const { totalRuns, failedRuns, uptimePct } = await computeUptime(m.id, monthStart, now);

        // Compliance
        let compliant: boolean | null = null;
        let errorBudgetUsedPct: number | null = null;
        let budgetRemainingPct: number | null = null;

        if (slaTarget != null) {
          compliant = uptimePct >= slaTarget;
          const allowedDown = 100 - slaTarget;
          if (allowedDown <= 0) {
            errorBudgetUsedPct = uptimePct < 100 ? 100 : 0;
          } else {
            errorBudgetUsedPct = Math.min(100, Math.max(0, ((100 - uptimePct) / allowedDown) * 100));
            errorBudgetUsedPct = Math.round(errorBudgetUsedPct * 100) / 100;
          }
          budgetRemainingPct = Math.round((100 - errorBudgetUsedPct) * 100) / 100;
        }

        // Monthly history (last 3 months)
        const monthlyHistory = await Promise.all(
          historyMonths.map(async (hm) => {
            const { uptimePct: hUptime } = await computeUptime(m.id, hm.start, hm.end);
            const hCompliant = slaTarget != null ? hUptime >= slaTarget : null;
            return {
              month: hm.label,
              uptimePct: Math.round(hUptime * 10000) / 10000,
              compliant: hCompliant,
            };
          }),
        );

        return {
          id: m.id,
          name: m.name,
          type: m.type,
          folder: m.folderId,
          slaTarget,
          uptimePct,
          compliant,
          errorBudgetUsedPct,
          budgetRemainingPct,
          totalRuns,
          failedRuns,
          monthlyHistory,
        };
      }),
    );

    // Summary
    const compliantCount = monitorsData.filter((m) => m.compliant === true && (m.slaTarget == null || m.uptimePct - (m.slaTarget ?? 0) >= 0.1)).length;
    const atRiskCount = monitorsData.filter(
      (m) => m.slaTarget != null && m.compliant === true && m.uptimePct - (m.slaTarget ?? 0) < 0.1,
    ).length;
    const breachedCount = monitorsData.filter((m) => m.compliant === false).length;
    const noTargetCount = monitorsData.filter((m) => m.slaTarget == null).length;

    const currentMonthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return {
      generatedAt: now.toISOString(),
      period: {
        start: monthStart.toISOString(),
        end: now.toISOString(),
      },
      summary: {
        totalMonitors: monitors.length,
        compliant: compliantCount,
        atRisk: atRiskCount,
        breached: breachedCount,
        noTarget: noTargetCount,
        currentMonth: currentMonthLabel,
      },
      monitors: monitorsData,
    };
  }

  // ─── OpenAPI Import ────────────────────────────────────────────────────────

  async previewFromOpenApi(opts: {
    specJson?: string;
    url?: string;
    baseUrl: string;
    maxPaths?: number;
  }): Promise<{ suggestions: OpenApiSuggestion[] }> {
    if (!opts.specJson && !opts.url) {
      throw new BadRequestException('Either specJson or url must be provided');
    }

    let rawSpec: string = opts.specJson ?? '';

    if (opts.url && !opts.specJson) {
      // In real use we'd fetch; for now throw if no json
      throw new BadRequestException('Fetching spec by url is not supported in this context');
    }

    let spec: Record<string, unknown>;
    try {
      spec = JSON.parse(rawSpec);
    } catch {
      throw new BadRequestException('Invalid JSON in specJson');
    }

    const basePath = typeof (spec as { basePath?: string }).basePath === 'string'
      ? (spec as { basePath: string }).basePath
      : '';

    const paths = (spec as { paths?: Record<string, Record<string, { summary?: string; tags?: string[] }>> }).paths ?? {};

    const SUPPORTED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

    const suggestions: OpenApiSuggestion[] = [];

    for (const [path, methods] of Object.entries(paths)) {
      if (opts.maxPaths != null && suggestions.length >= opts.maxPaths) break;

      for (const [method, op] of Object.entries(methods)) {
        if (opts.maxPaths != null && suggestions.length >= opts.maxPaths) break;

        const upperMethod = method.toUpperCase();
        if (!SUPPORTED_METHODS.includes(upperMethod)) continue;

        // Replace path params with sensible placeholders
        const resolvedPath = path.replace(/\{([^}]+)\}/g, (_match, param: string) => {
          // Use numeric placeholder for likely id params, "example" for others
          const lower = param.toLowerCase();
          if (lower.endsWith('id') || lower === 'id') return '1';
          return 'example';
        });

        const url = `${opts.baseUrl}${basePath}${resolvedPath}`;

        const expectedStatus = upperMethod === 'POST' ? 201
          : upperMethod === 'DELETE' ? 204
          : 200;

        suggestions.push({
          key: `${upperMethod}:${path}`,
          method: upperMethod as OpenApiSuggestion['method'],
          path,
          url,
          expectedStatus,
          summary: op.summary,
          tags: op.tags,
        });
      }
    }

    return { suggestions };
  }

  async importFromOpenApi(
    userId: string,
    opts: {
      specJson?: string;
      url?: string;
      baseUrl: string;
      selectedPaths: string[];
      intervalSec?: number;
      folderId?: string;
      alertChannelIds?: string[];
    },
  ): Promise<{ created: number; monitors: unknown[] }> {
    const { suggestions } = await this.previewFromOpenApi({
      specJson: opts.specJson,
      url: opts.url,
      baseUrl: opts.baseUrl,
    });

    const selected = suggestions.filter((s) => opts.selectedPaths.includes(s.key));

    const monitors: unknown[] = [];
    for (const s of selected) {
      const monitor = await this.create(userId, {
        name: s.summary ?? `${s.method} ${s.path}`,
        target: s.url,
        type: 'HTTP' as MonitorType,
        intervalSec: opts.intervalSec ?? 60,
        folderId: opts.folderId ?? null,
        alertChannelIds: opts.alertChannelIds,
        config: {
          method: s.method,
          expectedStatus: s.expectedStatus,
        },
      });
      monitors.push(monitor);
    }

    return { created: monitors.length, monitors };
  }

  // ─── Playground rate-limit: in-memory map userId → timestamps ───────────────
  private readonly _playgroundTimestamps = new Map<string, number[]>();

  /**
   * Runs a one-off HTTP check against the given URL without creating or storing a monitor.
   * Rate limited to 10 requests per user per minute.
   */
  async runPlayground(dto: PlaygroundDto, userId: string): Promise<PlaygroundResult> {
    // Rate limit
    const now = Date.now();
    const windowMs = 60_000;
    const maxPerWindow = 10;
    const timestamps = (this._playgroundTimestamps.get(userId) ?? []).filter((t) => now - t < windowMs);
    if (timestamps.length >= maxPerWindow) {
      throw new HttpException('Playground rate limit exceeded: max 10 requests per minute', HttpStatus.TOO_MANY_REQUESTS);
    }
    timestamps.push(now);
    this._playgroundTimestamps.set(userId, timestamps);

    const url = dto.url?.trim() ?? '';
    if (!/^https?:\/\//i.test(url)) {
      return {
        ok: false,
        statusCode: 0,
        latencyMs: 0,
        responseHeaders: {},
        bodyExcerpt: '',
        assertions: {},
        error: 'URL must start with http:// or https://',
      };
    }

    const timeoutMs = Math.min(dto.timeoutMs ?? 10000, 30000);
    const method = (dto.method ?? 'GET').toUpperCase();
    const followRedirects = dto.followRedirects !== false;
    const checkSsl = dto.checkSsl !== false;
    const isHttps = url.startsWith('https://');

    try {
      const { statusCode, body, latencyMs, timings, responseHeaders, redirectChain } =
        await playgroundHttpRequest(url, { method, timeoutMs, headers: dto.headers ?? {}, body: dto.body, followRedirects });

      const bodyExcerpt = body.slice(0, 500);
      const contentType = responseHeaders['content-type']?.split(';')[0]?.trim();

      // ─── JSON path evaluation ──────────────────────────────────────────────
      let bodyJsonPathResult: string | undefined;
      if (dto.bodyJsonPath) {
        try {
          const parsed: unknown = JSON.parse(body);
          const normalizedPath = dto.bodyJsonPath.replace(/^\$\.?/, '');
          const extracted = extractByPath(parsed, normalizedPath);
          bodyJsonPathResult = extracted !== undefined ? String(extracted) : undefined;
        } catch {
          bodyJsonPathResult = undefined;
        }
      }

      // ─── SSL Info ─────────────────────────────────────────────────────────
      let sslInfo: PlaygroundResult['sslInfo'];
      if (isHttps && checkSsl) {
        try {
          sslInfo = await getPlaygroundSslInfo(url, timeoutMs);
        } catch {
          // SSL info is optional — don't fail the whole result
        }
      }

      // ─── Assertions ───────────────────────────────────────────────────────
      const assertions: PlaygroundResult['assertions'] = {};
      if (dto.expectedStatus !== undefined) {
        assertions.statusOk = statusCode === dto.expectedStatus;
      }
      if (dto.bodyContains !== undefined) {
        assertions.bodyContainsOk = body.includes(dto.bodyContains);
      }
      if (dto.bodyJsonPath !== undefined && dto.bodyJsonPathExpected !== undefined) {
        assertions.bodyJsonPathOk = bodyJsonPathResult === dto.bodyJsonPathExpected;
      }

      const assertionsFailed = Object.values(assertions).some((v) => v === false);
      const httpOk = statusCode >= 200 && statusCode < 300;
      const ok = httpOk && !assertionsFailed;

      return {
        ok,
        statusCode,
        latencyMs,
        timings,
        redirectChain,
        responseHeaders,
        bodyExcerpt,
        bodyJsonPathResult,
        contentType,
        sslInfo,
        assertions,
      };
    } catch (err) {
      return {
        ok: false,
        statusCode: 0,
        latencyMs: 0,
        responseHeaders: {},
        bodyExcerpt: '',
        assertions: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export interface SuggestedMonitor {
  name: string;
  type: 'HTTP' | 'TCP';
  target: string;
  reason: string;
  intervalSec: number;
}

export interface OpenApiSuggestion {
  key: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  path: string;
  url: string;
  expectedStatus: number;
  summary?: string;
  tags?: string[];
}

// ─── Pure simulation function (exported for unit tests) ────────────────────

export interface SimulateRun {
  ok: boolean;
  checkedAt: string;
}

export interface SimulateConfig {
  confirmations?: number;
  flapDetection?: boolean;
  flapWindow?: number;
  flapThreshold?: number;
  scheduleStartHour?: number;
  scheduleEndHour?: number;
}

export interface SimulateAlertsResult {
  totalRuns: number;
  totalFails: number;
  uptimePct: number;
  alertsFired: number;
  recoverysFired: number;
  flappingAlertsFired: number;
  alertsPerDay: number;
  noiseScore: 'low' | 'medium' | 'high';
  timeline: Array<{
    timestamp: string;
    type: 'alert' | 'recovery' | 'flapping';
    reason: string;
  }>;
}

export function simulateAlertRules(runs: SimulateRun[], config: SimulateConfig): SimulateAlertsResult {
  const confirmations = config.confirmations ?? 1;
  const flapDetection = config.flapDetection ?? false;
  const flapWindow = config.flapWindow ?? 5;
  const flapThreshold = config.flapThreshold ?? 3;
  const hasSchedule =
    config.scheduleStartHour !== undefined && config.scheduleStartHour !== null &&
    config.scheduleEndHour !== undefined && config.scheduleEndHour !== null;
  const scheduleStartHour = config.scheduleStartHour ?? 0;
  const scheduleEndHour = config.scheduleEndHour ?? 23;

  let consecutiveFails = 0;
  let lastState: 'ok' | 'fail' = 'ok';
  const timeline: SimulateAlertsResult['timeline'] = [];
  let alertsFired = 0;
  let recoverysFired = 0;
  let flappingAlertsFired = 0;
  let totalFails = 0;

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];

    if (!run.ok) {
      consecutiveFails++;
      totalFails++;
    } else {
      consecutiveFails = 0;
    }

    if (consecutiveFails >= confirmations && lastState !== 'fail') {
      // Check schedule filter
      if (hasSchedule) {
        const hour = new Date(run.checkedAt).getUTCHours();
        let inWindow: boolean;
        if (scheduleStartHour <= scheduleEndHour) {
          inWindow = hour >= scheduleStartHour && hour < scheduleEndHour;
        } else {
          // wraps midnight
          inWindow = hour >= scheduleStartHour || hour < scheduleEndHour;
        }
        if (!inWindow) {
          // skip alert but still track state so recovery works
          lastState = 'fail';
          continue;
        }
      }

      // Flap detection: count state changes in last flapWindow runs
      if (flapDetection) {
        const windowStart = Math.max(0, i - flapWindow + 1);
        const windowRuns = runs.slice(windowStart, i + 1);
        let stateChanges = 0;
        for (let j = 1; j < windowRuns.length; j++) {
          if (windowRuns[j].ok !== windowRuns[j - 1].ok) stateChanges++;
        }
        if (stateChanges >= flapThreshold) {
          timeline.push({
            timestamp: run.checkedAt,
            type: 'flapping',
            reason: `Flapping detected: ${stateChanges} state changes in last ${windowRuns.length} runs`,
          });
          flappingAlertsFired++;
          lastState = 'fail';
          continue;
        }
      }

      timeline.push({
        timestamp: run.checkedAt,
        type: 'alert',
        reason: `${consecutiveFails} consecutive failure${consecutiveFails > 1 ? 's' : ''}`,
      });
      alertsFired++;
      lastState = 'fail';
    } else if (run.ok && lastState === 'fail') {
      timeline.push({
        timestamp: run.checkedAt,
        type: 'recovery',
        reason: 'Monitor recovered',
      });
      recoverysFired++;
      lastState = 'ok';
    }
  }

  const totalRuns = runs.length;
  const uptimePct =
    totalRuns > 0 ? Math.round(((totalRuns - totalFails) / totalRuns) * 10000) / 100 : 100;
  const alertsPerDay = Math.round((alertsFired / 7) * 10) / 10;
  const noiseScore: 'low' | 'medium' | 'high' =
    alertsPerDay < 1 ? 'low' : alertsPerDay <= 3 ? 'medium' : 'high';

  return {
    totalRuns,
    totalFails,
    uptimePct,
    alertsFired,
    recoverysFired,
    flappingAlertsFired,
    alertsPerDay,
    noiseScore,
    timeline,
  };
}


// ─── Playground HTTP Request Helper ──────────────────────────────────────────
interface PlaygroundHttpResult {
  statusCode: number;
  body: string;
  latencyMs: number;
  timings: { dnsMs?: number; tcpMs?: number; tlsMs?: number; ttfbMs?: number; downloadMs?: number };
  responseHeaders: Record<string, string>;
  redirectChain: string[];
}

async function playgroundTimedRequest(
  url: string,
  options: { method: string; timeoutMs: number; headers: Record<string, string>; body?: string },
): Promise<Omit<PlaygroundHttpResult, 'redirectChain'>> {
  return new Promise((resolve, reject) => {
    const startMs = Date.now();
    let dnsStart: number | null = null;
    let dnsMs: number | undefined;
    let tcpStart: number | null = null;
    let tcpMs: number | undefined;
    let tlsStart: number | null = null;
    let tlsMs: number | undefined;
    let ttfbMs: number | undefined;
    let bodyStart: number | null = null;
    let downloadMs: number | undefined;

    let urlObj: URL;
    try { urlObj = new URL(url); } catch { reject(new Error(`Invalid URL: ${url}`)); return; }

    const isHttps = urlObj.protocol === 'https:';
    const lib: typeof https | typeof http = isHttps ? https : http;
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port !== '' ? parseInt(urlObj.port, 10) : isHttps ? 443 : 80,
      path: (urlObj.pathname || '/') + urlObj.search,
      method: options.method,
      headers: { 'User-Agent': 'PulseDock-Playground/1.0', ...options.headers },
      timeout: options.timeoutMs,
    };
    const chunks: Buffer[] = [];
    const req = lib.request(requestOptions, (res) => {
      ttfbMs = Date.now() - startMs;
      bodyStart = Date.now();
      res.on('data', (chunk: Buffer) => { chunks.push(chunk); });
      res.on('end', () => {
        downloadMs = bodyStart !== null ? Date.now() - bodyStart : undefined;
        const latencyMs = Date.now() - startMs;
        const body = Buffer.concat(chunks).toString('utf8');
        const responseHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (v !== undefined) responseHeaders[k] = Array.isArray(v) ? v.join(', ') : (v as string);
        }
        resolve({ statusCode: res.statusCode ?? 0, body, latencyMs, timings: { dnsMs, tcpMs, tlsMs, ttfbMs, downloadMs }, responseHeaders });
      });
      res.on('error', reject);
    });
    req.on('socket', (socket) => {
      dnsStart = Date.now();
      socket.on('lookup', () => { if (dnsStart !== null) { dnsMs = Date.now() - dnsStart; } tcpStart = Date.now(); });
      socket.on('connect', () => {
        if (tcpStart !== null) { tcpMs = Date.now() - tcpStart; } else if (dnsStart !== null) { tcpMs = Date.now() - dnsStart; }
        if (isHttps) tlsStart = Date.now();
      });
      socket.on('secureConnect', () => { if (tlsStart !== null) { tlsMs = Date.now() - tlsStart; } });
    });
    req.on('timeout', () => { req.destroy(new Error(`Request timed out after ${options.timeoutMs}ms`)); });
    req.on('error', reject);
    if (options.body && ['POST', 'PUT', 'PATCH'].includes(options.method)) { req.write(options.body); }
    req.end();
  });
}

async function playgroundHttpRequest(
  url: string,
  options: { method: string; timeoutMs: number; headers: Record<string, string>; body?: string; followRedirects: boolean },
): Promise<PlaygroundHttpResult> {
  const redirectChain: string[] = [];
  let currentUrl = url;
  let totalLatencyMs = 0;
  let currentMethod = options.method;
  let currentBody = options.body;
  const maxRedirects = options.followRedirects ? 10 : 0;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const result = await playgroundTimedRequest(currentUrl, { ...options, method: currentMethod, body: currentBody });
    totalLatencyMs += result.latencyMs;
    const isRedirect = result.statusCode >= 301 && result.statusCode <= 308;
    const location = result.responseHeaders['location'];
    if (isRedirect && location && options.followRedirects) {
      redirectChain.push(currentUrl);
      try { currentUrl = new URL(location, currentUrl).href; } catch { return { ...result, latencyMs: totalLatencyMs, redirectChain }; }
      if ([301, 302, 303].includes(result.statusCode) && currentMethod !== 'GET') { currentMethod = 'GET'; currentBody = undefined; }
      continue;
    }
    return { ...result, latencyMs: totalLatencyMs, redirectChain };
  }
  throw new Error(`Too many redirects (>${maxRedirects}) from ${url}`);
}

// ─── Playground SSL Helper ─────────────────────────────────────────────────
async function getPlaygroundSslInfo(
  url: string,
  timeoutMs: number,
): Promise<{ daysRemaining: number; issuer: string; expiresAt: string; valid: boolean }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port, 10) : 443;

    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();

        if (!cert || !cert.valid_to) {
          reject(new Error('No certificate returned'));
          return;
        }

        const expiresAt = new Date(cert.valid_to);
        const now = new Date();
        const daysRemaining = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const valid = daysRemaining > 0 && cert.valid_from ? new Date(cert.valid_from) <= now : daysRemaining > 0;
        const issuerO = Array.isArray(cert.issuer?.O) ? cert.issuer.O[0] : cert.issuer?.O;
        const issuerCN = Array.isArray(cert.issuer?.CN) ? cert.issuer.CN[0] : cert.issuer?.CN;
        const issuer = (issuerO ?? issuerCN ?? 'Unknown') as string;

        resolve({
          daysRemaining,
          issuer,
          expiresAt: expiresAt.toISOString().split('T')[0],
          valid,
        });
      },
    );

    socket.setTimeout(timeoutMs, () => {
      socket.destroy(new Error('TLS connection timed out'));
    });

    socket.on('error', reject);
  });
}
