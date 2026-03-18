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

interface PageLayout {
  widgets: Widget[];
}

interface StatusPage {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  hasPassword: boolean;
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
  { type: "divider", label: "Divider", description: "Visual separator or empty space", icon: Minus, category: "Content", defaultW: 12, defaultH: 1 },
];

const CATEGORIES = [...new Set(WIDGET_PALETTE.map((w) => w.category))];

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

function PaletteWidget({ item }: { item: WidgetPaletteItem }) {
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
      className={`w-full cursor-grab rounded-xl border border-border bg-bg p-3 text-left transition hover:border-accent/50 hover:bg-accent/5 active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="text-xs font-semibold text-text-primary">{item.label}</span>
      </div>
      <p className="text-[10px] leading-tight text-text-secondary">{item.description}</p>
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
    default:
      return <span className="text-[10px] text-text-secondary/40 italic">{WIDGET_PALETTE.find(p => p.type === type)?.label ?? type}</span>;
  }
}

interface CanvasWidgetProps {
  widget: Widget;
  isSelected: boolean;
  colWidth: number;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onResize: (id: string, size: { w: number; h: number }) => void;
}

function CanvasWidget({ widget, isSelected, colWidth, onSelect, onDelete, onResize }: CanvasWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `canvas-${widget.id}`,
    data: { source: "canvas", widget },
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
      onClick={(e) => { e.stopPropagation(); onSelect(widget.id); }}
      className={`group relative flex flex-col rounded-xl border-2 bg-surface transition-colors ${
        isSelected ? "border-accent shadow-lg shadow-accent/10" : "border-border hover:border-accent/40"
      }`}
    >
      {/* Header bar with drag handle + title */}
      <div className="flex items-center gap-1 border-b border-border/60 px-3 py-2">
        <div
          {...listeners}
          {...attributes}
          className="cursor-grab p-0.5 text-text-secondary/40 hover:text-text-secondary active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <Icon className="h-3 w-3 text-accent/70" />
        <span className="flex-1 text-xs font-medium text-text-secondary">
          {paletteItem?.label ?? widget.type}
        </span>
        {widget.config.label && (
          <span className="truncate max-w-[80px] text-xs text-text-secondary/60">
            {widget.config.label as string}
          </span>
        )}
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
      {/* Resize handle — bottom-right corner */}
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
    </div>
  );
}

// ── Canvas drop zone ─────────────────────────────────────────────────────

interface CanvasProps {
  widgets: Widget[];
  selectedId: string | null;
  isDraggingOverCanvas: boolean;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onResize: (id: string, size: { w: number; h: number }) => void;
}

function CanvasDropZone({ widgets, selectedId, isDraggingOverCanvas, canvasRef, onSelect, onDelete, onResize }: CanvasProps) {
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

  return (
    <div
      ref={combinedRef}
      className={`relative w-full transition-colors ${
        isOver ? "bg-accent/5" : ""
      }`}
      style={{ minHeight }}
      onClick={() => onSelect(null)}
    >
      {/* Grid guide lines when dragging */}
      {isDraggingOverCanvas && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `
              repeating-linear-gradient(to right, rgba(var(--color-accent-rgb, 99 102 241) / 0.08) 0px, rgba(var(--color-accent-rgb, 99 102 241) / 0.08) 1px, transparent 1px, transparent calc(100% / ${COL_COUNT})),
              repeating-linear-gradient(to bottom, rgba(var(--color-accent-rgb, 99 102 241) / 0.08) 0px, rgba(var(--color-accent-rgb, 99 102 241) / 0.08) 1px, transparent 1px, transparent ${ROW_H}px)
            `,
          }}
        />
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

      {/* Render widgets */}
      {widgets.map((widget) => {
        const colWidth = canvasRef.current
          ? canvasRef.current.getBoundingClientRect().width / COL_COUNT
          : 0;
        return (
          <CanvasWidget
            key={widget.id}
            widget={widget}
            isSelected={selectedId === widget.id}
            colWidth={colWidth}
            onSelect={onSelect}
            onDelete={onDelete}
            onResize={onResize}
          />
        );
      })}
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
}

function ConfigPanel({ widget, monitors, tags, folders, onChange, onResize }: ConfigPanelProps) {
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
  const supportsMonitorScope = !["divider", "text-block", "scheduled-maintenance", "incident-history", "check-history-feed"].includes(w.type);
  const supportsFilters = !["divider", "text-block", "scheduled-maintenance", "incident-history", "check-history-feed"].includes(w.type);
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
    </div>
  );
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
  const [activeCategory, setActiveCategory] = useState("Status");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);

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
      setWidgets(data.layout?.widgets ?? []);
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

  const handleSave = useCallback(async () => {
    if (!page) return;
    setSaving(true);
    try {
      await api(`/v1/status-pages/${id}`, undefined, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: { widgets } }),
      });
      toastCtx.success("Saved");
    } catch {
      toastCtx.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }, [page, id, widgets, toastCtx]);

  // Auto-save 2 seconds after widget changes (skip initial load)
  const initialLoad = useRef(true);
  useEffect(() => {
    if (initialLoad.current) { initialLoad.current = false; return; }
    if (!page || widgets.length === 0) return;
    const timer = setTimeout(() => { handleSave(); }, 2000);
    return () => clearTimeout(timer);
  }, [widgets, page, handleSave]);

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

  function deleteWidget(widgetId: string) {
    setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
    if (selectedId === widgetId) setSelectedId(null);
  }

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

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, delta, over } = event;
    const activeId = active.id as string;

    if (activeId.startsWith("palette-")) {
      // Drop from palette onto canvas
      if (over?.id === "canvas") {
        const type = activeId.replace("palette-", "");
        addWidget(type);
      }
    } else if (activeId.startsWith("canvas-")) {
      // Move existing widget
      const widgetId = activeId.replace("canvas-", "");
      if (!canvasRef.current) return;
      const containerWidth = canvasRef.current.getBoundingClientRect().width;
      const colWidth = containerWidth / COL_COUNT;
      const deltaCol = Math.round(delta.x / colWidth);
      const deltaRow = Math.round(delta.y / ROW_H);

      if (deltaCol === 0 && deltaRow === 0) return;

      setWidgets((prev) =>
        prev.map((w) => {
          if (w.id !== widgetId) return w;
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
  const isDraggingOverCanvas = !!activeDragId;

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
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save"}
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
            {/* Category tabs */}
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
            {/* Widget list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {WIDGET_PALETTE.filter((w) => w.category === activeCategory).map((widget) => (
                <PaletteWidget key={widget.type} item={widget} />
              ))}
            </div>
          </aside>

          {/* Canvas */}
          <main className="flex-1 overflow-auto bg-bg/50 p-6">
            <CanvasDropZone
              widgets={widgets}
              selectedId={selectedId}
              isDraggingOverCanvas={isDraggingOverCanvas}
              canvasRef={canvasRef}
              onSelect={setSelectedId}
              onDelete={deleteWidget}
              onResize={resizeWidgetById}
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
    </DndContext>
  );
}
