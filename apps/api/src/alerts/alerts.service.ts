import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { MailerService } from '../common/mailer.service';
import type { AlertChannel, Monitor, MonitorRun } from '../types';
import { MetricsService } from '../common/metrics.service';
import { RealtimeEvents } from '../realtime/realtime.events';
import { NotificationsService } from '../notifications/notifications.service';
import { AlertsDeliveryService } from './alerts-delivery.service';
import { AlertsRoutingService } from './alerts-routing.service';
import { AlertsAnalysisService } from './alerts-analysis.service';

/**
 * Thin facade over alert sub-services.
 *
 * Maintains the original public API so callers (controllers, checks, escalation)
 * continue to inject `AlertsService` unchanged.  All heavy logic lives in:
 *
 *  - **AlertsDeliveryService** — channel dispatch, retry, batching, template rendering
 *  - **AlertsRoutingService** — failure notification, SLA alerts, grouping, escalation
 *  - **AlertsAnalysisService** — noise analysis, response time, channel health, delivery stats
 *
 * The sub-services are instantiated internally from the same DI dependencies
 * so existing tests (which `new AlertsService(prisma, metrics, mailer, notifications)`)
 * continue to work without changes.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  /** Sub-service: channel dispatch, retry, batching */
  readonly delivery: AlertsDeliveryService;

  /** Sub-service: failure notification routing, SLA, grouping */
  readonly routing: AlertsRoutingService;

  /** Sub-service: noise analysis, delivery stats, channel health */
  readonly analysis: AlertsAnalysisService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly mailer: MailerService,
    private readonly notifications: NotificationsService,
    @Optional() realtime?: RealtimeEvents,
  ) {
    this.delivery = new AlertsDeliveryService(prisma, metrics, mailer);
    this.routing = new AlertsRoutingService(prisma, metrics, notifications, this.delivery, realtime);
    this.analysis = new AlertsAnalysisService(prisma);
  }

  // ─── Delivery delegates ─────────────────────────────────────────────

  /** In-memory batch queue — exposed for backward compat with tests. */
  get alertBatchQueue() {
    return this.delivery.alertBatchQueue;
  }

  /**
   * Low-level send to a single channel (exposed for tests that cast to access internals).
   */
  async send(channel: AlertChannel, text: string, extra?: unknown): Promise<void> {
    return this.delivery.send(channel, text, extra);
  }

  /** Flush a pending alert batch for a channel. */
  async flushBatch(channelId: string): Promise<void> {
    return this.delivery.flushBatch(channelId);
  }

  /** Generic retry wrapper. */
  async sendWithRetryFn(fn: () => Promise<void>, maxRetries = 3): Promise<void> {
    return this.delivery.sendWithRetryFn(fn, maxRetries);
  }

  /** Send a test alert to the given channel. */
  async notifyTest(channel: AlertChannel): Promise<void> {
    return this.delivery.notifyTest(channel);
  }

  /**
   * Public "send to channel" used by the escalation service.
   */
  async sendToChannel(
    channel: AlertChannel,
    text: string,
    extra?: unknown,
    monitorId?: string,
    monitorName?: string,
  ): Promise<void> {
    return this.delivery.sendToChannel(channel, text, extra, monitorId, monitorName);
  }

  /**
   * Preview template rendering with sample data.
   */
  previewPayload(
    channel: AlertChannel,
    template?: string,
  ): { rendered: string; valid: boolean; error?: string } {
    return this.delivery.previewPayload(channel, template);
  }

  /**
   * Render a payload template (exposed for tests).
   */
  renderPayloadTemplate(template: string, ctx: { text: string; channel: AlertChannel; extra?: unknown }): string {
    return this.delivery.renderPayloadTemplate(template, ctx);
  }

  /**
   * Retry a single failed delivery by log ID.
   */
  async retryDelivery(
    deliveryId: string,
    channel: AlertChannel,
  ): Promise<{ success: boolean; error?: string }> {
    return this.delivery.retryDelivery(deliveryId, channel);
  }

  /**
   * Retry all failed deliveries for a channel (last 24h, up to 10).
   */
  async retryAllFailed(
    channel: AlertChannel,
  ): Promise<Array<{ deliveryId: string; success: boolean; error?: string }>> {
    return this.delivery.retryAllFailed(channel);
  }

  // ─── Routing delegates ──────────────────────────────────────────────

  /**
   * Process a monitor failure/recovery and dispatch alerts to all matching channels.
   */
  async notifyMonitorFailure(
    monitor: Monitor,
    run: MonitorRun,
    context?: { levelChanged?: boolean; previousLevel?: string | null; failureStreak?: number; isFlapping?: boolean },
  ): Promise<void> {
    return this.routing.notifyMonitorFailure(monitor, run, context);
  }

  /**
   * Dispatch alerts with grouping / correlation support.
   * Used internally by routing; exposed for tests.
   */
  async notifyWithGrouping(
    channel: AlertChannel,
    monitor: Monitor,
    run: MonitorRun,
    text: string,
    extra?: unknown,
  ): Promise<void> {
    return this.routing.notifyWithGrouping(channel, monitor, run, text, extra);
  }

  /** Flush alert groups past their window. */
  async flushExpiredAlertGroups(): Promise<void> {
    return this.routing.flushExpiredAlertGroups();
  }

  /** SLA breach notification. */
  async notifySlaBreached(
    monitorId: string,
    monitorName: string,
    userId: string,
    actualPct: number,
    targetPct: number,
    periodDays: number,
  ): Promise<void> {
    return this.routing.notifySlaBreached(monitorId, monitorName, userId, actualPct, targetPct, periodDays);
  }

  /** SLA recovery notification. */
  async notifySlaRecovered(
    monitorId: string,
    monitorName: string,
    userId: string,
    actualPct: number,
    targetPct: number,
    periodDays: number,
  ): Promise<void> {
    return this.routing.notifySlaRecovered(monitorId, monitorName, userId, actualPct, targetPct, periodDays);
  }

  /** SLA burn rate alert. */
  async notifyBurnRateAlert(
    monitorId: string,
    monitorName: string,
    userId: string,
    burnRate1h: number,
    burnRate6h: number,
    budgetConsumedPct: number,
    slaTarget: number,
  ): Promise<void> {
    return this.routing.notifyBurnRateAlert(monitorId, monitorName, userId, burnRate1h, burnRate6h, budgetConsumedPct, slaTarget);
  }

  // ─── Analysis delegates ─────────────────────────────────────────────

  /** Alert noise analysis. */
  async noiseAnalysis(userId: string, periodDays = 7) {
    return this.analysis.noiseAnalysis(userId, periodDays);
  }

  /** Alert delivery response time stats. */
  async deliveryResponseTime(userId: string, days: number) {
    return this.analysis.deliveryResponseTime(userId, days);
  }

  /** Alert channel health dashboard. */
  async channelsHealth(userId: string) {
    return this.analysis.channelsHealth(userId);
  }

  /** Per-channel delivery stats. */
  async deliveryStats(userId: string, channelId: string) {
    return this.analysis.deliveryStats(userId, channelId);
  }
}
