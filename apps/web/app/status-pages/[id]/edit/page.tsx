"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Save,
  Eye,
  ExternalLink,
  ChevronLeft,
  LayoutGrid,
  Globe,
  EyeOff,
  Activity,
  BarChart2,
  AlertTriangle,
  Zap,
  Type,
  Minus,
  Clock,
  TrendingUp,
  CheckCircle,
  Grid,
  GripVertical,
  X,
  Settings,
  CalendarDays,
  FileText,
  Image,
  Table2,
  Rss,
  Copy,
  Undo2,
  Redo2,
  Lock,
  Unlock,
  Monitor,
  Tablet,
  Smartphone,
  ZoomIn,
  ZoomOut,
  Maximize2,
  LayoutTemplate,
  Code2,
  Play,
  Settings2,
  RefreshCw,
  History,
  AlignStartVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  AlignCenterVertical,
  AlignCenterHorizontal,
  GitFork,
  Layers,
  ShieldAlert,
  ChevronUp,
  ChevronsUp,
  ChevronsDown,
  ChevronDown,
} from "lucide-react";
import { api } from "../../../../lib/api";
import { getUser } from "../../../../components/auth";
import { useToast } from "../../../../components/ui/toast";
import { MultiMonitorPicker } from "../../components/MultiMonitorPicker";

// ── Types ──────────────────────────────────────────────────────────────────

interface Widget {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  locked?: boolean;
  zOrder?: number;
  config: {
    monitorId?: string;
    monitorIds?: string[];
    monitorMode?: "single" | "multiple" | "all";
    label?: string;
    periodDays?: number;
    text?: string;
    [key: string]: unknown;
  };
}

type ViewportMode = "desktop" | "tablet" | "mobile";

interface PageSettings {
  autoRefreshInterval?: number; // seconds, 0 = off
  showBranding?: boolean;
  logoUrl?: string;
  faviconUrl?: string;
  accentColor?: string;
  theme?: "dark" | "light" | "system";
  fontFamily?: "inter" | "roboto" | "system" | "mono";
  backgroundStyle?: "solid" | "gradient" | "grid-dots";
  backgroundColor?: string;
  // SEO
  metaTitle?: string;
  metaDescription?: string;
  ogImageUrl?: string;
  robotsIndex?: boolean;
  // Webhook notifications
  notifyWebhookUrl?: string;
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
}

interface PageLayout {
  widgets: Widget[];
  settings?: PageSettings;
}

interface StatusPage {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  hasPassword: boolean;
  notifyWebhookUrl?: string | null;
  slackWebhookUrl?: string | null;
  discordWebhookUrl?: string | null;
  layout: PageLayout;
}

interface Monitor {
  id: string;
  name: string;
  type: string;
  folderId?: string | null;
  tags?: { id: string; name: string; color?: string }[];
}

interface TagOption {
  id: string;
  name: string;
  color: string;
}

interface FolderOption {
  id: string;
  name: string;
}

interface WidgetPaletteItem {
  type: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
  defaultW: number;
  defaultH: number;
}

// ── Widget palette ─────────────────────────────────────────────────────────

const WIDGET_PALETTE: WidgetPaletteItem[] = [
  { type: "overall-system-status", label: "Overall Status", description: "Hero operational / degraded / outage banner", icon: CheckCircle, category: "Status", defaultW: 12, defaultH: 2 },
  { type: "current-status-badge", label: "Status Badge", description: "Green/yellow/red pill for a single monitor", icon: Zap, category: "Status", defaultW: 3, defaultH: 2 },
  { type: "multi-monitor-status-grid", label: "Monitor Grid", description: "Grid of status badges for multiple monitors", icon: Grid, category: "Status", defaultW: 12, defaultH: 3 },
  { type: "active-incident-banner", label: "Incident Banner", description: "Full-width banner when something is down", icon: AlertTriangle, category: "Status", defaultW: 12, defaultH: 2 },
  { type: "uptime-bar", label: "Uptime Bar", description: "Shows uptime % over a selectable period", icon: Activity, category: "Uptime", defaultW: 6, defaultH: 2 },
  { type: "uptime-timeline", label: "Uptime Timeline", description: "90-day bar chart (green/red per day)", icon: BarChart2, category: "Uptime", defaultW: 12, defaultH: 3 },
  { type: "sla-summary", label: "SLA Summary", description: "SLA target vs actual for a period", icon: TrendingUp, category: "Uptime", defaultW: 4, defaultH: 2 },
  { type: "response-time-chart", label: "Response Time", description: "Sparkline or area chart of latency", icon: TrendingUp, category: "Performance", defaultW: 6, defaultH: 3 },
  { type: "response-time-heatmap", label: "Latency Heatmap", description: "Hour-of-day × day-of-week latency heatmap (GitHub-style)", icon: BarChart2, category: "Performance", defaultW: 12, defaultH: 4 },
  { type: "check-history-feed", label: "Check History", description: "Live-updating log of recent check results", icon: Clock, category: "Performance", defaultW: 12, defaultH: 4 },
  { type: "incident-history", label: "Incident History", description: "Paginated list of past incidents", icon: AlertTriangle, category: "Incidents", defaultW: 12, defaultH: 4 },
  { type: "text-block", label: "Text Block", description: "Free text / markdown for announcements", icon: Type, category: "Content", defaultW: 6, defaultH: 2 },
  { type: "scheduled-maintenance", label: "Maintenance", description: "Shows upcoming maintenance windows", icon: Clock, category: "Content", defaultW: 6, defaultH: 2 },
  { type: "monitor-group", label: "Monitor Group", description: "Group monitors by tag or folder with status overview", icon: LayoutGrid, category: "Status", defaultW: 6, defaultH: 3 },
  { type: "multi-status-badges", label: "Multi Status", description: "Multiple monitor status badges in a compact grid", icon: CheckCircle, category: "Status", defaultW: 12, defaultH: 3 },
  { type: "version-status-grid", label: "Version Grid", description: "Grid showing current vs latest version for all monitors", icon: BarChart2, category: "Versions", defaultW: 12, defaultH: 4 },
  { type: "version-check-badge", label: "Version Badge", description: "Single monitor version status badge", icon: CheckCircle, category: "Versions", defaultW: 6, defaultH: 2 },
  { type: "update-summary", label: "Update Summary", description: "Overview: up-to-date / minor / major updates available", icon: TrendingUp, category: "Versions", defaultW: 12, defaultH: 2 },
  { type: "component-status-list", label: "Component Status", description: "Per-service Operational / Degraded / Outage with overall header", icon: CheckCircle, category: "Status", defaultW: 8, defaultH: 4 },
  { type: "rolling-uptime-cards", label: "Rolling Uptime", description: "Uptime % cards: 24h / 7d / 30d / 90d side by side", icon: Activity, category: "Uptime", defaultW: 12, defaultH: 2 },
  { type: "status-history-ribbon", label: "Status Ribbon", description: "GitHub-style daily status bars per monitor for the last 90 days", icon: BarChart2, category: "Uptime", defaultW: 12, defaultH: 3 },
  { type: "uptime-percentage-card", label: "Uptime %", description: "Big number uptime display with trend arrow vs previous period", icon: TrendingUp, category: "Uptime", defaultW: 4, defaultH: 2 },
  { type: "service-health-matrix", label: "Health Matrix", description: "Monitors × environments/regions matrix table with status cells", icon: Grid, category: "Status", defaultW: 12, defaultH: 4 },
  { type: "aggregate-health-score", label: "Health Score", description: "Weighted 0–100 health score gauge from all monitors", icon: Activity, category: "Status", defaultW: 4, defaultH: 3 },
  { type: "latency-percentiles-card", label: "Latency Percentiles", description: "P50/P95/P99 latency with trend arrows vs previous period", icon: TrendingUp, category: "Performance", defaultW: 6, defaultH: 3 },
  { type: "downtime-log", label: "Downtime Log", description: "Chronological list of outage events with duration and timestamps", icon: Clock, category: "Incidents", defaultW: 8, defaultH: 4 },
  { type: "active-incident-count", label: "Active Incidents", description: "Animated big-number counter of active (unresolved) incidents", icon: AlertTriangle, category: "Incidents", defaultW: 4, defaultH: 3 },
  { type: "mttr-mttf-cards", label: "MTTR / MTTF", description: "Mean Time to Recovery and Mean Time to Failure side-by-side", icon: Activity, category: "Incidents", defaultW: 6, defaultH: 3 },
  { type: "sla-compliance-table", label: "SLA Compliance", description: "Multi-monitor SLA pass/fail table for a configurable period", icon: TrendingUp, category: "SLA/Uptime", defaultW: 12, defaultH: 4 },
  { type: "uptime-heatmap", label: "Uptime Heatmap", description: "7-day × 24-hour GitHub-style uptime grid per monitor", icon: BarChart2, category: "SLA/Uptime", defaultW: 12, defaultH: 3 },
  { type: "incident-timeline", label: "Incident Timeline", description: "Chronological timeline with Investigating → Resolved status updates", icon: AlertTriangle, category: "Incidents", defaultW: 8, defaultH: 5 },
  { type: "ssl-certificate-status", label: "SSL Certificate", description: "SSL cert expiry: domain, days remaining, issuer, grade", icon: CheckCircle, category: "Performance", defaultW: 6, defaultH: 3 },
  { type: "incident-severity-distribution", label: "Severity Distribution", description: "Donut chart: Critical / Major / Minor incidents over a period", icon: Activity, category: "Incidents", defaultW: 6, defaultH: 3 },
  { type: "incident-duration-stats", label: "Incident Duration Stats", description: "Avg / Longest / Shortest incident duration over a configurable period", icon: Clock, category: "Incidents", defaultW: 6, defaultH: 3 },
  { type: "post-mortem-card", label: "Post-Mortem Card", description: "RCA-style summary of the most recent resolved incident with timeline", icon: AlertTriangle, category: "Incidents", defaultW: 8, defaultH: 5 },
  { type: "performance-trend", label: "Performance Trend", description: "Week-over-week latency change with sparkline", icon: TrendingUp, category: "Performance", defaultW: 6, defaultH: 3 },
  { type: "apdex-score", label: "Apdex Score", description: "Application Performance Index (0.0–1.0) with breakdown bar", icon: Activity, category: "Performance", defaultW: 6, defaultH: 4 },
  { type: "throughput-counter", label: "Throughput Counter", description: "Checks per hour live counter with 24-bar sparkline", icon: BarChart2, category: "Performance", defaultW: 6, defaultH: 3 },
  { type: "response-time-comparison", label: "Response Time Comparison", description: "Overlay line chart comparing latency across multiple services", icon: TrendingUp, category: "Performance", defaultW: 12, defaultH: 4 },
  { type: "uptime-comparison-chart", label: "Uptime Comparison", description: "Horizontal bar chart comparing uptime % across monitors", icon: BarChart2, category: "Performance", defaultW: 8, defaultH: 4 },
  { type: "next-maintenance-countdown", label: "Maintenance Countdown", description: "Countdown timer to the next scheduled maintenance window", icon: Clock, category: "Maintenance", defaultW: 6, defaultH: 3 },
  { type: "maintenance-impact-list", label: "Maintenance Impact", description: "List of upcoming maintenance windows with affected services", icon: AlertTriangle, category: "Maintenance", defaultW: 8, defaultH: 4 },
  { type: "version-timeline", label: "Version Timeline", description: "Chronological list of version updates detected across services", icon: TrendingUp, category: "Versions", defaultW: 8, defaultH: 5 },
  { type: "outdated-components-alert", label: "Outdated Components", description: "Highlights monitors where current ≠ latest version with severity badges", icon: AlertTriangle, category: "Versions", defaultW: 8, defaultH: 4 },
  { type: "version-comparison-table", label: "Version Comparison", description: "Side-by-side table: Service | Current | Latest | Status", icon: BarChart2, category: "Versions", defaultW: 10, defaultH: 4 },
  { type: "dns-resolution-time", label: "DNS Resolution Time", description: "Avg DNS/response latency tracker with trend and per-monitor breakdown", icon: TrendingUp, category: "Performance", defaultW: 6, defaultH: 4 },
  { type: "gauge", label: "Gauge / Speedometer", description: "Circular gauge for uptime%, SLA compliance%, or Apdex score", icon: Activity, category: "Metrics", defaultW: 4, defaultH: 4 },
  { type: "stats-grid", label: "Stats Grid", description: "2×2/3×3 grid of key metrics: uptime, incidents, response time, alerts", icon: Grid, category: "Metrics", defaultW: 12, defaultH: 3 },
  { type: "metric-comparison-row", label: "Metric Comparison Row", description: "Horizontal strip of metric counters: uptime, latency, checks, incidents", icon: BarChart2, category: "Metrics", defaultW: 12, defaultH: 2 },
  { type: "sparkline-row", label: "Sparkline Row", description: "Mini sparkline charts side by side for quick latency comparison across monitors", icon: TrendingUp, category: "Metrics", defaultW: 12, defaultH: 3 },
  { type: "progress-ring", label: "Progress Ring", description: "Circular Apple Watch-style ring showing uptime%, SLA compliance, or custom value", icon: Activity, category: "Metrics", defaultW: 4, defaultH: 4 },
  { type: "announcement-bar", label: "Announcement Bar", description: "Full-width colored info/warning/danger/success banner for important messages", icon: AlertTriangle, category: "Content", defaultW: 12, defaultH: 1 },
  { type: "link-list", label: "Link List", description: "List of external links with icons: Docs, Support, Changelog, API Status", icon: Type, category: "Content", defaultW: 6, defaultH: 3 },
  { type: "faq-accordion", label: "FAQ / Accordion", description: "Collapsible Q&A sections — config-driven, no monitor data needed", icon: Type, category: "Content", defaultW: 8, defaultH: 4 },
  { type: "social-links", label: "Social Links", description: "Row of social media icon buttons (GitHub, Twitter/X, Discord, LinkedIn, etc.)", icon: Type, category: "Content", defaultW: 6, defaultH: 2 },
  { type: "embed-iframe", label: "Embed / iFrame", description: "Embed external dashboards or Grafana panels in an iframe", icon: Type, category: "Content", defaultW: 12, defaultH: 6 },
  { type: "subscriber-form", label: "Subscriber Form", description: "Email subscription form — let visitors subscribe to status updates", icon: Type, category: "Content", defaultW: 6, defaultH: 3 },
  { type: "countdown", label: "Countdown", description: "Countdown timer to a planned event (maintenance end, product launch)", icon: Clock, category: "Content", defaultW: 6, defaultH: 3 },
  { type: "divider", label: "Divider", description: "Visual separator or empty space", icon: Minus, category: "Content", defaultW: 12, defaultH: 1 },
  { type: "maintenance-calendar", label: "Maintenance Calendar", description: "Month calendar view showing maintenance windows as colored day highlights", icon: CalendarDays, category: "Maintenance", defaultW: 6, defaultH: 4 },
  { type: "changelog-widget", label: "Changelog Widget", description: "Shows current vs latest version info from version-check monitors", icon: FileText, category: "Versions", defaultW: 6, defaultH: 3 },
  { type: "image-banner", label: "Image / Banner", description: "Display an image or banner with optional link and caption", icon: Image, category: "Content", defaultW: 12, defaultH: 3 },
  { type: "data-table", label: "Data Table", description: "Tabular display of monitor data with configurable columns", icon: Table2, category: "Status", defaultW: 12, defaultH: 4 },
  { type: "rss-feed-widget", label: "RSS Feed", description: "Shows an auto-generated RSS feed link for subscribers", icon: Rss, category: "Content", defaultW: 6, defaultH: 2 },
  { type: "code-block", label: "Code Block", description: "Display a code snippet with syntax highlighting label", icon: Code2, category: "Content", defaultW: 8, defaultH: 3 },
  { type: "video-embed", label: "Video Embed", description: "Embed a YouTube or Vimeo video", icon: Play, category: "Content", defaultW: 12, defaultH: 5 },
  { type: "collapsible-section", label: "Collapsible Section", description: "Expandable/collapsible content section with a title header", icon: ChevronLeft, category: "Content", defaultW: 12, defaultH: 3 },
  { type: "dependency-map", label: "Dependency Map", description: "Visual service dependency graph with live status on each node. Define edges between monitors in config.", icon: GitFork, category: "Status", defaultW: 12, defaultH: 5 },
  { type: "multi-environment-status", label: "Multi-Environment Status", description: "Side-by-side status comparison across environments (prod/staging/dev). Configure envMonitors mapping.", icon: Layers, category: "Status", defaultW: 12, defaultH: 4 },
  { type: "tab-container", label: "Tab Container", description: "Multiple tabs each showing configurable text/content sections.", icon: LayoutGrid, category: "Content", defaultW: 12, defaultH: 4 },
{ type: "region-status-map", label: "Region Status Map", description: "Status overview per geographic region. Configure regionMonitors mapping.", icon: Globe, category: "Status", defaultW: 12, defaultH: 4 },
{ type: "third-party-dependencies", label: "Third-Party Dependencies", description: "Live status check of external services. Configure services array.", icon: ExternalLink, category: "Status", defaultW: 8, defaultH: 5 },
{ type: "security-advisory", label: "Security Advisory", description: "GitHub Security Advisories for a package. Configure packageName.", icon: ShieldAlert, category: "Status", defaultW: 8, defaultH: 5 },
{ type: "column-layout", label: "Column Layout", description: "2, 3, or 4 column text/content layout within a single row", icon: LayoutGrid, category: "Content", defaultW: 12, defaultH: 3 },
{ type: "sticky-header", label: "Sticky Status Header", description: "Fixed top bar showing overall system status. Pin to top of page for always-visible status.", icon: ChevronUp, category: "Status", defaultW: 12, defaultH: 1 },
{ type: "table-of-contents", label: "Table of Contents", description: "Numbered jump-link list for navigating page sections. Configure items as anchor links.", icon: AlignStartVertical, category: "Content", defaultW: 4, defaultH: 3 },
{ type: "page-navigation", label: "Page Navigation", description: "Grid of links to other published status pages in your account.", icon: Globe, category: "Content", defaultW: 8, defaultH: 3 },
{ type: "offline-banner", label: "Offline Banner", description: "Dismissible banner that auto-shows when the visitor's connection is lost.", icon: AlertTriangle, category: "Status", defaultW: 12, defaultH: 1 },
{ type: "custom-metric-chart", label: "Custom Metric Chart", description: "Time-series chart for latency, uptime %, or check count. Choose line, bar, or area style.", icon: BarChart2, category: "Metrics", defaultW: 8, defaultH: 4 },
];

const CATEGORIES = [...new Set(WIDGET_PALETTE.map((w) => w.category))];

// ── Template Gallery ────────────────────────────────────────────────────────

interface StatusTemplate {
  id: string;
  name: string;
  description: string;
  preview: string;
  widgets: Omit<Widget, 'id'>[];
}

const STATUS_TEMPLATES: StatusTemplate[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean overall status + uptime bar. Perfect for simple status pages.',
    preview: '⚡',
    widgets: [
      { type: 'overall-system-status', x: 0, y: 0, w: 12, h: 2, config: {} },
      { type: 'uptime-bar', x: 0, y: 2, w: 12, h: 2, config: { periodDays: 30 } },
    ],
  },
  {
    id: 'full-dashboard',
    name: 'Full Dashboard',
    description: 'Comprehensive status page with uptime, performance, and incidents.',
    preview: '📊',
    widgets: [
      { type: 'overall-system-status', x: 0, y: 0, w: 12, h: 2, config: {} },
      { type: 'active-incident-banner', x: 0, y: 2, w: 12, h: 2, config: {} },
      { type: 'rolling-uptime-cards', x: 0, y: 4, w: 12, h: 2, config: {} },
      { type: 'uptime-timeline', x: 0, y: 6, w: 8, h: 3, config: { periodDays: 90 } },
      { type: 'response-time-chart', x: 8, y: 6, w: 4, h: 3, config: {} },
      { type: 'component-status-list', x: 0, y: 9, w: 6, h: 4, config: {} },
      { type: 'incident-history', x: 6, y: 9, w: 6, h: 4, config: {} },
      { type: 'status-history-ribbon', x: 0, y: 13, w: 12, h: 3, config: {} },
    ],
  },
  {
    id: 'sla-report',
    name: 'SLA Report',
    description: 'SLA compliance, uptime percentages, and downtime statistics.',
    preview: '📈',
    widgets: [
      { type: 'overall-system-status', x: 0, y: 0, w: 12, h: 2, config: {} },
      { type: 'sla-compliance-table', x: 0, y: 2, w: 12, h: 4, config: {} },
      { type: 'rolling-uptime-cards', x: 0, y: 6, w: 12, h: 2, config: {} },
      { type: 'uptime-heatmap', x: 0, y: 8, w: 12, h: 3, config: {} },
      { type: 'mttr-mttf-cards', x: 0, y: 11, w: 6, h: 3, config: {} },
      { type: 'downtime-log', x: 6, y: 11, w: 6, h: 3, config: {} },
    ],
  },
  {
    id: 'incident-page',
    name: 'Incident Page',
    description: 'Focus on active incidents, timeline, and post-mortems.',
    preview: '🚨',
    widgets: [
      { type: 'active-incident-banner', x: 0, y: 0, w: 12, h: 2, config: {} },
      { type: 'active-incident-count', x: 0, y: 2, w: 4, h: 3, config: {} },
      { type: 'incident-timeline', x: 4, y: 2, w: 8, h: 5, config: {} },
      { type: 'incident-history', x: 0, y: 7, w: 8, h: 4, config: {} },
      { type: 'incident-severity-distribution', x: 8, y: 7, w: 4, h: 4, config: {} },
      { type: 'post-mortem-card', x: 0, y: 11, w: 12, h: 5, config: {} },
    ],
  },
  {
    id: 'version-overview',
    name: 'Version Overview',
    description: 'Track versions of all your tools and services.',
    preview: '🏷️',
    widgets: [
      { type: 'update-summary', x: 0, y: 0, w: 12, h: 2, config: {} },
      { type: 'version-status-grid', x: 0, y: 2, w: 12, h: 4, config: {} },
      { type: 'outdated-components-alert', x: 0, y: 6, w: 6, h: 4, config: {} },
      { type: 'version-timeline', x: 6, y: 6, w: 6, h: 4, config: {} },
    ],
  },
  {
    id: 'performance',
    name: 'Performance',
    description: 'Response times, latency percentiles, and performance trends.',
    preview: '⚡',
    widgets: [
      { type: 'overall-system-status', x: 0, y: 0, w: 12, h: 2, config: {} },
      { type: 'latency-percentiles-card', x: 0, y: 2, w: 6, h: 3, config: {} },
      { type: 'apdex-score', x: 6, y: 2, w: 6, h: 3, config: {} },
      { type: 'response-time-chart', x: 0, y: 5, w: 12, h: 3, config: {} },
      { type: 'response-time-heatmap', x: 0, y: 8, w: 12, h: 4, config: {} },
      { type: 'performance-trend', x: 0, y: 12, w: 6, h: 3, config: {} },
      { type: 'throughput-counter', x: 6, y: 12, w: 6, h: 3, config: {} },
    ],
  },
  {
    id: 'maintenance',
    name: 'Maintenance',
    description: 'Scheduled maintenance windows and countdowns.',
    preview: '🔧',
    widgets: [
      { type: 'overall-system-status', x: 0, y: 0, w: 12, h: 2, config: {} },
      { type: 'scheduled-maintenance', x: 0, y: 2, w: 6, h: 3, config: {} },
      { type: 'maintenance-calendar', x: 6, y: 2, w: 6, h: 3, config: {} },
      { type: 'next-maintenance-countdown', x: 0, y: 5, w: 6, h: 3, config: {} },
      { type: 'maintenance-impact-list', x: 6, y: 5, w: 6, h: 3, config: {} },
    ],
  },
];

const ROW_H = 80;
const COL_COUNT = 12;
const MULTI_MODE_PRIMARY_WIDGETS = new Set([
  "uptime-bar",
  "uptime-timeline",
  "sla-summary",
  "response-time-chart",
  "version-check-badge",
]);

function getMultiModeHelperText(widgetType: string): string {
  if (MULTI_MODE_PRIMARY_WIDGETS.has(widgetType)) {
    return "This widget uses the first selected monitor as its primary series in multi-monitor mode.";
  }

  return "This widget will render data for all selected monitors.";
}

function getDefaultMultiMonitorIds(widget: Widget, monitors: Monitor[]): string[] {
  const configured = Array.isArray(widget.config.monitorIds)
    ? widget.config.monitorIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  if (configured.length > 0) return configured;

  const singleId = typeof widget.config.monitorId === "string" ? widget.config.monitorId : undefined;
  const ordered = [singleId, ...monitors.map((m) => m.id)].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  const unique = Array.from(new Set(ordered));
  const limit = MULTI_MODE_PRIMARY_WIDGETS.has(widget.type) ? 1 : 6;
  return unique.slice(0, limit);
}

// ── Palette widget (draggable from sidebar) ──────────────────────────────

function PaletteWidget({ item, onQuickAdd }: { item: WidgetPaletteItem; onQuickAdd: (type: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: { source: "palette", widgetType: item.type, paletteItem: item },
  });
  const Icon = item.icon;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onDoubleClick={() => onQuickAdd(item.type)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onQuickAdd(item.type);
        }
      }}
      className={`w-full cursor-grab rounded-xl border border-border bg-bg p-3 text-left transition hover:border-accent/50 hover:bg-accent/5 active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${isDragging ? "opacity-40" : ""}`}
      title="Drag to canvas or double-click to add"
      aria-label={`Widget ${item.label}. Drag to canvas or double-click to add.`}
    >
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="text-xs font-semibold text-text-primary">{item.label}</span>
      </div>
      <p className="text-[10px] leading-tight text-text-secondary">{item.description}</p>
      <p className="mt-1.5 text-[10px] text-text-secondary/60">Drag or double-click to add</p>
    </div>
  );
}

// ── Canvas widget (draggable on canvas) ─────────────────────────────────

/** Live preview content for widgets in the editor */
function WidgetPreview({ type, config, w }: { type: string; config: Record<string, unknown>; w: number }) {
  const label = (config.label as string) || "";
  switch (type) {
    case "overall-status":
      return (<div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-success animate-pulse" /><span className="text-sm font-semibold text-success">{label || "All Systems Operational"}</span></div>);
    case "current-status-badge":
      return (<div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-success" /><span className="text-xs font-medium text-text-primary">{label || "Monitor"}</span><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-medium">Up</span></div>);
    case "uptime-bar":
      return (<div className="space-y-1"><div className="flex justify-between text-[10px] text-text-secondary"><span>{label || "Uptime"}</span><span className="text-success font-medium">99.9%</span></div><div className="h-2 rounded-full bg-surface-elevated overflow-hidden"><div className="h-full w-[99.9%] rounded-full bg-success/70" /></div></div>);
    case "uptime-timeline":
      return (<div className="space-y-1">{label && <span className="text-[10px] text-text-secondary">{label}</span>}<div className="flex gap-px">{Array.from({ length: Math.min(w * 3, 30) }).map((_, i) => (<div key={i} className={`flex-1 h-4 rounded-sm ${i === 18 ? "bg-warning/60" : i === 22 ? "bg-danger/60" : "bg-success/50"}`} />))}</div></div>);
    case "response-time-chart":
      return (<div className="space-y-1"><div className="flex justify-between text-[10px] text-text-secondary"><span>{label || "Response Time"}</span><span className="font-mono">~120ms</span></div><svg viewBox="0 0 100 20" className="w-full h-6 text-accent/60" preserveAspectRatio="none"><polyline fill="none" stroke="currentColor" strokeWidth="1.5" points="0,15 10,12 20,14 30,10 40,8 50,11 60,7 70,9 80,6 90,8 100,5" /></svg></div>);
    case "multi-monitor-grid":
      return (<div className="flex flex-wrap gap-1">{["API", "Web", "DB", "Redis", "CDN", "Auth"].map((n) => (<div key={n} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-elevated text-[10px]"><div className="h-1.5 w-1.5 rounded-full bg-success" /><span className="text-text-secondary">{n}</span></div>))}</div>);
    case "incident-history":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary">{label || "Recent Incidents"}</span><div className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-success" /><span className="text-text-secondary">No incidents in the last 7 days</span></div></div>);
    case "active-incident-banner":
      return (<div className="flex items-center gap-2 px-2 py-1 rounded bg-success/10 border border-success/20"><div className="h-2 w-2 rounded-full bg-success" /><span className="text-[10px] font-medium text-success">{label || "All clear — no active incidents"}</span></div>);
    case "text-block":
      return <p className="text-xs text-text-secondary">{label || "Announcement text goes here..."}</p>;
    case "metric-counter":
      return (<div className="text-center"><div className="text-lg font-bold text-accent tabular-nums">99.9%</div><div className="text-[10px] text-text-secondary">{label || "Uptime (30d)"}</div></div>);
    case "last-updated-footer":
      return <div className="text-[10px] text-text-muted text-center">Last updated: just now</div>;
    case "custom-header":
      return (<div><div className="text-sm font-bold text-text-primary">{label || "Status Page"}</div><div className="text-[10px] text-text-secondary">Subtitle or description</div></div>);
    case "monitor-group":
      return (<div className="space-y-1.5"><div className="text-[10px] font-semibold text-text-secondary uppercase">{label || "Infrastructure"}</div>{["API Server","Database","Cache","Queue"].map(n=>(<div key={n} className="flex items-center gap-1.5 text-[10px]"><div className="h-1.5 w-1.5 rounded-full bg-success"/><span className="text-text-primary">{n}</span><span className="ml-auto text-text-muted font-mono">12ms</span></div>))}</div>);
    case "multi-status-badges":
      return (<div className="grid grid-cols-3 gap-1.5">{["API","Web","DB","Redis","Auth","CDN"].map(n=>(<div key={n} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-elevated border border-border/50"><div className="h-2 w-2 rounded-full bg-success"/><span className="text-[10px] font-medium text-text-primary">{n}</span></div>))}</div>);
    case "version-status-grid":
      return (<div className="space-y-1"><div className="flex justify-between text-[10px] text-text-secondary"><span>Version Status</span><span>2 up-to-date · 1 update</span></div>{[{n:"Portainer",c:"2.39.0",l:"2.39.0",ok:true},{n:"GitLab",c:"18.7.0",l:"18.9.0",ok:false},{n:"Redis",c:"7.2.4",l:"7.2.4",ok:true}].map(v=>(<div key={v.n} className="flex items-center gap-2 text-[10px] py-0.5"><div className={`h-1.5 w-1.5 rounded-full ${v.ok?"bg-success":"bg-warning"}`}/><span className="text-text-primary w-16 truncate">{v.n}</span><span className="text-text-secondary font-mono">{v.c}</span><span className="text-text-muted">→</span><span className={`font-mono ${v.ok?"text-text-secondary":"text-warning font-medium"}`}>{v.l}</span></div>))}</div>);
    case "version-check-badge":
      return (<div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-success" /><span className="text-xs font-medium">{label || "App"}</span><span className="text-[10px] font-mono text-text-secondary">v2.39.0</span><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success">Up to date</span></div>);
    case "update-summary":
      return (<div className="flex items-center gap-4"><div className="flex items-center gap-1.5"><span className="text-lg font-bold text-success">2</span><span className="text-[10px] text-text-secondary">up to date</span></div><div className="flex items-center gap-1.5"><span className="text-lg font-bold text-warning">1</span><span className="text-[10px] text-text-secondary">minor update</span></div><div className="flex items-center gap-1.5"><span className="text-lg font-bold text-danger">0</span><span className="text-[10px] text-text-secondary">major update</span></div></div>);
    case "divider":
      return <hr className="border-border my-1" />;

    // ── Performance ────────────────────────────────────────────────────────
    case "response-time-heatmap":
      return (<div className="space-y-1"><div className="text-[10px] text-text-secondary mb-1">{label || "Response Time Heatmap"}</div><div className="grid gap-px" style={{gridTemplateColumns:"repeat(24,1fr)"}}>{Array.from({length:168},(_,i)=>(<div key={i} className={`rounded-sm ${i%7===3?"bg-danger/60":i%5===2?"bg-warning/50":i%11===0?"bg-success/30":"bg-success/15"}`} style={{height:6}} />))}</div><div className="flex justify-between text-[9px] text-text-muted mt-0.5"><span>00:00</span><span>12:00</span><span>23:00</span></div></div>);
    case "latency-percentiles-card":
      return (<div className="flex items-end gap-3"><div className="text-center"><div className="text-base font-bold text-text-primary tabular-nums">42<span className="text-[9px] text-text-muted ml-0.5">ms</span></div><div className="text-[9px] text-text-muted">P50</div></div><div className="text-center"><div className="text-base font-bold text-warning tabular-nums">110<span className="text-[9px] text-text-muted ml-0.5">ms</span></div><div className="text-[9px] text-text-muted">P95</div></div><div className="text-center"><div className="text-base font-bold text-danger tabular-nums">210<span className="text-[9px] text-text-muted ml-0.5">ms</span></div><div className="text-[9px] text-text-muted">P99</div></div></div>);
    case "response-time-comparison":
      return (<div className="space-y-1"><div className="text-[10px] text-text-secondary mb-1">{label||"Response Time Comparison"}</div><svg viewBox="0 0 100 24" className="w-full" preserveAspectRatio="none"><polyline fill="none" stroke="#6366f1" strokeWidth="1.5" points="0,18 15,14 30,10 45,12 60,8 75,10 90,6 100,7"/><polyline fill="none" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="2,2" points="0,20 15,17 30,15 45,13 60,14 75,11 90,12 100,10"/></svg></div>);
    case "ssl-certificate-status":
      return (<div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-success shrink-0"/><span className="text-xs font-medium text-text-primary">{label||"SSL Certificate"}</span><span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-medium">85d left</span></div>);
    case "dns-resolution-time":
      return (<div className="flex items-center gap-2"><span className="text-xs text-text-secondary">{label||"DNS"}</span><div className="flex-1 h-1.5 rounded-full bg-surface-elevated overflow-hidden"><div className="h-full rounded-full bg-accent/60" style={{width:"30%"}}/></div><span className="text-[10px] font-mono text-text-secondary">12ms</span></div>);
    case "performance-trend":
      return (<div className="space-y-1"><div className="flex items-center gap-2"><span className="text-[10px] text-text-secondary">{label||"Performance Trend"}</span><span className="text-[10px] text-success">↓ 8% faster</span></div><svg viewBox="0 0 100 20" className="w-full h-5" preserveAspectRatio="none"><polyline fill="none" stroke="#22c55e" strokeWidth="1.5" points="0,16 20,14 40,12 60,10 80,8 100,6"/></svg></div>);
    case "apdex-score":
      return (<div className="flex items-center gap-3"><div className="text-2xl font-bold text-success tabular-nums">0.96</div><div><div className="text-[10px] text-text-secondary">Apdex Score</div><div className="text-[10px] text-success">Excellent</div></div></div>);
    case "throughput-counter":
      return (<div className="flex items-center gap-2"><div className="text-lg font-bold text-accent tabular-nums">243</div><div className="text-[10px] text-text-secondary">{label||"checks/hr"}</div></div>);

    // ── SLA ───────────────────────────────────────────────────────────────
    case "sla-compliance-table":
      return (<div className="space-y-1">{[{n:"API",t:"99.9%",a:"99.97%",ok:true},{n:"Web",t:"99.5%",a:"99.84%",ok:true},{n:"DB",t:"99.9%",a:"99.61%",ok:false}].map(r=>(<div key={r.n} className="flex items-center gap-2 text-[10px]"><span className="w-8 text-text-primary font-medium">{r.n}</span><span className="text-text-muted w-10">{r.t}</span><span className={`font-mono ${r.ok?"text-success":"text-danger"}`}>{r.a}</span><span className={`ml-auto px-1 py-0.5 rounded text-[9px] font-semibold ${r.ok?"bg-success/15 text-success":"bg-danger/15 text-danger"}`}>{r.ok?"Pass":"Fail"}</span></div>))}</div>);
    case "uptime-heatmap":
      return (<div className="space-y-1"><div className="text-[10px] text-text-secondary mb-1">{label||"Uptime Heatmap"}</div><div className="grid gap-px" style={{gridTemplateColumns:"repeat(24,1fr)"}}>{Array.from({length:168},(_,i)=>(<div key={i} className={`rounded-sm ${i===42||i===43?"bg-danger/70":i===100?"bg-warning/60":"bg-success/40"}`} style={{height:6}}/>))}</div></div>);
    case "downtime-log":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary">{label||"Downtime Log"}</span>{[{t:"Mar 12",d:"14m",r:"Timeout"},{t:"Mar 7",d:"3m",r:"Deploy"}].map(e=>(<div key={e.t} className="flex items-center gap-2 py-0.5"><span className="text-text-muted w-12">{e.t}</span><span className="text-danger font-mono">{e.d}</span><span className="text-text-secondary">{e.r}</span></div>))}</div>);
    case "mttr-mttf-cards":
      return (<div className="flex gap-4"><div className="text-center"><div className="text-base font-bold text-warning tabular-nums">18m</div><div className="text-[9px] text-text-muted">MTTR</div></div><div className="text-center"><div className="text-base font-bold text-success tabular-nums">12.4d</div><div className="text-[9px] text-text-muted">MTTF</div></div></div>);
    case "uptime-comparison-chart":
      return (<div className="space-y-1"><div className="text-[10px] text-text-secondary mb-1">{label||"Uptime Comparison"}</div><div className="flex items-end gap-1 h-10">{[99.9,99.7,100,98.5,99.8].map((v,i)=>(<div key={i} className="flex-1 rounded-sm bg-accent/50" style={{height:`${((v-98)/2)*100}%`,minHeight:2}}/>))}</div></div>);

    // ── Incidents ─────────────────────────────────────────────────────────
    case "incident-timeline":
      return (<div className="space-y-2 text-[10px]"><span className="text-text-secondary font-medium">{label||"Incident Timeline"}</span>{[{s:"Resolved",c:"text-success",m:"Service restored"},{s:"Monitoring",c:"text-warning",m:"Fix deployed"},{s:"Identified",c:"text-danger",m:"Root cause found"}].map(e=>(<div key={e.s} className="flex items-start gap-2"><div className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${e.c.replace("text-","bg-")}`}/><div><span className={`font-semibold ${e.c}`}>{e.s}</span><span className="text-text-muted ml-1">{e.m}</span></div></div>))}</div>);
    case "incident-severity-distribution":
      return (<div className="flex items-center gap-2"><div className="flex-1 h-3 rounded-full overflow-hidden flex"><div className="bg-danger/70" style={{width:"15%"}}/><div className="bg-warning/70" style={{width:"35%"}}/><div className="bg-success/50" style={{width:"50%"}}/></div><div className="flex gap-2 text-[9px]"><span className="text-danger">Crit</span><span className="text-warning">Maj</span><span className="text-success">Min</span></div></div>);
    case "incident-duration-stats":
      return (<div className="flex gap-4 text-center"><div><div className="text-sm font-bold text-text-primary">3m</div><div className="text-[9px] text-text-muted">Shortest</div></div><div><div className="text-sm font-bold text-warning">18m</div><div className="text-[9px] text-text-muted">Average</div></div><div><div className="text-sm font-bold text-danger">2.1h</div><div className="text-[9px] text-text-muted">Longest</div></div></div>);
    case "active-incident-count":
      return (<div className="flex items-center gap-2"><div className="text-3xl font-bold text-danger tabular-nums animate-pulse">2</div><div className="text-[10px] text-text-secondary leading-tight">{label||"Active\nIncidents"}</div></div>);
    case "post-mortem-card":
      return (<div className="space-y-1 text-[10px]"><span className="font-semibold text-text-primary">{label||"Post-Mortem"}</span><p className="text-text-secondary leading-relaxed">Database failover triggered by OOM. Fix: increased replica memory limits. Duration: 14m.</p></div>);
    case "maintenance-calendar":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary">{label||"Maintenance Calendar"}</span><div className="flex gap-1 flex-wrap">{Array.from({length:7},(_,i)=>(<div key={i} className={`w-6 h-6 rounded flex items-center justify-center text-[9px] font-medium ${i===2?"bg-warning/20 text-warning border border-warning/30":"bg-surface-elevated text-text-muted"}`}>{19+i}</div>))}</div></div>);
    case "next-maintenance-countdown":
      return (<div className="flex items-center gap-3"><div className="text-lg font-bold font-mono text-accent tabular-nums">02:14:30</div><div className="text-[10px] text-text-secondary">{label||"Until maintenance"}</div></div>);
    case "maintenance-impact-list":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary">{label||"Affected Services"}</span>{["API v2","Webhooks","File uploads"].map(s=>(<div key={s} className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-warning"/><span className="text-text-primary">{s}</span></div>))}</div>);

    // ── Version ───────────────────────────────────────────────────────────
    case "version-timeline":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary">{label||"Version Timeline"}</span>{[{v:"v2.39.0",d:"Mar 18",t:"success"},{v:"v2.38.1",d:"Mar 10",t:"warning"},{v:"v2.38.0",d:"Mar 2",t:"text-muted"}].map(e=>(<div key={e.v} className="flex items-center gap-2"><div className={`h-1.5 w-1.5 rounded-full bg-${e.t}`}/><span className="font-mono text-text-primary">{e.v}</span><span className="text-text-muted ml-auto">{e.d}</span></div>))}</div>);
    case "outdated-components-alert":
      return (<div className="space-y-1">{[{n:"GitLab",c:"18.7",l:"18.9"},{n:"SonarQube",c:"25.x",l:"26.x"}].map(c=>(<div key={c.n} className="flex items-center gap-2 text-[10px] px-2 py-1 rounded bg-warning/10 border border-warning/20"><div className="h-1.5 w-1.5 rounded-full bg-warning shrink-0"/><span className="text-text-primary">{c.n}</span><span className="ml-auto text-warning font-mono">{c.c} → {c.l}</span></div>))}</div>);
    case "version-comparison-table":
      return (<div className="space-y-1">{[{n:"Portainer",c:"2.39.0",l:"2.39.0",ok:true},{n:"GitLab",c:"18.7.0",l:"18.9.0",ok:false}].map(r=>(<div key={r.n} className="flex items-center gap-2 text-[10px]"><span className="text-text-primary w-14 truncate">{r.n}</span><span className="font-mono text-text-secondary">{r.c}</span><span className="text-text-muted mx-1">→</span><span className={`font-mono ${r.ok?"text-success":"text-warning"}`}>{r.l}</span></div>))}</div>);
    case "changelog-widget":
      return (<div className="space-y-1.5 text-[10px]"><span className="text-text-secondary font-medium">{label||"Changelog"}</span>{[{v:"v2.39.0",n:"Security fixes + perf improvements"},{v:"v2.38.1",n:"Bug fixes"}].map(e=>(<div key={e.v} className="flex gap-2"><span className="font-mono text-accent shrink-0">{e.v}</span><span className="text-text-secondary">{e.n}</span></div>))}</div>);
    case "security-advisory":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary font-medium">{label||"Security Advisories"}</span><div className="flex items-center gap-2 px-2 py-1 rounded bg-danger/10 border border-danger/20"><span className="text-[9px] font-bold text-danger uppercase">HIGH</span><span className="text-text-primary">CVE-2024-12345 — SQL injection</span></div></div>);

    // ── Metrics & Data ────────────────────────────────────────────────────
    case "custom-metric-chart":
      return (<div className="space-y-1"><div className="text-[10px] text-text-secondary">{label||"Custom Metric"}</div><svg viewBox="0 0 100 24" className="w-full h-6" preserveAspectRatio="none"><polyline fill="none" stroke="#6366f1" strokeWidth="1.5" points="0,20 12,16 24,14 36,17 48,11 60,9 72,12 84,8 100,6"/></svg></div>);
    case "gauge":
      return (<div className="flex flex-col items-center"><svg viewBox="0 0 60 34" className="w-16"><path d="M5 30 A 25 25 0 0 1 55 30" fill="none" stroke="#1f2937" strokeWidth="6" strokeLinecap="round"/><path d="M5 30 A 25 25 0 0 1 55 30" fill="none" stroke="#6366f1" strokeWidth="6" strokeLinecap="round" strokeDasharray="78.5" strokeDashoffset="20"/><text x="30" y="31" textAnchor="middle" className="text-[8px]" fill="currentColor" fontSize="8">97%</text></svg><div className="text-[9px] text-text-muted">{label||"Health"}</div></div>);
    case "sparkline-row":
      return (<div className="space-y-1">{["API","Web","DB"].map(n=>(<div key={n} className="flex items-center gap-2"><span className="text-[10px] text-text-secondary w-6">{n}</span><svg viewBox="0 0 60 12" className="flex-1 h-3" preserveAspectRatio="none"><polyline fill="none" stroke="#6366f1" strokeWidth="1" points="0,10 10,8 20,9 30,6 40,7 50,4 60,5"/></svg></div>))}</div>);
    case "stats-grid":
      return (<div className="grid grid-cols-3 gap-2">{[{l:"Uptime",v:"99.9%",c:"text-success"},{l:"Latency",v:"42ms",c:"text-text-primary"},{l:"Checks",v:"1.2k",c:"text-accent"}].map(s=>(<div key={s.l} className="text-center"><div className={`text-sm font-bold ${s.c} tabular-nums`}>{s.v}</div><div className="text-[9px] text-text-muted">{s.l}</div></div>))}</div>);
    case "progress-ring":
      return (<div className="flex items-center gap-3"><svg viewBox="0 0 36 36" className="w-12 h-12"><circle cx="18" cy="18" r="15" fill="none" stroke="#1f2937" strokeWidth="3"/><circle cx="18" cy="18" r="15" fill="none" stroke="#6366f1" strokeWidth="3" strokeDasharray="94.2" strokeDashoffset="6" strokeLinecap="round" transform="rotate(-90 18 18)"/></svg><div><div className="text-sm font-bold text-text-primary tabular-nums">99%</div><div className="text-[10px] text-text-muted">{label||"SLA"}</div></div></div>);
    case "data-table":
      return (<div className="space-y-1"><div className="flex text-[9px] text-text-muted border-b border-border pb-1 gap-2"><span className="flex-1">Name</span><span>Status</span><span>Latency</span></div>{[{n:"API",s:"Up",l:"12ms"},{n:"Web",s:"Up",l:"45ms"}].map(r=>(<div key={r.n} className="flex text-[10px] gap-2 py-0.5"><span className="flex-1 text-text-primary">{r.n}</span><span className="text-success">{r.s}</span><span className="text-text-secondary font-mono">{r.l}</span></div>))}</div>);
    case "check-history-feed":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary">{label||"Check History"}</span>{[{t:"12:00",ok:true,ms:"42ms"},{t:"11:45",ok:true,ms:"38ms"},{t:"11:30",ok:false,ms:"—"}].map((r,i)=>(<div key={i} className="flex items-center gap-1.5"><div className={`h-1.5 w-1.5 rounded-full ${r.ok?"bg-success":"bg-danger"}`}/><span className="text-text-muted">{r.t}</span><span className={`ml-auto font-mono ${r.ok?"text-text-secondary":"text-danger"}`}>{r.ms}</span></div>))}</div>);
    case "metric-comparison-row":
      return (<div className="flex items-stretch gap-2">{[{l:"Uptime",v:"99.9%",c:"text-success"},{l:"P95",v:"110ms",c:"text-warning"},{l:"MTTR",v:"18m",c:"text-text-primary"}].map(m=>(<div key={m.l} className="flex-1 text-center"><div className={`text-sm font-bold tabular-nums ${m.c}`}>{m.v}</div><div className="text-[9px] text-text-muted">{m.l}</div></div>))}</div>);

    // ── Multi-Env / Region / Deps ─────────────────────────────────────────
    case "multi-environment-status":
      return (<div className="grid grid-cols-3 gap-2">{[{e:"Prod",ok:true},{e:"Staging",ok:true},{e:"Dev",ok:false}].map(env=>(<div key={env.e} className={`rounded-lg border px-2 py-1.5 text-center ${env.ok?"border-success/20 bg-success/5":"border-warning/30 bg-warning/5"}`}><div className={`text-[10px] font-semibold ${env.ok?"text-success":"text-warning"}`}>{env.e}</div><div className={`text-[9px] ${env.ok?"text-success":"text-warning"}`}>{env.ok?"Operational":"Degraded"}</div></div>))}</div>);
    case "region-status-map":
      return (<div className="grid grid-cols-2 gap-1.5">{[{r:"EU West",ok:true},{r:"US East",ok:true},{r:"AP South",ok:false},{r:"US West",ok:true}].map(reg=>(<div key={reg.r} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-elevated border border-border/50 text-[10px]"><div className={`h-2 w-2 rounded-full ${reg.ok?"bg-success":"bg-danger"}`}/><span className="text-text-primary">{reg.r}</span></div>))}</div>);
    case "third-party-dependencies":
      return (<div className="space-y-1">{[{n:"Stripe",ok:true,ms:"120ms"},{n:"SendGrid",ok:true,ms:"95ms"},{n:"AWS S3",ok:false,ms:"—"}].map(d=>(<div key={d.n} className="flex items-center gap-2 text-[10px]"><div className={`h-1.5 w-1.5 rounded-full ${d.ok?"bg-success":"bg-danger"}`}/><span className="text-text-primary">{d.n}</span><span className={`ml-auto font-mono ${d.ok?"text-text-secondary":"text-danger"}`}>{d.ms}</span></div>))}</div>);
    case "dependency-map":
      return (<div className="relative h-full min-h-[60px]"><svg viewBox="0 0 100 50" className="w-full h-full" preserveAspectRatio="xMidYMid meet"><circle cx="20" cy="25" r="8" fill="#22c55e" fillOpacity="0.2" stroke="#22c55e" strokeWidth="1.5"/><text x="20" y="26" textAnchor="middle" fill="currentColor" fontSize="4">API</text><circle cx="80" cy="15" r="7" fill="#22c55e" fillOpacity="0.2" stroke="#22c55e" strokeWidth="1.5"/><text x="80" y="16" textAnchor="middle" fill="currentColor" fontSize="4">DB</text><circle cx="80" cy="38" r="7" fill="#ef4444" fillOpacity="0.2" stroke="#ef4444" strokeWidth="1.5"/><text x="80" y="39" textAnchor="middle" fill="currentColor" fontSize="4">Redis</text><line x1="28" y1="21" x2="73" y2="17" stroke="#22c55e" strokeWidth="1" strokeOpacity="0.7"/><line x1="28" y1="28" x2="73" y2="36" stroke="#ef4444" strokeWidth="1" strokeOpacity="0.7" strokeDasharray="2,1"/></svg></div>);

    // ── Content & Branding ────────────────────────────────────────────────
    case "announcement-bar":
      return (<div className="flex items-center gap-2 px-2 py-1 rounded bg-accent/10 border border-accent/20"><div className="h-1.5 w-1.5 rounded-full bg-accent shrink-0"/><span className="text-[10px] font-medium text-text-primary">{label||"Important announcement text"}</span></div>);
    case "image-banner":
      return (<div className="rounded-lg bg-surface-elevated border border-border flex items-center justify-center h-10"><span className="text-[10px] text-text-muted">🖼 {label||"Image / Banner"}</span></div>);
    case "link-list":
      return (<div className="space-y-1">{["Documentation","API Status","Changelog"].map(l=>(<div key={l} className="flex items-center gap-1.5 text-[10px]"><div className="h-1 w-1 rounded-full bg-accent/60"/><span className="text-accent hover:underline">{l}</span></div>))}</div>);
    case "social-links":
      return (<div className="flex items-center gap-3">{["GitHub","Twitter","Discord"].map(s=>(<div key={s} className="text-[10px] text-text-secondary flex items-center gap-1 px-2 py-1 rounded bg-surface-elevated border border-border/50">{s}</div>))}</div>);
    case "embed-iframe":
      return (<div className="rounded-lg bg-surface-elevated border border-border flex items-center justify-center h-12 border-dashed"><span className="text-[10px] text-text-muted">↗ {label||"Embedded content"}</span></div>);
    case "video-embed":
      return (<div className="rounded-lg bg-surface-elevated border border-border flex items-center justify-center h-10 border-dashed"><span className="text-[10px] text-text-muted">▶ {label||"Video"}</span></div>);
    case "code-block":
      return (<div className="rounded bg-bg border border-border px-2 py-1.5"><code className="text-[10px] font-mono text-accent">{"curl https://api.example.com/health"}</code></div>);
    case "subscriber-form":
      return (<div className="flex gap-1.5"><div className="flex-1 rounded-lg border border-border bg-bg px-2 py-1 text-[10px] text-text-muted">Email address</div><div className="rounded-lg bg-accent px-2 py-1 text-[10px] text-white font-medium">Subscribe</div></div>);
    case "rss-feed-widget":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary">RSS Feed</span><div className="flex items-center gap-1.5 text-accent"><span>⚡</span><span className="hover:underline">Subscribe to updates</span></div></div>);
    case "faq-accordion":
      return (<div className="space-y-1">{["What is your uptime SLA?","How do I report an issue?"].map(q=>(<div key={q} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-surface-elevated border border-border/50 text-[10px]"><span className="text-text-primary">{q}</span><span className="text-text-muted">▾</span></div>))}</div>);
    case "countdown":
      return (<div className="flex items-center gap-2"><div className="font-mono text-base font-bold text-accent tabular-nums">03:12:45</div><div className="text-[10px] text-text-secondary">{label||"Event countdown"}</div></div>);

    // ── Layout & Navigation ───────────────────────────────────────────────
    case "tab-container":
      return (<div className="space-y-1"><div className="flex gap-1 border-b border-border pb-1">{["Overview","Details","Logs"].map((t,i)=>(<div key={t} className={`px-2 py-0.5 text-[10px] rounded-t font-medium ${i===0?"text-accent border-b-2 border-accent -mb-[5px]":"text-text-muted"}`}>{t}</div>))}</div><p className="text-[10px] text-text-secondary pt-1">Tab content appears here</p></div>);
    case "collapsible-section":
      return (<div className="space-y-1"><div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-surface-elevated border border-border text-[10px] cursor-pointer"><span className="font-medium text-text-primary">{label||"Section Title"}</span><span className="text-text-muted">▾</span></div></div>);
    case "column-layout":
      return (<div className="grid grid-cols-2 gap-2 h-full">{[0,1].map(i=>(<div key={i} className="rounded-lg border border-dashed border-border flex items-center justify-center"><span className="text-[10px] text-text-muted">Column {i+1}</span></div>))}</div>);
    case "sticky-header":
      return (<div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-success/10 border border-success/20"><div className="h-2 w-2 rounded-full bg-success animate-pulse"/><span className="text-[10px] font-semibold text-success">{label||"All Systems Operational"}</span></div>);
    case "table-of-contents":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary font-medium">{label||"Contents"}</span>{["Status Overview","Incidents","Maintenance"].map((s,i)=>(<div key={s} className="flex items-center gap-1.5"><span className="text-text-muted">{i+1}.</span><span className="text-accent hover:underline">{s}</span></div>))}</div>);
    case "page-navigation":
      return (<div className="grid grid-cols-2 gap-1.5">{["Main Status","API Status"].map(p=>(<div key={p} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-elevated border border-border/50 text-[10px]"><div className="h-1.5 w-1.5 rounded-full bg-success"/><span className="text-text-primary">{p}</span></div>))}</div>);
    case "last-updated-footer":
      return <div className="text-[10px] text-text-muted text-center">Last updated: just now · Auto-refreshes every 60s</div>;
    case "offline-banner":
      return (<div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-warning/10 border border-warning/20"><div className="h-2 w-2 rounded-full bg-warning shrink-0 animate-pulse"/><span className="text-[10px] font-medium text-warning">You are offline — showing cached data</span></div>);

    default:
      return (
        <div className="flex items-center justify-center h-full min-h-[32px]">
          <span className="text-[10px] text-text-secondary/50 italic">{WIDGET_PALETTE.find(p => p.type === type)?.label ?? type}</span>
        </div>
      );
  }
}

interface CanvasWidgetProps {
  widget: Widget;
  isSelected: boolean;
  isMultiSelected: boolean;
  colWidth: number;
  onSelect: (id: string, shiftKey: boolean) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onResize: (id: string, size: { w: number; h: number }) => void;
  onToggleLock: (id: string) => void;
}

function CanvasWidget({ widget, isSelected, isMultiSelected, colWidth, onSelect, onDelete, onDuplicate, onResize, onToggleLock }: CanvasWidgetProps) {
  const isLocked = Boolean(widget.locked);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `canvas-${widget.id}`,
    data: { source: "canvas", widget },
    disabled: isLocked,
  });

  // Mutable ref so the mousemove handler always reads the latest widget dimensions
  const widgetRef = useRef(widget);
  widgetRef.current = widget;

  const paletteItem = WIDGET_PALETTE.find((p) => p.type === widget.type);
  const Icon = paletteItem?.icon ?? LayoutGrid;

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${(widget.x / COL_COUNT) * 100}%`,
    top: widget.y * ROW_H,
    width: `${(widget.w / COL_COUNT) * 100}%`,
    height: widget.h * ROW_H,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 10 : isSelected ? 5 : 1,
  };

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = widgetRef.current.w;
      const startH = widgetRef.current.h;

      const onMouseMove = (ev: MouseEvent) => {
        if (colWidth <= 0) return;
        const newW = Math.max(1, Math.min(COL_COUNT - widgetRef.current.x, startW + Math.round((ev.clientX - startX) / colWidth)));
        const newH = Math.max(1, Math.min(10, startH + Math.round((ev.clientY - startY) / ROW_H)));
        onResize(widgetRef.current.id, { w: newW, h: newH });
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "nwse-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [colWidth, onResize]
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => { e.stopPropagation(); onSelect(widget.id, e.shiftKey); }}
      className={`group relative flex flex-col rounded-xl border-2 bg-surface transition-colors ${
        isSelected ? "border-accent shadow-lg shadow-accent/10" : isMultiSelected ? "border-accent/60 shadow shadow-accent/10 bg-accent/5" : "border-border hover:border-accent/40"
      }`}
    >
      {/* Header bar with drag handle + title */}
      <div className="flex items-center gap-1 border-b border-border/60 px-3 py-2">
        <div
          {...(isLocked ? {} : { ...listeners, ...attributes })}
          className={`p-0.5 text-text-secondary/40 ${isLocked ? "cursor-not-allowed opacity-30" : "cursor-grab hover:text-text-secondary active:cursor-grabbing"}`}
          onClick={(e) => e.stopPropagation()}
          title={isLocked ? "Widget is locked — unlock to move" : "Drag to move"}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <Icon className="h-3 w-3 text-accent/70" />
        {isLocked && <Lock className="h-2.5 w-2.5 text-amber-400/70 flex-shrink-0" aria-label="Locked" />}
        <span className="flex-1 text-xs font-medium text-text-secondary">
          {paletteItem?.label ?? widget.type}
        </span>
        {widget.config.label && (
          <span className="truncate max-w-[80px] text-xs text-text-secondary/60">
            {widget.config.label as string}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleLock(widget.id); }}
          className={`ml-1 flex h-5 w-5 items-center justify-center rounded transition ${
            isLocked
              ? "text-amber-400 opacity-100"
              : "text-text-secondary/40 opacity-0 hover:bg-amber-500/10 hover:text-amber-400 group-hover:opacity-100"
          }`}
          title={isLocked ? "Unlock widget" : "Lock widget (prevent accidental moves)"}
        >
          {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(widget.id); }}
          className="ml-1 flex h-5 w-5 items-center justify-center rounded text-text-secondary/40 opacity-0 transition hover:bg-accent/10 hover:text-accent group-hover:opacity-100"
          title="Duplicate widget"
        >
          <Copy className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(widget.id); }}
          className="ml-1 flex h-5 w-5 items-center justify-center rounded text-text-secondary/40 opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {/* Widget preview */}
      <div className="flex-1 overflow-hidden p-2">
        <WidgetPreview type={widget.type} config={widget.config} w={widget.w} />
      </div>
      {/* Resize handle — bottom-right corner (hidden when locked) */}
      {!isLocked && (
      <div
        onMouseDown={handleResizeMouseDown}
        onClick={(e) => e.stopPropagation()}
        title={`Drag to resize · ${widget.w} cols × ${widget.h} rows`}
        className={`absolute bottom-1 right-1 flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded transition-opacity ${
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-60"
        }`}
      >
        <svg viewBox="0 0 10 10" className="h-3.5 w-3.5 text-text-secondary/60" aria-hidden="true">
          <circle cx="8" cy="8" r="1.1" fill="currentColor" />
          <circle cx="4.5" cy="8" r="1.1" fill="currentColor" />
          <circle cx="8" cy="4.5" r="1.1" fill="currentColor" />
        </svg>
      </div>
      )}
    </div>
  );
}

// ── Canvas drop zone ─────────────────────────────────────────────────────

interface CanvasProps {
  widgets: Widget[];
  selectedId: string | null;
  selectedIds: Set<string>;
  isDraggingOverCanvas: boolean;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  viewportMode: ViewportMode;
  showGrid: boolean;
  alignGuides: { type: "h" | "v"; pos: number }[];
  paletteDropPreview: { x: number; y: number; w: number; h: number } | null;
  onSelect: (id: string | null, shiftKey?: boolean) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onResize: (id: string, size: { w: number; h: number }) => void;
  onToggleLock: (id: string) => void;
}

function CanvasDropZone({ widgets, selectedId, selectedIds, isDraggingOverCanvas, canvasRef, zoom, viewportMode, showGrid, alignGuides, paletteDropPreview, onSelect, onDelete, onDuplicate, onResize, onToggleLock }: CanvasProps) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas" });

  const maxY = widgets.length > 0
    ? Math.max(...widgets.map((w) => w.y + w.h))
    : 0;
  const minHeight = Math.max(maxY * ROW_H + ROW_H * 4, 480);

  // Combine refs
  const combinedRef = useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    if (canvasRef) {
      (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  }, [setNodeRef, canvasRef]);

  const viewportWidth = viewportMode === "mobile" ? 375 : viewportMode === "tablet" ? 768 : undefined;

  return (
    <div
      style={{
        transform: `scale(${zoom})`,
        transformOrigin: "top center",
        width: viewportWidth ? `${viewportWidth}px` : "100%",
        margin: viewportWidth ? "0 auto" : undefined,
        transition: "transform 0.15s ease, width 0.2s ease",
      }}
    >
    <div
      ref={combinedRef}
      className={`relative w-full transition-colors ${
        isOver ? "bg-accent/5" : ""
      } ${viewportWidth ? "border-x border-border/40 shadow-xl shadow-black/20" : ""}`}
      style={{ minHeight }}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('[data-widget]')) onSelect(null); }}
    >
      {/* Grid guide lines — visible when showGrid is on or when dragging */}
      {(showGrid || isDraggingOverCanvas) && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `
              repeating-linear-gradient(to right, rgba(255 255 255 / ${showGrid ? "0.08" : isDraggingOverCanvas ? "0.06" : "0.025"}) 0px, rgba(255 255 255 / ${showGrid ? "0.08" : isDraggingOverCanvas ? "0.06" : "0.025"}) 1px, transparent 1px, transparent calc(100% / ${COL_COUNT})),
              repeating-linear-gradient(to bottom, rgba(255 255 255 / ${showGrid ? "0.08" : isDraggingOverCanvas ? "0.06" : "0.025"}) 0px, rgba(255 255 255 / ${showGrid ? "0.08" : isDraggingOverCanvas ? "0.06" : "0.025"}) 1px, transparent 1px, transparent ${ROW_H}px)
            `,
            transition: "opacity 0.15s ease",
          }}
        />
      )}

      {/* Alignment guide lines — shown during drag */}
      {alignGuides.map((guide, i) =>
        guide.type === "h" ? (
          <div
            key={`guide-h-${i}`}
            className="pointer-events-none absolute left-0 right-0 z-50"
            style={{ top: guide.pos, height: 1, background: "rgba(99,102,241,0.7)" }}
          />
        ) : (
          <div
            key={`guide-v-${i}`}
            className="pointer-events-none absolute top-0 bottom-0 z-50"
            style={{ left: guide.pos, width: 1, background: "rgba(99,102,241,0.7)" }}
          />
        )
      )}

      {widgets.length === 0 && !isOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
            <LayoutGrid className="h-8 w-8 text-accent/60" />
          </div>
          <h3 className="text-base font-semibold text-text-primary">Drag widgets here</h3>
          <p className="mt-2 max-w-xs text-center text-sm text-text-secondary">
            Drag widgets from the left panel to build your status page.
          </p>
        </div>
      )}

      {isOver && widgets.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed border-accent/40">
          <p className="text-sm font-medium text-accent/70">Drop to add widget</p>
        </div>
      )}

      {paletteDropPreview && (
        <div
          className="pointer-events-none absolute z-40 rounded-xl border-2 border-dashed border-accent/70 bg-accent/10"
          style={{
            left: `${(paletteDropPreview.x / COL_COUNT) * 100}%`,
            top: `${paletteDropPreview.y * ROW_H}px`,
            width: `${(paletteDropPreview.w / COL_COUNT) * 100}%`,
            height: `${paletteDropPreview.h * ROW_H}px`,
          }}
        >
          <div className="absolute -top-6 left-0 rounded-md bg-accent/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg">
            Release to place
          </div>
        </div>
      )}

      {/* Render widgets (sorted by zOrder) */}
      {[...widgets].sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0)).map((widget) => {
        const colWidth = canvasRef.current
          ? canvasRef.current.getBoundingClientRect().width / COL_COUNT
          : 0;
        return (
          <div key={widget.id} data-widget="true">
          <CanvasWidget
            widget={widget}
            isSelected={selectedId === widget.id}
            isMultiSelected={selectedIds.has(widget.id)}
            colWidth={colWidth}
            onSelect={onSelect}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onResize={onResize}
            onToggleLock={onToggleLock}
          />
          </div>
        );
      })}
    </div>
    </div>
  );
}

// ── Widget config panel ──────────────────────────────────────────────────

interface ConfigPanelProps {
  widget: Widget | null;
  monitors: Monitor[];
  tags: TagOption[];
  folders: FolderOption[];
  onChange: (config: Widget["config"]) => void;
  onResize: (size: { w: number; h: number }) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleLock: (id: string) => void;
  onZOrder: (id: string, action: "front" | "back" | "forward" | "backward") => void;
}

function ConfigPanel({ widget, monitors, tags, folders, onChange, onResize, onDelete, onDuplicate, onToggleLock, onZOrder }: ConfigPanelProps) {
  if (!widget) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center">
        <p className="text-xs text-text-secondary">Click a widget on the canvas to configure it</p>
      </div>
    );
  }

  const paletteItem = WIDGET_PALETTE.find((p) => p.type === widget.type);
  const w = widget;

  function update(key: string, value: unknown) {
    onChange({ ...w.config, [key]: value });
  }

  const monitorMode = (w.config.monitorMode as string) ?? "single";
  const supportsLabel = w.type !== "divider";
  const noScopeWidgets = ["divider", "text-block", "scheduled-maintenance", "incident-history", "check-history-feed", "collapsible-section", "tab-container", "code-block", "video-embed", "image-banner", "faq-accordion", "social-links", "link-list", "subscriber-form", "rss-feed-widget", "announcement-bar", "third-party-dependencies", "security-advisory", "column-layout", "sticky-header", "table-of-contents", "page-navigation", "offline-banner"];
  const supportsMonitorScope = !noScopeWidgets.includes(w.type);
  const supportsFilters = !noScopeWidgets.includes(w.type);
  const supportsVisibility = w.type !== "divider";
  const supportsClickAction = w.type !== "divider";
  const supportsStyle = w.type !== "divider";
  const supportsResponsive = w.type !== "divider";

  function handleMonitorModeChange(nextMode: "single" | "multiple" | "all") {
    if (nextMode === "multiple") {
      onChange({
        ...w.config,
        monitorMode: "multiple",
        monitorId: undefined,
        monitorIds: getDefaultMultiMonitorIds(w, monitors),
      });
      return;
    }

    if (nextMode === "single") {
      const firstSelected = Array.isArray(w.config.monitorIds) ? w.config.monitorIds[0] : undefined;
      onChange({
        ...w.config,
        monitorMode: "single",
        monitorId: (w.config.monitorId as string | undefined) ?? firstSelected,
        monitorIds: undefined,
      });
      return;
    }

    onChange({
      ...w.config,
      monitorMode: "all",
      monitorId: undefined,
      monitorIds: undefined,
    });
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      <div>
        <p className="mb-1 text-xs font-semibold text-text-primary">{paletteItem?.label ?? w.type}</p>
        <p className="text-[10px] text-text-secondary">{paletteItem?.description}</p>
      </div>

      {supportsLabel && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Label override</label>
          <input
            type="text"
            value={(w.config.label as string) ?? ""}
            onChange={(e) => update("label", e.target.value || undefined)}
            placeholder="Optional custom label"
            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
          />
        </div>
      )}

      {supportsMonitorScope && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Monitor scope</label>
          <select
            value={monitorMode}
            onChange={(e) => handleMonitorModeChange(e.target.value as "single" | "multiple" | "all")}
            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="single">Single monitor</option>
            <option value="multiple">Multiple monitors</option>
            <option value="all">All monitors</option>
          </select>
        </div>
      )}

      {supportsMonitorScope && monitorMode === "single" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Monitor</label>
          <select
            value={(w.config.monitorId as string) ?? ""}
            onChange={(e) => update("monitorId", e.target.value || undefined)}
            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">— Select monitor —</option>
            {monitors.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}

      {supportsMonitorScope && monitorMode === "multiple" && (
        <div className="space-y-2">
          <p className="text-[10px] text-text-secondary">
            {getMultiModeHelperText(w.type)}
          </p>
          <MultiMonitorPicker
            monitors={monitors}
            selectedIds={(w.config.monitorIds as string[]) ?? []}
            onChange={(values) => update("monitorIds", values)}
            tags={tags}
            folders={folders}
          />
        </div>
      )}

      {supportsFilters && (
        <div className="rounded-lg border border-border/50 bg-bg/50 p-2.5 space-y-2">
          <p className="text-[10px] font-medium text-text-secondary">Filters</p>
        <label className="block text-[10px] text-text-secondary">
          Tag filter
          <select
            value={(w.config.tag as string) ?? ""}
            onChange={(e) => update("tag", e.target.value || undefined)}
            className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.name}>{tag.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-[10px] text-text-secondary">
          Folder filter
          <select
            value={(w.config.folderId as string) ?? ""}
            onChange={(e) => update("folderId", e.target.value || undefined)}
            className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">All folders</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-[10px] text-text-secondary">
          Monitor type filter
          <select
            value={(w.config.monitorType as string) ?? ""}
            onChange={(e) => update("monitorType", e.target.value || undefined)}
            className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">All types</option>
            <option value="HTTP">HTTP</option>
            <option value="GIT_RELEASE">Version</option>
            <option value="DOCKER_IMAGE">Docker Image</option>
            <option value="TCP">TCP</option>
            <option value="SSL_CERT">SSL Cert</option>
            <option value="HEARTBEAT">Heartbeat</option>
          </select>
        </label>
        </div>
      )}

      {supportsVisibility && (
        <div className="rounded-lg border border-border/50 bg-bg/50 p-2.5 space-y-2">
          <p className="text-[10px] font-medium text-text-secondary">Visibility</p>
        <label className="block text-[10px] text-text-secondary">
          Show widget when
          <select
            value={(w.config.visibility as string) ?? "always"}
            onChange={(e) => update("visibility", e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="always">Always visible</option>
            <option value="operational">Only when operational</option>
            <option value="degraded">Only when degraded</option>
            <option value="outage">Only during outage</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[10px] text-text-secondary">
          <input
            type="checkbox"
            checked={Boolean(w.config.hideWhenNoData)}
            onChange={(e) => update("hideWhenNoData", e.target.checked || undefined)}
            className="h-3.5 w-3.5 rounded border-border bg-bg text-accent focus:ring-accent"
          />
          Hide when no monitor data is available
        </label>
        </div>
      )}

      {supportsClickAction && (
        <div className="rounded-lg border border-border/50 bg-bg/50 p-2.5 space-y-2">
          <p className="text-[10px] font-medium text-text-secondary">Click action</p>
        <label className="block text-[10px] text-text-secondary">
          On click
          <select
            value={(w.config.clickAction as string) ?? "none"}
            onChange={(e) => update("clickAction", e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="none">Do nothing</option>
            <option value="monitor-detail">Open monitor detail page</option>
            <option value="external-url">Open external URL</option>
          </select>
        </label>
        {(w.config.clickAction as string) === "external-url" && (
          <label className="block text-[10px] text-text-secondary">
            External URL
            <input
              type="url"
              value={(w.config.clickUrl as string) ?? ""}
              onChange={(e) => update("clickUrl", e.target.value || undefined)}
              placeholder="https://status.example.com/details"
              className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </label>
        )}
        </div>
      )}

      {supportsStyle && (
        <div className="rounded-lg border border-border/50 bg-bg/50 p-2.5 space-y-2">
          <p className="text-[10px] font-medium text-text-secondary">Style</p>
        <label className="flex items-center gap-2 text-[10px] text-text-secondary">
          <input
            type="checkbox"
            checked={Boolean(w.config.showBorder)}
            onChange={(e) => update("showBorder", e.target.checked || undefined)}
            className="h-3.5 w-3.5 rounded border-border bg-bg text-accent focus:ring-accent"
          />
          Show border
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] text-text-secondary">
            Border radius
            <input
              type="number"
              min={0}
              max={32}
              value={(w.config.borderRadius as number) ?? 12}
              onChange={(e) => update("borderRadius", Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="text-[10px] text-text-secondary">
            Padding
            <input
              type="number"
              min={0}
              max={48}
              value={(w.config.padding as number) ?? 8}
              onChange={(e) => update("padding", Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
        </div>
        </div>
      )}

      {supportsResponsive && (
        <div className="rounded-lg border border-border/50 bg-bg/50 p-2.5 space-y-2">
          <p className="text-[10px] font-medium text-text-secondary">Responsive</p>
        <label className="block text-[10px] text-text-secondary">
          Mobile behavior
          <select
            value={(w.config.mobileBehavior as string) ?? "normal"}
            onChange={(e) => update("mobileBehavior", e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="normal">Normal</option>
            <option value="full-width">Force full-width</option>
            <option value="collapsed">Collapsed (compact)</option>
            <option value="hidden">Hide on mobile</option>
          </select>
        </label>
        </div>
      )}

      {["uptime-bar", "uptime-timeline", "sla-summary"].includes(w.type) && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Time range</label>
          <select
            value={(w.config.periodDays as number) ?? 30}
            onChange={(e) => update("periodDays", Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      )}

      {["text-block", "scheduled-maintenance"].includes(w.type) && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Content</label>
          <textarea
            value={(w.config.text as string) ?? ""}
            onChange={(e) => update("text", e.target.value || undefined)}
            placeholder="Enter text or markdown…"
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
          />
        </div>
      )}

      {w.type === "collapsible-section" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Section Title</label>
            <input
              type="text"
              value={(w.config.title as string) ?? ""}
              onChange={(e) => update("title", e.target.value || undefined)}
              placeholder="Section title…"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Content</label>
            <textarea
              value={(w.config.description as string) ?? ""}
              onChange={(e) => update("description", e.target.value || undefined)}
              placeholder="Content text (supports newlines)…"
              rows={4}
              className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-3 py-2">
            <p className="text-xs font-medium text-text-primary">Open by default</p>
            <button
              onClick={() => update("defaultOpen", !(w.config.defaultOpen !== false))}
              className={`relative h-5 w-9 rounded-full transition-colors ${(w.config.defaultOpen !== false) ? "bg-accent" : "bg-surface-elevated border border-border"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${(w.config.defaultOpen !== false) ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>
        </>
      )}

      {w.type === "tab-container" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Tabs (JSON)</label>
          <textarea
            value={JSON.stringify(
              (w.config.tabs as unknown[] | undefined) ?? [{ title: "Tab 1", content: "" }, { title: "Tab 2", content: "" }],
              null, 2
            )}
            onChange={(e) => {
              try { update("tabs", JSON.parse(e.target.value)); } catch {}
            }}
            rows={6}
            className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-text-muted">Array of {`{title, content}`} — content supports newlines</p>
        </div>
      )}

      {w.type === "dependency-map" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Edges (JSON)</label>
          <textarea
            value={JSON.stringify((w.config.edges as unknown[] | undefined) ?? [], null, 2)}
            onChange={(e) => {
              try { update("edges", JSON.parse(e.target.value)); } catch {}
            }}
            placeholder='[{"source":"id1","target":"id2","label":"calls"}]'
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-text-muted">Array of {`{source, target, label?}`} using monitor IDs</p>
        </div>
      )}

      {w.type === "multi-environment-status" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Environment → Monitor IDs (JSON)</label>
            <textarea
              value={JSON.stringify((w.config.envMonitors as Record<string, string[]> | undefined) ?? { prod: [], staging: [], dev: [] }, null, 2)}
              onChange={(e) => {
                try { update("envMonitors", JSON.parse(e.target.value)); } catch {}
              }}
              rows={6}
              className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-3 py-2">
            <p className="text-xs font-medium text-text-primary">Show monitor list</p>
            <button
              onClick={() => update("showMonitors", !w.config.showMonitors)}
              className={`relative h-5 w-9 rounded-full transition-colors ${w.config.showMonitors ? "bg-accent" : "bg-surface-elevated border border-border"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${w.config.showMonitors ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>
        </>
      )}

      {w.type === "region-status-map" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Region → Monitor IDs (JSON)</label>
          <textarea
            value={JSON.stringify((w.config.regionMonitors as Record<string, string[]> | undefined) ?? { "EU-West": [], "US-East": [], "APAC": [] }, null, 2)}
            onChange={(e) => {
              try { update("regionMonitors", JSON.parse(e.target.value)); } catch {}
            }}
            rows={6}
            className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-text-muted">Map region names to arrays of monitor IDs</p>
        </div>
      )}

      {w.type === "third-party-dependencies" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Services (JSON)</label>
          <textarea
            value={JSON.stringify((w.config.services as unknown[] | undefined) ?? [{ name: "GitHub", url: "https://api.github.com" }, { name: "Cloudflare", url: "https://cloudflare.com" }], null, 2)}
            onChange={(e) => {
              try { update("services", JSON.parse(e.target.value)); } catch {}
            }}
            rows={6}
            className="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-text-muted">Array of {`{name, url}`} — each is HEAD-checked</p>
        </div>
      )}

      {w.type === "security-advisory" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Package Name</label>
            <input
              type="text"
              value={(w.config.packageName as string) ?? ""}
              onChange={(e) => update("packageName", e.target.value)}
              placeholder="e.g. express"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-text-muted">Package name to look up in GitHub Security Advisories</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Ecosystem (optional)</label>
            <input
              type="text"
              value={(w.config.ecosystem as string) ?? ""}
              onChange={(e) => update("ecosystem", e.target.value)}
              placeholder="e.g. npm, pip, cargo, go"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
        </>
      )}

      {w.type === "column-layout" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Number of Columns</label>
            <select
              value={(w.config.columns as number) ?? 2}
              onChange={(e) => update("columns", Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value={2}>2 columns</option>
              <option value={3}>3 columns</option>
              <option value={4}>4 columns</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Column Items (JSON)</label>
            <textarea
              rows={4}
              value={(w.config.items as string) ?? '[{"heading":"Column 1","body":"Content here"},{"heading":"Column 2","body":"Content here"}]'}
              onChange={(e) => { try { JSON.parse(e.target.value); update("items", e.target.value as unknown as boolean); } catch { /* keep raw */ }}}
              placeholder='[{"heading":"Col 1","body":"..."},{"heading":"Col 2","body":"..."}]'
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-text-muted">Array of {`{heading?, body}`} objects, one per column</p>
          </div>
        </>
      )}

      {w.type === "sticky-header" && (
        <div>
          <p className="text-[10px] text-text-muted">Shows the overall system status as a fixed-position banner. Place it at the top of your page (y=0) for best effect. Status is computed from all monitors in real-time.</p>
        </div>
      )}

      {w.type === "table-of-contents" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Items (JSON)</label>
          <textarea
            rows={5}
            value={(w.config.items as string) ?? '[{"label":"System Status","anchor":"status"},{"label":"Incidents","anchor":"incidents"}]'}
            onChange={(e) => { try { JSON.parse(e.target.value); update("items", e.target.value as unknown as boolean); } catch { /* keep raw */ }}}
            placeholder='[{"label":"Section Title","anchor":"section-id"}]'
            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-text-muted">Array of {"{label, anchor}"} where anchor matches an id on the page element.</p>
        </div>
      )}

      {w.type === "page-navigation" && (
        <div>
          <p className="text-[10px] text-text-muted">Automatically lists all other published status pages in your account. No configuration needed — links update in real-time as pages are published or unpublished.</p>
        </div>
      )}

      {w.type === "offline-banner" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Message</label>
            <input
              type="text"
              value={(w.config.message as string) ?? ""}
              onChange={(e) => update("message", e.target.value || undefined)}
              placeholder="Service monitoring is temporarily unavailable"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-text-secondary">
              Background color
              <input
                type="text"
                value={(w.config.bgColor as string) ?? ""}
                onChange={(e) => update("bgColor", e.target.value || undefined)}
                placeholder="#fef08a or amber-500"
                className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
              />
            </label>
            <label className="text-[10px] text-text-secondary">
              Text color
              <input
                type="text"
                value={(w.config.textColor as string) ?? ""}
                onChange={(e) => update("textColor", e.target.value || undefined)}
                placeholder="#78350f"
                className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
              />
            </label>
          </div>
          <p className="text-[10px] text-text-muted">This banner appears automatically when the visitor&apos;s browser goes offline. Leave colors empty to use the default amber/yellow style.</p>
        </>
      )}

      {w.type === "custom-metric-chart" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Title</label>
            <input
              type="text"
              value={(w.config.title as string) ?? ""}
              onChange={(e) => update("title", e.target.value || undefined)}
              placeholder="e.g. API Latency (24h)"
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Monitor</label>
            <select
              value={(w.config.monitorId as string) ?? ""}
              onChange={(e) => update("monitorId", e.target.value || undefined)}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="">— Select monitor —</option>
              {monitors.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Metric</label>
            <select
              value={(w.config.metric as string) ?? "latency"}
              onChange={(e) => update("metric", e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="latency">Latency (ms)</option>
              <option value="uptime">Uptime (%)</option>
              <option value="checks">Check count</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Chart type</label>
            <select
              value={(w.config.chartType as string) ?? "line"}
              onChange={(e) => update("chartType", e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="line">Line</option>
              <option value="bar">Bar</option>
              <option value="area">Area</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Time range</label>
            <select
              value={(w.config.timeRange as number) ?? 24}
              onChange={(e) => update("timeRange", Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value={6}>Last 6 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={168}>Last 7 days</option>
              <option value={720}>Last 30 days</option>
            </select>
          </div>
        </>
      )}

      <div className="rounded-lg border border-border/50 bg-bg/50 p-2.5 space-y-2">
        <p className="text-[10px] font-medium text-text-secondary">Size & placement</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] text-text-secondary">
            Width (cols)
            <input
              type="number"
              min={1}
              max={12}
              value={w.w}
              onChange={(e) => onResize({ w: Number(e.target.value), h: w.h })}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="text-[10px] text-text-secondary">
            Height (rows)
            <input
              type="number"
              min={1}
              max={10}
              value={w.h}
              onChange={(e) => onResize({ w: w.w, h: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
        </div>
        <p className="text-[10px] text-text-primary">Position: ({w.x}, {w.y})</p>
      </div>

      <div className="space-y-1.5 pt-2">
        <button
          onClick={() => onToggleLock(w.id)}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
            w.locked
              ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
              : "border-border bg-bg text-text-secondary hover:text-text-primary"
          }`}
          title={w.locked ? "Unlock this widget to allow moving and resizing" : "Lock this widget to prevent accidental moves"}
        >
          {w.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          {w.locked ? "Unlock Widget" : "Lock Widget"}
        </button>

        {/* Layer order */}
        <div className="rounded-lg border border-border bg-bg overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
            <Layers className="h-3 w-3 text-text-secondary/60" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/60">Layer</span>
          </div>
          <div className="grid grid-cols-4">
            {([
              { action: "front" as const, icon: ChevronsUp, title: "Bring to front" },
              { action: "forward" as const, icon: ChevronUp, title: "Bring forward" },
              { action: "backward" as const, icon: ChevronDown, title: "Send backward" },
              { action: "back" as const, icon: ChevronsDown, title: "Send to back" },
            ]).map(({ action, icon: Icon, title }) => (
              <button
                key={action}
                onClick={() => onZOrder(w.id, action)}
                title={title}
                className="flex items-center justify-center py-1.5 text-text-secondary/60 transition hover:bg-accent/10 hover:text-accent"
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => onDuplicate(w.id)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/10"
        >
          <Copy className="h-3.5 w-3.5" />
          Duplicate Widget
        </button>
        <button
          onClick={() => onDelete(w.id)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
        >
          <X className="h-3.5 w-3.5" />
          Delete Widget
        </button>
      </div>
    </div>
  );
}

// ── Version History ───────────────────────────────────────────────────────

interface VersionEntry {
  ts: number;
  widgetCount: number;
  widgets: Widget[];
  settings: PageSettings;
}

// ── Main page ────────────────────────────────────────────────────────────

export default function StatusPageEditorPage() {
  const params = useParams();
  const router = useRouter();
  const toastCtx = useToast();
  const id = params.id as string;

  const [page, setPage] = useState<StatusPage | null>(null);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const savedWidgetsRef = useRef<string>('[]'); // JSON snapshot of last saved state
  const [activeCategory, setActiveCategory] = useState("Status");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [paletteDropPreview, setPaletteDropPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [alignGuides, setAlignGuides] = useState<{ type: "h" | "v"; pos: number }[]>([]);
  const [viewportMode, setViewportMode] = useState<ViewportMode>("desktop");
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showPageSettings, setShowPageSettings] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [pageSettings, setPageSettings] = useState<PageSettings>({});
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [confirmRemovePassword, setConfirmRemovePassword] = useState(false);

  const versionHistoryKey = `sp-vhist-${id}`;
  const [versionHistory, setVersionHistory] = useState<VersionEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(`sp-vhist-${id}`) || "[]") as VersionEntry[]; } catch { return []; }
  });

  // Server-side version history
  interface ApiHistoryEntry { id: string; savedAt: string; label: string | null; layout: { widgets?: unknown[]; settings?: unknown } }
  const [apiHistory, setApiHistory] = useState<ApiHistoryEntry[]>([]);
  const [apiHistoryLoading, setApiHistoryLoading] = useState(false);
  const [restoringHistoryId, setRestoringHistoryId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Undo/Redo history
  const historyRef = useRef<Widget[][]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isUndoRedoRef = useRef<boolean>(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    const u = getUser();
    if (!u) router.replace("/login");
    fetchPage();
    fetchMonitors();
    fetchTags();
    fetchFolders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchPage() {
    setLoading(true);
    try {
      const data = await api<StatusPage>(`/v1/status-pages/${id}`);
      setPage(data);
      const loadedWidgets = data.layout?.widgets ?? [];
      setWidgets(loadedWidgets);
      // Merge layout settings with top-level page fields (like notifyWebhookUrl)
      setPageSettings({
        ...(data.layout?.settings ?? {}),
        ...(data.notifyWebhookUrl ? { notifyWebhookUrl: data.notifyWebhookUrl } : {}),
        ...(data.slackWebhookUrl ? { slackWebhookUrl: data.slackWebhookUrl } : {}),
        ...(data.discordWebhookUrl ? { discordWebhookUrl: data.discordWebhookUrl } : {}),
      });
      savedWidgetsRef.current = JSON.stringify(loadedWidgets); // mark clean
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
        toastCtx.error("Status page not found");
        router.push("/status-pages");
      } else if (msg.includes("403") || msg.toLowerCase().includes("forbidden")) {
        toastCtx.error("Access denied");
        router.push("/status-pages");
      } else {
        toastCtx.error("Failed to load status page");
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchMonitors() {
    try {
      const data = await api<Monitor[]>("/v1/monitors");
      setMonitors(data);
    } catch {
      // Non-fatal
    }
  }

  async function fetchTags() {
    try {
      const data = await api<TagOption[]>("/v1/tags");
      setTags(data);
    } catch {
      // Non-fatal
    }
  }

  async function fetchFolders() {
    try {
      const data = await api<FolderOption[]>("/v1/folders");
      setFolders(data);
    } catch {
      // Non-fatal
    }
  }

  const handleSave = useCallback(async (opts?: { silent?: boolean }) => {
    if (!page) return;
    setSaving(true);
    try {
      // notifyWebhookUrl, slackWebhookUrl, discordWebhookUrl are top-level page fields (not inside layout)
      const { notifyWebhookUrl: _webhookInSettings, slackWebhookUrl: _slackInSettings, discordWebhookUrl: _discordInSettings, ...layoutSettings } = pageSettings;
      const patchBody: Record<string, unknown> = { layout: { widgets, settings: layoutSettings } };
      if (pageSettings.notifyWebhookUrl !== undefined) {
        patchBody.notifyWebhookUrl = pageSettings.notifyWebhookUrl;
      }
      if (pageSettings.slackWebhookUrl !== undefined) {
        patchBody.slackWebhookUrl = pageSettings.slackWebhookUrl;
      }
      if (pageSettings.discordWebhookUrl !== undefined) {
        patchBody.discordWebhookUrl = pageSettings.discordWebhookUrl;
      }
      await api(`/v1/status-pages/${id}`, undefined, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      // Mark as clean after successful save
      savedWidgetsRef.current = JSON.stringify(widgets);
      setIsDirty(false);

      // Record version history (localStorage, keep last 10)
      if (!opts?.silent) {
        setVersionHistory((prev) => {
          const entry: VersionEntry = { ts: Date.now(), widgetCount: widgets.length, widgets, settings: pageSettings };
          const next = [entry, ...prev].slice(0, 10);
          try { localStorage.setItem(`sp-vhist-${id}`, JSON.stringify(next)); } catch {}
          return next;
        });
      }

      // Only show toast on manual save
      if (!opts?.silent) toastCtx.success("Saved");
    } catch {
      toastCtx.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }, [page, id, widgets, pageSettings, toastCtx, versionHistoryKey]);

  // Track dirty state whenever widgets change
  const initialLoad = useRef(true);
  useEffect(() => {
    if (initialLoad.current) { initialLoad.current = false; return; }
    const current = JSON.stringify(widgets);
    setIsDirty(current !== savedWidgetsRef.current);
  }, [widgets]);

  // Auto-save 2 seconds after widget changes (silent — no toast)
  useEffect(() => {
    if (!autoSaveEnabled) return;
    if (!isDirty || !page) return;
    const timer = setTimeout(() => { handleSave({ silent: true }); }, 2000);
    return () => clearTimeout(timer);
  }, [isDirty, widgets, page, handleSave, autoSaveEnabled]);

  async function handleTogglePublish() {
    if (!page) return;
    setPublishing(true);
    try {
      const updated = await api<{ isPublished: boolean }>(`/v1/status-pages/${id}/publish`, undefined, { method: "POST" });
      setPage((prev) => prev ? { ...prev, isPublished: updated.isPublished } : prev);
      toastCtx.success(updated.isPublished ? "Page published — it's now live!" : "Page unpublished");
    } catch {
      toastCtx.error("Failed to update publish state");
    } finally {
      setPublishing(false);
    }
  }

  function applyTemplate(tmpl: StatusTemplate) {
    if (widgets.length > 0) {
      if (!confirm(`Replace current ${widgets.length} widget(s) with the "${tmpl.name}" template?`)) return;
    }
    const newWidgets = tmpl.widgets.map((w) => ({
      ...w,
      id: `w-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }));
    setWidgets(newWidgets);
    setSelectedId(null);
    setSelectedIds(new Set());
    setShowTemplateGallery(false);
  }

  function autoPlace(w: number, h: number): { x: number; y: number } {
    if (widgets.length === 0) return { x: 0, y: 0 };
    // Stack below all existing widgets
    const maxY = Math.max(...widgets.map((wg) => wg.y + wg.h));
    return { x: 0, y: maxY };
  }

  function addWidget(type: string) {
    const paletteItem = WIDGET_PALETTE.find((p) => p.type === type);
    if (!paletteItem) return;
    const { x, y } = autoPlace(paletteItem.defaultW, paletteItem.defaultH);
    const newWidget: Widget = {
      id: `${type}-${Date.now()}`,
      type,
      x,
      y,
      w: paletteItem.defaultW,
      h: paletteItem.defaultH,
      config: {},
    };
    setWidgets((prev) => [...prev, newWidget]);
    setSelectedId(newWidget.id);
  }

  function restoreVersion(entry: VersionEntry) {
    if (!confirm(`Restore this version (${entry.widgetCount} widgets from ${new Date(entry.ts).toLocaleTimeString()})? Current unsaved changes will be lost.`)) return;
    setWidgets(entry.widgets);
    setPageSettings(entry.settings);
    setSelectedId(null);
    setSelectedIds(new Set());
    setShowVersionHistory(false);
    toastCtx.success("Version restored — save to apply");
  }

  async function loadApiHistory() {
    setApiHistoryLoading(true);
    try {
      const data = await api<ApiHistoryEntry[]>(`/v1/status-pages/${id}/history`);
      setApiHistory(data);
    } catch {
      // silently fail
    } finally {
      setApiHistoryLoading(false);
    }
  }

  async function restoreApiVersion(historyId: string) {
    if (!confirm("Restore this version from server? Your current unsaved changes will be lost.")) return;
    setRestoringHistoryId(historyId);
    try {
      const result = await api<{ layout: { widgets?: Widget[]; settings?: PageSettings } }>(`/v1/status-pages/${id}/history/${historyId}/restore`, undefined, { method: "POST" });
      const restoredLayout = result.layout as { widgets?: Widget[]; settings?: PageSettings };
      const restoredWidgets = (restoredLayout?.widgets ?? []) as Widget[];
      const restoredSettings = (restoredLayout?.settings ?? {}) as PageSettings;
      setWidgets(restoredWidgets);
      setPageSettings(restoredSettings);
      savedWidgetsRef.current = JSON.stringify(restoredWidgets);
      setIsDirty(false);
      setSelectedId(null);
      setSelectedIds(new Set());
      setShowVersionHistory(false);
      toastCtx.success("Version restored from server");
      // Reload API history after restore
      loadApiHistory();
    } catch {
      toastCtx.error("Failed to restore version");
    } finally {
      setRestoringHistoryId(null);
    }
  }

  function handleWidgetSelect(id: string | null, shiftKey?: boolean) {
    if (id === null) {
      setSelectedId(null);
      setSelectedIds(new Set());
      return;
    }
    if (shiftKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
          // If we removed the primary selected, pick a different one
          if (selectedId === id) setSelectedId(next.size > 0 ? [...next][0] : null);
        } else {
          next.add(id);
          // Also include primary selectedId if it exists
          if (selectedId) next.add(selectedId);
        }
        return next;
      });
      // Don't change primary selectedId on shift-click unless it's empty
      setSelectedId((prev) => prev ?? id);
    } else {
      setSelectedId(id);
      setSelectedIds(new Set());
    }
  }

  function deleteWidget(widgetId: string) {
    setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
    if (selectedId === widgetId) setSelectedId(null);
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(widgetId); return next; });
  }

  function duplicateWidget(widgetId: string) {
    const src = widgets.find((w) => w.id === widgetId);
    if (!src) return;
    const { x, y } = autoPlace(src.w, src.h);
    const copy: Widget = { ...src, id: `w-${Date.now()}`, x, y, locked: false };
    setWidgets((prev) => [...prev, copy]);
    setSelectedId(copy.id);
    setSelectedIds(new Set());
  }

  function toggleWidgetLock(widgetId: string) {
    setWidgets((prev) =>
      prev.map((w) => (w.id === widgetId ? { ...w, locked: !w.locked } : w))
    );
  }

  function zoomIn() { setZoom((z) => Math.min(2, parseFloat((z + 0.1).toFixed(1)))); }
  function zoomOut() { setZoom((z) => Math.max(0.3, parseFloat((z - 0.1).toFixed(1)))); }
  function zoomReset() { setZoom(1); }

  function pushHistory(newWidgets: Widget[]) {
    if (isUndoRedoRef.current) return;
    const hist = historyRef.current;
    const sliced = hist.slice(0, historyIndexRef.current + 1);
    sliced.push(newWidgets);
    if (sliced.length > 50) sliced.shift();
    historyRef.current = sliced;
    historyIndexRef.current = sliced.length - 1;
  }

  useEffect(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    if (widgets.length === 0 && historyIndexRef.current === -1) return;
    pushHistory(widgets);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets]);

  function undo() {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    isUndoRedoRef.current = true;
    setWidgets(historyRef.current[historyIndexRef.current]);
  }

  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    isUndoRedoRef.current = true;
    setWidgets(historyRef.current[historyIndexRef.current]);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      // Copy: Ctrl+C — copy selected widgets to clipboard (localStorage)
      if (meta && e.key === "c") {
        const allSelected = new Set(selectedIds);
        if (selectedId) allSelected.add(selectedId);
        if (allSelected.size > 0) {
          e.preventDefault();
          const copied = widgets.filter((w) => allSelected.has(w.id));
          localStorage.setItem("pulsedock:widget-clipboard", JSON.stringify(copied));
        }
      }
      // Paste: Ctrl+V — paste from clipboard with offset
      if (meta && e.key === "v") {
        e.preventDefault();
        const raw = localStorage.getItem("pulsedock:widget-clipboard");
        if (raw) {
          try {
            const copied: Widget[] = JSON.parse(raw);
            if (Array.isArray(copied) && copied.length > 0) {
              const maxY = Math.max(...widgets.map((w) => w.y + w.h), 0);
              const minY = Math.min(...copied.map((w) => w.y), 0);
              const pasted: Widget[] = copied.map((w) => ({
                ...w,
                id: `w-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                y: w.y - minY + maxY + 1,
                locked: false,
              }));
              setWidgets((prev) => [...prev, ...pasted]);
              setSelectedId(pasted[0]?.id ?? null);
              setSelectedIds(new Set(pasted.map((p) => p.id)));
            }
          } catch {
            // ignore malformed clipboard
          }
        }
      }
      if (meta && e.key === "d") {
        e.preventDefault();
        // Group duplicate: duplicate all selected, or single if only one
        const allSelected = new Set(selectedIds);
        if (selectedId) allSelected.add(selectedId);
        if (allSelected.size > 1) {
          const maxY = Math.max(...widgets.map((w) => w.y + w.h), 0);
          const copies: Widget[] = [];
          allSelected.forEach((sid) => {
            const src = widgets.find((w) => w.id === sid);
            if (src) copies.push({ ...src, id: `w-${Date.now()}-${Math.random().toString(36).slice(2)}`, y: maxY + src.y, locked: false });
          });
          setWidgets((prev) => [...prev, ...copies]);
          setSelectedIds(new Set(copies.map((c) => c.id)));
          setSelectedId(copies[0]?.id ?? null);
        } else if (selectedId) {
          duplicateWidget(selectedId);
        }
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          // Group delete: delete all selectedIds if multiple, else single selectedId
          if (selectedIds.size > 0) {
            const toDelete = new Set(selectedIds);
            if (selectedId) toDelete.add(selectedId);
            setWidgets((prev) => prev.filter((w) => !toDelete.has(w.id)));
            setSelectedId(null);
            setSelectedIds(new Set());
          } else if (selectedId) {
            deleteWidget(selectedId);
          }
        }
      }
      if (e.key === "Escape") { setSelectedId(null); setSelectedIds(new Set()); }
    }
    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => {
          const delta = e.deltaY > 0 ? -0.1 : 0.1;
          return Math.max(0.3, Math.min(2, parseFloat((z + delta).toFixed(1))));
        });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedIds, widgets]);

  function updateWidgetConfig(config: Widget["config"]) {
    setWidgets((prev) =>
      prev.map((w) => (w.id === selectedId ? { ...w, config } : w))
    );
  }

  function updateWidgetSize(size: { w: number; h: number }) {
    const nextW = Math.max(1, Math.min(COL_COUNT, Number.isFinite(size.w) ? size.w : 1));
    const nextH = Math.max(1, Math.min(10, Number.isFinite(size.h) ? size.h : 1));
    setWidgets((prev) =>
      prev.map((w) => {
        if (w.id !== selectedId) return w;
        const boundedX = Math.max(0, Math.min(COL_COUNT - nextW, w.x));
        return { ...w, w: nextW, h: nextH, x: boundedX };
      })
    );
  }

  /** Align all multi-selected widgets (including primary selectedId) */
  function alignSelected(dir: "left" | "right" | "top" | "bottom" | "center-h" | "center-v") {
    const allSelected = new Set(selectedIds);
    if (selectedId) allSelected.add(selectedId);
    if (allSelected.size < 2) return;
    const sel = widgets.filter((w) => allSelected.has(w.id));
    const minX = Math.min(...sel.map((w) => w.x));
    const maxX = Math.max(...sel.map((w) => w.x + w.w));
    const minY = Math.min(...sel.map((w) => w.y));
    const maxY = Math.max(...sel.map((w) => w.y + w.h));
    setWidgets((prev) =>
      prev.map((w) => {
        if (!allSelected.has(w.id)) return w;
        switch (dir) {
          case "left": return { ...w, x: minX };
          case "right": return { ...w, x: Math.max(0, maxX - w.w) };
          case "top": return { ...w, y: minY };
          case "bottom": return { ...w, y: Math.max(0, maxY - w.h) };
          case "center-h": return { ...w, x: Math.round((minX + maxX) / 2 - w.w / 2) };
          case "center-v": return { ...w, y: Math.round((minY + maxY) / 2 - w.h / 2) };
          default: return w;
        }
      })
    );
  }

  function resizeWidgetById(widgetId: string, size: { w: number; h: number }) {
    const nextW = Math.max(1, Math.min(COL_COUNT, Number.isFinite(size.w) ? size.w : 1));
    const nextH = Math.max(1, Math.min(10, Number.isFinite(size.h) ? size.h : 1));
    setWidgets((prev) =>
      prev.map((w) => {
        if (w.id !== widgetId) return w;
        const boundedX = Math.max(0, Math.min(COL_COUNT - nextW, w.x));
        return { ...w, w: nextW, h: nextH, x: boundedX };
      })
    );
  }

  function handleZOrder(widgetId: string, action: "front" | "back" | "forward" | "backward") {
    setWidgets((prev) => {
      const sorted = [...prev].sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0));
      const idx = sorted.findIndex((w) => w.id === widgetId);
      if (idx === -1) return prev;
      const newSorted = [...sorted];
      if (action === "front") {
        const [item] = newSorted.splice(idx, 1);
        newSorted.push(item);
      } else if (action === "back") {
        const [item] = newSorted.splice(idx, 1);
        newSorted.unshift(item);
      } else if (action === "forward" && idx < newSorted.length - 1) {
        const tmp = newSorted[idx + 1];
        newSorted[idx + 1] = newSorted[idx];
        newSorted[idx] = tmp;
      } else if (action === "backward" && idx > 0) {
        const tmp = newSorted[idx - 1];
        newSorted[idx - 1] = newSorted[idx];
        newSorted[idx] = tmp;
      }
      return newSorted.map((w, i) => ({ ...w, zOrder: i }));
    });
  }

  function handleDragMove(event: DragMoveEvent) {
    const { active, delta } = event;
    const activeId = active.id as string;

    if (activeId.startsWith("palette-")) {
      if (!canvasRef.current || !active.rect.current.translated) {
        setPaletteDropPreview(null);
        return;
      }
      const type = activeId.replace("palette-", "");
      const paletteItem = WIDGET_PALETTE.find((p) => p.type === type);
      if (!paletteItem) {
        setPaletteDropPreview(null);
        return;
      }
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const moved = active.rect.current.translated;
      const colWidth = canvasRect.width / COL_COUNT;
      const relX = moved.left + moved.width / 2 - canvasRect.left;
      const relY = moved.top - canvasRect.top;
      const inCanvas = relX >= 0 && relX <= canvasRect.width && relY >= 0;
      if (!inCanvas) {
        setPaletteDropPreview(null);
        return;
      }
      const x = Math.max(0, Math.min(COL_COUNT - paletteItem.defaultW, Math.floor(relX / colWidth)));
      const y = Math.max(0, Math.floor(relY / ROW_H));
      setPaletteDropPreview({ x, y, w: paletteItem.defaultW, h: paletteItem.defaultH });
      setAlignGuides([]);
      return;
    }

    if (!activeId.startsWith("canvas-") || !canvasRef.current) {
      setAlignGuides([]);
      setPaletteDropPreview(null);
      return;
    }
    const widgetId = activeId.replace("canvas-", "");
    const movingWidget = widgets.find((w) => w.id === widgetId);
    if (!movingWidget || !canvasRef.current) return;

    const containerWidth = canvasRef.current.getBoundingClientRect().width;
    const colWidth = containerWidth / COL_COUNT;
    const movedX = Math.max(0, Math.min(COL_COUNT - movingWidget.w, movingWidget.x + Math.round(delta.x / colWidth))) * colWidth;
    const movedY = Math.max(0, movingWidget.y + Math.round(delta.y / ROW_H)) * ROW_H;
    const movedRight = movedX + movingWidget.w * colWidth;
    const movedCenterH = movedX + (movingWidget.w * colWidth) / 2;
    const movedBottom = movedY + movingWidget.h * ROW_H;
    const movedCenterV = movedY + (movingWidget.h * ROW_H) / 2;

    const guides: { type: "h" | "v"; pos: number }[] = [];
    const SNAP_TOLERANCE = 8; // pixels

    for (const w of widgets) {
      if (w.id === widgetId) continue;
      const wx = w.x * colWidth;
      const wy = w.y * ROW_H;
      const wr = (w.x + w.w) * colWidth;
      const wb = (w.y + w.h) * ROW_H;
      const wcv = wy + (w.h * ROW_H) / 2;
      const wch = wx + (w.w * colWidth) / 2;

      // Vertical guides (left/right/center alignment)
      for (const [myEdge, theirEdge] of [[movedX, wx], [movedX, wr], [movedRight, wx], [movedRight, wr], [movedCenterH, wch]]) {
        if (Math.abs(myEdge - theirEdge) <= SNAP_TOLERANCE) {
          guides.push({ type: "v", pos: theirEdge });
        }
      }
      // Horizontal guides (top/bottom/center alignment)
      for (const [myEdge, theirEdge] of [[movedY, wy], [movedY, wb], [movedBottom, wy], [movedBottom, wb], [movedCenterV, wcv]]) {
        if (Math.abs(myEdge - theirEdge) <= SNAP_TOLERANCE) {
          guides.push({ type: "h", pos: theirEdge });
        }
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    const unique = guides.filter((g) => {
      const key = `${g.type}:${g.pos}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    setAlignGuides(unique);
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = event.active.id as string;
    setActiveDragId(activeId);
    if (!activeId.startsWith("palette-")) {
      setPaletteDropPreview(null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    setAlignGuides([]);
    setPaletteDropPreview(null);
    const { active, delta, over } = event;
    const activeId = active.id as string;

    if (activeId.startsWith("palette-")) {
      // Drop from palette onto canvas — place at cursor position
      if (over?.id === "canvas") {
        const type = activeId.replace("palette-", "");
        const paletteItem = WIDGET_PALETTE.find((p) => p.type === type);
        if (paletteItem && canvasRef.current && active.rect.current.translated) {
          const canvasRect = canvasRef.current.getBoundingClientRect();
          const droppedRect = active.rect.current.translated;
          const colWidth = canvasRect.width / COL_COUNT;
          // Compute grid position from drop center
          const relX = droppedRect.left + droppedRect.width / 2 - canvasRect.left;
          const relY = droppedRect.top - canvasRect.top;
          const dropCol = Math.max(0, Math.min(COL_COUNT - paletteItem.defaultW, Math.floor(relX / colWidth)));
          const dropRow = Math.max(0, Math.floor(relY / ROW_H));
          const newWidget: Widget = {
            id: `${type}-${Date.now()}`,
            type,
            x: dropCol,
            y: dropRow,
            w: paletteItem.defaultW,
            h: paletteItem.defaultH,
            config: {},
          };
          setWidgets((prev) => [...prev, newWidget]);
          setSelectedId(newWidget.id);
        } else {
          addWidget(type);
        }
      }
    } else if (activeId.startsWith("canvas-")) {
      // Move existing widget (skip if locked)
      const widgetId = activeId.replace("canvas-", "");
      const movingWidget = widgets.find((w) => w.id === widgetId);
      if (movingWidget?.locked) return;
      if (!canvasRef.current) return;
      const containerWidth = canvasRef.current.getBoundingClientRect().width;
      const colWidth = containerWidth / COL_COUNT;
      const deltaCol = Math.round(delta.x / colWidth);
      const deltaRow = Math.round(delta.y / ROW_H);

      if (deltaCol === 0 && deltaRow === 0) return;

      // Collect all widget IDs to move (multi-select group or single)
      const allSelected = new Set(selectedIds);
      if (selectedId) allSelected.add(selectedId);
      const moveSet = allSelected.size > 1 ? allSelected : new Set([widgetId]);

      setWidgets((prev) =>
        prev.map((w) => {
          if (!moveSet.has(w.id) || w.locked) return w;
          const newX = Math.max(0, Math.min(COL_COUNT - w.w, w.x + deltaCol));
          const newY = Math.max(0, w.y + deltaRow);
          return { ...w, x: newX, y: newY };
        })
      );
    }
  }

  const selectedWidget = widgets.find((w) => w.id === selectedId) ?? null;
  const activeDragPaletteItem = activeDragId?.startsWith("palette-")
    ? WIDGET_PALETTE.find((p) => p.type === activeDragId.replace("palette-", ""))
    : null;
  const activeDragCanvasWidget = activeDragId?.startsWith("canvas-")
    ? widgets.find((w) => w.id === activeDragId.replace("canvas-", ""))
    : null;
  const isDraggingOverCanvas = !!activeDragId && activeDragId.startsWith("palette-");

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!page) return null;

  const publicBase = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
      <div className="flex h-screen flex-col bg-bg text-text-primary">
        {/* Toolbar */}
        <header className="flex items-center gap-3 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-sm">
          <button
            onClick={() => router.push("/status-pages")}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-text-secondary transition hover:text-text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
            Pages
          </button>
          <div className="mx-2 h-4 w-px bg-border" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-text-primary">{page.title}</h1>
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs text-text-secondary">/status/{page.slug}</code>
              {page.isPublished && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  Live
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary/60">{widgets.length} widget{widgets.length !== 1 ? "s" : ""}</span>
            {selectedIds.size > 0 && (() => {
              const allSelected = new Set(selectedIds);
              if (selectedId) allSelected.add(selectedId);
              const count = allSelected.size;
              return (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
                    {count} selected
                    <button
                      onClick={() => { setSelectedId(null); setSelectedIds(new Set()); }}
                      className="ml-1 hover:text-accent/70 transition"
                      title="Deselect all"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                  {count >= 2 && (
                    <div className="flex items-center rounded-lg border border-border bg-bg overflow-hidden" title="Align selected widgets">
                      {([
                        { icon: AlignStartVertical, dir: "left" as const, title: "Align left edges" },
                        { icon: AlignCenterVertical, dir: "center-h" as const, title: "Center horizontally" },
                        { icon: AlignEndVertical, dir: "right" as const, title: "Align right edges" },
                        { icon: AlignStartHorizontal, dir: "top" as const, title: "Align top edges" },
                        { icon: AlignCenterHorizontal, dir: "center-v" as const, title: "Center vertically" },
                        { icon: AlignEndHorizontal, dir: "bottom" as const, title: "Align bottom edges" },
                      ] as const).map(({ icon: Icon, dir, title }) => (
                        <button
                          key={dir}
                          onClick={() => alignSelected(dir)}
                          title={title}
                          className="flex items-center justify-center px-2 py-1.5 text-text-secondary/60 transition hover:bg-accent/10 hover:text-accent"
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
            {page.isPublished && (
              <a
                href={`${publicBase}/status/${page.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Preview
              </a>
            )}
            <button
              onClick={handleTogglePublish}
              disabled={publishing}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                page.isPublished
                  ? "border-border bg-bg text-text-secondary hover:border-red-500/40 hover:text-red-400"
                  : "border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20"
              }`}
            >
              {page.isPublished ? (
                <><EyeOff className="h-3.5 w-3.5" /> Unpublish</>
              ) : (
                <><Eye className="h-3.5 w-3.5" /> Publish</>
              )}
            </button>
            <button
              onClick={undo}
              title="Undo (Ctrl+Z)"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs text-text-secondary transition hover:text-text-primary disabled:opacity-30"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={redo}
              title="Redo (Ctrl+Y)"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs text-text-secondary transition hover:text-text-primary disabled:opacity-30"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
            {/* Viewport mode (responsive preview) */}
            <div className="flex items-center rounded-lg border border-border bg-bg overflow-hidden">
              {([
                { mode: "desktop" as ViewportMode, icon: Monitor, title: "Desktop view" },
                { mode: "tablet" as ViewportMode, icon: Tablet, title: "Tablet view (768px)" },
                { mode: "mobile" as ViewportMode, icon: Smartphone, title: "Mobile view (375px)" },
              ] as const).map(({ mode, icon: Icon, title }) => (
                <button
                  key={mode}
                  onClick={() => setViewportMode(mode)}
                  title={title}
                  className={`flex items-center justify-center px-2.5 py-1.5 text-xs transition ${
                    viewportMode === mode
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>

            {/* Show/hide grid toggle */}
            <button
              onClick={() => setShowGrid((v) => !v)}
              title={showGrid ? "Hide grid" : "Show grid"}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition ${showGrid ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-bg text-text-secondary hover:text-text-primary"}`}
            >
              <Grid className="h-3.5 w-3.5" />
            </button>

            {/* Canvas zoom controls */}
            <div className="flex items-center rounded-lg border border-border bg-bg overflow-hidden">
              <button onClick={zoomOut} title="Zoom out (Ctrl+scroll)" className="flex items-center justify-center px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary transition">
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button onClick={zoomReset} title="Reset zoom" className="px-2 py-1.5 text-xs font-mono text-text-secondary hover:text-text-primary transition min-w-[40px] text-center">
                {Math.round(zoom * 100)}%
              </button>
              <button onClick={zoomIn} title="Zoom in (Ctrl+scroll)" className="flex items-center justify-center px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary transition">
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => { zoomReset(); setViewportMode("desktop"); }} title="Fit to screen" className="flex items-center justify-center px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary transition border-l border-border">
                <Maximize2 className="h-3 w-3" />
              </button>
            </div>

            {/* Version history button */}
            <button
              onClick={() => { setShowVersionHistory(true); loadApiHistory(); }}
              title={`Version history — ${versionHistory.length} save${versionHistory.length !== 1 ? "s" : ""} stored`}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
            >
              <History className="h-3.5 w-3.5" />
              History
              {versionHistory.length > 0 && (
                <span className="ml-0.5 rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">{versionHistory.length}</span>
              )}
            </button>

            {/* Template gallery button */}
            <button
              onClick={() => setShowTemplateGallery(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              Templates
            </button>

            {/* Page settings button */}
            <button
              onClick={() => setShowPageSettings(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:text-text-primary"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Settings
            </button>

            {/* Auto-save toggle */}
            <button
              onClick={() => setAutoSaveEnabled(v => !v)}
              title={autoSaveEnabled ? "Auto-save is ON — click to disable" : "Auto-save is OFF — click to enable"}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition ${autoSaveEnabled ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border bg-bg text-text-secondary hover:text-text-primary'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${autoSaveEnabled ? 'bg-accent animate-pulse' : 'bg-text-secondary/40'}`} />
              Auto
            </button>

            {/* Manual save button — greyed when no changes */}
            <button
              onClick={() => handleSave()}
              disabled={saving || !isDirty}
              title={isDirty ? "Save changes" : "No unsaved changes"}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/90 disabled:opacity-40 disabled:cursor-default"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : isDirty ? "Save*" : "Saved"}
            </button>
          </div>
        </header>

        {/* Editor body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Widget Palette — left sidebar */}
          <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Widgets</p>
            </div>
            {/* Search input */}
            <div className="border-b border-border p-2">
              <input
                type="text"
                placeholder="Search widgets..."
                value={paletteSearch}
                onChange={(e) => setPaletteSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
              />
            </div>
            {/* Category tabs — hidden when searching */}
            {!paletteSearch && (
              <div className="flex flex-wrap gap-1 border-b border-border p-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                      activeCategory === cat
                        ? "bg-accent text-white"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
            {/* Widget list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {(() => {
                const filtered = paletteSearch
                  ? WIDGET_PALETTE.filter((w) => {
                      const q = paletteSearch.toLowerCase();
                      return (
                        w.label.toLowerCase().includes(q) ||
                        w.description.toLowerCase().includes(q) ||
                        w.type.toLowerCase().includes(q)
                      );
                    })
                  : WIDGET_PALETTE.filter((w) => w.category === activeCategory);
                if (filtered.length === 0) {
                  return (
                    <p className="py-4 text-center text-xs text-text-secondary/60">No widgets found</p>
                  );
                }
                return filtered.map((widget) => (
                  <PaletteWidget key={widget.type} item={widget} onQuickAdd={addWidget} />
                ));
              })()}
            </div>
          </aside>

          {/* Canvas */}
          <main className="flex-1 overflow-auto bg-bg/50 p-6">
            {viewportMode !== "desktop" && (
              <div className="mb-3 flex items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                  {viewportMode === "tablet" ? <Tablet className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                  {viewportMode === "tablet" ? "Tablet preview — 768px" : "Mobile preview — 375px"}
                </span>
              </div>
            )}
            <CanvasDropZone
              widgets={widgets}
              selectedId={selectedId}
              selectedIds={selectedIds}
              isDraggingOverCanvas={isDraggingOverCanvas}
              canvasRef={canvasRef}
              zoom={zoom}
              viewportMode={viewportMode}
              showGrid={showGrid}
              alignGuides={alignGuides}
              paletteDropPreview={paletteDropPreview}
              onSelect={handleWidgetSelect}
              onDelete={deleteWidget}
              onDuplicate={duplicateWidget}
              onResize={resizeWidgetById}
              onToggleLock={toggleWidgetLock}
            />
          </main>

          {/* Right panel — Properties */}
          <aside className="flex w-60 shrink-0 flex-col border-l border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Settings className="h-3.5 w-3.5 text-text-secondary" />
              <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Properties</p>
            </div>
            <ConfigPanel
              widget={selectedWidget}
              monitors={monitors}
              tags={tags}
              folders={folders}
              onChange={updateWidgetConfig}
              onResize={updateWidgetSize}
              onDelete={deleteWidget}
              onDuplicate={duplicateWidget}
              onToggleLock={toggleWidgetLock}
              onZOrder={handleZOrder}
            />
          </aside>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeDragPaletteItem && (
          <div className="cursor-grabbing rounded-xl border border-accent/50 bg-surface px-3 py-2 shadow-xl shadow-black/30">
            <div className="flex items-center gap-2">
              <activeDragPaletteItem.icon className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-semibold text-text-primary">{activeDragPaletteItem.label}</span>
            </div>
          </div>
        )}
        {activeDragCanvasWidget && (
          <div className="cursor-grabbing rounded-xl border-2 border-accent/60 bg-surface shadow-xl shadow-black/30 px-4 py-3 opacity-90">
            <span className="text-xs font-medium text-text-primary">
              {WIDGET_PALETTE.find((p) => p.type === activeDragCanvasWidget.type)?.label ?? activeDragCanvasWidget.type}
            </span>
          </div>
        )}
      </DragOverlay>

      {/* Page Settings Modal */}
      {showPageSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50 flex flex-col" style={{ maxHeight: 'min(90vh, 760px)' }}>
            <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Page Settings</h2>
                <p className="text-xs text-text-muted mt-0.5">Configure theme, appearance, auto-refresh, and branding.</p>
              </div>
              <button onClick={() => setShowPageSettings(false)} className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5 flex-1">
              {/* Logo URL */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Logo URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={pageSettings.logoUrl ?? ""}
                  onChange={(e) => setPageSettings((s) => ({ ...s, logoUrl: e.target.value || undefined }))}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                />
                <p className="mt-1 text-xs text-text-muted">Displayed above the page title. Leave empty to hide.</p>
              </div>

              {/* Favicon URL */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Favicon URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/favicon.ico"
                  value={pageSettings.faviconUrl ?? ""}
                  onChange={(e) => setPageSettings((s) => ({ ...s, faviconUrl: e.target.value || undefined }))}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                />
                <p className="mt-1 text-xs text-text-muted">Custom favicon for the public status page. Leave empty to use default.</p>
              </div>

              {/* Accent color */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={pageSettings.accentColor ?? "#6366f1"}
                    onChange={(e) => setPageSettings((s) => ({ ...s, accentColor: e.target.value }))}
                    className="h-8 w-10 rounded cursor-pointer border border-border bg-bg"
                  />
                  <input
                    type="text"
                    placeholder="#6366f1"
                    value={pageSettings.accentColor ?? ""}
                    onChange={(e) => setPageSettings((s) => ({ ...s, accentColor: e.target.value || undefined }))}
                    className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-xs text-text-muted">Override the default accent color on the public page.</p>
              </div>

              {/* Auto-refresh interval */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  <RefreshCw className="inline h-3 w-3 mr-1" />
                  Auto-Refresh Interval
                </label>
                <select
                  value={pageSettings.autoRefreshInterval ?? 60}
                  onChange={(e) => setPageSettings((s) => ({ ...s, autoRefreshInterval: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary focus:border-accent focus:outline-none"
                >
                  <option value={0}>Off (manual only)</option>
                  <option value={10}>Every 10 seconds</option>
                  <option value={30}>Every 30 seconds</option>
                  <option value={60}>Every 60 seconds (default)</option>
                  <option value={300}>Every 5 minutes</option>
                  <option value={600}>Every 10 minutes</option>
                </select>
              </div>

              {/* Theme selector */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Theme</label>
                <div className="flex rounded-lg border border-border bg-bg overflow-hidden">
                  {(["dark", "light", "system"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setPageSettings((s) => ({ ...s, theme: t }))}
                      className={`flex-1 py-1.5 text-xs font-medium capitalize transition ${(pageSettings.theme ?? "dark") === t ? "bg-accent/15 text-accent" : "text-text-secondary hover:text-text-primary"}`}
                    >{t}</button>
                  ))}
                </div>
              </div>

              {/* Font selector */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Font</label>
                <select
                  value={pageSettings.fontFamily ?? "inter"}
                  onChange={(e) => setPageSettings((s) => ({ ...s, fontFamily: e.target.value as PageSettings["fontFamily"] }))}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary focus:border-accent focus:outline-none"
                >
                  <option value="inter">Inter (default)</option>
                  <option value="roboto">Roboto</option>
                  <option value="system">System UI</option>
                  <option value="mono">Monospace</option>
                </select>
              </div>

              {/* Background style */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Background</label>
                <div className="flex rounded-lg border border-border bg-bg overflow-hidden mb-2">
                  {(["solid", "gradient", "grid-dots"] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => setPageSettings((s) => ({ ...s, backgroundStyle: style }))}
                      className={`flex-1 py-1.5 text-xs font-medium capitalize transition ${(pageSettings.backgroundStyle ?? "solid") === style ? "bg-accent/15 text-accent" : "text-text-secondary hover:text-text-primary"}`}
                    >{style === "grid-dots" ? "Grid Dots" : style}</button>
                  ))}
                </div>
                {(pageSettings.backgroundStyle ?? "solid") === "solid" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={pageSettings.backgroundColor ?? "#0f1117"}
                      onChange={(e) => setPageSettings((s) => ({ ...s, backgroundColor: e.target.value }))}
                      className="h-8 w-10 rounded cursor-pointer border border-border bg-bg"
                    />
                    <input
                      type="text"
                      placeholder="#0f1117"
                      value={pageSettings.backgroundColor ?? ""}
                      onChange={(e) => setPageSettings((s) => ({ ...s, backgroundColor: e.target.value || undefined }))}
                      className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Branding toggle */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-text-primary">Show "Powered by PulseDock"</p>
                  <p className="text-xs text-text-muted mt-0.5">Displays the PulseDock branding in the page footer.</p>
                </div>
                <button
                  onClick={() => setPageSettings((s) => ({ ...s, showBranding: !(s.showBranding !== false) }))}
                  className={`relative h-5 w-9 rounded-full transition-colors ${(pageSettings.showBranding !== false) ? 'bg-accent' : 'bg-surface-elevated border border-border'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${(pageSettings.showBranding !== false) ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* Password Protection */}
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-semibold text-text-primary mb-2">Password Protection</p>
                {page?.hasPassword ? (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-3">
                    {/* Status row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-text-primary">Password protected</p>
                          <p className="text-[10px] text-text-secondary">Viewers must enter the password to view this page.</p>
                        </div>
                      </div>
                    </div>

                    {/* Change password toggle */}
                    {!confirmRemovePassword && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => { setShowChangePassword((v) => !v); setPasswordInput(""); setPasswordConfirm(""); }}
                          className="text-xs text-accent hover:text-accent/80 transition-colors"
                        >{showChangePassword ? "↑ Cancel" : "Change password"}</button>

                        {showChangePassword && (
                          <div className="space-y-2">
                            <input
                              type="password"
                              placeholder="New password"
                              value={passwordInput}
                              onChange={(e) => setPasswordInput(e.target.value)}
                              className="w-full rounded-lg border border-border bg-bg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                              autoFocus
                            />
                            <input
                              type="password"
                              placeholder="Confirm new password"
                              value={passwordConfirm}
                              onChange={(e) => setPasswordConfirm(e.target.value)}
                              className={`w-full rounded-lg border bg-bg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none ${passwordConfirm && passwordInput !== passwordConfirm ? "border-danger focus:border-danger" : "border-border focus:border-accent"}`}
                            />
                            {passwordConfirm && passwordInput !== passwordConfirm && (
                              <p className="text-[10px] text-danger">Passwords don't match</p>
                            )}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => { setShowChangePassword(false); setPasswordInput(""); setPasswordConfirm(""); }}
                                className="flex-1 rounded-lg border border-border py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                              >Cancel</button>
                              <button
                                type="button"
                                disabled={changingPassword || !passwordInput || passwordInput !== passwordConfirm}
                                onClick={async () => {
                                  setChangingPassword(true);
                                  try {
                                    await api(`/v1/status-pages/${id}`, undefined, { method: "PATCH", body: JSON.stringify({ password: passwordInput }) });
                                    setPasswordInput(""); setPasswordConfirm(""); setShowChangePassword(false);
                                    toastCtx.success("Password updated");
                                  } catch { toastCtx.error("Failed to update password"); }
                                  finally { setChangingPassword(false); }
                                }}
                                className="flex-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                              >{changingPassword ? "Updating…" : "Update"}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Remove confirmation */}
                    {!showChangePassword && (
                      confirmRemovePassword ? (
                        <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 space-y-2">
                          <p className="text-xs font-medium text-danger">Remove password?</p>
                          <p className="text-[10px] text-text-secondary">The page will become publicly accessible to anyone with the link.</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setConfirmRemovePassword(false)} className="flex-1 rounded-lg border border-border py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
                            <button
                              type="button"
                              disabled={changingPassword}
                              onClick={async () => {
                                setChangingPassword(true);
                                try {
                                  await api(`/v1/status-pages/${id}`, undefined, { method: "PATCH", body: JSON.stringify({ removePassword: true }) });
                                  setPage((p) => p ? { ...p, hasPassword: false } : p);
                                  setConfirmRemovePassword(false);
                                  toastCtx.success("Password removed — page is now public");
                                } catch { toastCtx.error("Failed to remove password"); }
                                finally { setChangingPassword(false); }
                              }}
                              className="flex-1 rounded-lg bg-danger py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                            >{changingPassword ? "Removing…" : "Yes, remove"}</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setConfirmRemovePassword(true)} className="text-xs text-danger/70 hover:text-danger transition-colors">
                          Remove password protection
                        </button>
                      )
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-bg/60 px-4 py-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-text-secondary shrink-0" />
                      <p className="text-xs text-text-secondary">No password — page is publicly accessible to anyone.</p>
                    </div>
                    <div className="space-y-2">
                      <input
                        type="password"
                        placeholder="Enter a password to restrict access"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="w-full rounded-lg border border-border bg-bg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                      />
                      <input
                        type="password"
                        placeholder="Confirm password"
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        className={`w-full rounded-lg border bg-bg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none ${passwordConfirm && passwordInput !== passwordConfirm ? "border-danger focus:border-danger" : "border-border focus:border-accent"}`}
                      />
                      {passwordConfirm && passwordInput !== passwordConfirm && (
                        <p className="text-[10px] text-danger">Passwords don't match</p>
                      )}
                      <button
                        type="button"
                        disabled={changingPassword || !passwordInput || passwordInput !== passwordConfirm}
                        onClick={async () => {
                          setChangingPassword(true);
                          try {
                            await api(`/v1/status-pages/${id}`, undefined, { method: "PATCH", body: JSON.stringify({ password: passwordInput }) });
                            setPasswordInput(""); setPasswordConfirm("");
                            setPage((p) => p ? { ...p, hasPassword: true } : p);
                            toastCtx.success("Password set — viewers must enter it to access");
                          } catch { toastCtx.error("Failed to set password"); }
                          finally { setChangingPassword(false); }
                        }}
                        className="w-full rounded-lg bg-accent py-2 text-xs font-semibold text-white disabled:opacity-50 transition-colors hover:bg-accent/90"
                      >{changingPassword ? "Setting…" : "Set password"}</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Webhook Notifications */}
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-semibold text-text-primary mb-1">Webhook Notifications</p>
                <p className="text-[11px] text-text-muted mb-3">Receive a POST request when the overall page status changes between <span className="text-green-400 font-medium">operational</span>, <span className="text-yellow-400 font-medium">degraded</span>, and <span className="text-red-400 font-medium">outage</span>.</p>
                <div className="rounded-xl border border-border bg-bg/60 px-4 py-3 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">Webhook URL</label>
                    <input
                      type="url"
                      placeholder="https://example.com/webhook/status"
                      value={pageSettings.notifyWebhookUrl ?? ""}
                      onChange={(e) => setPageSettings((s) => ({ ...s, notifyWebhookUrl: e.target.value || undefined }))}
                      className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                    />
                    <p className="text-[10px] text-text-secondary mt-1">Leave empty to disable. Save the page to apply changes.</p>
                  </div>
                  {pageSettings.notifyWebhookUrl && (
                    <div className="rounded-lg bg-surface-elevated/50 border border-border/50 p-2.5">
                      <p className="text-[10px] font-semibold text-text-secondary mb-1.5">Example payload</p>
                      <pre className="text-[10px] text-text-muted font-mono whitespace-pre-wrap leading-relaxed">{JSON.stringify({
                        event: "status_page.status_changed",
                        slug: page?.slug ?? "my-page",
                        status: "degraded",
                        previousStatus: "operational",
                        timestamp: new Date().toISOString(),
                        affectedMonitors: [{ id: "abc123", name: "API" }],
                      }, null, 2)}</pre>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">Slack Webhook URL</label>
                    <input
                      type="url"
                      placeholder="https://hooks.slack.com/services/..."
                      value={pageSettings.slackWebhookUrl ?? ""}
                      onChange={(e) => setPageSettings((s) => ({ ...s, slackWebhookUrl: e.target.value || undefined }))}
                      className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                    />
                    <p className="text-[10px] text-text-secondary mt-1">Optional. Posts a Slack message when the page status changes.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">Discord Webhook URL</label>
                    <input
                      type="url"
                      placeholder="https://discord.com/api/webhooks/..."
                      value={pageSettings.discordWebhookUrl ?? ""}
                      onChange={(e) => setPageSettings((s) => ({ ...s, discordWebhookUrl: e.target.value || undefined }))}
                      className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                    />
                    <p className="text-[10px] text-text-secondary mt-1">Optional. Posts a Discord embed when the page status changes.</p>
                  </div>
                </div>
              </div>

              {/* SEO Section */}
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-semibold text-text-primary mb-3">SEO &amp; Social Sharing</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">Meta Title</label>
                    <input
                      type="text"
                      placeholder="My Company Status"
                      maxLength={60}
                      value={pageSettings.metaTitle ?? ""}
                      onChange={(e) => setPageSettings((s) => ({ ...s, metaTitle: e.target.value || undefined }))}
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] text-text-muted">Overrides the page title in search results and browser tab (max 60 chars).</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">Meta Description</label>
                    <textarea
                      rows={2}
                      placeholder="Live status and uptime for all our services."
                      maxLength={160}
                      value={pageSettings.metaDescription ?? ""}
                      onChange={(e) => setPageSettings((s) => ({ ...s, metaDescription: e.target.value || undefined }))}
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] text-text-muted">Shown in search engine snippets (max 160 chars).</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">OG Image URL</label>
                    <input
                      type="url"
                      placeholder="https://example.com/og-image.png"
                      value={pageSettings.ogImageUrl ?? ""}
                      onChange={(e) => setPageSettings((s) => ({ ...s, ogImageUrl: e.target.value || undefined }))}
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] text-text-muted">Image shown when sharing on Twitter, Discord, Slack, etc. (1200×630px recommended).</p>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-4 py-3">
                    <div>
                      <p className="text-xs font-medium text-text-primary">Allow search engines to index</p>
                      <p className="text-xs text-text-muted mt-0.5">Adds robots meta tag (index, follow). Disable for private pages.</p>
                    </div>
                    <button
                      onClick={() => setPageSettings((s) => ({ ...s, robotsIndex: !(s.robotsIndex !== false) }))}
                      className={`relative h-5 w-9 rounded-full transition-colors ${(pageSettings.robotsIndex !== false) ? 'bg-accent' : 'bg-surface-elevated border border-border'}`}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${(pageSettings.robotsIndex !== false) ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4 shrink-0">
              <button onClick={() => setShowPageSettings(false)} className="rounded-lg border border-border bg-bg px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary transition">
                Cancel
              </button>
              <button
                onClick={() => { setShowPageSettings(false); handleSave(); }}
                className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:bg-accent/90"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Gallery Modal */}
      {showTemplateGallery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50 mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Template Gallery</h2>
                <p className="text-xs text-text-muted mt-0.5">Start from a preset layout. This will replace your current canvas.</p>
              </div>
              <button
                onClick={() => setShowTemplateGallery(false)}
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 grid grid-cols-2 gap-4">
              {STATUS_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => applyTemplate(tmpl)}
                  className="text-left rounded-xl border border-border bg-bg/60 p-4 hover:border-accent/50 hover:bg-accent/5 transition-all group"
                >
                  <div className="text-2xl mb-2">{tmpl.preview}</div>
                  <p className="text-sm font-semibold text-text-primary group-hover:text-accent transition">{tmpl.name}</p>
                  <p className="text-xs text-text-muted mt-1">{tmpl.description}</p>
                  <p className="text-xs text-text-secondary/60 mt-2">{tmpl.widgets.length} widgets</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Version History Modal */}
      {showVersionHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50 mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Version History</h2>
                <p className="text-xs text-text-muted mt-0.5">Last 10 saves stored on server. One-click restore.</p>
              </div>
              <button onClick={() => setShowVersionHistory(false)} className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {apiHistoryLoading ? (
                <div className="py-8 text-center text-sm text-text-secondary">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent mx-auto mb-2" />
                  <p>Loading history…</p>
                </div>
              ) : apiHistory.length === 0 ? (
                <div className="py-8 text-center text-sm text-text-secondary">
                  <History className="h-8 w-8 mx-auto mb-2 text-text-muted/40" />
                  <p>No server saves yet.</p>
                  <p className="text-xs text-text-muted mt-1">Save your page to start tracking history.</p>
                </div>
              ) : apiHistory.map((entry, i) => {
                const d = new Date(entry.savedAt);
                const dateLabel = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                const widgetCount = Array.isArray(entry.layout?.widgets) ? entry.layout.widgets.length : 0;
                const isRestoring = restoringHistoryId === entry.id;
                return (
                  <div key={entry.id} className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-4 py-3 group">
                    <div>
                      <p className="text-xs font-medium text-text-primary flex items-center gap-2">
                        {i === 0 && <span className="text-[10px] rounded-full bg-accent/15 text-accent px-1.5 py-0.5 font-semibold">Latest</span>}
                        {entry.label ? <span className="text-[10px] text-text-muted italic">{entry.label}</span> : null}
                        {dateLabel}
                      </p>
                      <p className="text-[10px] text-text-muted mt-0.5">{widgetCount} widget{widgetCount !== 1 ? "s" : ""}</p>
                    </div>
                    <button
                      onClick={() => restoreApiVersion(entry.id)}
                      disabled={isRestoring}
                      className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-accent/50 hover:text-accent transition opacity-0 group-hover:opacity-100 disabled:opacity-50"
                    >
                      {isRestoring ? "Restoring…" : "Restore"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
}
