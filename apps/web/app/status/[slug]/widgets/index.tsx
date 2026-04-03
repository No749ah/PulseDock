// Widget renderer — maps widget type strings to components.
// Individual widget implementations live in category files.

import React from "react";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";
import { OfflineBannerWidget } from "./OfflineBannerWidget";
import { CustomMetricChart } from "./CustomMetricChart";

// Re-export shared types for external consumers
export type { MonitorSummary, Widget, ExtraData, WidgetProps } from "./shared";
export { formatRelative } from "./shared";
import { formatRelative as _formatRelative } from "./shared";

// ── Category imports ────────────────────────────────────────────────────

import {
  OverallSystemStatus,
  CurrentStatusBadge,
  MultiMonitorStatusGrid,
  ComponentStatusList,
  ServiceHealthMatrix,
  AggregateHealthScore,
  MonitorGroup,
  MultiStatusBadges,
  SSLCertificateStatus,
  DNSResolutionTime,
  MultiEnvironmentStatus,
  RegionStatusMap,
  ThirdPartyDependencies,
  SecurityAdvisory,
} from "./StatusWidgets";

import {
  UptimeBar,
  UptimeTimeline,
  RollingUptimeCards,
  StatusHistoryRibbon,
  UptimePercentageCard,
  UptimeHeatmap,
  UptimeComparisonChart,
} from "./UptimeWidgets";

import {
  ResponseTimeChart,
  ResponseTimeHeatmap,
  CheckHistoryFeed,
  LatencyPercentilesCard,
  PerformanceTrend,
  ApdexScore,
  ThroughputCounter,
  ResponseTimeComparison,
} from "./PerformanceWidgets";

import {
  ActiveIncidentBanner,
  IncidentHistory,
  ScheduledMaintenance,
  ActiveIncidentCount,
  IncidentTimeline,
  IncidentSeverityDistribution,
  IncidentDurationStats,
  PostMortemCard,
  NextMaintenanceCountdown,
  MaintenanceImpactList,
  MaintenanceCalendar,
} from "./IncidentWidgets";

import {
  Gauge,
  StatsGrid,
  MetricComparisonRow,
  SparklineRow,
  ProgressRing,
} from "./MetricWidgets";

import {
  TextBlock,
  Divider,
  AnnouncementBar,
  LinkList,
  FaqAccordion,
  SocialLinks,
  EmbedIframe,
  SubscriberForm,
  Countdown,
  ImageBanner,
  DataTable,
  RssFeedWidget,
  CodeBlock,
  VideoEmbed,
} from "./ContentWidgets";

import {
  CollapsibleSection,
  TabContainer,
  DependencyMap,
  TableOfContents,
  PageNavigation,
  ColumnLayout,
  StickyHeader,
} from "./LayoutWidgets";

import {
  VersionStatusGrid,
  VersionCheckBadge,
  UpdateSummary,
  VersionTimeline,
  OutdatedComponentsAlert,
  VersionComparisonTable,
  ChangelogWidget,
} from "./VersionWidgets";

import {
  SLASummary,
  DowntimeLog,
  MttrMttfCards,
  SLAComplianceTable,
} from "./SLAWidgets";

// Widget components can also be imported directly from category files:
// ./StatusWidgets, ./UptimeWidgets, ./PerformanceWidgets, ./IncidentWidgets,
// ./MetricWidgets, ./ContentWidgets, ./LayoutWidgets, ./VersionWidgets, ./SLAWidgets

// ── Internal types for renderWidget ─────────────────────────────────────

import type { Widget, MonitorSummary, ExtraData, WidgetProps } from "./shared";
import { getScopedMonitors, passesVisibilityRule, monitorDetailHref } from "./widgetIndexHelpers";

// ── Main render function ────────────────────────────────────────────────

export function renderWidget(widget: Widget, monitors: MonitorSummary[], extra?: Partial<ExtraData>): React.ReactNode {
  const fullExtra: ExtraData = { incidents: [], maintenance: [], recentChecks: [], widgetDataById: {}, ...extra };
  const props: WidgetProps = { widget, monitors, extra: fullExtra };
  const scopedMonitors = getScopedMonitors(widget, monitors);

  if (Boolean(widget.config.hideWhenNoData) && scopedMonitors.length === 0) {
    return null;
  }
  if (!passesVisibilityRule(widget, scopedMonitors)) {
    return null;
  }

  let content: React.ReactNode;
  const wrapError = (node: React.ReactNode) => (
    <WidgetErrorBoundary widgetType={widget.type}>{node}</WidgetErrorBoundary>
  );

  switch (widget.type) {
    // ── Status ──
    case "overall-status":
    case "overall-system-status":
      content = <OverallSystemStatus {...props} />;
      break;
    case "current-status-badge":
      content = <CurrentStatusBadge {...props} />;
      break;
    case "multi-monitor-status-grid":
      content = <MultiMonitorStatusGrid {...props} />;
      break;
    case "component-status-list":
      content = <ComponentStatusList {...props} />;
      break;
    case "service-health-matrix":
      content = <ServiceHealthMatrix {...props} />;
      break;
    case "aggregate-health-score":
      content = <AggregateHealthScore {...props} />;
      break;
    case "monitor-group":
    case "monitor-group-status":
      content = <MonitorGroup {...props} />;
      break;
    case "multi-status-badges":
      content = <MultiStatusBadges {...props} />;
      break;
    case "ssl-certificate-status":
      content = <SSLCertificateStatus {...props} />;
      break;
    case "dns-resolution-time":
      content = <DNSResolutionTime {...props} />;
      break;
    case "multi-environment-status":
      content = <MultiEnvironmentStatus {...props} />;
      break;
    case "region-status-map":
      content = <RegionStatusMap {...props} />;
      break;
    case "third-party-dependencies":
      content = <ThirdPartyDependencies {...props} />;
      break;
    case "security-advisory":
      content = <SecurityAdvisory {...props} />;
      break;

    // ── Uptime ──
    case "uptime-bar":
      content = <UptimeBar {...props} />;
      break;
    case "uptime-timeline":
      content = <UptimeTimeline {...props} />;
      break;
    case "rolling-uptime-cards":
      content = <RollingUptimeCards {...props} />;
      break;
    case "status-history-ribbon":
      content = <StatusHistoryRibbon {...props} />;
      break;
    case "uptime-percentage-card":
      content = <UptimePercentageCard {...props} />;
      break;
    case "uptime-heatmap":
      content = <UptimeHeatmap {...props} />;
      break;
    case "uptime-comparison-chart":
      content = <UptimeComparisonChart {...props} />;
      break;

    // ── Performance ──
    case "response-time-chart":
      content = <ResponseTimeChart {...props} />;
      break;
    case "response-time-heatmap":
      content = <ResponseTimeHeatmap {...props} />;
      break;
    case "check-history-feed":
      content = <CheckHistoryFeed {...props} />;
      break;
    case "latency-percentiles-card":
      content = <LatencyPercentilesCard {...props} />;
      break;
    case "performance-trend":
      content = <PerformanceTrend {...props} />;
      break;
    case "apdex-score":
      content = <ApdexScore {...props} />;
      break;
    case "throughput-counter":
      content = <ThroughputCounter {...props} />;
      break;
    case "response-time-comparison":
      content = <ResponseTimeComparison {...props} />;
      break;

    // ── Incidents & Maintenance ──
    case "active-incident-banner":
      content = <ActiveIncidentBanner {...props} />;
      break;
    case "incident-history":
      content = <IncidentHistory {...props} />;
      break;
    case "scheduled-maintenance":
      content = <ScheduledMaintenance {...props} />;
      break;
    case "active-incident-count":
      content = <ActiveIncidentCount {...props} />;
      break;
    case "incident-timeline":
      content = <IncidentTimeline {...props} />;
      break;
    case "incident-severity-distribution":
      content = <IncidentSeverityDistribution {...props} />;
      break;
    case "incident-duration-stats":
      content = <IncidentDurationStats {...props} />;
      break;
    case "post-mortem-card":
      content = <PostMortemCard {...props} />;
      break;
    case "next-maintenance-countdown":
      content = <NextMaintenanceCountdown {...props} />;
      break;
    case "maintenance-impact-list":
      content = <MaintenanceImpactList {...props} />;
      break;
    case "maintenance-calendar":
      content = <MaintenanceCalendar {...props} />;
      break;

    // ── Metrics ──
    case "gauge":
      content = <Gauge {...props} />;
      break;
    case "stats-grid":
      content = <StatsGrid {...props} />;
      break;
    case "metric-counter": {
      const widgetData = fullExtra.widgetDataById[widget.id] as {
        label?: string;
        value?: string | number;
        suffix?: string;
      } | undefined;
      const value = widgetData?.value ?? '—';
      const suffix = widgetData?.suffix ?? '';
      const label = (widgetData?.label as string | undefined) ?? (widget.config.label as string | undefined) ?? 'Metric';
      content = (
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <div className="text-3xl font-bold tabular-nums text-text-primary">
            {value}{suffix ? <span className="ml-1 text-sm text-text-secondary">{suffix}</span> : null}
          </div>
          <div className="mt-1 text-xs text-text-secondary">{label}</div>
        </div>
      );
      break;
    }
    case "metric-comparison-row":
      content = <MetricComparisonRow {...props} />;
      break;
    case "sparkline-row":
      content = <SparklineRow {...props} />;
      break;
    case "progress-ring":
      content = <ProgressRing {...props} />;
      break;

    // ── Content ──
    case "text-block":
      content = <TextBlock {...props} />;
      break;
    case "divider":
      content = <Divider />;
      break;
    case "announcement-bar":
      content = <AnnouncementBar {...props} />;
      break;
    case "link-list":
      content = <LinkList {...props} />;
      break;
    case "faq-accordion":
      content = <FaqAccordion {...props} />;
      break;
    case "social-links":
      content = <SocialLinks {...props} />;
      break;
    case "embed-iframe":
      content = <EmbedIframe {...props} />;
      break;
    case "subscriber-form":
      content = <SubscriberForm {...props} />;
      break;
    case "countdown":
      content = <Countdown {...props} />;
      break;
    case "image-banner":
      content = <ImageBanner {...props} />;
      break;
    case "data-table":
      content = <DataTable {...{ ...props, monitors: scopedMonitors }} />;
      break;
    case "rss-feed-widget":
      content = <RssFeedWidget {...props} />;
      break;
    case "code-block":
      content = <CodeBlock {...props} />;
      break;
    case "video-embed":
      content = <VideoEmbed {...props} />;
      break;

    // ── Layout ──
    case "collapsible-section":
      content = <CollapsibleSection {...props} />;
      break;
    case "tab-container":
      content = <TabContainer {...props} />;
      break;
    case "dependency-map":
      content = <DependencyMap {...props} />;
      break;
    case "table-of-contents":
      content = <TableOfContents {...props} />;
      break;
    case "page-navigation":
      content = <PageNavigation {...props} />;
      break;
    case "column-layout":
      content = <ColumnLayout {...props} />;
      break;
    case "sticky-header":
      content = <StickyHeader {...props} />;
      break;

    // ── Version ──
    case "version-status-grid":
      content = <VersionStatusGrid {...props} />;
      break;
    case "version-check-badge":
      content = <VersionCheckBadge {...props} />;
      break;
    case "update-summary":
      content = <UpdateSummary {...props} />;
      break;
    case "version-timeline":
      content = <VersionTimeline {...props} />;
      break;
    case "outdated-components-alert":
      content = <OutdatedComponentsAlert {...props} />;
      break;
    case "version-comparison-table":
      content = <VersionComparisonTable {...props} />;
      break;
    case "changelog-widget":
      content = <ChangelogWidget {...{ ...props, monitors: scopedMonitors }} />;
      break;

    // ── SLA ──
    case "sla-summary":
      content = <SLASummary {...props} />;
      break;
    case "sla-compliance-table":
      content = <SLAComplianceTable {...props} />;
      break;
    case "downtime-log":
      content = <DowntimeLog {...props} />;
      break;
    case "mttr-mttf-cards":
      content = <MttrMttfCards {...props} />;
      break;

    // ── Special (inline) ──
    case "last-updated-footer": {
      const widgetData = fullExtra.widgetDataById[widget.id] as {
        lastUpdated?: string;
        autoRefreshSec?: number;
      } | undefined;
      const ts = widgetData?.lastUpdated;
      const rel = ts ? _formatRelative(ts) : 'just now';
      const every = widgetData?.autoRefreshSec;
      content = (
        <div className="text-center text-xs text-text-secondary">
          Last updated {rel}{typeof every === 'number' && every > 0 ? ` · refreshes every ${every}s` : ''}
        </div>
      );
      break;
    }

    case "offline-banner": {
      const widgetData = fullExtra.widgetDataById[widget.id] as { config?: Record<string, unknown> } | undefined;
      const cfg = widgetData?.config ?? widget.config;
      content = (
        <OfflineBannerWidget
          message={(cfg.message as string | undefined)}
          bgColor={(cfg.bgColor as string | undefined)}
          textColor={(cfg.textColor as string | undefined)}
        />
      );
      break;
    }

    case "custom-metric-chart": {
      const widgetData = fullExtra.widgetDataById[widget.id] as {
        labels: string[];
        values: number[];
        unit: string;
        chartType: string;
      } | undefined;
      content = (
        <CustomMetricChart
          data={widgetData}
          title={(widget.config.title as string | undefined)}
          subtitle={(widget.config.subtitle as string | undefined)}
          chartType={(widget.config.chartType as string | undefined)}
        />
      );
      break;
    }

    default:
      content = (
        <div className="rounded-xl border border-border bg-surface/50 p-4 text-center text-sm text-text-secondary">
          Unknown widget: {widget.type}
        </div>
      );
      break;
  }

  // ── Wrapper: click actions, mobile behavior, styling ──
  const clickAction = (widget.config.clickAction as string | undefined) ?? "none";
  const clickUrl = widget.config.clickUrl as string | undefined;
  const href = clickAction === "external-url"
    ? clickUrl
    : clickAction === "monitor-detail"
      ? monitorDetailHref(widget, scopedMonitors)
      : undefined;

  const mobileBehavior = (widget.config.mobileBehavior as string | undefined) ?? "normal";
  const mobileClass =
    mobileBehavior === "hidden"
      ? "max-sm:hidden"
      : mobileBehavior === "full-width"
        ? "max-sm:w-full"
        : mobileBehavior === "collapsed"
          ? "max-sm:[&>*]:max-h-28 max-sm:[&>*]:overflow-hidden"
          : "";

  const wrapperStyle: React.CSSProperties = {
    borderRadius: typeof widget.config.borderRadius === "number" ? `${widget.config.borderRadius}px` : undefined,
    padding: typeof widget.config.padding === "number" ? `${widget.config.padding}px` : undefined,
  };

  const wrapperClass = [
    mobileClass,
    widget.config.showBorder === true ? "border border-border" : "",
    href ? "cursor-pointer" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const wrapped = <div className={wrapperClass} style={wrapperStyle}>{wrapError(content)}</div>;

  if (!href) return wrapped;

  const external = clickAction === "external-url";
  return (
    <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer noopener" : undefined}>
      {wrapped}
    </a>
  );
}
